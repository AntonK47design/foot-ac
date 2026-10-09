import {
  CanvasTexture,
  ConeGeometry,
  Vector3,
  CapsuleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const MAX_HUMANOIDS = 72;
const HAIR_STYLES = 6; // 0..4 kids, 5 = coach cap
const FACE_COLS = 4;
const FACE_ROWS = 2;

export type Anim = 'idle' | 'walk' | 'run' | 'sit' | 'kick' | 'celebrate' | 'carry';

/** What the view wants to draw for one character this frame. */
export interface HumanoidSpec {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  skin: number;
  hairStyle: number;
  hairColor: number;
  face: number;
  shirt: number;
  shorts: number;
  socks: number;
  shoes: number;
  anim: Anim;
  /** Walk cycle phase (radians), advanced by distance moved. */
  phase: number;
  /** 0..1 progress for kick / celebrate. */
  t: number;
  /** Seconds, for idle breathing. */
  time: number;
  /** Arms forward holding a stack. */
  carrying: boolean;
}

/** Bone-like Object3D rig used only to compute part matrices (no rendering). */
class Rig {
  readonly root = new Object3D();
  readonly hips = new Object3D();
  readonly torso = new Object3D();
  readonly head = new Object3D();
  readonly legL = new Object3D();
  readonly legR = new Object3D();
  readonly legMeshL = new Object3D();
  readonly legMeshR = new Object3D();
  readonly shoeL = new Object3D();
  readonly shoeR = new Object3D();
  readonly armL = new Object3D();
  readonly armR = new Object3D();
  readonly armMeshL = new Object3D();
  readonly armMeshR = new Object3D();
  readonly shorts = new Object3D();
  readonly torsoMesh = new Object3D();
  readonly shadow = new Object3D();

  constructor() {
    const { root, hips, torso, head } = this;
    root.add(hips, this.legL, this.legR, this.shadow);
    hips.position.set(0, 0.36, 0);
    hips.add(torso, this.shorts);
    this.shorts.position.set(0, 0.03, 0);
    torso.add(this.torsoMesh, head, this.armL, this.armR);
    this.torsoMesh.position.set(0, 0.2, 0);
    head.position.set(0, 0.6, 0);
    this.legL.position.set(-0.085, 0.34, 0);
    this.legR.position.set(0.085, 0.34, 0);
    this.legL.add(this.legMeshL, this.shoeL);
    this.legR.add(this.legMeshR, this.shoeR);
    this.legMeshL.position.set(0, -0.15, 0);
    this.legMeshR.position.set(0, -0.15, 0);
    this.shoeL.position.set(0, -0.31, -0.035);
    this.shoeR.position.set(0, -0.31, -0.035);
    this.armL.position.set(-0.215, 0.32, 0);
    this.armR.position.set(0.215, 0.32, 0);
    this.armL.add(this.armMeshL);
    this.armR.add(this.armMeshR);
    this.armMeshL.position.set(0, -0.11, 0);
    this.armMeshR.position.set(0, -0.11, 0);
    this.shadow.position.set(0, 0.02, 0);
    this.shadow.rotation.x = -Math.PI / 2;
  }

  pose(s: HumanoidSpec): void {
    const r = this.root;
    r.position.set(s.x, s.y, s.z);
    r.rotation.set(0, s.yaw, 0);
    r.scale.setScalar(s.scale);
    let legSwing = 0;
    let armSwing = 0;
    let bob = 0;
    let lean = 0;
    let armRaise = 0;
    let hipsY = 0.36;
    let legL = 0;
    let legR = 0;
    let armFwd = 0;
    switch (s.anim) {
      case 'idle':
        bob = Math.sin(s.time * 2.4) * 0.012;
        armSwing = Math.sin(s.time * 2.4) * 0.05;
        break;
      case 'walk':
      case 'run':
      case 'carry': {
        const amp = s.anim === 'run' ? 0.9 : 0.65;
        legSwing = Math.sin(s.phase) * amp;
        armSwing = -Math.sin(s.phase) * amp * 0.9;
        bob = Math.abs(Math.cos(s.phase)) * (s.anim === 'run' ? 0.07 : 0.045);
        lean = s.anim === 'run' ? 0.18 : 0.08;
        break;
      }
      case 'sit':
        hipsY = 0.47;
        legL = legR = -1.45;
        armFwd = -0.5;
        bob = Math.sin(s.time * 1.8) * 0.008;
        break;
      case 'kick': {
        // wind up (0..0.45) then strike (0.45..0.6) then recover
        const t = s.t;
        let k = 0;
        if (t < 0.45) k = (t / 0.45) * 0.9;
        else if (t < 0.6) k = 0.9 - ((t - 0.45) / 0.15) * 2.3;
        else k = -1.4 + ((t - 0.6) / 0.4) * 1.4;
        legR = k;
        legL = -k * 0.15;
        armSwing = -k * 0.5;
        lean = -k * 0.08;
        break;
      }
      case 'celebrate': {
        const j = Math.abs(Math.sin(s.time * 9));
        bob = j * 0.22;
        armRaise = 2.6;
        legSwing = j * 0.25;
        break;
      }
    }
    if (s.carrying) armFwd = -1.25;
    this.hips.position.y = hipsY + bob;
    this.hips.rotation.x = -lean;
    this.legL.position.y = 0.34 + (s.anim === 'sit' ? hipsY - 0.36 : bob);
    this.legR.position.y = this.legL.position.y;
    this.legL.rotation.x = legL + legSwing;
    this.legR.rotation.x = legR - legSwing;
    this.armL.rotation.set(armFwd || armSwing, 0, -armRaise * 0.5 - 0.08);
    this.armR.rotation.set(armFwd || -armSwing, 0, armRaise * 0.5 + 0.08);
    if (s.anim === 'celebrate') {
      this.armL.rotation.z = -armRaise;
      this.armR.rotation.z = armRaise;
      this.armL.rotation.x = 0;
      this.armR.rotation.x = 0;
    }
    this.head.rotation.x = lean * 0.5;
    this.shadow.position.y = 0.02 - (s.anim === 'sit' ? 0 : 0);
    r.updateMatrixWorld(true);
    // keep the blob shadow on the ground and unscaled by bob
    this.shadow.matrixWorld.makeRotationX(-Math.PI / 2).premultiply(tmpM.makeTranslation(s.x, 0.025, s.z));
    this.shadow.matrixWorld.scale(tmpScale.set(s.scale * 0.95, s.scale * 0.95, 1));
  }
}

const tmpM = new Matrix4();
const tmpScale = new Vector3();

function makeFaceAtlas(): CanvasTexture {
  const cw = 128;
  const c = document.createElement('canvas');
  c.width = cw * FACE_COLS;
  c.height = cw * FACE_ROWS;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < FACE_COLS * FACE_ROWS; i++) {
    const ox = (i % FACE_COLS) * cw;
    const oy = Math.floor(i / FACE_COLS) * cw;
    ctx.save();
    ctx.translate(ox, oy);
    const eyeY = 52 + (i % 3) * 2;
    const eyeDX = 22 + (i % 2) * 3;
    // eyes
    ctx.fillStyle = '#1b1f2a';
    const tall = i === 3 || i === 6 ? 17 : 14;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      if (i === 5 && sx === 1) {
        // wink
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#1b1f2a';
        ctx.arc(64 + sx * eyeDX, eyeY + 4, 9, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        continue;
      }
      ctx.ellipse(64 + sx * eyeDX, eyeY, 9, tall, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(64 + sx * eyeDX + 3, eyeY - 5, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1f2a';
    }
    // brows
    if (i % 4 === 1 || i === 6) {
      ctx.strokeStyle = '#3a2a20';
      ctx.lineWidth = 5;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(64 + sx * (eyeDX - 9), eyeY - 22);
        ctx.lineTo(64 + sx * (eyeDX + 9), eyeY - 24 + (i === 6 ? 4 : 0));
        ctx.stroke();
      }
    }
    // cheeks
    ctx.fillStyle = 'rgba(255,110,110,0.35)';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(64 + sx * 38, eyeY + 20, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // mouth
    ctx.strokeStyle = '#7a2a2a';
    ctx.fillStyle = '#7a2a2a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    const my = eyeY + 30;
    ctx.beginPath();
    switch (i % 4) {
      case 0:
        ctx.arc(64, my - 6, 12, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 1:
        ctx.ellipse(64, my, 10, 8, 0, 0, Math.PI);
        ctx.fill();
        break;
      case 2:
        ctx.arc(64, my - 10, 16, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
        break;
      case 3:
        ctx.ellipse(64, my - 2, 6, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function makeShadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(20,40,20,0.42)');
  g.addColorStop(1, 'rgba(20,40,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function hairGeometry(style: number): BufferGeometry {
  const cap = new SphereGeometry(0.275, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
  cap.translate(0, 0.02, 0.015);
  const parts: BufferGeometry[] = [cap];
  switch (style) {
    case 1: {
      for (let i = 0; i < 5; i++) {
        const c = new ConeGeometry(0.09, 0.2, 5);
        const a = -0.8 + i * 0.4;
        c.rotateZ(a * 0.6);
        c.translate(Math.sin(a) * 0.14, 0.27, 0.02 + Math.cos(i) * 0.05);
        parts.push(c);
      }
      break;
    }
    case 2: {
      const p = new SphereGeometry(0.13, 10, 8);
      p.scale(1, 1.25, 1);
      p.translate(0, 0.02, 0.3);
      parts.push(p);
      break;
    }
    case 3: {
      const back = new RoundedBoxGeometry(0.5, 0.42, 0.18, 2, 0.08);
      back.translate(0, -0.12, 0.17);
      parts.push(back);
      break;
    }
    case 4: {
      const puff = new SphereGeometry(0.33, 12, 9);
      puff.scale(1, 0.85, 1);
      puff.translate(0, 0.08, 0.04);
      parts.length = 0;
      parts.push(puff);
      break;
    }
    case 5: {
      // coach cap with brim
      const brim = new RoundedBoxGeometry(0.34, 0.035, 0.24, 1, 0.015);
      brim.translate(0, 0.07, -0.3);
      parts.push(brim);
      break;
    }
  }
  const norm = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  });
  return mergeGeometries(norm, false);
}

/**
 * Renders every character with one InstancedMesh per body part (constant draw calls).
 * Call begin(), add(spec) per character, end() once per frame.
 */
export class HumanoidRenderer {
  private readonly rigs: Rig[] = [];
  private readonly meshes: InstancedMesh[] = [];
  private readonly legs: InstancedMesh;
  private readonly shoes: InstancedMesh;
  private readonly arms: InstancedMesh;
  private readonly torso: InstancedMesh;
  private readonly shorts: InstancedMesh;
  private readonly heads: InstancedMesh;
  private readonly faces: InstancedMesh;
  private readonly hair: InstancedMesh[] = [];
  private readonly shadows: InstancedMesh;
  private readonly faceOff: InstancedBufferAttribute;
  private n = 0;
  private readonly hairN = new Array<number>(HAIR_STYLES).fill(0);
  private readonly color = new Color();

  constructor(scene: Scene, mat: MeshLambertMaterial) {
    const mk = (geo: BufferGeometry, m: Material, count: number): InstancedMesh => {
      const im = new InstancedMesh(geo, m, count);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      // ensure the colour buffer exists
      im.setColorAt(0, this.color.set(0xffffff));
      im.castShadow = true;
      scene.add(im);
      this.meshes.push(im);
      return im;
    };
    const limb = new CapsuleGeometry(0.068, 0.2, 3, 8);
    this.legs = mk(limb, mat, MAX_HUMANOIDS * 2);
    this.shoes = mk(new RoundedBoxGeometry(0.14, 0.09, 0.22, 2, 0.04), mat, MAX_HUMANOIDS * 2);
    this.arms = mk(new CapsuleGeometry(0.055, 0.15, 3, 8), mat, MAX_HUMANOIDS * 2);
    this.torso = mk(new RoundedBoxGeometry(0.36, 0.34, 0.24, 3, 0.1), mat, MAX_HUMANOIDS);
    this.shorts = mk(new RoundedBoxGeometry(0.32, 0.16, 0.22, 2, 0.06), mat, MAX_HUMANOIDS);
    this.heads = mk(new SphereGeometry(0.26, 16, 12), mat, MAX_HUMANOIDS);
    for (let i = 0; i < HAIR_STYLES; i++) this.hair.push(mk(hairGeometry(i), mat, MAX_HUMANOIDS));
    // face patch: a slice of sphere in front of the head, UVs span the patch
    const faceGeo = new SphereGeometry(0.262, 10, 8, Math.PI * 1.5 - 0.62, 1.24, Math.PI * 0.5 - 0.5, 0.95);
    const faceMat = new MeshLambertMaterial({ map: makeFaceAtlas(), transparent: true, alphaTest: 0.4, depthWrite: false });
    this.faceOff = new InstancedBufferAttribute(new Float32Array(MAX_HUMANOIDS * 2), 2);
    this.faceOff.setUsage(DynamicDrawUsage);
    faceGeo.setAttribute('faceOff', this.faceOff);
    faceMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 faceOff;')
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * vec2(${(1 / FACE_COLS).toFixed(4)}, ${(1 / FACE_ROWS).toFixed(4)}) + faceOff;\n#endif`,
        );
    };
    this.faces = mk(faceGeo, faceMat, MAX_HUMANOIDS);
    this.faces.castShadow = false;
    const shadowGeo = new PlaneGeometry(0.9, 0.9);
    const shadowMat = new MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false });
    this.shadows = mk(shadowGeo, shadowMat, MAX_HUMANOIDS);
    this.shadows.castShadow = false;
    this.shadows.renderOrder = -1;
  }

  begin(): void {
    this.n = 0;
    this.hairN.fill(0);
  }

  add(s: HumanoidSpec): void {
    if (this.n >= MAX_HUMANOIDS) return;
    const i = this.n++;
    let rig = this.rigs[i];
    if (!rig) {
      rig = new Rig();
      this.rigs[i] = rig;
    }
    rig.pose(s);
    const c = this.color;
    this.legs.setMatrixAt(i * 2, rig.legMeshL.matrixWorld);
    this.legs.setMatrixAt(i * 2 + 1, rig.legMeshR.matrixWorld);
    this.legs.setColorAt(i * 2, c.set(s.socks));
    this.legs.setColorAt(i * 2 + 1, c);
    this.shoes.setMatrixAt(i * 2, rig.shoeL.matrixWorld);
    this.shoes.setMatrixAt(i * 2 + 1, rig.shoeR.matrixWorld);
    this.shoes.setColorAt(i * 2, c.set(s.shoes));
    this.shoes.setColorAt(i * 2 + 1, c);
    this.arms.setMatrixAt(i * 2, rig.armMeshL.matrixWorld);
    this.arms.setMatrixAt(i * 2 + 1, rig.armMeshR.matrixWorld);
    this.arms.setColorAt(i * 2, c.set(s.skin));
    this.arms.setColorAt(i * 2 + 1, c);
    this.torso.setMatrixAt(i, rig.torsoMesh.matrixWorld);
    this.torso.setColorAt(i, c.set(s.shirt));
    this.shorts.setMatrixAt(i, rig.shorts.matrixWorld);
    this.shorts.setColorAt(i, c.set(s.shorts));
    this.heads.setMatrixAt(i, rig.head.matrixWorld);
    this.heads.setColorAt(i, c.set(s.skin));
    this.faces.setMatrixAt(i, rig.head.matrixWorld);
    this.faces.setColorAt(i, c.set(0xffffff));
    const f = ((s.face % (FACE_COLS * FACE_ROWS)) + FACE_COLS * FACE_ROWS) % (FACE_COLS * FACE_ROWS);
    this.faceOff.setXY(i, (f % FACE_COLS) / FACE_COLS, 1 - (Math.floor(f / FACE_COLS) + 1) / FACE_ROWS);
    const hs = Math.max(0, Math.min(HAIR_STYLES - 1, s.hairStyle));
    const hm = this.hair[hs] as InstancedMesh;
    const hi = this.hairN[hs] as number;
    this.hairN[hs] = hi + 1;
    hm.setMatrixAt(hi, rig.head.matrixWorld);
    hm.setColorAt(hi, c.set(s.hairColor));
    this.shadows.setMatrixAt(i, rig.shadow.matrixWorld);
  }

  end(): void {
    const n = this.n;
    const set = (im: InstancedMesh, count: number): void => {
      im.count = count;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    };
    set(this.legs, n * 2);
    set(this.shoes, n * 2);
    set(this.arms, n * 2);
    set(this.torso, n);
    set(this.shorts, n);
    set(this.heads, n);
    set(this.faces, n);
    set(this.shadows, n);
    this.faceOff.needsUpdate = true;
    for (let s = 0; s < HAIR_STYLES; s++) set(this.hair[s] as InstancedMesh, this.hairN[s] as number);
  }

  setShadows(on: boolean): void {
    for (const m of this.meshes) if (m !== this.faces && m !== this.shadows) m.castShadow = on;
  }
}
