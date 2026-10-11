type Props = Record<string, string | number | boolean>;

const seen = new Set<string>();
const DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

let sink: ((event: string, props?: Props) => void) | null = null;

/** Funnel analytics: console in dev; in prod only through the portal's own module (Playgama Bridge), never a third party. */
export const analytics = {
  /** Where events go besides the dev console (set once the platform is known). */
  setSink(fn: ((event: string, props?: Props) => void) | null): void {
    sink = fn;
  },
  track(event: string, props?: Props): void {
    if (DEV) console.info('[analytics]', event, props ?? '');
    try {
      sink?.(event, props);
    } catch {
      /* analytics never breaks the game */
    }
  },
  /** Tracks an event only the first time it happens this session. */
  once(event: string, props?: Props): void {
    if (seen.has(event)) return;
    seen.add(event);
    analytics.track(event, props);
  },
};
