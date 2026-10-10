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
  /** Area 3 "Youth Stadium" (third plot, south of the Training Ground). */
  area3: {
    plot: Rect;
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
  area3: {
    plot: { x0: -17, z0: 40, x1: 17, z1: 76 },
    gateGap: [12.6, 16.4],
    path: { x0: 12.6, z0: 40, x1: 16.4, z1: 60.2 },
    kitRoom: { x0: 7.9, z0: 40.6, x1: 12.3, z1: 44.2 },
    crossing: { x0: -16.4, z0: 40.8, x1: -8.8, z1: 50.2 },
    heading: { x0: -7.6, z0: 40.8, x1: -1.4, z1: 48.4 },
    juggling: { x: 2.6, z: 45.0, r: 3.0 },
    reaction: { x0: -16.4, z0: 52.0, x1: -6.8, z1: 58.8 },
    tactics: { x0: -4.6, z0: 51.6, x1: 1.8, z1: 58.6 },
    tacticsDoor: [-2.2, -0.6],
    analysis: { x0: 1.8, z0: 51.6, x1: 8.2, z1: 58.6 },
    analysisDoor: [4.2, 5.8],
    shop: { x0: 9.0, z0: 52.0, x1: 12.4, z1: 55.4 },
    shopPile: { x: 10.7, z: 57.0 },
    stadium: { x0: -11.0, z0: 63.6, x1: 11.0, z1: 74.6 },
    standMain: { x0: -11.0, z0: 60.4, x1: 11.0, z1: 62.9 },
    standWest: { x0: -16.0, z0: 63.6, x1: -12.0, z1: 74.6 },
    standEast: { x0: 12.0, z0: 63.6, x1: 16.0, z1: 74.6 },
    lights: [
      { x: -11.9, z: 62.9 },
      { x: 11.9, z: 62.9 },
      { x: -11.9, z: 75.3 },
      { x: 11.9, z: 75.3 },
    ],
  },
};
