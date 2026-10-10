import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';

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

describe('guide: fixed tutorial route, then hidden', () => {
  it('walks the Sunday Park route in order without jumping around', () => {
    const sim = new Sim(createInitialState(AREA1, 12345));
    const seen: string[] = [];
    sim.events.on('guideChanged', (e) => {
      const k = e.objective ? `${e.mode}:${e.objective.key}` : `${e.mode}`;
      if (seen[seen.length - 1] !== k) seen.push(k);
    });
    play(sim, 120);
    const tut = seen.filter((k) => k.startsWith('tutorial:')).map((k) => k.slice(9));
    // the route as the player sees it (save-up steps may appear when short of cash)
    const order = ['obj.collect_cash', 'obj.unlock', 'obj.meet_first|obj.sign', 'obj.grab_balls', 'obj.bring_balls', 'obj.collect_fees', 'obj.unlock'];
    let i = 0;
    for (const k of tut) {
      while (i < order.length && !(order[i] as string).split('|').includes(k) && k !== 'obj.save_for' && k !== 'obj.sign' && k !== 'obj.grab_balls' && k !== 'obj.bring_balls') i++;
      expect(i, `unexpected step ${k} in ${tut.join(' → ')}`).toBeLessThan(order.length);
    }
    expect(sim.state.pads.p_cones?.done).toBe(true);
    expect(sim.state.flags['tut:cones']).toBe(true);
    // after the route: nothing is forced on the player
    expect(['hidden', 'lost']).toContain(sim.guide.mode);
  });

  it('shows a hint when the player stands still, and hides it again on progress', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    play(sim, 100);
    expect(sim.state.flags['tut:cones']).toBe(true);
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
    sim.tick(STEP);
    // Sunday Park done: the route jumps to the Training Ground gate
    expect(sim.guide.mode).toBe('tutorial');
    expect(sim.guide.objective?.targetId).toBe('p2_gate');
  });
});
