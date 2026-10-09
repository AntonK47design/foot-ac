import type { Position, Rarity, StationKind, Stat } from './types';

/** All gameplay tunables. Systems must not contain magic numbers. */
export const BALANCE = {
  coach: {
    speed: 6.0,
    accel: 50,
    radius: 0.35,
    carryCap: 5,
    pickupInterval: 0.1,
    dropInterval: 0.07,
  },
  cash: {
    collectRadius: 1.3,
    /** Seconds after a pile is emptied before it can be emptied again (avoid jitter). */
  },
  pad: {
    radius: 1.05,
    /** Standing time before cash starts draining (avoids accidental spends while passing). */
    startDelay: 0.12,
    minDuration: 0.6,
    maxDuration: 1.5,
    durationPerCash: 1 / 120,
  },
  desk: {
    zoneRadius: 1.35,
    signTime: 1.5,
    signFee: 6,
  },
  crate: { zoneRadius: 1.4 },
  basket: { zoneRadius: 1.35 },
  bus: {
    firstDelay: 0.6,
    interval: 9,
    driveIn: 2.0,
    dwell: 1.2,
    driveOut: 2.0,
    maxPerTrip: 2,
    /** Arrival interval multiplier when the bus shelter is built. */
    shelterIntervalMult: 0.7,
  },
  trainee: {
    speed: 3.5,
    radius: 0.3,
    repsPerVisit: 3,
    /** OVR points gained before graduating (area 1). */
    gradOvrGain: 4,
    maxQueue: 3,
    moodWaitSec: 18,
    /** Seconds without progress before the stuck watchdog teleports an NPC. */
    stuckSec: 3,
    graduationBonus: 30,
    initialChairs: 3,
  },
  rarity: {
    weights: { common: 70, rare: 22, epic: 7, wonderkid: 1 } as Record<Rarity, number>,
    statRange: {
      common: [28, 42],
      rare: [38, 52],
      epic: [48, 62],
      wonderkid: [58, 72],
    } as Record<Rarity, [number, number]>,
    cap: { common: 65, rare: 75, epic: 85, wonderkid: 95 } as Record<Rarity, number>,
    /** Training-fee multiplier. */
    cashMult: { common: 1, rare: 1.25, epic: 1.6, wonderkid: 2.5 } as Record<Rarity, number>,
  },
  /** Position weights for OVR (PAC, SHO, PAS, DRI). */
  ovrWeights: {
    GK: { PAC: 0.3, SHO: 0.1, PAS: 0.4, DRI: 0.2 },
    DF: { PAC: 0.35, SHO: 0.1, PAS: 0.35, DRI: 0.2 },
    MF: { PAC: 0.2, SHO: 0.2, PAS: 0.35, DRI: 0.25 },
    FW: { PAC: 0.25, SHO: 0.4, PAS: 0.1, DRI: 0.25 },
  } as Record<Position, Record<Stat, number>>,
  positionWeights: { GK: 10, DF: 30, MF: 30, FW: 30 } as Record<Position, number>,
  stations: {
    shoot: { repTime: 2.4, cashPerRep: 6, statGain: 1, ballsPerRep: 1, basketCap: 8 },
    dribble: { repTime: 3.0, cashPerRep: 7, statGain: 1, ballsPerRep: 1, basketCap: 8 },
    pass: { repTime: 2.6, cashPerRep: 8, statGain: 1, ballsPerRep: 1, basketCap: 8 },
    sprint: { repTime: 3.2, cashPerRep: 9, statGain: 1, ballsPerRep: 0, basketCap: 0 },
  } as Record<StationKind, { repTime: number; cashPerRep: number; statGain: number; ballsPerRep: number; basketCap: number }>,
  staff: {
    ballBoy: { speed: 3.3, carryCap: 6, refillBelow: 0.75 },
  },
  /** Cumulative XP needed to reach level index+1 (level 1 = 0 XP). */
  levelXp: [0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500, 3400],
  xp: { perGraduation: 15, perSign: 2 },
  objectives: {
    /** Re-evaluate objective this often (s). */
    interval: 0.25,
    /** Don't send the player to collect piles smaller than this unless nothing else to do. */
    minPileWorth: 8,
  },
  camera: {
    /** Half-extent (m) of the ground area kept visible around the coach, at start. */
    baseView: 10.5,
    /** Extra view per star collected (zoom out as the academy grows). */
    viewPerStar: 0.08,
    maxView: 14,
  },
  tutorial: {
    firstTraineeName: 'Leo',
  },
};

export type Balance = typeof BALANCE;
