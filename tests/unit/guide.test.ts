import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';

const STEP = 1 / 60;
/** The Sunday Park route (steps 1–10). */
const CORE = ['cash', 'crate', 'goal', 'sign', 'fees', 'cones', 'refill', 'grow', 'grow2', 'next'];

/**
 * What the panels do when the player steps into a prompt: plays the match at the kick-off spot; at the office sells
 * the waiting graduate and buys the cheapest upgrade it can afford.
 */
function kickoff(sim: Sim): void {
  if (sim.prompt === 'podium') {
    if (sim.podiumGraduate()) sim.decideGraduate('sell');
    const up = sim.cheapestUpgrade();
    if (up && sim.state.cash >= up.cost) sim.buyUpgrade(up.id);
    sim.dismissPrompt();
  }
  if (sim.prompt !== 'kickoff') return;
  const m = sim.startMatch();
  m.chances.forEach((_, i) => sim.resolveMatchChance(i, 0.6));
  sim.finishCurrentMatch();
}

/**
 * A player who follows the guide when it shows something and otherwise the best action (like a human who knows the
 * game), walking the whole nav path waypoint by waypoint (no corner-cutting into fences or stations).
 */
function play(sim: Sim, sec: number, onFrame?: () => void): void {
  for (let t = 0; t < sec; t += STEP) {
    kickoff(sim);
    const o = sim.guide.objective ?? sim.objective;
    const c = sim.state.coach;
    sim.input.x = sim.input.z = 0;
    if (o) {
      const k = o.targetId + Math.floor(sim.state.time / 2);
      if (k !== nav.key) {
        nav.key = k;
        nav.path = sim.nav.findPath(c.x, c.z, o.x, o.z);
        nav.i = 0;
      }
      if (Math.hypot(o.x - c.x, o.z - c.z) > 0.3) {
        const p = nav.path;
        while (nav.i * 2 < p.length - 2 && Math.hypot((p[nav.i * 2] as number) - c.x, (p[nav.i * 2 + 1] as number) - c.z) < 0.3) nav.i++;
        const wx = p[nav.i * 2] ?? o.x;
        const wz = p[nav.i * 2 + 1] ?? o.z;
        const d = Math.hypot(wx - c.x, wz - c.z) || 1;
        sim.input.x = (wx - c.x) / d;
        sim.input.z = (wz - c.z) / d;
      }
    }
    sim.tick(STEP);
    onFrame?.();
  }
}
const nav = { key: '', path: [] as number[], i: 0 };

describe('guide: fixed tutorial route, then hidden', () => {
  it('walks the Sunday Park route in order without jumping around', () => {
    const sim = new Sim(createInitialState(AREA1, 12345));
    const seen: string[] = [];
    sim.events.on('guideChanged', (e) => {
      const k = e.objective ? `${e.mode}:${e.objective.key}` : `${e.mode}`;
      if (seen[seen.length - 1] !== k) seen.push(k);
    });
    for (let t = 0; t < 900 && !sim.state.flags['tut:next']; t += 1) play(sim, 1);
    const tut = seen.filter((k) => k.startsWith('tutorial:')).map((k) => k.slice(9));
    const msg = tut.join(' → ');
    // 1–6 strictly in order, exactly once each
    expect(tut.slice(0, 6), msg).toEqual(['obj.collect_cash', 'tut.build_tag', 'obj.unlock', 'tut.sign_first', 'obj.collect_fees', 'tut.build_more']);
    // 7: fill up the baskets (grab, then bring), then never again
    const rest = tut.slice(6);
    // (bring right away when the coach already picked balls up walking past the crate)
    expect(['tut.refill_grab', 'tut.refill_bring'], msg).toContain(rest[0]);
    const lastRefill = Math.max(rest.lastIndexOf('tut.refill_grab'), rest.lastIndexOf('tut.refill_bring'));
    const grow = ['tut.sign_new', 'tut.sign_next', 'tut.build_station', 'tut.build_station_fees'];
    const firstGrow = rest.findIndex((k) => grow.includes(k));
    expect(firstGrow, msg).toBeGreaterThan(lastRefill);
    // 8–10 and the one-time hints only: no chores (grab / bring / sign / fees as their own tasks) and no "save up"
    const allowed = [...grow, 'tut.next_big', 'tut.graduate', 'tut.match', 'tut.upgrade_free'];
    for (const k of rest.slice(lastRefill + 1)) expect(allowed, msg).toContain(k);
    expect(tut, msg).not.toContain('obj.save_for');
    for (const f of ['sign', 'fees', 'cones', 'refill', 'grow', 'grow2', 'next']) expect(sim.state.flags['tut:' + f], f).toBe(true);
    expect(sim.state.stats.signed).toBeGreaterThan(BALANCE.objectives.tutFirstSigns);
    // after the route: nothing is forced on the player (or a one-time hint that can be done right away)
    expect(['hidden', 'lost', 'tutorial']).toContain(sim.guide.mode);
  });

  it('shows a hint when the player stands still, and hides it again on progress', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    // play until the Sunday Park route is done, with the one-time hints out of the way
    for (let t = 0; t < 900 && !sim.state.flags['tut:next']; t += 1) play(sim, 1);
    expect(sim.state.flags['tut:next']).toBe(true);
    for (const k of ['graduate', 'match', 'upgrade', 'safe']) sim.state.flags['tut:' + k] = true;
    // stand still
    for (let t = 0; t < BALANCE.objectives.lostIdleSec + 0.5; t += STEP) {
      sim.input.x = sim.input.z = 0;
      sim.tick(STEP);
    }
    expect(sim.guide.mode).toBe('lost');
    const hint = sim.guide.objective;
    expect(hint).not.toBeNull();
    // the hint stays put (no flip-flopping) until something is done
    let flips = 0;
    sim.events.on('guideChanged', () => flips++);
    for (let t = 0; t < BALANCE.objectives.lostRefreshSec - 1; t += STEP) sim.tick(STEP);
    expect(flips).toBe(0);
    // progress hides it
    sim.events.emit('signed', { id: 0, fee: 0 });
    expect(sim.guide.mode).toBe('hidden');
    expect(sim.guide.objective).toBeNull();
  });

  it('old saves skip steps they have already done', () => {
    const sim = new Sim(createInitialState(AREA1, 8));
    for (const p of AREA1.pads) if (p.area === 1) sim.unlockPad(p);
    sim.state.flags.firstCash = true;
    sim.state.flags.firstDelivery = true;
    sim.state.stats.signed = 5;
    // …and has met the office, played matches and banked the safe
    sim.state.records.sold = 3;
    sim.state.records.matches = 4;
    sim.state.upgrades.coach_speed = 1;
    sim.state.flags.firstSafe = true;
    sim.tick(STEP);
    // Sunday Park done: the route jumps to the Training Ground gate
    expect(sim.guide.mode).toBe('tutorial');
    expect(sim.guide.objective?.targetId).toBe('p2_gate');
  });
});

/** Like play(), but walks the whole nav path waypoint by waypoint (no corner-cutting into fence posts). */
function follow(sim: Sim, sec: number, onFrame: () => void): void {
  let path: number[] = [];
  let pi = 0;
  let key = '';
  for (let t = 0; t < sec; t += STEP) {
    const o = sim.guide.objective ?? sim.objective;
    const c = sim.state.coach;
    sim.input.x = sim.input.z = 0;
    if (o) {
      const k = o.targetId + Math.floor(sim.state.time / 2);
      if (k !== key) {
        key = k;
        path = sim.nav.findPath(c.x, c.z, o.x, o.z);
        pi = 0;
      }
      if (Math.hypot(o.x - c.x, o.z - c.z) > 0.3) {
        while (pi * 2 < path.length - 2 && Math.hypot((path[pi * 2] as number) - c.x, (path[pi * 2 + 1] as number) - c.z) < 0.3) pi++;
        const wx = path[pi * 2] ?? o.x;
        const wz = path[pi * 2 + 1] ?? o.z;
        const d = Math.hypot(wx - c.x, wz - c.z) || 1;
        sim.input.x = (wx - c.x) / d;
        sim.input.z = (wz - c.z) / d;
      }
    }
    sim.tick(STEP);
    onFrame();
  }
}

describe('guide: feature intros (office, match, safe)', () => {
  it('explains the office computer and the kick-off spot when they first matter', () => {
    const sim = new Sim(createInitialState(AREA1, 4242));
    const keys = new Set<string>();
    sim.events.on('guideChanged', (e) => {
      if (e.mode === 'tutorial' && e.objective) keys.add(e.objective.key);
    });
    follow(sim, 900, () => {
      if (sim.prompt === 'podium') {
        if (sim.podiumGraduate()) sim.decideGraduate('sell');
        // (only once the guide has pointed at it, as a player would)
        const up = sim.cheapestUpgrade();
        if (up && (keys.has('tut.upgrade') || sim.firstUpgradeFree()) && sim.state.cash >= up.cost) sim.buyUpgrade(up.id);
        sim.dismissPrompt();
      } else kickoff(sim);
    });
    // (the free first upgrade is usually taken in the same office visit as the sale: the panel stays open on its upgrades)
    for (const k of ['tut.graduate', 'tut.match']) expect(keys.has(k), k).toBe(true);
    for (const f of ['graduate', 'upgrade', 'match']) expect(sim.state.flags['tut:' + f], f).toBe(true);
  });
});

describe('tutorial: the first upgrade is free', () => {
  it('is free after the first match, only for the first purchase, and the route points at the office', () => {
    const sim = new Sim(createInitialState(AREA1, 21));
    const up = sim.cheapestUpgrade();
    expect(up?.cost).toBeGreaterThan(0);
    sim.state.records.matches = 1;
    expect(sim.firstUpgradeFree()).toBe(true);
    expect(sim.cheapestUpgrade()?.cost).toBe(0);
    for (const k of [...CORE, 'graduate', 'match']) sim.state.flags['tut:' + k] = true;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.upgrade_free');
    const cash = sim.state.cash;
    expect(sim.buyUpgrade(up!.id)).toBe(true);
    expect(sim.state.cash).toBe(cash);
    // only the first one: prices are back
    expect(sim.firstUpgradeFree()).toBe(false);
    expect(sim.cheapestUpgrade()?.cost).toBeGreaterThan(0);
    sim.tick(STEP);
    expect(sim.state.flags['tut:upgrade']).toBe(true);
  });
});

describe('tutorial: area gates keep one line', () => {
  it('shows "Open the Training Ground Gate" whether or not the cash is there (no Save up / Unlock flip)', () => {
    const sim = new Sim(createInitialState(AREA1, 8));
    for (const p of AREA1.pads) if (p.area === 1) sim.unlockPad(p);
    for (const k of [...CORE, 'graduate', 'match', 'upgrade', 'safe']) sim.state.flags['tut:' + k] = true;
    sim.state.cash = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.open_gate');
    expect(sim.guide.objective?.targetId).toBe('p2_gate');
    sim.state.cash = 1e6;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.open_gate');
  });
});

describe('tutorial: steps 4–10', () => {
  /** Sunday Park built up to the cones, the route at step 7. */
  function atRefill(seed: number): Sim {
    const sim = new Sim(createInitialState(AREA1, seed));
    for (const id of ['p_crate', 'p_goal', 'p_cones']) sim.unlockPad(sim.world.pads.get(id)!);
    for (const k of ['cash', 'crate', 'goal', 'sign', 'fees', 'cones']) sim.state.flags['tut:' + k] = true;
    sim.state.flags.firstCash = true;
    sim.state.stats.signed = BALANCE.objectives.tutFirstSigns;
    return sim;
  }

  it('the first drill opens with some balls, the next ones empty', () => {
    const sim = atRefill(3);
    expect(sim.state.stations.shooting_goal!.balls).toBe(BALANCE.basket.firstFill);
    expect(sim.state.stations.dribble_cones!.balls).toBe(0);
  });

  it('step 4 counts the first sign-ups', () => {
    const sim = new Sim(createInitialState(AREA1, 4));
    for (const id of ['p_crate', 'p_goal']) sim.unlockPad(sim.world.pads.get(id)!);
    for (const k of ['cash', 'crate', 'goal']) sim.state.flags['tut:' + k] = true;
    sim.state.flags.firstCash = true;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.sign_first');
    expect(sim.guide.objective?.params).toEqual({ n: 0, total: BALANCE.objectives.tutFirstSigns });
  });

  it('step 7 fills up the baskets once: grab at the crate, bring, done after one delivery', () => {
    const sim = atRefill(5);
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.refill_grab');
    sim.state.coach.carry = 3;
    sim.state.coach.carryKind = 'ball';
    sim.state.stations.shooting_goal!.balls = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.refill_bring');
    sim.state.flags.refillTaught = true;
    sim.tick(STEP);
    expect(sim.state.flags['tut:refill']).toBe(true);
    expect(['tut.sign_new', 'tut.sign_next', 'tut.build_station', 'tut.build_station_fees']).toContain(sim.guide.objective?.key);
  });

  it('steps 8–9: sign a new player and build a new station, whichever comes first, then step 10', () => {
    const sim = atRefill(6);
    sim.state.flags['tut:refill'] = true;
    sim.state.cash = 1000;
    sim.tick(STEP);
    // nobody at the desk yet: the station first
    expect(sim.guide.objective?.key).toBe('tut.build_station');
    const pad = sim.guide.objective!.targetId;
    sim.unlockPad(sim.world.pads.get(pad)!);
    sim.tick(STEP);
    expect(sim.state.flags['tut:grow']).toBe(true);
    // the other one: a new player
    expect(['tut.sign_new', 'tut.sign_next']).toContain(sim.guide.objective?.key);
    sim.state.stats.signed = BALANCE.objectives.tutFirstSigns + 1;
    sim.tick(STEP);
    expect(sim.state.flags['tut:grow2']).toBe(true);
    expect(sim.guide.objective?.key).toBe('tut.next_big');
    sim.state.cash = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.next_big'); // one line, with or without the cash
  });
});
