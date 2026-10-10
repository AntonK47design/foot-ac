import { ballObjective, deskObjective, padObjective, pileObjective, type Objective } from './objectives';
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
  // ── Sunday Park
  { id: 'cash', done: (s) => !!s.state.flags.firstCash, objective: (s) => pileObjective(s, 'starter_a') ?? pileObjective(s, 'starter_b') },
  { id: 'crate', done: (s) => padDone(s, 'p_crate'), objective: (s) => padObjective(s, 'p_crate') },
  { id: 'goal', done: (s) => padDone(s, 'p_goal'), objective: (s) => padObjective(s, 'p_goal') },
  { id: 'sign', done: (s) => s.state.stats.signed > 0, objective: (s) => deskObjective(s) },
  { id: 'grab', done: (s) => s.state.coach.carry > 0 || !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  { id: 'bring', done: (s) => !!s.state.flags.firstDelivery, objective: (s) => ballObjective(s, 'shooting_goal') },
  {
    id: 'fees',
    done: (s) => padDone(s, 'p_cones') || canAffordPad(s, 'p_cones'),
    objective: (s) => orBalls(s, 'shooting_goal', pileObjective(s, 'st:shooting_goal', 'obj.collect_fees')),
  },
  { id: 'cones', done: (s) => padDone(s, 'p_cones'), objective: (s) => padObjective(s, 'p_cones') },
  // ── Training Ground (starts once the gate shows up)
  { id: 'gate', ready: (s) => isVisible(s, 'p2_gate') || s.area2Open(), done: (s) => s.area2Open(), objective: (s) => padObjective(s, 'p2_gate') },
  { id: 'water', done: (s) => padDone(s, 'p2_water'), objective: (s) => padObjective(s, 'p2_water') },
  { id: 'gym', done: (s) => padDone(s, 'p2_gym'), objective: (s) => padObjective(s, 'p2_gym') },
  {
    id: 'bottles',
    done: (s) => !!s.state.flags.firstWater || s.hasStaff('water_carrier'),
    objective: (s) => ballObjective(s, 'gym'),
  },
];

function isVisible(sim: Sim, padId: string): boolean {
  const p = sim.world.pads.get(padId);
  return !!p && sim.isPadVisible(p);
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
    if (step.ready && !step.ready(sim)) return null;
    if (step.done(sim)) {
      f['tut:' + step.id] = true;
      continue;
    }
    return step;
  }
  return null;
}
