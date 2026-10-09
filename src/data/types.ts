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

export type StationKind = 'shoot' | 'dribble' | 'pass' | 'sprint';

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
  stat: Stat;
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

export type ObjectKind = 'crate' | 'desk' | 'chairs' | 'decor' | 'shelter';

export interface ObjectDef {
  id: string;
  kind: ObjectKind;
  area: number;
  pos: V2;
  rot: Rot;
  footprint: Rect[];
  /** decor variant for the view */
  variant?: string;
  /** For chairs: seat positions (world). */
  seats?: V2[];
}

export type Unlock =
  | { type: 'station'; id: string }
  | { type: 'lane'; station: string }
  | { type: 'object'; id: string }
  | { type: 'staff'; id: string };

export type IconId = 'ball' | 'goal' | 'cones' | 'wall' | 'track' | 'chair' | 'staff' | 'bench' | 'flag' | 'shelter' | 'cooler' | 'lane';

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
  stations: StationDef[];
  objects: ObjectDef[];
  pads: PadDef[];
  starterPiles: StarterPile[];
  /** Ambient kids passing a ball (view only). */
  ambientKids: V2[];
}
