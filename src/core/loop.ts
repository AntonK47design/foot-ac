export interface LoopHooks {
  /** Fixed-step simulation update (dt is always STEP). */
  update(dt: number): void;
  /** Render with interpolation factor alpha in [0,1) and the real frame delta. */
  render(alpha: number, frameDt: number): void;
}

export const STEP = 1 / 60;
const MAX_FRAME = 0.25;

/**
 * Fixed-timestep loop (60 Hz accumulator, clamped delta) with interpolated rendering.
 * Behaves identically at 60/144/165 Hz. Optional 30 FPS cap for low-end devices.
 */
export class FixedLoop {
  private acc = 0;
  private last = -1;
  private raf = 0;
  private running = false;
  /** When true the sim does not advance (panels, ads) but rendering continues. */
  simPaused = false;
  /** 0 = uncapped (display rate), otherwise target FPS (e.g. 30). */
  fpsCap = 0;
  private sinceRender = 0;

  constructor(private readonly hooks: LoopHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private readonly frame = (tMs: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const t = tMs / 1000;
    if (this.last < 0) this.last = t;
    let dt = t - this.last;
    this.last = t;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    if (dt < 0) dt = 0;

    if (this.fpsCap > 0) {
      this.sinceRender += dt;
      // small tolerance so a 60 Hz display renders exactly every 2nd frame at a 30 cap
      if (this.sinceRender < 1 / this.fpsCap - 0.004) return;
      dt = Math.min(this.sinceRender, MAX_FRAME);
      this.sinceRender = 0;
    }

    if (!this.simPaused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 20) {
        this.hooks.update(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 20) this.acc = 0;
    }
    this.hooks.render(this.simPaused ? 1 : this.acc / STEP, dt);
  };
}
