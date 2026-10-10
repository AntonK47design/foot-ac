export type DeviceType = 'desktop' | 'tablet' | 'mobile';
export type AdType = 'midgame' | 'rewarded';
export type AdErrorCode = 'adsDisabledBasicLaunch' | 'unfilled' | 'adblock' | 'adCooldown' | 'other';
export type AdResult = { ok: true } | { ok: false; code: AdErrorCode | string };

export interface PlatformUser {
  username: string;
  profilePictureUrl?: string;
}

export interface GameContext {
  [key: string]: string | number | boolean;
}

/** Low-level adapter: one per backend (real SDK or mock). All methods must never throw. */
export interface PlatformAdapter {
  readonly kind: 'crazygames' | 'local' | 'playgama' | 'mock';
  loadingStart(): void;
  loadingStop(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  happytime(): void;
  reportCompletion(pct: number): void;
  setContext(ctx: GameContext): void;
  isMuted(): boolean;
  onSettingsChange(fn: (muted: boolean) => void): void;
  /** The platform asks the game to pause / resume (e.g. its own overlays). Optional. */
  onPauseChange?(fn: (paused: boolean) => void): void;
  dataGet(key: string): string | null;
  dataSet(key: string, value: string): void;
  dataRemove(key: string): void;
  requestAd(type: AdType, onStarted: () => void): Promise<AdResult>;
  hasAdblock(): Promise<boolean>;
  isAccountAvailable(): boolean;
  getUser(): Promise<PlatformUser | null>;
  showAuthPrompt(): Promise<PlatformUser | null>;
  onAuthChange(fn: (user: PlatformUser | null) => void): void;
  deviceType(): DeviceType;
  locale(): string | undefined;
}
