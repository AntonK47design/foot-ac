import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedLoop } from '../../src/core/loop';

describe('fixed-step loop', () => {
  afterEach(() => vi.unstubAllGlobals());

  function run(hz: number, seconds: number): number {
    let cb: ((t: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => {
      cb = f;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    let updates = 0;
    const loop = new FixedLoop({ update: () => updates++, render: () => undefined });
    loop.start();
    for (let i = 0; i <= hz * seconds; i++) (cb as unknown as (t: number) => void)((i * 1000) / hz);
    loop.stop();
    return updates;
  }

  it('runs the same number of sim steps at 60/144/165 Hz', () => {
    const a = run(60, 10);
    const b = run(144, 10);
    const c = run(165, 10);
    expect(Math.abs(a - 600)).toBeLessThanOrEqual(1);
    expect(Math.abs(b - 600)).toBeLessThanOrEqual(1);
    expect(Math.abs(c - 600)).toBeLessThanOrEqual(1);
  });
});
