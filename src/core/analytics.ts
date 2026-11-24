import { BUILD } from '../data/constants';

type Props = Record<string, string | number | boolean>;

const seen = new Set<string>();
const DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;
/** Events tracked before the platform is known (e.g. `boot`) wait here, then go out with the first sink. */
const EARLY_MAX = 20;

let sink: ((event: string, props?: Props) => void) | null = null;
let early: Array<[string, Props | undefined]> | null = [];

function send(event: string, props?: Props): void {
  try {
    // every event carries the build, so before/after comparisons don't depend on dates
    sink?.(event, { ...props, build_version: BUILD });
  } catch {
    /* analytics never breaks the game */
  }
}

/** Funnel analytics: console in dev; in prod only through the portal's own module (Playgama Bridge), never a third party. */
export const analytics = {
  /** Where events go besides the dev console (set once the platform is known); flushes the early events. */
  setSink(fn: ((event: string, props?: Props) => void) | null): void {
    sink = fn;
    const q = early;
    early = null;
    if (q) for (const [e, p] of q) send(e, p);
  },
  track(event: string, props?: Props): void {
    if (DEV) console.info('[analytics]', event, props ?? '');
    if (early) {
      if (early.length < EARLY_MAX) early.push([event, props]);
      return;
    }
    send(event, props);
  },
  /** Tracks an event only the first time it happens this session. */
  once(event: string, props?: Props): void {
    if (seen.has(event)) return;
    seen.add(event);
    analytics.track(event, props);
  },
};
