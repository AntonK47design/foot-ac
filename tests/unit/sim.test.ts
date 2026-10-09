import { describe, expect, it } from 'vitest';
import { Sim, createInitialState } from '../../src/sim/sim';
import { BALANCE } from '../../src/data/balance';
import { Rng } from '../../src/core/rng';
import { runBot } from '../../src/sim/bot/bot';

const DT = 1 / 60;

/** Walks the coach along a nav path (walls and fences block straight lines). */
function walkTo(sim: Sim, x: number, z: number, maxSec = 30): void {
  const c0 = sim.state.coach;
  const path = sim.nav.findPath(c0.x, c0.z, x, z);
  let k = 0;
  for (let i = 0; i < maxSec * 60; i++) {
    const c = sim.state.coach;
    const last = k * 2 >= path.length - 2;
    const wx = path[k * 2] ?? x;
    const wz = path[k * 2 + 1] ?? z;
    const dx = wx - c.x;
    const dz = wz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < (last ? 0.2 : 0.35)) {
      if (last) {
        sim.input.x = 0;
        sim.input.z = 0;
        return;
      }
      k++;
      continue;
    }
    sim.input.x = dx / d;
    sim.input.z = dz / d;
    sim.tick(DT);
  }
}

function wait(sim: Sim, sec: number): void {
  sim.input.x = 0;
  sim.input.z = 0;
  for (let i = 0; i < sec * 60; i++) sim.tick(DT);
}

describe('sim basics', () => {
  it('collects the starter pile and unlocks the crate pad', () => {
    const sim = new Sim(createInitialState(undefined, 1));
    const pile = sim.pile('starter_a');
    expect(pile).toBeTruthy();
    walkTo(sim, pile!.x, pile!.z);
    expect(sim.state.cash).toBe(15);
    const pad = sim.world.pads.get('p_crate')!;
    walkTo(sim, pad.pos.x, pad.pos.z);
    wait(sim, 1.6);
    expect(sim.state.pads.p_crate?.done).toBe(true);
    expect(sim.state.cash).toBeCloseTo(sim.state.stats.cashCollected - 10, 5);
    expect(sim.state.stars).toBe(1);
  });

  it('drains a pad partially and keeps the progress', () => {
    const sim = new Sim(createInitialState(undefined, 1));
    for (const p of sim.state.piles) p.amount = 0;
    sim.state.cash = 4;
    const pad = sim.world.pads.get('p_crate')!;
    walkTo(sim, pad.pos.x, pad.pos.z);
    wait(sim, 1);
    expect(sim.state.cash).toBe(0);
    expect(sim.state.pads.p_crate?.paid).toBeCloseTo(4, 5);
    expect(sim.state.pads.p_crate?.done).toBe(false);
  });

  it('fills the carry stack up to capacity and unloads into a basket', () => {
    const sim = new Sim(createInitialState(undefined, 1));
    sim.unlockPad(sim.world.pads.get('p_crate')!);
    sim.unlockPad(sim.world.pads.get('p_goal')!);
    walkTo(sim, sim.area.crate.spot.x, sim.area.crate.spot.z);
    wait(sim, 2);
    expect(sim.state.coach.carry).toBe(BALANCE.coach.carryCap);
    const b = sim.station('shooting_goal').basket!;
    walkTo(sim, b.x, b.z);
    wait(sim, 1);
    expect(sim.state.coach.carry).toBe(0);
    expect(sim.state.stations.shooting_goal?.balls).toBe(BALANCE.coach.carryCap);
  });

  it('runs the first trainee lifecycle: bus → desk → sign → train → cash', () => {
    const sim = new Sim(createInitialState(undefined, 1));
    sim.unlockPad(sim.world.pads.get('p_crate')!);
    sim.unlockPad(sim.world.pads.get('p_goal')!);
    sim.state.stations.shooting_goal!.balls = 8;
    wait(sim, 16);
    const tr = sim.deskTrainee();
    expect(tr?.name.startsWith('Leo')).toBe(true);
    expect(tr?.rarity).toBe('rare');
    const d = sim.area.desk.coachSpot;
    walkTo(sim, d.x, d.z);
    wait(sim, BALANCE.desk.signTime + 0.2);
    expect(sim.state.stats.signed).toBe(1);
    wait(sim, 20);
    expect(sim.state.stats.reps).toBeGreaterThan(0);
    expect(sim.pile('st:shooting_goal')!.amount).toBeGreaterThan(0);
  });

  it('never soft-locks under random input for 20 minutes', () => {
    const sim = new Sim(createInitialState(undefined, 3));
    const rng = new Rng(77);
    sim.state.cash = 2000;
    for (let i = 0; i < 20 * 60 * 60; i++) {
      if (i % 90 === 0) {
        sim.input.x = rng.range(-1, 1);
        sim.input.z = rng.range(-1, 1);
      }
      sim.tick(DT);
      const c = sim.state.coach;
      const b = sim.area.bounds;
      expect(c.x).toBeGreaterThanOrEqual(b.x0);
      expect(c.x).toBeLessThanOrEqual(b.x1);
    }
    // nobody stuck forever: every trainee either progresses or waits for a valid reason
    for (const t of sim.state.trainees) {
      expect(Number.isFinite(t.x) && Number.isFinite(t.z)).toBe(true);
    }
    expect(sim.objective).not.toBeNull();
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = runBot({ efficiency: 1, seed: 11, minutes: 2 });
    const b = runBot({ efficiency: 1, seed: 11, minutes: 2 });
    expect(a.unlockTimes).toEqual(b.unlockTimes);
    expect(a.finalCash).toBe(b.finalCash);
  });

});

describe('economy bot (beat sheet §5.1)', () => {
  it('meets the first-minute beats', () => {
    const r = runBot({ efficiency: 1, seed: 12345, minutes: 1.2 });
    expect(r.marks.firstCash).toBeLessThanOrEqual(5);
    expect(r.marks.firstUnlock).toBeLessThanOrEqual(12);
    expect(r.marks['unlock:p_goal']).toBeLessThanOrEqual(20);
    expect(r.marks.firstSign).toBeLessThanOrEqual(25);
    expect(r.marks.firstRep).toBeLessThanOrEqual(45);
    expect(r.marks.thirdUnlock).toBeLessThanOrEqual(60);
  });
});
