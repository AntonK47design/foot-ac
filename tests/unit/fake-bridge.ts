import type { PGBridge } from '../../src/platform/playgama';

/** A scriptable Playgama Bridge for unit tests. */
type Fn = (v: string | boolean) => void;
class Emitter {
  handlers = new Map<string, Fn[]>();
  on(e: string, fn: Fn): void {
    this.handlers.set(e, [...(this.handlers.get(e) ?? []), fn]);
  }
  emit(e: string, v: string | boolean): void {
    for (const fn of this.handlers.get(e) ?? []) fn(v);
  }
}

export function fakeBridge(store: Record<string, unknown> = {}) {
  const messages: string[] = [];
  const platform = Object.assign(new Emitter(), {
    id: 'mock',
    language: 'de',
    isAudioEnabled: true,
    isPaused: false,
    sendMessage: async (m: string) => void messages.push(m),
  });
  const advertisement = Object.assign(new Emitter(), {
    isInterstitialSupported: true,
    isRewardedSupported: true,
    shown: [] as string[],
    showInterstitial(): void {
      this.shown.push('interstitial');
    },
    showRewarded(): void {
      this.shown.push('rewarded');
    },
    checkAdBlock: async () => false,
  });
  const bridge = Object.assign(new Emitter(), {
    initialize: async () => undefined,
    setGameLoadingProgress: (p: number) => void messages.push(`progress:${p}`),
    platform,
    advertisement,
    storage: {
      get: async (k: string | string[]) => store[String(k)] ?? null,
      set: async (k: string | string[], v: unknown) => void (store[String(k)] = v),
      delete: async (k: string | string[]) => void delete store[String(k)],
    },
    player: { isAuthorizationSupported: false, isAuthorized: false, name: null, authorize: async () => undefined },
    device: { type: 'tablet' },
    analytics: { send: (e: string, d?: Record<string, unknown>) => void messages.push(`analytics:${e}:${JSON.stringify(d ?? {})}`) },
  });
  return { bridge: bridge as unknown as PGBridge, messages, platform, advertisement, store };
}
