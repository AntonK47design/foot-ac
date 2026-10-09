import { BALANCE } from '../../data/balance';
import { Rng } from '../../core/rng';
import { dist2 } from '../geom';
import { Sim, createInitialState } from '../sim';
import { computeOvr } from '../players';

export interface BotOptions {
  /** 1 = perfect objective follower; 0.7 = distracted player. */
  efficiency: number;
  /** Power Shot timing quality the bot achieves (0..1). */
  powerQuality?: number;
  seed: number;
  minutes: number;
}

export interface TimelineEntry {
  t: number;
  what: string;
}

export interface BotReport {
  timeline: TimelineEntry[];
  marks: Record<string, number>;
  unlockTimes: number[];
  upgradeTimes: number[];
  matchTimes: number[];
  /** Longest stretch between 3:00 and 20:00 without a pad, an upgrade or a match (§5.2 "never dead air"). */
  midGameGap: { from: number; to: number; gap: number };
  longestPurchaseGap: { from: number; to: number; gap: number };
  longestUnaffordable: { from: number; gap: number };
  finalCash: number;
  stars: number;
  totalStars: number;
  level: number;
  contentDoneAt: number | null;
  sim: Sim;
}

const STEP = 1 / 60;

/** Headless player that follows the objective system at real coach speed. */
export function runBot(opts: BotOptions): BotReport {
  const sim = new Sim(createInitialState(undefined, opts.seed));
  const rng = new Rng(opts.seed * 7 + 1);
  const timeline: TimelineEntry[] = [];
  const marks: Record<string, number> = {};
  const unlockTimes: number[] = [];
  const upgradeTimes: number[] = [];
  const matchTimes: number[] = [];
  const mark = (k: string, what?: string): void => {
    if (marks[k] !== undefined) return;
    marks[k] = sim.state.time;
    if (what) timeline.push({ t: sim.state.time, what });
  };
  sim.events.on('cashCollected', () => mark('firstCash', 'first cash collected'));
  sim.events.on('unlocked', (e) => {
    unlockTimes.push(sim.state.time);
    timeline.push({ t: sim.state.time, what: `unlock ${e.padId} (★${sim.state.stars}/${sim.world.totalStars})` });
    if (unlockTimes.length === 1) marks.firstUnlock = sim.state.time;
    if (unlockTimes.length === 3) marks.thirdUnlock = sim.state.time;
    marks['unlock:' + e.padId] = sim.state.time;
  });
  sim.events.on('signed', () => mark('firstSign', 'first trainee signed'));
  sim.events.on('ballDropped', (e) => {
    if (!e.byStaff) mark('firstDelivery', 'first balls delivered');
  });
  sim.events.on('rep', () => mark('firstRep', 'first rep (cash on pile)'));
  sim.events.on('traineeArrived', () => {
    if (sim.state.nextId === 2) mark('firstTrainee', 'first trainee arrives');
    if (sim.state.nextId === 3) mark('secondTrainee', 'second trainee arrives');
  });
  sim.events.on('levelUp', (e) => timeline.push({ t: sim.state.time, what: `academy level ${e.level}` }));
  sim.events.on('staffHired', (e) => mark('firstAutomation', `hired ${e.id} (first automation)`));
  sim.events.on('graduated', () => mark('firstGraduation', 'first graduation'));

  const total = opts.minutes * 60;
  let path: number[] = [];
  let pathI = 0;
  let pathKey = '';
  let distractedUntil = -1;
  let nextDistraction = 7;
  let wander = { x: 0, z: 0 };
  let unaffordableSince: number | null = null;
  let longestUnaffordable = { from: 0, gap: 0 };
  let contentDoneAt: number | null = null;
  const minuteMarks = [60];
  let visibleAt60 = 0;

  while (sim.state.time < total) {
    const t = sim.state.time;
    // distraction model: act for a while, then idle/wander
    if (opts.efficiency < 1) {
      if (t >= nextDistraction && distractedUntil < t) {
        const dur = (7 * (1 - opts.efficiency)) / opts.efficiency;
        distractedUntil = t + dur * rng.range(0.6, 1.4);
        nextDistraction = distractedUntil + 7 * rng.range(0.6, 1.4);
        wander = rng.chance(0.5) ? { x: rng.range(-1, 1), z: rng.range(-1, 1) } : { x: 0, z: 0 };
      }
    }
    const obj = sim.objective;
    sim.input.x = 0;
    sim.input.z = 0;
    if (t < distractedUntil) {
      sim.input.x = wander.x * 0.5;
      sim.input.z = wander.z * 0.5;
    } else if (obj) {
      const c = sim.state.coach;
      const key = obj.targetId + ':' + obj.x.toFixed(2) + ':' + obj.z.toFixed(2) + ':' + Math.floor(t / 2);
      if (key !== pathKey) {
        pathKey = key;
        path = sim.nav.findPath(c.x, c.z, obj.x, obj.z);
        pathI = 0;
      }
      const stopR = Math.min(0.5, obj.radius * 0.4);
      if (dist2(c.x, c.z, obj.x, obj.z) > stopR * stopR) {
        while (pathI * 2 < path.length - 2 && dist2(c.x, c.z, path[pathI * 2] as number, path[pathI * 2 + 1] as number) < 0.3 * 0.3) pathI++;
        const wx = path[pathI * 2] ?? obj.x;
        const wz = path[pathI * 2 + 1] ?? obj.z;
        const dx = wx - c.x;
        const dz = wz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          // slow down on arrival like a human would
          const k = Math.min(1, d / 0.6 + 0.35);
          sim.input.x = (dx / d) * k;
          sim.input.z = (dz / d) * k;
        }
      }
    }
    sim.tick(STEP);
    // podium / kick-off prompts (the UI panels in the real game)
    // every seated graduate gets a decision (the panel shows them one after another): sell for cash until
    // there is a team bus, then build the squad, then only upgrade it
    for (let g = sim.prompt === 'podium' ? sim.podiumGraduate() : undefined; g; g = sim.podiumGraduate()) {
      const weakest = sim.weakestSquadPlayer();
      const pitch = !!sim.state.built[sim.area.matchPitch.objectId];
      const promote =
        pitch && (sim.state.squad.length < BALANCE.squad.size || (weakest !== undefined && sim.ovr(g) > computeOvr(weakest.position, weakest.stats) + 2));
      sim.decideGraduate(promote ? 'promote' : 'sell');
      sim.prompt = 'podium';
      mark(promote ? 'firstPromotion' : 'firstSale', promote ? 'first graduate promoted' : 'first transfer sale');
    }
    if (sim.prompt === 'podium') {
      // office upgrades: cheapest first, without stalling the next pad
      for (let n = 0; n < 6; n++) {
        const up = sim.cheapestUpgrade();
        const pads = sim.visiblePads();
        let next = Infinity;
        for (const p of pads) next = Math.min(next, sim.padRemaining(p));
        if (!up || sim.state.cash < up.cost || (pads.length > 0 && up.cost > next * BALANCE.objectives.upgradeShare)) break;
        sim.buyUpgrade(up.id);
        upgradeTimes.push(sim.state.time);
        mark('firstUpgrade', `first upgrade (${up.id})`);
      }
      sim.dismissPrompt();
    } else if (sim.prompt === 'kickoff') {
      const m = sim.startMatch();
      m.chances.forEach((c, i) => sim.resolveMatchChance(i, c.power ? opts.powerQuality ?? 0.65 : 0.5));
      const r = sim.finishCurrentMatch();
      matchTimes.push(sim.state.time);
      mark('firstMatch', `first match ${r ? `${r.ourGoals}-${r.theirGoals}` : ''}`);
    }

    // affordability tracking
    const pads = sim.visiblePads();
    if (pads.length === 0) {
      if (contentDoneAt === null) {
        contentDoneAt = sim.state.time;
        timeline.push({ t: sim.state.time, what: 'all M1 pads unlocked' });
      }
    } else {
      let piles = 0;
      for (const p of sim.state.piles) piles += Math.floor(p.amount);
      const cheapest = Math.min(...pads.map((p) => sim.padRemaining(p)));
      const affordable = sim.state.cash + piles >= cheapest;
      if (!affordable) {
        if (unaffordableSince === null) unaffordableSince = sim.state.time;
        const gap = sim.state.time - unaffordableSince;
        if (gap > longestUnaffordable.gap) longestUnaffordable = { from: unaffordableSince, gap };
      } else unaffordableSince = null;
    }
    if (minuteMarks.length && sim.state.time >= (minuteMarks[0] as number)) {
      minuteMarks.shift();
      visibleAt60 = pads.length;
    }
  }
  marks.visiblePadsAt60 = visibleAt60;

  let longestPurchaseGap = { from: 0, to: 0, gap: 0 };
  let prev = 0;
  const horizon = contentDoneAt ?? total;
  for (const u of [...unlockTimes, horizon]) {
    if (u - prev > longestPurchaseGap.gap && prev < horizon) longestPurchaseGap = { from: prev, to: u, gap: u - prev };
    prev = u;
  }
  // mid-game: any progress event (pad, upgrade, match) counts
  const events = [...unlockTimes, ...upgradeTimes, ...matchTimes].filter((t) => t >= 180 && t <= Math.min(1200, total)).sort((a, b) => a - b);
  let midGameGap = { from: 180, to: 180, gap: 0 };
  let p0 = 180;
  for (const t of [...events, Math.min(1200, total)]) {
    if (t - p0 > midGameGap.gap) midGameGap = { from: p0, to: t, gap: t - p0 };
    p0 = t;
  }
  void BALANCE;
  return {
    timeline,
    marks,
    unlockTimes,
    upgradeTimes,
    matchTimes,
    midGameGap,
    longestPurchaseGap,
    longestUnaffordable,
    finalCash: sim.state.cash,
    stars: sim.state.stars,
    totalStars: sim.world.totalStars,
    level: sim.state.level,
    contentDoneAt,
    sim,
  };
}

export function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
