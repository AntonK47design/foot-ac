import type { AreaDef } from '../types';

/**
 * Area 1 "Sunday Park" on the diorama layout (see area1-layout.ts and docs/ART_BIBLE.md §3).
 * World metres: +x east (screen right), +z south (towards the camera).
 * Pads sit on the interaction spot of what they unlock (basket, crate front, pile). Ids are stable across layouts.
 */
const HALF_PI = Math.PI / 2;

export const AREA1: AreaDef = {
  id: 1,
  nameKey: 'area.1',
  bounds: { x0: -13.2, z0: -9.4, x1: 13.2, z1: 9.2 },
  navBounds: { x0: -13.6, z0: -9.8, x1: 16.6, z1: 9.6 },
  walkable: [
    { x0: -13.2, z0: -9.4, x1: 13.2, z1: 9.2 },
    { x0: 12.6, z0: 0.6, x1: 16.6, z1: 2.6 },
  ],
  spawn: { x: -5.2, z: -1.4 },
  gate: {
    busStop: { x: 15.4, z: 1.6 },
    door: { x: 14.3, z: 1.6 },
    inside: { x: 12.4, z: 1.6 },
    exit: { x: 14.3, z: 1.6 },
  },
  desk: {
    coachSpot: { x: -9.7, z: -7.35 },
    traineeSpot: { x: -9.7, z: -5.05 },
    pile: { x: -8.0, z: -6.8 },
  },
  crate: { spot: { x: -1.0, z: 1.95 } },
  stations: [
    {
      id: 'shooting_goal',
      kind: 'shoot',
      stat: 'SHO',
      area: 1,
      center: { x: 1.9, z: -5.0 },
      rot: 0,
      lanes: [
        { spot: { x: -0.5, z: 1.1 }, target: { x: -0.7, z: -2.6 } },
        { spot: { x: 0.7, z: 1.1 }, target: { x: 0.8, z: -2.6 } },
      ],
      basket: { x: -1.55, z: 1.6 },
      pile: { x: 1.4, z: 2.0 },
      queueStart: { x: -0.1, z: 3.6 },
      queueStep: { x: 0, z: 1 },
      footprint: [{ x0: -2.2, z0: -3.9, x1: 2.2, z1: -2.2 }],
    },
    {
      id: 'dribble_cones',
      kind: 'dribble',
      stat: 'DRI',
      area: 1,
      center: { x: 6.3, z: -5.6 },
      rot: 0,
      lanes: [
        { spot: { x: -0.6, z: 2.2 }, target: { x: -0.6, z: -2.4 }, footprint: [{ x0: -1.0, z0: -2.0, x1: -0.2, z1: 1.6 }] },
        { spot: { x: 0.6, z: 2.2 }, target: { x: 0.6, z: -2.4 }, footprint: [{ x0: 0.2, z0: -2.0, x1: 1.0, z1: 1.6 }] },
      ],
      basket: { x: -1.9, z: 2.6 },
      pile: { x: 2.0, z: 2.6 },
      queueStart: { x: 0.7, z: 4.2 },
      queueStep: { x: 0, z: 1 },
      footprint: [],
    },
    {
      id: 'passing_wall',
      kind: 'pass',
      stat: 'PAS',
      area: 1,
      center: { x: 10.8, z: -6.0 },
      rot: 0,
      lanes: [
        { spot: { x: -0.8, z: 1.1 }, target: { x: -0.8, z: -2.0 } },
        { spot: { x: 0.8, z: 1.1 }, target: { x: 0.8, z: -2.0 } },
      ],
      basket: { x: 1.3, z: 2.3 },
      pile: { x: -1.5, z: 3.0 },
      queueStart: { x: -0.2, z: 4.6 },
      queueStep: { x: 0, z: 1 },
      footprint: [{ x0: -1.9, z0: -2.7, x1: 1.9, z1: -2.0 }],
    },
    {
      id: 'sprint_track',
      kind: 'sprint',
      stat: 'PAC',
      area: 1,
      center: { x: -5.5, z: 7.85 },
      rot: 0,
      lanes: [
        { spot: { x: 6.1, z: -0.5 }, target: { x: -5.9, z: -0.5 } },
        { spot: { x: 6.1, z: 0.55 }, target: { x: -5.9, z: 0.55 } },
      ],
      pile: { x: 8.3, z: 0 },
      queueStart: { x: 8.3, z: -1.45 },
      queueStep: { x: 1, z: 0 },
      footprint: [],
    },
  ],
  objects: [
    { id: 'ball_crate', kind: 'crate', area: 1, pos: { x: -1.0, z: 0.9 }, rot: 0, footprint: [{ x0: -0.5, z0: -0.5, x1: 0.5, z1: 0.5 }] },
    { id: 'desk', kind: 'desk', area: 1, pos: { x: -9.7, z: -6.2 }, rot: 0, footprint: [{ x0: -1.25, z0: -0.5, x1: 1.25, z1: 0.5 }] },
    {
      id: 'chairs_1',
      kind: 'chairs',
      area: 1,
      pos: { x: -12.45, z: -4.6 },
      rot: 1,
      footprint: [{ x0: -1.2, z0: -0.3, x1: 1.2, z1: 0.35 }],
      seats: [
        { x: -12.35, z: -5.4 },
        { x: -12.35, z: -4.6 },
        { x: -12.35, z: -3.8 },
      ],
      seatYaw: -HALF_PI,
    },
    {
      id: 'chairs_2',
      kind: 'chairs',
      area: 1,
      pos: { x: -11.0, z: -3.25 },
      rot: 0,
      footprint: [{ x0: -1.1, z0: -0.3, x1: 1.1, z1: 0.3 }],
      seats: [
        { x: -11.5, z: -3.2 },
        { x: -10.5, z: -3.2 },
      ],
      seatYaw: Math.PI,
    },
    { id: 'bench', kind: 'decor', variant: 'dugout', area: 1, pos: { x: 4.4, z: -0.9 }, rot: 2, footprint: [{ x0: -1.6, z0: -0.6, x1: 1.6, z1: 0.6 }] },
    { id: 'flags', kind: 'decor', variant: 'flags', area: 1, pos: { x: 5.6, z: 9.0 }, rot: 0, footprint: [] },
    { id: 'water_cooler', kind: 'decor', variant: 'cooler', area: 1, pos: { x: -3.0, z: -2.0 }, rot: 0, footprint: [{ x0: -0.3, z0: -0.3, x1: 0.3, z1: 0.3 }] },
    { id: 'bus_shelter', kind: 'shelter', area: 1, pos: { x: 12.3, z: -0.4 }, rot: 0, footprint: [{ x0: -0.9, z0: -0.4, x1: 0.9, z1: 0.4 }] },
  ],
  pads: [
    { id: 'p_crate', area: 1, pos: { x: -1.0, z: 1.95 }, cost: 10, stars: 1, xp: 8, requires: [], unlock: { type: 'object', id: 'ball_crate' }, icon: 'ball', nameKey: 'obj.ball_crate', major: true },
    { id: 'p_goal', area: 1, pos: { x: 0.35, z: -3.4 }, cost: 20, stars: 2, xp: 10, requires: ['p_crate'], unlock: { type: 'station', id: 'shooting_goal' }, icon: 'goal', nameKey: 'station.shooting_goal', major: true },
    { id: 'p_cones', area: 1, pos: { x: 4.4, z: -3.0 }, cost: 20, stars: 2, xp: 10, requires: ['p_goal'], unlock: { type: 'station', id: 'dribble_cones' }, icon: 'cones', nameKey: 'station.dribble_cones', major: true },
    { id: 'p_chairs2', area: 1, pos: { x: -11.0, z: -3.25 }, cost: 30, stars: 1, xp: 8, requires: ['p_goal'], unlock: { type: 'object', id: 'chairs_2' }, icon: 'chair', nameKey: 'obj.chairs' },
    { id: 'p_goal_l2', area: 1, pos: { x: 0.1, z: -5.4 }, cost: 40, stars: 1, xp: 8, requires: ['p_cones'], unlock: { type: 'lane', station: 'shooting_goal' }, icon: 'lane', nameKey: 'lane.shooting_goal' },
    { id: 'p_wall', area: 1, pos: { x: 12.1, z: -3.7 }, cost: 50, stars: 2, xp: 12, requires: ['p_cones'], unlock: { type: 'station', id: 'passing_wall' }, icon: 'wall', nameKey: 'station.passing_wall', major: true },
    { id: 'p_cones_l2', area: 1, pos: { x: 7.6, z: -4.4 }, cost: 55, stars: 1, xp: 8, requires: ['p_wall'], unlock: { type: 'lane', station: 'dribble_cones' }, icon: 'lane', nameKey: 'lane.dribble_cones' },
    { id: 'p_ballboy', area: 1, pos: { x: -2.6, z: 1.3 }, cost: 185, stars: 2, xp: 14, requires: ['p_bench', 'p_cones_l2'], unlock: { type: 'staff', id: 'ball_boy' }, icon: 'staff', nameKey: 'staff.ball_boy', major: true },
    { id: 'p_bench', area: 1, pos: { x: 4.4, z: 0.4 }, cost: 45, stars: 1, xp: 8, requires: ['p_cones'], unlock: { type: 'object', id: 'bench' }, icon: 'bench', nameKey: 'obj.bench' },
    { id: 'p_sprint', area: 1, pos: { x: 2.8, z: 7.85 }, cost: 140, stars: 2, xp: 12, requires: ['p_ballboy'], unlock: { type: 'station', id: 'sprint_track' }, icon: 'track', nameKey: 'station.sprint_track', major: true },
    { id: 'p_flags', area: 1, pos: { x: 5.6, z: 7.6 }, cost: 75, stars: 1, xp: 8, requires: ['p_wall'], unlock: { type: 'object', id: 'flags' }, icon: 'flag', nameKey: 'obj.flags' },
    { id: 'p_wall_l2', area: 1, pos: { x: 9.4, z: -4.4 }, cost: 180, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'passing_wall' }, icon: 'lane', nameKey: 'lane.passing_wall' },
    { id: 'p_shelter', area: 1, pos: { x: 12.3, z: 0.6 }, cost: 220, stars: 1, xp: 10, requires: ['p_chairs2', 'p_wall'], unlock: { type: 'object', id: 'bus_shelter' }, icon: 'shelter', nameKey: 'obj.bus_shelter' },
    { id: 'p_cooler', area: 1, pos: { x: -3.0, z: -1.2 }, cost: 110, stars: 1, xp: 8, requires: ['p_flags'], unlock: { type: 'object', id: 'water_cooler' }, icon: 'cooler', nameKey: 'obj.water_cooler' },
    { id: 'p_track_l2', area: 1, pos: { x: -2.9, z: 6.3 }, cost: 320, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'sprint_track' }, icon: 'lane', nameKey: 'lane.sprint_track' },
  ],
  starterPiles: [
    { id: 'starter_a', pos: { x: -3.0, z: -0.6 }, amount: 15 },
    { id: 'starter_b', pos: { x: 0.8, z: -0.9 }, amount: 25 },
  ],
  lockers: {
    // front bench first, then the back bench (both face the camera)
    seats: [
      { x: -5.1, z: -4.65 },
      { x: -3.7, z: -4.65 },
      { x: -4.4, z: -4.65 },
      { x: -5.1, z: -6.25 },
      { x: -3.7, z: -6.25 },
      { x: -4.4, z: -6.25 },
    ],
    yaw: Math.PI,
  },
  obstacles: [
    // clubhouse walls (back, west, middle with doorway, east), front stubs with doorways
    { x0: -13.3, z0: -9.5, x1: -1.6, z1: -9.0 },
    { x0: -13.3, z0: -9.5, x1: -12.8, z1: -2.45 },
    { x0: -7.15, z0: -9.5, x1: -6.85, z1: -6.4 },
    { x0: -7.15, z0: -5.0, x1: -6.85, z1: -2.45 },
    { x0: -1.95, z0: -9.5, x1: -1.65, z1: -2.45 },
    { x0: -13.3, z0: -2.75, x1: -9.9, z1: -2.45 },
    { x0: -8.1, z0: -2.75, x1: -5.2, z1: -2.45 },
    { x0: -3.6, z0: -2.75, x1: -1.65, z1: -2.45 },
    // reception furniture: trophy cabinet, side cabinet
    { x0: -12.75, z0: -9.0, x1: -11.05, z1: -8.45 },
    { x0: -8.2, z0: -9.0, x1: -7.2, z1: -8.4 },
    // changing room: lockers and two benches
    { x0: -6.4, z0: -9.0, x1: -2.4, z1: -8.35 },
    { x0: -5.85, z0: -6.6, x1: -2.95, z1: -6.0 },
    { x0: -5.85, z0: -5.0, x1: -2.95, z1: -4.4 },
    // dead-end alley between the clubhouse east wall and the pitch fence (too narrow to path out of)
    { x0: -1.95, z0: -9.5, x1: -0.65, z1: -2.05 },
    // pitch fence (west + south with three gates)
    { x0: -0.95, z0: -9.5, x1: -0.65, z1: -2.05 },
    { x0: -0.95, z0: -2.35, x1: 1.0, z1: -2.05 },
    { x0: 2.6, z0: -2.35, x1: 6.2, z1: -2.05 },
    { x0: 7.8, z0: -2.35, x1: 9.8, z1: -2.05 },
    { x0: 11.4, z0: -2.35, x1: 13.3, z1: -2.05 },
    // plaza furniture: tactics board, outside bench, planters, park benches
    { x0: -0.95, z0: -1.25, x1: 0.05, z1: -0.55 },
    { x0: -11.75, z0: -1.8, x1: -9.45, z1: -1.2 },
    { x0: -2.1, z0: -2.0, x1: -1.5, z1: -1.4 },
    { x0: 12.5, z0: 5.7, x1: 13.1, z1: 6.3 },
    { x0: -0.4, z0: 5.5, x1: 1.6, z1: 5.95 },
    // construction sites (office, gym) behind fences
    { x0: -8.8, z0: 1.7, x1: -3.4, z1: 6.0 },
    { x0: 8.4, z0: 3.6, x1: 12.9, z1: 9.0 },
  ],
};

/** Prebuilt objects present from the start. */
export const PREBUILT_OBJECTS = ['desk', 'chairs_1'];
