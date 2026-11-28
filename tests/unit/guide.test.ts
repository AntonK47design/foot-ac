import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';
import { CORE_STEPS, HANDOVER_STEP } from '../../src/sim/tutorial';

const STEP = 1 / 60;

/** A player who follows the guide when it shows something and otherwise the best action (like a human who knows the game). */
function play(sim: Sim, sec: number, onFrame?: () => void): void {
  for (let t = 0; t < sec; t += STEP) {
    const o = sim.guide.objective ?? sim.objective;
    const c = sim.state.coach;
    sim.input.x = sim.input.z = 0;
    if (o && Math.hypot(o.x - c.x, o.z - c.z) > 0.3) {
      const path = sim.nav.findPath(c.x, c.z, o.x, o.z);
      const wx = path[2] ?? o.x;
      const wz = path[3] ?? o.z;
      const d = Math.hypot(wx - c.x, wz - c.z) || 1;
      sim.input.x = (wx - c.x) / d;
      sim.input.z = (wz - c.z) / d;
    }
    sim.tick(STEP);
    onFrame?.();
  }
}

/** Plays the prompts like a player: sells every graduate, plays every match (no upgrades). */
function prompts(sim: Sim): void {
  if (sim.prompt === 'podium') {
    if (sim.podiumGraduate()) sim.decideGraduate('sell');
    sim.dismissPrompt();
  } else if (sim.prompt === 'kickoff') {
    const m = sim.startMatch();
    m.chances.forEach((_, i) => sim.resolveMatchChance(i, 0.6));
    sim.finishCurrentMatch();
  }
}

describe('guide: one straight opening line, then hidden', () => {
  it('walks the Sunday Park core loop in order without jumping around', () => {
    const sim = new Sim(createInitialState(AREA1, 12345));
    const seen: string[] = [];
    sim.events.on('guideChanged', (e) => {
      const k = e.objective ? `${e.mode}:${e.objective.key}` : `${e.mode}`;
      if (seen[seen.length - 1] !== k) seen.push(k);
    });
    play(sim, 60);
    const tut = seen.filter((k) => k.startsWith('tutorial:')).map((k) => k.slice(9));
    // the route as the player sees it (save-up steps may appear when short of cash)
    const order = ['obj.collect_cash', 'obj.unlock', 'obj.meet_first|obj.sign', 'obj.grab_balls', 'obj.bring_balls', 'obj.collect_fees', 'obj.unlock'];
    let i = 0;
    for (const k of tut) {
      if (sim.state.flags['tut:cones'] && i >= order.length - 1) break;
      while (i < order.length && !(order[i] as string).split('|').includes(k) && k !== 'obj.save_for' && k !== 'obj.sign' && k !== 'obj.grab_balls' && k !== 'obj.bring_balls') i++;
      expect(i, `unexpected step ${k} in ${tut.join(' → ')}`).toBeLessThan(order.length);
    }
    expect(sim.state.pads.p_cones?.done).toBe(true);
    expect(sim.state.flags['tut:cones']).toBe(true);
    // the line goes on after the cones: the guide never hides in the opening
    expect(sim.guide.mode).toBe('tutorial');
    expect(sim.guide.objective?.step?.n).toBeGreaterThan(CORE_STEPS.indexOf('cones') + 1);
  });

  it('runs every opening step in order, never hides or says "save up" on the way, and hands over after the Ball Boy', () => {
    const sim = new Sim(createInitialState(AREA1, 31));
    const done: string[] = [];
    sim.events.on('tutorialStep', (e) => {
      expect(e.live, e.id).toBe(true);
      if (CORE_STEPS.includes(e.id)) done.push(e.id);
    });
    let hiddenAt = -1;
    let saveUp = 0;
    sim.events.on('guideChanged', (e) => {
      if (!sim.state.flags['tut:' + HANDOVER_STEP] && e.mode !== 'tutorial') hiddenAt = sim.state.time;
      if (!sim.state.flags['tut:' + HANDOVER_STEP] && e.objective?.key === 'obj.save_for') saveUp++;
    });
    follow(sim, 300, () => prompts(sim));
    expect(done).toEqual(CORE_STEPS);
    expect(hiddenAt, 'guide hid during the opening line').toBe(-1);
    expect(saveUp).toBe(0);
    expect(sim.state.records.matches).toBeGreaterThan(0);
    expect(sim.hasStaff('ball_boy')).toBe(true);
    expect(sim.guide.objective?.step).toBeUndefined();
  });

  it('earn hints hold a moment instead of flickering', () => {
    const sim = new Sim(createInitialState(AREA1, 5));
    let last = -10;
    let fast = 0;
    sim.events.on('guideChanged', (e) => {
      if (e.mode === 'tutorial' && e.objective && sim.state.flags['tut:cones'] && sim.state.time - last < 0.5 && !e.objective.key.startsWith('obj.bring_') && !e.objective.key.startsWith('tut.')) fast++;
      last = sim.state.time;
    });
    follow(sim, 200, () => prompts(sim));
    expect(fast).toBeLessThanOrEqual(3);
  });

  it('shows a hint when the player stands still after the handover, and hides it again on progress', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    follow(sim, 300, () => prompts(sim));
    expect(sim.state.flags['tut:' + HANDOVER_STEP]).toBe(true);
    // stand still
    for (let t = 0; t < BALANCE.objectives.lostIdleSec + 0.5; t += STEP) {
      sim.input.x = sim.input.z = 0;
      sim.tick(STEP);
    }
    // (an optional feature intro may be what it shows)
    expect(['lost', 'tutorial']).toContain(sim.guide.mode);
    const hint = sim.guide.objective;
    expect(hint).not.toBeNull();
    if (sim.guide.mode !== 'lost') return;
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

  it('old saves skip steps they have already done (silently: not live)', () => {
    const sim = new Sim(createInitialState(AREA1, 8));
    const live: string[] = [];
    sim.events.on('tutorialStep', (e) => {
      if (e.live) live.push(e.id);
    });
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
    expect(live).toEqual([]);
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
        if (up && keys.has('tut.upgrade') && sim.state.cash >= up.cost) sim.buyUpgrade(up.id);
        sim.dismissPrompt();
      } else if (sim.prompt === 'kickoff') {
        const m = sim.startMatch();
        m.chances.forEach((_, i) => sim.resolveMatchChance(i, 0.6));
        sim.finishCurrentMatch();
      }
    });
    for (const k of ['tut.graduate', 'tut.upgrade', 'tut.match']) expect(keys.has(k), k).toBe(true);
    for (const f of ['graduate', 'upgrade', 'match']) expect(sim.state.flags['tut:' + f], f).toBe(true);
  });
});
