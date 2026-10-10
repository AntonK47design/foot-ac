import { describe, expect, it } from 'vitest';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { STATS } from '../../src/data/types';
import { Sim, createInitialState } from '../../src/sim/sim';
import { createMatch } from '../../src/sim/match';
import { Rng } from '../../src/core/rng';

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

function teleport(sim: Sim, x: number, z: number): void {
  const c = sim.state.coach;
  c.x = c.px = x;
  c.z = c.pz = z;
}

const padsOf = (area: number): string[] => AREA1.pads.filter((p) => p.area === area).map((p) => p.id);

describe('M7: Youth Stadium', () => {
  it('the gate appears only when the Training Ground is complete and opens the third plot', () => {
    const sim = new Sim(createInitialState(AREA1, 5));
    const gate = sim.world.pads.get('p3_gate')!;
    unlock(sim, ...padsOf(1));
    expect(sim.isPadVisible(gate)).toBe(false);
    unlock(sim, ...padsOf(2));
    expect(sim.isPadVisible(gate)).toBe(true);
    // fenced off until bought: the gate is in Sunday Park's west edge, beside the office
    const gp = gate.pos;
    const edge = AREA1.expansions.find((e) => e.area === 3)!.plot.x1;
    sim.state.coach.x = gp.x;
    sim.state.coach.z = gp.z;
    walkTo(sim, edge - 5, gp.z, 4);
    expect(sim.state.coach.x).toBeGreaterThan(edge);
    expect(sim.currentArea()).toBe(2);
    unlock(sim, 'p3_gate');
    expect(sim.area3Open()).toBe(true);
    walkTo(sim, edge - 5, gp.z, 6);
    expect(sim.state.coach.x).toBeLessThan(edge - 3);
    expect(sim.currentArea()).toBe(3);
    expect(sim.areaStars()).toEqual({ have: gate.stars, total: sim.world.areaStars[3] });
  });

  it('every Area 3 pad is reachable and none sits inside something built later', () => {
    const sim = new Sim(createInitialState(AREA1, 6));
    unlock(sim, ...padsOf(1), ...padsOf(2), ...padsOf(3));
    for (const p of AREA1.pads.filter((q) => q.area === 3)) {
      // after everything is built, a pad's spot must still be walkable (else the coach can get trapped on unlock)
      expect(sim.nav.isBlocked(p.pos.x, p.pos.z), p.id).toBe(false);
    }
  });

  it('bibs: picked at the Kit Room, only accepted by Youth Stadium drills; a Kit Manager takes over', () => {
    const sim = new Sim(createInitialState(AREA1, 7));
    unlock(sim, ...padsOf(1), ...padsOf(2), 'p3_gate', 'p3_kit', 'p3_crossing');
    const K = AREA1.bibs.spot;
    teleport(sim, K.x, K.z);
    run(sim, 1);
    expect(sim.coachCarryKind()).toBe('bib');
    expect(sim.state.coach.carry).toBeGreaterThan(0);
    // a water drill won't take bibs
    const gym = sim.station('gym');
    const before = sim.state.stations.gym?.balls ?? 0;
    teleport(sim, gym.basket!.x, gym.basket!.z);
    run(sim, 1);
    expect(sim.state.stations.gym?.balls ?? 0).toBeLessThanOrEqual(before);
    // the crossing basket does
    const cr = sim.station('crossing');
    teleport(sim, cr.basket!.x, cr.basket!.z);
    run(sim, 1);
    expect(sim.state.stations.crossing?.balls).toBeGreaterThan(0);
    expect(sim.state.flags.firstBib).toBe(true);
    // the Kit Manager refills it on their own
    unlock(sim, 'p3_heading', 'p3_kitman');
    expect(sim.state.staff.some((f) => f.kind === 'kit_manager')).toBe(true);
    sim.state.stations.crossing!.balls = 0;
    run(sim, 40);
    expect(sim.state.stations.crossing!.balls).toBeGreaterThan(0);
  });

  it('Fan Shop takings pile up and grow with the stands; the Youth Stadium makes the squad 11-a-side', () => {
    const sim = new Sim(createInitialState(AREA1, 8));
    unlock(sim, ...padsOf(1), ...padsOf(2));
    expect(sim.squadSize()).toBe(BALANCE.squad.sizeSeven);
    expect(sim.shopRate()).toBe(0);
    unlock(sim, 'p3_gate', 'p3_kit', 'p3_crossing', 'p3_heading', 'p3_kitman', 'p3_juggling', 'p3_reaction', 'p3_tactics', 'p3_shop');
    const r0 = sim.shopRate();
    expect(r0).toBeCloseTo(BALANCE.area3.shopCashPerSec);
    // (without the accountant banking it in the office safe)
    sim.state.staff = sim.state.staff.filter((f) => f.kind !== 'accountant');
    run(sim, 10);
    expect(sim.pile('shop')!.amount).toBeGreaterThan(r0 * 9);
    unlock(sim, 'p3_analysis', 'p3_stadium');
    expect(sim.squadSize()).toBe(BALANCE.squad.sizeEleven);
    const m0 = sim.matchCashMult();
    expect(m0).toBeCloseTo(BALANCE.squad.stadiumCashMult);
    unlock(sim, 'p3_stand_main', 'p3_lights', 'p3_stand_sides');
    expect(sim.matchCashMult()).toBeCloseTo(m0 + 2 * BALANCE.area3.standCashMult + BALANCE.area3.lightsCashMult);
    expect(sim.shopRate()).toBeCloseTo(r0 * (1 + 2 * BALANCE.area3.shopPerStand));
    // 11-a-side line-up from a short squad is filled with subs
    const m = sim.startMatch();
    expect(m.lineup.length).toBe(11);
  });

  it('the Analysis Lab adds strength; the Tactics Room boosts graduates', () => {
    const squad = new Sim(createInitialState(AREA1, 9)).state.squad;
    const a = createMatch(new Rng(5), squad, new Sim(createInitialState(AREA1, 9)).state.league, undefined, 5, 0);
    const b = createMatch(new Rng(5), squad, new Sim(createInitialState(AREA1, 9)).state.league, undefined, 5, BALANCE.area3.analysisStrength);
    const ours = (m: typeof a): number => m.chances.filter((c) => c.side === 'us').length;
    expect(ours(b)).toBeGreaterThanOrEqual(ours(a));

    const sim = new Sim(createInitialState(AREA1, 10));
    unlock(sim, ...padsOf(1), ...padsOf(2), 'p3_gate', 'p3_kit', 'p3_crossing', 'p3_heading', 'p3_kitman', 'p3_juggling', 'p3_reaction', 'p3_tactics');
    const t = sim.spawnTrainee()!;
    const before = STATS.map((k) => t.stats[k]);
    // graduate directly (private in the sim): reach the target and finish a visit
    (sim as unknown as { graduate(t: unknown): void }).graduate(t);
    STATS.forEach((k, i) => expect(t.stats[k]).toBe((before[i] as number) + BALANCE.area3.tacticsStatBonus));
  });
});
