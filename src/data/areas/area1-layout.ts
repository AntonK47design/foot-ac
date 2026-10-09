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
  plot: { x0: -13.6, z0: -9.8, x1: 13.6, z1: 9.6 },
  rooms: [
    { id: 'reception', rect: { x0: -13, z0: -9.2, x1: -7, z1: -2.6 }, floor: 'tilesTeal', door: [-9.9, -8.1], eastDoor: [-6.4, -5.0] },
    { id: 'changing', rect: { x0: -7, z0: -9.2, x1: -1.8, z1: -2.6 }, floor: 'rubberBlue', door: [-5.2, -3.6] },
  ],
  pitch: { x0: -0.8, z0: -9.2, x1: 13, z1: -2.2 },
  pitchGates: [
    [1.0, 2.6],
    [6.2, 7.8],
  ],
  shootingLane: { x0: -0.4, z0: -8.9, x1: 4.2, z1: -2.6 },
  dribbleStrip: { x0: 5.0, z0: -8.6, x1: 7.6, z1: -2.8 },
  passDeck: { x0: 9.0, z0: -8.8, x1: 12.6, z1: -2.8 },
  sprintTrack: { x0: -12.6, z0: 6.8, x1: 1.6, z1: 8.9 },
  ghosts: [
    { id: 'office', rect: { x0: -8.8, z0: 1.7, x1: -3.4, z1: 5.6 }, label: 'Office', price: 600 },
    { id: 'gym', rect: { x0: 8.4, z0: 3.6, x1: 12.9, z1: 8.6 }, label: 'Gym', price: 900 },
  ],
  busStop: { x: 15.4, z: 1.6 },
  gate: { x: 13.6, z: 1.6 },
  coachSpawn: { x: -5.2, z: -1.4 },
};
