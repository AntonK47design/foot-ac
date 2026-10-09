import { LatheGeometry, Matrix4, Vector2, type BufferGeometry } from 'three';
import { Batch, trs } from '../batch';
import { G } from '../geo';
import { ballGeometry } from './ball';
import type { DecalBatch } from './decals';

/**
 * Coded football props in the KayKit style: bevelled, real proportions, 2–3 tone accents and detail parts.
 * Every function adds to a vertex-colour Batch in world space via a base matrix.
 */
const C = {
  white: 0xf7f7f2,
  offWhite: 0xe6e8ee,
  steel: 0xb9c2cf,
  steelDark: 0x7d8796,
  dark: 0x2b2f3d,
  blue: 0x2f6bff,
  blueDark: 0x1f47b8,
  yellow: 0xffd23f,
  orange: 0xff7a2e,
  orangeDark: 0xd95a12,
  red: 0xe2583e,
  wood: 0xc98b4f,
  woodDark: 0x9a6435,
  green: 0x2e9e5b,
  gold: 0xffc83d,
  goldDark: 0xd99a1a,
  glass: 0xbfe6ff,
};

export class PropKit {
  private base = new Matrix4();
  constructor(
    readonly b: Batch,
    readonly decals: DecalBatch,
  ) {}

  /** Sets the placement for the following parts. */
  place(x: number, z: number, ry = 0, s = 1, y = 0): this {
    this.base = trs(x, y, z, ry, s, s, s);
    return this;
  }

  private add(geo: BufferGeometry, color: number, x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): void {
    this.b.add(geo, color, this.base.clone().multiply(trs(x, y, z, ry, sx, sy, sz, rx, rz)));
  }
  private raw(geo: BufferGeometry, x: number, y: number, z: number, s: number, r = 0): void {
    this.b.addRaw(geo, this.base.clone().multiply(trs(x, y, z, r, s, s, s, r * 0.7)));
  }
  private decal(id: Parameters<DecalBatch['add']>[0], w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0): void {
    this.decals.add(id, w, h, this.base.clone().multiply(trs(x, y, z, ry, 1, 1, 1, rx)));
  }

  ball(x: number, y: number, z: number, s = 0.22): void {
    this.raw(ballGeometry(), x, y, z, s, x * 3 + z);
  }

  /** Full-size training goal frame (net is a separate mesh). Local: mouth faces +z, goal line at z=0. */
  goal(w = 5, h = 2, d = 1.6): void {
    const r = 0.07;
    this.add(G.cyl(12), C.white, -w / 2, h / 2, 0, 0, r * 2, h, r * 2);
    this.add(G.cyl(12), C.white, w / 2, h / 2, 0, 0, r * 2, h, r * 2);
    this.add(G.cyl(12), C.white, 0, h, 0, 0, r * 2, w + r * 2, r * 2, 0, Math.PI / 2);
    for (const sx of [-1, 1]) {
      this.add(G.sphere(10, 6), C.white, (sx * w) / 2, h, 0, 0, r * 2.4, r * 2.4, r * 2.4);
      // back stanchion + ground bar + base weight
      this.add(G.cyl(8), C.steel, (sx * w) / 2, h * 0.5, -d, 0, 0.07, h, 0.07);
      this.add(G.cyl(8), C.steel, (sx * w) / 2, h, -d / 2, 0, 0.06, d, 0.06, Math.PI / 2);
      this.add(G.cyl(8), C.steel, (sx * w) / 2, 0.04, -d / 2, 0, 0.06, d, 0.06, Math.PI / 2);
      this.add(G.rbox(0.25), C.dark, (sx * w) / 2, 0.09, -d * 0.55, 0, 0.32, 0.18, 0.5);
      this.add(G.rbox(0.25), C.yellow, (sx * w) / 2, 0.19, -d * 0.55, 0, 0.33, 0.03, 0.51);
    }
    this.add(G.cyl(8), C.steel, 0, 0.04, -d, 0, 0.06, w, 0.06, 0, Math.PI / 2);
    this.add(G.cyl(8), C.steel, 0, h, -d, 0, 0.06, w, 0.06, 0, Math.PI / 2);
  }

  /** Office safe: steel strongbox with a dial and gold handle. Local: door faces +z. */
  safe(): void {
    this.add(G.rbox(0.08), C.dark, 0, 0.4, 0, 0, 0.8, 0.8, 0.7);
    this.add(G.rbox(0.05), C.steelDark, 0, 0.42, 0.33, 0, 0.66, 0.66, 0.06);
    this.add(G.cyl(16), C.steel, 0.1, 0.48, 0.38, 0, 0.18, 0.04, 0.18, Math.PI / 2);
    this.add(G.rbox(0.03), C.gold, -0.18, 0.42, 0.39, 0, 0.06, 0.22, 0.04);
  }

  /** Small corner flag. */
  cornerFlag(x: number, z: number, color = C.yellow): void {
    this.add(G.cyl(6), C.white, x, 0.45, z, 0, 0.04, 0.9, 0.04);
    this.add(G.box(), color, x + 0.13, 0.8, z, 0, 0.26, 0.18, 0.01);
  }

  popUpGoal(): void {
    const w = 1.5;
    const h = 0.9;
    for (const sx of [-1, 1]) this.add(G.cyl(8), C.orange, (sx * w) / 2, h / 2, 0, 0, 0.07, h, 0.07);
    this.add(G.cyl(8), C.orange, 0, h, 0, 0, 0.07, w, 0.07, 0, Math.PI / 2);
    this.add(G.cyl(8), C.orange, 0, 0.03, -0.6, 0, 0.06, w, 0.06, 0, Math.PI / 2);
    for (const sx of [-1, 1]) this.add(G.cyl(8), C.orangeDark, (sx * w) / 2, h / 2, -0.3, 0, 0.05, 1.05, 0.05, 1.0);
  }

  /** Two-tone training cone with a square base. */
  cone(x: number, z: number, s = 1, color = C.orange): void {
    this.add(G.rbox(0.25), color, x, 0.02 * s, z, 0.3, 0.34 * s, 0.04 * s, 0.34 * s);
    this.add(G.cone(12), color, x, 0.2 * s, z, 0, 0.26 * s, 0.36 * s, 0.26 * s);
    this.add(G.cyl(12), C.white, x, 0.2 * s, z, 0, 0.17 * s, 0.07 * s, 0.17 * s);
  }

  coneStack(x: number, z: number): void {
    for (let i = 0; i < 5; i++) {
      this.add(G.cone(12), i % 2 ? C.yellow : C.orange, x, 0.2 + i * 0.07, z, 0, 0.26, 0.36, 0.26);
    }
    this.add(G.rbox(0.25), C.orange, x, 0.02, z, 0.3, 0.34, 0.04, 0.34);
  }

  /** Slalom pole with weighted base. */
  pole(x: number, z: number): void {
    this.add(G.cyl(12), C.dark, x, 0.05, z, 0, 0.3, 0.1, 0.3);
    this.add(G.cyl(12), C.yellow, x, 0.11, z, 0, 0.32, 0.03, 0.32);
    for (let i = 0; i < 4; i++) this.add(G.cyl(8), i % 2 ? C.white : C.yellow, x, 0.35 + i * 0.3, z, 0, 0.06, 0.3, 0.06);
    this.add(G.sphere(8, 6), C.white, x, 1.52, z, 0, 0.08, 0.08, 0.08);
  }

  /** Free-kick wall mannequin (kid-height silhouette on a spring post). */
  mannequin(x: number, z: number, ry = 0): void {
    const m = this.base.clone();
    this.base = this.base.clone().multiply(trs(x, 0, z, ry));
    this.add(G.rbox(0.25), C.dark, 0, 0.04, 0, 0, 0.56, 0.08, 0.36);
    this.add(G.rbox(0.25), C.yellow, 0, 0.09, 0, 0, 0.5, 0.03, 0.3);
    this.add(G.cyl(8), C.steelDark, 0, 0.32, 0, 0, 0.07, 0.5, 0.07);
    this.add(G.cyl(8), C.steel, 0, 0.6, 0, 0, 0.11, 0.12, 0.11);
    // legs, torso with shoulders, arms, head
    this.add(G.rbox(0.3), C.yellow, -0.1, 0.82, 0, 0, 0.16, 0.42, 0.1);
    this.add(G.rbox(0.3), C.yellow, 0.1, 0.82, 0, 0, 0.16, 0.42, 0.1);
    this.add(G.rbox(0.35), C.yellow, 0, 1.25, 0, 0, 0.5, 0.5, 0.12);
    this.add(G.rbox(0.3), C.dark, 0, 1.25, 0.065, 0, 0.18, 0.18, 0.01);
    this.add(G.rbox(0.4), C.yellow, -0.31, 1.16, 0, 0.0, 0.11, 0.5, 0.1, 0, 0.12);
    this.add(G.rbox(0.4), C.yellow, 0.31, 1.16, 0, 0.0, 0.11, 0.5, 0.1, 0, -0.12);
    this.add(G.sphere(12, 8), C.yellow, 0, 1.68, 0, 0, 0.32, 0.32, 0.26);
    this.base = m;
  }

  /** Wooden rebound board (passing wall). Local: face towards +z. */
  reboundBoard(w = 2.6): void {
    this.add(G.rbox(0.08), C.woodDark, 0, 0.42, 0, 0, w + 0.16, 0.7, 0.14);
    this.add(G.rbox(0.06), C.wood, 0, 0.42, 0.06, 0, w, 0.56, 0.06);
    for (let i = 0; i < 4; i++) this.add(G.box(), C.woodDark, -w / 2 + ((i + 0.5) * w) / 4, 0.42, 0.095, 0, 0.03, 0.56, 0.01);
    this.add(G.rbox(0.06), C.blue, 0, 0.82, 0, 0, w + 0.2, 0.1, 0.18);
    for (const sx of [-1, 1]) {
      this.add(G.rbox(0.1), C.woodDark, (sx * w) / 2.4, 0.3, -0.35, 0, 0.12, 0.6, 0.6, 0.6);
    }
    this.add(G.cyl(20), C.white, 0, 0.42, 0.1, 0, 0.42, 0.02, 0.42, Math.PI / 2);
    this.add(G.cyl(20), C.red, 0, 0.42, 0.105, 0, 0.26, 0.02, 0.26, Math.PI / 2);
    this.add(G.cyl(20), C.white, 0, 0.42, 0.11, 0, 0.1, 0.02, 0.1, Math.PI / 2);
  }

  hurdle(x: number, z: number, ry = 0): void {
    const m = this.base.clone();
    this.base = this.base.clone().multiply(trs(x, 0, z, ry));
    for (const sx of [-0.45, 0.45]) {
      this.add(G.rbox(0.25), C.dark, sx, 0.03, 0, 0, 0.08, 0.06, 0.4);
      this.add(G.cyl(8), C.steel, sx, 0.25, 0, 0, 0.05, 0.5, 0.05);
    }
    this.add(G.rbox(0.25), C.white, 0, 0.5, 0, 0, 1.0, 0.1, 0.05);
    this.add(G.box(), C.red, -0.25, 0.5, 0.027, 0, 0.18, 0.1, 0.005);
    this.add(G.box(), C.red, 0.25, 0.5, 0.027, 0, 0.18, 0.1, 0.005);
    this.base = m;
  }

  /** Metal ball cart on wheels, loaded with balls. */
  ballCart(): void {
    this.add(G.rbox(0.1), C.steelDark, 0, 0.45, 0, 0, 0.9, 0.06, 0.6);
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.27, 0.27]) this.add(G.cyl(8), C.steel, sx, 0.62, sz, 0, 0.035, 0.4, 0.035);
    this.add(G.rbox(0.06), C.blue, 0, 0.82, 0.29, 0, 0.9, 0.05, 0.04);
    this.add(G.rbox(0.06), C.blue, 0, 0.82, -0.29, 0, 0.9, 0.05, 0.04);
    for (const sx of [-0.35, 0.35])
      for (const sz of [-0.22, 0.22]) {
        this.add(G.cyl(10), C.dark, sx, 0.1, sz, 0, 0.18, 0.06, 0.18, 0, Math.PI / 2);
        this.add(G.cyl(8), C.steel, sx, 0.28, sz, 0, 0.03, 0.34, 0.03);
      }
    this.add(G.cyl(8), C.steel, 0.55, 0.85, 0, 0, 0.03, 0.4, 0.03, 0, Math.PI / 2.5);
    for (let i = 0; i < 9; i++) this.ball(-0.3 + (i % 3) * 0.3, 0.6 + Math.floor(i / 3) * 0.14, -0.15 + Math.floor(i / 3) * 0.12 - (i % 2) * 0.05, 0.24);
  }

  /** Wall-mounted / free-standing ball rack. */
  ballRack(n = 6): void {
    this.add(G.rbox(0.1), C.steelDark, 0, 0.35, 0, 0, 1.4, 0.05, 0.36);
    this.add(G.rbox(0.1), C.steelDark, 0, 0.8, 0, 0, 1.4, 0.05, 0.36);
    for (const sx of [-0.68, 0.68]) this.add(G.rbox(0.1), C.blue, sx, 0.55, 0, 0, 0.07, 1.1, 0.4);
    for (let i = 0; i < n; i++) this.ball(-0.48 + (i % 3) * 0.48, 0.49 + Math.floor(i / 3) * 0.45, 0, 0.26);
  }

  floodlight(): void {
    this.add(G.cyl(10), C.steelDark, 0, 0.15, 0, 0, 0.6, 0.3, 0.6);
    this.add(G.cyl(10), C.steel, 0, 3.0, 0, 0, 0.16, 5.6, 0.16);
    this.add(G.rbox(0.1), C.dark, 0, 5.85, 0, 0, 1.3, 0.85, 0.22);
    for (let i = 0; i < 6; i++) this.add(G.rbox(0.2), 0xfff6c8, -0.4 + (i % 3) * 0.4, 5.63 + Math.floor(i / 3) * 0.42, 0.12, 0, 0.3, 0.3, 0.05);
  }

  flagpole(color: number): void {
    this.add(G.cyl(8), C.steelDark, 0, 0.06, 0, 0, 0.3, 0.12, 0.3);
    this.add(G.cyl(8), C.white, 0, 1.6, 0, 0, 0.07, 3.2, 0.07);
    this.add(G.sphere(8, 6), C.gold, 0, 3.24, 0, 0, 0.12, 0.12, 0.12);
    this.add(G.rbox(0.08), color, 0.45, 2.75, 0, 0, 0.85, 0.55, 0.04);
    this.add(G.box(), C.yellow, 0.45, 2.75, 0.022, 0, 0.85, 0.12, 0.005);
  }

  /** Scoreboard on two posts. Local: screen faces +z. */
  scoreboard(): void {
    for (const sx of [-1.1, 1.1]) this.add(G.rbox(0.1), C.steelDark, sx, 1.1, -0.05, 0, 0.16, 2.2, 0.16);
    this.add(G.rbox(0.08), C.dark, 0, 2.55, 0, 0, 2.8, 1.5, 0.22);
    this.add(G.rbox(0.08), C.blue, 0, 3.35, 0, 0, 2.9, 0.18, 0.26);
    this.decal('scoreboard', 2.5, 1.25, 0, 2.55, 0.12);
  }

  /** Tactics whiteboard on an easel. Local: board faces +z. */
  tacticsBoard(): void {
    this.add(G.rbox(0.08), C.steelDark, -0.55, 0.75, -0.15, 0, 0.06, 1.6, 0.06, -0.15);
    this.add(G.rbox(0.08), C.steelDark, 0.55, 0.75, -0.15, 0, 0.06, 1.6, 0.06, -0.15);
    this.add(G.rbox(0.08), C.steelDark, 0, 0.7, -0.55, 0, 0.06, 1.5, 0.06, 0.4);
    this.add(G.rbox(0.06), C.blue, 0, 1.08, 0.02, 0, 1.3, 1.0, 0.07, -0.15);
    this.add(G.rbox(0.06), C.steel, 0, 0.6, 0.12, 0, 1.2, 0.05, 0.14, -0.15);
    this.decal('tactics', 1.15, 0.85, 0, 1.08, 0.065, 0, -0.15);
  }

  /** Glass trophy cabinet with gold cups. Local: front faces +z. */
  trophyCabinet(): void {
    this.add(G.rbox(0.06), C.woodDark, 0, 1.0, 0, 0, 1.6, 2.0, 0.5);
    this.add(G.rbox(0.04), C.wood, 0, 1.0, 0.02, 0, 1.45, 1.85, 0.46);
    for (const y of [0.55, 1.15]) this.add(G.box(), C.woodDark, 0, y, 0.02, 0, 1.45, 0.04, 0.44);
    const cup = trophyGeometry();
    for (const [x, y, s] of [
      [-0.45, 0.57, 1],
      [0, 0.57, 1.3],
      [0.45, 0.57, 0.9],
      [-0.3, 1.17, 1.1],
      [0.3, 1.17, 1],
    ] as Array<[number, number, number]>) {
      this.add(cup, C.gold, x, y, 0.05, 0, s, s, s);
      this.add(G.rbox(0.1), C.dark, x, y + 0.03, 0.05, 0, 0.16 * s, 0.06, 0.16 * s);
    }
    this.add(G.box(), C.glass, 0, 1.0, 0.255, 0, 1.45, 1.85, 0.01);
  }

  /** Row of lockers. Local: doors face +z. */
  lockers(n = 5): void {
    const w = 0.62;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * w;
      const col = i % 2 ? C.blue : C.blueDark;
      this.add(G.rbox(0.05), col, x, 0.95, 0, 0, w - 0.03, 1.9, 0.5);
      for (let k = 0; k < 3; k++) this.add(G.box(), 0x173a9a, x, 1.6 - k * 0.07, 0.255, 0, w * 0.5, 0.025, 0.01);
      this.add(G.rbox(0.3), C.yellow, x + w * 0.3, 1.0, 0.27, 0, 0.05, 0.2, 0.04);
      this.add(G.box(), C.white, x, 1.82, 0.256, 0, 0.18, 0.08, 0.01);
    }
    this.add(G.rbox(0.05), C.dark, 0, 0.04, 0.05, 0, n * w + 0.05, 0.08, 0.52);
  }

  /** Padded waiting / changing bench. Local: seat faces +z. */
  bench(w = 2.2, back = true): void {
    this.add(G.rbox(0.15), C.blue, 0, 0.44, 0, 0, w, 0.14, 0.48);
    this.add(G.rbox(0.15), C.yellow, 0, 0.52, 0.0, 0, w - 0.1, 0.03, 0.4);
    if (back) this.add(G.rbox(0.15), C.blue, 0, 0.8, -0.22, 0, w, 0.5, 0.1);
    for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) {
      this.add(G.rbox(0.1), C.steelDark, sx, 0.2, 0, 0, 0.08, 0.4, 0.4);
      this.add(G.rbox(0.1), C.dark, sx, 0.02, 0, 0, 0.12, 0.04, 0.44);
    }
  }

  /** Sign-up desk with monitor, clipboard and academy front. Local: front (player side) faces +z. */
  desk(): void {
    this.add(G.rbox(0.06), C.white, 0, 0.9, 0, 0, 2.4, 0.08, 0.9);
    this.add(G.rbox(0.08), C.blue, 0, 0.45, 0.32, 0, 2.4, 0.9, 0.22);
    this.add(G.rbox(0.08), C.yellow, 0, 0.62, 0.44, 0, 2.2, 0.1, 0.02);
    this.add(G.rbox(0.08), C.offWhite, -1.1, 0.45, -0.1, 0, 0.16, 0.9, 0.8);
    this.add(G.rbox(0.08), C.offWhite, 1.1, 0.45, -0.1, 0, 0.16, 0.9, 0.8);
    this.add(G.rbox(0.08), C.dark, 0.5, 1.24, -0.15, 0, 0.6, 0.4, 0.05);
    this.add(G.rbox(0.08), 0x5ec8ff, 0.5, 1.24, -0.12, 0, 0.52, 0.32, 0.01);
    this.add(G.cyl(8), C.dark, 0.5, 1.0, -0.17, 0, 0.06, 0.16, 0.06);
    this.add(G.rbox(0.1), C.woodDark, -0.45, 0.96, 0.05, 0.25, 0.32, 0.03, 0.42);
    this.add(G.box(), C.white, -0.45, 0.98, 0.05, 0.25, 0.26, 0.01, 0.34);
    this.add(G.cyl(10), C.red, -0.9, 1.0, -0.1, 0, 0.14, 0.18, 0.14);
    this.ball(0.95, 1.05, 0.1, 0.22);
  }

  /** Coat rail with hanging kit shirts. Local: shirts face +z. */
  kitRail(n = 4): void {
    this.add(G.rbox(0.1), C.steelDark, 0, 1.7, 0, 0, n * 0.55 + 0.3, 0.05, 0.05);
    for (const sx of [-1, 1]) this.add(G.rbox(0.1), C.steelDark, (sx * (n * 0.55 + 0.3)) / 2, 1.65, -0.05, 0, 0.05, 0.12, 0.12);
    for (let i = 0; i < n; i++) this.decal('shirt', 0.5, 0.5, (i - (n - 1) / 2) * 0.55, 1.42, 0.02);
  }

  waterCooler(): void {
    this.add(G.rbox(0.06), C.white, 0, 0.5, 0, 0, 0.5, 1.0, 0.5);
    this.add(G.rbox(0.06), C.blue, 0, 0.7, 0.26, 0, 0.18, 0.08, 0.04);
    this.add(G.cyl(12), 0x8fd3ff, 0, 1.25, 0, 0, 0.38, 0.5, 0.38);
    this.add(G.cyl(12), 0x5ec0f0, 0, 1.53, 0, 0, 0.14, 0.08, 0.14);
  }

  agilityLadder(len = 4, ry = 0): void {
    const m = this.base.clone();
    this.base = this.base.clone().multiply(trs(0, 0, 0, ry));
    for (const sx of [-0.25, 0.25]) this.add(G.box(), C.dark, sx, 0.012, 0, 0, 0.04, 0.02, len);
    for (let i = 0; i <= len / 0.45; i++) this.add(G.rbox(0.3), C.yellow, 0, 0.018, -len / 2 + i * 0.45, 0, 0.5, 0.025, 0.06);
    this.base = m;
  }

  /** Covered dugout bench. Local: open side faces +z. */
  dugout(w = 3.2): void {
    // open-top: it stands in front of the pitch, so a roof would hide the drills from the camera
    this.add(G.rbox(0.1), C.offWhite, 0, 0.55, -0.55, 0, w, 1.1, 0.1);
    this.add(G.rbox(0.1), C.blue, 0, 1.12, -0.55, 0, w + 0.1, 0.08, 0.16);
    for (const sx of [-1, 1]) this.add(G.rbox(0.1), C.offWhite, (sx * w) / 2, 0.45, 0, 0, 0.1, 0.9, 1.1);
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.5 + (i * (w - 1)) / 3;
      this.add(G.rbox(0.25), C.blue, x, 0.48, -0.25, 0, 0.55, 0.1, 0.45);
      this.add(G.rbox(0.25), C.blue, x, 0.75, -0.47, 0, 0.55, 0.5, 0.08);
    }
  }

  /** Low pitch fence segment with academy-colour boards. */
  fence(x0: number, z0: number, x1: number, z1: number): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz, dx);
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.add(G.cyl(8), C.steel, x0 + dx * t, 0.5, z0 + dz * t, 0, 0.07, 1.0, 0.07);
      this.add(G.sphere(8, 6), C.steel, x0 + dx * t, 1.0, z0 + dz * t, 0, 0.09, 0.09, 0.09);
    }
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    this.add(G.rbox(0.03), C.blue, mx, 0.3, mz, ry, len, 0.4, 0.05);
    this.add(G.box(), C.yellow, mx, 0.32, mz, ry, len, 0.08, 0.06);
    this.add(G.cyl(6), C.steel, mx, 0.95, mz, ry, 0.04, len, 0.04, 0, Math.PI / 2);
  }

  /** Orange/white construction barrier. */
  barrier(x: number, z: number, ry = 0): void {
    const m = this.base.clone();
    this.base = this.base.clone().multiply(trs(x, 0, z, ry));
    for (const sx of [-0.7, 0.7]) {
      this.add(G.rbox(0.2), C.dark, sx, 0.04, 0, 0, 0.12, 0.08, 0.45);
      this.add(G.rbox(0.2), C.white, sx, 0.45, 0, 0, 0.08, 0.8, 0.08);
    }
    for (let i = 0; i < 5; i++) this.add(G.box(), i % 2 ? C.white : C.orange, -0.64 + i * 0.32, 0.68, 0, 0, 0.32, 0.26, 0.05);
    this.base = m;
  }

  /** Padlock sign on a post (price is a world-UI label). */
  padlockSign(): void {
    this.add(G.rbox(0.1), C.woodDark, 0, 0.7, 0, 0, 0.12, 1.4, 0.12);
    this.add(G.rbox(0.1), C.yellow, 0, 1.45, 0.05, 0, 1.0, 0.7, 0.08);
    this.add(G.rbox(0.25), C.dark, 0, 1.42, 0.1, 0, 0.36, 0.3, 0.06);
    this.add(G.cyl(10), C.dark, 0, 1.62, 0.1, 0, 0.26, 0.04, 0.26, Math.PI / 2);
    this.add(G.cyl(10), C.yellow, 0, 1.62, 0.1, 0, 0.14, 0.05, 0.14, Math.PI / 2);
  }

  /** Bus stop shelter post. */
  busStopSign(): void {
    this.add(G.cyl(8), C.steel, 0, 1.2, 0, 0, 0.08, 2.4, 0.08);
    this.add(G.cyl(18), C.blue, 0, 2.4, 0, 0, 0.62, 0.08, 0.62, Math.PI / 2);
    this.add(G.cyl(18), C.white, 0, 2.4, 0.045, 0, 0.42, 0.02, 0.42, Math.PI / 2);
    this.add(G.rbox(0.1), C.yellow, 0, 2.4, 0.06, 0, 0.18, 0.18, 0.01);
  }

  /** Plant in a pot (academy planter). */
  planter(): void {
    this.add(G.rbox(0.2), C.blue, 0, 0.25, 0, 0, 0.6, 0.5, 0.6);
    this.add(G.rbox(0.2), C.yellow, 0, 0.47, 0, 0, 0.64, 0.06, 0.64);
    this.add(G.ico(1), 0x3fae4f, 0, 0.85, 0, 0.3, 0.75, 0.7, 0.75);
    this.add(G.ico(1), 0x58c25a, 0.15, 1.15, -0.05, 0.8, 0.45, 0.45, 0.45);
  }

  /** Academy bin with lid. */
  bin(): void {
    this.add(G.rbox(0.2), C.blue, 0, 0.36, 0, 0, 0.46, 0.72, 0.46);
    this.add(G.rbox(0.2), C.yellow, 0, 0.75, 0, 0, 0.5, 0.08, 0.5);
    this.add(G.rbox(0.3), C.dark, 0, 0.8, 0, 0, 0.18, 0.04, 0.06);
  }

  stopwatchStand(): void {
    this.add(G.rbox(0.2), C.dark, 0, 0.04, 0, 0, 0.4, 0.08, 0.4);
    this.add(G.cyl(8), C.steel, 0, 0.6, 0, 0, 0.05, 1.1, 0.05);
    this.add(G.cyl(16), C.red, 0, 1.25, 0, 0, 0.42, 0.1, 0.42, Math.PI / 2);
    this.add(G.cyl(16), C.white, 0, 1.25, 0.045, 0, 0.32, 0.02, 0.32, Math.PI / 2);
    this.add(G.cyl(8), C.red, 0, 1.5, 0, 0, 0.08, 0.1, 0.08);
  }
}

let cupGeo: BufferGeometry | null = null;
function trophyGeometry(): BufferGeometry {
  if (cupGeo) return cupGeo;
  const pts = [
    [0.0, 0],
    [0.09, 0],
    [0.09, 0.03],
    [0.03, 0.06],
    [0.025, 0.14],
    [0.07, 0.17],
    [0.1, 0.24],
    [0.11, 0.32],
    [0.0, 0.32],
  ].map(([x, y]) => new Vector2(x, y));
  cupGeo = new LatheGeometry(pts, 14);
  return cupGeo;
}

