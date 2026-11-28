/**
 * `performance_sample` telemetry (Playgama telemetry guide): frame times are measured locally during active, visible
 * gameplay and sent as one aggregate roughly every 30 s. Loading, open panels, ads and hidden time are left out:
 * the host calls `frame(now, false)` (or `reset()`) for those, so a pause never shows up as one frozen frame.
 * No per-frame allocation: frame times go into a preallocated ring and are sorted only when a sample is built.
 */

type Props = Record<string, string | number | boolean>;

export interface PerfOptions {
  /** One sample per this much wall-clock time (ms). */
  windowMs: number;
  /** Don't send a window with less active gameplay than this (ms). */
  minActiveMs: number;
  /** A gap longer than this (ms) between two active frames is a suspended tab / stopped loop, not a frame. */
  gapMs: number;
}

export const PERF_DEFAULTS: PerfOptions = { windowMs: 30_000, minActiveMs: 5_000, gapMs: 5_000 };

/** Room for 30 s at 240 Hz; later frames still count (`frame_count`, thresholds), the ring just stops growing. */
const RING = 8192;
const THRESHOLDS = [50, 100, 250, 500, 1000] as const;

interface LongTaskEntryLike {
  duration: number;
}

export class PerfSampler {
  private readonly times = new Float32Array(RING);
  private readonly scratch = new Float32Array(RING);
  private n = 0;
  private frames = 0;
  private sumMs = 0;
  private maxMs = 0;
  private readonly over = new Uint32Array(THRESHOLDS.length);
  private activeMs = 0;
  private windowStart = -1;
  private last = -1;
  private longCount = 0;
  private longTotal = 0;
  private longMax = 0;
  private errors = 0;
  private rejections = 0;
  private ctxLosses = 0;
  private readonly opts: PerfOptions;

  constructor(
    private readonly send: (event: string, props: Props) => void,
    /** Fields added to every sample (FPS target, quality tier, build…), read when the sample is built. */
    private readonly context: () => Props,
    opts: Partial<PerfOptions> = {},
  ) {
    this.opts = { ...PERF_DEFAULTS, ...opts };
  }

  /** Browser hooks (long tasks, errors) — optional, feature-detected, never throws. */
  observe(target: Pick<Window, 'addEventListener'> | null): void {
    try {
      target?.addEventListener('error', () => this.errors++);
      target?.addEventListener('unhandledrejection', () => this.rejections++);
    } catch {
      /* optional */
    }
    try {
      const PO = (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
      if (PO && PO.supportedEntryTypes?.includes('longtask')) {
        new PO((list) => {
          for (const e of list.getEntries() as unknown as LongTaskEntryLike[]) {
            this.longCount++;
            this.longTotal += e.duration;
            if (e.duration > this.longMax) this.longMax = e.duration;
          }
        }).observe({ type: 'longtask', buffered: false });
      }
    } catch {
      /* optional */
    }
  }

  contextLost(): void {
    this.ctxLosses++;
  }

  /** Next frame starts a fresh interval (after the loop was stopped: hidden tab, context loss…). */
  reset(): void {
    this.last = -1;
  }

  /** Call once per rendered frame. `active`: visible gameplay (no panel, ad or loading in front). */
  frame(now: number, active: boolean): void {
    if (this.windowStart < 0) this.windowStart = now;
    if (!active) {
      this.last = -1;
    } else {
      if (this.last >= 0) {
        const dt = now - this.last;
        if (dt > 0 && dt <= this.opts.gapMs) this.add(dt);
      }
      this.last = now;
    }
    if (now - this.windowStart >= this.opts.windowMs) this.flush(now);
  }

  private add(dt: number): void {
    if (this.n < RING) this.times[this.n++] = dt;
    this.frames++;
    this.sumMs += dt;
    this.activeMs += dt;
    if (dt > this.maxMs) this.maxMs = dt;
    for (let i = 0; i < THRESHOLDS.length; i++) if (dt > (THRESHOLDS[i] as number)) this.over[i] = (this.over[i] as number) + 1;
  }

  /** Sends the current window if it holds enough gameplay, then starts a new one (also call on pagehide). */
  flush(now: number): void {
    if (this.activeMs >= this.opts.minActiveMs && this.frames > 0) this.send('performance_sample', this.build(now));
    this.n = 0;
    this.frames = 0;
    this.sumMs = 0;
    this.maxMs = 0;
    this.over.fill(0);
    this.activeMs = 0;
    this.windowStart = now;
    this.longCount = this.longTotal = this.longMax = 0;
    this.errors = this.rejections = this.ctxLosses = 0;
  }

  private build(now: number): Props {
    const s = this.scratch.subarray(0, this.n);
    s.set(this.times.subarray(0, this.n));
    s.sort();
    const q = (p: number): number => (s.length ? (s[Math.min(s.length - 1, Math.floor(p * s.length))] as number) : 0);
    const r1 = (v: number): number => Math.round(v * 10) / 10;
    const p90 = q(0.9);
    const props: Props = {
      ...this.context(),
      window_ms: Math.round(now - this.windowStart),
      active_ms: Math.round(this.activeMs),
      frame_count: this.frames,
      fps_avg: r1((1000 * this.frames) / Math.max(1, this.sumMs)),
      // FPS p10 = the frame rate of the 90th-percentile frame time
      fps_p10: r1(p90 > 0 ? 1000 / p90 : 0),
      frame_time_p50_ms: r1(q(0.5)),
      frame_time_p95_ms: r1(q(0.95)),
      frame_time_p99_ms: r1(q(0.99)),
      frame_time_max_ms: r1(this.maxMs),
      frames_over_50ms: this.over[0] as number,
      frames_over_100ms: this.over[1] as number,
      frames_over_250ms: this.over[2] as number,
      frames_over_500ms: this.over[3] as number,
      frames_over_1000ms: this.over[4] as number,
      js_error_count: this.errors,
      unhandled_rejection_count: this.rejections,
      webgl_context_loss_count: this.ctxLosses,
    };
    const PO = (globalThis as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
    if (PO?.supportedEntryTypes?.includes('longtask')) {
      props.long_task_count = this.longCount;
      props.long_task_total_ms = Math.round(this.longTotal);
      props.long_task_max_ms = Math.round(this.longMax);
    }
    const mem = (globalThis.performance as { memory?: { usedJSHeapSize?: number } } | undefined)?.memory;
    if (mem && typeof mem.usedJSHeapSize === 'number') {
      props.memory_used_mb = Math.round(mem.usedJSHeapSize / 1048576);
      props.memory_measurement_supported = true;
      props.memory_measurement_type = 'js_heap';
    }
    return props;
  }
}
