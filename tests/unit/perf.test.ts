import { describe, expect, it } from 'vitest';
import { PerfSampler } from '../../src/core/perf';

type Sent = Array<{ e: string; p: Record<string, string | number | boolean> }>;

function sampler(sent: Sent): PerfSampler {
  return new PerfSampler((e, p) => sent.push({ e, p }), () => ({ target_fps: 60, build_version: 'test' }));
}

/** `sec` seconds of frames every `ms` ms from `t0`; returns the end time. */
function run(s: PerfSampler, t0: number, sec: number, ms: number, active = true): number {
  let t = t0;
  for (; t < t0 + sec * 1000; t += ms) s.frame(t, active);
  return t;
}

describe('performance_sample', () => {
  it('sends one aggregate per ~30 s of smooth gameplay with the guide fields', () => {
    const sent: Sent = [];
    const s = sampler(sent);
    run(s, 0, 31, 1000 / 60);
    expect(sent.length).toBe(1);
    const p = sent[0]!.p;
    expect(sent[0]!.e).toBe('performance_sample');
    expect(p.fps_avg).toBeCloseTo(60, 0);
    expect(p.fps_p10).toBeCloseTo(60, 0);
    expect(p.frame_time_p50_ms).toBeCloseTo(16.7, 0);
    expect(p.frames_over_50ms).toBe(0);
    expect(p.target_fps).toBe(60);
    expect(p.build_version).toBe('test');
    for (const k of ['window_ms', 'active_ms', 'frame_count', 'frame_time_p95_ms', 'frame_time_p99_ms', 'frame_time_max_ms', 'frames_over_100ms', 'frames_over_250ms', 'frames_over_500ms', 'frames_over_1000ms'])
      expect(p[k], k).toBeTypeOf('number');
  });

  it('counts stutters into the threshold buckets', () => {
    const sent: Sent = [];
    const s = sampler(sent);
    let t = run(s, 0, 10, 1000 / 60);
    for (const hitch of [60, 120, 300, 600, 1200]) {
      t += hitch;
      s.frame(t, true);
    }
    run(s, t, 25, 1000 / 60);
    const p = sent[0]!.p;
    expect([p.frames_over_50ms, p.frames_over_100ms, p.frames_over_250ms, p.frames_over_500ms, p.frames_over_1000ms]).toEqual([5, 4, 3, 2, 1]);
    expect(p.frame_time_max_ms).toBeCloseTo(1200, 0);
  });

  it('leaves out paused / hidden time: no frozen frame, and a window without gameplay is not sent', () => {
    const sent: Sent = [];
    const s = sampler(sent);
    let t = run(s, 0, 3, 1000 / 60);
    t = run(s, t, 20, 1000 / 60, false); // a panel was open
    s.reset();
    t += 60_000; // tab hidden for a minute
    run(s, t, 1, 1000 / 60);
    // 4 s of gameplay in that window: under the minimum, nothing sent
    expect(sent.length).toBe(0);
    const s2 = sampler(sent);
    let u = run(s2, 0, 10, 1000 / 60);
    u += 4000; // a stopped loop without reset() — still under the gap limit counts as a real hitch…
    s2.frame(u, true);
    u += 20_000; // …but a longer gap is a suspended tab, not a frame
    s2.frame(u, true);
    run(s2, u, 1, 1000 / 60);
    expect(sent.length).toBe(1);
    expect(sent[0]!.p.frame_time_max_ms).toBeGreaterThanOrEqual(4000);
    expect(sent[0]!.p.frame_time_max_ms).toBeLessThan(4100);
    expect(sent[0]!.p.frames_over_1000ms).toBe(1);
  });

  it('flush() sends a partial window with enough gameplay (pagehide)', () => {
    const sent: Sent = [];
    const s = sampler(sent);
    const t = run(s, 0, 12, 1000 / 30);
    s.flush(t);
    expect(sent.length).toBe(1);
    expect(sent[0]!.p.fps_avg).toBeCloseTo(30, 0);
  });
});
