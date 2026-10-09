import { BALANCE } from '../data/balance';
import { RARITIES, type Position, type Rarity } from '../data/types';
import type { Rng } from '../core/rng';
import type { MetaState, Prospect, Quest, QuestKind, ScoutTier, SimState } from './state';

/**
 * Retention / meta systems (GDD §4.8–4.9): daily reward, daily quests, scouting, Daily Cup, Hall of Fame,
 * level-up chests and offline earnings. Pure functions over SimState; wall-clock time is passed in.
 * (Academy customisation is deferred.)
 */

export type Feature = keyof typeof BALANCE.meta.unlockLevel;

const POSITIONS: Position[] = ['GK', 'DF', 'MF', 'FW'];

export function newMeta(): MetaState {
  return {
    daily: { claims: 0, lastDay: '' },
    quests: { day: '', list: [] },
    scout: { tier: null, startedAt: 0, endsAt: 0 },
    cupDay: '',
    album: {},
    albumClaimed: 0,
    accountPrompted: false,
    incomeRate: 0,
  };
}

/** Local calendar day (YYYY-MM-DD). `tzOffsetMin` as from Date#getTimezoneOffset (defaults to the runtime's). */
export function dayKey(ms: number, tzOffsetMin = new Date(ms).getTimezoneOffset()): string {
  return new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** Milliseconds until the next local midnight. */
export function msToMidnight(ms: number, tzOffsetMin = new Date(ms).getTimezoneOffset()): number {
  const local = ms - tzOffsetMin * 60_000;
  const day = 86_400_000;
  return day - (((local % day) + day) % day);
}

export function unlocked(state: SimState, f: Feature): boolean {
  return state.level >= BALANCE.meta.unlockLevel[f];
}

// ───────────────────────────── level-up chest ─────────────────────────────

export interface Reward {
  cash: number;
  tickets: number;
  prospect?: Prospect;
}

export function chestFor(level: number): Reward {
  const C = BALANCE.meta.chest;
  return { cash: level >= C.cashFromLevel ? C.cashPerLevel * level : 0, tickets: level >= C.ticketsFromLevel ? 1 : 0 };
}

function grant(state: SimState, r: Reward): void {
  state.cash += r.cash;
  state.earned += r.cash;
  state.tickets += r.tickets;
  if (r.prospect) state.prospects.push(r.prospect);
}

export function grantChest(state: SimState, level: number): Reward {
  const r = chestFor(level);
  grant(state, r);
  return r;
}

// ───────────────────────────── daily reward ─────────────────────────────

/** Reward for calendar slot `index` (0–6) at the current academy level. */
export function dailyReward(state: SimState, index: number, rng?: Rng): Reward {
  const d = BALANCE.meta.daily[index % 7] ?? {};
  const scale = 1 + BALANCE.meta.dailyLevelScale * (state.level - 1);
  const r: Reward = { cash: Math.round(((d.cash ?? 0) * scale) / 10) * 10, tickets: d.tickets ?? 0 };
  if (d.prospect) r.prospect = { rarity: d.prospect, position: rng ? rng.pick(POSITIONS) : 'FW' };
  return r;
}

export function dailyAvailable(state: SimState, now: number, tz?: number): boolean {
  return unlocked(state, 'daily') && state.meta.daily.lastDay !== dayKey(now, tz);
}

/** Calendar slot that today's claim gives (a missed day doesn't reset the streak). */
export function dailyIndex(state: SimState): number {
  return state.meta.daily.claims % 7;
}

export function claimDaily(state: SimState, now: number, rng: Rng, tz?: number): Reward | null {
  if (!dailyAvailable(state, now, tz)) return null;
  const r = dailyReward(state, dailyIndex(state), rng);
  grant(state, r);
  state.meta.daily.claims++;
  state.meta.daily.lastDay = dayKey(now, tz);
  return r;
}

// ───────────────────────────── daily quests ─────────────────────────────

const QUEST_POOL: Array<{ kind: QuestKind; target: number; cash: number; tickets: number }> = [
  { kind: 'sign', target: 10, cash: 400, tickets: 1 },
  { kind: 'reps', target: 120, cash: 500, tickets: 0 },
  { kind: 'win', target: 2, cash: 600, tickets: 1 },
  { kind: 'sell', target: 3, cash: 600, tickets: 1 },
  { kind: 'upgrade', target: 2, cash: 500, tickets: 1 },
  { kind: 'graduate', target: 4, cash: 500, tickets: 1 },
  { kind: 'collect', target: 3000, cash: 400, tickets: 1 },
];

/** New quests at local midnight (3 distinct kinds, scaled by level). Returns true when refreshed. */
export function refreshQuests(state: SimState, now: number, rng: Rng, tz?: number): boolean {
  const today = dayKey(now, tz);
  const q = state.meta.quests;
  if (q.day === today || !unlocked(state, 'quests')) return false;
  const pool = [...QUEST_POOL];
  const list: Quest[] = [];
  const scale = 1 + BALANCE.meta.quests.levelScale * (state.level - 1);
  for (let i = 0; i < BALANCE.meta.quests.perDay && pool.length; i++) {
    const k = rng.int(0, pool.length - 1);
    const def = pool.splice(k, 1)[0];
    if (!def) break;
    const target = def.kind === 'collect' ? Math.round((def.target * scale) / 100) * 100 : def.target;
    list.push({ id: `${today}:${def.kind}`, kind: def.kind, target, progress: 0, cash: Math.round((def.cash * scale) / 10) * 10, tickets: def.tickets, claimed: false });
  }
  state.meta.quests = { day: today, list };
  return true;
}

export function questProgress(state: SimState, kind: QuestKind, amount = 1): void {
  for (const q of state.meta.quests.list) if (q.kind === kind && !q.claimed && q.progress < q.target) q.progress = Math.min(q.target, q.progress + amount);
}

export function claimQuest(state: SimState, id: string): Reward | null {
  const q = state.meta.quests.list.find((x) => x.id === id);
  if (!q || q.claimed || q.progress < q.target) return null;
  q.claimed = true;
  const r = { cash: q.cash, tickets: q.tickets };
  grant(state, r);
  return r;
}

export function questsClaimable(state: SimState): number {
  return state.meta.quests.list.filter((q) => !q.claimed && q.progress >= q.target).length;
}

// ───────────────────────────── scouting ─────────────────────────────

export function scoutCost(tier: ScoutTier): { cash: number; tickets: number } {
  const S = BALANCE.meta.scout[tier];
  return { cash: S.cash, tickets: S.tickets };
}

export function canScout(state: SimState, tier: ScoutTier): boolean {
  const c = scoutCost(tier);
  return unlocked(state, 'scout') && state.meta.scout.tier === null && state.cash + 1e-6 >= c.cash && state.tickets >= c.tickets;
}

export function startScout(state: SimState, tier: ScoutTier, now: number): boolean {
  if (!canScout(state, tier)) return false;
  const c = scoutCost(tier);
  state.cash -= c.cash;
  state.tickets -= c.tickets;
  state.meta.scout = { tier, startedAt: now, endsAt: now + BALANCE.meta.scout[tier].sec * 1000 };
  return true;
}

/** Rarity at least `floor`, with a wonderkid chance. */
export function rollScoutRarity(rng: Rng, tier: ScoutTier): Rarity {
  const S = BALANCE.meta.scout[tier];
  if (rng.chance(S.wonderkid)) return 'wonderkid';
  const fi = RARITIES.indexOf(S.floor);
  // mostly the floor, sometimes one tier better
  const up = rng.chance(0.25) ? 1 : 0;
  return RARITIES[Math.min(RARITIES.length - 2, fi + up)] ?? S.floor;
}

/** Finishes a mission whose timer ran out: the prospect joins the next bus. */
export function updateScout(state: SimState, now: number, rng: Rng): Prospect | null {
  const sc = state.meta.scout;
  if (!sc.tier || now < sc.endsAt) return null;
  const p: Prospect = { rarity: rollScoutRarity(rng, sc.tier), position: rng.pick(POSITIONS) };
  state.prospects.push(p);
  state.meta.scout = { tier: null, startedAt: 0, endsAt: 0 };
  return p;
}

// ───────────────────────────── Daily Cup ─────────────────────────────

export function cupAvailable(state: SimState, now: number, tz?: number): boolean {
  return unlocked(state, 'cup') && state.meta.cupDay !== dayKey(now, tz);
}

// ───────────────────────────── Hall of Fame ─────────────────────────────

export function albumKey(position: Position, rarity: Rarity): string {
  return `${position}:${rarity}`;
}

export function albumAdd(state: SimState, position: Position, rarity: Rarity): boolean {
  const k = albumKey(position, rarity);
  const fresh = !state.meta.album[k];
  state.meta.album[k] = (state.meta.album[k] ?? 0) + 1;
  return fresh;
}

export function albumSlots(state: SimState): number {
  return Object.keys(state.meta.album).length;
}

/** Next milestone that can be claimed now (needs the album feature level), or null. */
export function albumClaimable(state: SimState): (typeof BALANCE.meta.album)[number] | null {
  const m = BALANCE.meta.album[state.meta.albumClaimed];
  if (!m || !unlocked(state, 'album') || albumSlots(state) < m.slots) return null;
  return m;
}

export function claimAlbum(state: SimState): Reward | null {
  const m = albumClaimable(state);
  if (!m) return null;
  state.meta.albumClaimed++;
  const r = { cash: m.cash, tickets: m.tickets };
  grant(state, r);
  return r;
}

// ───────────────────────────── offline earnings ─────────────────────────────

/** Offline earnings cap (s): base + Office upgrade. */
export function offlineCapSec(state: SimState): number {
  const lv = state.upgrades.academy_offline ?? 0;
  return BALANCE.meta.offline.baseCapSec + lv * 7200;
}

/** Cash earned while away: automated academy (ball boy hired) at a share of the recent income rate, capped. */
export function offlineEarnings(state: SimState, awaySec: number): { sec: number; cash: number } {
  const O = BALANCE.meta.offline;
  if (awaySec < O.minSec) return { sec: 0, cash: 0 };
  const sec = Math.min(awaySec, offlineCapSec(state));
  const automated = state.staff.some((f) => f.kind === 'ball_boy');
  const cash = automated ? Math.floor(state.meta.incomeRate * O.share * sec) : 0;
  return { sec, cash };
}

/** EMA of income per second, updated from the sim tick (`earnedDelta` this tick). */
export function trackIncome(meta: MetaState, earnedDelta: number, dt: number): void {
  if (dt <= 0) return;
  const k = Math.min(1, dt / BALANCE.meta.incomeTau);
  meta.incomeRate += (earnedDelta / dt - meta.incomeRate) * k;
}
