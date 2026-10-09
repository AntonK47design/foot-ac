import { describe, expect, it } from 'vitest';
import { SaveManager, parseSave, migrate, serialize, type KeyValueStore } from '../../src/core/save';
import { AREA1 } from '../../src/data/areas/area1';
import { SAVE_BACKUP_KEY, SAVE_KEY, SAVE_VERSION } from '../../src/data/constants';
import { Sim, createInitialState } from '../../src/sim/sim';
import { DEFAULT_SETTINGS } from '../../src/ui/settings';

class MemStore implements KeyValueStore {
  m = new Map<string, string>();
  dataGet(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  dataSet(k: string, v: string): void {
    this.m.set(k, v);
  }
  dataRemove(k: string): void {
    this.m.delete(k);
  }
}

function playedSim(): Sim {
  const sim = new Sim(createInitialState(undefined, 5));
  sim.unlockPad(sim.world.pads.get('p_crate')!);
  sim.unlockPad(sim.world.pads.get('p_goal')!);
  for (let i = 0; i < 60 * 15; i++) sim.tick(1 / 60);
  return sim;
}

describe('save', () => {
  it('round-trips the full sim state', () => {
    const store = new MemStore();
    const sim = playedSim();
    const sm = new SaveManager(store, AREA1, () => 1000);
    sm.load();
    expect(sm.save(sim.state, DEFAULT_SETTINGS)).toBe(true);
    const sm2 = new SaveManager(store, AREA1, () => 2000);
    const blob = sm2.load();
    expect(blob).not.toBeNull();
    expect(blob!.v).toBe(SAVE_VERSION);
    expect(blob!.game.cash).toBe(sim.state.cash);
    expect(blob!.game.pads.p_goal?.done).toBe(true);
    expect(blob!.game.trainees.length).toBe(sim.state.trainees.length);
    expect(blob!.game.trainees[0]?.name).toBe(sim.state.trainees[0]?.name);
    // the restored sim keeps running
    const sim2 = new Sim(blob!.game);
    for (let i = 0; i < 600; i++) sim2.tick(1 / 60);
    expect(sim2.state.time).toBeGreaterThan(sim.state.time);
  });

  it('is small', () => {
    const sim = playedSim();
    const s = serialize({ v: 1, created: 0, lastSeen: 0, game: sim.state, settings: DEFAULT_SETTINGS, stats: { playSec: 0, sessions: 1, firstDay: '' } });
    expect(s.length).toBeLessThan(100_000);
  });

  it('never writes before reading (read-before-write)', () => {
    const store = new MemStore();
    store.dataSet(SAVE_KEY, 'existing');
    const sm = new SaveManager(store, AREA1, () => 0);
    expect(sm.save(createInitialState(), DEFAULT_SETTINGS)).toBe(false);
    expect(store.dataGet(SAVE_KEY)).toBe('existing');
  });

  it('keeps a backup of corrupt data and starts fresh', () => {
    const store = new MemStore();
    store.dataSet(SAVE_KEY, '{"v":1,"game":{"cash":"lots"}}');
    const sm = new SaveManager(store, AREA1, () => 0);
    expect(sm.load()).toBeNull();
    expect(store.dataGet(SAVE_BACKUP_KEY)).toContain('lots');
    store.dataSet(SAVE_KEY, 'not json{');
    expect(new SaveManager(store, AREA1, () => 0).load()).toBeNull();
  });

  it('migrates v0 blobs', () => {
    const game = createInitialState();
    const m = migrate({ sim: game, created: 5 });
    expect(m.v).toBe(SAVE_VERSION);
    const r = parseSave(JSON.stringify({ sim: game, created: 5 }), AREA1);
    expect(r.blob?.game.cash).toBe(0);
  });

  it('adds pads introduced by newer content', () => {
    const game = createInitialState();
    delete (game.pads as Record<string, unknown>).p_track_l2;
    const r = parseSave(JSON.stringify({ v: 1, created: 0, lastSeen: 0, game, settings: DEFAULT_SETTINGS, stats: {} }), AREA1);
    expect(r.blob?.game.pads.p_track_l2).toEqual({ paid: 0, done: false });
  });
});
