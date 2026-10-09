import {
  AnimationAction,
  AnimationMixer,
  Color,
  LoopOnce,
  LoopRepeat,
  MeshLambertMaterial,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { Assets, CharacterKey } from './assets';

/** Animation states mapped onto the shared Kenney clips. */
export type CharAnim = 'idle' | 'walk' | 'run' | 'sit' | 'carry' | 'carryIdle' | 'cheer' | 'kick' | 'pickup' | 'interact';
const CLIP: Record<CharAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  sit: 'sit',
  carry: 'holding-both',
  carryIdle: 'holding-both',
  cheer: 'emote-yes',
  kick: 'attack-kick-right',
  pickup: 'pick-up',
  interact: 'interact-right',
};
const ONE_SHOT: Partial<Record<CharAnim, boolean>> = { cheer: true, kick: true, pickup: true, interact: true };

export interface Kit {
  shirt: number;
  shorts: number;
  socks: number;
  trim: number;
}

/** Kit cells (must match tools/kit-remap.ts). */
const CELLS = { shirt: [4, 1], shorts: [6, 1], socks: [8, 1], trim: [10, 1] } as const;

const materialCache = new Map<string, MeshLambertMaterial>();

/**
 * Lambert material with the palette texture, a kit tint for the remapped cells and a subtle rim light.
 * Cached per kit so characters with the same kit share one material (fewer program/uniform switches).
 */
function kitMaterial(map: Texture, kit: Kit): MeshLambertMaterial {
  const key = `${map.uuid}:${kit.shirt}:${kit.shorts}:${kit.socks}:${kit.trim}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const m = new MeshLambertMaterial({ map });
  const uniforms = {
    uShirt: { value: new Color(kit.shirt) },
    uShorts: { value: new Color(kit.shorts) },
    uSocks: { value: new Color(kit.socks) },
    uTrim: { value: new Color(kit.trim) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const cell = (c: readonly [number, number]): string => `vec4(${c[0] / 16}, ${c[1] / 4}, ${(c[0] + 1) / 16}, ${(c[1] + 1) / 4})`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uShirt; uniform vec3 uShorts; uniform vec3 uSocks; uniform vec3 uTrim;
bool inCell(vec2 uv, vec4 r) { return uv.x >= r.x && uv.x < r.z && uv.y >= r.y && uv.y < r.w; }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#ifdef USE_MAP
  vec2 kuv = vMapUv;
  if (inCell(kuv, ${cell(CELLS.shirt)})) diffuseColor.rgb = uShirt;
  else if (inCell(kuv, ${cell(CELLS.shorts)})) diffuseColor.rgb = uShorts;
  else if (inCell(kuv, ${cell(CELLS.socks)})) diffuseColor.rgb = uSocks;
  else if (inCell(kuv, ${cell(CELLS.trim)})) diffuseColor.rgb = uTrim;
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 vdir = normalize(vViewPosition);
  float rim = pow(1.0 - clamp(dot(normalize(vNormal), vdir), 0.0, 1.0), 3.0);
  outgoingLight += vec3(1.0, 0.95, 0.85) * rim * 0.28;
}
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => 'wk-kit';
  materialCache.set(key, m);
  return m;
}

/** One animated character instance. */
export class Character {
  readonly root: Object3D;
  readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  state: CharAnim | null = null;
  private oneShotUntil = 0;
  private time = 0;
  /** Accumulated time for throttled animation updates (far / off-screen). */
  private pending = 0;
  private carrying = false;
  private hold: AnimationAction | null = null;

  constructor(assets: Assets, key: CharacterKey, kit: Kit | null, scale = 1) {
    const a = assets.characters.get(key);
    if (!a) throw new Error(`missing character ${key}`);
    this.root = skeletonClone(a.scene);
    this.root.scale.setScalar(scale);
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const src = mesh.material as MeshLambertMaterial;
      if (src.map) mesh.material = kitMaterial(src.map, kit ?? { shirt: 0xffffff, shorts: 0xffffff, socks: 0xffffff, trim: 0xffffff });
    });
    this.mixer = new AnimationMixer(this.root);
    for (const [name, clip] of assets.clips) this.actions.set(name, this.mixer.clipAction(clip));
  }

  setKit(assets: Assets, kit: Kit): void {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material as MeshLambertMaterial;
      if (m.map) mesh.material = kitMaterial(m.map, kit);
    });
    void assets;
  }

  /** Arms hold a stack in front while the legs keep walking (layered clips). */
  setCarry(on: boolean): void {
    if (on === this.carrying) return;
    this.carrying = on;
    if (!this.hold) this.hold = this.actions.get('hold:arms') ?? null;
    if (this.hold) {
      if (on) this.hold.reset().fadeIn(0.15).play();
      else this.hold.fadeOut(0.15);
    }
    const s = this.state;
    this.state = null;
    if (s) this.play(s, 0.15);
  }

  /** Switches animation with a short cross-fade. One-shots return to `after`. */
  play(anim: CharAnim, fade = 0.18, speed = 1): void {
    if (this.time < this.oneShotUntil && !ONE_SHOT[anim]) return;
    if (this.state === anim && !ONE_SHOT[anim]) {
      if (this.current) this.current.timeScale = speed;
      return;
    }
    const base = CLIP[anim];
    const layered = this.carrying && (anim === 'idle' || anim === 'walk' || anim === 'run');
    const next = this.actions.get(layered ? base + ':legs' : base);
    if (!next) return;
    next.reset();
    next.enabled = true;
    next.timeScale = speed;
    if (ONE_SHOT[anim]) {
      next.setLoop(LoopOnce, 1);
      next.clampWhenFinished = true;
      this.oneShotUntil = this.time + next.getClip().duration / Math.max(0.01, speed) - fade;
    } else next.setLoop(LoopRepeat, Infinity);
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
    this.state = anim;
  }

  /** Seek a looping clip (for deterministic showcase / capture poses). */
  seek(t: number): void {
    if (this.current) this.current.time = t % this.current.getClip().duration;
    this.mixer.update(0);
  }

  /** Update; `hz` throttles far/off-screen characters (15–30 Hz). */
  update(dt: number, hz = 60): void {
    this.time += dt;
    this.pending += dt;
    if (this.pending < 1 / hz - 1e-4) return;
    this.mixer.update(this.pending);
    this.pending = 0;
  }

  get busy(): boolean {
    return this.time < this.oneShotUntil;
  }
}

export const KITS = {
  academy: { shirt: 0x2f6bff, shorts: 0xffffff, socks: 0xffd23f, trim: 0xffd23f } as Kit,
  coach: { shirt: 0x1f2f5c, shorts: 0x1f2f5c, socks: 0x1f2f5c, trim: 0xffd23f } as Kit,
  staff: { shirt: 0xff8a1f, shorts: 0x2a3550, socks: 0x2a3550, trim: 0xffffff } as Kit,
};

const CASUAL = [0xff6b6b, 0x4ecdc4, 0xffa94d, 0x845ef7, 0x51cf66, 0xf783ac, 0x339af0, 0xfcc419, 0x9aa5b1];
const CASUAL_BOTTOM = [0x3b4a6b, 0x6b4f3b, 0x2f3542, 0x5c6f8c, 0x8a6d5a];

export function casualKit(seed: number): Kit {
  return {
    shirt: CASUAL[seed % CASUAL.length] as number,
    shorts: CASUAL_BOTTOM[(seed * 7) % CASUAL_BOTTOM.length] as number,
    socks: 0xf2f2f2,
    trim: 0xffffff,
  };
}

