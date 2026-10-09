import { describe, expect, it } from 'vitest';
import { parseSave } from '../../src/core/save';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { SAVE_VERSION } from '../../src/data/constants';
import { Sim, createInitialState } from '../../src/sim/sim';
import { DEFAULT_SETTINGS } from '../../src/ui/settings';

const DT = 1 / 60;
const pad = (sim: Sim, id: string) => sim.world.pads.get(id)!;
const ticks = (sim: Sim, sec: number): void => {
  for (let i = 0; i < sec * 60; i++) sim.tick(DT);
};

describe('M3: office upgrades', () => {
  it('costs grow per level, buying applies the effect, max level stops', () => {
    const sim = new Sim(createInitialState(undefined, 3));
    sim.state.cash = 100_000;
    const c0 = sim.upgradeCost('coach_speed')!;
    expect(sim.buyUpgrade('coach_speed')).toBe(true);
    expect(sim.upgradeCost('coach_speed')!).toBeGreaterThan(c0);
    expect(sim.coachSpeed()).toBeCloseTo(BALANCE.coach.speed * 1.07, 5);
    while (sim.buyUpgrade('coach_speed'));
    expect(sim.upgradeCost('coach_speed')).toBeNull();
    expect(sim.buyUpgrade('coach_carry')).toBe(true);
    expect(sim.carryCap()).toBe(BALANCE.coach.carryCap + 1);
  });

  it('respects requirements and cash', () => {
    const sim = new Sim(createInitialState(undefined, 3));
    sim.state.cash = 100_000;
    expect(sim.upgradeUnlocked('st:shooting_goal')).toBe(false);
    expect(sim.buyUpgrade('st:shooting_goal')).toBe(false);
    sim.unlockPad(pad(sim, 'p_crate'));
    sim.unlockPad(pad(sim, 'p_goal'));
    expect(sim.buyUpgrade('st:shooting_goal')).toBe(true);
    expect(sim.stationRepMult('shooting_goal')).toBeCloseTo(0.88, 5);
    sim.state.cash = 0;
    expect(sim.buyUpgrade('coach_sign')).toBe(false);
  });
});

describe('M3: staff', () => {
  it('the receptionist signs trainees without the coach', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    for (const id of ['p_crate', 'p_goal', 'p_ballboy', 'p_reception']) sim.unlockPad(pad(sim, id));
    expect(sim.state.staff.some((f) => f.kind === 'receptionist')).toBe(true);
    // keep the coach far from the desk
    sim.state.coach.x = sim.state.coach.px = 10;
    sim.state.coach.z = sim.state.coach.pz = 0;
    ticks(sim, 60);
    expect(sim.state.stats.signed).toBeGreaterThan(0);
  });

  it('an assistant coach makes their drill faster', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    const before = sim.stationRepMult('shooting_goal');
    sim.state.staff.push({ ...sim.state.coach, id: 'assistant:shooting_goal', kind: 'assistant', state: 'idle', carry: 0, target: null, timer: 0, goal: null, path: [], pathI: 0, stuckT: 0, bestD: 0, moving: false });
    expect(sim.stationRepMult('shooting_goal')).toBeCloseTo(before * BALANCE.staff.assistant.repTimeMult, 5);
  });

  it('the accountant gathers cash piles into the office safe', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    for (const id of ['p_crate', 'p_goal', 'p_ballboy', 'p_reception', 'p_cones', 'p_wall', 'p_chairs2', 'p_shelter']) sim.unlockPad(pad(sim, id));
    sim.unlockPad(pad(sim, 'p_accountant'));
    const desk = sim.pile('desk')!;
    desk.amount = 50;
    ticks(sim, 6);
    expect(desk.amount).toBeLessThan(5);
    expect(sim.pile('safe')!.amount).toBeGreaterThan(45);
    expect(sim.pile('safe')!.x).toBe(AREA1.safe.x);
  });
});

describe('M3: office computer prompt', () => {
  it('opens without a graduate, and re-opens for a new graduate while the coach stays', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    const P = AREA1.office.computer;
    const stand = (): void => {
      sim.state.coach.x = sim.state.coach.px = P.x;
      sim.state.coach.z = sim.state.coach.pz = P.z;
      sim.tick(DT);
    };
    stand();
    expect(sim.prompt).toBe('podium');
    sim.dismissPrompt();
    stand();
    expect(sim.prompt).toBeNull();
    // a graduate sits down: the computer re-opens
    const t = sim.spawnTrainee()!;
    t.x = AREA1.office.seats[0]!.x;
    t.z = AREA1.office.seats[0]!.z;
    t.state = 'atPodium';
    sim.state.podiumQueue.push(t.id);
    stand();
    expect(sim.prompt).toBe('podium');
  });

  it('migrates v3 saves (upgrades default to none)', () => {
    const game = createInitialState() as unknown as Record<string, unknown>;
    delete game.upgrades;
    const raw = JSON.stringify({ v: 3, created: 0, lastSeen: 0, game, settings: DEFAULT_SETTINGS, stats: { playSec: 0, sessions: 1, firstDay: '' } });
    const r = parseSave(raw, AREA1);
    expect(r.blob?.v).toBe(SAVE_VERSION);
    expect(r.blob?.game.upgrades).toEqual({});
  });
});
