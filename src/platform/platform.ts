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
/** Analytics held while a late SDK may still arrive (boot funnel + a few perf samples; the rest is dropped). */
const ANALYTICS_QUEUE_MAX = 60;

/** `lastSeen` of a save blob (0 when missing or unreadable). */
function lastSeen(raw: string | null): number {
  if (!raw) return 0;
  try {
    const v = (JSON.parse(raw) as { lastSeen?: unknown }).lastSeen;
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

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
  private current: PlatformAdapter;
  /** Ever told the portal the game finished loading (replayed onto a late SDK). */
  private loaded = false;
  private context: GameContext | null = null;
  private readonly pauseFns: Array<(paused: boolean) => void> = [];
  private readonly muteFns: Array<(muted: boolean) => void> = [];
  private readonly authFns: Array<(u: PlatformUser | null) => void> = [];
  private readonly upgradeFns: Array<(info: { ms: number; kind: PlatformAdapter['kind']; saveReplaced: boolean }) => void> = [];
  /** Analytics held back while the real SDK may still arrive (null: send or drop straight away). */
  private analyticsQueue: Array<[string, Record<string, string | number | boolean> | undefined]> | null = null;

  constructor(adapter: PlatformAdapter) {
    this.current = adapter;
  }

  get adapter(): PlatformAdapter {
    return this.current;
  }

  /** The real SDK missed the boot deadline but may still arrive: hold analytics until `upgrade` / `cancelUpgrade`. */
  expectUpgrade(): void {
    this.analyticsQueue ??= [];
  }

  /** The real SDK won't come after all: drop the held analytics (the mock has nowhere to send them). */
  cancelUpgrade(reason: string): void {
    this.record(`late sdk gave up (${reason})`);
    this.analyticsQueue = null;
  }

  /**
   * The real SDK came up after boot (we started on the mock to keep gameplay within the time budget): switch to it
   * mid-session. Replays loading / gameplay state, completion, context and listeners onto it, re-enables ads,
   * sends the held analytics and hands the save over: the newer of the two wins (`lastSeen`). When the SDK's save is
   * newer, auth-change listeners fire so the game reloads it (the same path as a login).
   */
  upgrade(next: PlatformAdapter, ms: number): void {
    const prev = this.current;
    if (prev === next) return;
    let saveReplaced = false;
    try {
      const mine = prev.dataGet(SAVE_KEY);
      const theirs = next.dataGet(SAVE_KEY);
      if (theirs && theirs !== mine && lastSeen(theirs) > lastSeen(mine)) saveReplaced = true;
      else if (mine && mine !== theirs) next.dataSet(SAVE_KEY, mine);
    } catch (e) {
      this.record(`late sdk save handover failed: ${String(e)}`);
    }
    this.current = next;
    this.adsEnabled = ADS_FLAG;
    this.record(`late sdk ready (${next.kind}, ${Math.round(ms)} ms)${saveReplaced ? ', its save is newer' : ''}`);
    const safe = (name: string, fn: () => void): void => {
      try {
        fn();
      } catch (e) {
        this.record(`late sdk ${name} failed: ${String(e)}`);
      }
    };
    if (this.loading) safe('loadingStart', () => next.loadingStart());
    else if (this.loaded) safe('loadingStop', () => next.loadingStop());
    if (this.gameplay) safe('gameplayStart', () => next.gameplayStart());
    if (this.completion > 0) safe('completion', () => next.reportCompletion(this.completion));
    if (this.context) safe('context', () => next.setContext(this.context as GameContext));
    for (const fn of this.pauseFns) safe('onPauseChange', () => next.onPauseChange?.(fn));
    for (const fn of this.muteFns) safe('onSettingsChange', () => next.onSettingsChange(fn));
    for (const fn of this.authFns) safe('onAuthChange', () => next.onAuthChange(fn));
    const muted = next.isMuted();
    for (const fn of this.muteFns) safe('mute', () => fn(muted));
    const queue = this.analyticsQueue;
    this.analyticsQueue = null;
    if (queue) for (const [e, d] of queue) this.track(e, d);
    for (const fn of this.upgradeFns) safe('upgrade listener', () => fn({ ms, kind: next.kind, saveReplaced }));
    if (saveReplaced) for (const fn of this.authFns) safe('auth listener', () => fn(null));
  }

  /** The real SDK took over mid-session (see `upgrade`). */
  onUpgrade(fn: (info: { ms: number; kind: PlatformAdapter['kind']; saveReplaced: boolean }) => void): void {
    this.upgradeFns.push(fn);
  }

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
    this.loaded = true;
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
    this.context = ctx;
    this.adapter.setContext(ctx);
  }

  isMuted(): boolean {
    return this.adapter.isMuted();
  }

  /** True when the portal has its own analytics module (events are only ever sent there). */
  get hasAnalytics(): boolean {
    return !!this.adapter.sendAnalytics;
  }

  track(event: string, data?: Record<string, string | number | boolean>): void {
    if (this.analyticsQueue && !this.adapter.sendAnalytics) {
      if (this.analyticsQueue.length < ANALYTICS_QUEUE_MAX) this.analyticsQueue.push([event, data]);
      return;
    }
    this.adapter.sendAnalytics?.(event, data);
  }

  onPauseChange(fn: (paused: boolean) => void): void {
    this.pauseFns.push(fn);
    this.adapter.onPauseChange?.(fn);
  }

  onMuteChange(fn: (muted: boolean) => void): void {
    this.muteFns.push(fn);
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
    this.authFns.push(fn);
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
    let late: Promise<void> | null = null;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!bridge) {
      pending.push('bridge script missing → mock');
      adapter = new MockAdapter(logFn);
    } else {
      // no Playgama splash: the game shows its own world within a few seconds (GDD §2)
      const init = bridge.initialize({ disableLoadingLogo: true });
      try {
        await timeout(init, initTimeoutMs);
        const pg = new PlaygamaAdapter(bridge, logFn);
        await timeout(pg.preload([SAVE_KEY, SAVE_BACKUP_KEY]), initTimeoutMs);
        pending.push(`bridge ready (${bridge.platform.id})`);
        adapter = pg;
      } catch (e) {
        // start on the mock (gameplay within budget) and switch over if the bridge still comes up
        pending.push(`bridge init slow or failed (${String(e)}) → mock for now`);
        adapter = new MockAdapter(logFn);
        late = init;
      }
    }
    const platform = new Platform(adapter);
    holder.p = platform;
    for (const m of pending) platform.record(m);
    if (late && bridge) {
      platform.expectUpgrade();
      void lateBridge(platform, bridge, late, t0, logFn);
    }
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

/** How long a late bridge may take to read the saves before we give up on it for this session. */
const LATE_PRELOAD_MS = 10_000;

/** Waits for a bridge that missed the boot deadline and switches the running game over to it. Never throws. */
async function lateBridge(platform: Platform, bridge: NonNullable<ReturnType<typeof getBridge>>, init: Promise<void>, t0: number, log: (m: string) => void): Promise<void> {
  try {
    await init;
    const pg = new PlaygamaAdapter(bridge, log);
    // only switch once the saves are read: never push our save over one we couldn't see
    await timeout(pg.preload([SAVE_KEY, SAVE_BACKUP_KEY]), LATE_PRELOAD_MS);
    platform.upgrade(pg, (typeof performance !== 'undefined' ? performance.now() : 0) - t0);
  } catch (e) {
    platform.cancelUpgrade(String(e));
  }
}
