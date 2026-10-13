import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';

describe('opening minute', () => {
  it('the first player is already waiting in reception when the Shooting Goal is built', () => {
    const sim = new Sim(createInitialState(AREA1, 3));
    expect(sim.state.trainees.length).toBe(0);
    sim.unlockPad(sim.world.pads.get('p_crate')!);
    sim.unlockPad(sim.world.pads.get('p_goal')!);
    expect(sim.state.trainees.length).toBe(1);
    const t = sim.state.trainees[0]!;
    expect(t.state).toBe('seated');
    expect(t.name.startsWith(BALANCE.tutorial.firstTraineeName)).toBe(true);
    // the bus still brings the next ones
    for (let i = 0; i < 60 * 6; i++) sim.tick(1 / 60);
    expect(sim.state.trainees.length).toBeGreaterThan(1);
  });

  it('the opening boost signs faster at the start and is gone after it fades', () => {
    const sim = new Sim(createInitialState(AREA1, 3));
    expect(sim.openingK()).toBe(1);
    const fast = sim.signTime();
    sim.state.time = BALANCE.opening.sec + BALANCE.opening.fade;
    expect(sim.openingK()).toBe(0);
    expect(sim.signTime()).toBeCloseTo(BALANCE.desk.signTime);
    expect(fast).toBeCloseTo(BALANCE.desk.signTime * BALANCE.opening.signTimeMult);
  });
});
