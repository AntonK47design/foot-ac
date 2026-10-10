import type { Position, Rarity, Stat, Supply } from '../data/types';

export interface Pile {
  id: string;
  x: number;
  z: number;
  amount: number;
}

export interface PadState {
  paid: number;
  done: boolean;
}

export interface StationState {
  lanes: number;
  balls: number;
  /** Trainee id per lane, or 0 when free. */
  occupants: number[];
  queue: number[];
}

/** Anything that walks along nav paths. */
export interface Agent {
  x: number;
  z: number;
  px: number;
  pz: number;
  yaw: number;
  /** Current movement goal (null = standing). Paths are transient and recomputed on load. */
  goal: { x: number; z: number } | null;
  path: number[];
  pathI: number;
  stuckT: number;
  bestD: number;
  moving: boolean;
}

export type TraineeState =
  | 'arriving'
  | 'seated'
  | 'toDesk'
  | 'atDesk'
  | 'toLocker'
  | 'changing'
  | 'queued'
  | 'toLane'
  | 'training'
  | 'toPodium'
  | 'atPodium'
  | 'leaving';

export interface TraineeLook {
  skin: number;
  hair: number;
  hairColor: number;
  face: number;
}

export interface Trainee extends Agent {
  id: number;
  name: string;
  age: number;
  position: Position;
  rarity: Rarity;
  female: boolean;
  look: TraineeLook;
  stats: Record<Stat, number>;
  startOvr: number;
  gradOvr: number;
  cap: number;
  state: TraineeState;
  /** Reception seat index while waiting; changing-room seat index while toLocker/changing; else -1. */
  seat: number;
  arrivalOrder: number;
  stationId: string | null;
  lastStationId: string | null;
  lane: number;
  repT: number;
  repActive: boolean;
  reps: number;
  totalReps: number;
  waitT: number;
  /** Found by a scout (or the day-7 reward): shown with a star. */
  scouted?: boolean;
}

/** A promoted graduate in the Academy Squad (M2). */
export interface Player {
  id: number;
  name: string;
  age: number;
  position: Position;
  rarity: Rarity;
  female: boolean;
  look: TraineeLook;
  stats: Record<Stat, number>;
  cap: number;
  apps: number;
  goals: number;
}

export interface LeagueRow {
  /** Team id from data/clubs.ts, or 'us'. */
  team: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

export interface League {
  /** 0 = bottom division. */
  division: number;
  season: number;
  /** Rounds played this season (a season is one round-robin: 5 rounds). */
  round: number;
  table: LeagueRow[];
}

export interface Records {
  bestSale: number;
  sold: number;
  promoted: number;
  matches: number;
  wins: number;
  goals: number;
  titles: number;
}

/** ball_boy walks crate → baskets; the others work from a fixed spot (desk, drill side, office safe). */
export type QuestKind = 'sign' | 'reps' | 'win' | 'sell' | 'upgrade' | 'graduate' | 'collect';

export interface Quest {
  id: string;
  kind: QuestKind;
  target: number;
  progress: number;
  cash: number;
  tickets: number;
  claimed: boolean;
}

export type ScoutTier = 'local' | 'regional' | 'global';

/** A scouted player waiting to arrive on the next bus. */
export interface Prospect {
  rarity: Rarity;
  position: Position;
}

/** Retention / meta state (M4). Wall-clock times are epoch ms; days are local YYYY-MM-DD keys. */
export interface MetaState {
  daily: { claims: number; lastDay: string };
  quests: { day: string; list: Quest[] };
  scout: { tier: ScoutTier | null; startedAt: number; endsAt: number };
  cupDay: string;
  album: Record<string, number>;
  albumClaimed: number;
  /** Recent income ($/s, EMA) for offline earnings. */
  incomeRate: number;
  /** Rewarded-ad use per local day (daily caps / diminishing returns) and the Office cash-ad cooldown. */
  ads: { day: string; used: Record<string, number>; officeAt: number };
}

export type StaffKind = 'ball_boy' | 'water_carrier' | 'receptionist' | 'assistant' | 'accountant';
export type StaffState = 'idle' | 'toCrate' | 'loading' | 'toBasket' | 'unloading';

export interface Staff extends Agent {
  id: string;
  kind: StaffKind;
  state: StaffState;
  carry: number;
  target: string | null;
  timer: number;
}

export interface Coach {
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  yaw: number;
  carry: number;
  /** What the carry stack is (balls or water bottles); absent in old saves = balls. */
  carryKind?: Supply;
  pickT: number;
  dropT: number;
  padId: string | null;
  padT: number;
  deskT: number;
  moved: number;
}

export interface Bus {
  phase: 'away' | 'arriving' | 'stopped' | 'leaving';
  /** Position along the road (z). */
  z: number;
  pz: number;
  /** Seconds until the next arrival may start. */
  timer: number;
  t: number;
  /** Trainees still to drop at this stop. */
  toDrop: number;
}

export interface SimStats {
  signed: number;
  reps: number;
  graduated: number;
  unlocks: number;
  ballsDelivered: number;
  cashCollected: number;
}

export interface SimState {
  v: number;
  time: number;
  cash: number;
  earned: number;
  xp: number;
  level: number;
  stars: number;
  coach: Coach;
  pads: Record<string, PadState>;
  built: Record<string, boolean>;
  stations: Record<string, StationState>;
  piles: Pile[];
  trainees: Trainee[];
  staff: Staff[];
  /** Trainee id per seat (0 = free). */
  seats: number[];
  bus: Bus;
  nextId: number;
  arrivalCounter: number;
  rng: number;
  flags: Record<string, boolean>;
  stats: SimStats;
  /** Graduates waiting at the podium, first = on the podium. */
  podiumQueue: number[];
  squad: Player[];
  league: League;
  /** Sim time when the next match becomes available. */
  matchNextAt: number;
  records: Records;
  /** Manager's Office upgrade levels by id (data/upgrades.ts). */
  upgrades: Record<string, number>;
  /** Scout Tickets (M4 currency). */
  tickets: number;
  prospects: Prospect[];
  meta: MetaState;
}

export function makeAgent(x: number, z: number): Agent {
  return { x, z, px: x, pz: z, yaw: 0, goal: null, path: [], pathI: 0, stuckT: 0, bestD: Infinity, moving: false };
}
