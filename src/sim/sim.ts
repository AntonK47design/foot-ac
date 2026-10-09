import { BALANCE } from '../data/balance';
import { AREA1, PREBUILT_OBJECTS } from '../data/areas/area1';
import { SAVE_VERSION } from '../data/constants';
import type { AreaDef, PadDef, Rect, Stat } from '../data/types';
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { dist2, pushOutOfRect, yawFor } from './geom';
import { NavGrid } from './nav';
import { computeOvr, createTrainee, firstName } from './players';
import { makeAgent, type Agent, type SimState, type Staff, type Trainee } from './state';
import { WorldGeo, type StationGeo } from './world';
import { computeObjective, type Objective } from './objectives';

export interface SimEvents {
  cashCollected: { pileId: string; amount: number; x: number; z: number };
  unlocked: { padId: string; x: number; z: number; stars: number; major: boolean };
  ballPicked: { carry: number; byStaff: boolean };
  ballDropped: { stationId: string; byStaff: boolean };
  traineeArrived: { id: number };
  signed: { id: number; fee: number };
  repStart: { traineeId: number; stationId: string };
  rep: { traineeId: number; stationId: string; stat: Stat; gain: number; cash: number };
  graduated: { id: number; bonus: number };
  busArrived: Record<string, never>;
  busLeft: Record<string, never>;
  levelUp: { level: number };
  staffHired: { id: string };
  objectiveChanged: { objective: Objective | null };
  saveNeeded: { reason: string };
}

export interface SimInput {
  x: number;
  z: number;
}

const EMPTY = {} as Record<string, never>;

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
  };
}

/** The whole game simulation. Pure TS, deterministic for a given seed and input sequence. */
export class Sim {
  readonly events = new Emitter<SimEvents>();
  readonly world: WorldGeo;
  readonly nav: NavGrid;
  readonly input: SimInput = { x: 0, z: 0 };
  obstacles: Rect[] = [];
  objective: Objective | null = null;
  /** True while the coach is standing on a pad and cash is draining. */
  paying = false;
  private objT = 0;
  private readonly rng: Rng;
  private readonly seatPos: Array<{ x: number; z: number; yaw: number }> = [];

  constructor(
    public state: SimState = createInitialState(),
    readonly area: AreaDef = AREA1,
  ) {
    this.world = new WorldGeo(area);
    this.rng = new Rng(state.rng);
    this.nav = new NavGrid(area.navBounds, 0.5, this.world.walkable());
    this.rebuildWorld();
    this.syncLayout();
    this.objective = computeObjective(this);
  }

  /** Swaps in a different state (auth change, reset). */
  loadState(state: SimState): void {
    this.state = state;
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
      }
      t.x = t.px = p.x;
      t.z = t.pz = p.z;
    }
    for (const f of s.staff) {
      const h = this.staffHome(s.staff.indexOf(f));
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
    s.rng = this.rng.state;
    this.objT -= dt;
    if (this.objT <= 0) {
      this.objT = BALANCE.objectives.interval;
      this.refreshObjective();
    }
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
    const tvx = ix * B.speed;
    const tvz = iz * B.speed;
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
    const b = this.area.bounds;
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
    } else if (u.type === 'staff') {
      s.built[u.id] = true;
      const f: Staff = { ...makeAgent(p.pos.x, p.pos.z), id: u.id, kind: 'ball_boy', state: 'idle', carry: 0, target: null, timer: 0 };
      s.staff.push(f);
      this.events.emit('staffHired', { id: u.id });
    }
    this.rebuildWorld();
    this.addXp(p.xp);
    this.events.emit('unlocked', { padId: p.id, x: p.pos.x, z: p.pos.z, stars: p.stars, major: !!p.major });
    this.events.emit('saveNeeded', { reason: 'unlock' });
    this.refreshObjective();
  }

  private staffHome(i = 0): { x: number; z: number } {
    const sp = this.area.crate.spot;
    return { x: sp.x - 1.8 + i * 3.6, z: sp.z + 0.6 };
  }

  private updateCrateAndBaskets(dt: number): void {
    const s = this.state;
    const c = s.coach;
    const B = BALANCE.coach;
    // crate → carry stack
    const crate = this.area.crate.spot;
    const zr = BALANCE.crate.zoneRadius;
    if (s.built.ball_crate && dist2(c.x, c.z, crate.x, crate.z) <= zr * zr && c.carry < B.carryCap) {
      c.pickT += dt;
      while (c.pickT >= B.pickupInterval && c.carry < B.carryCap) {
        c.pickT -= B.pickupInterval;
        c.carry++;
        s.flags.firstPickup = true;
        this.events.emit('ballPicked', { carry: c.carry, byStaff: false });
      }
    } else {
      c.pickT = B.pickupInterval; // first ball is instant next time
    }
    // carry stack → baskets
    let dropping = false;
    if (c.carry > 0) {
      const br = BALANCE.basket.zoneRadius;
      for (const id of Object.keys(s.stations)) {
        const st = this.station(id);
        const ss = s.stations[id];
        if (!st.basket || !ss) continue;
        if (ss.balls >= st.cfg.basketCap) continue;
        if (dist2(c.x, c.z, st.basket.x, st.basket.z) > br * br) continue;
        dropping = true;
        c.dropT += dt;
        while (c.dropT >= B.dropInterval && c.carry > 0 && ss.balls < st.cfg.basketCap) {
          c.dropT -= B.dropInterval;
          c.carry--;
          ss.balls++;
          s.stats.ballsDelivered++;
          s.flags.firstDelivery = true;
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
    if (t && inZone && this.canSign()) {
      c.deskT += dt / BALANCE.desk.signTime;
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
      const score = (load / ss.lanes) * 10 + t.stats[st.stat] / 10 + (id === t.lastStationId ? 3 : 0);
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
          b.timer = B.interval * (s.built.bus_shelter ? B.shelterIntervalMult : 1);
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
    const t = createTrainee(this.rng, s.nextId++, door.x, door.z, first ? { name: BALANCE.tutorial.firstTraineeName, rarity: 'rare', position: 'FW', female: false } : {});
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
    t.repT += dt / (cfg.repTime * this.perk('repTimeMult'));
    if (t.repT < 1) return;
    // rep complete
    t.repT = 0;
    t.repActive = false;
    t.waitT = 0;
    const before = t.stats[st.stat];
    t.stats[st.stat] = Math.min(t.cap, before + cfg.statGain);
    const gain = t.stats[st.stat] - before;
    const cash = Math.round(cfg.cashPerRep * BALANCE.rarity.cashMult[t.rarity] * this.perk('feeMult'));
    const p = this.pile('st:' + t.stationId);
    if (p) p.amount += cash;
    t.reps++;
    t.totalReps++;
    s.stats.reps++;
    s.flags.firstRep = true;
    this.events.emit('rep', { traineeId: t.id, stationId: t.stationId, stat: st.stat, gain, cash });
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
  perk(key: 'feeMult' | 'repTimeMult' | 'gradBonusMult'): number {
    let m = 1;
    for (const [id, p] of Object.entries(BALANCE.perks)) if (this.state.built[id]) m *= p[key] ?? 1;
    return m;
  }

  /** A trainee whose trainable stats are all capped can't reach the target; let them graduate. */
  private ovrStalled(t: Trainee): boolean {
    for (const id of Object.keys(this.state.stations)) if (t.stats[this.station(id).stat] < t.cap) return false;
    return true;
  }

  private graduate(t: Trainee): void {
    const s = this.state;
    const bonus = Math.round(BALANCE.trainee.graduationBonus * this.perk('gradBonusMult'));
    const p = this.pile('desk');
    if (p) p.amount += bonus;
    s.stats.graduated++;
    this.addXp(BALANCE.xp.perGraduation);
    t.state = 'leaving';
    t.stationId = null;
    const ex = this.area.gate.exit;
    this.setGoal(t, ex.x, ex.z);
    this.events.emit('graduated', { id: t.id, bonus });
    this.events.emit('saveNeeded', { reason: 'graduate' });
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
  neediestStation(threshold: number, self?: Staff): string | null {
    const s = this.state;
    let best: string | null = null;
    let bestR = threshold;
    for (const id of Object.keys(s.stations)) {
      const ss = s.stations[id];
      const st = this.station(id);
      if (!ss || !st.basket || st.cfg.basketCap <= 0) continue;
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
    const crate = this.area.crate.spot;
    for (const f of s.staff) {
      if (f.kind !== 'ball_boy') continue;
      switch (f.state) {
        case 'idle': {
          const need = this.neediestStation(B.refillBelow, f);
          if (need && s.built.ball_crate) {
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
            const h = this.staffHome(s.staff.indexOf(f));
            if (!f.goal && dist2(f.x, f.z, h.x, h.z) > 0.25) this.setGoal(f, h.x, h.z);
            this.moveAgent(f, B.speed, dt);
          }
          break;
        }
        case 'toCrate':
          if (this.moveAgent(f, B.speed, dt)) {
            f.state = 'loading';
            f.timer = 0;
          }
          break;
        case 'loading':
          f.timer += dt;
          while (f.timer >= BALANCE.coach.pickupInterval * 1.5 && f.carry < B.carryCap) {
            f.timer -= BALANCE.coach.pickupInterval * 1.5;
            f.carry++;
            this.events.emit('ballPicked', { carry: f.carry, byStaff: true });
          }
          if (f.carry >= B.carryCap) {
            const need = this.neediestStation(1, f) ?? this.neediestStation(1);
            if (need) {
              f.target = need;
              f.state = 'toBasket';
              const st = this.station(need);
              if (st.basket) this.setGoal(f, st.basket.x, st.basket.z);
            } else f.state = 'idle';
          }
          break;
        case 'toBasket':
          if (this.moveAgent(f, B.speed, dt)) {
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
              const need = this.neediestStation(1, f) ?? this.neediestStation(1);
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
