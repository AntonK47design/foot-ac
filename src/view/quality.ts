import type { DeviceType } from '../platform/types';

export type Tier = 'low' | 'mid' | 'high';
export type GraphicsSetting = 'auto' | 'low' | 'high';

export interface TierSpec {
  dprCap: number;
  shadows: boolean;
  particles: number;
  antialias: boolean;
  props: number;
}

export const TIERS: Record<Tier, TierSpec> = {
  high: { dprCap: 2, shadows: true, particles: 1, antialias: true, props: 1 },
  mid: { dprCap: 1.5, shadows: false, particles: 0.75, antialias: true, props: 1 },
  low: { dprCap: 1, shadows: false, particles: 0.4, antialias: false, props: 0.6 },
};

interface NavigatorExtras {
  deviceMemory?: number;
}

/** Initial tier from device type, memory and old iOS. */
export function autoTier(device: DeviceType): Tier {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as (Navigator & NavigatorExtras) | undefined;
  const mem = nav?.deviceMemory;
  const ua = nav?.userAgent ?? '';
  const iosMatch = /OS (\d+)_\d+(?:_\d+)? like Mac OS X/.exec(ua);
  const oldIos = iosMatch ? Number(iosMatch[1]) < 15 : false;
  if (device === 'desktop') return mem !== undefined && mem <= 4 ? 'mid' : 'high';
  if ((mem !== undefined && mem <= 4) || oldIos) return 'low';
  return 'mid';
}

/**
 * FPS watchdog: if the average FPS stays below 45 for 3 s, step down one tier.
 * At the lowest tier, lock to 30 FPS if 60 can't be held (stable 30 > jittery 45).
 */
export class FpsWatchdog {
  private acc = 0;
  private frames = 0;
  private lowFor = 0;
  fps = 60;
  constructor(private readonly onStepDown: () => boolean) {}

  /** Returns true when the loop should lock to 30 FPS. */
  sample(dt: number): boolean {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return false;
    this.fps = this.frames / this.acc;
    const slow = this.fps < 45;
    this.lowFor = slow ? this.lowFor + this.acc : 0;
    this.acc = 0;
    this.frames = 0;
    if (this.lowFor >= 3) {
      this.lowFor = 0;
      const stepped = this.onStepDown();
      if (!stepped) return true;
    }
    return false;
  }

  reset(): void {
    this.acc = 0;
    this.frames = 0;
    this.lowFor = 0;
  }
}
