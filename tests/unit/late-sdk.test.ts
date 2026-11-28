import { beforeEach, describe, expect, it } from 'vitest';
import { PlaygamaAdapter } from '../../src/platform/playgama';
import { MockAdapter } from '../../src/platform/mock';
import { Platform } from '../../src/platform/platform';
import { safeStorage } from '../../src/platform/storage';
import { SAVE_KEY } from '../../src/data/constants';
import { analytics } from '../../src/core/analytics';
import { fakeBridge } from './fake-bridge';

const save = (lastSeen: number, cash: number): string => JSON.stringify({ v: 1, lastSeen, cash });

describe('late Playgama Bridge: start on the mock, switch over when it arrives', () => {
  beforeEach(() => safeStorage.remove('wk_' + SAVE_KEY));

  it('holds analytics until the switch, then replays state, listeners and the held events', async () => {
    const f = fakeBridge();
    const p = new Platform(new MockAdapter());
    p.expectUpgrade();
    p.track('boot', { ms: 900 });
    p.track('sdk_ready', { kind: 'mock' });
    p.loadingStart();
    p.loadingStop();
    p.gameplayStart();
    p.reportCompletion(12);
    const paused: boolean[] = [];
    p.onPauseChange((x) => paused.push(x));
    const upgrades: number[] = [];
    p.onUpgrade((u) => upgrades.push(u.ms));

    const pg = new PlaygamaAdapter(f.bridge, () => undefined);
    await pg.preload([SAVE_KEY]);
    p.upgrade(pg, 4200);
    expect(p.kind).toBe('playgama');
    expect(f.messages).toEqual(['progress:100', 'game_ready', 'gameplay_started', 'analytics:boot:{"ms":900}', 'analytics:sdk_ready:{"kind":"mock"}']);
    expect(upgrades).toEqual([4200]);
    // listeners now hear the bridge
    f.platform.emit('pause_state_changed', true);
    expect(paused).toEqual([true]);
    // and new events go straight out
    p.track('first_cash');
    expect(f.messages[f.messages.length - 1]).toBe('analytics:first_cash:{}');
  });

  it('pushes the running save to the bridge when the bridge has none (or an older one)', async () => {
    const f = fakeBridge({ [SAVE_KEY]: save(100, 5) });
    const mock = new MockAdapter();
    mock.dataSet(SAVE_KEY, save(200, 50));
    const p = new Platform(mock);
    const reloads: number[] = [];
    p.onAuthChange(() => reloads.push(1));
    const pg = new PlaygamaAdapter(f.bridge, () => undefined);
    await pg.preload([SAVE_KEY]);
    p.upgrade(pg, 3000);
    await Promise.resolve();
    expect(f.store[SAVE_KEY]).toBe(save(200, 50));
    expect(p.dataGet(SAVE_KEY)).toBe(save(200, 50));
    expect(reloads).toEqual([]);
  });

  it("reloads the bridge's save when it is newer (like a login)", async () => {
    const f = fakeBridge({ [SAVE_KEY]: save(900, 77) });
    const mock = new MockAdapter();
    mock.dataSet(SAVE_KEY, save(200, 50));
    const p = new Platform(mock);
    let reloaded: string | null = null;
    p.onAuthChange(() => (reloaded = p.dataGet(SAVE_KEY)));
    const replaced: boolean[] = [];
    p.onUpgrade((u) => replaced.push(u.saveReplaced));
    const pg = new PlaygamaAdapter(f.bridge, () => undefined);
    await pg.preload([SAVE_KEY]);
    p.upgrade(pg, 3000);
    expect(reloaded).toBe(save(900, 77));
    expect(replaced).toEqual([true]);
  });

  it('drops held events if the bridge never comes', () => {
    const p = new Platform(new MockAdapter());
    p.expectUpgrade();
    p.track('boot');
    p.cancelUpgrade('rejected');
    p.track('first_cash');
    expect(p.log.some((l) => l.msg.includes('late sdk gave up'))).toBe(true);
  });
});

describe('analytics before the platform exists', () => {
  it('holds early events (boot) and sends them with the first sink', () => {
    const got: string[] = [];
    analytics.track('boot_test');
    analytics.setSink((e) => got.push(e));
    analytics.track('after');
    expect(got.slice(0, 1)).toEqual(['boot_test']);
    expect(got).toContain('after');
  });
});
