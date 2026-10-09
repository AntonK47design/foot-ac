type Props = Record<string, string | number | boolean>;

const seen = new Set<string>();
const DEV = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

/** Funnel analytics: console in dev, no-op in prod, ready for a provider later. */
export const analytics = {
  track(event: string, props?: Props): void {
    if (DEV) console.info('[analytics]', event, props ?? '');
  },
  /** Tracks an event only the first time it happens this session. */
  once(event: string, props?: Props): void {
    if (seen.has(event)) return;
    seen.add(event);
    analytics.track(event, props);
  },
};
