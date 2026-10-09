import {
  BufferAttribute,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  CircleGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { ObjectDef } from '../../data/types';
import type { StationGeo } from '../../sim/world';
import { Batch, trs } from '../batch';
import { G } from '../geo';
import { PALETTE } from '../palette';
import { ballGeometry } from './ball';

const HALF_PI = Math.PI / 2;

let netMat: MeshLambertMaterial | null = null;
function netMaterial(): MeshLambertMaterial {
  if (netMat) return netMat;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 64);
    ctx.moveTo(0, i);
    ctx.lineTo(64, i);
    ctx.stroke();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(6, 3);
  netMat = new MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: DoubleSide, depthWrite: true });
  return netMat;
}

function flat(w: number, d: number): PlaneGeometry {
  const g = new PlaneGeometry(w, d);
  g.rotateX(-HALF_PI);
  return g;
}

function basket(b: Batch, x: number, z: number): void {
  b.at(G.cyl(14), PALETTE.blue, x, 0.22, z, 0, 0.95, 0.44, 0.95);
  b.at(G.cyl(14), PALETTE.yellow, x, 0.46, z, 0, 1.0, 0.07, 1.0);
  b.at(G.cyl(14), 0x1d3a8a, x, 0.45, z, 0, 0.84, 0.06, 0.84);
}

function spot(b: Batch, x: number, z: number): void {
  const d = new CircleGeometry(0.2, 14);
  d.rotateX(-HALF_PI);
  b.add(d, PALETTE.white, trs(x, 0.014, z));
}

/** Local-space positions (relative to station centre). */
export interface StationVisual {
  root: Group;
  /** Back net plane for the ripple effect (shooting goal only). */
  net: Mesh | null;
  netRest: Float32Array | null;
}

export function buildStation(st: StationGeo, lanes: number, mat: Material): StationVisual {
  const def = st.def;
  const root = new Group();
  root.position.set(def.center.x, 0, def.center.z);
  root.rotation.y = def.rot * HALF_PI;
  const b = new Batch();
  let net: Mesh | null = null;
  let netRest: Float32Array | null = null;
  const laneDefs = def.lanes.slice(0, lanes);
  switch (st.kind) {
    case 'shoot': {
      const gw = 4.6;
      const gh = 2.0;
      const gz = -3.4;
      const depth = 1.5;
      const post = 0xffffff;
      b.at(G.cyl(10), post, -gw / 2, gh / 2, gz, 0, 0.16, gh, 0.16);
      b.at(G.cyl(10), post, gw / 2, gh / 2, gz, 0, 0.16, gh, 0.16);
      b.at(G.cyl(10), post, 0, gh, gz, 0, 0.16, gw + 0.16, 0.16, 0, HALF_PI);
      b.at(G.cyl(6), 0xdde3ea, -gw / 2, gh * 0.5, gz - depth, 0, 0.08, gh, 0.08);
      b.at(G.cyl(6), 0xdde3ea, gw / 2, gh * 0.5, gz - depth, 0, 0.08, gh, 0.08);
      // goal-area box line + penalty spot(s)
      b.add(flat(gw + 2.4, 0.1), PALETTE.lines, trs(0, 0.013, gz + 1.9));
      b.add(flat(0.1, 1.9), PALETTE.lines, trs(-(gw + 2.4) / 2, 0.013, gz + 0.95));
      b.add(flat(0.1, 1.9), PALETTE.lines, trs((gw + 2.4) / 2, 0.013, gz + 0.95));
      for (const l of laneDefs) spot(b, l.spot.x, l.spot.z);
      if (def.basket) basket(b, def.basket.x, def.basket.z);
      // net: sides + top static, back plane animated
      const nm = netMaterial();
      const sides = new Group();
      const side = new PlaneGeometry(depth, gh);
      const left = new Mesh(side, nm);
      left.position.set(-gw / 2, gh / 2, gz - depth / 2);
      left.rotation.y = HALF_PI;
      const right = left.clone();
      right.position.x = gw / 2;
      const top = new Mesh(new PlaneGeometry(gw, depth), nm);
      top.rotation.x = -HALF_PI;
      top.position.set(0, gh, gz - depth / 2);
      sides.add(left, right, top);
      root.add(sides);
      const back = new PlaneGeometry(gw, gh, 12, 6);
      net = new Mesh(back, nm);
      net.position.set(0, gh / 2, gz - depth);
      netRest = Float32Array.from((back.attributes.position as BufferAttribute).array as Float32Array);
      root.add(net);
      break;
    }
    case 'dribble': {
      laneDefs.forEach((l) => {
        b.add(flat(1.0, 0.1), PALETTE.lines, trs(l.spot.x, 0.013, l.spot.z - 0.6));
        let side = 1;
        for (let z = l.spot.z - 1.4; z > l.target.z + 0.4; z -= 1.15) {
          const x = l.spot.x + side * 0.28;
          b.at(G.cone(10), PALETTE.cone, x, 0.27, z, 0, 0.36, 0.54, 0.36);
          b.at(G.cyl(10), PALETTE.white, x, 0.26, z, 0, 0.27, 0.07, 0.27);
          b.at(G.cyl(10), PALETTE.cone, x, 0.015, z, 0, 0.5, 0.03, 0.5);
          side = -side;
        }
        b.at(G.cyl(6), PALETTE.white, l.target.x, 0.6, l.target.z, 0, 0.05, 1.2, 0.05);
        b.at(G.box(), PALETTE.yellow, l.target.x + 0.22, 1.05, l.target.z, 0, 0.4, 0.26, 0.03);
      });
      if (def.basket) basket(b, def.basket.x, def.basket.z);
      break;
    }
    case 'pass': {
      const wz = -3.55;
      b.at(G.rbox(0.08), PALETTE.blue, 0, 0.6, wz, 0, 5.0, 1.15, 0.36);
      b.at(G.rbox(0.08), PALETTE.yellow, 0, 1.22, wz, 0, 5.1, 0.12, 0.42);
      for (const x of [-2.2, 0, 2.2]) b.at(G.box(), PALETTE.woodDark, x, 0.45, wz - 0.4, 0, 0.14, 0.9, 0.5, 0.5);
      for (const l of laneDefs) {
        const ring = new RingGeometry(0.22, 0.34, 20);
        b.add(ring, PALETTE.white, trs(l.target.x, 0.55, wz + 0.19));
        const dot = new CircleGeometry(0.12, 14);
        b.add(dot, PALETTE.yellow, trs(l.target.x, 0.55, wz + 0.19));
        spot(b, l.spot.x, l.spot.z);
      }
      if (def.basket) basket(b, def.basket.x, def.basket.z);
      break;
    }
    case 'sprint': {
      const len = 13.6;
      const lw = 1.2;
      const n = def.lanes.length;
      const total = lanes * lw + 0.4;
      const cx = (lanes - 1) * lw * 0.5;
      b.add(flat(total, len), PALETTE.track, trs(cx, 0.01, 0));
      for (let i = 0; i <= lanes; i++) b.add(flat(0.07, len), PALETTE.lines, trs(-lw / 2 + i * lw, 0.014, 0));
      b.add(flat(total, 0.12), PALETTE.lines, trs(cx, 0.014, 5.6));
      // checkered finish
      for (let i = 0; i < lanes * 4; i++) {
        for (let j = 0; j < 2; j++) {
          b.add(flat(lw / 4, 0.3), (i + j) % 2 ? PALETTE.dark : PALETTE.white, trs(-lw / 2 + (i + 0.5) * (lw / 4), 0.015, -5.8 - j * 0.3));
        }
      }
      void n;
      break;
    }
  }
  const mesh = b.build(mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return { root, net, netRest };
}

/** Builds a built object (crate, desk, chairs, decor, shelter). World-positioned group. */
export function buildObject(o: ObjectDef, mat: Material): Group {
  const root = new Group();
  root.position.set(o.pos.x, 0, o.pos.z);
  root.rotation.y = o.rot * HALF_PI;
  const b = new Batch();
  const ball = ballGeometry();
  switch (o.kind) {
    case 'crate': {
      b.at(G.rbox(0.08), PALETTE.wood, 0, 0.38, 0, 0, 1.4, 0.76, 1.1);
      for (const y of [0.18, 0.52]) {
        b.at(G.box(), PALETTE.woodDark, 0, y, 0.56, 0, 1.42, 0.08, 0.02);
        b.at(G.box(), PALETTE.woodDark, 0, y, -0.56, 0, 1.42, 0.08, 0.02);
      }
      const spots: Array<[number, number, number]> = [
        [-0.42, 0.85, -0.22],
        [0.0, 0.88, -0.25],
        [0.42, 0.85, -0.2],
        [-0.25, 0.86, 0.2],
        [0.22, 0.87, 0.22],
        [0.0, 1.12, 0.0],
        [-0.3, 1.08, 0.0],
      ];
      for (const [x, y, z] of spots) b.addRaw(ball, trs(x, y, z, x * 3, 0.42, 0.42, 0.42));
      break;
    }
    case 'desk': {
      b.at(G.rbox(0.06), PALETTE.white, 0, 0.78, 0, 0, 2.3, 0.1, 0.95);
      b.at(G.rbox(0.06), PALETTE.blue, 0, 0.42, 0.3, 0, 2.2, 0.72, 0.12);
      b.at(G.rbox(0.06), PALETTE.yellow, 0, 0.5, 0.37, 0, 1.0, 0.18, 0.02);
      for (const x of [-1.05, 1.05]) b.at(G.box(), PALETTE.metal, x, 0.38, -0.35, 0, 0.08, 0.76, 0.08);
      // clipboard + pen + whistle cup
      b.at(G.box(), PALETTE.woodDark, -0.4, 0.85, -0.05, 0.2, 0.42, 0.03, 0.55);
      b.at(G.box(), PALETTE.white, -0.4, 0.87, -0.05, 0.2, 0.34, 0.02, 0.44);
      b.at(G.cyl(8), PALETTE.red, 0.55, 0.92, 0.05, 0, 0.18, 0.22, 0.18);
      // flag pole with academy flag
      b.at(G.cyl(6), PALETTE.metal, 1.35, 1.3, -0.5, 0, 0.06, 2.6, 0.06);
      b.at(G.box(), PALETTE.blue, 1.35, 2.25, -0.95, 0, 0.03, 0.55, 0.8);
      b.at(G.box(), PALETTE.yellow, 1.36, 2.25, -0.95, 0, 0.03, 0.18, 0.8);
      break;
    }
    case 'chairs': {
      for (const s of o.seats ?? []) {
        const x = s.x - o.pos.x;
        const z = s.z - o.pos.z;
        b.at(G.rbox(0.1), PALETTE.blue, x, 0.42, z, 0, 0.5, 0.08, 0.48);
        b.at(G.rbox(0.1), PALETTE.blue, x, 0.72, z + 0.24, 0, 0.5, 0.5, 0.07);
        for (const dx of [-0.2, 0.2]) for (const dz of [-0.18, 0.18]) b.at(G.box(), PALETTE.metal, x + dx, 0.2, z + dz, 0, 0.04, 0.4, 0.04);
      }
      break;
    }
    case 'shelter': {
      b.at(G.rbox(0.1), PALETTE.blue, 0, 2.3, 0, 0, 3.6, 0.16, 1.6);
      b.at(G.box(), PALETTE.yellow, 0, 2.2, 0.8, 0, 3.6, 0.12, 0.05);
      for (const x of [-1.6, 1.6]) b.at(G.box(), PALETTE.metal, x, 1.15, 0.5, 0, 0.1, 2.3, 0.1);
      b.at(G.box(), 0xbfe6ff, 0, 1.2, 0.55, 0, 3.2, 1.6, 0.05);
      b.at(G.rbox(0.05), PALETTE.wood, 0, 0.45, 0.2, 0, 2.6, 0.08, 0.45);
      break;
    }
    case 'decor': {
      if (o.variant === 'bench') {
        b.at(G.rbox(0.05), PALETTE.wood, 0, 0.45, 0, 0, 2.4, 0.09, 0.5);
        b.at(G.rbox(0.05), PALETTE.wood, 0, 0.78, 0.22, 0, 2.4, 0.3, 0.07);
        for (const x of [-1, 1]) b.at(G.box(), PALETTE.dark, x, 0.22, 0, 0, 0.08, 0.45, 0.45);
        b.at(G.cyl(8), PALETTE.blue, -0.6, 0.62, -0.05, 0, 0.16, 0.28, 0.16);
        b.addRaw(ball, trs(0.7, 0.62, -0.05, 0, 0.3, 0.3, 0.3));
      } else if (o.variant === 'flags') {
        const w = 26;
        for (const x of [-w / 2, w / 2]) {
          b.at(G.cyl(6), PALETTE.white, x, 1.6, 0, 0, 0.1, 3.2, 0.1);
          b.at(G.sphere(8, 6), PALETTE.yellow, x, 3.25, 0, 0, 0.22, 0.22, 0.22);
        }
        const cols = [PALETTE.blue, PALETTE.yellow, PALETTE.white, PALETTE.red];
        const n = 26;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const x = -w / 2 + t * w;
          const y = 3.0 - Math.sin(t * Math.PI) * 0.6;
          b.at(G.cone(3), cols[i % cols.length] as number, x, y - 0.22, 0, 0, 0.42, 0.42, 0.06, Math.PI);
        }
        b.at(G.cyl(4), PALETTE.white, 0, 2.7, 0, 0, 0.02, w, 0.02, 0, HALF_PI);
      } else if (o.variant === 'cooler') {
        b.at(G.rbox(0.05), PALETTE.white, 0, 0.45, 0, 0, 0.55, 0.9, 0.55);
        b.at(G.cyl(12), 0x5ec8ff, 0, 1.15, 0, 0, 0.42, 0.55, 0.42);
        b.at(G.cyl(12), 0x2f9be0, 0, 1.47, 0, 0, 0.18, 0.1, 0.18);
        b.at(G.box(), PALETTE.blue, 0, 0.62, -0.28, 0, 0.12, 0.08, 0.06);
      }
      break;
    }
  }
  if (!b.empty) {
    const mesh = b.build(mat);
    mesh.castShadow = true;
    root.add(mesh);
  }
  return root;
}

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
