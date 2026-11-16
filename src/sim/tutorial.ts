import { BALANCE } from '../data/balance';
import { ballObjective, deskObjective, padObjective, pileObjective, type Objective } from './objectives';
import { firstName } from './players';
import type { Sim } from './sim';

/**
 * Fixed tutorial routes: always the same steps in the same order, each one finishing when the player does it.
 * The guide (pill + arrow) follows the current step; after a route it hides until the player looks lost.
 * Steps are stored as `flags['tut:<id>']`, so returning players with old saves skip what they've already done.
 */
export interface TutorialStep {
  id: string;
  /** The step may start (later routes wait for their area). Default: always. */
  ready?: (sim: Sim) => boolean;
  /**
   * A feature intro that only matters once its moment comes (first graduate, first affordable upgrade…): while not
   * ready it is skipped instead of holding up the rest of the route, and picked up when it becomes ready.
   */
  optional?: boolean;
  done: (sim: Sim) => boolean;
  objective: (sim: Sim) => Objective | null;
}

const padDone = (sim: Sim, id: string): boolean => !!sim.state.pads[id]?.done;

export const TUTORIAL: TutorialStep[] = [
  // ── Sunday Park, strictly in order (the developer's route): one task at a time, each done by doing it once.
  // 1. start money  2. Ball Crate  3. Shooting Goal  4. sign the first players  5. fees  6. Dribble Cones
  // 7. fill up the baskets (once)  8./9. sign a new player and build a new station (whichever first)
  // 10. the next big thing: Team Bus or Ball Boy, or the first graduate's office decision
  { id: 'cash', done: (s) => !!s.state.flags.firstCash, objective: (s) => pileObjective(s, 'starter_a') ?? pileObjective(s, 'starter_b') },
  { id: 'crate', done: (s) => padDone(s, 'p_crate'), objective: (s) => withKey(padObjective(s, 'p_crate'), 'tut.build_tag') },
  { id: 'goal', done: (s) => padDone(s, 'p_goal'), objective: (s) => padObjective(s, 'p_goal') },
  {
    id: 'sign',
    done: (s) => s.state.stats.signed >= BALANCE.objectives.tutFirstSigns,
    objective: (s) => ({ ...deskObjective(s), key: 'tut.sign_first', params: { n: s.state.stats.signed, total: BALANCE.objectives.tutFirstSigns } }),
  },
  // (new drills open with a full basket, so the fees come before anyone has to bring balls)
  { id: 'fees', done: (s) => padDone(s, 'p_cones') || canAffordPad(s, 'p_cones'), objective: (s) => pileObjective(s, 'st:shooting_goal', 'obj.collect_fees') },
  { id: 'cones', done: (s) => padDone(s, 'p_cones'), objective: (s) => withKey(padObjective(s, 'p_cones'), 'tut.build_more') },
  {
    id: 'refill',
    done: (s) => !!s.state.flags.refillTaught || s.hasStaff('ball_boy'),
    objective: (s) => refillObjective(s),
  },
  {
    id: 'grow',
    done: (s) => signedNew(s) || builtNewStation(s),
    objective: (s) => {
      if (deskWaiting(s)) return signObjective(s);
      return buildStationObjective(s);
    },
  },
  {
    id: 'grow2',
    done: (s) => signedNew(s) && builtNewStation(s),
    objective: (s) => (signedNew(s) ? buildStationObjective(s) : signObjective(s)),
  },
  {
    id: 'next',
    done: (s) => padDone(s, 'p_match') || s.hasStaff('ball_boy') || s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => nextBigObjective(s),
  },
  // ── one-time hints after the route, each when it can be done straight away
  {
    id: 'graduate',
    optional: true,
    ready: (s) => !!s.podiumGraduate(),
    done: (s) => s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => officeObjective(s, 'tut.graduate', s.podiumGraduate()),
  },
  {
    id: 'match',
    optional: true,
    ready: (s) => s.matchAvailable(),
    done: (s) => s.state.records.matches > 0,
    objective: (s) => {
      const K = s.area.matchPitch.kickoff;
      return { key: 'tut.match', icon: 'pitch', x: K.x, z: K.z, targetId: 'kickoff', radius: BALANCE.match.kickoffRadius };
    },
  },
  // after the first match: the office, with a free first upgrade (Sim.firstUpgradeFree)
  {
    id: 'upgrade',
    optional: true,
    ready: (s) => s.firstUpgradeFree(),
    done: (s) => Object.values(s.state.upgrades).some((lv) => lv > 0),
    objective: (s) => officeObjective(s, 'tut.upgrade_free'),
  },
  {
    id: 'safe',
    optional: true,
    ready: (s) => (s.pile('safe')?.amount ?? 0) >= BALANCE.objectives.minPileWorth,
    done: (s) => !!s.state.flags.firstSafe,
    objective: (s) => pileObjective(s, 'safe', 'tut.safe'),
  },
  // ── Training Ground (starts once the gate shows up)
  { id: 'gate', ready: (s) => isVisible(s, 'p2_gate') || s.area2Open(), done: (s) => s.area2Open(), objective: (s) => steadyPad(s, 'p2_gate', 'tut.open_gate') },
  { id: 'water', done: (s) => padDone(s, 'p2_water'), objective: (s) => padObjective(s, 'p2_water') },
  { id: 'gym', done: (s) => padDone(s, 'p2_gym'), objective: (s) => padObjective(s, 'p2_gym') },
  {
    id: 'bottles',
    done: (s) => !!s.state.flags.firstWater || s.hasStaff('water_carrier'),
    objective: (s) => ballObjective(s, 'gym'),
  },
  // ── Youth Stadium (starts once its gate shows up)
  { id: 'gate3', ready: (s) => isVisible(s, 'p3_gate') || s.area3Open(), done: (s) => s.area3Open(), objective: (s) => steadyPad(s, 'p3_gate', 'tut.open_gate') },
  { id: 'kit', done: (s) => padDone(s, 'p3_kit'), objective: (s) => padObjective(s, 'p3_kit') },
  { id: 'crossing', done: (s) => padDone(s, 'p3_crossing'), objective: (s) => padObjective(s, 'p3_crossing') },
  {
    id: 'bibs',
    done: (s) => !!s.state.flags.firstBib || s.hasStaff('kit_manager'),
    objective: (s) => ballObjective(s, 'crossing'),
  },
];

/** Points at the office computer with an explanation (first graduate / first upgrade). */
function officeObjective(sim: Sim, key: string, grad?: ReturnType<Sim['podiumGraduate']>): Objective {
  const P = sim.area.office.computer;
  return { key, params: grad ? { name: firstName(grad) } : undefined, icon: 'podium', x: P.x, z: P.z, targetId: grad ? 'podium' : 'office', radius: BALANCE.transfer.zoneRadius };
}

function isVisible(sim: Sim, padId: string): boolean {
  const p = sim.world.pads.get(padId);
  return !!p && sim.isPadVisible(p);
}

/** A new player is waiting at the sign-up desk (and the coach signs them: no receptionist yet). */
function deskWaiting(sim: Sim): boolean {
  return !!sim.deskTrainee() && sim.canSign() && !sim.hasStaff('receptionist');
}

/** Signed someone after the first players (step 4). */
function signedNew(sim: Sim): boolean {
  return sim.state.stats.signed > BALANCE.objectives.tutFirstSigns || sim.hasStaff('receptionist');
}

/** Drills and lanes built in Sunday Park after the goal and the cones. */
function builtNewStation(sim: Sim): boolean {
  for (const p of sim.world.padList) {
    if (p.area !== 1 || p.id === 'p_goal' || p.id === 'p_cones') continue;
    if ((p.unlock.type === 'station' || p.unlock.type === 'lane') && padDone(sim, p.id)) return true;
  }
  return false;
}

/** "Sign the new player: Mia" at the desk (or wait there for the next one off the bus). */
function signObjective(sim: Sim): Objective {
  const t = sim.deskTrainee();
  const o = deskObjective(sim);
  return t ? { ...o, key: 'tut.sign_new', params: { name: firstName(t) } } : { ...o, key: 'tut.sign_next', params: undefined };
}

/** "Build a new station": the cheapest affordable drill or lane; while none is affordable, the fees (same line). */
function buildStationObjective(sim: Sim): Objective | null {
  let pad = null as ReturnType<Sim['visiblePads']>[number] | null;
  for (const p of sim.visiblePads()) {
    if (p.area !== 1 || (p.unlock.type !== 'station' && p.unlock.type !== 'lane')) continue;
    if (!pad || sim.padRemaining(p) < sim.padRemaining(pad)) pad = p;
  }
  if (pad && (sim.canAfford(pad) || (sim.state.coach.padId === pad.id && sim.paying))) {
    const o = padObjective(sim, pad.id);
    if (o) return { ...o, key: 'tut.build_station', params: { name: pad.nameKey } };
  }
  const pile = biggestPile(sim);
  return pile ? { ...pile, key: 'tut.build_station_fees', params: pad ? { name: pad.nameKey } : undefined, saving: true } : null;
}

/** Step 10: the first graduate's decision if one waits; else the Team Bus or a Ball Boy, whichever is affordable. */
function nextBigObjective(sim: Sim): Objective | null {
  const g = sim.podiumGraduate();
  if (g) return officeObjective(sim, 'tut.graduate', g);
  const bus = sim.world.pads.get('p_match');
  const boy = sim.world.pads.get('p_ballboy');
  if (boy && sim.isPadVisible(boy) && sim.canAfford(boy) && !(bus && sim.canAfford(bus))) return steadyPad(sim, 'p_ballboy', 'tut.next_big');
  return steadyPad(sim, 'p_match', 'tut.next_big');
}

/** Step 7: "Fill up the baskets": grab balls at the crate, then bring them to the emptiest basket. */
function refillObjective(sim: Sim): Objective | null {
  let st: string | null = null;
  let low = Infinity;
  for (const id of Object.keys(sim.state.stations)) {
    const ss = sim.state.stations[id];
    const def = sim.station(id);
    if (!ss || def.supply !== 'ball' || !def.basket) continue;
    const r = ss.balls / def.cfg.basketCap;
    if (r < low) {
      low = r;
      st = id;
    }
  }
  if (!st) return null;
  // holding balls: "bring" (no flip back to "grab" when stepping in and out of the crate zone)
  if (sim.state.coach.carry > 0 && sim.coachCarryKind() === 'ball') {
    const def = sim.station(st);
    const b = def.basket ?? def.pile;
    return { key: 'tut.refill_bring', icon: 'ball', x: b.x, z: b.z, targetId: 'basket:' + st, radius: BALANCE.basket.zoneRadius };
  }
  return { ...ballObjective(sim, st), key: 'tut.refill_grab' };
}

function biggestPile(sim: Sim): Objective | null {
  let best = null as (typeof sim.state.piles)[number] | null;
  for (const p of sim.state.piles) if (p.amount >= 1 && (!best || p.amount > best.amount)) best = p;
  return pileObjective(sim, best?.id ?? 'st:shooting_goal');
}

/**
 * A pad with one steady line ("Build the Team Bus", "Open the Training Ground Gate") whether or not the cash is there
 * yet. Standing on a price tag pays in whatever the player has, so "Unlock" / "Save up" used to flip every few seconds.
 */
function steadyPad(sim: Sim, padId: string, key: string): Objective | null {
  const o = padObjective(sim, padId);
  return o ? { ...o, key, saving: o.key === 'obj.save_for' } : null;
}

/** A route step's own wording for an "Unlock X" objective (a "Save up" one keeps its own text). */
function withKey(o: Objective | null, key: string): Objective | null {
  return o && o.key === 'obj.unlock' ? { ...o, key } : o;
}

function canAffordPad(sim: Sim, padId: string): boolean {
  const p = sim.world.pads.get(padId);
  return !!p && sim.canAfford(p);
}

/** Marks finished steps and returns the current one (null: no route active right now). */
export function currentStep(sim: Sim): TutorialStep | null {
  const f = sim.state.flags;
  for (const step of TUTORIAL) {
    if (f['tut:' + step.id]) continue;
    // done counts even while the step isn't showing (a hint done on the player's own, e.g. the free upgrade)
    if (step.done(sim)) {
      f['tut:' + step.id] = true;
      sim.events.emit('tutorialStep', { id: step.id });
      continue;
    }
    if (step.ready && !step.ready(sim)) {
      if (step.optional) continue;
      return null;
    }
    return step;
  }
  return null;
}
