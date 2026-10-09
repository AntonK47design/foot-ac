/** Wall-clock abstraction so timers, daily resets and offline earnings can be tested by skipping time. */
export interface Clock {
  /** Milliseconds since epoch (including any dev offset). */
  now(): number;
}

export class RealClock implements Clock {
  offsetMs = 0;
  now(): number {
    return Date.now() + this.offsetMs;
  }
  skip(ms: number): void {
    this.offsetMs += ms;
  }
}

export class FakeClock implements Clock {
  constructor(public t = Date.UTC(2026, 0, 1, 12)) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
