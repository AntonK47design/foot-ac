import { BufferAttribute, IcosahedronGeometry, type BufferGeometry, Vector3, Color } from 'three';

let cached: BufferGeometry | null = null;

/** Low-poly football: icosphere with dark pentagon patches baked into vertex colours. */
export function ballGeometry(): BufferGeometry {
  if (cached) return cached;
  const base = new IcosahedronGeometry(1, 0);
  const pos0 = base.attributes.position as BufferAttribute;
  const corners: Vector3[] = [];
  for (let i = 0; i < pos0.count; i++) {
    const v = new Vector3().fromBufferAttribute(pos0, i).normalize();
    if (!corners.some((c) => c.distanceTo(v) < 1e-3)) corners.push(v);
  }
  const g = new IcosahedronGeometry(0.5, 1);
  g.deleteAttribute('uv');
  const pos = g.attributes.position as BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const white = new Color(0xffffff);
  const dark = new Color(0x22262e);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const centre = a.add(b).add(c).normalize();
    let isDark = false;
    for (const k of corners) if (k.dot(centre) > 0.93) isDark = true;
    const cc = isDark ? dark : white;
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = cc.r;
      col[(i + j) * 3 + 1] = cc.g;
      col[(i + j) * 3 + 2] = cc.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  cached = g;
  return g;
}
