import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  DoubleSide,
  type BufferGeometry,
  type Scene,
} from 'three';
import { G } from './geo';
import { PALETTE } from './palette';
import { Batch } from './batch';

const dummy = new Object3D();
const tmpColor = new Color();

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
  life: number;
  max: number;
  size: number;
  color: number;
}

/** Pooled instanced particle system (confetti, dust, sparkles). */
class Particles {
  readonly mesh: InstancedMesh;
  private readonly ps: Particle[] = [];
  private readonly cap: number;
  constructor(scene: Scene, geo: BufferGeometry, cap: number, private readonly gravity: number, private readonly kind: 'confetti' | 'dust') {
    const mat =
      kind === 'confetti'
        ? new MeshBasicMaterial({ side: DoubleSide })
        : new MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    this.mesh = new InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, tmpColor.set(0xffffff));
    this.cap = cap;
    scene.add(this.mesh);
  }
  spawn(p: Particle): void {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push(p);
  }
  update(dt: number): void {
    let n = 0;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i] as Particle;
      p.life += dt;
      if (p.life >= p.max) {
        this.ps.splice(i, 1);
        continue;
      }
      p.vy -= this.gravity * dt;
      if (this.kind === 'confetti') {
        p.vx *= 0.985;
        p.vz *= 0.985;
        if (p.vy < -2.2) p.vy = -2.2;
      } else {
        p.vx *= 0.92;
        p.vz *= 0.92;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      p.rx += p.spin * dt;
      p.ry += p.spin * 0.7 * dt;
    }
    for (const p of this.ps) {
      const k = p.life / p.max;
      const s = this.kind === 'dust' ? p.size * (0.6 + k * 1.2) * (1 - k) : p.size * (k > 0.8 ? (1 - k) * 5 : 1);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, tmpColor.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

interface Coin {
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  h: number;
}

/** Pooled gold coins arcing from A to B (cash draining into pads). */
class Coins {
  readonly mesh: InstancedMesh;
  private readonly coins: Coin[] = [];
  constructor(scene: Scene) {
    const b = new Batch();
    b.at(G.cyl(12), PALETTE.coin, 0, 0, 0, 0, 0.32, 0.06, 0.32, Math.PI / 2);
    b.at(G.cyl(12), 0xffe58a, 0, 0, 0.032, 0, 0.2, 0.01, 0.2, Math.PI / 2);
    const mat = new MeshLambertMaterial({ vertexColors: true, emissive: 0x553300 });
    this.mesh = new InstancedMesh(b.geometry(), mat, 48);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  spawn(sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, dur: number): void {
    if (this.coins.length >= 48) return;
    this.coins.push({ sx, sy, sz, tx, ty, tz, t: 0, dur, h: 1.2 + Math.random() * 0.6 });
  }
  update(dt: number, time: number): void {
    let n = 0;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i] as Coin;
      c.t += dt;
      if (c.t >= c.dur) this.coins.splice(i, 1);
    }
    for (const c of this.coins) {
      const k = c.t / c.dur;
      dummy.position.set(c.sx + (c.tx - c.sx) * k, c.sy + (c.ty - c.sy) * k + Math.sin(k * Math.PI) * c.h, c.sz + (c.tz - c.sz) * k);
      dummy.rotation.set(0, time * 8 + n, 0);
      dummy.scale.setScalar(1 - k * 0.3);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n++, dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const CONFETTI_COLORS = [PALETTE.blue, PALETTE.yellow, PALETTE.red, PALETTE.cash, PALETTE.purple, 0xffffff, PALETTE.orange];

/** All world-space juice: confetti bursts, footstep dust, coin arcs. */
export class Fx {
  private readonly confetti: Particles;
  private readonly dust: Particles;
  readonly coins: Coins;
  scale = 1;

  constructor(scene: Scene) {
    this.confetti = new Particles(scene, new PlaneGeometry(0.14, 0.09), 260, 6, 'confetti');
    this.dust = new Particles(scene, G.ico(0), 80, -0.6, 'dust');
    this.coins = new Coins(scene);
  }

  burst(x: number, y: number, z: number, count = 50, power = 1): void {
    const n = Math.round(count * this.scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 3) * power;
      this.confetti.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * sp,
        vy: (4 + Math.random() * 4) * power,
        vz: Math.sin(a) * sp,
        rx: Math.random() * 6,
        ry: Math.random() * 6,
        spin: 4 + Math.random() * 10,
        life: 0,
        max: 1.6 + Math.random() * 0.8,
        size: 1,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length] as number,
      });
    }
  }

  puff(x: number, z: number, size = 0.22): void {
    if (Math.random() > this.scale) return;
    this.dust.spawn({
      x: x + (Math.random() - 0.5) * 0.2,
      y: 0.08,
      z: z + (Math.random() - 0.5) * 0.2,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 0.3,
      vz: (Math.random() - 0.5) * 0.8,
      rx: 0,
      ry: 0,
      spin: 0,
      life: 0,
      max: 0.5,
      size,
      color: 0xf1ead8,
    });
  }

  update(dt: number, time: number): void {
    this.confetti.update(dt);
    this.dust.update(dt);
    this.coins.update(dt, time);
  }
}

