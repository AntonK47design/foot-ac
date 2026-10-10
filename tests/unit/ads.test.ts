import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { MockAdapter } from '../../src/platform/mock';
import { Platform } from '../../src/platform/platform';
import { Ads, type AdsHost } from '../../src/ui/ads';

function setup(opts: { enabled?: boolean; adsDisabled?: boolean; adblock?: boolean; playSec?: number } = {}) {
  const mock = new MockAdapter();
  mock.options.adsDisabled = opts.adsDisabled ?? false;
  mock.options.adblock = opts.adblock ?? false;
  mock.options.adMs = 0;
  const platform = new Platform(mock);
  if (opts.enabled ?? true) platform.enableAdsForTesting();
  const usage = { day: '', used: {} as Record<string, number>, officeAt: 0 };
  const log: string[] = [];
  let now = 1_000_000;
  const host: AdsHost = {
    setBlocked: (on) => log.push(on ? 'block' : 'unblock'),
    setMuted: (on) => log.push(on ? 'mute' : 'unmute'),
    toast: (s) => log.push('toast:' + s),
    playSec: () => opts.playSec ?? 600,
    usage: () => usage,
    today: () => 'd1',
    now: () => now,
  };
  const ads = new Ads(platform, host);
  return { ads, platform, mock, log, usage, advance: (ms: number) => (now += ms) };
}

describe('M5: ads policy', () => {
  it('makes no offers when ads are off (VITE_ADS=off)', () => {
    const { ads } = setup({ enabled: false });
    expect(ads.offer('welcome', 'x', () => undefined)).toBeNull();
  });

  it('grants only after the ad finished, pausing and muting around it', async () => {
    const { ads, log } = setup();
    let granted = 0;
    const offer = ads.offer('results', '×2', () => granted++)!;
    expect(await offer.run()).toBe(true);
    expect(granted).toBe(1);
    expect(log).toEqual(['block', 'mute', 'unmute', 'unblock']);
  });

  it('adsDisabledBasicLaunch switches ads off for the session, silently', async () => {
    const { ads, log } = setup({ adsDisabled: true });
    const offer = ads.offer('daily', '×2', () => undefined)!;
    expect(await offer.run()).toBe(false);
    expect(offer.valid()).toBe(false);
    expect(ads.offer('welcome', 'x', () => undefined)).toBeNull();
    expect(log.some((l) => l.startsWith('toast'))).toBe(false);
  });

  it('leaves the cash ads uncapped, shrinks Office amounts to a floor, caps scout per day', async () => {
    const { ads, advance } = setup();
    const a0 = ads.officeAmount(1000);
    expect(a0).toBe(1000 * BALANCE.ads.officeShare);
    for (let i = 0; i < 20; i++) {
      advance(BALANCE.ads.officeCooldownSec * 1000);
      expect(await ads.rewarded('office')).toBe(true);
      expect(await ads.rewarded('results')).toBe(true);
      expect(await ads.rewarded('welcome')).toBe(true);
    }
    expect(ads.canOffer('office')).toBe(true);
    expect(ads.officeAmount(1000)).toBe(Math.round((1000 * BALANCE.ads.officeShare * BALANCE.ads.officeMinMult) / 10) * 10);
    for (let i = 0; i < BALANCE.ads.caps.scout!; i++) await ads.rewarded('scout');
    expect(ads.canOffer('scout')).toBe(false);
  });

  it('midgame waits for 5 min of play and never runs under adblock', async () => {
    const early = setup({ playSec: 60 });
    await early.ads.midgame();
    expect(early.platform.log.some((e) => e.msg.startsWith('requestAd'))).toBe(false);
    const ok = setup();
    await ok.ads.midgame();
    expect(ok.platform.log.some((e) => e.msg === 'requestAd midgame')).toBe(true);
  });
});
