import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Material,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpP = new Vector3();
const tmpS = new Vector3();
const tmpC = new Color();

/**
 * Non-indexed position/normal (and colour, if present) of a source geometry, made once per source. `clone()` on
 * three's shape geometries rebuilds the shape from its parameters, and the same few shared unit shapes are
 * placed hundreds of times while the world is built, so copying these arrays is far cheaper than cloning.
 */
const templates = new WeakMap<BufferGeometry, BufferGeometry>();

function template(geo: BufferGeometry): BufferGeometry {
  let t = templates.get(geo);
  if (t) return t;
  const src = geo.index ? geo.toNonIndexed() : geo;
  t = new BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    if (a instanceof BufferAttribute && a.array instanceof Float32Array && !a.normalized) {
      t.setAttribute(name, a);
      continue;
    }
    // interleaved / quantized (meshopt) / normalized: plain floats, so transforms and merging behave
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    t.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  if (!t.attributes.normal) t.computeVertexNormals();
  templates.set(geo, t);
  return t;
}

/** A fresh copy of the template's attributes (only those named), ready to transform. */
function copyOf(geo: BufferGeometry, withColor: boolean): BufferGeometry {
  const t = template(geo);
  const g = new BufferGeometry();
  for (const name of withColor ? ['position', 'normal', 'color'] : ['position', 'normal']) {
    const a = t.getAttribute(name) as BufferAttribute | undefined;
    if (a) g.setAttribute(name, new BufferAttribute((a.array as Float32Array).slice(), a.itemSize, a.normalized));
  }
  return g;
}

/** Bakes a geometry into position/normal/color only (non-indexed) so many can be merged. */
export function bake(geo: BufferGeometry, color: ColorRepresentation, m?: Matrix4): BufferGeometry {
  const g = copyOf(geo, false);
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position?.count ?? 0;
  const col = new Float32Array(n * 3);
  tmpC.set(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

export function trs(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  tmpP.set(x, y, z);
  tmpS.set(sx, sy, sz);
  return tmpM.clone().compose(tmpP, tmpQ, tmpS);
}

/** Collects coloured pieces and merges them into one vertex-coloured mesh (one draw call). */
export class Batch {
  private readonly parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, color: ColorRepresentation, m?: Matrix4): this {
    this.parts.push(bake(geo, color, m));
    return this;
  }

  at(geo: BufferGeometry, color: ColorRepresentation, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): this {
    return this.add(geo, color, trs(x, y, z, ry, sx, sy, sz, rx, rz));
  }

  /** Adds a geometry that already has a colour attribute. */
  addRaw(geo: BufferGeometry, m?: Matrix4): this {
    const g = copyOf(geo, true);
    if (m) g.applyMatrix4(m);
    this.parts.push(g);
    return this;
  }

  /** Adds all pieces of another batch transformed by m. */
  merge(other: Batch, m: Matrix4): this {
    for (const p of other.parts) this.parts.push(p.clone().applyMatrix4(m));
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  geometry(ao = false): BufferGeometry {
    const g = mergeGeometries(this.parts, false);
    if (ao) bakeGroundAo(g);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    g.computeBoundingSphere();
    return g;
  }

  build(material: Material, ao = false): Mesh {
    const mesh = new Mesh(this.geometry(ao), material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

/** Baked vertex AO: darkens vertices close to the ground (wall bases, furniture feet). */
export function bakeGroundAo(g: BufferGeometry, strength = 0.32, height = 0.55): void {
  const pos = g.attributes.position;
  const col = g.attributes.color;
  if (!pos || !col) return;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = Math.min(1, Math.max(0, y / height));
    const f = 1 - strength * (1 - k * k * (3 - 2 * k));
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  col.needsUpdate = true;
}
