import { describe, expect, it } from 'vitest';
import { parseSave } from '../../src/core/save';
import { Rng } from '../../src/core/rng';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { SAVE_VERSION } from '../../src/data/constants';
import { createMatch, finishMatch, newLeague, pairings, resolveChance } from '../../src/sim/match';
import { createTrainee } from '../../src/sim/players';
import { Sim, createInitialState } from '../../src/sim/sim';
import type { Player, Trainee } from '../../src/sim/state';
import { DEFAULT_SETTINGS } from '../../src/ui/settings';

const DT = 1 / 60;

function player(id: number, ovr: number): Player {
  return {
    id,
    name: `P ${id}`,
    age: 16,
    position: id === 1 ? 'GK' : 'FW',
    rarity: 'rare',
    female: false,
    look: { skin: 0, hair: 0, hairColor: 0, face: 0 },
    stats: { PAC: ovr, SHO: ovr, PAS: ovr, DRI: ovr },
    cap: 90,
    apps: 0,
    goals: 0,
  };
}

/** Puts a ready-made graduate on the podium (skips training). */
function graduate(sim: Sim, ovr = 50): Trainee {
  const t = createTrainee(new Rng(sim.state.nextId), sim.state.nextId++, AREA1.podium.top.x, AREA1.podium.top.z, { rarity: 'rare' });
  for (const k of ['PAC', 'SHO', 'PAS', 'DRI'] as const) t.stats[k] = ovr;
  t.state = 'atPodium';
  sim.state.trainees.push(t);
  sim.state.podiumQueue.push(t.id);
  return t;
}

function standAt(sim: Sim, x: number, z: number): void {
  sim.state.coach.x = sim.state.coach.px = x;
  sim.state.coach.z = sim.state.coach.pz = z;
  sim.tick(DT);
}

describe('M2: podium and transfers', () => {
  it('opens the podium prompt when the coach steps up, and selling pays the transfer value', () => {
    const sim = new Sim(createInitialState(undefined, 2));
    const g = graduate(sim, 52);
    const opened: number[] = [];
    sim.events.on('podiumOpen', (e) => opened.push(e.id));
    const sold: number[] = [];
    sim.events.on('sold', (e) => sold.push(e.price));
    const P = AREA1.podium.coachSpot;
    standAt(sim, P.x, P.z);
    expect(sim.prompt).toBe('podium');
    expect(opened).toEqual([g.id]);
    const value = sim.transferValue(g);
    const cash = sim.state.cash;
    sim.decideGraduate('sell');
    expect(sim.state.cash).toBe(cash + value);
    expect(sold).toEqual([value]);
    expect(sim.state.podiumQueue).toHaveLength(0);
    expect(sim.trainee(g.id)?.state).toBe('leaving');
  });

  it('dismissing re-opens only after the coach leaves the zone', () => {
    const sim = new Sim(createInitialState(undefined, 2));
    graduate(sim);
    const P = AREA1.podium.coachSpot;
    standAt(sim, P.x, P.z);
    sim.dismissPrompt();
    standAt(sim, P.x, P.z);
    expect(sim.prompt).toBeNull();
    standAt(sim, P.x + 5, P.z + 3);
    standAt(sim, P.x, P.z);
    expect(sim.prompt).toBe('podium');
  });

  it('promoting fills the squad, then replaces (and sells) the weakest player', () => {
    const sim = new Sim(createInitialState(undefined, 2));
    for (let i = 0; i < BALANCE.squad.size; i++) {
      graduate(sim, 40 + i);
      sim.decideGraduate('promote');
    }
    expect(sim.state.squad).toHaveLength(BALANCE.squad.size);
    const weakest = sim.weakestSquadPlayer()!;
    graduate(sim, 60);
    const cash = sim.state.cash;
    sim.decideGraduate('promote');
    expect(sim.state.squad).toHaveLength(BALANCE.squad.size);
    expect(sim.state.squad.some((p) => p.id === weakest.id)).toBe(false);
    expect(sim.state.cash).toBeGreaterThan(cash);
  });

  it('a full podium line never blocks graduation (auto-sale)', () => {
    const sim = new Sim(createInitialState(undefined, 2));
    for (let i = 0; i < 1 + AREA1.podium.line.length; i++) graduate(sim);
    expect(sim.state.podiumQueue).toHaveLength(1 + AREA1.podium.line.length);
    const extra = createTrainee(new Rng(1), 999, 0, 0);
    sim.state.trainees.push(extra);
    const cash = sim.state.cash;
    (sim as unknown as { graduate(t: Trainee): void }).graduate(extra);
    expect(extra.state).toBe('leaving');
    expect(sim.state.cash).toBeGreaterThan(cash);
    expect(sim.state.podiumQueue).toHaveLength(1 + AREA1.podium.line.length);
  });
});

describe('M2: matches and league', () => {
  it('pairs every team exactly once per season', () => {
    const seen = new Set<string>();
    for (let r = 0; r < 5; r++) for (const [a, b] of pairings(r)) seen.add([a, b].sort().join('-'));
    expect(seen.size).toBe(15);
  });

  it('Power Shot quality only ever helps', () => {
    const rng = new Rng(9);
    let good = 0;
    let bad = 0;
    for (let i = 0; i < 300; i++) {
      const m = createMatch(rng, [player(1, 50), player(2, 50)], newLeague(0, 1));
      for (const c of m.chances.filter((x) => x.power)) {
        const a = { ...c, goal: null };
        const b = { ...c, goal: null };
        if (resolveChance(a, 1)) good++;
        if (resolveChance(b, 0)) bad++;
        expect(Number(resolveChance({ ...c, goal: null }, 1))).toBeGreaterThanOrEqual(Number(resolveChance({ ...c, goal: null }, 0)));
      }
    }
    expect(good).toBeGreaterThan(bad);
  });

  it('a dominant squad wins the division and is promoted at season end', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    sim.state.built[AREA1.matchPitch.objectId] = true;
    sim.state.squad = [1, 2, 3, 4, 5].map((i) => player(i, 95));
    let promotedTo = -1;
    sim.events.on('divisionUp', (e) => (promotedTo = e.division));
    for (let r = 0; r < 5; r++) {
      sim.state.matchNextAt = 0;
      expect(sim.matchAvailable()).toBe(true);
      const m = sim.startMatch();
      m.chances.forEach((c, i) => sim.resolveMatchChance(i, c.power ? 1 : 0.5));
      sim.finishCurrentMatch();
    }
    expect(promotedTo).toBe(1);
    expect(sim.state.league.division).toBe(1);
    expect(sim.state.league.round).toBe(0);
    expect(sim.state.records.titles).toBe(1);
    expect(sim.state.squad.every((p) => p.apps === 5)).toBe(true);
  });

  it('match results are deterministic for the same seed', () => {
    const run = (): string => {
      const league = newLeague(0, 1);
      const m = createMatch(new Rng(77), [player(1, 45)], league);
      return JSON.stringify(finishMatch(new Rng(78), m, league, [player(1, 45)]));
    };
    expect(run()).toBe(run());
  });

  it('kick-off prompt waits for the timer', () => {
    const sim = new Sim(createInitialState(undefined, 4));
    sim.unlockPad(sim.world.pads.get('p_match')!);
    const K = AREA1.matchPitch.kickoff;
    standAt(sim, K.x, K.z);
    expect(sim.prompt).toBe('kickoff');
    sim.startMatch();
    sim.finishCurrentMatch();
    expect(sim.matchAvailable()).toBe(false);
    expect(sim.matchCountdown()).toBeCloseTo(BALANCE.match.interval, 0);
  });
});

describe('M2: save', () => {
  it('migrates v2 saves and fills squad / league defaults', () => {
    const game = createInitialState() as unknown as Record<string, unknown>;
    delete game.squad;
    delete game.league;
    delete game.podiumQueue;
    delete game.records;
    delete game.matchNextAt;
    const raw = JSON.stringify({ v: 2, created: 0, lastSeen: 0, game, settings: DEFAULT_SETTINGS, stats: { playSec: 0, sessions: 1, firstDay: '' } });
    const r = parseSave(raw, AREA1);
    expect(r.blob?.v).toBe(SAVE_VERSION);
    expect(r.blob?.game.squad).toEqual([]);
    expect(r.blob?.game.league.table).toHaveLength(6);
    expect(r.blob?.game.records.bestSale).toBe(0);
  });
});
