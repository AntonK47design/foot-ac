import { BALANCE } from '../data/balance';
import { DIVISIONS, type TeamDef } from '../data/clubs';
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES } from '../data/names';
import { STATS, type Position, type Stat } from '../data/types';
import type { Rng } from '../core/rng';
import { computeOvr } from './players';
import type { League, LeagueRow, Player } from './state';

/** One player in a match line-up (squad member or a generated academy sub). */
export interface MatchPlayer {
  /** Squad player id, or a negative id for subs. */
  id: number;
  name: string;
  position: Position;
  female: boolean;
  ovr: number;
  stats: Record<Stat, number>;
  sub: boolean;
}

export interface Chance {
  side: 'us' | 'them';
  /** Line-up index of the shooter / passer (ours: our line-up, theirs: 0..4 of theirs). */
  shooter: number;
  passer: number;
  /** Our chance with a Power Shot timing meter. */
  power: boolean;
  /** Goal probability before the Power Shot. */
  base: number;
  /** Pre-rolled uniform number: goal when roll < probability (keeps the result deterministic). */
  roll: number;
  goal: boolean | null;
}

export interface MatchScript {
  opponent: TeamDef;
  division: number;
  lineup: MatchPlayer[];
  ourStrength: number;
  chances: Chance[];
}

export type MatchOutcome = 'win' | 'draw' | 'loss';

export interface MatchResult {
  ourGoals: number;
  theirGoals: number;
  outcome: MatchOutcome;
  cash: number;
  points: number;
  xp: number;
  /** MVP (squad player id or a sub's negative id) and the stat they improved (null for subs/capped). */
  mvp: MatchPlayer | null;
  mvpStat: Stat | null;
  /** Table position after the round (1 = top). */
  rank: number;
  seasonOver: boolean;
  promoted: boolean;
  champion: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function opponentsOf(division: number): TeamDef[] {
  return (DIVISIONS[Math.min(division, DIVISIONS.length - 1)] ?? DIVISIONS[0])?.teams ?? [];
}

export function newLeague(division: number, season: number): League {
  const table: LeagueRow[] = [{ team: 'us', p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }];
  for (const t of opponentsOf(division)) table.push({ team: t.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  return { division, season, round: 0, table };
}

export function sortedTable(l: League): LeagueRow[] {
  return [...l.table].sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || (a.team === 'us' ? -1 : b.team === 'us' ? 1 : 0));
}

/** Round-robin pairings for 6 teams (circle method); team 0 is us. Round r pairs us with rival r. */
export function pairings(round: number): Array<[number, number]> {
  const n = 6;
  const others = [1, 2, 3, 4, 5];
  // rotate the 5 rivals so that us (0) meets rival `round + 1` and the rest pair up
  const rot = others.map((_, i) => others[(i + round) % 5] as number);
  const pairs: Array<[number, number]> = [[0, rot[0] as number]];
  for (let i = 1; i < n / 2; i++) pairs.push([rot[i] as number, rot[5 - i] as number]);
  return pairs;
}

function lineupFrom(squad: Player[], rng: Rng): MatchPlayer[] {
  const size = BALANCE.squad.size;
  const ps: MatchPlayer[] = squad.map((p) => ({ id: p.id, name: p.name, position: p.position, female: p.female, ovr: computeOvr(p.position, p.stats), stats: { ...p.stats }, sub: false }));
  ps.sort((a, b) => b.ovr - a.ovr);
  const lineup = ps.slice(0, size);
  let subId = -1;
  while (lineup.length < size) {
    const female = rng.chance(0.5);
    const o = BALANCE.squad.subOvr;
    const stats = { PAC: o, SHO: o, PAS: o, DRI: o } as Record<Stat, number>;
    lineup.push({ id: subId--, name: `${rng.pick(female ? FIRST_NAMES_F : FIRST_NAMES_M)} ${rng.pick(LAST_NAMES)}`, position: 'MF', female, ovr: o, stats, sub: true });
  }
  // keeper first: a GK if we have one, else the lowest OVR
  let gk = lineup.findIndex((p) => p.position === 'GK');
  if (gk < 0) {
    gk = 0;
    for (let i = 1; i < lineup.length; i++) if ((lineup[i] as MatchPlayer).ovr < (lineup[gk] as MatchPlayer).ovr) gk = i;
  }
  const [k] = lineup.splice(gk, 1);
  if (k) lineup.unshift(k);
  return lineup;
}

/** Builds the scripted highlight reel: 3–5 chances, outcomes pre-rolled except for Power Shots. */
export function createMatch(rng: Rng, squad: Player[], league: League): MatchScript {
  const M = BALANCE.match;
  const opps = opponentsOf(league.division);
  const pair = pairings(league.round % 5)[0] as [number, number];
  const opponent = opps[pair[1] - 1] ?? (opps[0] as TeamDef);
  const lineup = lineupFrom(squad, rng);
  const ourStrength = lineup.reduce((a, p) => a + p.ovr, 0) / lineup.length;
  const opp = opponent.strength;
  const share = clamp(ourStrength ** M.shareExp / (ourStrength ** M.shareExp + opp ** M.shareExp), M.shareMin, M.shareMax);
  const n = rng.int(M.chances[0], M.chances[1]);
  const chances: Chance[] = [];
  let ours = 0;
  let powers = 0;
  for (let i = 0; i < n; i++) {
    // at least one chance of ours per match (the Power Shot is the fun part)
    const mine = rng.chance(share) || (i === n - 1 && ours === 0);
    if (mine) {
      ours++;
      // shooter weighted by finishing; never the keeper unless alone
      const outfield = lineup.length > 1 ? lineup.slice(1) : lineup;
      const w: Record<string, number> = {};
      outfield.forEach((p, j) => (w[String(j)] = Math.max(1, p.stats.SHO + (p.position === 'FW' ? 15 : 0))));
      const si = Number(rng.weighted(w)) + (lineup.length > 1 ? 1 : 0);
      let pi = 1 + rng.int(0, Math.max(0, lineup.length - 2));
      if (pi === si) pi = si === 1 ? Math.min(lineup.length - 1, 2) : 1;
      const sh = lineup[si] as MatchPlayer;
      const base = clamp(M.goalBase + (sh.stats.SHO - opp) * M.goalPerOvr, M.goalMin, M.goalMax);
      const power = powers < M.powerShotsMax && (powers === 0 || rng.chance(0.5));
      if (power) powers++;
      chances.push({ side: 'us', shooter: si, passer: pi, power, base, roll: rng.next(), goal: null });
    } else {
      const keeper = lineup[0] as MatchPlayer;
      const base = clamp(M.goalBase + (opp - (keeper.ovr + ourStrength) / 2) * M.goalPerOvr, M.goalMin, M.goalMax);
      const si = rng.int(1, 4);
      const pi = si === 1 ? 2 : 1;
      chances.push({ side: 'them', shooter: si, passer: pi, power: false, base, roll: rng.next(), goal: null });
    }
  }
  return { opponent, division: league.division, lineup, ourStrength, chances };
}

/** Resolves one chance. `quality` (0..1) is the Power Shot timing; ignored for normal chances. */
export function resolveChance(c: Chance, quality = 0.5): boolean {
  if (c.goal !== null) return c.goal;
  const M = BALANCE.match;
  const p = c.power ? clamp(c.base + (quality - 0.5) * M.powerSwing, 0.03, 0.97) : c.base;
  c.goal = c.roll < p;
  return c.goal;
}

function applyResult(row: LeagueRow, gf: number, ga: number): void {
  const P = BALANCE.match.points;
  row.p++;
  row.gf += gf;
  row.ga += ga;
  if (gf > ga) {
    row.w++;
    row.pts += P.win;
  } else if (gf === ga) {
    row.d++;
    row.pts += P.draw;
  } else {
    row.l++;
    row.pts += P.loss;
  }
}

/** Quick-sim score for two rival academies. */
function simScore(rng: Rng, a: number, b: number): [number, number] {
  const goals = (s: number, o: number): number => {
    let g = 0;
    const p = clamp(0.3 + (s - o) * 0.02, 0.08, 0.7);
    for (let i = 0; i < 4; i++) if (rng.chance(p)) g++;
    return g;
  };
  return [goals(a, b), goals(b, a)];
}

/**
 * Records a finished match: our score, the other fixtures of the round, rewards, MVP and season end.
 * Mutates `league` and squad players (apps, goals, MVP stat). Pure apart from the passed-in rng.
 */
export function finishMatch(rng: Rng, m: MatchScript, league: League, squad: Player[]): MatchResult {
  const M = BALANCE.match;
  for (const c of m.chances) resolveChance(c, 0.5);
  let ourGoals = 0;
  let theirGoals = 0;
  const scored = new Map<number, number>();
  for (const c of m.chances) {
    if (!c.goal) continue;
    if (c.side === 'us') {
      ourGoals++;
      const id = (m.lineup[c.shooter] as MatchPlayer).id;
      scored.set(id, (scored.get(id) ?? 0) + 1);
    } else theirGoals++;
  }
  const outcome: MatchOutcome = ourGoals > theirGoals ? 'win' : ourGoals === theirGoals ? 'draw' : 'loss';
  // table: our fixture + the other two of the round
  const opps = opponentsOf(league.division);
  const rowOf = (team: string): LeagueRow | undefined => league.table.find((r) => r.team === team);
  const us = rowOf('us');
  const them = rowOf(m.opponent.id);
  if (us) applyResult(us, ourGoals, theirGoals);
  if (them) applyResult(them, theirGoals, ourGoals);
  for (const [a, b] of pairings(league.round % 5).slice(1)) {
    const ta = opps[a - 1];
    const tb = opps[b - 1];
    if (!ta || !tb) continue;
    const [ga, gb] = simScore(rng, ta.strength, tb.strength);
    const ra = rowOf(ta.id);
    const rb = rowOf(tb.id);
    if (ra) applyResult(ra, ga, gb);
    if (rb) applyResult(rb, gb, ga);
  }
  league.round++;
  // squad bookkeeping + MVP
  let mvp: MatchPlayer | null = null;
  let best = -1;
  for (const p of m.lineup) {
    const sc = (scored.get(p.id) ?? 0) * 100 + p.ovr + (p.sub ? -50 : 0);
    if (sc > best) {
      best = sc;
      mvp = p;
    }
  }
  let mvpStat: Stat | null = null;
  for (const p of squad) {
    if (!m.lineup.some((l) => l.id === p.id)) continue;
    p.apps++;
    p.goals += scored.get(p.id) ?? 0;
    if (mvp && p.id === mvp.id) {
      // MVP improves their weakest uncapped stat
      let pick: Stat | null = null;
      for (const s of STATS) if (p.stats[s] < p.cap && (pick === null || p.stats[s] < p.stats[pick])) pick = s;
      if (pick) {
        p.stats[pick] = Math.min(p.cap, p.stats[pick] + M.mvpStatGain);
        mvpStat = pick;
      }
    }
  }
  const rank = sortedTable(league).findIndex((r) => r.team === 'us') + 1;
  const seasonOver = league.round >= 5;
  const top = DIVISIONS.length - 1;
  const promoted = seasonOver && rank === 1 && league.division < top;
  const champion = seasonOver && rank === 1;
  const mult = M.divisionMult[league.division] ?? 1;
  return {
    ourGoals,
    theirGoals,
    outcome,
    cash: Math.round(M.reward[outcome] * mult),
    points: M.points[outcome],
    xp: M.xp[outcome],
    mvp,
    mvpStat,
    rank,
    seasonOver,
    promoted,
    champion,
  };
}
