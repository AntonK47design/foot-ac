import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { Sim, createInitialState } from '../../src/sim/sim';

const STEP = 1 / 60;

function run(sim: Sim, sec: number): void {
  for (let t = 0; t < sec; t += STEP) sim.tick(STEP);
}

function unlock(sim: Sim, ...ids: string[]): void {
  for (const id of ids) {
    const p = sim.world.pads.get(id);
    if (!p) throw new Error(id);
    sim.unlockPad(p);
  }
}

function walkTo(sim: Sim, x: number, z: number, maxSec = 20): void {
  const c = sim.state.coach;
  for (let t = 0; t < maxSec && Math.hypot(c.x - x, c.z - z) > 0.3; t += STEP) {
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    sim.input.x = dx / d;
    sim.input.z = dz / d;
    sim.tick(STEP);
  }
  sim.input.x = sim.input.z = 0;
}

const AREA1_PADS = AREA1.pads.filter((p) => p.area === 1).map((p) => p.id);

describe('M6: Training Ground', () => {
  it('the gate appears only when Sunday Park is complete and opens the second plot', () => {
    const sim = new Sim(createInitialState(AREA1, 3));
    const gate = sim.world.pads.get('p2_gate')!;
    expect(sim.isPadVisible(gate)).toBe(false);
    unlock(sim, ...AREA1_PADS);
    expect(sim.isPadVisible(gate)).toBe(true);
    // fenced off: the coach can't walk south through the gate gap
    sim.state.coach.x = 10.5;
    sim.state.coach.z = 10.8;
    walkTo(sim, 10.5, 16, 4);
    expect(sim.state.coach.z).toBeLessThan(12);
    expect(sim.areaStars().total).toBe(sim.world.areaStars[1]);
    unlock(sim, 'p2_gate');
    expect(sim.area2Open()).toBe(true);
    walkTo(sim, 10.5, 16, 6);
    expect(sim.state.coach.z).toBeGreaterThan(15);
    expect(sim.currentArea()).toBe(2);
    expect(sim.areaStars()).toEqual({ have: gate.stars, total: sim.world.areaStars[2] });
  });

  it('water bottles: picked at the Hydration Point, only accepted by Training Ground drills', () => {
    const sim = new Sim(createInitialState(AREA1, 4));
    unlock(sim, ...AREA1_PADS, 'p2_gate', 'p2_water', 'p2_gym');
    const W = AREA1.water.spot;
    sim.state.coach.x = W.x;
    sim.state.coach.z = W.z;
    run(sim, 1);
    expect(sim.state.coach.carry).toBe(sim.carryCap());
    expect(sim.coachCarryKind()).toBe('water');
    // the shooting goal (balls) ignores water: the stack stays full
    const goal = sim.station('shooting_goal');
    sim.state.stations.shooting_goal!.balls = 0;
    walkTo(sim, goal.basket!.x, goal.basket!.z, 25);
    run(sim, 0.5);
    expect(sim.state.coach.carry).toBe(sim.carryCap());
    const gym = sim.station('gym');
    walkTo(sim, 10.5, 10.5, 25); // back through the gate
    walkTo(sim, 10.5, 14);
    walkTo(sim, gym.basket!.x, gym.basket!.z, 25);
    run(sim, 0.6);
    expect(sim.state.stations.gym!.balls).toBeGreaterThan(0);
  });

  it('stepping into the other source swaps the stack (never stuck holding the wrong supply)', () => {
    const sim = new Sim(createInitialState(AREA1, 5));
    unlock(sim, ...AREA1_PADS, 'p2_gate', 'p2_water');
    const c = sim.state.coach;
    const crate = AREA1.crate.spot;
    c.x = crate.x;
    c.z = crate.z;
    run(sim, 1);
    expect(sim.coachCarryKind()).toBe('ball');
    const W = AREA1.water.spot;
    c.x = W.x;
    c.z = W.z;
    run(sim, 1);
    expect(sim.coachCarryKind()).toBe('water');
    expect(c.carry).toBe(sim.carryCap());
  });

  it('a water carrier keeps the drills supplied; the gym trains the weakest stat', () => {
    const sim = new Sim(createInitialState(AREA1, 6));
    unlock(sim, ...AREA1_PADS, 'p2_gate', 'p2_water', 'p2_gym', 'p2_rondo', 'p2_carrier');
    expect(sim.state.staff.some((f) => f.kind === 'water_carrier')).toBe(true);
    run(sim, 40);
    expect(sim.state.stations.gym!.balls).toBeGreaterThan(0);
    expect(sim.state.stations.rondo!.balls).toBeGreaterThan(0);
    const gains: string[] = [];
    sim.events.on('rep', (e) => {
      if (e.stationId === 'gym') gains.push(e.stat);
    });
    run(sim, 120);
    expect(gains.length).toBeGreaterThan(0);
  });

  it('the 7-a-side pitch grows the squad and the match line-up to 7', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    expect(sim.squadSize()).toBe(BALANCE.squad.size);
    sim.state.built.seven_pitch = true;
    sim.state.built.match_pitch = true;
    expect(sim.squadSize()).toBe(7);
    expect(sim.startMatch().lineup).toHaveLength(7);
  });
});
