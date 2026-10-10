import { BALANCE } from '../data/balance';
import { AREA1, PREBUILT_OBJECTS } from '../data/areas/area1';
import { SAVE_VERSION } from '../data/constants';
import { STATS, SUPPLIES, type AreaDef, type PadDef, type Rect, type Stat, type Supply } from '../data/types';
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { dist2, pushOutOfRect, yawFor } from './geom';
import { NavGrid } from './nav';
import { computeOvr, createTrainee, firstName } from './players';
import { makeAgent, runnerSupply, type Agent, type SimState, type Staff, type Trainee } from './state';
import { WorldGeo, type StationGeo } from './world';
import { computeObjective, type Objective } from './objectives';
import { Guide, type GuideMode } from './guide';
import { BUYERS } from '../data/clubs';
import { createMatch, finishMatch, newLeague, resolveChance, type MatchResult, type MatchScript } from './match';
import type { Player } from './state';
import type { Rarity } from '../data/types';
import { CUP_TEAMS, DIVISIONS, type TeamDef } from '../data/clubs';
import * as Meta from './meta';
import type { ScoutTier } from './state';
import { UPGRADES, UPGRADE_BY_ID, type UpgradeId } from '../data/upgrades';

export interface SimEvents {
  cashCollected: { pileId: string; amount: number; x: number; z: number };
  unlocked: { padId: string; x: number; z: number; stars: number; major: boolean };
  ballPicked: { carry: number; byStaff: boolean; kind?: Supply };
  ballDropped: { stationId: string; byStaff: boolean };
  traineeArrived: { id: number };
  signed: { id: number; fee: number };
  repStart: { traineeId: number; stationId: string };
  rep: { traineeId: number; stationId: string; stat: Stat; gain: number; cash: number };
  graduated: { id: number };
  busArrived: Record<string, never>;
  busLeft: Record<string, never>;
  levelUp: { level: number };
  /** The coach is at the office computer: show the office panel (transfer choice if `id` ≠ 0, upgrades). */
  podiumOpen: { id: number };
  /** The coach is on the kick-off spot and a match is available. */
  kickoffReady: Record<string, never>;
  sold: { id: number; name: string; price: number; buyer: string; record: boolean; fromSquad: boolean };
  promoted: { id: number; replaced: { name: string; price: number } | null };
  graduateWaiting: { id: number };
  matchFinished: { result: MatchResult };
  divisionUp: { division: number };
  upgraded: { id: string; level: number };
  /** Level-up chest (granted immediately). */
  chest: { level: number; cash: number; tickets: number };
  /** A scout mission finished: the prospect arrives on the next bus. */
  scoutDone: { rarity: Rarity; position: string };
  /** A graduate filled an empty Hall of Fame slot. */
  albumSlot: { key: string };
  questsRefreshed: Record<string, never>;
  /** The accountant moved cash from a pile into the office safe (for a coin arc). */
  cashToSafe: { pileId: string; amount: number };
  staffHired: { id: string };
  objectiveChanged: { objective: Objective | null };
  guideChanged: { objective: Objective | null; mode: GuideMode };
  saveNeeded: { reason: string };
}

export interface SimInput {
  x: number;
  z: number;
}

const EMPTY = {} as Record<string, never>;


/** Lowest stat (the gym trains it). */
function weakest(stats: Record<Stat, number>): { k: Stat; v: number } {
  let k: Stat = 'PAC';
  for (const s of STATS) if (stats[s] < stats[k]) k = s;
  return { k, v: stats[k] };
}

export function levelForXp(xp: number): number {
  const t = BALANCE.levelXp;
  let lvl = 1;
  for (let i = 1; i < t.length; i++) if (xp >= (t[i] as number)) lvl = i + 1;
  return lvl;
}

export function createInitialState(area: AreaDef = AREA1, seed = 12345): SimState {
  const built: Record<string, boolean> = {};
  for (const id of PREBUILT_OBJECTS) built[id] = true;
  const pads: SimState['pads'] = {};
  for (const p of area.pads) pads[p.id] = { paid: 0, done: false };
  const seats: number[] = [];
  for (const o of area.objects) if (built[o.id] && o.seats) for (let i = 0; i < o.seats.length; i++) seats.push(0);
  return {
    v: SAVE_VERSION,
    time: 0,
    cash: 0,
    earned: 0,
    xp: 0,
    level: 1,
    stars: 0,
    coach: {
      x: area.spawn.x,
      z: area.spawn.z,
      px: area.spawn.x,
      pz: area.spawn.z,
      vx: 0,
      vz: 0,
      yaw: 0,
      carry: 0,
      pickT: 0,
      dropT: 0,
      padId: null,
      padT: 0,
      deskT: 0,
      moved: 0,
    },
    pads,
    built,
    stations: {},
    piles: [
      ...area.starterPiles.map((p) => ({ id: p.id, x: p.pos.x, z: p.pos.z, amount: p.amount })),
      { id: 'desk', x: area.desk.pile.x, z: area.desk.pile.z, amount: 0 },
    ],
    trainees: [],
    staff: [],
    seats,
    bus: { phase: 'away', z: -40, pz: -40, timer: 0, t: 0, toDrop: 0 },
    nextId: 1,
    arrivalCounter: 0,
    rng: seed,
    flags: {},
    stats: { signed: 0, reps: 0, graduated: 0, unlocks: 0, ballsDelivered: 0, cashCollected: 0 },
    podiumQueue: [],
    squad: [],
    league: newLeague(0, 1),
    matchNextAt: 0,
    records: { bestSale: 0, sold: 0, promoted: 0, matches: 0, wins: 0, goals: 0, titles: 0 },
    upgrades: {},
    tickets: 0,
    prospects: [],
    meta: Meta.newMeta(),
  };
}

export type PromptKind = 'podium' | 'kickoff';

/** The whole game simulation. Pure TS, deterministic for a given seed and input sequence. */
export class Sim {
  readonly events = new Emitter<SimEvents>();
  readonly world: WorldGeo;
  readonly nav: NavGrid;
  readonly input: SimInput = { x: 0, z: 0 };
  obstacles: Rect[] = [];
  objective: Objective | null = null;
  /** What the HUD tells the player (tutorial route, or a hint when lost); `objective` is the always-on best action (bot). */
  readonly guide: Guide;
  /** True while the coach is standing on a pad and cash is draining. */
  paying = false;
  private objT = 0;
  /** Prompt the UI should show (set when the coach steps into a podium / kick-off zone). */
  prompt: PromptKind | null = null;
  /** Zones re-arm only after the coach leaves them (no re-open loop after closing a panel). */
  private readonly latched: Record<PromptKind, boolean> = { podium: false, kickoff: false };
  /** Graduate shown by the last office prompt (a new one re-opens it while the coach stays at the computer). */
  private promptedGrad = 0;
  private dismissedAt = 0;
  /** Earnings at the previous tick for the income EMA; -1 = skip one tick (load, rewards). */
  private earnedPrev = -1;
  private metaT = 0;
  /** Wall-clock time (epoch ms) and timezone offset, set by the host each frame (tests use fixed values). */
  now = 0;
  tz: number | undefined = undefined;
  /** The match being played (between startMatch and finishCurrentMatch). */
  match: MatchScript | null = null;
  private readonly rng: Rng;
  private readonly seatPos: Array<{ x: number; z: number; yaw: number }> = [];

  constructor(
    public state: SimState = createInitialState(),
    readonly area: AreaDef = AREA1,
  ) {
    this.world = new WorldGeo(area);
    this.guide = new Guide(this);
    this.rng = new Rng(state.rng);
    this.nav = new NavGrid(area.navBounds, 0.5, this.world.walkable());
    this.rebuildWorld();
    this.syncLayout();
    this.objective = computeObjective(this);
  }

  /** Swaps in a different state (auth change, reset). */
  loadState(state: SimState): void {
    this.state = state;
    this.earnedPrev = -1;
    this.rng.state = state.rng;
    this.objective = null;
    this.rebuildWorld();
    this.syncLayout();
    this.refreshObjective();
  }

  /** Pile positions always follow the current layout; old saves (flags.relayout) get agents snapped to safe spots. */
  syncLayout(): void {
    const s = this.state;
    for (const p of s.piles) {
      let pos: { x: number; z: number } | undefined;
      if (p.id === 'desk') pos = this.area.desk.pile;
      else if (p.id.startsWith('st:')) pos = this.world.stations.get(p.id.slice(3))?.pile;
      else pos = this.area.starterPiles.find((sp) => sp.id === p.id)?.pos;
      if (pos) {
        p.x = pos.x;
        p.z = pos.z;
      }
    }
    if (s.flags.relayout) {
      delete s.flags.relayout;
      this.relayout();
    }
  }

  /** Moves every agent to the logical spot for its state on the current layout (layout migrations). */
  relayout(): void {
    const s = this.state;
    const c = s.coach;
    c.x = c.px = this.area.spawn.x;
    c.z = c.pz = this.area.spawn.z;
    c.vx = c.vz = 0;
    const door = this.area.gate.door;
    for (const t of s.trainees) {
      let p: { x: number; z: number } = door;
      t.goal = null;
      t.path = [];
      switch (t.state) {
        case 'arriving':
        case 'seated': {
          const sp = this.seatPos[t.seat];
          if (sp) p = sp;
          t.state = 'seated';
          t.yaw = sp?.yaw ?? 0;
          break;
        }
        case 'toDesk':
        case 'atDesk':
          p = this.area.desk.traineeSpot;
          t.state = 'atDesk';
          break;
        case 'toLocker':
        case 'changing': {
          const ls = this.area.lockers.seats[t.seat];
          if (ls) p = ls;
          t.state = 'changing';
          t.yaw = this.area.lockers.yaw;
          break;
        }
        case 'queued':
          if (t.stationId) {
            const ss = s.stations[t.stationId];
            p = this.world.queueSlot(this.station(t.stationId), Math.max(0, ss?.queue.indexOf(t.id) ?? 0));
          }
          break;
        case 'toLane':
        case 'training':
          if (t.stationId) {
            const l = this.station(t.stationId).lanes[t.lane];
            if (l) p = l.spot;
            t.state = 'training';
            t.repActive = false;
            t.repT = 0;
          }
          break;
        case 'leaving':
          this.setGoal(t, door.x, door.z);
          break;
        case 'toPodium':
        case 'atPodium':
          p = this.podiumSlot(Math.max(0, s.podiumQueue.indexOf(t.id)));
          t.state = 'atPodium';
          break;
      }
      t.x = t.px = p.x;
      t.z = t.pz = p.z;
    }
    for (const f of s.staff) {
      const spot = this.area.staffSpots[f.id];
      const h = runnerSupply(f.kind) ? this.staffHome(this.ballBoyIndex(f), f.kind) : (spot ?? this.staffHome(0));
      f.x = f.px = h.x;
      f.z = f.pz = h.z;
      f.goal = null;
      f.path = [];
      f.state = 'idle';
      f.target = null;
    }
  }

  // ───────────────────────────── world / helpers ─────────────────────────────

  rebuildWorld(): void {
    const s = this.state;
    const obs: Rect[] = [...this.area.obstacles];
    for (const e of this.area.expansions) if (!this.state.built[e.gateObjectId]) obs.push(...e.lockedObstacles);
    for (const [id, o] of this.world.objects) if (s.built[id]) obs.push(...o.footprint);
    for (const [id, st] of this.world.stations) {
      const ss = s.stations[id];
      if (!ss) continue;
      obs.push(...st.footprint);
      for (let i = 0; i < ss.lanes; i++) obs.push(...(st.lanes[i]?.footprint ?? []));
    }
    this.obstacles = obs;
    this.nav.rebuild(obs, BALANCE.trainee.radius);
    this.seatPos.length = 0;
    for (const o of this.area.objects) if (s.built[o.id] && o.seats) for (const p of o.seats) this.seatPos.push({ x: p.x, z: p.z, yaw: o.seatYaw ?? Math.PI });
    while (s.seats.length < this.seatPos.length) s.seats.push(0);
    // all agents must re-path
    for (const t of s.trainees) t.path = [];
    for (const f of s.staff) f.path = [];
  }

  isPadVisible(p: PadDef): boolean {
    const s = this.state;
    if (s.pads[p.id]?.done) return false;
    for (const r of p.requires) if (!s.pads[r]?.done) return false;
    return true;
  }

  visiblePads(): PadDef[] {
    return this.world.padList.filter((p) => this.isPadVisible(p));
  }

  padRemaining(p: PadDef): number {
    return p.cost - (this.state.pads[p.id]?.paid ?? 0);
  }

  /**
   * Whether the player can afford a pad by the numbers on screen: the HUD shows whole dollars (rounded down) and
   * the pad its remaining price rounded up, so $44.50 against a $44.40 remainder reads "$44 / $45" and doesn't count.
   */
  canAfford(p: PadDef): boolean {
    return Math.floor(this.state.cash + 1e-6) >= Math.ceil(this.padRemaining(p) - 1e-6);
  }

  station(id: string): StationGeo {
    const st = this.world.stations.get(id);
    if (!st) throw new Error('unknown station ' + id);
    return st;
  }

  trainee(id: number): Trainee | undefined {
    for (const t of this.state.trainees) if (t.id === id) return t;
    return undefined;
  }

  pile(id: string): SimState['piles'][number] | undefined {
    for (const p of this.state.piles) if (p.id === id) return p;
    return undefined;
  }

  ovr(t: Trainee): number {
    return computeOvr(t.position, t.stats);
  }

  hasStaff(kind: Staff['kind']): boolean {
    return this.state.staff.some((f) => f.kind === kind);
  }

  /** Area `n`'s gate has been bought (Area 1 is always open). */
  areaOpen(n: number): boolean {
    const e = this.area.expansions.find((x) => x.area === n);
    return n <= 1 || (!!e && !!this.state.built[e.gateObjectId]);
  }

  /** The Training Ground gate has been bought. */
  area2Open(): boolean {
    return this.areaOpen(2);
  }

  /** The Youth Stadium gate has been bought. */
  area3Open(): boolean {
    return this.areaOpen(3);
  }

  /** Area the star bar tracks: the newest open one. */
  currentArea(): number {
    let a = 1;
    for (const e of this.area.expansions) if (this.state.built[e.gateObjectId]) a = Math.max(a, e.area);
    return a;
  }

  private readonly boundsTmp: Rect = { x0: 0, z0: 0, x1: 0, z1: 0 };

  /** Where the coach may walk: the box around every open plot (borders and empty corners are obstacles). */
  coachBounds(): Rect {
    const b = this.boundsTmp;
    b.x0 = this.area.bounds.x0;
    b.z0 = this.area.bounds.z0;
    b.x1 = this.area.bounds.x1;
    b.z1 = this.area.bounds.z1;
    for (const e of this.area.expansions) {
      if (!this.state.built[e.gateObjectId]) continue;
      b.x0 = Math.min(b.x0, e.bounds.x0);
      b.z0 = Math.min(b.z0, e.bounds.z0);
      b.x1 = Math.max(b.x1, e.bounds.x1);
      b.z1 = Math.max(b.z1, e.bounds.z1);
    }
    return b;
  }

  /** Stars earned / available in the current area (HUD star bar). */
  areaStars(): { have: number; total: number } {
    const a = this.currentArea();
    let have = 0;
    for (const p of this.world.padList) if (p.area === a && this.state.pads[p.id]?.done) have += p.stars;
    return { have, total: this.world.areaStars[a] ?? 0 };
  }

  /** Squad size: 5-a-side, 7 with the Training Ground pitch, 11 with the Youth Stadium. */
  squadSize(): number {
    const b = this.state.built;
    return b.youth_stadium ? BALANCE.squad.sizeEleven : b.seven_pitch ? BALANCE.squad.sizeSeven : BALANCE.squad.size;
  }

  /** Match cash multiplier from the pitches, stands and floodlights. */
  matchCashMult(): number {
    const b = this.state.built;
    const A = BALANCE.area3;
    if (b.youth_stadium) {
      return BALANCE.squad.stadiumCashMult + (b.stand_main ? A.standCashMult : 0) + (b.stand_sides ? A.standCashMult : 0) + (b.stadium_lights ? A.lightsCashMult : 0);
    }
    return b.seven_pitch ? BALANCE.squad.sevenCashMult : 1;
  }

  /** Fan Shop takings per second (0 until it is built). */
  shopRate(): number {
    const b = this.state.built;
    if (!b[this.area.shop.objectId]) return 0;
    const stands = (b.stand_main ? 1 : 0) + (b.stand_sides ? 1 : 0);
    return BALANCE.area3.shopCashPerSec * (1 + stands * BALANCE.area3.shopPerStand) * this.upMult('academy_shop', 1);
  }

  activeTrainees(): number {
    let n = 0;
    for (const t of this.state.trainees)
      if (t.state === 'toLocker' || t.state === 'changing' || t.state === 'queued' || t.state === 'toLane' || t.state === 'training') n++;
    return n;
  }

  trainingCapacity(): number {
    let cap = 0;
    for (const id of Object.keys(this.state.stations)) cap += (this.state.stations[id]?.lanes ?? 0) + BALANCE.trainee.maxQueue;
    return cap;
  }

  canSign(): boolean {
    return this.activeTrainees() < this.trainingCapacity();
  }

  deskTrainee(): Trainee | undefined {
    for (const t of this.state.trainees) if (t.state === 'atDesk') return t;
    return undefined;
  }

  freeSeats(): number {
    let n = 0;
    for (const v of this.state.seats) if (v === 0) n++;
    return n;
  }

  completionPct(): number {
    const pads = this.world.padList;
    const done = pads.filter((p) => this.state.pads[p.id]?.done).length;
    return (done / pads.length) * 100;
  }

  private addCash(amount: number): void {
    this.state.cash += amount;
    this.state.earned += amount;
  }

  private addXp(n: number): void {
    const s = this.state;
    s.xp += n;
    const lvl = levelForXp(s.xp);
    while (s.level < lvl) {
      s.level++;
      this.events.emit('levelUp', { level: s.level });
      const r = Meta.grantChest(s, s.level);
      this.events.emit('chest', { level: s.level, cash: r.cash, tickets: r.tickets });
    }
  }

  private setGoal(a: Agent, x: number, z: number): void {
    a.goal = { x, z };
    a.path = [];
    a.pathI = 0;
    a.stuckT = 0;
    a.bestD = Infinity;
  }

  /** Moves an agent along its nav path. Returns true once the goal is reached (or there is none). */
  private moveAgent(a: Agent, speed: number, dt: number): boolean {
    if (!a.goal) {
      a.moving = false;
      return true;
    }
    if (a.path.length === 0) {
      a.path = this.nav.findPath(a.x, a.z, a.goal.x, a.goal.z);
      a.pathI = 0;
      a.bestD = Infinity;
      a.stuckT = 0;
    }
    let budget = speed * dt;
    while (budget > 0) {
      const wx = a.path[a.pathI * 2] as number;
      const wz = a.path[a.pathI * 2 + 1] as number;
      const dx = wx - a.x;
      const dz = wz - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.01) a.yaw = yawFor(dx, dz);
      if (d <= budget) {
        a.x = wx;
        a.z = wz;
        budget -= d;
        a.pathI++;
        a.bestD = Infinity;
        a.stuckT = 0;
        if (a.pathI * 2 >= a.path.length) {
          a.goal = null;
          a.path = [];
          a.moving = false;
          return true;
        }
      } else {
        a.x += (dx / d) * budget;
        a.z += (dz / d) * budget;
        budget = 0;
        // stuck watchdog: no progress towards the waypoint for a while → teleport to it
        const nd = d - speed * dt;
        if (nd < a.bestD - 0.02) {
          a.bestD = nd;
          a.stuckT = 0;
        } else {
          a.stuckT += dt;
          if (a.stuckT > BALANCE.trainee.stuckSec) {
            a.x = wx;
            a.z = wz;
            a.stuckT = 0;
          }
        }
      }
    }
    a.moving = true;
    return false;
  }

  // ───────────────────────────── tick ─────────────────────────────

  tick(dt: number): void {
    const s = this.state;
    s.time += dt;
    s.coach.px = s.coach.x;
    s.coach.pz = s.coach.z;
    s.bus.pz = s.bus.z;
    for (const t of s.trainees) {
      t.px = t.x;
      t.pz = t.z;
    }
    for (const f of s.staff) {
      f.px = f.x;
      f.pz = f.z;
    }
    this.updateCoach(dt);
    this.updatePiles();
    this.updatePads(dt);
    this.updateCrateAndBaskets(dt);
    this.updateDesk(dt);
    this.updateBus(dt);
    this.updateTrainees(dt);
    this.updateStations();
    this.updateStaff(dt);
    this.updateAccountant(dt);
    this.updateShop(dt);
    if (this.earnedPrev >= 0) Meta.trackIncome(s.meta, s.earned - this.earnedPrev, dt);
    this.earnedPrev = s.earned;
    this.metaT -= dt;
    if (this.metaT <= 0) {
      this.metaT = 1;
      this.updateMeta();
    }
    this.updatePodium(dt);
    this.updatePrompts();
    s.rng = this.rng.state;
    this.objT -= dt;
    if (this.objT <= 0) {
      this.objT = BALANCE.objectives.interval;
      this.refreshObjective();
    }
    this.guide.update(dt);
  }

  refreshObjective(): void {
    const next = computeObjective(this);
    const prev = this.objective;
    const changed =
      !prev !== !next ||
      (prev && next && (prev.key !== next.key || prev.targetId !== next.targetId || prev.params?.name !== next.params?.name));
    this.objective = next;
    if (changed) this.events.emit('objectiveChanged', { objective: next });
  }

  private updateCoach(dt: number): void {
    const c = this.state.coach;
    const B = BALANCE.coach;
    let ix = this.input.x;
    let iz = this.input.z;
    const m = Math.hypot(ix, iz);
    if (m > 1) {
      ix /= m;
      iz /= m;
    }
    const maxSp = this.coachSpeed();
    const tvx = ix * maxSp;
    const tvz = iz * maxSp;
    let ax = tvx - c.vx;
    let az = tvz - c.vz;
    const dv = Math.hypot(ax, az);
    const maxDv = B.accel * dt;
    if (dv > maxDv) {
      ax = (ax / dv) * maxDv;
      az = (az / dv) * maxDv;
    }
    c.vx += ax;
    c.vz += az;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    for (const r of this.obstacles) pushOutOfRect(c, B.radius, r);
    const b = this.coachBounds();
    c.x = Math.max(b.x0 + B.radius, Math.min(b.x1 - B.radius, c.x));
    c.z = Math.max(b.z0 + B.radius, Math.min(b.z1 - B.radius, c.z));
    const sp = Math.hypot(c.vx, c.vz);
    if (sp > 0.3) c.yaw = yawFor(c.vx, c.vz);
    c.moved += Math.hypot(c.x - c.px, c.z - c.pz);
  }

  private updatePiles(): void {
    const s = this.state;
    const c = s.coach;
    const r2 = BALANCE.cash.collectRadius * BALANCE.cash.collectRadius;
    for (let i = s.piles.length - 1; i >= 0; i--) {
      const p = s.piles[i];
      if (!p || p.amount < 1) continue;
      if (dist2(c.x, c.z, p.x, p.z) > r2) continue;
      const amount = Math.floor(p.amount);
      p.amount -= amount;
      this.addCash(amount);
      s.stats.cashCollected += amount;
      s.flags.firstCash = true;
      Meta.questProgress(s, 'collect', amount);
      this.events.emit('cashCollected', { pileId: p.id, amount, x: p.x, z: p.z });
      if (p.id.startsWith('starter')) s.piles.splice(i, 1);
    }
  }

  private updatePads(dt: number): void {
    const s = this.state;
    const c = s.coach;
    const P = BALANCE.pad;
    let on: PadDef | null = null;
    for (const p of this.world.padList) {
      if (!this.isPadVisible(p)) continue;
      if (dist2(c.x, c.z, p.pos.x, p.pos.z) <= P.radius * P.radius) {
        on = p;
        break;
      }
    }
    this.paying = false;
    if (!on) {
      c.padId = null;
      c.padT = 0;
      return;
    }
    if (c.padId !== on.id) {
      c.padId = on.id;
      c.padT = 0;
    }
    c.padT += dt;
    if (c.padT < P.startDelay || s.cash <= 0) return;
    const ps = s.pads[on.id];
    if (!ps) return;
    const duration = Math.max(P.minDuration, Math.min(P.maxDuration, on.cost * P.durationPerCash));
    const rate = on.cost / duration;
    const amt = Math.min(rate * dt, s.cash, on.cost - ps.paid);
    if (amt <= 0) return;
    ps.paid += amt;
    s.cash -= amt;
    this.paying = true;
    if (ps.paid >= on.cost - 1e-6) {
      ps.paid = on.cost;
      this.unlockPad(on);
    }
  }

  /** Completes a pad (also used by the debug overlay / tests). */
  unlockPad(p: PadDef): void {
    const s = this.state;
    const ps = s.pads[p.id];
    if (!ps || ps.done) return;
    ps.done = true;
    ps.paid = p.cost;
    s.stars += p.stars;
    s.stats.unlocks++;
    s.flags.firstUnlock = true;
    const u = p.unlock;
    if (u.type === 'station') {
      s.built[u.id] = true;
      const st = this.station(u.id);
      s.stations[u.id] = { lanes: 1, balls: 0, occupants: [0], queue: [] };
      if (!this.pile('st:' + u.id)) s.piles.push({ id: 'st:' + u.id, x: st.pile.x, z: st.pile.z, amount: 0 });
      if (u.id === 'shooting_goal' && !s.flags.busEnabled) {
        s.flags.busEnabled = true;
        s.bus.timer = BALANCE.bus.firstDelay;
      }
    } else if (u.type === 'lane') {
      const ss = s.stations[u.station];
      const st = this.station(u.station);
      if (ss && ss.lanes < st.lanes.length) {
        ss.lanes++;
        ss.occupants.push(0);
      }
    } else if (u.type === 'object') {
      s.built[u.id] = true;
      if (u.id === this.area.matchPitch.objectId) s.matchNextAt = s.time;
      if (u.id === this.area.shop.objectId && !this.pile('shop')) s.piles.push({ id: 'shop', x: this.area.shop.pile.x, z: this.area.shop.pile.z, amount: 0 });
    } else if (u.type === 'staff') {
      s.built[u.id] = true;
      const kind: Staff['kind'] = u.id.startsWith('assistant:')
        ? 'assistant'
        : u.id === 'receptionist' || u.id === 'accountant'
          ? u.id
          : u.id.startsWith('water_carrier')
            ? 'water_carrier'
            : u.id.startsWith('kit_manager')
              ? 'kit_manager'
              : 'ball_boy';
      const spot = this.area.staffSpots[u.id];
      const f: Staff = { ...makeAgent(spot?.x ?? p.pos.x, spot?.z ?? p.pos.z), id: u.id, kind, state: 'idle', carry: 0, target: null, timer: 0 };
      if (spot) f.yaw = spot.yaw;
      s.staff.push(f);
      if (kind === 'accountant' && !this.pile('safe')) s.piles.push({ id: 'safe', x: this.area.safe.x, z: this.area.safe.z, amount: 0 });
      this.events.emit('staffHired', { id: u.id });
    }
    this.rebuildWorld();
    this.addXp(p.xp);
    this.events.emit('unlocked', { padId: p.id, x: p.pos.x, z: p.pos.z, stars: p.stars, major: !!p.major });
    this.events.emit('saveNeeded', { reason: 'unlock' });
    this.refreshObjective();
  }

  // ───────────────────────────── upgrades (M3) ─────────────────────────────

  upLevel(id: string): number {
    return this.state.upgrades[id] ?? 0;
  }

  /** 1 + step × level (sign +1), or (1 − step)^level for "less is better" effects (sign −1). */
  upMult(id: string, sign: 1 | -1): number {
    const def = UPGRADE_BY_ID.get(id as UpgradeId);
    const lv = this.upLevel(id);
    if (!def || lv === 0) return 1;
    return sign > 0 ? 1 + def.step * lv : Math.pow(1 - def.step, lv);
  }

  /** Cost of the next level, or null at max level. */
  upgradeCost(id: string): number | null {
    const def = UPGRADE_BY_ID.get(id as UpgradeId);
    if (!def) return null;
    const lv = this.upLevel(id);
    if (lv >= def.maxLevel) return null;
    return Math.round((def.base * Math.pow(def.growth, lv)) / 5) * 5;
  }

  /** Requirements met (station / object built, staff hired). */
  upgradeUnlocked(id: string): boolean {
    const def = UPGRADE_BY_ID.get(id as UpgradeId);
    if (!def) return false;
    const r = def.requires;
    if (r?.built && !this.state.built[r.built] && !this.state.stations[r.built]) return false;
    if (r?.staff && !this.state.staff.some((f) => f.id === r.staff)) return false;
    return true;
  }

  /**
   * An upgrade of `cost` doesn't stall the next pad: it costs at most a share of the cheapest visible pad
   * (a larger share while saving for an area gate). True when no pad is left.
   */
  upgradeFitsBudget(cost: number): boolean {
    let next: PadDef | null = null;
    for (const p of this.visiblePads()) if (!next || this.padRemaining(p) < this.padRemaining(next)) next = p;
    if (!next) return true;
    const u = next.unlock;
    const gate = u.type === 'object' && this.area.expansions.some((e) => e.gateObjectId === u.id);
    return cost <= this.padRemaining(next) * (gate ? BALANCE.objectives.upgradeShareGate : BALANCE.objectives.upgradeShare);
  }

  /** Cheapest upgrade the player could buy right now (ignores cash), or null. */
  cheapestUpgrade(): { id: string; cost: number } | null {
    let best: { id: string; cost: number } | null = null;
    for (const u of UPGRADES) {
      if (!this.upgradeUnlocked(u.id)) continue;
      const c = this.upgradeCost(u.id);
      if (c !== null && (!best || c < best.cost)) best = { id: u.id, cost: c };
    }
    return best;
  }

  buyUpgrade(id: string): boolean {
    const s = this.state;
    const cost = this.upgradeCost(id);
    if (cost === null || !this.upgradeUnlocked(id) || s.cash + 1e-6 < cost) return false;
    s.cash -= cost;
    s.upgrades[id] = this.upLevel(id) + 1;
    s.stats.unlocks++;
    Meta.questProgress(s, 'upgrade');
    this.addXp(BALANCE.xp.perUpgrade);
    this.events.emit('upgraded', { id, level: s.upgrades[id] as number });
    this.events.emit('saveNeeded', { reason: 'upgrade' });
    this.refreshObjective();
    return true;
  }

  coachSpeed(): number {
    return BALANCE.coach.speed * this.upMult('coach_speed', 1);
  }

  carryCap(): number {
    return BALANCE.coach.carryCap + this.upLevel('coach_carry') * (UPGRADE_BY_ID.get('coach_carry')?.step ?? 1);
  }

  signTime(): number {
    return BALANCE.desk.signTime * this.upMult('coach_sign', -1);
  }

  ballBoySpeed(): number {
    return BALANCE.staff.ballBoy.speed * this.upMult('ballboy_speed', 1);
  }

  ballBoyCarry(): number {
    return BALANCE.staff.ballBoy.carryCap + this.upLevel('ballboy_carry') * (UPGRADE_BY_ID.get('ballboy_carry')?.step ?? 1);
  }

  /** Rep time multiplier for a drill: its level, and an Assistant Coach if hired (driven harder by the staff upgrade). */
  stationRepMult(stationId: string | null): number {
    if (!stationId) return 1;
    let m = this.upMult('st:' + stationId, -1);
    if (this.state.staff.some((f) => f.id === 'assistant:' + stationId)) m *= BALANCE.staff.assistant.repTimeMult * this.upMult('assistant_drive', -1);
    return m;
  }

  /** Index among runners of the same kind (ball boys / water carriers) for their idle spots. */
  private ballBoyIndex(f: Staff): number {
    let i = 0;
    for (const o of this.state.staff) {
      if (o === f) return i;
      if (o.kind === f.kind) i++;
    }
    return i;
  }

  /** Accountant: drains every cash pile into the office safe. */
  private updateAccountant(dt: number): void {
    if (!this.hasStaff('accountant')) return;
    const safe = this.pile('safe');
    if (!safe) return;
    const A = BALANCE.staff.accountant;
    for (const p of this.state.piles) {
      if (p === safe || p.amount < A.minPile) continue;
      const take = Math.min(p.amount, A.ratePerSec * dt * Math.max(1, p.amount / 40));
      p.amount -= take;
      safe.amount += take;
      // a coin arc for the view every ~0.4 s per pile (deterministic: from sim time)
      if (this.state.time % 0.4 < dt) this.events.emit('cashToSafe', { pileId: p.id, amount: take });
    }
  }

  /** Fan Shop: takings land on its pile by the walkway (the accountant banks them like any pile). */
  private updateShop(dt: number): void {
    const r = this.shopRate();
    if (r <= 0) return;
    const p = this.pile('shop');
    if (p) p.amount += r * dt;
  }

  private staffHome(i = 0, kind: Staff['kind'] = 'ball_boy'): { x: number; z: number } {
    const sup = runnerSupply(kind);
    const sp = sup === 'water' ? this.area.water.spot : sup === 'bib' ? this.area.bibs.spot : this.area.crate.spot;
    return { x: sp.x - 1.8 + i * 3.6, z: sp.z + 0.6 };
  }

  /** Where `supply` is picked up, if that source is built. */
  supplySource(supply: Supply): { x: number; z: number } | null {
    if (supply === 'water') return this.state.built[this.area.water.objectId] ? this.area.water.spot : null;
    if (supply === 'bib') return this.state.built[this.area.bibs.objectId] ? this.area.bibs.spot : null;
    return this.state.built.ball_crate ? this.area.crate.spot : null;
  }

  /** What the coach's stack holds (an empty stack can take either). */
  coachCarryKind(): Supply {
    return this.state.coach.carryKind ?? 'ball';
  }

  private updateCrateAndBaskets(dt: number): void {
    const s = this.state;
    const c = s.coach;
    const B = BALANCE.coach;
    // ball crate / hydration point → carry stack (one kind at a time)
    const zr = BALANCE.crate.zoneRadius;
    const cap = this.carryCap();
    let picking = false;
    for (const kind of SUPPLIES) {
      const src = this.supplySource(kind);
      if (!src || dist2(c.x, c.z, src.x, src.z) > zr * zr) continue;
      // stepping into the other source swaps the stack (balls go back in the crate, never a dead end)
      if (c.carry > 0 && this.coachCarryKind() !== kind) c.carry = 0;
      if (c.carry >= cap) break;
      picking = true;
      c.pickT += dt;
      while (c.pickT >= B.pickupInterval && c.carry < cap) {
        c.pickT -= B.pickupInterval;
        c.carry++;
        c.carryKind = kind;
        s.flags.firstPickup = true;
        this.events.emit('ballPicked', { carry: c.carry, byStaff: false, kind });
      }
      break;
    }
    if (!picking) c.pickT = B.pickupInterval; // first item is instant next time
    // carry stack → baskets that take it
    let dropping = false;
    if (c.carry > 0) {
      const br = BALANCE.basket.zoneRadius;
      const kind = this.coachCarryKind();
      for (const id of Object.keys(s.stations)) {
        const st = this.station(id);
        const ss = s.stations[id];
        if (!st.basket || !ss || st.supply !== kind) continue;
        if (ss.balls >= st.cfg.basketCap) continue;
        if (dist2(c.x, c.z, st.basket.x, st.basket.z) > br * br) continue;
        dropping = true;
        c.dropT += dt;
        while (c.dropT >= B.dropInterval && c.carry > 0 && ss.balls < st.cfg.basketCap) {
          c.dropT -= B.dropInterval;
          c.carry--;
          ss.balls++;
          s.stats.ballsDelivered++;
          if (kind === 'water') s.flags.firstWater = true;
          else if (kind === 'bib') s.flags.firstBib = true;
          else s.flags.firstDelivery = true;
          this.events.emit('ballDropped', { stationId: id, byStaff: false });
        }
        break;
      }
    }
    if (!dropping) c.dropT = B.dropInterval;
  }

  private updateDesk(dt: number): void {
    const s = this.state;
    const c = s.coach;
    const t = this.deskTrainee();
    const spot = this.area.desk.coachSpot;
    const zr = BALANCE.desk.zoneRadius;
    const inZone = dist2(c.x, c.z, spot.x, spot.z) <= zr * zr;
    const rec = this.hasStaff('receptionist');
    if (t && (inZone || rec) && this.canSign()) {
      // the receptionist signs on their own; the coach at the desk speeds it up
      let rate = 0;
      if (inZone) rate += 1 / this.signTime();
      if (rec) rate += 1 / (this.signTime() * BALANCE.staff.receptionist.signTimeMult * this.upMult('reception_speed', -1));
      c.deskT += dt * rate;
      if (c.deskT >= 1) {
        c.deskT = 0;
        this.sign(t);
      }
    } else {
      c.deskT = Math.max(0, c.deskT - dt * 2);
    }
  }

  private sign(t: Trainee): void {
    const s = this.state;
    const fee = BALANCE.desk.signFee;
    const p = this.pile('desk');
    if (p) p.amount += fee;
    s.stats.signed++;
    s.flags.firstSign = true;
    Meta.questProgress(s, 'sign');
    t.waitT = 0;
    this.addXp(BALANCE.xp.perSign);
    this.events.emit('signed', { id: t.id, fee });
    this.sendToLocker(t);
    this.events.emit('saveNeeded', { reason: 'sign' });
  }

  /** Signed trainees change into the academy kit in the changing room; if every seat is taken they go straight out. */
  private sendToLocker(t: Trainee): void {
    const seats = this.area.lockers.seats;
    for (let i = 0; i < seats.length; i++) {
      let taken = false;
      for (const o of this.state.trainees) if (o !== t && o.seat === i && (o.state === 'toLocker' || o.state === 'changing')) taken = true;
      const sp = seats[i];
      if (taken || !sp) continue;
      t.seat = i;
      t.state = 'toLocker';
      t.repT = 0;
      this.setGoal(t, sp.x, sp.z);
      return;
    }
    this.sendToStation(t);
  }

  private sendToStation(t: Trainee): void {
    const s = this.state;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const id of Object.keys(s.stations)) {
      const ss = s.stations[id];
      if (!ss) continue;
      const st = this.station(id);
      let occ = 0;
      for (const o of ss.occupants) if (o) occ++;
      const load = occ + ss.queue.length;
      if (load >= ss.lanes + BALANCE.trainee.maxQueue) continue;
      const sv = st.stat === 'ALL' ? weakest(t.stats).v : t.stats[st.stat];
      const walk = Math.hypot(st.queueStart.x - t.x, st.queueStart.z - t.z);
      const score = (load / ss.lanes) * 10 + sv / 10 + (id === t.lastStationId ? 3 : 0) + walk * BALANCE.trainee.distWeight;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (!best) {
      // should not happen (capacity is checked before signing); fall back to the first station
      best = Object.keys(s.stations)[0] ?? null;
      if (!best) return;
    }
    const ss = s.stations[best];
    if (!ss) return;
    ss.queue.push(t.id);
    t.stationId = best;
    t.state = 'queued';
    t.lane = -1;
    t.goal = null;
  }

  private updateBus(dt: number): void {
    const s = this.state;
    const b = s.bus;
    const B = BALANCE.bus;
    if (!s.flags.busEnabled) return;
    const stopZ = this.area.gate.busStop.z;
    const startZ = -40;
    const endZ = 45;
    switch (b.phase) {
      case 'away':
        b.timer -= dt;
        if (b.timer <= 0 && this.freeSeats() > 0) {
          b.phase = 'arriving';
          b.t = 0;
          b.z = startZ;
          b.toDrop = Math.min(this.freeSeats(), s.stats.signed === 0 && s.trainees.length === 0 ? 1 : B.maxPerTrip);
        }
        break;
      case 'arriving': {
        b.t += dt;
        const k = Math.min(1, b.t / B.driveIn);
        const e = 1 - (1 - k) * (1 - k);
        b.z = startZ + (stopZ - startZ) * e;
        if (k >= 1) {
          b.phase = 'stopped';
          b.t = 0;
          this.events.emit('busArrived', EMPTY);
        }
        break;
      }
      case 'stopped':
        b.t += dt;
        if (b.toDrop > 0 && b.t >= 0.35) {
          b.t = 0;
          if (this.freeSeats() > 0) this.spawnTrainee();
          b.toDrop--;
        } else if (b.toDrop <= 0 && b.t >= B.dwell) {
          b.phase = 'leaving';
          b.t = 0;
        }
        break;
      case 'leaving': {
        b.t += dt;
        const k = Math.min(1, b.t / B.driveOut);
        b.z = stopZ + (endZ - stopZ) * k * k;
        if (k >= 1) {
          b.phase = 'away';
          b.z = startZ;
          b.timer = B.interval * (s.built.bus_shelter ? B.shelterIntervalMult : 1) * this.upMult('academy_bus', -1);
          this.events.emit('busLeft', EMPTY);
        }
        break;
      }
    }
  }

  spawnTrainee(): Trainee | undefined {
    const s = this.state;
    const seat = s.seats.indexOf(0);
    if (seat < 0) return undefined;
    const door = this.area.gate.door;
    const first = !s.flags.firstTraineeSpawned;
    // scouted prospects (scout missions, day-7 reward) ride the next bus
    const pro = first ? undefined : s.prospects.shift();
    const t = createTrainee(
      this.rng,
      s.nextId++,
      door.x,
      door.z,
      first ? { name: BALANCE.tutorial.firstTraineeName, rarity: 'rare', position: 'FW', female: false } : pro ? { rarity: pro.rarity, position: pro.position } : {},
    );
    if (pro) t.scouted = true;
    // with the Training Ground open, careers run longer (more drills to visit)
    if (this.area3Open()) t.gradOvr = Math.min(t.cap, t.startOvr + BALANCE.trainee.gradOvrGainArea3);
    else if (this.area2Open()) t.gradOvr = Math.min(t.cap, t.startOvr + BALANCE.trainee.gradOvrGainArea2);
    s.flags.firstTraineeSpawned = true;
    t.seat = seat;
    t.arrivalOrder = ++s.arrivalCounter;
    s.seats[seat] = t.id;
    const sp = this.seatPos[seat];
    if (sp) this.setGoal(t, sp.x, sp.z);
    s.trainees.push(t);
    this.events.emit('traineeArrived', { id: t.id });
    return t;
  }

  private updateTrainees(dt: number): void {
    const s = this.state;
    const speed = BALANCE.trainee.speed;
    let deskBusy = false;
    for (const t of s.trainees) if (t.state === 'toDesk' || t.state === 'atDesk') deskBusy = true;
    if (!deskBusy) {
      let next: Trainee | undefined;
      // the earliest arrival goes to the free desk — straight from the bus if nobody is seated before them
      for (const t of s.trainees) if ((t.state === 'seated' || t.state === 'arriving') && (!next || t.arrivalOrder < next.arrivalOrder)) next = t;
      if (next) {
        if (next.seat >= 0) s.seats[next.seat] = 0;
        next.seat = -1;
        next.state = 'toDesk';
        const ts = this.area.desk.traineeSpot;
        this.setGoal(next, ts.x, ts.z);
      }
    }
    for (let i = s.trainees.length - 1; i >= 0; i--) {
      const t = s.trainees[i] as Trainee;
      switch (t.state) {
        case 'arriving':
          if (this.moveAgent(t, speed, dt)) {
            t.state = 'seated';
            t.yaw = this.seatPos[t.seat]?.yaw ?? Math.PI;
          }
          break;
        case 'seated':
          t.waitT += dt;
          break;
        case 'toDesk':
          if (this.moveAgent(t, speed, dt)) {
            t.state = 'atDesk';
            const d = this.area.desk;
            t.yaw = yawFor(d.coachSpot.x - d.traineeSpot.x, d.coachSpot.z - d.traineeSpot.z);
          }
          break;
        case 'atDesk':
          t.waitT += dt;
          break;
        case 'toLocker':
          if (this.moveAgent(t, speed, dt)) {
            t.state = 'changing';
            t.repT = 0;
            t.yaw = this.area.lockers.yaw;
          }
          break;
        case 'changing':
          t.repT += dt / BALANCE.trainee.changeTime;
          if (t.repT >= 1) {
            t.repT = 0;
            t.seat = -1;
            this.sendToStation(t);
          }
          break;
        case 'queued': {
          const ss = t.stationId ? s.stations[t.stationId] : undefined;
          if (!ss || !t.stationId) break;
          const idx = ss.queue.indexOf(t.id);
          const slot = this.world.queueSlot(this.station(t.stationId), Math.max(0, idx));
          if (!t.goal || Math.abs(t.goal.x - slot.x) > 0.01 || Math.abs(t.goal.z - slot.z) > 0.01) {
            if (dist2(t.x, t.z, slot.x, slot.z) > 0.0004) this.setGoal(t, slot.x, slot.z);
          }
          if (this.moveAgent(t, speed, dt)) {
            const st = this.station(t.stationId);
            t.yaw = yawFor(-st.queueStep.x, -st.queueStep.z);
            t.waitT += dt;
          }
          break;
        }
        case 'toLane':
          if (this.moveAgent(t, speed, dt)) {
            t.state = 'training';
            t.repT = 0;
            t.repActive = false;
            if (t.stationId) {
              const lane = this.station(t.stationId).lanes[t.lane];
              if (lane) t.yaw = yawFor(lane.target.x - lane.spot.x, lane.target.z - lane.spot.z);
            }
          }
          break;
        case 'training':
          this.updateTraining(t, dt);
          break;
        case 'leaving':
          if (this.moveAgent(t, speed * 1.15, dt)) s.trainees.splice(i, 1);
          break;
        case 'toPodium':
        case 'atPodium':
          break; // updatePodium
      }
    }
  }

  private updateTraining(t: Trainee, dt: number): void {
    const s = this.state;
    if (!t.stationId) return;
    const ss = s.stations[t.stationId];
    if (!ss) return;
    const st = this.station(t.stationId);
    const cfg = st.cfg;
    if (!t.repActive) {
      if (cfg.ballsPerRep > 0 && ss.balls < cfg.ballsPerRep) {
        t.waitT += dt;
        return;
      }
      ss.balls -= cfg.ballsPerRep;
      t.repActive = true;
      t.repT = 0;
      this.events.emit('repStart', { traineeId: t.id, stationId: t.stationId });
    }
    t.repT += dt / (cfg.repTime * this.perk('repTimeMult') * this.stationRepMult(t.stationId));
    if (t.repT < 1) return;
    // rep complete
    t.repT = 0;
    t.repActive = false;
    t.waitT = 0;
    // the gym works on the weakest stat
    const stat: Stat = st.stat === 'ALL' ? weakest(t.stats).k : st.stat;
    const before = t.stats[stat];
    t.stats[stat] = Math.min(t.cap, before + cfg.statGain);
    const gain = t.stats[stat] - before;
    const cash = Math.round(cfg.cashPerRep * BALANCE.rarity.cashMult[t.rarity] * this.perk('feeMult') * this.upMult('st:' + t.stationId, 1));
    const p = this.pile('st:' + t.stationId);
    if (p) p.amount += cash;
    t.reps++;
    t.totalReps++;
    s.stats.reps++;
    s.flags.firstRep = true;
    Meta.questProgress(s, 'reps');
    this.events.emit('rep', { traineeId: t.id, stationId: t.stationId, stat, gain, cash });
    if (t.reps < BALANCE.trainee.repsPerVisit) return;
    // visit finished: free the lane
    ss.occupants[t.lane] = 0;
    t.reps = 0;
    t.lastStationId = t.stationId;
    t.lane = -1;
    if (this.ovr(t) >= t.gradOvr || this.ovrStalled(t)) {
      this.graduate(t);
    } else {
      this.sendToStation(t);
    }
  }

  /** Product of a perk multiplier over every built decor object. */
  perk(key: 'feeMult' | 'repTimeMult' | 'transferMult'): number {
    let m = 1;
    for (const [id, p] of Object.entries(BALANCE.perks)) if (this.state.built[id]) m *= p[key] ?? 1;
    return m;
  }

  /** A trainee whose trainable stats are all capped can't reach the target; let them graduate. */
  private ovrStalled(t: Trainee): boolean {
    for (const id of Object.keys(this.state.stations)) {
      const stat = this.station(id).stat;
      if ((stat === 'ALL' ? weakest(t.stats).v : t.stats[stat]) < t.cap) return false;
    }
    return true;
  }

  private graduate(t: Trainee): void {
    const s = this.state;
    s.stats.graduated++;
    // Tactics Room: graduates leave a little sharper all round
    if (s.built.tactics_room) for (const k of STATS) t.stats[k] += BALANCE.area3.tacticsStatBonus;
    this.addXp(BALANCE.xp.perGraduation);
    t.stationId = null;
    Meta.questProgress(s, 'graduate');
    if (Meta.albumAdd(s, t.position, t.rarity)) this.events.emit('albumSlot', { key: Meta.albumKey(t.position, t.rarity) });
    this.events.emit('graduated', { id: t.id });
    if (s.podiumQueue.length >= this.area.office.seats.length) {
      // office bench full: the club's scouts take the graduate at the standard fee (never blocks training)
      this.sell(t, false);
    } else {
      s.podiumQueue.push(t.id);
      t.state = 'toPodium';
      t.goal = null;
      this.events.emit('graduateWaiting', { id: t.id });
    }
    this.events.emit('saveNeeded', { reason: 'graduate' });
  }

  // ───────────────────────────── podium, transfers, squad (M2) ─────────────────────────────

  /** Office bench seat of the i-th waiting graduate (0 = next up). "Podium" names are kept for save compatibility. */
  podiumSlot(i: number): { x: number; z: number } {
    const seats = this.area.office.seats;
    return seats[Math.min(i, seats.length - 1)] ?? this.area.office.computer;
  }

  /** The graduate whose transfer the coach decides next (seated in the office). */
  podiumGraduate(): Trainee | undefined {
    const id = this.state.podiumQueue[0];
    const t = id !== undefined ? this.trainee(id) : undefined;
    return t && t.state === 'atPodium' ? t : undefined;
  }

  /** Transfer value from OVR and rarity (rounded to $5). */
  transferValue(p: { position: Player['position']; stats: Player['stats']; rarity: Rarity }): number {
    const T = BALANCE.transfer;
    const ovr = computeOvr(p.position, p.stats);
    return Math.max(5, Math.round((T.base * Math.pow(ovr / T.ovrRef, T.exp) * T.rarityMult[p.rarity] * this.perk('transferMult') * this.upMult('coach_negotiation', 1)) / 5) * 5);
  }

  /** Fictional buying club for a player (stable per id). */
  buyerFor(id: number): string {
    return BUYERS[(id * 7 + 3) % BUYERS.length] as string;
  }

  private updatePodium(dt: number): void {
    const s = this.state;
    const speed = BALANCE.trainee.speed;
    for (let i = 0; i < s.podiumQueue.length; i++) {
      const t = this.trainee(s.podiumQueue[i] as number);
      if (!t) {
        s.podiumQueue.splice(i--, 1);
        continue;
      }
      const slot = this.podiumSlot(i);
      if (dist2(t.x, t.z, slot.x, slot.z) > 0.0004) {
        if (!t.goal || Math.abs(t.goal.x - slot.x) > 0.01 || Math.abs(t.goal.z - slot.z) > 0.01) this.setGoal(t, slot.x, slot.z);
        t.state = 'toPodium';
        if (this.moveAgent(t, speed, dt)) t.state = 'atPodium';
      } else {
        t.goal = null;
        t.moving = false;
        t.state = 'atPodium';
        t.yaw = this.area.office.seatYaw;
      }
    }
  }

  private updatePrompts(): void {
    const s = this.state;
    const c = s.coach;
    const P = this.area.office.computer;
    const pr = BALANCE.transfer.zoneRadius;
    const inPodium = dist2(c.x, c.z, P.x, P.z) <= pr * pr;
    if (!inPodium) this.latched.podium = false;
    const K = this.area.matchPitch.kickoff;
    const kr = BALANCE.match.kickoffRadius;
    const inKick = dist2(c.x, c.z, K.x, K.z) <= kr * kr;
    if (!inKick) this.latched.kickoff = false;
    if (this.prompt) return;
    // the office computer: transfers (graduate waiting) and upgrades; re-opens when a new graduate sits down
    const gid = this.podiumGraduate()?.id ?? 0;
    // still standing there after closing it with a graduate waiting: re-open after a short pause
    const nudge = gid !== 0 && s.time - this.dismissedAt > BALANCE.transfer.reopenSec;
    if (inPodium && (!this.latched.podium || (gid !== 0 && gid !== this.promptedGrad) || nudge)) {
      this.prompt = 'podium';
      this.latched.podium = true;
      this.promptedGrad = gid;
      this.events.emit('podiumOpen', { id: gid });
    } else if (inKick && !this.latched.kickoff && this.matchAvailable()) {
      this.prompt = 'kickoff';
      this.latched.kickoff = true;
      this.events.emit('kickoffReady', EMPTY);
    }
  }

  /** The UI closed a prompt without acting; it re-opens once the coach steps out and back in. */
  dismissPrompt(): void {
    this.prompt = null;
    this.dismissedAt = this.state.time;
  }

  private sell(t: Trainee, fromPodium: boolean): number {
    const s = this.state;
    const price = this.transferValue(t);
    const prev = s.records.bestSale;
    this.addCash(price);
    s.records.sold++;
    Meta.questProgress(s, 'sell');
    s.records.bestSale = Math.max(prev, price);
    if (fromPodium) s.podiumQueue = s.podiumQueue.filter((id) => id !== t.id);
    t.state = 'leaving';
    t.stationId = null;
    const ex = this.area.gate.exit;
    this.setGoal(t, ex.x, ex.z);
    this.events.emit('sold', { id: t.id, name: t.name, price, buyer: this.buyerFor(t.id), record: prev > 0 && price > prev, fromSquad: false });
    return price;
  }

  /** The coach's podium decision for the graduate on top. */
  decideGraduate(choice: 'sell' | 'promote'): void {
    const s = this.state;
    const t = this.podiumGraduate();
    this.prompt = null;
    if (!t) return;
    if (choice === 'sell') this.sell(t, true);
    else {
      let replaced: { name: string; price: number } | null = null;
      if (s.squad.length >= this.squadSize()) {
        const weakest = this.weakestSquadPlayer();
        if (weakest) replaced = { name: weakest.name, price: this.releasePlayer(weakest.id) };
      }
      s.squad.push({
        id: t.id,
        name: t.name,
        age: t.age,
        position: t.position,
        rarity: t.rarity,
        female: t.female,
        look: { ...t.look },
        stats: { ...t.stats },
        cap: t.cap,
        apps: 0,
        goals: 0,
      });
      s.records.promoted++;
      s.podiumQueue = s.podiumQueue.filter((id) => id !== t.id);
      s.trainees = s.trainees.filter((o) => o !== t);
      this.events.emit('promoted', { id: t.id, replaced });
    }
    // the office panel shows the next graduate straight away if they're already seated: don't re-open for them
    // (one still walking in re-opens the computer when they sit down)
    this.promptedGrad = this.podiumGraduate()?.id ?? 0;
    this.events.emit('saveNeeded', { reason: 'podium' });
    this.refreshObjective();
  }

  weakestSquadPlayer(): Player | undefined {
    let w: Player | undefined;
    for (const p of this.state.squad) if (!w || computeOvr(p.position, p.stats) < computeOvr(w.position, w.stats)) w = p;
    return w;
  }

  /** Sells a squad player (squad panel, or to make room for a promotion). */
  releasePlayer(id: number): number {
    const s = this.state;
    const p = s.squad.find((q) => q.id === id);
    if (!p) return 0;
    const price = Math.round((this.transferValue(p) * BALANCE.transfer.releaseShare) / 5) * 5;
    const prev = s.records.bestSale;
    s.squad = s.squad.filter((q) => q !== p);
    this.addCash(price);
    s.records.sold++;
    s.records.bestSale = Math.max(prev, price);
    this.events.emit('sold', { id: p.id, name: p.name, price, buyer: this.buyerFor(p.id), record: prev > 0 && price > prev, fromSquad: true });
    this.events.emit('saveNeeded', { reason: 'release' });
    return price;
  }

  // ───────────────────────────── matches (M2) ─────────────────────────────

  matchAvailable(): boolean {
    const s = this.state;
    return !!s.built[this.area.matchPitch.objectId] && (s.time >= s.matchNextAt || this.cupAvailable()) && !this.match;
  }

  // ───────────────────────────── meta (M4): daily, quests, scouting, album ─────────────────────────────

  /** Once a second: new quests at local midnight, finished scout missions. */
  updateMeta(): void {
    const s = this.state;
    if (Meta.refreshQuests(s, this.now, this.rng, this.tz)) this.events.emit('questsRefreshed', EMPTY);
    const p = Meta.updateScout(s, this.now, this.rng);
    if (p) {
      this.events.emit('scoutDone', { rarity: p.rarity, position: p.position });
      this.events.emit('saveNeeded', { reason: 'scout' });
    }
  }

  /** Pays cash from outside the sim loop (offline earnings, rewarded ads); not counted as live income. */
  grantBonus(cash: number, reason = 'bonus'): void {
    if (cash <= 0) return;
    this.addCash(cash);
    this.earnedPrev = -1;
    this.events.emit('saveNeeded', { reason });
  }

  /** Pays what the staff earned while the player was away (computed by the host from the save's lastSeen). */
  collectOffline(cash: number): void {
    this.grantBonus(cash, 'offline');
  }

  /** Rewarded ad: the running scout mission returns now. */
  finishScoutNow(): boolean {
    const sc = this.state.meta.scout;
    if (!sc.tier) return false;
    sc.endsAt = Math.min(sc.endsAt, this.now);
    this.updateMeta();
    return true;
  }

  claimDaily(mult = 1): Meta.Reward | null {
    const r = Meta.claimDaily(this.state, this.now, this.rng, this.tz, mult);
    this.earnedPrev = -1;
    if (r) this.events.emit('saveNeeded', { reason: 'daily' });
    return r;
  }

  claimQuest(id: string): Meta.Reward | null {
    const r = Meta.claimQuest(this.state, id);
    this.earnedPrev = -1;
    if (r) this.events.emit('saveNeeded', { reason: 'quest' });
    return r;
  }

  startScout(tier: ScoutTier): boolean {
    const ok = Meta.startScout(this.state, tier, this.now);
    if (ok) this.events.emit('saveNeeded', { reason: 'scout' });
    return ok;
  }

  claimAlbum(): Meta.Reward | null {
    const r = Meta.claimAlbum(this.state);
    this.earnedPrev = -1;
    if (r) this.events.emit('saveNeeded', { reason: 'album' });
    return r;
  }

  /** Today's Daily Cup tie is waiting (played instead of the next league match, no timer). */
  cupAvailable(): boolean {
    return !!this.state.built[this.area.matchPitch.objectId] && Meta.cupAvailable(this.state, this.now, this.tz);
  }

  /** Today's cup opponent: rotates daily, stronger than the current division's best. */
  cupOpponent(): TeamDef {
    const day = Meta.dayKey(this.now, this.tz);
    let h = 0;
    for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const base = CUP_TEAMS[h % CUP_TEAMS.length] ?? CUP_TEAMS[0];
    const divTop = Math.max(...(DIVISIONS[this.state.league.division]?.teams ?? []).map((t) => t.strength));
    return { id: base?.id ?? 'cup', name: base?.name ?? 'Cup XI', shirt: base?.shirt ?? 0xffffff, shorts: base?.shorts ?? 0x1d2433, strength: divTop + BALANCE.meta.cup.strengthBonus };
  }

  /** Seconds until the next match (0 when available; Infinity without a pitch). */
  matchCountdown(): number {
    const s = this.state;
    if (!s.built[this.area.matchPitch.objectId]) return Infinity;
    return Math.max(0, s.matchNextAt - s.time);
  }

  /** Creates the highlight script. The caller pauses the sim while the match plays. */
  startMatch(): MatchScript {
    this.prompt = null;
    this.match = createMatch(
      this.rng,
      this.state.squad,
      this.state.league,
      this.cupAvailable() ? this.cupOpponent() : undefined,
      this.squadSize(),
      this.state.built.analysis_lab ? BALANCE.area3.analysisStrength : 0,
    );
    this.state.rng = this.rng.state;
    return this.match;
  }

  resolveMatchChance(i: number, quality = 0.5): boolean {
    const c = this.match?.chances[i];
    return c ? resolveChance(c, quality) : false;
  }

  finishCurrentMatch(): MatchResult | null {
    const s = this.state;
    const m = this.match;
    if (!m) return null;
    const r = finishMatch(this.rng, m, s.league, s.squad);
    r.cash = Math.round(r.cash * this.upMult('academy_matchday', 1) * this.matchCashMult());
    this.match = null;
    this.addCash(r.cash);
    this.addXp(r.xp);
    s.records.matches++;
    if (r.outcome === 'win') {
      s.records.wins++;
      Meta.questProgress(s, 'win');
    }
    s.records.goals += r.ourGoals;
    if (m.cup) {
      // the cup doesn't reset the league timer; a win adds Scout Tickets
      s.meta.cupDay = Meta.dayKey(this.now, this.tz);
      if (r.outcome === 'win') s.tickets += BALANCE.meta.cup.tickets;
    } else s.matchNextAt = s.time + BALANCE.match.interval;
    if (r.seasonOver) {
      if (r.champion) s.records.titles++;
      const div = r.promoted ? s.league.division + 1 : s.league.division;
      s.league = newLeague(div, s.league.season + 1);
      if (r.promoted) this.events.emit('divisionUp', { division: div });
    }
    s.rng = this.rng.state;
    this.latched.kickoff = true;
    this.events.emit('matchFinished', { result: r });
    this.events.emit('saveNeeded', { reason: 'match' });
    this.refreshObjective();
    return r;
  }

  private updateStations(): void {
    const s = this.state;
    for (const id of Object.keys(s.stations)) {
      const ss = s.stations[id];
      if (!ss) continue;
      const st = this.station(id);
      for (let lane = 0; lane < ss.lanes; lane++) {
        if (ss.occupants[lane] || ss.queue.length === 0) continue;
        const tid = ss.queue.shift() as number;
        const t = this.trainee(tid);
        if (!t) continue;
        ss.occupants[lane] = tid;
        t.lane = lane;
        t.state = 'toLane';
        const l = st.lanes[lane];
        if (l) this.setGoal(t, l.spot.x, l.spot.z);
      }
    }
  }

  // ───────────────────────────── staff ─────────────────────────────

  /** Station most in need of balls (or null). */
  /** Emptiest basket below `threshold` (fill ratio). With `self`, baskets another ball boy is already serving are skipped. */
  neediestStation(threshold: number, self?: Staff, supply: Supply = 'ball'): string | null {
    const s = this.state;
    let best: string | null = null;
    let bestR = threshold;
    for (const id of Object.keys(s.stations)) {
      const ss = s.stations[id];
      const st = this.station(id);
      if (!ss || !st.basket || st.cfg.basketCap <= 0 || st.supply !== supply) continue;
      if (self && s.staff.some((o) => o !== self && o.target === id)) continue;
      const r = ss.balls / st.cfg.basketCap;
      if (r < bestR) {
        bestR = r;
        best = id;
      }
    }
    return best;
  }

  private updateStaff(dt: number): void {
    const s = this.state;
    const B = BALANCE.staff.ballBoy;
    for (const f of s.staff) {
      // ball boys run crate → ball baskets; water carriers the Hydration Point; kit managers the Kit Room
      const supply = runnerSupply(f.kind);
      if (!supply) continue;
      const crate = this.supplySource(supply);
      switch (f.state) {
        case 'idle': {
          const need = this.neediestStation(B.refillBelow, f, supply);
          if (need && crate) {
            if (f.carry > 0) {
              f.target = need;
              f.state = 'toBasket';
              const st = this.station(need);
              if (st.basket) this.setGoal(f, st.basket.x, st.basket.z);
            } else {
              f.state = 'toCrate';
              this.setGoal(f, crate.x - 0.6, crate.z + 0.3);
            }
          } else {
            const h = this.staffHome(this.ballBoyIndex(f), f.kind);
            if (!f.goal && dist2(f.x, f.z, h.x, h.z) > 0.25) this.setGoal(f, h.x, h.z);
            this.moveAgent(f, this.ballBoySpeed(), dt);
          }
          break;
        }
        case 'toCrate':
          if (this.moveAgent(f, this.ballBoySpeed(), dt)) {
            f.state = 'loading';
            f.timer = 0;
          }
          break;
        case 'loading':
          f.timer += dt;
          while (f.timer >= BALANCE.coach.pickupInterval * 1.5 && f.carry < this.ballBoyCarry()) {
            f.timer -= BALANCE.coach.pickupInterval * 1.5;
            f.carry++;
            this.events.emit('ballPicked', { carry: f.carry, byStaff: true, kind: supply });
          }
          if (f.carry >= this.ballBoyCarry()) {
            const need = this.neediestStation(1, f, supply) ?? this.neediestStation(1, undefined, supply);
            if (need) {
              f.target = need;
              f.state = 'toBasket';
              const st = this.station(need);
              if (st.basket) this.setGoal(f, st.basket.x, st.basket.z);
            } else f.state = 'idle';
          }
          break;
        case 'toBasket':
          if (this.moveAgent(f, this.ballBoySpeed(), dt)) {
            f.state = 'unloading';
            f.timer = 0;
          }
          break;
        case 'unloading': {
          const ss = f.target ? s.stations[f.target] : undefined;
          const st = f.target ? this.station(f.target) : undefined;
          f.timer += dt;
          if (ss && st) {
            while (f.timer >= BALANCE.coach.dropInterval * 1.5 && f.carry > 0 && ss.balls < st.cfg.basketCap) {
              f.timer -= BALANCE.coach.dropInterval * 1.5;
              f.carry--;
              ss.balls++;
              s.stats.ballsDelivered++;
              this.events.emit('ballDropped', { stationId: f.target as string, byStaff: true });
            }
          }
          if (!ss || !st || f.carry === 0 || ss.balls >= st.cfg.basketCap) {
            f.target = null;
            if (f.carry > 0) {
              const need = this.neediestStation(1, f, supply) ?? this.neediestStation(1, undefined, supply);
              if (need) {
                f.target = need;
                f.state = 'toBasket';
                const ns = this.station(need);
                if (ns.basket) this.setGoal(f, ns.basket.x, ns.basket.z);
                break;
              }
            }
            f.state = 'idle';
          }
          break;
        }
      }
    }
  }

  // ───────────────────────────── queries for view / objectives ─────────────────────────────

  /** Trainee is at its lane but blocked by an empty basket. */
  isWaitingForBalls(t: Trainee): boolean {
    if (t.state !== 'training' || t.repActive || !t.stationId) return false;
    const ss = this.state.stations[t.stationId];
    const st = this.station(t.stationId);
    return !!ss && st.cfg.ballsPerRep > 0 && ss.balls < st.cfg.ballsPerRep;
  }

  traineeLabel(t: Trainee): string {
    return firstName(t);
  }
}
