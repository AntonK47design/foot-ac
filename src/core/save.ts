import { SAVE_BACKUP_KEY, SAVE_KEY, SAVE_VERSION } from '../data/constants';
import type { AreaDef } from '../data/types';
import type { SimState } from '../sim/state';
import { newLeague } from '../sim/match';
import { DEFAULT_SETTINGS, type Settings } from '../ui/settings';

export interface SaveStats {
  playSec: number;
  sessions: number;
  firstDay: string;
}

/** One versioned JSON blob (§12). The sim state holds cash, pads, trainees, staff, timers… */
export interface SaveBlob {
  v: number;
  created: number;
  lastSeen: number;
  game: SimState;
  settings: Settings;
  stats: SaveStats;
}

export interface KeyValueStore {
  dataGet(key: string): string | null;
  dataSet(key: string, value: string): void;
  dataRemove(key: string): void;
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Schema migrations: MIGRATIONS[n] upgrades a blob from version n to n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // 0 → 1: pre-release blobs stored the sim state at the top level
  0: (raw) => ({ v: 1, created: raw.created ?? Date.now(), lastSeen: raw.lastSeen ?? Date.now(), game: raw.game ?? raw.sim, settings: raw.settings, stats: raw.stats }),
  // 1 → 2: Area 1 moved onto the diorama layout (art overhaul). Economy is kept; agents are re-placed on load.
  1: (raw) => {
    const game = raw.game as Record<string, unknown> | undefined;
    if (game && typeof game === 'object') {
      const flags = (game.flags ?? {}) as Record<string, boolean>;
      flags.relayout = true;
      game.flags = flags;
    }
    return { ...raw, v: 2 };
  },
  // 2 → 3: M2 adds podium queue, squad, league, match timer and records (defaults filled in normalize)
  2: (raw) => ({ ...raw, v: 3 }),
  // 3 → 4: M3 adds office upgrades and fixed-spot staff (defaults filled in normalize)
  3: (raw) => ({ ...raw, v: 4 }),
};

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let cur = raw;
  let v = typeof cur.v === 'number' ? cur.v : 0;
  while (v < SAVE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from v${v}`);
    cur = m(cur);
    v++;
    cur.v = v;
  }
  return cur;
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Structural validation of the parts the game relies on. */
export function validate(raw: Record<string, unknown>): raw is Record<string, unknown> & SaveBlob {
  const g = raw.game;
  if (!isObj(g)) return false;
  if (!isNum(g.cash) || !isNum(g.xp) || !isNum(g.level) || !isNum(g.stars) || !isNum(g.time)) return false;
  const c = g.coach;
  if (!isObj(c) || !isNum(c.x) || !isNum(c.z)) return false;
  if (!isObj(g.pads) || !isObj(g.built) || !isObj(g.stations)) return false;
  if (!Array.isArray(g.piles) || !Array.isArray(g.trainees) || !Array.isArray(g.staff) || !Array.isArray(g.seats)) return false;
  for (const t of g.trainees) if (!isObj(t) || !isNum(t.x) || !isNum(t.z) || typeof t.state !== 'string') return false;
  for (const p of g.piles) if (!isObj(p) || !isNum(p.amount)) return false;
  return true;
}

/** Fills fields added by newer content (new pads, flags) and clears transient data. */
export function normalize(blob: SaveBlob, area: AreaDef): SaveBlob {
  const g = blob.game;
  for (const p of area.pads) if (!g.pads[p.id]) g.pads[p.id] = { paid: 0, done: false };
  g.flags = g.flags ?? {};
  g.podiumQueue = Array.isArray(g.podiumQueue) ? g.podiumQueue : [];
  g.squad = Array.isArray(g.squad) ? g.squad : [];
  g.league = g.league && Array.isArray(g.league.table) ? g.league : newLeague(0, 1);
  g.matchNextAt = typeof g.matchNextAt === 'number' ? g.matchNextAt : 0;
  g.upgrades = g.upgrades && typeof g.upgrades === 'object' ? g.upgrades : {};
  g.records = { bestSale: 0, sold: 0, promoted: 0, matches: 0, wins: 0, goals: 0, titles: 0, ...((g.records ?? {}) as Partial<SimState['records']>) };
  g.stats = { signed: 0, reps: 0, graduated: 0, unlocks: 0, ballsDelivered: 0, cashCollected: 0, ...((g.stats ?? {}) as Partial<SimState['stats']>) };
  for (const t of g.trainees) {
    t.path = [];
    t.pathI = 0;
    t.px = t.x;
    t.pz = t.z;
  }
  for (const f of g.staff) {
    f.path = [];
    f.pathI = 0;
    f.px = f.x;
    f.pz = f.z;
  }
  g.coach.px = g.coach.x;
  g.coach.pz = g.coach.z;
  g.coach.vx = 0;
  g.coach.vz = 0;
  if (g.cash < 0) g.cash = 0;
  blob.settings = { ...DEFAULT_SETTINGS, ...(blob.settings ?? {}) };
  blob.stats = { playSec: 0, sessions: 0, firstDay: new Date(blob.created).toISOString().slice(0, 10), ...((blob.stats ?? {}) as Partial<SaveStats>) };
  return blob;
}

export function serialize(blob: SaveBlob): string {
  return JSON.stringify(blob, (k, v: unknown) => (k === 'path' ? [] : v));
}

export type LoadResult = { blob: SaveBlob; corrupt: false } | { blob: null; corrupt: boolean };

export function parseSave(raw: string | null, area: AreaDef): LoadResult {
  if (!raw) return { blob: null, corrupt: false };
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!isObj(obj)) return { blob: null, corrupt: true };
    const m = migrate(obj);
    if (!validate(m)) return { blob: null, corrupt: true };
    return { blob: normalize(m as unknown as SaveBlob, area), corrupt: false };
  } catch {
    return { blob: null, corrupt: true };
  }
}

/** Read-before-write save manager over the platform data module (or localStorage fallback). */
export class SaveManager {
  private loaded = false;
  dirty = false;
  private since = 0;
  created = Date.now();
  stats: SaveStats = { playSec: 0, sessions: 0, firstDay: '' };
  lastError: string | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly area: AreaDef,
    private readonly now: () => number,
  ) {}

  load(): SaveBlob | null {
    let raw: string | null = null;
    try {
      raw = this.store.dataGet(SAVE_KEY);
    } catch {
      raw = null;
    }
    const r = parseSave(raw, this.area);
    this.loaded = true;
    if (r.corrupt && raw) {
      // keep the broken blob for support, start fresh instead of crashing
      try {
        this.store.dataSet(SAVE_BACKUP_KEY, raw);
      } catch {
        /* ignore */
      }
    }
    if (r.blob) {
      this.created = r.blob.created;
      this.stats = r.blob.stats;
    } else {
      this.created = this.now();
      this.stats = { playSec: 0, sessions: 0, firstDay: new Date(this.created).toISOString().slice(0, 10) };
    }
    this.stats.sessions++;
    return r.blob;
  }

  save(game: SimState, settings: Settings): boolean {
    if (!this.loaded) return false; // never overwrite progress we haven't read
    const blob: SaveBlob = { v: SAVE_VERSION, created: this.created, lastSeen: this.now(), game, settings, stats: this.stats };
    try {
      this.store.dataSet(SAVE_KEY, serialize(blob));
      this.dirty = false;
      this.since = 0;
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  /** Periodic autosave (every 10 s while dirty). Returns true when a save is due. */
  tick(dt: number): boolean {
    this.since += dt;
    return this.dirty && this.since >= 10;
  }

  clear(): void {
    try {
      this.store.dataRemove(SAVE_KEY);
    } catch {
      /* ignore */
    }
    this.created = this.now();
    this.stats = { playSec: 0, sessions: 1, firstDay: new Date(this.created).toISOString().slice(0, 10) };
  }
}
