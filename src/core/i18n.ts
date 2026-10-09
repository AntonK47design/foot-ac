import en from '../data/locales/en.json';

type Plural = { one?: string; other: string; zero?: string; few?: string; many?: string; two?: string };
type Entry = string | Plural;
type Dict = Record<string, Entry>;

const dicts: Record<string, Dict> = { en: en as Dict };
let current: Dict = dicts.en as Dict;
let currentLocale = 'en';
let pluralRules = new Intl.PluralRules('en');

export type Params = Record<string, string | number>;

/** Picks the best supported locale from candidates (e.g. systemInfo locale, navigator.language). */
export function resolveLocale(candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (!c) continue;
    const lc = c.toLowerCase();
    if (dicts[lc]) return lc;
    const base = lc.split(/[-_]/)[0] ?? '';
    if (dicts[base]) return base;
  }
  return 'en';
}

export function setLocale(locale: string): void {
  currentLocale = dicts[locale] ? locale : 'en';
  current = dicts[currentLocale] as Dict;
  pluralRules = new Intl.PluralRules(currentLocale);
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale;
}

export function getLocale(): string {
  return currentLocale;
}

export function availableLocales(): string[] {
  return Object.keys(dicts);
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate a key with {param} interpolation. Plural entries use params.count. Falls back to English, then the key. */
export function t(key: string, params?: Params): string {
  const entry: Entry | undefined = current[key] ?? (dicts.en as Dict)[key];
  if (entry === undefined) return key;
  if (typeof entry === 'string') return interpolate(entry, params);
  const count = Number(params?.count ?? 0);
  const cat = count === 0 && entry.zero ? 'zero' : pluralRules.select(count);
  const s = (entry as Record<string, string | undefined>)[cat] ?? entry.other;
  return interpolate(s, params);
}

export function hasKey(key: string): boolean {
  return key in (dicts.en as Dict);
}

/** $12.4K / $1.2M style abbreviation. */
export function formatCash(n: number): string {
  return '$' + formatNumber(n);
}

export function formatNumber(n: number): string {
  const v = Math.floor(n);
  const abs = Math.abs(v);
  if (abs < 10000) return v.toLocaleString('en-US');
  const units: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [d, u] of units) {
    if (abs >= d) {
      const x = v / d;
      return (x >= 100 ? Math.floor(x).toString() : (Math.floor(x * 10) / 10).toString()) + u;
    }
  }
  return v.toString();
}
