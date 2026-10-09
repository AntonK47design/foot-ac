import { BoxGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Shared unit geometries for building (never disposed; tiny). */
const cache = new Map<string, BufferGeometry>();

function get(key: string, make: () => BufferGeometry): BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

export const G = {
  /** Unit rounded box (1×1×1), scale it. Radius is relative. */
  rbox: (r = 0.12, seg = 2): BufferGeometry => get(`rbox${r}:${seg}`, () => new RoundedBoxGeometry(1, 1, 1, seg, r)),
  box: (): BufferGeometry => get('box', () => new BoxGeometry(1, 1, 1)),
  cyl: (seg = 10): BufferGeometry => get(`cyl${seg}`, () => new CylinderGeometry(0.5, 0.5, 1, seg)),
  cone: (seg = 10): BufferGeometry => get(`cone${seg}`, () => new ConeGeometry(0.5, 1, seg)),
  sphere: (w = 12, h = 8): BufferGeometry => get(`sph${w}:${h}`, () => new SphereGeometry(0.5, w, h)),
  ico: (detail = 0): BufferGeometry => get(`ico${detail}`, () => new IcosahedronGeometry(0.5, detail)),
};
