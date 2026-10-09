import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rect } from '../../data/types';
import type { Layout } from '../../data/areas/area1-layout';
import { AREA1 } from '../../data/areas/area1';
import { Batch, trs } from '../batch';
import { G } from '../geo';
import type { Assets } from '../assets';
import { aoTextures, pattern, type Pattern } from '../textures';
import { DecalBatch } from './decals';
import { PropKit } from './football';

const HALF_PI = Math.PI / 2;
const WALL_H = 2.4;
const WALL_T = 0.24;
const STUB_H = 0.32;
const COL = {
  wall: 0xf3eee6,
  wallSide: 0xd9d1c4,
  trim: 0x2f6bff,
  skirting: 0x1f3f99,
  curbTop: 0xe9dfc8,
  curbSide: 0xb7a88a,
  plotSide: 0x5a4c66,
  line: 0xffffff,
};

export interface Diorama {
  root: Group;
  /** Back nets of goals (for ripple). */
  nets: Mesh[];
  /** Anchor points the showcase / gameplay can populate. */
  anchors: Record<string, { x: number; z: number; ry?: number }>;
}

/** Converts quantized/interleaved attributes to plain Float32 so geometries can be transformed and merged. */
function toFloat(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.count;
    const size = a.itemSize;
    const arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
    }
    g.setAttribute(name, new BufferAttribute(arr, size));
  }
  if (src.index) g.setIndex(Array.from(src.index.array as ArrayLike<number>));
  return g;
}

/** Collects placed KayKit props and merges them per material (static batching). */
class PropMerger {
  private readonly byMat = new Map<Material, BufferGeometry[]>();
  readonly footprints: Array<{ x: number; z: number; r: number }> = [];
  constructor(private readonly assets: Assets) {}

  put(name: string, x: number, z: number, ry = 0, s = 1, y = 0, ao = 0.55): void {
    const t = this.assets.props.get(name);
    if (!t) throw new Error(`missing prop ${name}`);
    const o = t.clone(true);
    o.position.set(x, y, z);
    o.rotation.set(0, ry, 0);
    o.scale.setScalar(s);
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      const mat = m.material as Material;
      const g = toFloat(m.geometry).applyMatrix4(m.matrixWorld);
      let list = this.byMat.get(mat);
      if (!list) {
        list = [];
        this.byMat.set(mat, list);
      }
      list.push(g);
    });
    if (ao > 0 && y < 0.3) this.footprints.push({ x, z, r: ao * s });
  }

  build(): Mesh[] {
    const out: Mesh[] = [];
    for (const [mat, list] of this.byMat) {
      const g = mergeGeometries(list, false);
      const lm = mat as MeshLambertMaterial;
      // toon-flat look: Lambert with the pack palette texture
      const m = new MeshLambertMaterial({ map: lm.map ?? null, color: lm.color });
      const mesh = new Mesh(g, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}

function floor(p: Pattern, r: Rect, y: number, tile = 1): Mesh {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const g = new PlaneGeometry(w, d);
  g.rotateX(-HALF_PI);
  const t = pattern(p).clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(w / tile, d / tile);
  const m = new Mesh(g, new MeshLambertMaterial({ map: t }));
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  return m;
}

function flat(w: number, d: number): PlaneGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-HALF_PI);
  return g;
}

/** Wall segment from (x0,z0) to (x1,z1) with skirting and top trim. */
function wall(b: Batch, x0: number, z0: number, x1: number, z1: number, h: number, inner: 1 | -1 = 1): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ry = Math.atan2(-dz, dx);
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  // normal (towards the room side)
  const nx = (-dz / len) * inner;
  const nz = (dx / len) * inner;
  b.at(G.rbox(0.04), COL.wall, mx, h / 2, mz, ry, len + WALL_T * 0.6, h, WALL_T);
  b.at(G.rbox(0.03), COL.trim, mx, h + 0.04, mz, ry, len + WALL_T * 0.7, 0.1, WALL_T + 0.04);
  if (h > 1) {
    b.at(G.box(), COL.skirting, mx + nx * (WALL_T / 2 + 0.01), 0.07, mz + nz * (WALL_T / 2 + 0.01), ry, len, 0.14, 0.03);
    b.at(G.box(), COL.trim, mx + nx * (WALL_T / 2 + 0.01), 1.05, mz + nz * (WALL_T / 2 + 0.01), ry, len, 0.06, 0.02);
  }
}

/** Shared build context: everything is merged at finalize(). */
interface Ctx {
  assets: Assets;
  L: Layout;
  b: Batch;
  decals: DecalBatch;
  kit: PropKit;
  props: PropMerger;
  extra: Mesh[];
  nets: Mesh[];
  aoBlobs: Array<{ x: number; z: number; r: number }>;
  aoStrips: Array<{ x0: number; z0: number; x1: number; z1: number; w: number }>;
  anchors: Diorama['anchors'];
  root: Group;
}

function newCtx(assets: Assets, L: Layout): Ctx {
  const b = new Batch();
  const decals = new DecalBatch();
  return { assets, L, b, decals, kit: new PropKit(b, decals), props: new PropMerger(assets), extra: [], nets: [], aoBlobs: [], aoStrips: [], anchors: {}, root: new Group() };
}

function finalize(c: Ctx, mat: Material): Diorama {
  const { root } = c;
  const ao = aoTextures();
  const blobs: BufferGeometry[] = [];
  for (const f of [...c.aoBlobs, ...c.props.footprints]) {
    const g = flat(f.r * 2.4, f.r * 2.4);
    g.translate(f.x, 0.026, f.z);
    blobs.push(g);
  }
  if (blobs.length) {
    const m = new Mesh(mergeGeometries(blobs, false), new MeshBasicMaterial({ map: ao.radial, transparent: true, depthWrite: false }));
    m.renderOrder = 2;
    c.extra.push(m);
  }
  const strips: BufferGeometry[] = [];
  for (const s of c.aoStrips) {
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    const ry = Math.atan2(-(s.z1 - s.z0), s.x1 - s.x0);
    const g = flat(len, s.w);
    g.translate(0, 0, s.w / 2);
    g.rotateY(ry);
    g.translate(s.x0 + (s.x1 - s.x0) / 2, 0.027, s.z0 + (s.z1 - s.z0) / 2);
    strips.push(g);
  }
  if (strips.length) {
    const m = new Mesh(mergeGeometries(strips, false), new MeshBasicMaterial({ map: ao.linear, transparent: true, depthWrite: false }));
    m.renderOrder = 2;
    c.extra.push(m);
  }
  if (!c.b.empty) {
    const statics = c.b.build(mat, true);
    statics.castShadow = true;
    statics.receiveShadow = true;
    root.add(statics);
  }
  for (const m of c.props.build()) root.add(m);
  const d = c.decals.build();
  if (d) root.add(d);
  for (const m of c.extra) root.add(m);
  root.traverse((o: Object3D) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  return { root, nets: c.nets, anchors: c.anchors };
}

/** Everything that exists from the start (plot, rooms, pitch surfaces and fence, plaza decor, ghosts). */
export function buildDiorama(assets: Assets, L: Layout, mat: Material): Diorama {
  const c = newCtx(assets, L);
  const { b, kit, props, decals, root, aoBlobs, aoStrips, anchors, extra } = c;
  const P = L.plot;

  // ── plot block + curb (raised island in the void)
  const pw = P.x1 - P.x0;
  const pd = P.z1 - P.z0;
  const pcx = (P.x0 + P.x1) / 2;
  const pcz = (P.z0 + P.z1) / 2;
  b.at(G.box(), COL.plotSide, pcx, -0.47, pcz, 0, pw, 0.9, pd);
  const curbW = 0.38;
  for (const [x, z, w, d] of [
    [pcx, P.z0 + curbW / 2, pw, curbW],
    [pcx, P.z1 - curbW / 2, pw, curbW],
    [P.x0 + curbW / 2, pcz, curbW, pd],
    [P.x1 - curbW / 2, pcz, curbW, pd],
  ] as Array<[number, number, number, number]>) {
    b.at(G.rbox(0.06), COL.curbTop, x, 0.06, z, 0, w, 0.16, d);
  }
  b.at(G.box(), COL.curbSide, pcx, -0.12, P.z1 + 0.01, 0, pw, 0.3, 0.02);

  // ── street east (lower level) with the bus stop
  const street: Rect = { x0: P.x1, z0: P.z0, x1: P.x1 + 5.2, z1: P.z1 };
  root.add(floor('asphalt', street, -0.3, 2));
  // base block top sits 4 cm under the asphalt (coplanar faces z-fight and flicker)
  b.at(G.box(), 0x2a2540, (street.x0 + street.x1) / 2, -0.79, (street.z0 + street.z1) / 2, 0, street.x1 - street.x0, 0.9, street.z1 - street.z0);
  for (let z = street.z0 + 1; z < street.z1; z += 3) b.add(flat(0.16, 1.6), 0xf4f0e4, trs(street.x0 + 3.2, -0.285, z));
  kit.place(L.gate.x + 0.6, L.busStop.z - 1.6, 0, 1, -0.3).busStopSign();
  // gate gap in the curb (ramp)
  b.at(G.rbox(0.06), 0xd9cfb6, P.x1 - 0.2, -0.12, L.gate.z, 0, 1.0, 0.3, 1.8, 0, 0.3);

  // ── plaza paving (base layer) + room floors
  root.add(floor('paving', { x0: P.x0 + curbW, z0: P.z0 + curbW, x1: P.x1 - curbW, z1: P.z1 - curbW }, 0.004, 1));
  for (const room of L.rooms) root.add(floor(room.floor, room.rect, 0.012, 1));

  // ── pitch: turf with mowing stripes, crisp lines, fence, floodlights
  const pitch = L.pitch;
  const turf = floor('turf', pitch, 0.012, 2);
  const tt = (turf.material as MeshLambertMaterial).map;
  if (tt) tt.repeat.set(1, (pitch.z1 - pitch.z0) / 3);
  root.add(turf);
  const lw = 0.1;
  const ly = 0.02;
  const pl = { x0: pitch.x0 + 0.35, z0: pitch.z0 + 0.35, x1: pitch.x1 - 0.35, z1: pitch.z1 - 0.35 };
  b.add(flat(pl.x1 - pl.x0, lw), COL.line, trs((pl.x0 + pl.x1) / 2, ly, pl.z0));
  b.add(flat(pl.x1 - pl.x0, lw), COL.line, trs((pl.x0 + pl.x1) / 2, ly, pl.z1));
  b.add(flat(lw, pl.z1 - pl.z0), COL.line, trs(pl.x0, ly, (pl.z0 + pl.z1) / 2));
  b.add(flat(lw, pl.z1 - pl.z0), COL.line, trs(pl.x1, ly, (pl.z0 + pl.z1) / 2));
  root.add(floor('astro', L.dribbleStrip, 0.022, 1));
  root.add(floor('deck', L.passDeck, 0.022, 2));
  b.at(G.rbox(0.03), 0x9a6435, (L.passDeck.x0 + L.passDeck.x1) / 2, 0.02, (L.passDeck.z0 + L.passDeck.z1) / 2, 0, L.passDeck.x1 - L.passDeck.x0 + 0.12, 0.04, L.passDeck.z1 - L.passDeck.z0 + 0.12);
  const r0 = L.dribbleStrip;
  b.add(flat(r0.x1 - r0.x0, 0.08), COL.line, trs((r0.x0 + r0.x1) / 2, 0.03, r0.z0));
  b.add(flat(r0.x1 - r0.x0, 0.08), COL.line, trs((r0.x0 + r0.x1) / 2, 0.03, r0.z1));
  const fz0 = pitch.z0;
  const fz1 = pitch.z1;
  kit.place(0, 0).fence(pitch.x0, fz0, pitch.x1, fz0);
  kit.place(0, 0).fence(pitch.x0, fz0, pitch.x0, fz1);
  kit.place(0, 0).fence(pitch.x1, fz0, pitch.x1, fz1);
  let gx = pitch.x0;
  for (const [a, cc] of L.pitchGates) {
    kit.place(0, 0).fence(gx, fz1, a, fz1);
    gx = cc;
  }
  kit.place(0, 0).fence(gx, fz1, pitch.x1, fz1);
  for (const [x, z] of [
    [pitch.x0 - 0.4, fz0 - 0.2],
    [pitch.x1 + 0.2, fz0 - 0.2],
    [pitch.x1 + 0.2, fz1 + 0.35],
  ] as Array<[number, number]>) {
    kit.place(x, z, 0).floodlight();
    aoBlobs.push({ x, z, r: 0.7 });
  }
  // shooting-lane surface marks (box lines) are part of the pitch
  const sl = L.shootingLane;
  const gx0 = (sl.x0 + sl.x1) / 2;
  const goalZ = sl.z0 + 1.6;
  b.add(flat(4.2 + 1.6, lw), COL.line, trs(gx0, ly, goalZ + 1.7));
  b.add(flat(lw, 1.7), COL.line, trs(gx0 - 2.9, ly, goalZ + 0.85));
  b.add(flat(lw, 1.7), COL.line, trs(gx0 + 2.9, ly, goalZ + 0.85));
  kit.place((pitch.x0 + pitch.x1) / 2 + 1.6, P.z0 + 0.05).scoreboard();
  kit.place(-6.2, -0.8, 0.25).tacticsBoard();
  aoBlobs.push({ x: -6.2, z: -0.8, r: 0.7 });

  // ── clubhouse walls (cutaway): full back/side walls, front stubs with doorways
  for (const room of L.rooms) {
    const r = room.rect;
    wall(b, r.x0, r.z0, r.x1, r.z0, WALL_H, 1);
    aoStrips.push({ x0: r.x0, z0: r.z0 + WALL_T / 2, x1: r.x1, z1: r.z0 + WALL_T / 2, w: 0.7 });
    if (room === L.rooms[0]) {
      wall(b, r.x0, r.z0, r.x0, r.z1, WALL_H, -1);
      aoStrips.push({ x0: r.x0 + WALL_T / 2, z0: r.z0, x1: r.x0 + WALL_T / 2, z1: r.z1, w: 0.7 });
    }
    if (room.eastDoor) {
      wall(b, r.x1, r.z0, r.x1, room.eastDoor[0], WALL_H, 1);
      wall(b, r.x1, room.eastDoor[1], r.x1, r.z1, WALL_H, 1);
    } else wall(b, r.x1, r.z0, r.x1, r.z1, WALL_H, 1);
    wall(b, r.x0, r.z1, room.door[0], r.z1, STUB_H, 1);
    wall(b, room.door[1], r.z1, r.x1, r.z1, STUB_H, 1);
    b.at(G.rbox(0.03), COL.trim, (room.door[0] + room.door[1]) / 2, 0.025, r.z1 + 0.45, 0, room.door[1] - room.door[0] - 0.2, 0.03, 0.7);
  }

  // ── Reception interior (desk + first waiting bench are prebuilt)
  const rc = L.rooms[0]?.rect as Rect;
  kit.place((rc.x0 + rc.x1) / 2 + 0.3, rc.z0 + 3.0).desk();
  anchors.desk = { x: (rc.x0 + rc.x1) / 2 + 0.3, z: rc.z0 + 3.0 };
  aoBlobs.push({ x: anchors.desk.x, z: anchors.desk.z, r: 1.5 });
  kit.place(rc.x0 + 1.1, rc.z0 + 0.45).trophyCabinet();
  aoStrips.push({ x0: rc.x0 + 0.3, z0: rc.z0 + 0.75, x1: rc.x0 + 1.9, z1: rc.z0 + 0.75, w: 0.4 });
  kit.place(rc.x0 + 0.55, rc.z1 - 2.0, HALF_PI).bench(2.4);
  anchors.waitBench = { x: rc.x0 + 0.65, z: rc.z1 - 2.0, ry: HALF_PI };
  decals.add('posterA', 0.9, 0.9, trs(rc.x0 + 2.6, 1.6, rc.z0 + WALL_T / 2 + 0.02));
  decals.add('posterB', 0.9, 0.9, trs(rc.x0 + 3.8, 1.6, rc.z0 + WALL_T / 2 + 0.02));
  decals.add('posterC', 0.9, 0.9, trs(rc.x1 - 0.8, 1.6, rc.z0 + WALL_T / 2 + 0.02));
  decals.add('banner', 1.0, 1.0, trs(rc.x0 + WALL_T / 2 + 0.02, 1.55, rc.z0 + 2.2, HALF_PI));
  props.put('cactus_medium_A', rc.x1 - 0.5, rc.z0 + 0.6, 0, 0.85);
  props.put('rug_rectangle_stripes_A', (rc.x0 + rc.x1) / 2 + 0.3, rc.z0 + 4.3, HALF_PI, 0.85, 0.015, 0);
  props.put('lamp_standing', rc.x0 + 0.5, rc.z1 - 0.5, 0, 0.7);
  props.put('cabinet_small_decorated', rc.x1 - 1.6, rc.z0 + 0.45, 0, 0.7);

  // ── Changing room interior
  const cr = L.rooms[1]?.rect as Rect;
  kit.place((cr.x0 + cr.x1) / 2, cr.z0 + 0.4).lockers(6);
  aoStrips.push({ x0: cr.x0 + 0.5, z0: cr.z0 + 0.7, x1: cr.x1 - 0.5, z1: cr.z0 + 0.7, w: 0.45 });
  kit.place((cr.x0 + cr.x1) / 2, (cr.z0 + cr.z1) / 2 - 0.4, 0).bench(2.8, false);
  kit.place((cr.x0 + cr.x1) / 2, (cr.z0 + cr.z1) / 2 + 1.2, 0).bench(2.8, false);
  anchors.lockerBench = { x: (cr.x0 + cr.x1) / 2, z: (cr.z0 + cr.z1) / 2 - 0.4 };
  kit.place(cr.x1 - WALL_T / 2 - 0.1, (cr.z0 + cr.z1) / 2, -HALF_PI).kitRail(4);
  props.put('towelrail', cr.x0 + 0.6, cr.z1 - 0.8, HALF_PI, 0.8);
  props.put('Box_A', cr.x0 + 0.55, cr.z0 + 1.6, 0.2, 1.0);
  kit.place(cr.x1 - 0.45, cr.z1 - 0.5).bin();
  aoBlobs.push({ x: cr.x1 - 0.45, z: cr.z1 - 0.5, r: 0.35 });
  decals.add('banner', 0.9, 0.9, trs(cr.x1 - 0.7, 2.0, cr.z0 + WALL_T / 2 + 0.02));

  // ── plaza: track surface, plants, benches, bins, lights, outside bench
  const tr = L.sprintTrack;
  root.add(floor('tartan', tr, 0.014, 1));
  const laneW = (tr.z1 - tr.z0) / 2;
  for (let i = 0; i <= 2; i++) b.add(flat(tr.x1 - tr.x0, 0.06), 0xf6e7d8, trs((tr.x0 + tr.x1) / 2, 0.022, tr.z0 + i * laneW));
  b.add(flat(0.12, tr.z1 - tr.z0), 0xffffff, trs(tr.x1 - 0.6, 0.022, (tr.z0 + tr.z1) / 2));
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 2; j++) b.add(flat(0.13, (tr.z1 - tr.z0) / 8), (i + j) % 2 ? 0x1d2433 : 0xffffff, trs(tr.x0 + 0.5 + j * 0.13, 0.023, tr.z0 + ((i + 0.5) * (tr.z1 - tr.z0)) / 8));
  anchors.trackStart = { x: tr.x1 - 1.0, z: tr.z0 + laneW / 2 };
  for (const [x, z] of [
    [-4.5, -3.0],
    [-4.5, -4.4],
    [-16.0, 7.6],
    [3.0, 7.2],
  ] as Array<[number, number]>) {
    kit.place(x, z).planter();
    aoBlobs.push({ x, z, r: 0.55 });
  }
  props.put('bench', 0.6, 7.0, 0, 5);
  kit.place(-1.6, 7.3).bin();
  kit.place(9.4, 0.6).bin();
  aoBlobs.push({ x: 9.4, z: 0.6, r: 0.35 }, { x: -1.6, z: 7.3, r: 0.35 });
  props.put('streetlight', 16.3, L.gate.z + 2.0, -HALF_PI, 4, 0, 0.1);
  props.put('streetlight', -5.6, 7.8, 0, 4, 0, 0.1);
  props.put('firehydrant', 16.35, -1.9, 0, 3.5);
  props.put('bush', -16.3, 11.3, 0, 5);
  props.put('bush', 16.3, 11.3, 0, 5);
  kit.place(0, 0).coneStack(7.0, 0.2);
  kit.place(0, 0).coneStack(7.3, 0.5);
  kit.place(-14.0, -2.0, 0).bench(2.2);
  anchors.outsideBench = { x: -14.0, z: -2.0, ry: 0 };
  kit.place(-16.0, -2.0).bin();
  aoBlobs.push({ x: -16.0, z: -2.0, r: 0.35 });

  // ── locked expansions: blueprint ghosts behind construction fences
  const ghostMat = new MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
  const ghostEdge = new MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.75, depthWrite: false });
  for (const gh of L.ghosts) {
    const r = gh.rect;
    const fl = floor('blueprint', r, 0.03, 1);
    (fl.material as MeshLambertMaterial).transparent = true;
    (fl.material as MeshLambertMaterial).depthWrite = false;
    root.add(fl);
    const gb = new Batch();
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    gb.at(G.box(), 0xffffff, (r.x0 + r.x1) / 2, 0.5, r.z0 + 0.1, 0, w, 1.0, 0.16);
    gb.at(G.box(), 0xffffff, r.x0 + 0.08, 0.5, (r.z0 + r.z1) / 2, 0, 0.16, 1.0, d);
    gb.at(G.box(), 0xffffff, r.x1 - 0.08, 0.5, (r.z0 + r.z1) / 2, 0, 0.16, 1.0, d);
    gb.at(G.box(), 0xffffff, (r.x0 + r.x1) / 2 - 0.6, 0.6, (r.z0 + r.z1) / 2, 0.2, 1.4, 1.2, 0.8);
    extra.push(gb.build(ghostMat));
    const eb = new Batch();
    eb.at(G.box(), 0xffffff, (r.x0 + r.x1) / 2, 1.02, r.z0 + 0.1, 0, w, 0.05, 0.2);
    eb.at(G.box(), 0xffffff, r.x0 + 0.08, 1.02, (r.z0 + r.z1) / 2, 0, 0.2, 0.05, d);
    eb.at(G.box(), 0xffffff, r.x1 - 0.08, 1.02, (r.z0 + r.z1) / 2, 0, 0.2, 0.05, d);
    extra.push(eb.build(ghostEdge));
    for (let x = r.x0 + 0.8; x < r.x1 - 0.5; x += 1.55) kit.place(0, 0).barrier(x, r.z1 + 0.35);
    kit.place(r.x1 - 0.6, r.z1 + 0.5).padlockSign();
    anchors['ghost:' + gh.id] = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };
    anchors['ghostSign:' + gh.id] = { x: r.x1 - 0.6, z: r.z1 + 0.5 };
  }
  props.put('Box_A', -14.0, 6.6, 0.4, 1.1);
  props.put('Barrel_A', -14.4, 7.4, 0, 0.7);
  props.put('Pallet_Small_Decorated_A', -5.6, 5.6, 0.2, 0.55);
  kit.place(-15.4, 2.4).planter();
  aoBlobs.push({ x: -15.4, z: 2.4, r: 0.55 });
  kit.place(-15.6, 4.6, Math.PI / 2).bench(2.2);
  anchors.ambientBench = { x: -15.6, z: 4.6, ry: Math.PI / 2 };
  props.put('Pallet_Small_Decorated_A', 9.6, 2.4, 0.3, 0.55);
  // anchors needed by the showcase / view
  anchors.goal = { x: gx0, z: goalZ };
  anchors.shootSpot = { x: gx0 - 0.4, z: goalZ + 3.4 };
  anchors.dribbleStart = { x: (L.dribbleStrip.x0 + L.dribbleStrip.x1) / 2, z: L.dribbleStrip.z1 - 0.5 };
  anchors.passSpotA = { x: L.passDeck.x0 + 1.0, z: L.passDeck.z0 + 3.4 };
  anchors.passSpotB = { x: L.passDeck.x1 - 1.0, z: L.passDeck.z0 + 3.4 };
  return finalize(c, mat);
}

/** World-space position helper for station local coords (rot 0 layouts). */
export interface UnlockGeo {
  center: { x: number; z: number };
  lanes: Array<{ spot: { x: number; z: number }; target: { x: number; z: number } }>;
  basket: { x: number; z: number } | null;
}

/**
 * Builds one unlockable piece (station equipment for `lanes` lanes, or a decor object) as its own group,
 * so it can pop in when bought. Ids match the sim (station / object ids).
 */
export function buildUnlockable(id: string, lanes: number, assets: Assets, L: Layout, mat: Material, geo?: UnlockGeo): Diorama {
  const c = newCtx(assets, L);
  const { kit, props, aoBlobs, b } = c;
  const at = AREA1.objects.find((o) => o.id === id)?.pos ?? { x: 0, z: 0 };
  switch (id) {
    case 'ball_crate': {
      const cx = at.x;
      const cz = at.z;
      props.put('crate', cx, cz, 0.15, 0.45);
      kit.place(0, 0);
      for (let i = 0; i < 6; i++) kit.ball(cx - 0.26 + (i % 3) * 0.26, 0.47 + Math.floor(i / 3) * 0.12, cz - 0.1 + Math.floor(i / 3) * 0.17, 0.26);
      break;
    }
    case 'chairs_2':
      kit.place(at.x, at.z, 0).bench(2.2, false);
      break;
    case 'bench':
      kit.place(at.x, at.z, Math.PI).dugout(3.2);
      aoBlobs.push({ x: at.x, z: at.z, r: 1.6 });
      break;
    case 'flags':
      [-1.5, 0, 1.5].forEach((dx, i) => kit.place(at.x + dx, at.z).flagpole(i % 2 ? 0xffd23f : 0x2f6bff));
      break;
    case 'water_cooler':
      kit.place(at.x, at.z).waterCooler();
      aoBlobs.push({ x: at.x, z: at.z, r: 0.5 });
      break;
    case 'bus_shelter':
      kit.place(at.x, at.z).dugout(1.8);
      break;
    case 'shooting_goal': {
      const sl = L.shootingLane;
      const gx0 = (sl.x0 + sl.x1) / 2;
      const goalZ = sl.z0 + 1.6;
      kit.place(gx0, goalZ).goal(4.2, 1.9, 1.3);
      const nm = netMaterial();
      const back = new Mesh(new PlaneGeometry(4.2, 1.9, 14, 7), nm);
      back.position.set(gx0, 0.95, goalZ - 1.3);
      c.nets.push(back);
      c.extra.push(back);
      for (const sx of [-1, 1]) {
        const side = new Mesh(new PlaneGeometry(1.3, 1.9), nm);
        side.position.set(gx0 + sx * 2.1, 0.95, goalZ - 0.65);
        side.rotation.y = HALF_PI;
        c.extra.push(side);
      }
      const top = new Mesh(new PlaneGeometry(4.2, 1.3), nm);
      top.rotation.x = -HALF_PI;
      top.position.set(gx0, 1.9, goalZ - 0.65);
      c.extra.push(top);
      const bk = geo?.basket ?? { x: sl.x0 + 0.75, z: sl.z1 - 0.8 };
      kit.place(bk.x, bk.z, 0.3).ballCart();
      aoBlobs.push({ x: bk.x, z: bk.z, r: 0.8 });
      for (const l of (geo?.lanes ?? []).slice(0, lanes)) b.add(flat(0.36, 0.36), COL.line, trs(l.spot.x, 0.021, l.spot.z, Math.PI / 4));
      if (lanes > 1) kit.place(sl.x1 - 0.5, (sl.z0 + sl.z1) / 2, -0.5).popUpGoal();
      break;
    }
    case 'dribble_cones': {
      const ls = (geo?.lanes ?? []).slice(0, lanes);
      for (const l of ls) {
        for (let i = 0, z = l.spot.z - 1.0; z > l.target.z + 0.6; z -= 0.9, i++) kit.place(0, 0).cone(l.spot.x + (i % 2 ? 0.3 : -0.3), z);
        kit.place(0, 0).pole(l.target.x, l.target.z + 0.2);
      }
      const ds = L.dribbleStrip;
      if (lanes > 1) kit.place(ds.x1 + 0.55, (ds.z0 + ds.z1) / 2).agilityLadder(4.4);
      const bk = geo?.basket;
      if (bk) {
        kit.place(bk.x, bk.z, 0).ballRack(4);
        aoBlobs.push({ x: bk.x, z: bk.z, r: 0.7 });
      }
      break;
    }
    case 'passing_wall': {
      const ls = (geo?.lanes ?? []).slice(0, lanes);
      for (const l of ls) kit.place(l.target.x, l.target.z - 0.3).reboundBoard(1.8);
      const bk = geo?.basket;
      if (bk) {
        kit.place(bk.x, bk.z, -HALF_PI).ballRack(6);
        aoBlobs.push({ x: bk.x, z: bk.z, r: 0.8 });
      }
      break;
    }
    case 'sprint_track': {
      const ls = (geo?.lanes ?? []).slice(0, lanes);
      for (const l of ls) for (let k = 0; k < 3; k++) kit.place(0, 0).hurdle(l.target.x + 3.2 + k * 3.2, l.spot.z, HALF_PI);
      const tr = L.sprintTrack;
      kit.place(tr.x0 + 1.2, tr.z0 - 0.4).stopwatchStand();
      break;
    }
  }
  return finalize(c, mat);
}

/** Showcase / capture: the whole academy built (base + every unlockable with all lanes). */
export function buildFullDiorama(assets: Assets, L: Layout, mat: Material, geos: Record<string, UnlockGeo>): Diorama {
  const base = buildDiorama(assets, L, mat);
  for (const id of ['ball_crate', 'chairs_2', 'bench', 'flags', 'water_cooler', 'bus_shelter', 'shooting_goal', 'dribble_cones', 'passing_wall', 'sprint_track']) {
    const u = buildUnlockable(id, 2, assets, L, mat, geos[id]);
    base.root.add(u.root);
    base.nets.push(...u.nets);
  }
  return base;
}

let netMat: MeshLambertMaterial | null = null;
function netMaterial(): MeshLambertMaterial {
  if (netMat) return netMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  const t = pattern('blueprint').clone();
  t.image = c;
  t.repeat.set(10, 5);
  t.needsUpdate = true;
  netMat = new MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.35, side: DoubleSide });
  return netMat;
}
