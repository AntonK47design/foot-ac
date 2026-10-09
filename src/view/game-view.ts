import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Plane,
  Raycaster,
  RingGeometry,
  Shape,
  Vector2,
  Vector3,
  type BufferAttribute,
} from 'three';
import { BALANCE } from '../data/balance';
import { AREA1_LAYOUT } from '../data/areas/area1-layout';
import type { IconId, PadDef, Rarity } from '../data/types';
import { formatCash, hasKey, t } from '../core/i18n';
import type { Sim } from '../sim/sim';
import type { Trainee } from '../sim/state';
import { lerpAngle } from '../sim/geom';
import { firstName } from '../sim/players';
import type { Hud } from '../ui/hud';
import { icon } from '../ui/icons';
import { LabelLayer, Popups, Projector, type ScreenPoint } from '../ui/labels';
import type { Assets, CharacterKey } from './assets';
import type { AudioSystem } from './audio';
import { Batch } from './batch';
import { ballGeometry } from './builders/ball';
import { DecalBatch } from './builders/decals';
import { buildDiorama, buildUnlockable, type UnlockGeo } from './builders/diorama';
import { PropKit } from './builders/football';
import { buildBus } from './builders/bus';
import { CameraRig } from './camera';
import { Character, KITS, casualKit, type CharAnim } from './characters';
import { Fx } from './fx';
import { G } from './geo';
import { IconRenderer } from './icon-render';
import { makePad, type PadMesh } from './pads';
import { PALETTE } from './palette';
import { TIERS } from './quality';
import type { RenderCore } from './renderer';

const MAX_BALLS = 260;
const MAX_BILLS = 420;
const MAX_RINGS = 64;
const KID_SCALE = 1.6;
/** Root lift while sitting so the hips rest on the bench seat (bench top 0.53 m, sit-clip hips ≈ 0.05 m). */
const SIT_LIFT = 0.47;
const ADULT_SCALE = 1.85;
const HEAD_Y = 1.45;
const RARITY_CLS: Record<Rarity, string> = { common: 'r-common', rare: 'r-rare', epic: 'r-epic', wonderkid: 'r-wonderkid' };
const RARITY_COL: Record<Rarity, number> = { common: 0xa7b0be, rare: 0x3d8bff, epic: 0xa35cff, wonderkid: 0xffc83d };
const KIDS_M: CharacterKey[] = ['male-a', 'male-e', 'male-f'];
const KIDS_F: CharacterKey[] = ['female-b', 'female-c', 'female-d', 'female-e', 'female-f'];
/** Kenney models face +z; sim yaw points a model's -z axis, so add π. */
const YAW_OFFSET = Math.PI;

interface Pop {
  obj: Object3D;
  t: number;
  dur: number;
}

interface UnlockView {
  root: Group;
  lanes: number;
  nets: Mesh[];
  netRest: Float32Array[];
  ripple: number;
  rippleX: number;
}

interface PadView {
  pad: PadMesh;
  ghost: Group;
}

interface Actor {
  c: Character;
  lx: number;
  lz: number;
  yaw: number;
  lastRep: number;
  seen: number;
  /** Current lift (m): the sit clip puts the hips at floor level, benches are ~0.5 m high. */
  y?: number;
}

const dummy = new Object3D();
const sp: ScreenPoint = { x: 0, y: 0, visible: false };

function easeOutBack(k: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

/** Short description of what a built object does ('' when it has no perk). */
function perkText(objId: string): string {
  return hasKey('perk.' + objId) ? t('perk.' + objId) : '';
}

function tri(p: number): number {
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/** Small hologram / icon models per pad icon (ART_BIBLE §7). */
function buildIconModel(id: IconId | 'cash' | 'sign' | 'move', station?: string): Batch {
  const b = new Batch();
  const k = new PropKit(b, new DecalBatch());
  k.place(0, 0);
  const kind = id === 'lane' ? ({ shooting_goal: 'goal', dribble_cones: 'cones', passing_wall: 'wall', sprint_track: 'track' } as Record<string, IconId>)[station ?? ''] ?? 'goal' : id;
  switch (kind) {
    case 'ball':
      k.ballRack(6);
      break;
    case 'goal':
      k.popUpGoal();
      break;
    case 'cones':
      k.cone(-0.4, 0.2, 1.4);
      k.cone(0.3, -0.2, 1.4);
      k.pole(0.05, 0.35);
      break;
    case 'wall':
      k.reboundBoard(1.6);
      break;
    case 'track':
      k.hurdle(0, 0);
      break;
    case 'chair':
    case 'bench':
      k.bench(2.0);
      break;
    case 'staff':
      k.ballCart();
      break;
    case 'flag':
      k.flagpole(0x2f6bff);
      break;
    case 'shelter':
      k.dugout(1.6);
      break;
    case 'cooler':
      k.waterCooler();
      break;
    case 'sign':
      k.desk();
      break;
    case 'cash':
    default:
      b.at(G.rbox(0.25), 0x3ddc84, 0, 0.1, 0, 0.3, 0.9, 0.12, 0.5);
      b.at(G.rbox(0.25), 0x3ddc84, 0, 0.24, 0, -0.2, 0.9, 0.12, 0.5);
      b.at(G.box(), 0xb9ffd6, 0, 0.305, 0, -0.2, 0.3, 0.01, 0.3);
  }
  return b;
}

/** Everything visual: subscribes to sim events for juice and draws interpolated sim state. */
export class GameView {
  readonly rig = new CameraRig();
  readonly projector: Projector;
  readonly labels: LabelLayer;
  readonly popups: Popups;
  private readonly fx: Fx;
  private readonly balls: InstancedMesh;
  private readonly bills: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly arrow: Group;
  private readonly bus: Group;
  private readonly deskRing: PadMesh;
  private readonly unlocks = new Map<string, UnlockView>();
  private readonly pads = new Map<string, PadView>();
  /** Seconds the coach has stood still (guide arrow hint after the tutorial). */
  private coachIdle = 0;
  private readonly actors = new Map<string, Actor>();
  private readonly pops: Pop[] = [];
  private readonly ghostMat = new MeshBasicMaterial({ color: 0x5ab4ff, transparent: true, opacity: 0.4, depthWrite: false, side: DoubleSide });
  private readonly icons: IconRenderer;
  private readonly iconUrls = new Map<string, string>();
  private time = 0;
  private stepT = 0;
  private coachYaw = 0;
  private readonly raycaster = new Raycaster();
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private celebrateUntil = 0;
  private readonly geos: Record<string, UnlockGeo> = {};
  private readonly tmpColor = new Color();

  constructor(
    private readonly core: RenderCore,
    private readonly sim: Sim,
    private readonly hud: Hud,
    private readonly audio: AudioSystem,
    uiRoot: HTMLElement,
    private readonly haptic: (ms: number) => void,
    private readonly assets: Assets,
  ) {
    const scene = core.scene;
    this.projector = new Projector(this.rig.camera);
    this.labels = new LabelLayer(uiRoot, this.projector);
    this.popups = new Popups(uiRoot, this.projector, icon('coin'));
    const base = buildDiorama(assets, AREA1_LAYOUT, core.mat);
    scene.add(base.root);
    this.fx = new Fx(scene);
    this.fx.scale = TIERS[core.tier].particles;
    this.icons = new IconRenderer(128);

    for (const [id, st] of sim.world.stations) this.geos[id] = { center: st.def.center, lanes: st.lanes, basket: st.basket };

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
    this.bills.castShadow = true;
    scene.add(this.bills);

    const ringGeo = new RingGeometry(0.34, 0.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = new InstancedMesh(ringGeo, new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }), MAX_RINGS);
    this.rings.instanceMatrix.setUsage(DynamicDrawUsage);
    this.rings.count = 0;
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 3;
    this.rings.setColorAt(0, this.tmpColor.set(0xffffff));
    scene.add(this.rings);

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
    const arrowMesh = new Mesh(arrowGeo, new MeshLambertMaterial({ color: 0x4be37a, emissive: 0x157a35 }));
    arrowMesh.scale.setScalar(0.62);
    this.arrow.add(arrowMesh);
    this.arrow.visible = false;
    scene.add(this.arrow);

    this.bus = buildBus(core.mat);
    scene.add(this.bus);

    this.deskRing = makePad(PALETTE.blue, 0x1d2433, 1.0, 0.6);
    const ds = sim.area.desk.coachSpot;
    this.deskRing.position.set(ds.x, 0.035, ds.z);
    scene.add(this.deskRing);

    this.syncBuilt(false);
    this.wire();
    // portrait (rendered from the real coach model)
    const coachIcon = new Character(assets, 'male-c', KITS.coach, 1);
    coachIcon.play('idle', 0);
    coachIcon.seek(0);
    this.hud.setPortrait(this.icons.render('portrait', coachIcon.root, { yaw: 0.35, pitch: 0.15, zoom: 2.2, focusY: 0.78 }));
    // pre-render the whole icon atlas, then free the offscreen context
    for (const id of ['ball', 'cash', 'sign', 'goal', 'cones', 'wall', 'track', 'chair', 'staff', 'bench', 'flag', 'shelter', 'cooler']) this.iconUrl(id);
    for (const st of ['shooting_goal', 'dribble_cones', 'passing_wall', 'sprint_track']) this.iconUrl('lane', st);
    this.icons.dispose();
  }

  /** Icon atlas: objective/pad icons rendered from the real 3D models. */
  iconUrl(id: string, station?: string): string {
    const key = id + ':' + (station ?? '');
    let url = this.iconUrls.get(key);
    if (url) return url;
    if (this.iconsDone) return this.iconUrls.get('cash:') ?? '';
    const b = id === 'ball' ? null : buildIconModel(id as IconId, station);
    const obj = b ? b.build(this.core.mat) : new Mesh(ballGeometry(), new MeshLambertMaterial({ vertexColors: true }));
    url = this.icons.render(key, obj, { yaw: 0.5, pitch: 0.45 });
    this.iconUrls.set(key, url);
    return url;
  }

  private get iconsDone(): boolean {
    return this.iconUrls.size >= 17;
  }

  // ───────────────────────────── building / syncing ─────────────────────────────

  private unlockKeys(): Array<{ id: string; lanes: number }> {
    const s = this.sim.state;
    const out: Array<{ id: string; lanes: number }> = [];
    for (const id of ['ball_crate', 'chairs_2', 'bench', 'flags', 'water_cooler', 'bus_shelter']) if (s.built[id]) out.push({ id, lanes: 1 });
    for (const [id, ss] of Object.entries(s.stations)) out.push({ id, lanes: ss.lanes });
    return out;
  }

  /** Creates meshes for everything built in the sim that has no visual yet (and lane upgrades). */
  syncBuilt(animate: boolean): void {
    for (const { id, lanes } of this.unlockKeys()) {
      const cur = this.unlocks.get(id);
      if (cur && cur.lanes === lanes) continue;
      if (cur) this.core.scene.remove(cur.root);
      const d = buildUnlockable(id, lanes, this.assets, AREA1_LAYOUT, this.core.mat, this.geos[id]);
      this.core.scene.add(d.root);
      const v: UnlockView = {
        root: d.root,
        lanes,
        nets: d.nets,
        netRest: d.nets.map((n) => Float32Array.from((n.geometry.attributes.position as BufferAttribute).array as Float32Array)),
        ripple: 0,
        rippleX: 0,
      };
      this.unlocks.set(id, v);
      if (animate) this.pop(d.root);
    }
  }

  /** Full rebuild after loading a different save (auth change / reset). */
  resetVisuals(): void {
    for (const u of this.unlocks.values()) this.core.scene.remove(u.root);
    for (const p of this.pads.values()) this.core.scene.remove(p.pad, p.ghost);
    for (const a of this.actors.values()) this.core.scene.remove(a.c.root);
    this.unlocks.clear();
    this.pads.clear();
    this.actors.clear();
    this.syncBuilt(false);
    const c = this.sim.state.coach;
    this.rig.snap(c.x, c.z);
  }

  private pop(obj: Object3D): void {
    obj.matrixAutoUpdate = true;
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
      const pv = this.pads.get(e.padId);
      if (pv) {
        this.core.scene.remove(pv.pad, pv.ghost);
        this.pads.delete(e.padId);
      }
      this.audio.play('unlock');
      this.audio.play('pop');
      this.haptic(25);
      this.fx.burst(e.x, 0.8, e.z, 60);
      this.dustRing(e.x, e.z);
      this.rig.shake(0.18);
      this.popups.text(e.x, 2.2, e.z, `+${e.stars} ★`, 'star');
      const ud = this.sim.world.pads.get(e.padId)?.unlock;
      const perk = ud?.type === 'object' ? perkText(ud.id) : '';
      if (perk) this.hud.toast(perk, 'info');
      this.hud.bumpStars();
      if (e.major) {
        const u = this.sim.world.pads.get(e.padId)?.unlock;
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
        this.actorFor(tr).c.play('cheer', 0.1);
      }
    });
    ev.on('traineeArrived', (e) => {
      const tr = this.sim.trainee(e.id);
      if (tr && e.id === 1) this.hud.toast(t('toast.first_trainee', { name: firstName(tr) }), 'info');
    });
    ev.on('repStart', (e) => {
      const tr = this.sim.trainee(e.traineeId);
      if (!tr) return;
      const kind = this.sim.station(e.stationId).kind;
      if (kind === 'shoot' || kind === 'pass') this.actorFor(tr).c.play('kick', 0.08, 1.15);
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
        this.actorFor(tr).c.play('cheer', 0.1);
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

  private dustRing(x: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.fx.puff(x + Math.cos(a) * 0.9, z + Math.sin(a) * 0.9, 0.35);
    }
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
    this.labels.topReserve = h > w ? 175 : 80;
  }

  // ───────────────────────────── characters ─────────────────────────────

  private actorFor(tr: Trainee): Actor {
    const key = 't:' + tr.id;
    let a = this.actors.get(key);
    if (!a) {
      const pool = tr.female ? KIDS_F : KIDS_M;
      const model = pool[(tr.id * 7 + tr.look.hair) % pool.length] as CharacterKey;
      const c = new Character(this.assets, model, casualKit(tr.id), KID_SCALE * (0.92 + (tr.age - 12) * 0.03));
      this.core.scene.add(c.root);
      a = { c, lx: tr.x, lz: tr.z, yaw: tr.yaw, lastRep: 0, seen: 0 };
      this.actors.set(key, a);
    }
    return a;
  }

  private actorNamed(key: string, model: CharacterKey, kit: typeof KITS.academy, scale: number, x: number, z: number): Actor {
    let a = this.actors.get(key);
    if (!a) {
      const c = new Character(this.assets, model, kit, scale);
      this.core.scene.add(c.root);
      a = { c, lx: x, lz: z, yaw: 0, lastRep: 0, seen: 0 };
      this.actors.set(key, a);
    }
    return a;
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  frame(alpha: number, dt: number): void {
    this.time += dt;
    const s = this.sim.state;
    const sim = this.sim;
    const c = s.coach;
    const cx = c.px + (c.x - c.px) * alpha;
    const cz = c.pz + (c.z - c.pz) * alpha;

    const view = BALANCE.camera.baseView + s.stars * BALANCE.camera.viewPerStar;
    this.rig.setView(view);
    if (this.rig.panning && Math.hypot(sim.input.x, sim.input.z) > 0.2) this.rig.cancelPan();
    this.rig.update(dt, cx, cz, c.vx, c.vz);
    if (this.core.sun.castShadow) this.core.followSun(this.rig.focus.x, this.rig.focus.z);

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i] as Pop;
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      const sc = easeOutBack(k);
      p.obj.scale.set(sc, sc * (1 + Math.sin(k * Math.PI) * 0.15), sc);
      if (k >= 1) {
        p.obj.scale.setScalar(1);
        p.obj.updateMatrix();
        p.obj.matrixAutoUpdate = false;
        this.pops.splice(i, 1);
      }
    }

    this.labels.begin();
    let bi = 0;
    const ballAt = (x: number, y: number, z: number, rot = 0, scale = 0.28): void => {
      if (bi >= MAX_BALLS) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rot, rot * 0.7, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      this.balls.setMatrixAt(bi++, dummy.matrix);
    };
    let ri = 0;
    const ringAt = (x: number, z: number, rarity: Rarity): void => {
      if (ri >= MAX_RINGS) return;
      dummy.position.set(x, 0.035, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.rings.setMatrixAt(ri, dummy.matrix);
      this.rings.setColorAt(ri++, this.tmpColor.set(RARITY_COL[rarity]));
    };
    const frameId = Math.floor(this.time * 1000);

    // ── coach
    const coach = this.actorNamed('coach', 'male-c', KITS.coach, ADULT_SCALE, cx, cz);
    coach.seen = frameId;
    const speed = Math.hypot(c.vx, c.vz);
    this.coachYaw = lerpAngle(this.coachYaw, c.yaw, 1 - Math.exp(-dt * 16));
    coach.c.root.position.set(cx, 0, cz);
    coach.c.root.rotation.y = this.coachYaw + YAW_OFFSET;
    coach.c.setCarry(c.carry > 0);
    const moving = speed > 0.4;
    if (this.time < this.celebrateUntil) coach.c.play('cheer');
    else if (moving) coach.c.play(speed > 3.2 ? 'run' : 'walk', 0.15, speed > 3.2 ? speed / 5.5 : speed / 2.2);
    else coach.c.play('idle');
    if (moving) {
      this.stepT += dt;
      if (this.stepT > 0.18) {
        this.stepT = 0;
        this.fx.puff(cx, cz);
      }
    }
    {
      const fx = Math.sin(this.coachYaw + YAW_OFFSET);
      const fz = Math.cos(this.coachYaw + YAW_OFFSET);
      for (let i = 0; i < c.carry; i++) ballAt(cx + fx * 0.48, 0.78 + i * 0.3, cz + fz * 0.48, i * 0.7);
    }

    // ── staff
    for (const f of s.staff) {
      const fx = f.px + (f.x - f.px) * alpha;
      const fz = f.pz + (f.z - f.pz) * alpha;
      const a = this.actorNamed('staff:' + f.id, 'male-b', KITS.staff, ADULT_SCALE, fx, fz);
      a.seen = frameId;
      a.yaw = lerpAngle(a.yaw, f.yaw, 1 - Math.exp(-dt * 12));
      a.c.root.position.set(fx, 0, fz);
      a.c.root.rotation.y = a.yaw + YAW_OFFSET;
      a.c.setCarry(f.carry > 0);
      a.c.play(f.moving ? 'walk' : 'idle');
      const dx = Math.sin(a.yaw + YAW_OFFSET);
      const dz = Math.cos(a.yaw + YAW_OFFSET);
      for (let i = 0; i < f.carry; i++) ballAt(fx + dx * 0.48, 0.78 + i * 0.3, fz + dz * 0.48, i);
    }

    // ── baskets + supply chips
    for (const [id, ss] of Object.entries(s.stations)) {
      const st = sim.station(id);
      if (!st.basket) continue;
      const n = Math.min(ss.balls, 8);
      for (let i = 0; i < n; i++) ballAt(st.basket.x - 0.4 + (i % 4) * 0.27, 1.02 + Math.floor(i / 4) * 0.22, st.basket.z + 0.02, i);
      const low = ss.balls === 0 && ss.occupants.some((o) => o > 0);
      this.labels.place('chip:' + id, st.basket.x + 0.9, 1.0, st.basket.z + 0.3, '', `<div class="chip-supply${low ? ' low' : ''}">${icon('ball')}<b>${ss.balls}/${st.cfg.basketCap}</b></div>`);
    }

    // ── trainees
    const deskT = sim.deskTrainee();
    for (const tr of s.trainees) {
      const a = this.drawTrainee(tr, alpha, dt, ballAt, tr === deskT);
      a.seen = frameId;
      ringAt(a.c.root.position.x, a.c.root.position.z, tr.rarity);
    }
    // remove actors of trainees that left
    for (const [k, a] of this.actors) {
      if (a.seen === frameId) continue;
      this.core.scene.remove(a.c.root);
      this.actors.delete(k);
    }

    // animation update (far characters at 30 Hz)
    const fxp = this.rig.focus.x;
    const fzp = this.rig.focus.z;
    for (const a of this.actors.values()) {
      const p = a.c.root.position;
      a.c.update(dt, Math.hypot(p.x - fxp, p.z - fzp) > 13 ? 30 : 60);
    }

    this.balls.count = bi;
    this.balls.instanceMatrix.needsUpdate = true;
    this.rings.count = ri;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;

    // ── cash piles
    let bn = 0;
    for (const p of s.piles) {
      if (p.amount < 1) continue;
      const count = Math.min(28, Math.max(1, Math.ceil(p.amount / 5)));
      for (let i = 0; i < count && bn < MAX_BILLS; i++) {
        const layer = Math.floor(i / 4);
        const q = i % 4;
        dummy.position.set(p.x + (q % 2 ? 0.38 : -0.38), 0.05 + layer * 0.095, p.z + (q < 2 ? -0.22 : 0.22));
        dummy.rotation.set(0, ((i * 37) % 10) * 0.03 - 0.15, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.bills.setMatrixAt(bn++, dummy.matrix);
      }
      if (p.amount >= BALANCE.objectives.minPileWorth) this.labels.place('pile:' + p.id, p.x, 0.7 + Math.min(28, Math.ceil(p.amount / 5)) * 0.024 + Math.sin(this.time * 3) * 0.05, p.z, '', `<div class="floater">+${formatCash(p.amount)}</div>`);
    }
    this.bills.count = bn;
    this.bills.instanceMatrix.needsUpdate = true;

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

    // ── locked expansions
    for (const gh of AREA1_LAYOUT.ghosts) {
      const r = gh.rect;
      this.labels.place('gh:' + gh.id, r.x1 - 0.6, 2.2, r.z1 + 0.5, '', `<div class="lock-sign">${icon('lock')}<span>${gh.label}</span><b>${t('area.coming_soon')}</b></div>`);
    }

    for (const u of this.unlocks.values()) this.updateNets(u, dt);

    // ── bus
    const busZ = s.bus.pz + (s.bus.z - s.bus.pz) * alpha;
    this.bus.position.set(sim.area.gate.busStop.x, -0.3, busZ);
    this.bus.visible = s.bus.phase !== 'away';
    if (this.bus.visible && s.bus.phase === 'stopped') this.bus.position.y = -0.3 + Math.abs(Math.sin(this.time * 10)) * 0.02;

    this.coachIdle = Math.hypot(c.vx, c.vz) < 0.2 ? this.coachIdle + dt : 0;
    this.updateArrow(cx, cz);
    this.fx.update(dt, this.time);
    this.labels.end();
    this.hud.update(dt);
    this.core.renderer.render(this.core.scene, this.rig.camera);
  }

  private drawTrainee(tr: Trainee, alpha: number, dt: number, ballAt: (x: number, y: number, z: number, rot?: number, scale?: number) => void, atDesk: boolean): Actor {
    const sim = this.sim;
    const a = this.actorFor(tr);
    let x = tr.px + (tr.x - tr.px) * alpha;
    let z = tr.pz + (tr.z - tr.pz) * alpha;
    let yaw = tr.yaw;
    let anim: CharAnim = 'idle';
    let animSpeed = 1;
    // casual clothes until halfway through changing on the locker-room bench
    const pre = tr.state === 'arriving' || tr.state === 'seated' || tr.state === 'toDesk' || tr.state === 'atDesk' || tr.state === 'toLocker';
    const kitOn = !pre && !(tr.state === 'changing' && tr.repT < 0.5);
    if (kitOn && !a.c.root.userData.kit) {
      a.c.setKit(this.assets, KITS.academy);
      a.c.root.userData.kit = true;
      if (tr.state === 'changing') {
        this.fx.burst(x, 0.9, z, 18, 0.5);
        this.audio.play('pop', 1.2);
      }
    }
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
        const fx = x + ux * 0.4;
        const fz = z + uz * 0.4;
        const strike = 0.45;
        switch (st.kind) {
          case 'shoot':
          case 'pass': {
            if (tr.repActive) {
              if (a.lastRep < strike && p >= strike) this.audio.play('kick', 0.9 + Math.random() * 0.2);
              if (p < strike) ballAt(fx, 0.15, fz);
              else if (st.kind === 'shoot') {
                const k = Math.min(1, (p - strike) / 0.22);
                const bx = fx + (lane.target.x - fx) * k;
                const bz = fz + (lane.target.z - fz) * k;
                if (k < 1) ballAt(bx, 0.15 + Math.sin(k * Math.PI * 0.8) * 1.1 + k * 0.4, bz, p * 30);
                else ballAt(lane.target.x, Math.max(0.15, 0.9 - (p - strike - 0.22) * 3), lane.target.z, 0);
                if (a.lastRep < strike + 0.22 && p >= strike + 0.22) {
                  const u = this.unlocks.get(tr.stationId);
                  if (u) {
                    u.ripple = 1;
                    u.rippleX = lane.target.x - (AREA1_LAYOUT.shootingLane.x0 + AREA1_LAYOUT.shootingLane.x1) / 2;
                  }
                  this.audio.play('net');
                  this.fx.burst(lane.target.x, 1.0, lane.target.z, 8, 0.4);
                }
              } else {
                const out = Math.min(1, (p - strike) / 0.18);
                const back = Math.max(0, Math.min(1, (p - strike - 0.18) / 0.25));
                const k = out - back;
                ballAt(fx + (lane.target.x - fx) * k, 0.18 + Math.sin(k * Math.PI) * 0.2, fz + (lane.target.z - fz) * k, p * 20);
                if (a.lastRep < strike + 0.18 && p >= strike + 0.18) this.audio.play('kick', 1.3);
              }
            } else ballAt(fx, 0.15, fz);
            anim = 'idle';
            break;
          }
          case 'dribble': {
            if (tr.repActive) {
              const k = tri(p);
              const along = k * len;
              const weave = Math.sin(along * 3.0) * 0.3 * Math.min(1, along);
              x = lane.spot.x + ux * along - uz * weave;
              z = lane.spot.z + uz * along + ux * weave;
              yaw = p < 0.5 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
              anim = 'run';
              animSpeed = 0.9;
              const dir = p < 0.5 ? 1 : -1;
              ballAt(x + ux * 0.4 * dir, 0.15, z + uz * 0.4 * dir, p * 40);
            } else ballAt(fx, 0.15, fz);
            break;
          }
          case 'sprint': {
            if (tr.repActive) {
              const k = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55;
              x = lane.spot.x + ux * len * k;
              z = lane.spot.z + uz * len * k;
              yaw = p < 0.45 ? Math.atan2(-ux, -uz) : Math.atan2(ux, uz);
              anim = p < 0.45 ? 'run' : 'walk';
              animSpeed = p < 0.45 ? 1.4 : 1;
            }
            break;
          }
        }
        a.lastRep = p;
      }
    } else if (tr.state === 'seated' || tr.state === 'changing') {
      anim = 'sit';
    } else if (tr.moving) {
      anim = tr.state === 'leaving' ? 'run' : 'walk';
    }
    a.yaw = lerpAngle(a.yaw, yaw, 1 - Math.exp(-dt * 14));
    const ly = anim === 'sit' ? SIT_LIFT : 0;
    a.y = (a.y ?? ly) + (ly - (a.y ?? ly)) * (1 - Math.exp(-dt * 12));
    a.c.root.position.set(x, a.y, z);
    a.c.root.rotation.y = a.yaw + YAW_OFFSET;
    a.c.play(anim, 0.18, animSpeed);
    // label
    const ovr = sim.ovr(tr);
    const rc = RARITY_CLS[tr.rarity];
    const key = 'tl:' + tr.id;
    if (atDesk || tr.state === 'arriving' || tr.state === 'toDesk') {
      this.labels.place(key, x, HEAD_Y + 0.25, z, '', `<div class="card"><span class="nm">${firstName(tr)}</span><span class="pos">${t('pos.' + tr.position)}</span><span class="ovr ${rc}">${ovr}</span></div>`);
    } else if (sim.isWaitingForBalls(tr)) {
      this.labels.place(key, x, HEAD_Y + 0.3, z, '', `<div class="bubble need">${icon('ball')}<span class="emo">😟</span></div>`);
    } else if (tr.state === 'changing') {
      this.labels.place(key, x, HEAD_Y + 0.3, z, '', `<div class="bubble">👕</div>`);
    } else if (tr.state === 'seated' && tr.waitT > BALANCE.trainee.moodWaitSec) {
      this.labels.place(key, x, HEAD_Y + 0.1, z, '', `<div class="bubble">⏳<span class="emo">😴</span></div>`);
    } else {
      this.labels.place(key, x, HEAD_Y + 0.1, z, '', `<span class="ovr ${rc}">${ovr}</span>`);
    }
    return a;
  }

  private updatePads(): void {
    const sim = this.sim;
    const s = sim.state;
    const visible = sim.visiblePads();
    const seen = new Set<string>();
    for (const p of visible) {
      seen.add(p.id);
      let pv = this.pads.get(p.id);
      if (!pv) {
        const pad = makePad(PALETTE.cash, 0x1d2433, 0.42, 0.62);
        pad.position.set(p.pos.x, 0.035, p.pos.z);
        this.core.scene.add(pad);
        const ghost = new Group();
        const station = p.unlock.type === 'lane' ? p.unlock.station : undefined;
        const gm = buildIconModel(p.icon, station).build(this.ghostMat);
        gm.renderOrder = 6;
        ghost.add(gm);
        ghost.position.set(p.pos.x, 0.45, p.pos.z);
        ghost.scale.setScalar(0.55);
        this.core.scene.add(ghost);
        pv = { pad, ghost };
        this.pads.set(p.id, pv);
        this.pop(pad);
      }
      const paid = s.pads[p.id]?.paid ?? 0;
      const u = pv.pad.material.uniforms;
      u.uProgress!.value = paid / p.cost;
      u.uTime!.value = this.time;
      const afford = s.cash + 1e-6 >= sim.padRemaining(p);
      u.uGlow!.value = afford ? 1 : 0;
      pv.ghost.position.y = 0.45 + Math.sin(this.time * 2.2 + p.pos.x) * 0.08;
      pv.ghost.rotation.y = Math.sin(this.time * 0.8 + p.pos.z) * 0.35;
      if (sim.paying && s.coach.padId === p.id && Math.random() < 0.5) {
        this.fx.coins.spawn(s.coach.x, 1.4, s.coach.z, p.pos.x, 0.1, p.pos.z, 0.35);
        this.audio.play('coin', 0.8 + (paid / p.cost) * 0.6);
      }
      this.labels.place('pad:' + p.id, p.pos.x, 0.05, p.pos.z + 0.75, '', this.padTag(p, afford));
    }
    for (const [id, pv] of this.pads) {
      if (seen.has(id)) continue;
      this.core.scene.remove(pv.pad, pv.ghost);
      this.pads.delete(id);
    }
  }

  private padTag(p: PadDef, afford: boolean): string {
    const rem = Math.ceil(this.sim.padRemaining(p));
    const name = p.unlock.type === 'staff' ? t('pad.hire', { name: t(p.nameKey) }) : t(p.nameKey);
    const perk = p.unlock.type === 'object' ? perkText(p.unlock.id) : '';
    return `<div class="pad2${afford ? ' ok' : ''}"><div class="pad2-price">${icon('cash')}<b>${formatCash(rem)}</b></div><div class="pad2-name">${icon(p.icon)}<i>${t('pad.unlock')}</i>${name}</div>${perk ? `<div class="pad2-perk">${perk}</div>` : ''}</div>`;
  }

  private updateNets(u: UnlockView, dt: number): void {
    if (u.ripple <= 0) return;
    u.ripple = Math.max(0, u.ripple - dt * 1.6);
    const age = 1 - u.ripple;
    u.nets.forEach((net, ni) => {
      const pos = net.geometry.attributes.position as BufferAttribute;
      const arr = pos.array as Float32Array;
      const rest = u.netRest[ni] as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3] as number;
        const y = rest[i * 3 + 1] as number;
        const d = Math.hypot(x - u.rippleX, y + 0.2);
        const amp = u.ripple * u.ripple * 0.4 * Math.exp(-d * 1.2);
        arr[i * 3 + 2] = (rest[i * 3 + 2] as number) - amp * Math.cos(age * 18 - d * 5);
      }
      pos.needsUpdate = true;
    });
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
    // guided only during the tutorial; afterwards the player plans their own route (arrow returns when idle)
    const OB = BALANCE.objectives;
    const guided = this.sim.state.stats.unlocks < OB.guideUnlocks || this.coachIdle >= OB.hintIdleSec;
    if (!guided) {
      this.arrow.visible = false;
      edge.classList.add('hidden');
      return;
    }
    this.arrow.visible = !near;
    this.arrow.position.set(o.x, 1.9 + Math.abs(Math.sin(this.time * 4)) * 0.4, o.z);
    // face the camera (camera never rotates); tilt back so it reads from the 52° view
    this.arrow.rotation.set(-0.5, 0, 0);
    const p = this.projector.project(o.x, 0.5, o.z, sp);
    const w = this.projector.w;
    const h = this.projector.h;
    const m = 44;
    const off = !p.visible || p.x < m || p.y < m * 1.6 || p.x > w - m || p.y > h - m;
    if (!off || near) {
      edge.classList.add('hidden');
      return;
    }
    const cp = this.projector.project(cx, 0.5, cz, { x: 0, y: 0, visible: true });
    let dx = p.x - cp.x;
    let dy = p.y - cp.y;
    if (!p.visible) {
      dx = -dx;
      dy = -dy;
    }
    const ang = Math.atan2(dy, dx);
    const kx = Math.cos(ang) !== 0 ? (Math.cos(ang) > 0 ? w - m - w / 2 : m - w / 2) / Math.cos(ang) : Infinity;
    const ky = Math.sin(ang) !== 0 ? (Math.sin(ang) > 0 ? h - m - h / 2 : m * 2.2 - h / 2) / Math.sin(ang) : Infinity;
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    const px = w / 2 + Math.cos(ang) * k;
    const py = h / 2 + Math.sin(ang) * k;
    edge.style.transform = `translate3d(${px}px, ${py}px, 0) rotate(${ang}rad)`;
    edge.classList.remove('hidden');
  }

  setTierEffects(): void {
    this.fx.scale = TIERS[this.core.tier].particles;
  }

  /** Debug info for the overlay. */
  stats(): { calls: number; tris: number } {
    const info = this.core.renderer.info.render;
    return { calls: info.calls, tris: info.triangles };
  }
}
