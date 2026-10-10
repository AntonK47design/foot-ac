import type { AdResult, AdType, DeviceType, GameContext, PlatformAdapter, PlatformUser } from './types';
import { safeStorage } from './storage';
import { guessDeviceType } from './mock';

/*
 * Adapter over Playgama Bridge (https://github.com/Playgama/bridge, global `window.bridge`, v2).
 * Minimal typings for the subset we use. Only src/platform/* touches window.bridge; every call is guarded.
 */
type Listener = (value: string | boolean) => void;
interface BridgeEmitter {
  on(event: string, fn: Listener): void;
}
export interface PGBridge extends BridgeEmitter {
  initialize(options?: Record<string, unknown>): Promise<void>;
  setGameLoadingProgress?(percent: number): void;
  platform: BridgeEmitter & {
    id: string;
    language: string;
    isAudioEnabled: boolean;
    isPaused: boolean;
    sendMessage(message: string, options?: Record<string, unknown>): Promise<unknown>;
  };
  storage: {
    get(key: string | string[], tryParseJson?: boolean): Promise<unknown>;
    set(key: string | string[], value: unknown): Promise<void>;
    delete(key: string | string[]): Promise<void>;
  };
  advertisement: BridgeEmitter & {
    isInterstitialSupported: boolean;
    isRewardedSupported: boolean;
    showInterstitial(placement?: string | null): void;
    showRewarded(placement?: string | null): void;
    checkAdBlock(): Promise<unknown>;
  };
  player: {
    isAuthorizationSupported: boolean;
    isAuthorized: boolean;
    name: string | null;
    authorize(options?: Record<string, unknown>): Promise<unknown>;
  };
  device: { type: string };
}

declare global {
  interface Window {
    bridge?: PGBridge;
  }
}

export function getBridge(): PGBridge | undefined {
  try {
    return typeof window !== 'undefined' ? window.bridge : undefined;
  } catch {
    return undefined;
  }
}

/** Ads that don't report back within this long are treated as failed (never a stuck, paused game). */
const AD_TIMEOUT_MS = 90_000;

export class PlaygamaAdapter implements PlatformAdapter {
  readonly kind = 'playgama' as const;
  /** Bridge storage is async: saves are read once at boot (`preload`) and written through. */
  private readonly cache = new Map<string, string>();
  private adResolve: ((r: AdResult) => void) | null = null;
  private adType: AdType | null = null;
  private rewarded = false;
  private adStarted: (() => void) | null = null;
  private adTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly bridge: PGBridge,
    private readonly log: (msg: string) => void,
  ) {
    this.guard('advertisement listeners', () => {
      bridge.advertisement.on('interstitial_state_changed', (s) => this.onAdState('midgame', String(s)));
      bridge.advertisement.on('rewarded_state_changed', (s) => this.onAdState('rewarded', String(s)));
    });
  }

  private guard(name: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log(`bridge ${name} failed: ${String(e)}`);
    }
  }

  private send(message: string): void {
    this.guard(`sendMessage ${message}`, () => {
      void this.bridge.platform.sendMessage(message).catch((e: unknown) => this.log(`bridge ${message}: ${String(e)}`));
    });
  }

  /** Reads `keys` from Bridge storage into the sync cache (the game reads saves synchronously). */
  async preload(keys: string[]): Promise<void> {
    for (const k of keys) {
      try {
        const v = await this.bridge.storage.get(k, false);
        if (typeof v === 'string' && v.length) this.cache.set(k, v);
        else {
          const local = safeStorage.get('wk_' + k);
          if (local) this.cache.set(k, local);
        }
      } catch (e) {
        this.log(`bridge storage.get ${k} failed: ${String(e)}`);
        const local = safeStorage.get('wk_' + k);
        if (local) this.cache.set(k, local);
      }
    }
  }

  loadingStart(): void {
    this.guard('setGameLoadingProgress', () => this.bridge.setGameLoadingProgress?.(0));
  }
  loadingStop(): void {
    this.guard('setGameLoadingProgress', () => this.bridge.setGameLoadingProgress?.(100));
    this.send('game_ready');
  }
  gameplayStart(): void {
    this.send('gameplay_started');
  }
  gameplayStop(): void {
    this.send('gameplay_stopped');
  }
  happytime(): void {}
  reportCompletion(): void {}
  setContext(_ctx: GameContext): void {}
  isMuted(): boolean {
    try {
      return this.bridge.platform.isAudioEnabled === false;
    } catch {
      return false;
    }
  }
  onSettingsChange(fn: (muted: boolean) => void): void {
    this.guard('audio_state_changed', () => this.bridge.platform.on('audio_state_changed', (enabled) => fn(enabled === false)));
  }
  onPauseChange(fn: (paused: boolean) => void): void {
    this.guard('pause_state_changed', () => this.bridge.platform.on('pause_state_changed', (paused) => fn(paused === true)));
  }
  dataGet(key: string): string | null {
    return this.cache.get(key) ?? safeStorage.get('wk_' + key);
  }
  dataSet(key: string, value: string): void {
    this.cache.set(key, value);
    // local copy first: Bridge storage may be slow or unavailable (it falls back to local storage itself, too)
    safeStorage.set('wk_' + key, value);
    this.guard('storage.set', () => {
      void this.bridge.storage.set(key, value).catch((e: unknown) => this.log(`bridge storage.set failed: ${String(e)}`));
    });
  }
  dataRemove(key: string): void {
    this.cache.delete(key);
    safeStorage.remove('wk_' + key);
    this.guard('storage.delete', () => {
      void this.bridge.storage.delete(key).catch(() => undefined);
    });
  }

  requestAd(type: AdType, onStarted: () => void): Promise<AdResult> {
    if (this.adResolve) return Promise.resolve({ ok: false, code: 'other' });
    return new Promise<AdResult>((resolve) => {
      this.adResolve = resolve;
      this.adType = type;
      this.rewarded = false;
      this.adStarted = onStarted;
      this.adTimer = setTimeout(() => this.finishAd({ ok: false, code: 'other' }), AD_TIMEOUT_MS);
      try {
        const ad = this.bridge.advertisement;
        if (type === 'rewarded') {
          if (!ad.isRewardedSupported) return this.finishAd({ ok: false, code: 'unfilled' });
          ad.showRewarded();
        } else {
          if (!ad.isInterstitialSupported) return this.finishAd({ ok: false, code: 'unfilled' });
          ad.showInterstitial();
        }
      } catch (e) {
        this.log(`bridge show ad threw: ${String(e)}`);
        this.finishAd({ ok: false, code: 'other' });
      }
    });
  }

  /** Bridge reports ads as state changes: loading → opened → (rewarded) → closed, or failed. */
  private onAdState(type: AdType, state: string): void {
    if (this.adType !== type || !this.adResolve) return;
    if (state === 'opened') this.adStarted?.();
    else if (state === 'rewarded') this.rewarded = true;
    else if (state === 'failed') this.finishAd({ ok: false, code: 'unfilled' });
    // a rewarded ad only pays when the platform said "rewarded"; an interstitial just has to close
    else if (state === 'closed') this.finishAd(type === 'rewarded' && !this.rewarded ? { ok: false, code: 'other' } : { ok: true });
  }

  private finishAd(r: AdResult): void {
    if (this.adTimer) clearTimeout(this.adTimer);
    this.adTimer = null;
    const done = this.adResolve;
    this.adResolve = null;
    this.adType = null;
    this.adStarted = null;
    done?.(r);
  }

  async hasAdblock(): Promise<boolean> {
    try {
      return (await this.bridge.advertisement.checkAdBlock()) === true;
    } catch {
      return false;
    }
  }
  isAccountAvailable(): boolean {
    try {
      return this.bridge.player.isAuthorizationSupported === true;
    } catch {
      return false;
    }
  }
  async getUser(): Promise<PlatformUser | null> {
    try {
      return this.bridge.player.isAuthorized ? { username: this.bridge.player.name ?? '' } : null;
    } catch {
      return null;
    }
  }
  async showAuthPrompt(): Promise<PlatformUser | null> {
    try {
      await this.bridge.player.authorize();
      return this.getUser();
    } catch (e) {
      this.log(`bridge authorize closed: ${String(e)}`);
      return null;
    }
  }
  onAuthChange(): void {
    /* Bridge has no auth-change event */
  }
  deviceType(): DeviceType {
    try {
      const t = this.bridge.device.type;
      return t === 'mobile' || t === 'tablet' ? t : t === 'desktop' || t === 'tv' ? 'desktop' : guessDeviceType();
    } catch {
      return guessDeviceType();
    }
  }
  locale(): string | undefined {
    try {
      return this.bridge.platform.language || undefined;
    } catch {
      return undefined;
    }
  }
}
