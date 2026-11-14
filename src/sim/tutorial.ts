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
  // ── feature intros (each shown once, when it first matters)
  {
    id: 'graduate',
    optional: true,
    ready: (s) => !!s.podiumGraduate(),
    done: (s) => s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => officeObjective(s, 'tut.graduate', s.podiumGraduate()),
  },
  // the team bus and the first match come right after the basics; while the money isn't there yet the route shows how
  // to earn it (never a bare "save up")
  {
    id: 'pitch',
    done: (s) => padDone(s, 'p_match'),
    objective: (s) => (canAffordPad(s, 'p_match') || (s.state.coach.padId === 'p_match' && s.paying) ? padObjective(s, 'p_match') : earn(s, 'tut.fees_bus')),
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
  // then the rest of the loop, each taught once: a graduate is sold or joins the squad, the first office upgrade
  {
    id: 'sell',
    done: (s) => s.state.records.sold + s.state.records.promoted > 0,
    objective: (s) => {
      const g = s.podiumGraduate();
      return g ? officeObjective(s, 'tut.graduate', g) : earn(s, 'tut.fees_grad');
    },
  },
  {
    id: 'upgrade',
    done: (s) => Object.values(s.state.upgrades).some((lv) => lv > 0),
    // the first upgrade is free (Sim.firstUpgradeFree): straight to the office, no saving up
    objective: (s) => {
      if (s.firstUpgradeFree()) return officeObjective(s, 'tut.upgrade_free');
      const up = s.cheapestUpgrade();
      return up && s.state.cash + 1e-6 >= up.cost ? officeObjective(s, 'tut.upgrade') : earn(s, 'tut.fees_upgrade');
    },
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

/**
 * How a new academy earns money, one thing at a time: finish a ball run, sign the player waiting at the desk, refill an
 * empty basket, else collect the fees (`feesKey` says what the money is for).
 */
function earn(sim: Sim, feesKey: string): Objective | null {
  const s = sim.state;
  // (a ball run only while some basket can take balls: with every basket full the coach would wait forever)
  const needy = s.coach.carry > 0 && sim.coachCarryKind() === 'ball' ? sim.neediestStation(1, undefined, 'ball') : null;
  if (needy) return ballObjective(sim, needy);
  const dt = sim.deskTrainee();
  if (dt && sim.canSign() && !sim.hasStaff('receptionist')) {
    const sp = sim.area.desk.coachSpot;
    return { key: 'obj.sign', params: { name: firstName(dt) }, icon: 'sign', x: sp.x, z: sp.z, targetId: 'desk', radius: BALANCE.desk.zoneRadius };
  }
  if (!sim.hasStaff('ball_boy')) {
    for (const t of s.trainees) if (t.stationId && sim.isWaitingForBalls(t) && sim.station(t.stationId).supply === 'ball') return ballObjective(sim, t.stationId);
  }
  let best = null as (typeof s.piles)[number] | null;
  for (const p of s.piles) if (p.amount >= BALANCE.objectives.minPileWorth && (!best || p.amount > best.amount)) best = p;
  return pileObjective(sim, best?.id ?? 'st:shooting_goal', feesKey);
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
