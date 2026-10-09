import type { Rect, Rot, V2 } from '../data/types';

/** Rotates a local offset by a station/object rotation (see Rot). */
export function rotate(rot: Rot, lx: number, lz: number): V2 {
  switch (rot) {
    case 0:
      return { x: lx, z: lz };
    case 1:
      return { x: lz, z: -lx };
    case 2:
      return { x: -lx, z: -lz };
    case 3:
      return { x: -lz, z: lx };
  }
}

export function toWorld(center: V2, rot: Rot, local: V2): V2 {
  const r = rotate(rot, local.x, local.z);
  return { x: center.x + r.x, z: center.z + r.z };
}

export function rectToWorld(center: V2, rot: Rot, r: Rect): Rect {
  const a = toWorld(center, rot, { x: r.x0, z: r.z0 });
  const b = toWorld(center, rot, { x: r.x1, z: r.z1 });
  return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function inRect(r: Rect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

/** Pushes a circle out of an AABB. Returns true if it moved. */
export function pushOutOfRect(p: { x: number; z: number }, radius: number, r: Rect): boolean {
  const cx = Math.max(r.x0, Math.min(p.x, r.x1));
  const cz = Math.max(r.z0, Math.min(p.z, r.z1));
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * radius;
    p.z = cz + (dz / d) * radius;
    return true;
  }
  // centre inside the rect: push out along the shallowest axis
  const left = p.x - r.x0;
  const right = r.x1 - p.x;
  const top = p.z - r.z0;
  const bottom = r.z1 - p.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = r.x0 - radius;
  else if (m === right) p.x = r.x1 + radius;
  else if (m === top) p.z = r.z0 - radius;
  else p.z = r.z1 + radius;
  return true;
}

/** Yaw (radians) so that a model facing -z looks along (dx, dz). */
export function yawFor(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
