export interface V2 {
  x: number;
  z: number;
}

/** Axis-aligned rectangle in local or world space. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 0 = forward faces north (-z), 1 = west (-x), 2 = south (+z), 3 = east (+x). */
export type Rot = 0 | 1 | 2 | 3;

export type Stat = 'PAC' | 'SHO' | 'PAS' | 'DRI';
export const STATS: readonly Stat[] = ['PAC', 'SHO', 'PAS', 'DRI'];
export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export type Rarity = 'common' | 'rare' | 'epic' | 'wonderkid';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'wonderkid'];

export type StationKind = 'shoot' | 'dribble' | 'pass' | 'sprint' | 'gym' | 'rondo' | 'freekick' | 'agility' | 'skills';
/** What a station's basket holds (Area 1 drills: balls; Training Ground drills: water bottles). */
export type Supply = 'ball' | 'water';

export interface LaneDef {
  /** Where the trainee stands to start a rep (local). */
  spot: V2;
  /** Where the ball/run goes (local). */
  target: V2;
  /** Obstacles that exist while this lane is built (local). */
  footprint?: Rect[];
}

export interface StationDef {
  id: string;
  kind: StationKind;
  /** Trained stat; 'ALL' (gym) raises the trainee's weakest stat each rep. */
  stat: Stat | 'ALL';
  area: number;
  center: V2;
  rot: Rot;
  lanes: LaneDef[];
  basket?: V2;
  pile: V2;
  queueStart: V2;
  queueStep: V2;
  footprint: Rect[];
}

export type ObjectKind = 'crate' | 'desk' | 'chairs' | 'decor' | 'shelter' | 'pitch' | 'gate' | 'water' | 'room';

export interface ObjectDef {
  id: string;
  kind: ObjectKind;
  area: number;
  pos: V2;
  rot: Rot;
  footprint: Rect[];
  /** decor variant for the view */
  variant?: string;
  /** For benches: seat positions (world). */
  seats?: V2[];
  /** Sim yaw for seated trainees (see sim/geom yawFor). */
  seatYaw?: number;
}

export type Unlock =
  | { type: 'station'; id: string }
  | { type: 'lane'; station: string }
  | { type: 'object'; id: string }
  | { type: 'staff'; id: string };

export type IconId =
  | 'ball'
  | 'goal'
  | 'cones'
  | 'wall'
  | 'track'
  | 'chair'
  | 'staff'
  | 'bench'
  | 'flag'
  | 'shelter'
  | 'cooler'
  | 'lane'
  | 'pitch'
  | 'podium'
  | 'whistle'
  | 'sign'
  | 'cash'
  | 'gate'
  | 'water'
  | 'gym'
  | 'rondo'
  | 'freekick'
  | 'agility'
  | 'skills'
  | 'physio';

export interface PadDef {
  id: string;
  area: number;
  pos: V2;
  cost: number;
  stars: number;
  xp: number;
  requires: string[];
  unlock: Unlock;
  icon: IconId;
  /** i18n key of the thing unlocked (pad label / objective). */
  nameKey: string;
  /** Camera pans to it on unlock. */
  major?: boolean;
}

export interface StarterPile {
  id: string;
  pos: V2;
  amount: number;
}

export interface AreaDef {
  id: number;
  nameKey: string;
  bounds: Rect;
  /** Walkable bounds for NPC navigation (may include the gate/road strip). */
  navBounds: Rect;
  spawn: V2;
  gate: { busStop: V2; door: V2; inside: V2; exit: V2 };
  desk: { coachSpot: V2; traineeSpot: V2; pile: V2 };
  crate: { spot: V2 };
  /** Training Ground Hydration Point: where water bottles are picked up. */
  water: { objectId: string; spot: V2 };
  /**
   * Area 2 "Training Ground": a second plot south of Area 1, opened by the gate pad. Until then `lockedObstacles`
   * (construction fence) keep everyone out; afterwards the coach may roam `bounds` (both plots).
   */
  expansion: { gateObjectId: string; plot: Rect; bounds: Rect; lockedObstacles: Rect[] };
  stations: StationDef[];
  objects: ObjectDef[];
  pads: PadDef[];
  starterPiles: StarterPile[];
  /** Changing-room bench seats where signed trainees put on the academy kit. */
  lockers: { seats: V2[]; yaw: number };
  /**
   * Manager's Office: graduates wait on the bench `seats` (first = next up); the coach decides at the `computer`.
   * (Sim names keep "podium" for save compatibility.)
   */
  office: { computer: V2; seats: V2[]; seatYaw: number };
  /**
   * Matches are played away at the stadium (a separate island reached by the team bus). `objectId` unlocks the
   * Team Bus stop; the coach boards at `kickoff`; `rect` is the stadium pitch (world coords, far from the academy).
   */
  matchPitch: {
    objectId: string;
    rect: Rect;
    kickoff: V2;
    goalW: number;
    /** Where the team bus parks on the academy street (faces +z). */
    busPark: V2;
    stadium: { plot: Rect; road: Rect; busStop: V2 };
  };
  /** Where fixed-spot staff work (receptionist, 'assistant:<station>', accountant), facing `yaw`. */
  staffSpots: Record<string, V2 & { yaw: number }>;
  /** Office safe: the accountant gathers every cash pile here. */
  safe: V2;
  /** Static obstacles (walls, fences, fixed furniture) — always present. */
  obstacles: Rect[];
  /** Walkable rects for NPC navigation (plot + street corridor to the bus). */
  walkable: Rect[];
}
