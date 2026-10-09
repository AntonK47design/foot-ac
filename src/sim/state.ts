import type { Position, Rarity, Stat } from '../data/types';

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
  | 'queued'
  | 'toLane'
  | 'training'
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
}

export type StaffKind = 'ball_boy';
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
}

export function makeAgent(x: number, z: number): Agent {
  return { x, z, px: x, pz: z, yaw: 0, goal: null, path: [], pathI: 0, stuckT: 0, bestD: Infinity, moving: false };
}
