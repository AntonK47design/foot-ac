import type { AdResult, AdType, DeviceType, GameContext, PlatformAdapter, PlatformUser } from './types';
import { safeStorage } from './storage';
import { guessDeviceType } from './mock';

/* Minimal typings for the subset of CrazyGames SDK v3 we use. Only this file touches window.CrazyGames. */
interface CGAdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: { code?: string } | string) => void;
}
interface CGSettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}
interface CGUser {
  username: string;
  profilePictureUrl?: string;
}
interface CGSystemInfo {
  countryCode?: string;
  locale?: string;
  device?: { type?: DeviceType };
}
export interface CGSDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: CGSettings;
    addSettingsChangeListener(fn: (s: CGSettings) => void): void;
    reportGameCompletedPercentage?(pct: number): void;
    setGameContext?(ctx: GameContext): void;
  };
  ad: {
    requestAd(type: AdType, cbs: CGAdCallbacks): void;
    hasAdblock(): Promise<boolean>;
  };
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  user: {
    isUserAccountAvailable: boolean;
    systemInfo?: CGSystemInfo;
    getUser(): Promise<CGUser | null>;
    showAuthPrompt(): Promise<CGUser | null>;
    addAuthListener(fn: (u: CGUser | null) => void): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CGSDK };
  }
}

export function getSdk(): CGSDK | undefined {
  try {
    return typeof window !== 'undefined' ? window.CrazyGames?.SDK : undefined;
  } catch {
    return undefined;
  }
}

/** Adapter over the real SDK. Every call is guarded; the SDK throws outside CrazyGames domains. */
export class CrazyGamesAdapter implements PlatformAdapter {
  readonly kind: 'crazygames' | 'local';
  private dataBroken = false;

  constructor(
    private readonly sdk: CGSDK,
    private readonly log: (msg: string) => void,
  ) {
    this.kind = sdk.environment === 'crazygames' ? 'crazygames' : 'local';
  }

  private guard(name: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.log(`sdk ${name} failed: ${String(e)}`);
    }
  }

  loadingStart(): void {
    this.guard('loadingStart', () => this.sdk.game.loadingStart());
  }
  loadingStop(): void {
    this.guard('loadingStop', () => this.sdk.game.loadingStop());
  }
  gameplayStart(): void {
    this.guard('gameplayStart', () => this.sdk.game.gameplayStart());
  }
  gameplayStop(): void {
    this.guard('gameplayStop', () => this.sdk.game.gameplayStop());
  }
  happytime(): void {
    this.guard('happytime', () => this.sdk.game.happytime());
  }
  reportCompletion(pct: number): void {
    this.guard('reportGameCompletedPercentage', () => this.sdk.game.reportGameCompletedPercentage?.(pct));
  }
  setContext(ctx: GameContext): void {
    this.guard('setGameContext', () => this.sdk.game.setGameContext?.(ctx));
  }
  isMuted(): boolean {
    try {
      return this.sdk.game.settings?.muteAudio === true;
    } catch {
      return false;
    }
  }
  onSettingsChange(fn: (muted: boolean) => void): void {
    this.guard('addSettingsChangeListener', () =>
      this.sdk.game.addSettingsChangeListener((s) => fn(s?.muteAudio === true)),
    );
  }
  dataGet(key: string): string | null {
    if (!this.dataBroken) {
      try {
        return this.sdk.data.getItem(key);
      } catch (e) {
        this.dataBroken = true;
        this.log(`sdk data unavailable (${String(e)}), using localStorage`);
      }
    }
    return safeStorage.get('wk_' + key);
  }
  dataSet(key: string, value: string): void {
    if (!this.dataBroken) {
      try {
        this.sdk.data.setItem(key, value);
        return;
      } catch (e) {
        this.dataBroken = true;
        this.log(`sdk data setItem failed (${String(e)}), using localStorage`);
      }
    }
    safeStorage.set('wk_' + key, value);
  }
  dataRemove(key: string): void {
    this.guard('data.removeItem', () => this.sdk.data.removeItem(key));
    safeStorage.remove('wk_' + key);
  }
  requestAd(type: AdType, onStarted: () => void): Promise<AdResult> {
    return new Promise<AdResult>((resolve) => {
      let done = false;
      const finish = (r: AdResult): void => {
        if (done) return;
        done = true;
        resolve(r);
      };
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => onStarted(),
          adFinished: () => finish({ ok: true }),
          adError: (err) => finish({ ok: false, code: typeof err === 'string' ? err : (err?.code ?? 'other') }),
        });
      } catch (e) {
        this.log(`sdk requestAd threw: ${String(e)}`);
        finish({ ok: false, code: 'other' });
      }
    });
  }
  async hasAdblock(): Promise<boolean> {
    try {
      return await this.sdk.ad.hasAdblock();
    } catch {
      return false;
    }
  }
  isAccountAvailable(): boolean {
    try {
      return this.sdk.user.isUserAccountAvailable === true;
    } catch {
      return false;
    }
  }
  async getUser(): Promise<PlatformUser | null> {
    try {
      return await this.sdk.user.getUser();
    } catch {
      return null;
    }
  }
  async showAuthPrompt(): Promise<PlatformUser | null> {
    try {
      return await this.sdk.user.showAuthPrompt();
    } catch (e) {
      this.log(`auth prompt closed: ${String(e)}`);
      return null;
    }
  }
  onAuthChange(fn: (u: PlatformUser | null) => void): void {
    this.guard('addAuthListener', () => this.sdk.user.addAuthListener(fn));
  }
  deviceType(): DeviceType {
    try {
      return this.sdk.user.systemInfo?.device?.type ?? guessDeviceType();
    } catch {
      return guessDeviceType();
    }
  }
  locale(): string | undefined {
    try {
      return this.sdk.user.systemInfo?.locale;
    } catch {
      return undefined;
    }
  }
}
