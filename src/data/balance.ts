import type { Position, Rarity, StationKind, Stat, Supply } from './types';

/** All gameplay tunables. Systems must not contain magic numbers. */
export const BALANCE = {
  coach: {
    speed: 6.8,
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
    interval: 13,
    driveIn: 2.0,
    dwell: 1.2,
    driveOut: 2.0,
    maxPerTrip: 2,
    /** Arrival interval multiplier when the bus shelter is built. */
    shelterIntervalMult: 0.7,
  },
  trainee: {
    speed: 4.0,
    radius: 0.3,
    repsPerVisit: 3,
    /** OVR points gained before graduating (area 1). */
    gradOvrGain: 4,
    /** …once the Training Ground is open (more drills → longer, richer careers). */
    gradOvrGainArea2: 7,
    /** …once the Youth Stadium is open. */
    gradOvrGainArea3: 9,
    /** Station choice: extra score per metre of walking (keeps trainees near their drills). */
    distWeight: 0.12,
    maxQueue: 1,
    moodWaitSec: 18,
    /** Seconds without progress before the stuck watchdog teleports an NPC. */
    stuckSec: 3,
    /** Seconds on the changing-room bench putting on the academy kit after signing. */
    changeTime: 1.6,
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
  /** `ballsPerRep` / `basketCap` count the station's supply (balls in Sunday Park, water bottles in the Training Ground). */
  stations: {
    shoot: { repTime: 2.4, cashPerRep: 6, statGain: 1, ballsPerRep: 1, basketCap: 8, supply: 'ball' },
    dribble: { repTime: 3.0, cashPerRep: 7, statGain: 1, ballsPerRep: 1, basketCap: 8, supply: 'ball' },
    pass: { repTime: 2.6, cashPerRep: 8, statGain: 1, ballsPerRep: 1, basketCap: 8, supply: 'ball' },
    sprint: { repTime: 3.2, cashPerRep: 9, statGain: 1, ballsPerRep: 0, basketCap: 0, supply: null },
    gym: { repTime: 3.0, cashPerRep: 18, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'water' },
    rondo: { repTime: 2.8, cashPerRep: 20, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'water' },
    freekick: { repTime: 2.6, cashPerRep: 22, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'water' },
    agility: { repTime: 3.4, cashPerRep: 25, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'water' },
    skills: { repTime: 3.0, cashPerRep: 27, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'water' },
    // Youth Stadium drills: fed with training bibs from the Kit Room
    crossing: { repTime: 2.8, cashPerRep: 40, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'bib' },
    heading: { repTime: 2.6, cashPerRep: 44, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'bib' },
    juggling: { repTime: 3.0, cashPerRep: 48, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'bib' },
    reaction: { repTime: 3.2, cashPerRep: 54, statGain: 1, ballsPerRep: 1, basketCap: 6, supply: 'bib' },
  } as Record<StationKind, { repTime: number; cashPerRep: number; statGain: number; ballsPerRep: number; basketCap: number; supply: Supply | null }>,
  staff: {
    ballBoy: { speed: 3.8, carryCap: 6, refillBelow: 0.75 },
    /** Water Carriers and Kit Managers work like ball boys (same speed/carry upgrades) between their source and the drills. */
    /** Receptionist signs on their own at this multiple of the coach's sign time. */
    receptionist: { signTimeMult: 1.6 },
    /** An Assistant Coach at a drill: rep time multiplier. */
    assistant: { repTimeMult: 0.8 },
    /** Accountant moves this much cash per second from every pile into the office safe. */
    accountant: { ratePerSec: 12, minPile: 2 },
  },
  /** Graduation podium and transfers (M2). Value = base × (OVR / ovrRef)^exp × rarity, rounded to 5. */
  transfer: {
    base: 55,
    ovrRef: 45,
    exp: 2.2,
    rarityMult: { common: 1, rare: 1.4, epic: 2, wonderkid: 3.5 } as Record<Rarity, number>,
    /** Coach stands here to open the podium choice. */
    zoneRadius: 1.2,
    /** Standing at the office computer after closing it with a graduate waiting re-opens it after this long (s). */
    reopenSec: 4,
    /** Sold squad players (released from the squad panel) fetch this share of their value. */
    releaseShare: 1,
  },
  squad: {
    size: 5,
    /** With the Training Ground's 7-a-side pitch: squad size and match cash multiplier. */
    sizeSeven: 7,
    sevenCashMult: 1.5,
    /** With the Youth Stadium: 11-a-side and its match cash multiplier (replaces the 7-a-side one). */
    sizeEleven: 11,
    stadiumCashMult: 2.5,
    /** Line-up gaps are filled with academy subs of this OVR. */
    subOvr: 32,
  },
  match: {
    /** Seconds between matches (the first is available as soon as the pitch is built). */
    interval: 180,
    chances: [3, 5] as [number, number],
    powerShotsMax: 2,
    /** Goal probability = base + (attack − defence) × perOvr, clamped. */
    goalBase: 0.38,
    goalPerOvr: 0.012,
    goalMin: 0.1,
    goalMax: 0.78,
    /** Power Shot: probability shifts by (quality − 0.5) × swing. */
    powerSwing: 0.9,
    /** Share of chances that are ours: s^k / (s^k + o^k). */
    shareExp: 2,
    shareMin: 0.25,
    shareMax: 0.8,
    reward: { win: 120, draw: 50, loss: 20 },
    /** Cash multiplier per division (index 0 = bottom). */
    divisionMult: [1, 1.6, 2.4, 3.4, 4.8],
    points: { win: 3, draw: 1, loss: 0 },
    xp: { win: 20, draw: 10, loss: 5 },
    mvpStatGain: 1,
    kickoffRadius: 1.2,
    /** Power Shot meter: green zone width (0..1 of the bar), needle sweeps per second, seconds before an auto-shot. */
    powerZone: 0.18,
    powerSpeed: 1.1,
    powerTimeout: 3.5,
  },
  /** Rewarded / midgame ads (GDD §7). Only active with VITE_ADS=on. */
  ads: {
    /** Daily caps per rewarded placement. Cash ads (welcome-back ×2, Office "Get $X", match ×2) are uncapped: they're the revenue placements. */
    caps: { welcome: Infinity, daily: 1, office: Infinity, results: Infinity, scout: 3 } as Record<string, number>,
    /** Office "Get $X": share of the cheapest item the player can't afford, shrinking per use today. */
    officeShare: 0.35,
    officeDecay: 0.15,
    officeMinMult: 0.5,
    /** Seconds between Office cash ads (0 = offered again right away). */
    officeCooldownSec: 0,
    /** Scout "finish now" only for missions up to this long. */
    scoutMaxSec: 1800,
    /** No midgame before this much cumulative play. */
    midgameMinPlaySec: 300,
  },
  /** M4 meta / retention systems (GDD §4.8–4.9, §5.3). */
  meta: {
    /** Academy level at which each feature unlocks. */
    unlockLevel: { daily: 2, quests: 4, scout: 5, cup: 6, album: 7 },
    /** Level-up chest: a Scout Ticket every level; cash = perLevel × level from `cashFromLevel` (keeps the opening pace). */
    chest: { cashPerLevel: 30, cashFromLevel: 4, ticketsFromLevel: 2 },
    /** 7-day calendar (cash is scaled by 1 + levelScale × (level − 1)); day 7: a guaranteed Epic prospect. */
    daily: [
      { cash: 300 },
      { tickets: 1 },
      { cash: 600 },
      { tickets: 2 },
      { cash: 1000 },
      { tickets: 3 },
      { prospect: 'epic' as Rarity, tickets: 5 },
    ] as Array<{ cash?: number; tickets?: number; prospect?: Rarity }>,
    dailyLevelScale: 0.5,
    /** Quest cash ≈ 15–25 s of income at the level (tickets are the real prize); targets/cash scale with level. */
    quests: {
      perDay: 3,
      levelScale: 0.4,
      pool: [
        { kind: 'sign', target: 10, cash: 200, tickets: 1 },
        { kind: 'reps', target: 120, cash: 250, tickets: 0 },
        { kind: 'win', target: 2, cash: 300, tickets: 1 },
        { kind: 'sell', target: 3, cash: 300, tickets: 1 },
        { kind: 'upgrade', target: 2, cash: 250, tickets: 1 },
        { kind: 'graduate', target: 4, cash: 250, tickets: 1 },
        { kind: 'collect', target: 3000, cash: 200, tickets: 1 },
      ] as Array<{ kind: 'sign' | 'reps' | 'win' | 'sell' | 'upgrade' | 'graduate' | 'collect'; target: number; cash: number; tickets: number }>,
    },
    /** Scout missions: duration (s), cost, and the rarity floor of the prospect found. */
    scout: {
      local: { sec: 300, cash: 400, tickets: 0, floor: 'common' as Rarity, wonderkid: 0.01 },
      regional: { sec: 1800, cash: 0, tickets: 1, floor: 'rare' as Rarity, wonderkid: 0.03 },
      global: { sec: 8 * 3600, cash: 0, tickets: 2, floor: 'epic' as Rarity, wonderkid: 0.15 },
    },
    /** Daily Cup: once per calendar day; opponent strength = division top + bonus; reward multipliers. */
    cup: { strengthBonus: 6, cashMult: 5, tickets: 3 },
    /** Hall of Fame milestones (distinct position × rarity slots) and rewards. */
    album: [
      { slots: 4, cash: 500, tickets: 2 },
      { slots: 8, cash: 1500, tickets: 4 },
      { slots: 12, cash: 4000, tickets: 6 },
      { slots: 16, cash: 10000, tickets: 10 },
    ],
    /** Offline earnings: share of the recent income rate, base cap (s); the Office upgrade adds hours. */
    offline: { share: 0.03, baseCapSec: 3600, perLevelSec: 3600, minSec: 180 },
    /** Income-rate EMA time constant (s) for offline earnings. */
    incomeTau: 60,
  },
  /** Effects of decor objects once built (multipliers, stack multiplicatively). */
  perks: {
    flags: { feeMult: 1.2 },
    water_cooler: { repTimeMult: 0.8 },
    bench: { transferMult: 1.25 },
    physio: { repTimeMult: 0.85 },
  } as Record<string, { feeMult?: number; repTimeMult?: number; transferMult?: number }>,
  /** Youth Stadium (Area 3) facilities. */
  area3: {
    /** Tactics Room: every stat of a graduate gets this bonus (OVR bonus for sales and the squad). */
    tacticsStatBonus: 2,
    /** Analysis Lab: added to our line-up strength in matches. */
    analysisStrength: 4,
    /** Fan Shop: takings per second on its pile; ×(1 + per stand built) and ×(1 + per Fan Shop upgrade level). */
    shopCashPerSec: 6,
    shopPerStand: 0.5,
    /** Match cash: each stand and the floodlights add to the stadium multiplier. */
    standCashMult: 0.3,
    lightsCashMult: 0.2,
  },
  /** Cumulative XP needed to reach level index+1 (level 1 = 0 XP). */
  levelXp: [
    0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500, 3400, 4500, 5800, 7300, 9000, 11000, 13300, 16000, 19000, 22500, 26500, 31000, 36000, 41500, 47500,
  ],
  xp: { perGraduation: 15, perSign: 2, perUpgrade: 6 },
  objectives: {
    /** Re-evaluate objective this often (s). */
    interval: 0.25,
    /** Don't send the player to collect piles smaller than this unless nothing else to do. */
    minPileWorth: 8,
    /** Point at an office upgrade only if it costs at most this share of the next pad. */
    upgradeShare: 0.5,
    /** …or this share when the next pad is an area gate (a long save: upgrades fill the wait). */
    upgradeShareGate: 0.6,
    /** After the tutorial route the guide hides; it comes back when the coach stands still this long (s)… */
    lostIdleSec: 8,
    /** …or nothing was bought / signed / delivered / collected for this long (s). */
    lostNoProgressSec: 20,
    /** While shown that way, the suggestion is re-picked at most this often (no flip-flopping). */
    lostRefreshSec: 8,
  },
  camera: {
    /** Visible world width (m) at the focus point at the base view: portrait → landscape. */
    widthPortrait: 11,
    widthLandscape: 21,
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
