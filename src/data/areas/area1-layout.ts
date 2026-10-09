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
  ghosts: [
    { id: 'gym', rect: { x0: 10.4, z0: 2.6, x1: 16.2, z1: 8.2 }, label: 'Gym', price: 900 },
  ],
  busStop: { x: 18.8, z: 0.4 },
  gate: { x: 17, z: 0.4 },
  coachSpawn: { x: -6.8, z: -1.6 },
};
