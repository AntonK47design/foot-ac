import type { AdResult, AdType, DeviceType, GameContext, PlatformAdapter, PlatformUser } from './types';
import { safeStorage } from './storage';

/** Options the debug overlay / tests can flip at runtime. */
export interface MockOptions {
  adblock: boolean;
  unfilled: boolean;
  adsDisabled: boolean;
  accountAvailable: boolean;
  /** Simulated ad length (ms). */
  adMs: number;
}

/**
 * Fallback used when the SDK script is blocked, failed, or the environment is 'disabled'.
 * Saves to localStorage and can simulate ads, unfilled ads, adblock and login.
 */
export class MockAdapter implements PlatformAdapter {
  readonly kind = 'mock' as const;
  readonly options: MockOptions = { adblock: false, unfilled: false, adsDisabled: true, accountAvailable: true, adMs: 1200 };
  private user: PlatformUser | null = null;
  private readonly authListeners: Array<(u: PlatformUser | null) => void> = [];
  private readonly settingsListeners: Array<(m: boolean) => void> = [];
  private muted = false;

  constructor(private readonly log: (msg: string) => void = () => {}) {}

  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  happytime(): void {}
  reportCompletion(): void {}
  setContext(_ctx: GameContext): void {}
  isMuted(): boolean {
    return this.muted;
  }
  onSettingsChange(fn: (muted: boolean) => void): void {
    this.settingsListeners.push(fn);
  }
  /** Debug: emulate the CrazyGames mute setting. */
  setMuted(m: boolean): void {
    this.muted = m;
    for (const fn of this.settingsListeners) fn(m);
  }
  dataGet(key: string): string | null {
    return safeStorage.get('wk_' + key);
  }
  dataSet(key: string, value: string): void {
    safeStorage.set('wk_' + key, value);
  }
  dataRemove(key: string): void {
    safeStorage.remove('wk_' + key);
  }
  async requestAd(type: AdType, onStarted: () => void): Promise<AdResult> {
    if (this.options.adsDisabled) return { ok: false, code: 'adsDisabledBasicLaunch' };
    if (this.options.adblock) return { ok: false, code: 'adblock' };
    if (this.options.unfilled) return { ok: false, code: 'unfilled' };
    this.log(`mock ad ${type} playing`);
    onStarted();
    await new Promise((r) => setTimeout(r, this.options.adMs));
    return { ok: true };
  }
  async hasAdblock(): Promise<boolean> {
    return this.options.adblock;
  }
  isAccountAvailable(): boolean {
    return this.options.accountAvailable;
  }
  async getUser(): Promise<PlatformUser | null> {
    return this.user;
  }
  async showAuthPrompt(): Promise<PlatformUser | null> {
    this.setUser({ username: 'MockCoach' });
    return this.user;
  }
  onAuthChange(fn: (u: PlatformUser | null) => void): void {
    this.authListeners.push(fn);
  }
  /** Debug: simulate login/logout. */
  setUser(u: PlatformUser | null): void {
    this.user = u;
    for (const fn of this.authListeners) fn(u);
  }
  deviceType(): DeviceType {
    return guessDeviceType();
  }
  locale(): string | undefined {
    return undefined;
  }
}

export function guessDeviceType(): DeviceType {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  if (/iPad|Tablet/i.test(ua) || (touch && /Macintosh/.test(ua))) return 'tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
  return 'desktop';
}
