import { MeshDepthMaterial } from 'three';

/**
 * Shadow-pass depth materials, one per program variant (DECISIONS §88).
 *
 * three.js draws every shadow caster with ONE shared MeshDepthMaterial unless the object has a
 * `customDepthMaterial`. Our casters mix skinned characters, InstancedMeshes (balls, bottles, bibs, cash) and plain
 * merged meshes, so that shared material flipped `skinning` / `instancing` on almost every draw and the renderer
 * rebuilt its program parameters and cache-key string each time (~50 KB of garbage per frame in a full academy).
 * Giving each variant its own material keeps every material's program stable.
 */
export const DEPTH_SKINNED = new MeshDepthMaterial();
export const DEPTH_INSTANCED = new MeshDepthMaterial();
