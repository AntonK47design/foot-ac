import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { AreaDef } from '../../data/types';
import { Rng } from '../../core/rng';
import { Batch, trs } from '../batch';
import { G } from '../geo';
import { PALETTE } from '../palette';

const HALF_PI = Math.PI / 2;

/** Flat plane on the ground (XZ) */
function flat(w: number, d: number): PlaneGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-HALF_PI);
  return g;
}

/** Large outer ground with soft colour variation (vertex colours). */
function outerGround(size: number, seg: number): BufferGeometry {
  const g = new PlaneGeometry(size, size, seg, seg).toNonIndexed();
  g.rotateX(-HALF_PI);
  g.deleteAttribute('uv');
  const pos = g.attributes.position as BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const a = new Color(PALETTE.grassOuter);
  const b = new Color(PALETTE.grassOuterDark);
  const c = new Color();
  for (let i = 0; i < pos.count; i += 3) {
    // flat colour per triangle for a low-poly look
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const n = 0.5 + 0.5 * Math.sin(x * 0.09) * Math.cos(z * 0.07 + Math.sin(x * 0.03));
    c.copy(a).lerp(b, n);
    for (let j = 0; j < 3; j++) {
      col[(i + j) * 3] = c.r;
      col[(i + j) * 3 + 1] = c.g;
      col[(i + j) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.translate(0, -0.04, 0);
  return g;
}

export function makeSkyTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = ctx.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#8ED6FF');
  grd.addColorStop(1, '#DFF4FF');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 4, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function tree(b: Batch, x: number, z: number, s: number, rng: Rng): void {
  const greens = [PALETTE.treeA, PALETTE.treeB, PALETTE.treeC];
  const g = rng.pick(greens);
  b.at(G.cyl(6), PALETTE.trunk, x, 0.55 * s, z, 0, 0.28 * s, 1.1 * s, 0.28 * s);
  if (rng.chance(0.35)) {
    // pine
    b.at(G.cone(7), g, x, 1.6 * s, z, rng.range(0, 6), 1.9 * s, 1.8 * s, 1.9 * s);
    b.at(G.cone(7), g, x, 2.4 * s, z, rng.range(0, 6), 1.4 * s, 1.4 * s, 1.4 * s);
  } else {
    b.at(G.ico(1), g, x, 1.75 * s, z, rng.range(0, 6), 2.1 * s, 1.8 * s, 2.1 * s);
    b.at(G.ico(1), g, x + 0.35 * s, 2.35 * s, z - 0.2 * s, rng.range(0, 6), 1.3 * s, 1.15 * s, 1.3 * s);
  }
}

function bush(b: Batch, x: number, z: number, s: number, rng: Rng): void {
  b.at(G.ico(1), rng.pick([PALETTE.treeA, PALETTE.treeC]), x, 0.32 * s, z, rng.range(0, 6), 1.1 * s, 0.75 * s, 1.0 * s);
}

/** White picket fence segment from (x0,z0) to (x1,z1). */
function fence(b: Batch, x0: number, z0: number, x1: number, z1: number): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(-dz, dx);
  const n = Math.max(1, Math.round(len / 1.1));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.at(G.box(), PALETTE.fence, x0 + dx * t, 0.38, z0 + dz * t, ry, 0.13, 0.76, 0.13);
  }
  b.at(G.box(), PALETTE.fence, (x0 + x1) / 2, 0.52, (z0 + z1) / 2, ry, len, 0.09, 0.06);
  b.at(G.box(), PALETTE.fence, (x0 + x1) / 2, 0.25, (z0 + z1) / 2, ry, len, 0.09, 0.06);
}

function barrier(b: Batch, x: number, z: number, ry: number): void {
  // construction barrier: two legs + striped panel
  b.at(G.box(), PALETTE.white, x - 0.7 * Math.cos(ry), 0.45, z + 0.7 * Math.sin(ry), ry, 0.08, 0.9, 0.3);
  b.at(G.box(), PALETTE.white, x + 0.7 * Math.cos(ry), 0.45, z - 0.7 * Math.sin(ry), ry, 0.08, 0.9, 0.3);
  for (let i = 0; i < 4; i++) {
    const off = -0.6 + i * 0.4;
    b.at(G.box(), i % 2 ? PALETTE.white : PALETTE.orange, x + off * Math.cos(ry), 0.68, z - off * Math.sin(ry), ry, 0.4, 0.28, 0.07);
  }
}

export interface WorldMeshes {
  group: Group;
}

/** Builds all static scenery for an area into a handful of merged meshes. */
export function buildWorld(area: AreaDef, mat: Material, propsScale: number): Group {
  const group = new Group();
  const rng = new Rng(99);
  const b = area.bounds;

  // ── outer park ground (one mesh)
  const ground = new Mesh(outerGround(320, 32), mat);
  ground.matrixAutoUpdate = false;
  group.add(ground);

  const s = new Batch();
  // ── academy pitch stripes
  const w = b.x1 - b.x0;
  const stripe = 2;
  let k = 0;
  for (let z = b.z0; z < b.z1 - 1e-6; z += stripe, k++) {
    const d = Math.min(stripe, b.z1 - z);
    s.add(flat(w, d), k % 2 ? PALETTE.grassA : PALETTE.grassB, trs((b.x0 + b.x1) / 2, 0, z + d / 2));
  }
  // ── pitch lines
  const inset = 0.7;
  const lw = 0.12;
  const lx0 = b.x0 + inset;
  const lx1 = b.x1 - inset;
  const lz0 = b.z0 + inset;
  const lz1 = b.z1 - inset;
  const ly = 0.012;
  s.add(flat(lx1 - lx0, lw), PALETTE.lines, trs((lx0 + lx1) / 2, ly, lz0));
  s.add(flat(lx1 - lx0, lw), PALETTE.lines, trs((lx0 + lx1) / 2, ly, lz1));
  s.add(flat(lw, lz1 - lz0), PALETTE.lines, trs(lx0, ly, (lz0 + lz1) / 2));
  s.add(flat(lw, lz1 - lz0), PALETTE.lines, trs(lx1, ly, (lz0 + lz1) / 2));
  const ring = new RingGeometry(3.0, 3.13, 48);
  ring.rotateX(-HALF_PI);
  s.add(ring, PALETTE.lines, trs(area.spawn.x, ly, area.spawn.z));
  const dot = new CircleGeometry(0.22, 16);
  dot.rotateX(-HALF_PI);
  s.add(dot, PALETTE.lines, trs(area.spawn.x, ly, area.spawn.z));
  // ── mud patches ("muddy park pitch")
  const mud = new CircleGeometry(1, 14);
  mud.rotateX(-HALF_PI);
  const mudSpots: Array<[number, number, number, number]> = [
    [-5, -7.3, 2.2, 1.3],
    [-3.3, -6.1, 0.9, 0.6],
    [5, -6.3, 1.2, 2.3],
    [-10.5, -2, 1.1, 2.0],
    [0.6, 5.6, 0.8, 0.5],
  ];
  for (const [x, z, sx, sz] of mudSpots) s.add(mud, PALETTE.mud, trs(x, 0.006, z, rng.range(0, 3), sx, 1, sz));
  // ── sandy path from the gate to the desk / chairs
  const gz = area.gate.inside.z;
  s.add(flat(b.x1 + 1.2 - (area.desk.traineeSpot.x - 0.6), 2.2), PALETTE.path, trs((b.x1 + 1.2 + area.desk.traineeSpot.x - 0.6) / 2, 0.008, gz));
  s.add(flat(6.6, 1.6), PALETTE.path, trs(13.7, 0.008, 6.0));

  // ── fence with a gate gap on the east side
  const gap0 = gz - 1.6;
  const gap1 = gz + 1.6;
  fence(s, b.x0, b.z0, b.x1, b.z0);
  fence(s, b.x0, b.z1, b.x1, b.z1);
  fence(s, b.x0, b.z0, b.x0, b.z1);
  fence(s, b.x1, b.z0, b.x1, gap0);
  fence(s, b.x1, gap1, b.x1, b.z1);
  // gate pillars + arch in academy colours
  for (const gzp of [gap0, gap1]) {
    s.at(G.rbox(0.1), PALETTE.blue, b.x1, 1.3, gzp, 0, 0.45, 2.6, 0.45);
    s.at(G.sphere(10, 6), PALETTE.yellow, b.x1, 2.75, gzp, 0, 0.42, 0.42, 0.42);
  }
  s.at(G.rbox(0.12), PALETTE.blue, b.x1, 2.35, gz, 0, 0.3, 0.6, gap1 - gap0 + 0.5);
  s.at(G.rbox(0.2), PALETTE.yellow, b.x1 + 0.17, 2.35, gz, 0, 0.05, 0.36, 2.4);

  // ── road + sidewalks east
  const rx = area.gate.busStop.x;
  s.add(flat(5.2, 260), PALETTE.road, trs(rx, -0.02, 0));
  for (let z = -120; z < 120; z += 4) s.add(flat(0.18, 1.8), PALETTE.roadLine, trs(rx + 0.4, -0.01, z));
  s.at(G.box(), PALETTE.sidewalk, rx - 3.2, 0.03, 0, 0, 1.4, 0.12, 260);
  s.at(G.box(), PALETTE.sidewalk, rx + 3.3, 0.03, 0, 0, 1.4, 0.12, 260);
  // bus stop sign
  s.at(G.cyl(6), PALETTE.metal, rx - 3.0, 1.1, gz - 2.2, 0, 0.08, 2.2, 0.08);
  s.at(G.cyl(16), PALETTE.blue, rx - 3.0, 2.25, gz - 2.2, 0, 0.62, 0.08, 0.62, HALF_PI);
  s.at(G.cyl(16), PALETTE.white, rx - 3.05, 2.25, gz - 2.2, 0, 0.4, 0.09, 0.4, HALF_PI);

  // ── locked Area 2 teaser (north): dirt lot, barriers, padlock sign
  s.add(flat(30, 22), PALETTE.path, trs(0, -0.025, b.z0 - 12.5));
  for (let x = b.x0 + 1.5; x < b.x1; x += 1.9) barrier(s, x, b.z0 - 0.9, 0);
  s.at(G.rbox(0.12), PALETTE.yellow, 0, 1.6, b.z0 - 3.2, 0, 3.4, 2.2, 0.25);
  s.at(G.box(), PALETTE.woodDark, -1.3, 0.6, b.z0 - 3.15, 0, 0.18, 1.2, 0.18);
  s.at(G.box(), PALETTE.woodDark, 1.3, 0.6, b.z0 - 3.15, 0, 0.18, 1.2, 0.18);
  // padlock: body + shackle
  s.at(G.rbox(0.2), PALETTE.dark, 0, 1.45, b.z0 - 3.0, 0, 0.9, 0.75, 0.2);
  const shackle = new RingGeometry(0.22, 0.34, 16, 1, 0, Math.PI);
  s.add(shackle, PALETTE.dark, trs(0, 1.82, b.z0 - 2.95));
  s.at(G.cyl(10), PALETTE.yellow, 0, 1.42, b.z0 - 2.88, 0, 0.18, 0.05, 0.18, HALF_PI);
  // construction props
  const brick = 0xd9774b;
  for (let i = 0; i < 6; i++) s.at(G.rbox(0.1), brick, -9 + (i % 3) * 0.75, 0.22 + Math.floor(i / 3) * 0.42, b.z0 - 7, 0, 0.7, 0.4, 0.5);
  for (let i = 0; i < 4; i++) s.at(G.cone(10), PALETTE.cone, 6 + i * 1.3, 0.3, b.z0 - 6 + (i % 2), 0, 0.42, 0.6, 0.42);
  s.at(G.cyl(12), 0x9aa3ad, 9, 0.9, b.z0 - 10, 0, 1.6, 1.8, 1.6);
  s.at(G.box(), 0xffb02e, 9, 2.0, b.z0 - 10, 0, 0.3, 0.6, 0.3);

  // ── trees & bushes around the park (never a void)
  const props = new Batch();
  const placed: Array<[number, number]> = [];
  const free = (x: number, z: number, r: number): boolean => {
    if (x > b.x0 - 1.5 && x < b.x1 + 1.5 && z > b.z0 - 1.5 && z < b.z1 + 1.5) return false;
    if (x > rx - 4.5 && x < rx + 4.5) return false;
    if (x > b.x0 && x < b.x1 && z < b.z0 && z > b.z0 - 24) return false; // construction lot
    for (const [px, pz] of placed) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return false;
    return true;
  };
  const treeCount = Math.round(170 * propsScale);
  for (let i = 0, tries = 0; i < treeCount && tries < 4000; tries++) {
    const x = rng.range(b.x0 - 40, b.x1 + 40);
    const z = rng.range(b.z0 - 45, b.z1 + 30);
    if (!free(x, z, 2.6)) continue;
    placed.push([x, z]);
    tree(props, x, z, rng.range(0.85, 1.35), rng);
    i++;
  }
  // bushes hugging the fence
  for (let x = b.x0 + 1; x < b.x1; x += rng.range(2.5, 4.5)) {
    bush(props, x, b.z1 + 0.9, rng.range(0.8, 1.2), rng);
  }
  for (let z = b.z0 + 1; z < b.z1; z += rng.range(2.5, 4.5)) bush(props, b.x0 - 0.9, z, rng.range(0.8, 1.2), rng);

  // ── distant skyline + hills (visible when zoomed out / capture mode)
  for (let i = 0; i < 26; i++) {
    const x = -130 + i * 10 + rng.range(-3, 3);
    const h = rng.range(10, 38);
    props.at(G.box(), rng.pick(PALETTE.city), x, h / 2, -120 + rng.range(-6, 6), 0, rng.range(6, 10), h, 6);
  }
  for (let i = 0; i < 7; i++) props.at(G.sphere(16, 8), PALETTE.hill, -120 + i * 40, -6, -95, 0, 60, 18, 26);

  group.add(s.build(mat));
  group.add(props.build(mat));
  return group;
}
