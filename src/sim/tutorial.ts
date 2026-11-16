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

/** While the first player waits at an empty basket, the route step shows the ball run instead. */
function orBalls(sim: Sim, stationId: string, o: Objective | null): Objective | null {
  const s = sim.state;
  const starving = s.trainees.some((t) => t.stationId === stationId && sim.isWaitingForBalls(t));
  if ((starving || s.coach.carry > 0) && sim.supplySource('ball')) return ballObjective(sim, stationId);
  return o;
}

export const TUTORIAL: TutorialStep[] = [
  // ── Sunday Park: one task at a time, each done with one action, never coming back. No step waits for money: the
  // starting cash pays the crate and the goal, the first fees the cones.
  { id: 'cash', done: (s) => !!s.state.flags.firstCash, objective: (s) => pileObjective(s, 'starter_a') ?? pileObjective(s, 'starter_b') },
  { id: 'crate', done: (s) => padDone(s, 'p_crate'), objective: (s) => withKey(padObjective(s, 'p_crate'), 'tut.build_tag') },
  { id: 'goal', done: (s) => padDone(s, 'p_goal'), objective: (s) => padObjective(s, 'p_goal') },
  { id: 'sign', done: (s) => s.state.stats.signed > 0, objective: (s) => deskObjective(s) },
  { id: 'grab', done: (s) => s.state.coach.carry > 0 || !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  { id: 'bring', done: (s) => !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  {
    id: 'fees',
    done: (s) => padDone(s, 'p_cones') || canAffordPad(s, 'p_cones'),
    objective: (s) => orBalls(s, 'shooting_goal', pileObjective(s, 'st:shooting_goal', 'obj.collect_fees')),
  },
  // the core mechanic, said once: more drills → more players training → more fees
  { id: 'cones', done: (s) => padDone(s, 'p_cones'), objective: (s) => withKey(padObjective(s, 'p_cones'), 'tut.build_more') },
  // ── then the player builds on their own (price tags glow when affordable); no task until the next lesson is ready
  {
    id: 'graduate',
    optional: true,
    ready: (s) => !!s.podiumGraduate(),
    done: (s) => s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => officeObjective(s, 'tut.graduate', s.podiumGraduate()),
  },
  // the core loop by repetition, one steady task: "Build 2 more things (0/2)". The arrow goes to an affordable price
  // tag, or to the fees while nothing is affordable yet (never sign / balls / fees as separate tasks)
  {
    id: 'builds',
    done: (s) => padDone(s, 'p_match') || builtAfterBasics(s) >= BALANCE.objectives.busAfterBuilds,
    objective: (s) => buildMoreObjective(s),
  },
  // then the Team Bus: one line whether or not the cash is all there (its price tag takes what the player has)
  {
    id: 'pitch',
    done: (s) => padDone(s, 'p_match'),
    objective: (s) => steadyPad(s, 'p_match', 'tut.build_bus'),
  },
  {
    id: 'match',
    ready: (s) => s.state.records.matches > 0 || s.matchAvailable(),
    done: (s) => s.state.records.matches > 0,
    objective: (s) => {
      const K = s.area.matchPitch.kickoff;
      return { key: 'tut.match', icon: 'pitch', x: K.x, z: K.z, targetId: 'kickoff', radius: BALANCE.match.kickoffRadius };
    },
  },
  // after the first match: the office, with a free first upgrade (Sim.firstUpgradeFree). Then the route is done.
  {
    id: 'upgrade',
    done: (s) => Object.values(s.state.upgrades).some((lv) => lv > 0),
    objective: (s) => officeObjective(s, s.firstUpgradeFree() ? 'tut.upgrade_free' : 'tut.upgrade'),
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

/** Pads built in Sunday Park besides the crate, the goal and the cones (the tutorial's first builds). */
function builtAfterBasics(sim: Sim): number {
  let n = 0;
  for (const p of sim.world.padList) if (p.area === 1 && p.id !== 'p_crate' && p.id !== 'p_goal' && p.id !== 'p_cones' && padDone(sim, p.id)) n++;
  return n;
}

/**
 * A pad with one steady line ("Build the Team Bus", "Open the Training Ground Gate") whether or not the cash is there
 * yet. Standing on a price tag pays in whatever the player has, so "Unlock" / "Save up" used to flip every few seconds.
 */
function steadyPad(sim: Sim, padId: string, key: string): Objective | null {
  const o = padObjective(sim, padId);
  return o ? { ...o, key, saving: o.key === 'obj.save_for' } : null;
}

/** "Build 2 more things (n/2)": the cheapest affordable price tag (not the bus or a gate), else the biggest fee pile. */
function buildMoreObjective(sim: Sim): Objective | null {
  const params = { n: builtAfterBasics(sim), total: BALANCE.objectives.busAfterBuilds };
  const c = sim.state.coach;
  let pad = c.padId && sim.paying ? (sim.world.pads.get(c.padId) ?? null) : null;
  if (!pad) {
    for (const p of sim.visiblePads()) {
      if (p.area !== 1 || p.id === 'p_match' || !sim.canAfford(p)) continue;
      if (!pad || sim.padRemaining(p) < sim.padRemaining(pad)) pad = p;
    }
  }
  if (pad) {
    const o = padObjective(sim, pad.id);
    if (o) return { ...o, key: 'tut.build_n', params };
  }
  let best = null as (typeof sim.state.piles)[number] | null;
  for (const p of sim.state.piles) if (p.amount >= 1 && (!best || p.amount > best.amount)) best = p;
  const pile = pileObjective(sim, best?.id ?? 'st:shooting_goal');
  return pile ? { ...pile, key: 'tut.build_n', params, saving: true } : null;
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
    if (step.ready && !step.ready(sim)) {
      if (step.optional) continue;
      return null;
    }
    if (step.done(sim)) {
      f['tut:' + step.id] = true;
      sim.events.emit('tutorialStep', { id: step.id });
      continue;
    }
    return step;
  }
  return null;
}
