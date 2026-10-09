import { AnimationClip, Group, Mesh, Object3D, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface CharacterAsset {
  scene: Group;
}

export interface Assets {
  props: Map<string, Object3D>;
  characters: Map<string, CharacterAsset>;
  clips: Map<string, AnimationClip>;
}

const BASE = './assets/';
export const CHARACTER_KEYS = ['male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f', 'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f'] as const;
export type CharacterKey = (typeof CHARACTER_KEYS)[number];

/** Loads Area 1 assets (before gameplayStart). Props come as one GLB with a named root per model. */
export async function loadArea1Assets(onProgress?: (k: number) => void): Promise<Assets> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const files = ['props-area1.glb', ...CHARACTER_KEYS.map((k) => `characters/${k}.glb`)];
  let done = 0;
  const results = await Promise.all(
    files.map(async (f) => {
      const g = await loader.loadAsync(BASE + f);
      done++;
      onProgress?.(done / files.length);
      return g;
    }),
  );
  const props = new Map<string, Object3D>();
  const propsGltf = results[0];
  if (propsGltf) {
    for (const child of [...propsGltf.scene.children]) {
      child.traverse((o) => {
        if ((o as Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      props.set(child.name, child);
    }
  }
  const characters = new Map<string, CharacterAsset>();
  const clips = new Map<string, AnimationClip>();
  CHARACTER_KEYS.forEach((k, i) => {
    const g = results[i + 1];
    if (!g) return;
    characters.set(k, { scene: g.scene });
    for (const c of g.animations) clips.set(c.name, c);
  });
  return { props, characters, clips };
}

/** Deep-clones a prop template (geometry/material shared). */
export function cloneProp(a: Assets, name: string): Object3D {
  const t = a.props.get(name);
  if (!t) throw new Error(`missing prop ${name}`);
  return t.clone(true);
}

export function forEachMaterial(o: Object3D, fn: (m: Material) => void): void {
  o.traverse((c) => {
    const m = (c as Mesh).material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach(fn);
    else fn(m);
  });
}
