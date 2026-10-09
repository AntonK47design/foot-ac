import { describe, expect, it } from 'vitest';
import { parseSave } from '../../src/core/save';
import { Rng } from '../../src/core/rng';
import { AREA1 } from '../../src/data/areas/area1';
import { BALANCE } from '../../src/data/balance';
import { SAVE_VERSION } from '../../src/data/constants';
import * as Meta from '../../src/sim/meta';
import { Sim, createInitialState } from '../../src/sim/sim';
import { DEFAULT_SETTINGS } from '../../src/ui/settings';

const H = 3_600_000;
const T0 = Date.UTC(2026, 4, 10, 12, 0); // 10 May 2026, 12:00 UTC

function leveled(level: number): Sim {
  const sim = new Sim(createInitialState(undefined, 7));
  sim.state.level = level;
  sim.now = T0;
  sim.tz = 0;
  return sim;
}

describe('M4: calendar days', () => {
  it('uses the local day: the same instant is a different day in different time zones', () => {
    const t = Date.UTC(2026, 4, 10, 23, 30);
    expect(Meta.dayKey(t, 0)).toBe('2026-05-10');
    expect(Meta.dayKey(t, -120)).toBe('2026-05-11'); // UTC+2: already past midnight
    expect(Meta.dayKey(t, 300)).toBe('2026-05-10'); // UTC−5
    expect(Meta.msToMidnight(t, 0)).toBe(30 * 60_000);
  });
});

describe('M4: daily reward', () => {
  it('locks until level 2, claims once per day, and a missed day keeps the streak', () => {
    const sim = leveled(1);
    expect(sim.claimDaily()).toBeNull();
    sim.state.level = BALANCE.meta.unlockLevel.daily;
    const r1 = sim.claimDaily()!;
    expect(r1.cash).toBeGreaterThan(0);
    expect(sim.claimDaily()).toBeNull(); // same day
    sim.now = T0 + 24 * H;
    expect(sim.claimDaily()!.tickets).toBe(1); // day 2
    sim.now = T0 + 24 * 4 * H; // skipped two days
    expect(Meta.dailyIndex(sim.state)).toBe(2);
    expect(sim.claimDaily()).not.toBeNull();
  });

  it('day 7 adds a guaranteed Epic prospect who arrives on the next bus', () => {
    const sim = leveled(3);
    sim.state.meta.daily.claims = 6;
    sim.claimDaily();
    expect(sim.state.prospects).toHaveLength(1);
    expect(sim.state.prospects[0]!.rarity).toBe('epic');
    sim.state.flags.firstTraineeSpawned = true;
    const t = sim.spawnTrainee()!;
    expect(t.rarity).toBe('epic');
    expect(t.scouted).toBe(true);
  });
});

describe('M4: quests', () => {
  it('refresh at local midnight, progress from play and pay out once', () => {
    const sim = leveled(BALANCE.meta.unlockLevel.quests);
    sim.updateMeta();
    const list = sim.state.meta.quests.list;
    expect(list).toHaveLength(BALANCE.meta.quests.perDay);
    expect(new Set(list.map((q) => q.kind)).size).toBe(list.length);
    const q = list[0]!;
    Meta.questProgress(sim.state, q.kind, q.target);
    const cash = sim.state.cash;
    expect(sim.claimQuest(q.id)).not.toBeNull();
    expect(sim.state.cash).toBe(cash + q.cash);
    expect(sim.claimQuest(q.id)).toBeNull();
    // next day: new set
    sim.now = T0 + 24 * H;
    sim.updateMeta();
    expect(sim.state.meta.quests.day).toBe('2026-05-11');
    expect(sim.state.meta.quests.list.every((x) => !x.claimed && x.progress === 0)).toBe(true);
  });
});

describe('M4: scouting', () => {
  it('costs tickets, runs on the wall clock, and finds a prospect at least the tier floor', () => {
    const sim = leveled(BALANCE.meta.unlockLevel.scout);
    expect(sim.startScout('regional')).toBe(false); // no tickets
    sim.state.tickets = 1;
    expect(sim.startScout('regional')).toBe(true);
    expect(sim.state.tickets).toBe(0);
    expect(sim.startScout('local')).toBe(false); // one mission at a time
    sim.now = T0 + 29 * 60_000;
    sim.updateMeta();
    expect(sim.state.prospects).toHaveLength(0);
    sim.now = T0 + 31 * 60_000;
    sim.updateMeta();
    expect(sim.state.prospects).toHaveLength(1);
    expect(['rare', 'epic', 'wonderkid']).toContain(sim.state.prospects[0]!.rarity);
    expect(sim.state.meta.scout.tier).toBeNull();
  });

  it('wonderkid odds grow with the mission tier', () => {
    const count = (tier: 'local' | 'global'): number => {
      const rng = new Rng(1);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (Meta.rollScoutRarity(rng, tier) === 'wonderkid') n++;
      return n;
    };
    expect(count('global')).toBeGreaterThan(count('local') * 4);
  });
});

describe('M4: Daily Cup', () => {
  it('is available once a day without the league timer and leaves the table alone', () => {
    const sim = leveled(BALANCE.meta.unlockLevel.cup);
    sim.state.built[AREA1.matchPitch.objectId] = true;
    sim.state.matchNextAt = 1e9;
    expect(sim.cupAvailable()).toBe(true);
    expect(sim.matchAvailable()).toBe(true);
    const m = sim.startMatch();
    expect(m.cup).toBe(true);
    sim.finishCurrentMatch();
    expect(sim.state.league.round).toBe(0);
    expect(sim.state.league.table.every((r) => r.p === 0)).toBe(true);
    expect(sim.cupAvailable()).toBe(false);
    expect(sim.matchAvailable()).toBe(false);
    sim.now = T0 + 24 * H;
    expect(sim.cupAvailable()).toBe(true);
  });
});

describe('M4: Hall of Fame', () => {
  it('fills slots by position × rarity; milestones pay out from the album level', () => {
    const sim = leveled(1);
    for (const p of ['GK', 'DF', 'MF', 'FW'] as const) Meta.albumAdd(sim.state, p, 'common');
    Meta.albumAdd(sim.state, 'FW', 'common');
    expect(Meta.albumSlots(sim.state)).toBe(4);
    expect(sim.claimAlbum()).toBeNull(); // album rewards locked
    sim.state.level = BALANCE.meta.unlockLevel.album;
    const r = sim.claimAlbum()!;
    expect(r.tickets).toBe(BALANCE.meta.album[0]!.tickets);
    expect(sim.claimAlbum()).toBeNull();
  });
});

describe('M4: offline earnings and chests', () => {
  it('needs automation, ignores short breaks and caps at the office limit', () => {
    const sim = leveled(5);
    sim.state.meta.incomeRate = 10;
    expect(Meta.offlineEarnings(sim.state, 3600).cash).toBe(0); // no ball boy
    sim.state.staff.push({ ...sim.state.coach, id: 'ball_boy', kind: 'ball_boy', state: 'idle', carry: 0, target: null, timer: 0, goal: null, path: [], pathI: 0, stuckT: 0, bestD: 0, moving: false });
    expect(Meta.offlineEarnings(sim.state, 60).cash).toBe(0);
    expect(Meta.offlineEarnings(sim.state, 3600).cash).toBe(10 * BALANCE.meta.offline.share * 3600);
    const capped = Meta.offlineEarnings(sim.state, 48 * 3600);
    expect(capped.sec).toBe(BALANCE.meta.offline.baseCapSec);
    sim.state.upgrades.academy_offline = 3;
    expect(Meta.offlineEarnings(sim.state, 48 * 3600).sec).toBe(8 * 3600);
  });

  it('every level-up opens a chest', () => {
    const sim = leveled(1);
    const chests: number[] = [];
    sim.events.on('chest', (e) => chests.push(e.level));
    (sim as unknown as { addXp(n: number): void }).addXp(BALANCE.levelXp[4]!);
    expect(chests).toEqual([2, 3, 4, 5]);
    expect(sim.state.tickets).toBe(4);
  });

  it('migrates v4 saves with meta defaults', () => {
    const game = createInitialState() as unknown as Record<string, unknown>;
    delete game.meta;
    delete game.tickets;
    delete game.prospects;
    const raw = JSON.stringify({ v: 4, created: 0, lastSeen: 0, game, settings: DEFAULT_SETTINGS, stats: { playSec: 0, sessions: 1, firstDay: '' } });
    const r = parseSave(raw, AREA1);
    expect(r.blob?.v).toBe(SAVE_VERSION);
    expect(r.blob?.game.tickets).toBe(0);
    expect(r.blob?.game.meta.daily.claims).toBe(0);
    expect(r.blob?.game.prospects).toEqual([]);
  });
});
