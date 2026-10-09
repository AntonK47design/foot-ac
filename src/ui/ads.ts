import { t } from '../core/i18n';
import { BALANCE } from '../data/balance';
import type { Platform } from '../platform/platform';
import { icon } from './icons';

/** Rewarded placements (GDD §7). */
export type Placement = 'welcome' | 'daily' | 'office' | 'results' | 'scout';

/** What a panel needs to show a rewarded button. `blocked` = adblock → inline note instead. */
export interface AdOffer {
  label: string;
  blocked: boolean;
  run(): Promise<boolean>;
  /** False once the offer is gone (cap reached, ads switched off for the session, adblock found). */
  valid(): boolean;
}

export interface AdsHost {
  /** Ad on screen: pause the sim, block input, stop gameplay. */
  setBlocked(on: boolean): void;
  setMuted(on: boolean): void;
  toast(text: string): void;
  playSec(): number;
  /** Per-day usage record (lives in the save). */
  usage(): { day: string; used: Record<string, number>; officeAt: number };
  today(): string;
  now(): number;
}

/**
 * Ads policy on top of the platform: daily caps, cooldowns, adblock, midgame rules.
 * With VITE_ADS=off (Basic Launch) `enabled` is false and no offer is ever made.
 */
export class Ads {
  adblock = false;

  constructor(
    private readonly platform: Platform,
    private readonly host: AdsHost,
  ) {
    if (platform.adsAvailable)
      void platform
        .hasAdblock()
        .then((b) => (this.adblock = b))
        .catch(() => undefined);
  }

  get enabled(): boolean {
    return this.platform.adsAvailable;
  }

  private usage(): { used: Record<string, number>; officeAt: number } {
    const u = this.host.usage();
    const today = this.host.today();
    if (u.day !== today) {
      u.day = today;
      u.used = {};
    }
    return u;
  }

  used(p: Placement): number {
    return this.usage().used[p] ?? 0;
  }

  /** Whether a rewarded button for `p` should exist right now (also true under adblock, for the note). */
  canOffer(p: Placement): boolean {
    if (!this.enabled) return false;
    if (this.used(p) >= (BALANCE.ads.caps[p] ?? 0)) return false;
    if (p === 'office' && this.host.now() - this.usage().officeAt < BALANCE.ads.officeCooldownSec * 1000) return false;
    return true;
  }

  offer(p: Placement, label: string, onReward: () => void): AdOffer | null {
    if (!this.canOffer(p)) return null;
    return {
      label,
      blocked: this.adblock,
      valid: () => this.canOffer(p) && !this.adblock,
      run: async () => {
        const ok = await this.rewarded(p);
        if (ok) onReward();
        return ok;
      },
    };
  }

  /** Office "Get $X" amount: share of the cheapest unaffordable item, smaller with each use today. */
  officeAmount(cheapest: number): number {
    const A = BALANCE.ads;
    const mult = Math.max(A.officeMinMult, 1 - A.officeDecay * this.used('office'));
    return Math.max(10, Math.round((cheapest * A.officeShare * mult) / 10) * 10);
  }

  async rewarded(p: Placement): Promise<boolean> {
    if (!this.canOffer(p) || this.adblock) return false;
    this.host.setBlocked(true);
    let r;
    try {
      r = await this.platform.requestAd('rewarded', () => this.host.setMuted(true));
    } finally {
      this.host.setMuted(false);
      this.host.setBlocked(false);
    }
    if (r.ok) {
      const u = this.usage();
      u.used[p] = (u.used[p] ?? 0) + 1;
      if (p === 'office') u.officeAt = this.host.now();
      return true;
    }
    if (r.code === 'adblock') this.adblock = true;
    // adsDisabledBasicLaunch silently switches ads off for the session (the platform flips adsAvailable)
    if (r.code !== 'adsDisabledBasicLaunch') this.host.toast(t('toast.ad_unavailable'));
    return false;
  }

  /** Midgame at a natural break. The SDK enforces its own spacing; we only gate on playtime. */
  async midgame(): Promise<void> {
    if (!this.enabled || this.adblock || this.host.playSec() < BALANCE.ads.midgameMinPlaySec) return;
    this.host.setBlocked(true);
    try {
      await this.platform.requestAd('midgame', () => this.host.setMuted(true));
    } finally {
      this.host.setMuted(false);
      this.host.setBlocked(false);
    }
  }
}

/** Rewarded button (video icon + exact reward) or the adblock note; null when there's no offer. */
export function adElement(offer: AdOffer | null | undefined, onDone: (ok: boolean) => void, cls = ''): HTMLElement | null {
  if (!offer) return null;
  if (offer.blocked) {
    const n = document.createElement('div');
    n.className = 'ad-note';
    n.textContent = t('ads.blocked');
    return n;
  }
  const b = document.createElement('button');
  b.className = 'btn-big ad ' + cls;
  b.innerHTML = `<span>${icon('video')}${offer.label}</span>`;
  b.addEventListener('click', () => {
    b.disabled = true;
    void offer.run().then((ok) => {
      b.disabled = false;
      // never leave a rewarded button that can't do anything (Basic Launch, adblock, cap)
      if (!ok && !offer.valid()) b.remove();
      onDone(ok);
    });
  });
  return b;
}
