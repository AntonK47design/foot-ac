import { describe, expect, it } from 'vitest';
import { Platform } from '../../src/platform/platform';
import { MockAdapter } from '../../src/platform/mock';

class CountingAdapter extends MockAdapter {
  calls: string[] = [];
  override gameplayStart(): void {
    this.calls.push('start');
  }
  override gameplayStop(): void {
    this.calls.push('stop');
  }
  override loadingStart(): void {
    this.calls.push('loadingStart');
  }
  override loadingStop(): void {
    this.calls.push('loadingStop');
  }
  override reportCompletion(): void {
    this.calls.push('completion');
  }
}

describe('platform wrapper state machine', () => {
  it('never double-calls gameplayStart/Stop', () => {
    const a = new CountingAdapter();
    const p = new Platform(a);
    p.gameplayStop(); // not started yet → no call
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    expect(a.calls).toEqual(['start', 'stop', 'start']);
  });
  it('loading start/stop are idempotent', () => {
    const a = new CountingAdapter();
    const p = new Platform(a);
    p.loadingStart();
    p.loadingStart();
    p.loadingStop();
    p.loadingStop();
    expect(a.calls).toEqual(['loadingStart', 'loadingStop']);
  });
  it('completion is monotonic and clamped', () => {
    const a = new CountingAdapter();
    const p = new Platform(a);
    p.reportCompletion(10);
    p.reportCompletion(5);
    p.reportCompletion(10.4);
    p.reportCompletion(150);
    expect(a.calls.filter((c) => c === 'completion').length).toBe(2);
    expect(p.log.some((e) => e.msg === 'completion 100')).toBe(true);
  });
  it('ads flag off → no ad requests and a disabled error', async () => {
    const a = new CountingAdapter();
    const p = new Platform(a);
    const r = await p.requestAd('rewarded', () => undefined);
    expect(r.ok).toBe(false);
    expect(p.adsAvailable).toBe(false);
  });
  it('mock storage round-trips', () => {
    const a = new MockAdapter();
    a.dataSet('k', 'v');
    expect(a.dataGet('k')).toBe('v');
    a.dataRemove('k');
    expect(a.dataGet('k')).toBe(null);
  });
});
