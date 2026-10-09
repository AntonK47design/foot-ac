import { Group, type Material } from 'three';
import { Batch } from '../batch';
import { G } from '../geo';
import { PALETTE } from '../palette';

const HALF_PI = Math.PI / 2;

/** Yellow academy bus (faces +z, i.e. drives south). */
export function buildBus(mat: Material): Group {
  const root = new Group();
  const b = new Batch();
  b.at(G.rbox(0.18, 3), PALETTE.yellow, 0, 1.35, 0, 0, 2.5, 2.1, 6.4);
  b.at(G.rbox(0.1), PALETTE.blue, 0, 0.95, 0, 0, 2.54, 0.35, 6.3);
  for (let i = 0; i < 4; i++) {
    b.at(G.rbox(0.06), 0x2a3d6a, -1.26, 1.75, -2.1 + i * 1.35, 0, 0.04, 0.7, 1.05);
    b.at(G.rbox(0.06), 0x2a3d6a, 1.26, 1.75, -2.1 + i * 1.35, 0, 0.04, 0.7, 1.05);
  }
  b.at(G.rbox(0.06), 0x2a3d6a, 0, 1.75, 3.2, 0, 2.1, 0.75, 0.04);
  b.at(G.box(), 0xfff6c8, -0.85, 0.75, 3.21, 0, 0.35, 0.22, 0.03);
  b.at(G.box(), 0xfff6c8, 0.85, 0.75, 3.21, 0, 0.35, 0.22, 0.03);
  // door on the west side (towards the gate)
  b.at(G.rbox(0.04), 0x2a3d6a, -1.27, 1.2, 1.9, 0, 0.04, 1.6, 0.8);
  for (const z of [-2.1, 2.0]) {
    for (const x of [-1.15, 1.15]) {
      b.at(G.cyl(12), PALETTE.dark, x, 0.42, z, 0, 0.84, 0.32, 0.84, 0, HALF_PI);
      b.at(G.cyl(8), PALETTE.metal, x + Math.sign(x) * 0.02, 0.42, z, 0, 0.4, 0.33, 0.4, 0, HALF_PI);
    }
  }
  b.at(G.rbox(0.1), PALETTE.white, 0, 2.43, 0, 0, 2.0, 0.08, 5.4);
  const mesh = b.build(mat);
  mesh.castShadow = true;
  root.add(mesh);
  return root;
}
