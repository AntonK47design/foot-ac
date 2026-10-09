import { BALANCE } from '../data/balance';
import { FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES } from '../data/names';
import { STATS, type Position, type Rarity, type Stat } from '../data/types';
import type { Rng } from '../core/rng';
import { makeAgent, type Trainee } from './state';

export const LOOK_COUNTS = { skin: 6, hair: 5, hairColor: 6, face: 8 };

export function computeOvr(position: Position, stats: Record<Stat, number>): number {
  const w = BALANCE.ovrWeights[position];
  let s = 0;
  for (const k of STATS) s += stats[k] * w[k];
  return Math.round(s);
}

export function rollRarity(rng: Rng, bonus = 0): Rarity {
  const w = { ...BALANCE.rarity.weights };
  // scouting bonus moves weight from common to the rarer tiers
  if (bonus > 0) {
    const moved = Math.min(w.common - 10, bonus);
    w.common -= moved;
    w.rare += moved * 0.6;
    w.epic += moved * 0.3;
    w.wonderkid += moved * 0.1;
  }
  return rng.weighted(w);
}

export interface TraineeOptions {
  name?: string;
  rarity?: Rarity;
  position?: Position;
  female?: boolean;
}

export function createTrainee(rng: Rng, id: number, x: number, z: number, opts: TraineeOptions = {}): Trainee {
  const rarity = opts.rarity ?? rollRarity(rng);
  const position = opts.position ?? rng.weighted(BALANCE.positionWeights);
  const female = opts.female ?? rng.chance(0.5);
  const first = opts.name ?? rng.pick(female ? FIRST_NAMES_F : FIRST_NAMES_M);
  const last = rng.pick(LAST_NAMES);
  const [lo, hi] = BALANCE.rarity.statRange[rarity];
  const stats = { PAC: 0, SHO: 0, PAS: 0, DRI: 0 } as Record<Stat, number>;
  for (const k of STATS) stats[k] = rng.int(lo, hi);
  // position flavour: best stat a little higher
  const fav: Record<Position, Stat> = { GK: 'PAS', DF: 'PAC', MF: 'PAS', FW: 'SHO' };
  stats[fav[position]] = Math.min(hi + 4, stats[fav[position]] + 4);
  const ovr = computeOvr(position, stats);
  const cap = BALANCE.rarity.cap[rarity];
  return {
    ...makeAgent(x, z),
    id,
    name: `${first} ${last}`,
    age: rng.int(12, 17),
    position,
    rarity,
    female,
    look: {
      skin: rng.int(0, LOOK_COUNTS.skin - 1),
      hair: rng.int(0, LOOK_COUNTS.hair - 1),
      hairColor: rng.int(0, LOOK_COUNTS.hairColor - 1),
      face: rng.int(0, LOOK_COUNTS.face - 1),
    },
    stats,
    startOvr: ovr,
    gradOvr: Math.min(cap, ovr + BALANCE.trainee.gradOvrGain),
    cap,
    state: 'arriving',
    seat: -1,
    arrivalOrder: 0,
    stationId: null,
    lastStationId: null,
    lane: -1,
    repT: 0,
    repActive: false,
    reps: 0,
    totalReps: 0,
    waitT: 0,
  };
}

export function firstName(t: Trainee): string {
  return t.name.split(' ')[0] ?? t.name;
}
