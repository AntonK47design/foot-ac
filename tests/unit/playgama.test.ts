import { describe, expect, it } from 'vitest';
import { PlaygamaAdapter, type PGBridge } from '../../src/platform/playgama';
import { MockAdapter } from '../../src/platform/mock';
import { Platform } from '../../src/platform/platform';
import { Ads, parsePlacements, type AdsHost } from '../../src/ui/ads';

type Fn = (v: string | boolean) => void;
class Emitter {
  handlers = new Map<string, Fn[]>();
  on(e: string, fn: Fn): void {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
  }
  emit(e: string, v: string | boolean): void {
    for (const fn of this.handlers.get(e) ?? []) fn(v);
  }
}

function fakeBridge(store: Record<string, unknown> = {}) {
  const messages: string[] = [];
  const platform = Object.assign(new Emitter(), {
    id: 'mock',
    language: 'de',
    isAudioEnabled: true,
    isPaused: false,
    sendMessage: async (m: string) => void messages.push(m),
  });
  const advertisement = Object.assign(new Emitter(), {
    isInterstitialSupported: true,
    isRewardedSupported: true,
    shown: [] as string[],
    showInterstitial(): void {
      this.shown.push('interstitial');
    },
    showRewarded(): void {
      this.shown.push('rewarded');
    },
    checkAdBlock: async () => false,
  });
  const bridge = Object.assign(new Emitter(), {
    initialize: async () => undefined,
    setGameLoadingProgress: (p: number) => void messages.push(`progress:${p}`),
    platform,
    advertisement,
    storage: {
      get: async (k: string | string[]) => store[String(k)] ?? null,
      set: async (k: string | string[], v: unknown) => void (store[String(k)] = v),
      delete: async (k: string | string[]) => void delete store[String(k)],
    },
    player: { isAuthorizationSupported: false, isAuthorized: false, name: null, authorize: async () => undefined },
    device: { type: 'tablet' },
  });
  return { bridge: bridge as unknown as PGBridge, messages, platform, advertisement, store };
}

describe('Playgama Bridge adapter', () => {
  it('preloads saves from Bridge storage and writes through', async () => {
    const f = fakeBridge({ save: '{"v":1}' });
    const a = new PlaygamaAdapter(f.bridge, () => undefined);
    await a.preload(['save', 'missing']);
    expect(a.dataGet('save')).toBe('{"v":1}');
    a.dataSet('save', '{"v":2}');
    expect(a.dataGet('save')).toBe('{"v":2}');
    await Promise.resolve();
    expect(f.store.save).toBe('{"v":2}');
  });

  it('maps loading and gameplay to Bridge messages', () => {
    const f = fakeBridge();
    const a = new PlaygamaAdapter(f.bridge, () => undefined);
    a.loadingStart();
    a.loadingStop();
    a.gameplayStart();
    a.gameplayStop();
    expect(f.messages).toEqual(['progress:0', 'progress:100', 'game_ready', 'gameplay_started', 'gameplay_stopped']);
  });

  it('reports audio, pause, device and language', () => {
    const f = fakeBridge();
    const a = new PlaygamaAdapter(f.bridge, () => undefined);
    const muted: boolean[] = [];
    const paused: boolean[] = [];
    a.onSettingsChange((m) => muted.push(m));
    a.onPauseChange((p) => paused.push(p));
    f.platform.emit('audio_state_changed', false);
    f.platform.emit('pause_state_changed', true);
    f.platform.emit('pause_state_changed', false);
    expect(muted).toEqual([true]);
    expect(paused).toEqual([true, false]);
    expect(a.deviceType()).toBe('tablet');
    expect(a.locale()).toBe('de');
  });

  it('pays a rewarded ad only after "rewarded" then "closed"', async () => {
    const f = fakeBridge();
    const a = new PlaygamaAdapter(f.bridge, () => undefined);
    let started = 0;
    const p = a.requestAd('rewarded', () => started++);
    f.advertisement.emit('rewarded_state_changed', 'loading');
    f.advertisement.emit('rewarded_state_changed', 'opened');
    f.advertisement.emit('rewarded_state_changed', 'rewarded');
    f.advertisement.emit('rewarded_state_changed', 'closed');
    expect(await p).toEqual({ ok: true });
    expect(started).toBe(1);

    const skipped = a.requestAd('rewarded', () => undefined);
    f.advertisement.emit('rewarded_state_changed', 'opened');
    f.advertisement.emit('rewarded_state_changed', 'closed');
    expect((await skipped).ok).toBe(false);

    const failed = a.requestAd('midgame', () => undefined);
    f.advertisement.emit('interstitial_state_changed', 'failed');
    expect(await failed).toEqual({ ok: false, code: 'unfilled' });
    expect(f.advertisement.shown).toEqual(['rewarded', 'rewarded', 'interstitial']);
  });

  it('resolves an interstitial on close', async () => {
    const f = fakeBridge();
    const a = new PlaygamaAdapter(f.bridge, () => undefined);
    const p = a.requestAd('midgame', () => undefined);
    f.advertisement.emit('interstitial_state_changed', 'opened');
    f.advertisement.emit('interstitial_state_changed', 'closed');
    expect(await p).toEqual({ ok: true });
  });
});

describe('ad placement allow-list (VITE_AD_PLACEMENTS)', () => {
  const host = (): AdsHost => {
    const usage = { day: '', used: {} as Record<string, number>, officeAt: 0 };
    return {
      setBlocked: () => undefined,
      setMuted: () => undefined,
      toast: () => undefined,
      playSec: () => 600,
      usage: () => usage,
      today: () => 'd1',
      now: () => 1_000_000,
    };
  };

  it('parses the list; empty means every placement', () => {
    expect(parsePlacements(undefined)).toBeNull();
    expect(parsePlacements(' ')).toBeNull();
    expect([...(parsePlacements('results, scout,midgame') ?? [])]).toEqual(['results', 'scout', 'midgame']);
  });

  it('offers only listed placements and gates the interstitial', async () => {
    const requested: string[] = [];
    const mock = new MockAdapter();
    const orig = mock.requestAd.bind(mock);
    mock.requestAd = (type, onStarted) => {
      requested.push(type);
      return orig(type, onStarted);
    };
    mock.options.adMs = 0;
    const platform = new Platform(mock);
    platform.enableAdsForTesting();
    const ads = new Ads(platform, host(), parsePlacements('results,scout'));
    expect(ads.offer('results', 'x', () => undefined)).not.toBeNull();
    expect(ads.offer('scout', 'x', () => undefined)).not.toBeNull();
    expect(ads.offer('office', 'x', () => undefined)).toBeNull();
    expect(ads.offer('daily', 'x', () => undefined)).toBeNull();
    expect(ads.offer('welcome', 'x', () => undefined)).toBeNull();
    await ads.midgame();
    expect(requested).toEqual([]);
    await new Ads(platform, host(), parsePlacements('midgame')).midgame();
    expect(requested).toEqual(['midgame']);
  });
});
