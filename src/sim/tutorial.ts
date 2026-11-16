import { BALANCE } from '../data/balance';
import { ballObjective, deskObjective, padObjective, pileObjective, routePadObjective, type Objective } from './objectives';
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
  /** Part of the opening line (numbered "3/14" in the objective pill; ends with the handover). */
  core?: boolean;
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

/** Opening line pad step: the pad, or how to earn the rest of its price (never a plain "wait"). */
const build = (id: string, padId: string, key?: string): TutorialStep => ({
  id,
  core: true,
  done: (s) => padDone(s, padId),
  objective: (s) => routePadObjective(s, padId, key),
});

/**
 * Sunday Park is one straight line for the first ~5 minutes (Playgama funnel, docs/TUTORIAL_PLAN.md): the old route
 * ended after the cones and a third of the players left in the unguided stretch that followed. Every step is a build,
 * a delivery or a payoff a few seconds away; the first graduate, the Team Bus and the first match are inside the line,
 * the Ball Boy (first automation) closes it.
 */
export const TUTORIAL: TutorialStep[] = [
  // ── Sunday Park: the core loop (first minute)
  { id: 'cash', core: true, done: (s) => !!s.state.flags.firstCash, objective: (s) => pileObjective(s, 'starter_a') ?? pileObjective(s, 'starter_b') },
  { id: 'crate', core: true, done: (s) => padDone(s, 'p_crate'), objective: (s) => padObjective(s, 'p_crate') },
  { id: 'goal', core: true, done: (s) => padDone(s, 'p_goal'), objective: (s) => padObjective(s, 'p_goal') },
  { id: 'sign', core: true, done: (s) => s.state.stats.signed > 0, objective: (s) => deskObjective(s) },
  { id: 'grab', core: true, done: (s) => s.state.coach.carry > 0 || !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  { id: 'bring', core: true, done: (s) => !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  {
    id: 'fees',
    core: true,
    done: (s) => padDone(s, 'p_cones') || canAffordPad(s, 'p_cones'),
    objective: (s) => orBalls(s, 'shooting_goal', pileObjective(s, 'st:shooting_goal', 'obj.collect_fees')),
  },
  { id: 'cones', core: true, done: (s) => padDone(s, 'p_cones'), objective: (s) => padObjective(s, 'p_cones') },
  // ── the first graduate cuts in whenever they sit down in the office (the first big payout)
  {
    id: 'graduate',
    optional: true,
    ready: (s) => !!s.podiumGraduate(),
    done: (s) => s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => officeObjective(s, 'tut.graduate', s.podiumGraduate()),
  },
  // ── Sunday Park: grow the academy, one build at a time
  build('chairs', 'p_chairs2', 'tut.chairs'),
  build('lane', 'p_goal_l2', 'tut.lane'),
  build('bench', 'p_bench'),
  build('wall', 'p_wall', 'tut.wall'),
  build('lane2', 'p_cones_l2', 'tut.lane'),
  build('bus', 'p_match', 'tut.bus'),
  {
    id: 'match',
    core: true,
    done: (s) => s.state.records.matches > 0,
    objective: (s) => {
      const K = s.area.matchPitch.kickoff;
      return { key: 'tut.match', icon: 'pitch', x: K.x, z: K.z, targetId: 'kickoff', radius: BALANCE.match.kickoffRadius };
    },
  },
  build('ballboy', 'p_ballboy', 'tut.ballboy'),
  // ── feature intros (each shown once, when it first matters)
  {
    id: 'upgrade',
    optional: true,
    ready: (s) => {
      const up = s.cheapestUpgrade();
      return !!up && s.state.cash + 1e-6 >= up.cost;
    },
    done: (s) => Object.values(s.state.upgrades).some((lv) => lv > 0),
    objective: (s) => officeObjective(s, 'tut.upgrade'),
  },
  {
    id: 'safe',
    optional: true,
    ready: (s) => (s.pile('safe')?.amount ?? 0) >= BALANCE.objectives.minPileWorth,
    done: (s) => !!s.state.flags.firstSafe,
    objective: (s) => pileObjective(s, 'safe', 'tut.safe'),
  },
  // ── Training Ground (starts once the gate shows up)
  { id: 'gate', ready: (s) => isVisible(s, 'p2_gate') || s.area2Open(), done: (s) => s.area2Open(), objective: (s) => padObjective(s, 'p2_gate') },
  { id: 'water', done: (s) => padDone(s, 'p2_water'), objective: (s) => padObjective(s, 'p2_water') },
  { id: 'gym', done: (s) => padDone(s, 'p2_gym'), objective: (s) => padObjective(s, 'p2_gym') },
  {
    id: 'bottles',
    done: (s) => !!s.state.flags.firstWater || s.hasStaff('water_carrier'),
    objective: (s) => ballObjective(s, 'gym'),
  },
  // ── Youth Stadium (starts once its gate shows up)
  { id: 'gate3', ready: (s) => isVisible(s, 'p3_gate') || s.area3Open(), done: (s) => s.area3Open(), objective: (s) => padObjective(s, 'p3_gate') },
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

function canAffordPad(sim: Sim, padId: string): boolean {
  const p = sim.world.pads.get(padId);
  return !!p && sim.canAfford(p);
}

/** Steps of the opening line, in order (for the "3/14" counter). */
export const CORE_STEPS: readonly string[] = TUTORIAL.filter((t) => t.core).map((t) => t.id);
/** The step that closes the opening line (the HUD says "the academy is yours" when it's done). */
export const HANDOVER_STEP = CORE_STEPS[CORE_STEPS.length - 1] as string;

/** 1-based position of the current opening-line step, or 0 when the line is done / the step isn't part of it. */
export function coreProgress(sim: Sim): number {
  const f = sim.state.flags;
  if (f['tut:' + HANDOVER_STEP]) return 0;
  let n = 0;
  for (const id of CORE_STEPS) if (f['tut:' + id]) n++;
  return n + 1;
}

/** The step each sim showed last (a step finishing while shown is the player's doing). */
const shown = new WeakMap<Sim, string>();

/** Marks finished steps and returns the current one (null: no route active right now). */
export function currentStep(sim: Sim): TutorialStep | null {
  const f = sim.state.flags;
  // steps finished in one go after the shown one count as live too (pads built ahead of the line)
  let live = false;
  for (const step of TUTORIAL) {
    if (f['tut:' + step.id]) continue;
    // done first: a feature intro can be finished before it was ever ready (a graduate sold from the save-up hint)
    if (step.done(sim)) {
      live ||= shown.get(sim) === step.id || (!!step.optional && shown.has(sim));
      f['tut:' + step.id] = true;
      sim.events.emit('tutorialStep', { id: step.id, live });
      continue;
    }
    if (step.ready && !step.ready(sim)) {
      if (step.optional) continue;
      shown.delete(sim);
      return null;
    }
    shown.set(sim, step.id);
    return step;
  }
  shown.delete(sim);
  return null;
}
