import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';

const STEP = 1 / 60;

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
    for (let t = 0; t < 900 && !sim.state.flags['tut:upgrade']; t += 1) play(sim, 1);
    const tut = seen.filter((k) => k.startsWith('tutorial:')).map((k) => k.slice(9));
    const msg = tut.join(' → ');
    // the basics, strictly in order (in the fees step an empty basket may ask for balls first)
    const basics = ['obj.collect_cash', 'tut.build_tag', 'obj.unlock', 'obj.meet_first|obj.sign', 'obj.grab_balls', 'obj.bring_balls', 'obj.collect_fees', 'tut.build_more'];
    const cones = tut.indexOf('tut.build_more');
    expect(cones, msg).toBeGreaterThan(0);
    let i = 0;
    for (const k of tut.slice(0, cones + 1)) {
      while (i < basics.length && !(basics[i] as string).split('|').includes(k) && !(i >= 6 && ['obj.grab_balls', 'obj.bring_balls'].includes(k)) && k !== 'obj.sign') i++;
      expect(i, `unexpected step ${k} in ${msg}`).toBeLessThan(basics.length);
    }
    // after the cones: no chores and no "save up", only the next lessons, each once: build 2 more things, the Team Bus,
    // the first match, the free upgrade; the sell intro when a graduate waits
    // (a lost hint in between may split one task in two entries: count it once)
    const after = tut
      .slice(cones + 1)
      .filter((k) => k !== 'tut.graduate')
      .filter((k, j, a) => k !== a[j - 1]);
    expect(after, msg).toEqual(['tut.build_n', 'tut.build_bus', 'tut.match', 'tut.upgrade_free']);
    expect(tut, msg).not.toContain('obj.save_for');
    expect(sim.state.pads.p_cones?.done).toBe(true);
    for (const f of ['cones', 'pitch', 'match', 'upgrade']) expect(sim.state.flags['tut:' + f], f).toBe(true);
    // after the route: nothing is forced on the player
    expect(['hidden', 'lost']).toContain(sim.guide.mode);
  });

  it('shows a hint when the player stands still, and hides it again on progress', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    // play until the Sunday Park route (ending with the first upgrade) is done
    for (let t = 0; t < 900 && !sim.state.flags['tut:upgrade']; t += 1) play(sim, 1);
    expect(sim.state.flags['tut:upgrade']).toBe(true);
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
    for (const k of ['cash', 'crate', 'goal', 'sign', 'grab', 'bring', 'fees', 'cones', 'graduate', 'builds', 'pitch', 'match']) sim.state.flags['tut:' + k] = true;
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
    for (const k of ['cash', 'crate', 'goal', 'sign', 'grab', 'bring', 'fees', 'cones', 'graduate', 'builds', 'pitch', 'match', 'upgrade', 'safe']) sim.state.flags['tut:' + k] = true;
    sim.state.cash = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.open_gate');
    expect(sim.guide.objective?.targetId).toBe('p2_gate');
    sim.state.cash = 1e6;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.open_gate');
  });
});

describe('tutorial: build 2 more things after the cones', () => {
  it('keeps one task with a counter, points at an affordable price tag or the fees, then the Team Bus', () => {
    const sim = new Sim(createInitialState(AREA1, 9));
    for (const id of ['p_crate', 'p_goal', 'p_cones']) sim.unlockPad(sim.world.pads.get(id)!);
    for (const k of ['cash', 'crate', 'goal', 'sign', 'grab', 'bring', 'fees', 'cones']) sim.state.flags['tut:' + k] = true;
    sim.state.flags.firstCash = true;
    sim.state.cash = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.build_n');
    expect(sim.guide.objective?.params).toEqual({ n: 0, total: BALANCE.objectives.busAfterBuilds });
    expect(sim.guide.objective?.saving).toBe(true); // nothing affordable: the fees
    sim.state.cash = 1000;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.build_n');
    const target = sim.guide.objective?.targetId ?? '';
    expect(target.startsWith('p_')).toBe(true);
    expect(target).not.toBe('p_match');
    sim.unlockPad(sim.world.pads.get(target)!);
    sim.tick(STEP);
    expect(sim.guide.objective?.params?.n).toBe(1);
    sim.unlockPad(sim.world.pads.get(sim.guide.objective!.targetId)!);
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.build_bus');
    sim.state.cash = 0;
    sim.tick(STEP);
    expect(sim.guide.objective?.key).toBe('tut.build_bus'); // one line, with or without the cash
  });
});
