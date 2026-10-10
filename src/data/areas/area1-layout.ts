import type { Rect, V2 } from '../types';

/**
 * Area 1 "Sunday Park" diorama (ART_BIBLE §3). World metres, +x east, +z south (towards the camera).
 * Zones are shared by the view (floors, walls) and gameplay (positions, obstacles).
 */
export interface Room {
  id: string;
  rect: Rect;
  floor: 'tilesTeal' | 'rubberBlue' | 'wood';
  /** Doorway gap in the front (south) stub wall, x range. */
  door: [number, number];
  /** Doorway in the east wall, z range (shared walls). */
  eastDoor?: [number, number];
  /** Full-height west wall (rooms that don't share it). */
  westWall?: boolean;
  /** Wall height (m); low walls for rooms with traffic behind them. */
  wallH?: number;
}

export interface Layout {
  plot: Rect;
  rooms: Room[];
  pitch: Rect;
  /** Fence gate gaps on the pitch's south side, x ranges. */
  pitchGates: Array<[number, number]>;
  shootingLane: Rect;
  dribbleStrip: Rect;
  passDeck: Rect;
  sprintTrack: Rect;
  ghosts: Array<{ id: string; rect: Rect; label: string; price: number }>;
  busStop: V2;
  gate: V2;
  coachSpawn: V2;
  /** Area 2 "Training Ground" (south plot): zone floors and the gate gap in the Sunday Park curb. */
  area2: {
    plot: Rect;
    gateGap: [number, number];
    gym: Rect;
    rondo: { x: number; z: number; r: number };
    freekick: Rect;
    agility: Rect;
    skills: Rect;
    physio: Rect;
    seven: Rect;
    /** Main walkway from the gate down the east side. */
    path: Rect;
  };
  /** Area 3 "Youth Stadium" (third plot, west of Sunday Park; its gate is beside the Manager's Office). */
  area3: {
    plot: Rect;
    /** Gate gap in the shared border with Sunday Park (the plot's east edge, x = plot.x1): a z range. */
    gateGap: [number, number];
    path: Rect;
    kitRoom: Rect;
    crossing: Rect;
    heading: Rect;
    juggling: { x: number; z: number; r: number };
    reaction: Rect;
    tactics: Rect;
    tacticsDoor: [number, number];
    analysis: Rect;
    analysisDoor: [number, number];
    /** Fan Shop kiosk (serving hatch faces south, towards the camera) and where its takings pile up. */
    shop: Rect;
    shopPile: V2;
    /** 11-a-side pitch, the stands around it and the four floodlight masts. */
    stadium: Rect;
    standMain: Rect;
    standWest: Rect;
    standEast: Rect;
    lights: V2[];
  };
}

/**
 * Area 3 is designed in its own frame (a 34 × 36 m plot at x −17…17, z 40…76, walkway down the east side) and placed
 * west of Sunday Park by a fixed offset, so the walk from the office to the gate is a few metres.
 */
export const AREA3_OFFSET = { x: -34, z: -52 };
const sx = (x: number): number => x + AREA3_OFFSET.x;
const sz = (z: number): number => z + AREA3_OFFSET.z;
const sr = (r: Rect): Rect => ({ x0: sx(r.x0), z0: sz(r.z0), x1: sx(r.x1), z1: sz(r.z1) });
const sv = (v: V2): V2 => ({ x: sx(v.x), z: sz(v.z) });

function placeArea3(): Layout['area3'] {
  return {
    plot: sr({ x0: -17, z0: 40, x1: 17, z1: 76 }),
    gateGap: [-1.2, 1.8],
    path: sr({ x0: 12.6, z0: 40.4, x1: 16.4, z1: 60.2 }),
    kitRoom: sr({ x0: 7.9, z0: 40.6, x1: 12.3, z1: 44.2 }),
    crossing: sr({ x0: -16.4, z0: 40.8, x1: -8.8, z1: 50.2 }),
    heading: sr({ x0: -7.6, z0: 40.8, x1: -1.4, z1: 48.4 }),
    juggling: { ...sv({ x: 2.6, z: 45.0 }), r: 3.0 },
    reaction: sr({ x0: -16.4, z0: 52.0, x1: -6.8, z1: 58.8 }),
    tactics: sr({ x0: -4.6, z0: 51.6, x1: 1.8, z1: 58.6 }),
    tacticsDoor: [sx(-2.2), sx(-0.6)],
    analysis: sr({ x0: 1.8, z0: 51.6, x1: 8.2, z1: 58.6 }),
    analysisDoor: [sx(4.2), sx(5.8)],
    shop: sr({ x0: 9.0, z0: 52.0, x1: 12.4, z1: 55.4 }),
    shopPile: sv({ x: 10.7, z: 57.0 }),
    stadium: sr({ x0: -11.0, z0: 63.6, x1: 11.0, z1: 74.6 }),
    standMain: sr({ x0: -11.0, z0: 60.4, x1: 11.0, z1: 62.9 }),
    standWest: sr({ x0: -16.0, z0: 63.6, x1: -12.0, z1: 74.6 }),
    standEast: sr({ x0: 12.0, z0: 63.6, x1: 16.0, z1: 74.6 }),
    lights: [
      { x: -11.9, z: 62.9 },
      { x: 11.9, z: 62.9 },
      { x: -11.9, z: 75.3 },
      { x: 11.9, z: 75.3 },
    ].map(sv),
  };
}
const AREA3_PLACED = placeArea3();

export const AREA1_LAYOUT: Layout = {
  plot: { x0: -17, z0: -12, x1: 17, z1: 12 },
  rooms: [
    { id: 'reception', rect: { x0: -16.4, z0: -11.4, x1: -10.4, z1: -4.8 }, floor: 'tilesTeal', door: [-13.3, -11.5], eastDoor: [-8.6, -7.2] },
    { id: 'changing', rect: { x0: -10.4, z0: -11.4, x1: -5.2, z1: -4.8 }, floor: 'rubberBlue', door: [-8.6, -7.0] },
    { id: 'office', rect: { x0: -13.0, z0: 1.4, x1: -7.0, z1: 6.6 }, floor: 'wood', door: [-10.8, -9.2], eastDoor: [2.8, 4.4], westWall: true, wallH: 1.3 },
  ],
  pitch: { x0: -3.8, z0: -11.4, x1: 16.4, z1: -2.4 },
  pitchGates: [
    [-1.0, 0.6],
    [6.2, 7.8],
    [12.2, 13.8],
  ],
  shootingLane: { x0: -3.2, z0: -11.1, x1: 2.8, z1: -2.8 },
  dribbleStrip: { x0: 4.6, z0: -10.8, x1: 8.4, z1: -3.0 },
  passDeck: { x0: 10.4, z0: -11.0, x1: 15.6, z1: -3.0 },
  sprintTrack: { x0: -16.2, z0: 9.4, x1: 2.4, z1: 11.5 },
  ghosts: [],
  busStop: { x: 18.8, z: 0.4 },
  gate: { x: 17, z: 0.4 },
  coachSpawn: { x: -6.8, z: -1.6 },
  area2: {
    plot: { x0: -17, z0: 12, x1: 17, z1: 40 },
    gateGap: [8.5, 12.5],
    gym: { x0: -16.3, z0: 12.6, x1: -9.2, z1: 19.0 },
    rondo: { x: -4.4, z: 16.0, r: 3.0 },
    freekick: { x0: 0.6, z0: 12.5, x1: 7.0, z1: 19.6 },
    agility: { x0: -16.2, z0: 21.6, x1: -4.6, z1: 24.8 },
    skills: { x0: -1.6, z0: 21.4, x1: 4.8, z1: 27.4 },
    physio: { x0: 9.6, z0: 20.6, x1: 16.4, z1: 26.6 },
    seven: { x0: -11.6, z0: 29.4, x1: 11.6, z1: 39.0 },
    path: { x0: 8.5, z0: 12.0, x1: 12.5, z1: 28.6 },
  },
  area3: AREA3_PLACED,
};
