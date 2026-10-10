import type { AdResult, AdType, DeviceType, GameContext, PlatformAdapter, PlatformUser } from './types';
import { MockAdapter } from './mock';
import { CrazyGamesAdapter, getSdk } from './crazygames';
import { PlaygamaAdapter, getBridge } from './playgama';
import { SAVE_BACKUP_KEY, SAVE_KEY } from '../data/constants';

export type { AdResult, AdType, DeviceType, PlatformUser } from './types';

export interface PlatformLogEntry {
  t: number;
  msg: string;
}

const ADS_FLAG = (import.meta.env?.VITE_ADS ?? 'off') === 'on';
/** Which portal this build is for (VITE_PLATFORM): 'crazygames' (default) or 'playgama'. */
const PLATFORM = (import.meta.env?.VITE_PLATFORM ?? 'crazygames') as 'crazygames' | 'playgama';

/**
 * Typed platform facade. Holds the idempotent gameplay/loading state machine,
 * monotonic completion %, ad gating and an event log for the debug overlay and tests.
 * The rest of the game only talks to this class.
 */
export class Platform {
  readonly log: PlatformLogEntry[] = [];
  private gameplay = false;
  private loading = false;
  private completion = 0;
  private adsEnabled = ADS_FLAG;
  private adInFlight = false;
  private readonly t0 = typeof performance !== 'undefined' ? performance.now() : 0;

  constructor(readonly adapter: PlatformAdapter) {}

  get kind(): PlatformAdapter['kind'] {
    return this.adapter.kind;
  }

  record(msg: string): void {
    const t = (typeof performance !== 'undefined' ? performance.now() : 0) - this.t0;
    this.log.push({ t: Math.round(t), msg });
    if (this.log.length > 200) this.log.shift();
  }

  get isGameplay(): boolean {
    return this.gameplay;
  }

  loadingStart(): void {
    if (this.loading) return;
    this.loading = true;
    this.record('loadingStart');
    this.adapter.loadingStart();
  }

  loadingStop(): void {
    if (!this.loading) return;
    this.loading = false;
    this.record('loadingStop');
    this.adapter.loadingStop();
  }

  gameplayStart(): void {
    if (this.gameplay) return;
    this.gameplay = true;
    this.record('gameplayStart');
    this.adapter.gameplayStart();
  }

  gameplayStop(): void {
    if (!this.gameplay) return;
    this.gameplay = false;
    this.record('gameplayStop');
    this.adapter.gameplayStop();
  }

  happytime(): void {
    this.record('happytime');
    this.adapter.happytime();
  }

  /** Monotonic: never reports a lower value than before. */
  reportCompletion(pct: number): void {
    const v = Math.max(0, Math.min(100, Math.floor(pct)));
    if (v <= this.completion) return;
    this.completion = v;
    this.record(`completion ${v}`);
    this.adapter.reportCompletion(v);
  }

  setContext(ctx: GameContext): void {
    this.adapter.setContext(ctx);
  }

  isMuted(): boolean {
    return this.adapter.isMuted();
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.adapter.onPauseChange?.(fn);
  }

  onMuteChange(fn: (muted: boolean) => void): void {
    this.adapter.onSettingsChange(fn);
  }

  dataGet(key: string): string | null {
    return this.adapter.dataGet(key);
  }
  dataSet(key: string, value: string): void {
    this.adapter.dataSet(key, value);
  }
  dataRemove(key: string): void {
    this.adapter.dataRemove(key);
  }

  /** Test builds only (exposed via window.__wk): turn ads on without VITE_ADS. A no-op in release builds. */
  enableAdsForTesting(): void {
    if (import.meta.env?.DEV || import.meta.env?.VITE_TEST_HOOKS === '1' || import.meta.env?.MODE === 'test' || import.meta.env?.MODE === 'e2e') this.adsEnabled = true;
  }

  get adsAvailable(): boolean {
    return this.adsEnabled;
  }

  /** Requests an ad. Never resolves with a reward unless adFinished fired. */
  async requestAd(type: AdType, onStarted: () => void): Promise<AdResult> {
    if (!this.adsEnabled) return { ok: false, code: 'adsDisabledBasicLaunch' };
    if (this.adInFlight) return { ok: false, code: 'other' };
    this.adInFlight = true;
    this.record(`requestAd ${type}`);
    try {
      const r = await this.adapter.requestAd(type, onStarted);
      if (!r.ok && r.code === 'adsDisabledBasicLaunch') this.adsEnabled = false;
      this.record(r.ok ? `ad ${type} finished` : `ad ${type} error ${r.code}`);
      return r;
    } finally {
      this.adInFlight = false;
    }
  }

  hasAdblock(): Promise<boolean> {
    return this.adapter.hasAdblock();
  }
  isAccountAvailable(): boolean {
    return this.adapter.isAccountAvailable();
  }
  getUser(): Promise<PlatformUser | null> {
    return this.adapter.getUser();
  }
  showAuthPrompt(): Promise<PlatformUser | null> {
    return this.adapter.showAuthPrompt();
  }
  onAuthChange(fn: (u: PlatformUser | null) => void): void {
    this.adapter.onAuthChange(fn);
  }
  deviceType(): DeviceType {
    return this.adapter.deviceType();
  }
  locale(): string | undefined {
    return this.adapter.locale();
  }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Initialises the real SDK if present and usable; otherwise returns the mock. Never throws. */
export async function createPlatform(initTimeoutMs = 2500): Promise<Platform> {
  const pending: string[] = [];
  const holder: { p?: Platform } = {};
  const logFn = (m: string): void => {
    if (holder.p) holder.p.record(m);
    else pending.push(m);
  };
  let adapter: PlatformAdapter;
  if (PLATFORM === 'playgama') {
    const bridge = getBridge();
    if (!bridge) {
      pending.push('bridge script missing → mock');
      adapter = new MockAdapter(logFn);
    } else {
      try {
        // no Playgama splash: the game shows its own world within a few seconds (GDD §2)
        await timeout(bridge.initialize({ disableLoadingLogo: true }), initTimeoutMs);
        const pg = new PlaygamaAdapter(bridge, logFn);
        await timeout(pg.preload([SAVE_KEY, SAVE_BACKUP_KEY]), initTimeoutMs);
        pending.push(`bridge ready (${bridge.platform.id})`);
        adapter = pg;
      } catch (e) {
        pending.push(`bridge init failed (${String(e)}) → mock`);
        adapter = new MockAdapter(logFn);
      }
    }
    const platform = new Platform(adapter);
    holder.p = platform;
    for (const m of pending) platform.record(m);
    return platform;
  }
  const sdk = getSdk();
  if (!sdk) {
    pending.push('sdk script missing → mock');
    adapter = new MockAdapter(logFn);
  } else {
    try {
      await timeout(sdk.init(), initTimeoutMs);
      if (sdk.environment === 'disabled') {
        pending.push('sdk environment disabled → mock');
        adapter = new MockAdapter(logFn);
      } else {
        pending.push(`sdk ready (${sdk.environment})`);
        adapter = new CrazyGamesAdapter(sdk, logFn);
      }
    } catch (e) {
      pending.push(`sdk init failed (${String(e)}) → mock`);
      adapter = new MockAdapter(logFn);
    }
  }
  const platform = new Platform(adapter);
  holder.p = platform;
  for (const m of pending) platform.record(m);
  return platform;
}
