import {
  DynamicDrawUsage,
  ExtrudeGeometry,
  Mesh,
  Shape,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type BufferAttribute,
} from 'three';
import { BALANCE } from '../data/balance';
import type { PadDef, Rarity } from '../data/types';
import { formatCash, t } from '../core/i18n';
import type { Sim } from '../sim/sim';
import type { Trainee } from '../sim/state';
import { lerpAngle } from '../sim/geom';
import { firstName } from '../sim/players';
import type { Hud } from '../ui/hud';
import { icon } from '../ui/icons';
import { LabelLayer, Popups, Projector, type ScreenPoint } from '../ui/labels';
import type { AudioSystem } from './audio';
import { Batch } from './batch';
import { ballGeometry } from './builders/ball';
import { buildBus, buildObject, buildStation, type StationVisual } from './builders/props';
import { buildWorld } from './builders/world';
import { CameraRig } from './camera';
import { Fx } from './fx';
import { G } from './geo';
import { HumanoidRenderer, type Anim, type HumanoidSpec } from './humanoids';
import { makePad, type PadMesh } from './pads';
import { PALETTE } from './palette';
import { TIERS } from './quality';
import type { RenderCore } from './renderer';

const MAX_BALLS = 260;
const MAX_BILLS = 420;
const RARITY_CLS: Record<Rarity, string> = { common: 'r-common', rare: 'r-rare', epic: 'r-epic', wonderkid: 'r-wonderkid' };

interface Pop {
  obj: Object3D;
  t: number;
  dur: number;
}

interface StationView extends StationVisual {
  lanes: number;
  ripple: number;
  rippleX: number;
}

interface CharState {
  phase: number;
  lx: number;
  lz: number;
  yaw: number;
  lastRep: number;
}

const dummy = new Object3D();
const sp: ScreenPoint = { x: 0, y: 0, visible: false };

function easeOutBack(k: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

function tri(p: number): number {
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/** Everything visual: subscribes to sim events for juice and draws interpolated sim state. */
export class GameView {
  readonly rig = new CameraRig();
  readonly projector: Projector;
  readonly labels: LabelLayer;
  readonly popups: Popups;
  private readonly humans: HumanoidRenderer;
  private readonly fx: Fx;
  private readonly balls: InstancedMesh;
  private readonly bills: InstancedMesh;
  private readonly arrow: Group;
  private readonly bus: Group;
  private readonly deskRing: PadMesh;
  private readonly pads = new Map<string, PadMesh>();
  private readonly stations = new Map<string, StationView>();
  private readonly objects = new Map<string, Group>();
  private readonly pops: Pop[] = [];
  private readonly chars = new Map<string, CharState>();
  private readonly spec: HumanoidSpec = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    scale: 1,
    skin: 0,
    hairStyle: 0,
    hairColor: 0,
    face: 0,
    shirt: 0,
    shorts: 0,
    socks: 0,
    shoes: 0,
    anim: 'idle',
    phase: 0,
    t: 0,
    time: 0,
    carrying: false,
  };
  private time = 0;
  private stepT = 0;
  private sway = { x: 0, z: 0, vx: 0, vz: 0 };
  private coachYaw = 0;
  private readonly world: Group;
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private celebrateUntil = 0;
  private ambientT = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly sim: Sim,
    private readonly hud: Hud,
    private readonly audio: AudioSystem,
    uiRoot: HTMLElement,
    private readonly haptic: (ms: number) => void,
  ) {
    const scene = core.scene;
    this.projector = new Projector(this.rig.camera);
    this.labels = new LabelLayer(uiRoot, this.projector);
    this.popups = new Popups(uiRoot, this.projector, icon('coin'));
    this.world = buildWorld(sim.area, core.mat, TIERS[core.tier].props);
    for (const c of this.world.children) c.receiveShadow = true;
    scene.add(this.world);
    this.humans = new HumanoidRenderer(scene, core.charMat);
    this.fx = new Fx(scene);
    this.fx.scale = TIERS[core.tier].particles;

    const ballMat = new MeshLambertMaterial({ vertexColors: true });
    this.balls = new InstancedMesh(ballGeometry(), ballMat, MAX_BALLS);
    this.balls.instanceMatrix.setUsage(DynamicDrawUsage);
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.balls.castShadow = true;
    scene.add(this.balls);

    const bill = new Batch();
    bill.at(G.rbox(0.25), PALETTE.cash, 0, 0, 0, 0, 0.72, 0.09, 0.4);
    bill.at(G.box(), 0xb9ffd6, 0, 0.047, 0, 0, 0.26, 0.004, 0.26);
    bill.at(G.box(), PALETTE.cashDark, 0, 0.047, 0, 0, 0.66, 0.003, 0.05);
    this.bills = new InstancedMesh(bill.geometry(), new MeshLambertMaterial({ vertexColors: true }), MAX_BILLS);
    this.bills.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bills.count = 0;
    this.bills.frustumCulled = false;
    scene.add(this.bills);

    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.62, 0.62);
    shape.lineTo(0.24, 0.62);
    shape.lineTo(0.24, 1.25);
    shape.lineTo(-0.24, 1.25);
    shape.lineTo(-0.24, 0.62);
    shape.lineTo(-0.62, 0.62);
    shape.closePath();
    const arrowGeo = new ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    arrowGeo.translate(0, 0, -0.11);
    this.arrow = new Group();
    const am = new Mesh(arrowGeo, new MeshLambertMaterial({ color: PALETTE.star, emissive: 0x7a5200 }));
    this.arrow.add(am);
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.bus = buildBus(core.mat);
    scene.add(this.bus);

    this.deskRing = makePad(PALETTE.blue, PALETTE.padBase, 1.0, 0.72);
    const ds = sim.area.desk.coachSpot;
    this.deskRing.position.set(ds.x, 0.03, ds.z);
    scene.add(this.deskRing);

    this.syncBuilt(false);
    this.wire();
  }

  // ───────────────────────────── building / syncing ─────────────────────────────

  /** Creates meshes for everything built in the sim that has no visual yet (and lane upgrades). */
  syncBuilt(animate: boolean): void {
    const s = this.sim.state;
    for (const [id, o] of this.sim.world.objects) {
      if (!s.built[id] || this.objects.has(id)) continue;
      const g = buildObject(o.def, this.core.mat);
      this.core.scene.add(g);
      this.objects.set(id, g);
      if (animate) this.pop(g);
    }
    for (const [id, ss] of Object.entries(s.stations)) {
      const cur = this.stations.get(id);
      if (cur && cur.lanes === ss.lanes) continue;
      if (cur) this.core.scene.remove(cur.root);
      const v = buildStation(this.sim.station(id), ss.lanes, this.core.mat);
      this.core.scene.add(v.root);
      this.stations.set(id, { ...v, lanes: ss.lanes, ripple: 0, rippleX: 0 });
      if (animate) this.pop(v.root);
    }
  }

  /** Full rebuild after loading a different save (auth change / reset). */
  resetVisuals(): void {
    for (const g of this.objects.values()) this.core.scene.remove(g);
    for (const v of this.stations.values()) this.core.scene.remove(v.root);
    for (const p of this.pads.values()) this.core.scene.remove(p);
    this.objects.clear();
    this.stations.clear();
    this.pads.clear();
    this.chars.clear();
    this.syncBuilt(false);
    const c = this.sim.state.coach;
    this.rig.snap(c.x, c.z);
  }

  private pop(obj: Object3D): void {
    obj.scale.setScalar(0.01);
    this.pops.push({ obj, t: 0, dur: 0.55 });
  }

  // ───────────────────────────── events → juice ─────────────────────────────

  private wire(): void {
    const ev = this.sim.events;
    ev.on('cashCollected', (e) => {
      this.audio.play('coin');
      this.haptic(12);
      this.popups.text(e.x, 1.2, e.z, '+' + formatCash(e.amount), 'cash');
      this.popups.coins(e.x, 0.4, e.z, this.hud.cashAnchor(), Math.ceil(e.amount / 6), () => {
        this.hud.bumpCash();
        this.audio.play('tick', 1 + Math.random() * 0.2);
      });
    });
    ev.on('unlocked', (e) => {
      this.syncBuilt(true);
      const pad = this.pads.get(e.padId);
      if (pad) {
        this.core.scene.remove(pad);
        this.pads.delete(e.padId);
      }
      this.audio.play('unlock');
      this.audio.play('pop');
      this.haptic(25);
      this.fx.burst(e.x, 0.8, e.z, 60);
      this.rig.shake(0.18);
      this.popups.text(e.x, 2.2, e.z, `+${e.stars} ★`, 'star');
      this.hud.bumpStars();
      if (e.major) {
        const def = this.sim.world.pads.get(e.padId);
        const u = def?.unlock;
        if (u && u.type === 'station') {
          const c = this.sim.station(u.id).def.center;
          this.rig.panTo((c.x + e.x) / 2, (c.z + e.z) / 2);
        }
      }
    });
    ev.on('ballPicked', (e) => {
      if (!e.byStaff) this.audio.play('pick', 1 + e.carry * 0.08);
    });
    ev.on('ballDropped', (e) => {
      if (!e.byStaff) this.audio.play('drop');
    });
    ev.on('signed', (e) => {
      this.audio.play('sign');
      this.haptic(15);
      const tr = this.sim.trainee(e.id);
      if (tr) {
        this.fx.burst(tr.x, 1.2, tr.z, 24, 0.6);
        this.popups.text(tr.x, 2.0, tr.z, '✍ ' + firstName(tr), 'stat');
      }
    });
    ev.on('traineeArrived', (e) => {
      const tr = this.sim.trainee(e.id);
      if (tr && e.id === 1) this.hud.toast(t('toast.first_trainee', { name: firstName(tr) }), 'info');
    });
    ev.on('rep', (e) => {
      const tr = this.sim.trainee(e.traineeId);
      if (!tr) return;
      if (e.gain > 0) this.popups.text(tr.x, 1.9, tr.z, t('popup.stat', { n: e.gain, stat: t('stat.' + e.stat) }), 'stat');
    });
    ev.on('graduated', (e) => {
      const tr = this.sim.trainee(e.id);
      this.audio.play('cheer');
      this.audio.play('register');
      if (tr) {
        this.fx.burst(tr.x, 1.5, tr.z, 70);
        this.hud.toast(t('toast.graduated', { name: firstName(tr), cash: formatCash(e.bonus) }), 'gold');
      }
    });
    ev.on('busArrived', () => this.audio.play('honk'));
    ev.on('levelUp', (e) => {
      this.audio.play('levelup');
      this.hud.toast(t('toast.level_up', { level: e.level }), 'gold');
      const c = this.sim.state.coach;
      this.fx.burst(c.x, 1.6, c.z, 80, 1.1);
      this.celebrateUntil = this.time + 1.2;
    });
    ev.on('staffHired', (e) => {
      this.hud.toast(t('toast.hired', { name: t('staff.' + e.id) }), 'good', 3200);
    });
  }

  // ───────────────────────────── input helpers ─────────────────────────────

  /** World-space direction from the coach towards the cursor's ground point (hold-mouse). */
  mouseDirection(mx: number, my: number, out: { x: number; z: number }): void {
    const r = this.core.canvas.getBoundingClientRect();
    this.ndc.set(((mx - r.left) / r.width) * 2 - 1, -((my - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    out.x = 0;
    out.z = 0;
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.hit)) return;
    const c = this.sim.state.coach;
    const dx = this.hit.x - c.x;
    const dz = this.hit.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) return;
    const m = Math.min(1, d / 1.5);
    out.x = (dx / d) * m;
    out.z = (dz / d) * m;
  }

  resize(w: number, h: number): void {
    this.core.resize(w, h);
    this.rig.resize(w, h);
    this.projector.resize(w, h);
    this.labels.topReserve = h > w ? 175 : 70;
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  private char(key: string, x: number, z: number, yaw: number): CharState {
    let c = this.chars.get(key);
    if (!c) {
      c = { phase: 0, lx: x, lz: z, yaw, lastRep: 0 };
      this.chars.set(key, c);
    }
    return c;
  }

  frame(alpha: number, dt: number): void {
    this.time += dt;
    const s = this.sim.state;
    const sim = this.sim;
    const c = s.coach;
    const cx = c.px + (c.x - c.px) * alpha;
    const cz = c.pz + (c.z - c.pz) * alpha;

    // camera
    const view = BALANCE.camera.baseView + s.stars * BALANCE.camera.viewPerStar;
    this.rig.setView(view);
    if (this.rig.panning && Math.hypot(sim.input.x, sim.input.z) > 0.2) this.rig.cancelPan();
    this.rig.update(dt, cx, cz, c.vx, c.vz);
    if (this.core.sun.castShadow) this.core.followSun(this.rig.focus.x, this.rig.focus.z);

    // pop-in animations
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i] as Pop;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const sc = easeOutBack(k);
      p.obj.scale.set(sc, sc * (1 + Math.sin(k * Math.PI) * 0.15), sc);
      if (k >= 1) {
        p.obj.scale.setScalar(1);
        this.pops.splice(i, 1);
      }
    }

    this.labels.begin();
    this.humans.begin();
    let bi = 0;
    const ballAt = (x: number, y: number, z: number, rot = 0, scale = 0.36): void => {
      if (bi >= MAX_BALLS) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rot, rot * 0.7, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.balls.setMatrixAt(bi++, dummy.matrix);
    };

    // ── coach
    const cs = this.char('coach', cx, cz, c.yaw);
    const moved = Math.hypot(cx - cs.lx, cz - cs.lz);
    cs.phase += moved * 3.1;
    cs.lx = cx;
    cs.lz = cz;
    const speed = Math.hypot(c.vx, c.vz);
    this.coachYaw = lerpAngle(this.coachYaw, c.yaw, 1 - Math.exp(-dt * 16));
    const moving = speed > 0.4;
    if (moving) {
      this.stepT += dt;
      if (this.stepT > 0.16) {
        this.stepT = 0;
        this.fx.puff(cx, cz);
      }
    }
    const coachAnim: Anim = this.time < this.celebrateUntil ? 'celebrate' : moving ? 'run' : 'idle';
    this.drawHuman(cx, 0, cz, this.coachYaw, 1.18, PALETTE.skin[1] as number, 5, PALETTE.coach.cap, 2, PALETTE.coach.top, PALETTE.coach.bottom, PALETTE.white, PALETTE.dark, coachAnim, cs.phase, 0, false);
    // carry stack on the coach's back with spring sway
    {
      const sw = this.sway;
      const k = 60;
      const d = 9;
      sw.vx += (-c.vx * 0.05 - sw.x) * k * dt - sw.vx * d * dt;
      sw.vz += (-c.vz * 0.05 - sw.z) * k * dt - sw.vz * d * dt;
      sw.x += sw.vx * dt;
      sw.z += sw.vz * dt;
      const bx = Math.sin(this.coachYaw) * 0.34;
      const bz = Math.cos(this.coachYaw) * 0.34;
      for (let i = 0; i < c.carry; i++) {
        const f = (i + 1) / Math.max(1, c.carry);
        ballAt(cx + bx + sw.x * f * (i + 1) * 0.5, 0.82 + i * 0.36, cz + bz + sw.z * f * (i + 1) * 0.5, i * 0.7);
      }
    }

    // ── staff
    for (const f of s.staff) {
      const fx = f.px + (f.x - f.px) * alpha;
      const fz = f.pz + (f.z - f.pz) * alpha;
      const st = this.char('staff:' + f.id, fx, fz, f.yaw);
      const m = Math.hypot(fx - st.lx, fz - st.lz);
      st.phase += m * 3.3;
      st.lx = fx;
      st.lz = fz;
      st.yaw = lerpAngle(st.yaw, f.yaw, 1 - Math.exp(-dt * 12));
      this.drawHuman(fx, 0, fz, st.yaw, 1.0, PALETTE.skin[3] as number, 0, PALETTE.hair[0] as number, 4, PALETTE.staffBib, PALETTE.coach.bottom, PALETTE.white, PALETTE.dark, f.moving ? 'walk' : 'idle', st.phase, 0, false);
      const bx = Math.sin(st.yaw) * 0.3;
      const bz = Math.cos(st.yaw) * 0.3;
      for (let i = 0; i < f.carry; i++) ballAt(fx + bx, 0.72 + i * 0.34, fz + bz, i);
    }

    // ── baskets
    for (const [id, ss] of Object.entries(s.stations)) {
      const st = sim.station(id);
      if (!st.basket) continue;
      const n = ss.balls;
      for (let i = 0; i < n; i++) {
        const layer = Math.floor(i / 5);
        const a = (i % 5) * 1.256 + layer * 0.6;
        const r = layer === 0 ? 0.24 : 0.14;
        ballAt(st.basket.x + Math.cos(a) * r, 0.42 + layer * 0.24, st.basket.z + Math.sin(a) * r, i);
      }
    }

    // ── trainees
    const deskT = sim.deskTrainee();
    for (const tr of s.trainees) this.drawTrainee(tr, alpha, dt, ballAt, tr === deskT);

    // ── ambient kids passing a ball (life at t=0)
    this.drawAmbient(dt, ballAt);

    this.balls.count = bi;
    this.balls.instanceMatrix.needsUpdate = true;
    this.humans.end();

    // ── cash piles
    let bn = 0;
    for (const p of s.piles) {
      if (p.amount < 1) continue;
      const count = Math.min(28, Math.max(1, Math.ceil(p.amount / 5)));
      for (let i = 0; i < count && bn < MAX_BILLS; i++) {
        const layer = Math.floor(i / 4);
        const q = i % 4;
        const ox = q % 2 ? 0.38 : -0.38;
        const oz = q < 2 ? -0.22 : 0.22;
        dummy.position.set(p.x + ox, 0.05 + layer * 0.095, p.z + oz);
        dummy.rotation.set(0, ((i * 37) % 10) * 0.03 - 0.15, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.bills.setMatrixAt(bn++, dummy.matrix);
      }
    }
    this.bills.count = bn;
    this.bills.instanceMatrix.needsUpdate = true;

    // ── pads
    this.updatePads();

    // ── desk ring + full tag
    const canSign = sim.canSign();
    this.deskRing.material.uniforms.uProgress!.value = c.deskT;
    this.deskRing.material.uniforms.uTime!.value = this.time;
    this.deskRing.material.uniforms.uGlow!.value = deskT && canSign ? 1 : 0;
    if (deskT && !canSign) {
      const d = sim.area.desk.coachSpot;
      this.labels.place('desk-full', d.x, 1.6, d.z, '', `<div class="tag-full">${t('desk.full')}</div>`);
    }

    // ── locked area sign
    const b = sim.area.bounds;
    this.labels.place('area2', 0, 2.9, b.z0 - 3.1, '', `<div class="area-sign">${icon('lock')}<span>${t('area.2.locked')}<br><small>${t('area.coming_soon')}</small></span></div>`);

    // ── stations: net ripple
    for (const v of this.stations.values()) this.updateNet(v, dt);

    // ── bus
    const busZ = s.bus.pz + (s.bus.z - s.bus.pz) * alpha;
    this.bus.position.set(sim.area.gate.busStop.x, 0, busZ);
    this.bus.visible = s.bus.phase !== 'away';
    if (this.bus.visible) this.bus.position.y = s.bus.phase === 'stopped' ? Math.abs(Math.sin(this.time * 10)) * 0.02 : 0;

    // ── objective arrow
    this.updateArrow(cx, cz);

    this.fx.update(dt, this.time);
    this.labels.end();
    this.hud.update(dt);
    this.core.renderer.render(this.core.scene, this.rig.camera);
  }

  private drawHuman(
    x: number,
    y: number,
    z: number,
    yaw: number,
    scale: number,
    skin: number,
    hairStyle: number,
    hairColor: number,
    face: number,
    shirt: number,
    shorts: number,
    socks: number,
    shoes: number,
    anim: Anim,
    phase: number,
    tt: number,
    carrying: boolean,
  ): void {
    const s = this.spec;
    s.x = x;
    s.y = y;
    s.z = z;
    s.yaw = yaw;
    s.scale = scale;
    s.skin = skin;
    s.hairStyle = hairStyle;
    s.hairColor = hairColor;
    s.face = face;
    s.shirt = shirt;
    s.shorts = shorts;
    s.socks = socks;
    s.shoes = shoes;
    s.anim = anim;
    s.phase = phase;
    s.t = tt;
    s.time = this.time + x * 0.37;
    s.carrying = carrying;
    this.humans.add(s);
  }

  private drawTrainee(tr: Trainee, alpha: number, dt: number, ballAt: (x: number, y: number, z: number, rot?: number, scale?: number) => void, atDesk: boolean): void {
    const sim = this.sim;
    let x = tr.px + (tr.x - tr.px) * alpha;
    let z = tr.pz + (tr.z - tr.pz) * alpha;
    const key = 't:' + tr.id;
    const cs = this.char(key, x, z, tr.yaw);
    let yaw = tr.yaw;
    let anim: Anim = 'idle';
    let tt = 0;
    let y = 0;
    const signed = !(tr.state === 'arriving' || tr.state === 'seated' || tr.state === 'toDesk' || tr.state === 'atDesk');
    if (tr.state === 'training' && tr.stationId) {
      const st = sim.station(tr.stationId);
      const lane = st.lanes[tr.lane];
      if (lane) {
        const p = tr.repActive ? tr.repT : 0;
        const dx = lane.target.x - lane.spot.x;
        const dz = lane.target.z - lane.spot.z;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        const fx = x + ux * 0.32;
        const fz = z + uz * 0.32;
        switch (st.kind) {
          case 'shoot':
          case 'pass': {
            if (tr.repActive) {
              anim = 'kick';
              tt = p;
              const strike = 0.45;
              if (cs.lastRep < strike && p >= strike) this.audio.play('kick', 0.9 + Math.random() * 0.2);
              if (p < strike) ballAt(fx, 0.18, fz);
              else if (st.kind === 'shoot') {
                const k = Math.min(1, (p - strike) / 0.22);
                const bx = fx + (lane.target.x - fx) * k;
                const bz = fz + (lane.target.z - fz) * k;
                const by = 0.18 + Math.sin(k * Math.PI * 0.8) * 1.2 + k * 0.4;
                if (k < 1) ballAt(bx, by, bz, p * 30);
                else ballAt(lane.target.x, Math.max(0.18, 0.9 - (p - strike - 0.22) * 3), lane.target.z, 0);
                if (cs.lastRep < strike + 0.22 && p >= strike + 0.22) {
                  const v = this.stations.get(tr.stationId);
                  if (v) {
                    v.ripple = 1;
                    v.rippleX = lane.target.x - st.def.center.x;
                  }
                  this.audio.play('net');
                  this.fx.burst(lane.target.x, 1.0, lane.target.z, 8, 0.4);
                }
              } else {
                // pass: out to the wall and back
                const out = Math.min(1, (p - strike) / 0.18);
                const back = Math.max(0, Math.min(1, (p - strike - 0.18) / 0.25));
                const k = out - back;
                ballAt(fx + (lane.target.x - fx) * k, 0.2 + Math.sin(k * Math.PI) * 0.2, fz + (lane.target.z - fz) * k, p * 20);
                if (cs.lastRep < strike + 0.18 && p >= strike + 0.18) this.audio.play('kick', 1.3);
              }
            }
            break;
          }
          case 'dribble': {
            if (tr.repActive) {
              const k = tri(p);
              const along = k * len;
              const weave = Math.sin(along * 2.7) * 0.32 * Math.min(1, along);
              const px = -uz;
              const pz = ux;
              x = lane.spot.x + ux * along + px * weave;
              z = lane.spot.z + uz * along + pz * weave;
              yaw = p < 0.5 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
              anim = 'run';
              const dirSign = p < 0.5 ? 1 : -1;
              ballAt(x + ux * 0.35 * dirSign, 0.18, z + uz * 0.35 * dirSign, p * 40);
            } else ballAt(fx, 0.18, fz);
            break;
          }
          case 'sprint': {
            if (tr.repActive) {
              const k = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55;
              x = lane.spot.x + ux * len * k;
              z = lane.spot.z + uz * len * k;
              yaw = p < 0.45 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
              anim = p < 0.45 ? 'run' : 'walk';
            }
            break;
          }
        }
        cs.lastRep = p;
      }
    } else if (tr.state === 'seated') {
      anim = 'sit';
      y = 0;
      yaw = 0;
    } else if (tr.moving) {
      anim = tr.state === 'leaving' ? 'run' : 'walk';
    }
    const moved = Math.hypot(x - cs.lx, z - cs.lz);
    cs.phase += moved * 3.3;
    cs.lx = x;
    cs.lz = z;
    cs.yaw = lerpAngle(cs.yaw, yaw, 1 - Math.exp(-dt * 14));
    const L = tr.look;
    const casual = PALETTE.casual[tr.id % PALETTE.casual.length] as number;
    const casual2 = PALETTE.casual[(tr.id * 3 + 2) % PALETTE.casual.length] as number;
    this.drawHuman(
      x,
      y,
      z,
      cs.yaw,
      0.92 + (tr.age - 12) * 0.03,
      PALETTE.skin[L.skin] as number,
      tr.female && L.hair === 0 ? 2 : L.hair,
      PALETTE.hair[L.hairColor] as number,
      L.face,
      signed ? PALETTE.blue : casual,
      signed ? PALETTE.white : casual2,
      signed ? PALETTE.yellow : PALETTE.white,
      signed ? PALETTE.dark : 0xe94b3c,
      anim,
      cs.phase,
      tt,
      false,
    );
    // label: full card at the desk / arriving, compact OVR chip otherwise
    const ovr = sim.ovr(tr);
    const rc = RARITY_CLS[tr.rarity];
    const headY = 1.75;
    if (atDesk || tr.state === 'arriving' || tr.state === 'toDesk') {
      this.labels.place(key, x, headY + 0.1, z, '', `<div class="card"><span class="nm">${firstName(tr)}</span><span class="pos">${t('pos.' + tr.position)}</span><span class="chip ${rc}">${ovr}</span></div>`);
    } else if (sim.isWaitingForBalls(tr)) {
      this.labels.place(key, x, headY + 0.2, z, '', `<div class="bubble need">${icon('ball')}</div>`);
    } else if (tr.state === 'seated' && tr.waitT > BALANCE.trainee.moodWaitSec) {
      this.labels.place(key, x, headY - 0.2, z, '', `<div class="bubble">😴</div>`);
    } else {
      this.labels.place(key, x, headY, z, '', `<span class="chip ${rc}">${ovr}</span>`);
    }
  }

  private ambientBall = { from: 0, t: 0 };

  private drawAmbient(dt: number, ballAt: (x: number, y: number, z: number, rot?: number, scale?: number) => void): void {
    const kids = this.sim.area.ambientKids;
    const a = kids[0];
    const b = kids[1];
    if (!a || !b) return;
    this.ambientT += dt;
    const ab = this.ambientBall;
    ab.t += dt / 1.4;
    if (ab.t >= 1) {
      ab.t = 0;
      ab.from = 1 - ab.from;
    }
    const from = ab.from === 0 ? a : b;
    const to = ab.from === 0 ? b : a;
    const yawAB = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const yawBA = Math.atan2(-(a.x - b.x), -(a.z - b.z));
    const kickT = ab.t < 0.3 ? ab.t / 0.3 * 0.6 : 1;
    this.drawHuman(a.x, 0, a.z, yawAB, 0.95, PALETTE.skin[2] as number, 1, PALETTE.hair[1] as number, 0, PALETTE.casual[0] as number, PALETTE.casual[5] as number, PALETTE.white, 0xe94b3c, ab.from === 0 ? 'kick' : 'idle', 0, kickT, false);
    this.drawHuman(b.x, 0, b.z, yawBA, 0.9, PALETTE.skin[4] as number, 2, PALETTE.hair[4] as number, 2, PALETTE.casual[4] as number, PALETTE.casual[2] as number, PALETTE.white, 0x339af0, ab.from === 1 ? 'kick' : 'idle', 0, kickT, false);
    const k = Math.max(0, (ab.t - 0.18) / 0.82);
    const x = from.x + (to.x - from.x) * k;
    const z = from.z + (to.z - from.z) * k;
    ballAt(x, 0.18 + Math.sin(k * Math.PI) * 0.9, z, this.ambientT * 8);
  }

  private updatePads(): void {
    const sim = this.sim;
    const s = sim.state;
    const visible = sim.visiblePads();
    const seen = new Set<string>();
    for (const p of visible) {
      seen.add(p.id);
      let m = this.pads.get(p.id);
      if (!m) {
        m = makePad(PALETTE.cash, PALETTE.padBase);
        m.position.set(p.pos.x, 0.03, p.pos.z);
        this.core.scene.add(m);
        this.pads.set(p.id, m);
        this.pop(m);
      }
      const paid = s.pads[p.id]?.paid ?? 0;
      const u = m.material.uniforms;
      u.uProgress!.value = paid / p.cost;
      u.uTime!.value = this.time;
      const afford = s.cash + 1e-6 >= sim.padRemaining(p);
      u.uGlow!.value = afford ? 1 : 0;
      if (sim.paying && s.coach.padId === p.id && Math.random() < 0.5) {
        this.fx.coins.spawn(s.coach.x, 1.4, s.coach.z, p.pos.x, 0.1, p.pos.z, 0.35);
        this.audio.play('coin', 0.8 + (paid / p.cost) * 0.6);
      }
      this.labels.place('pad:' + p.id, p.pos.x, 0.25, p.pos.z + 0.95, '', this.padTag(p, afford));
    }
    for (const [id, m] of this.pads) {
      if (seen.has(id)) continue;
      this.core.scene.remove(m);
      this.pads.delete(id);
    }
  }

  private padTag(p: PadDef, afford: boolean): string {
    const rem = Math.ceil(this.sim.padRemaining(p));
    const name = p.unlock.type === 'staff' ? t('pad.hire', { name: t(p.nameKey) }) : t(p.nameKey);
    return `<div class="pad-tag${afford ? ' ok' : ''}"><span class="ic">${icon(p.icon)}</span>${formatCash(rem)}<span class="nm">${name}</span></div>`;
  }

  private updateNet(v: StationView, dt: number): void {
    if (!v.net || !v.netRest) return;
    if (v.ripple <= 0) return;
    v.ripple = Math.max(0, v.ripple - dt * 1.6);
    const pos = v.net.geometry.attributes.position as BufferAttribute;
    const arr = pos.array as Float32Array;
    const rest = v.netRest;
    const age = 1 - v.ripple;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3] as number;
      const y = rest[i * 3 + 1] as number;
      const d = Math.hypot(x - v.rippleX, y + 0.2);
      const amp = v.ripple * v.ripple * 0.45 * Math.exp(-d * 1.2);
      arr[i * 3 + 2] = (rest[i * 3 + 2] as number) - amp * Math.cos(age * 18 - d * 5);
    }
    pos.needsUpdate = true;
  }

  private updateArrow(cx: number, cz: number): void {
    const o = this.sim.objective;
    const edge = this.hud.edge;
    if (!o) {
      this.arrow.visible = false;
      edge.classList.add('hidden');
      return;
    }
    const near = Math.hypot(o.x - cx, o.z - cz) < o.radius * 0.8;
    this.arrow.visible = !near;
    this.arrow.position.set(o.x, 2.3 + Math.abs(Math.sin(this.time * 4)) * 0.45, o.z);
    this.arrow.rotation.y = this.time * 1.8;
    // edge arrow when off-screen
    const p = this.projector.project(o.x, 0.5, o.z, sp);
    const w = this.projector.w;
    const h = this.projector.h;
    const m = 44;
    const off = !p.visible || p.x < m || p.y < m * 1.6 || p.x > w - m || p.y > h - m;
    if (!off || near) {
      edge.classList.add('hidden');
      return;
    }
    // direction from screen centre (coach) to target
    const cp = this.projector.project(cx, 0.5, cz, { x: 0, y: 0, visible: true });
    let dx = p.x - cp.x;
    let dy = p.y - cp.y;
    if (!p.visible) {
      dx = -dx;
      dy = -dy;
    }
    const ang = Math.atan2(dy, dx);
    const ex = Math.max(m, Math.min(w - m, w / 2 + Math.cos(ang) * w));
    const ey = Math.max(m * 2.2, Math.min(h - m, h / 2 + Math.sin(ang) * h));
    // project onto the screen border along the direction
    const kx = Math.cos(ang) !== 0 ? (Math.cos(ang) > 0 ? w - m - w / 2 : m - w / 2) / Math.cos(ang) : Infinity;
    const ky = Math.sin(ang) !== 0 ? (Math.sin(ang) > 0 ? h - m - h / 2 : m * 2.2 - h / 2) / Math.sin(ang) : Infinity;
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    const px = Number.isFinite(k) ? w / 2 + Math.cos(ang) * k : ex;
    const py = Number.isFinite(k) ? h / 2 + Math.sin(ang) * k : ey;
    edge.style.transform = `translate3d(${px}px, ${py}px, 0) rotate(${ang}rad)`;
    edge.classList.remove('hidden');
  }

  setTierEffects(): void {
    const spec = TIERS[this.core.tier];
    this.fx.scale = spec.particles;
    this.humans.setShadows(spec.shadows);
  }

  /** Debug info for the overlay. */
  stats(): { calls: number; tris: number } {
    const info = this.core.renderer.info.render;
    return { calls: info.calls, tris: info.triangles };
  }
}

