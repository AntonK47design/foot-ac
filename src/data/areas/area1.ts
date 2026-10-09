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
  bounds: { x0: -16.6, z0: -11.6, x1: 16.6, z1: 11.6 },
  navBounds: { x0: -17.0, z0: -12.0, x1: 20.0, z1: 12.0 },
  walkable: [
    { x0: -16.6, z0: -11.6, x1: 16.6, z1: 11.6 },
    { x0: 16.0, z0: -0.6, x1: 20.0, z1: 1.4 },
  ],
  spawn: { x: -6.8, z: -1.6 },
  gate: {
    busStop: { x: 18.8, z: 0.4 },
    door: { x: 17.7, z: 0.4 },
    inside: { x: 15.6, z: 0.4 },
    exit: { x: 17.7, z: 0.4 },
  },
  desk: {
    coachSpot: { x: -13.1, z: -9.55 },
    traineeSpot: { x: -13.1, z: -7.25 },
    pile: { x: -11.4, z: -9.0 },
  },
  crate: { spot: { x: 5.5, z: 1.65 } },
  stations: [
    {
      id: 'shooting_goal',
      kind: 'shoot',
      stat: 'SHO',
      area: 1,
      center: { x: -0.2, z: -7.2 },
      rot: 0,
      lanes: [
        { spot: { x: -0.9, z: 1.9 }, target: { x: -1.0, z: -2.6 } },
        { spot: { x: 0.9, z: 1.9 }, target: { x: 1.0, z: -2.6 } },
      ],
      basket: { x: -2.4, z: 2.9 },
      pile: { x: 2.2, z: 3.0 },
      queueStart: { x: 0, z: 5.6 },
      queueStep: { x: 0, z: 1 },
      footprint: [{ x0: -2.2, z0: -3.9, x1: 2.2, z1: -2.2 }],
    },
    {
      id: 'dribble_cones',
      kind: 'dribble',
      stat: 'DRI',
      area: 1,
      center: { x: 6.5, z: -6.8 },
      rot: 0,
      lanes: [
        { spot: { x: -0.8, z: 2.2 }, target: { x: -0.8, z: -2.4 }, footprint: [{ x0: -1.2, z0: -2.0, x1: -0.4, z1: 1.6 }] },
        { spot: { x: 0.8, z: 2.2 }, target: { x: 0.8, z: -2.4 }, footprint: [{ x0: 0.4, z0: -2.0, x1: 1.2, z1: 1.6 }] },
      ],
      basket: { x: -2.0, z: 2.6 },
      pile: { x: 2.0, z: 2.6 },
      queueStart: { x: 0.5, z: 5.0 },
      queueStep: { x: 0, z: 1 },
      footprint: [],
    },
    {
      id: 'passing_wall',
      kind: 'pass',
      stat: 'PAS',
      area: 1,
      center: { x: 13.0, z: -7.0 },
      rot: 0,
      lanes: [
        { spot: { x: -1.2, z: 1.1 }, target: { x: -1.2, z: -2.0 } },
        { spot: { x: 1.2, z: 1.1 }, target: { x: 1.2, z: -2.0 } },
      ],
      basket: { x: 2.0, z: 2.6 },
      pile: { x: -2.0, z: 3.4 },
      queueStart: { x: 0, z: 5.2 },
      queueStep: { x: 0, z: 1 },
      footprint: [{ x0: -2.3, z0: -2.7, x1: 2.3, z1: -2.0 }],
    },
    {
      id: 'sprint_track',
      kind: 'sprint',
      stat: 'PAC',
      area: 1,
      center: { x: -7.1, z: 10.45 },
      rot: 0,
      lanes: [
        { spot: { x: 8.1, z: -0.5 }, target: { x: -7.9, z: -0.5 } },
        { spot: { x: 8.1, z: 0.55 }, target: { x: -7.9, z: 0.55 } },
      ],
      pile: { x: 10.0, z: 0 },
      queueStart: { x: 10.0, z: -1.45 },
      queueStep: { x: 1, z: 0 },
      footprint: [],
    },
  ],
  objects: [
    { id: 'ball_crate', kind: 'crate', area: 1, pos: { x: 5.5, z: 0.6 }, rot: 0, footprint: [{ x0: -0.5, z0: -0.5, x1: 0.5, z1: 0.5 }] },
    { id: 'desk', kind: 'desk', area: 1, pos: { x: -13.1, z: -8.4 }, rot: 0, footprint: [{ x0: -1.25, z0: -0.5, x1: 1.25, z1: 0.5 }] },
    {
      id: 'chairs_1',
      kind: 'chairs',
      area: 1,
      pos: { x: -15.85, z: -6.8 },
      rot: 1,
      footprint: [{ x0: -1.2, z0: -0.3, x1: 1.2, z1: 0.35 }],
      seats: [
        { x: -15.75, z: -7.6 },
        { x: -15.75, z: -6.8 },
        { x: -15.75, z: -6.0 },
      ],
      seatYaw: -HALF_PI,
    },
    {
      id: 'chairs_2',
      kind: 'chairs',
      area: 1,
      pos: { x: -14.4, z: -4.05 },
      rot: 0,
      footprint: [{ x0: -1.1, z0: -0.3, x1: 1.1, z1: 0.3 }],
      seats: [
        { x: -14.9, z: -4.0 },
        { x: -13.9, z: -4.0 },
      ],
      seatYaw: Math.PI,
    },
    { id: 'bench', kind: 'decor', variant: 'dugout', area: 1, pos: { x: 3.4, z: -1.4 }, rot: 2, footprint: [{ x0: -1.6, z0: -0.6, x1: 1.6, z1: 0.6 }] },
    { id: 'flags', kind: 'decor', variant: 'flags', area: 1, pos: { x: 5.9, z: 11.2 }, rot: 0, footprint: [] },
    { id: 'water_cooler', kind: 'decor', variant: 'cooler', area: 1, pos: { x: -10.4, z: -4.3 }, rot: 0, footprint: [{ x0: -0.3, z0: -0.3, x1: 0.3, z1: 0.3 }] },
    // the Team Bus stop (matches are played away at the stadium)
    { id: 'match_pitch', kind: 'pitch', area: 1, pos: { x: 13.6, z: 1.9 }, rot: 0, footprint: [] },
    { id: 'bus_shelter', kind: 'shelter', area: 1, pos: { x: 15.0, z: -1.4 }, rot: 0, footprint: [{ x0: -0.9, z0: -0.4, x1: 0.9, z1: 0.4 }] },
  ],
  pads: [
    { id: 'p_crate', area: 1, pos: { x: 5.5, z: 1.65 }, cost: 10, stars: 1, xp: 8, requires: [], unlock: { type: 'object', id: 'ball_crate' }, icon: 'ball', nameKey: 'obj.ball_crate', major: true },
    { id: 'p_goal', area: 1, pos: { x: -2.6, z: -4.3 }, cost: 20, stars: 2, xp: 10, requires: ['p_crate'], unlock: { type: 'station', id: 'shooting_goal' }, icon: 'goal', nameKey: 'station.shooting_goal', major: true },
    { id: 'p_cones', area: 1, pos: { x: 4.5, z: -4.2 }, cost: 20, stars: 2, xp: 10, requires: ['p_goal'], unlock: { type: 'station', id: 'dribble_cones' }, icon: 'cones', nameKey: 'station.dribble_cones', major: true },
    { id: 'p_chairs2', area: 1, pos: { x: -14.4, z: -4.05 }, cost: 30, stars: 1, xp: 8, requires: ['p_goal'], unlock: { type: 'object', id: 'chairs_2' }, icon: 'chair', nameKey: 'obj.chairs' },
    { id: 'p_goal_l2', area: 1, pos: { x: 2.0, z: -6.4 }, cost: 40, stars: 1, xp: 8, requires: ['p_cones'], unlock: { type: 'lane', station: 'shooting_goal' }, icon: 'lane', nameKey: 'lane.shooting_goal' },
    { id: 'p_wall', area: 1, pos: { x: 15.0, z: -4.4 }, cost: 50, stars: 2, xp: 12, requires: ['p_cones'], unlock: { type: 'station', id: 'passing_wall' }, icon: 'wall', nameKey: 'station.passing_wall', major: true },
    { id: 'p_cones_l2', area: 1, pos: { x: 7.3, z: -4.6 }, cost: 55, stars: 1, xp: 8, requires: ['p_wall'], unlock: { type: 'lane', station: 'dribble_cones' }, icon: 'lane', nameKey: 'lane.dribble_cones' },
    { id: 'p_ballboy', area: 1, pos: { x: 5.5, z: 3.0 }, cost: 190, stars: 2, xp: 14, requires: ['p_bench', 'p_cones_l2'], unlock: { type: 'staff', id: 'ball_boy' }, icon: 'staff', nameKey: 'staff.ball_boy', major: true },
    { id: 'p_ballboy2', area: 1, pos: { x: 7.1, z: 2.2 }, cost: 150, stars: 1, xp: 10, requires: ['p_ballboy'], unlock: { type: 'staff', id: 'ball_boy_2' }, icon: 'staff', nameKey: 'staff.ball_boy_2' },
    { id: 'p_match', area: 1, pos: { x: 13.6, z: 1.9 }, cost: 85, stars: 2, xp: 14, requires: ['p_cones_l2'], unlock: { type: 'object', id: 'match_pitch' }, icon: 'pitch', nameKey: 'obj.match_pitch', major: true },
    { id: 'p_bench', area: 1, pos: { x: 3.4, z: -0.1 }, cost: 45, stars: 1, xp: 8, requires: ['p_cones'], unlock: { type: 'object', id: 'bench' }, icon: 'bench', nameKey: 'obj.bench' },
    { id: 'p_sprint', area: 1, pos: { x: 2.9, z: 10.45 }, cost: 140, stars: 2, xp: 12, requires: ['p_ballboy'], unlock: { type: 'station', id: 'sprint_track' }, icon: 'track', nameKey: 'station.sprint_track', major: true },
    { id: 'p_flags', area: 1, pos: { x: 5.9, z: 9.8 }, cost: 75, stars: 1, xp: 8, requires: ['p_wall'], unlock: { type: 'object', id: 'flags' }, icon: 'flag', nameKey: 'obj.flags' },
    { id: 'p_wall_l2', area: 1, pos: { x: 11.4, z: -5.6 }, cost: 180, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'passing_wall' }, icon: 'lane', nameKey: 'lane.passing_wall' },
    { id: 'p_shelter', area: 1, pos: { x: 15.0, z: -0.4 }, cost: 220, stars: 1, xp: 10, requires: ['p_chairs2', 'p_wall'], unlock: { type: 'object', id: 'bus_shelter' }, icon: 'shelter', nameKey: 'obj.bus_shelter' },
    { id: 'p_cooler', area: 1, pos: { x: -10.4, z: -3.5 }, cost: 50, stars: 1, xp: 8, requires: ['p_flags'], unlock: { type: 'object', id: 'water_cooler' }, icon: 'cooler', nameKey: 'obj.water_cooler' },
    { id: 'p_track_l2', area: 1, pos: { x: -4.5, z: 8.9 }, cost: 320, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'sprint_track' }, icon: 'lane', nameKey: 'lane.sprint_track' },
  ],
  starterPiles: [
    { id: 'starter_a', pos: { x: -4.8, z: -1.6 }, amount: 15 },
    { id: 'starter_b', pos: { x: -2.6, z: -0.6 }, amount: 25 },
  ],
  office: {
    computer: { x: -10.0, z: 2.05 },
    // waiting bench along the west wall, facing into the room
    seats: [
      { x: -12.45, z: 3.2 },
      { x: -12.45, z: 4.1 },
      { x: -12.45, z: 5.0 },
      { x: -12.45, z: 5.9 },
    ],
    seatYaw: -Math.PI / 2,
  },
  matchPitch: {
    objectId: 'match_pitch',
    rect: { x0: 71, z0: -5.5, x1: 89, z1: 3.5 },
    kickoff: { x: 13.6, z: 1.9 },
    goalW: 3.0,
    busPark: { x: 21.1, z: 4.2 },
    stadium: { plot: { x0: 64, z0: -10.5, x1: 96, z1: 9 }, road: { x0: 60, z0: 9, x1: 100, z1: 13.6 }, busStop: { x: 80, z: 11.3 } },
  },
  lockers: {
    // front bench first, then the back bench (both face the camera)
    seats: [
      { x: -8.5, z: -6.85 },
      { x: -7.1, z: -6.85 },
      { x: -7.8, z: -6.85 },
      { x: -8.5, z: -8.45 },
      { x: -7.1, z: -8.45 },
      { x: -7.8, z: -8.45 },
    ],
    yaw: Math.PI,
  },
  obstacles: [
    // clubhouse walls (back, west, middle with doorway, east), front stubs with doorways
    { x0: -16.7, z0: -11.7, x1: -5.0, z1: -11.2 },
    { x0: -16.7, z0: -11.7, x1: -16.2, z1: -4.65 },
    { x0: -10.55, z0: -11.7, x1: -10.25, z1: -8.6 },
    { x0: -10.55, z0: -7.2, x1: -10.25, z1: -4.65 },
    { x0: -5.35, z0: -11.7, x1: -5.05, z1: -4.65 },
    { x0: -16.7, z0: -4.95, x1: -13.3, z1: -4.65 },
    { x0: -11.5, z0: -4.95, x1: -8.6, z1: -4.65 },
    { x0: -7.0, z0: -4.95, x1: -5.05, z1: -4.65 },
    // reception furniture: trophy cabinet, side cabinet
    { x0: -16.15, z0: -11.2, x1: -14.45, z1: -10.65 },
    { x0: -11.6, z0: -11.2, x1: -10.6, z1: -10.6 },
    // changing room: lockers and two benches
    { x0: -9.8, z0: -11.2, x1: -5.8, z1: -10.55 },
    { x0: -9.25, z0: -8.8, x1: -6.35, z1: -8.2 },
    { x0: -9.25, z0: -7.2, x1: -6.35, z1: -6.6 },
    // gap between the clubhouse east wall and the pitch fence (planters fill it; too narrow to path out of)
    { x0: -5.35, z0: -11.7, x1: -3.65, z1: -2.25 },
    // pitch fence (west, east + south with three gates)
    { x0: -3.95, z0: -11.7, x1: -3.65, z1: -2.25 },
    { x0: 16.25, z0: -11.7, x1: 16.7, z1: -2.25 },
    { x0: -3.95, z0: -2.55, x1: -1.0, z1: -2.25 },
    { x0: 0.6, z0: -2.55, x1: 6.2, z1: -2.25 },
    { x0: 7.8, z0: -2.55, x1: 12.2, z1: -2.25 },
    { x0: 13.8, z0: -2.55, x1: 16.7, z1: -2.25 },
    // plaza furniture: tactics board, outside bench, park bench, bench by the planters
    { x0: -6.7, z0: -1.15, x1: -5.7, z1: -0.45 },
    { x0: -15.15, z0: -2.3, x1: -12.85, z1: -1.7 },
    { x0: -0.4, z0: 6.8, x1: 1.6, z1: 7.25 },
    { x0: -15.9, z0: 3.5, x1: -15.3, z1: 5.7 },
    // Manager's Office: walls (east doorway z 2.8–4.4, front doorway x −10.8…−9.2), desk, waiting bench
    { x0: -13.15, z0: 1.25, x1: -6.85, z1: 1.55 },
    { x0: -13.15, z0: 1.25, x1: -12.85, z1: 6.75 },
    { x0: -7.15, z0: 1.25, x1: -6.85, z1: 2.8 },
    { x0: -7.15, z0: 4.4, x1: -6.85, z1: 6.75 },
    { x0: -13.15, z0: 6.45, x1: -10.8, z1: 6.75 },
    { x0: -9.2, z0: 6.45, x1: -6.85, z1: 6.75 },
    { x0: -11.25, z0: 2.6, x1: -8.75, z1: 3.5 },
    { x0: -12.85, z0: 2.7, x1: -12.2, z1: 6.4 },
    // construction site (gym) behind fences
    { x0: 10.4, z0: 2.6, x1: 16.2, z1: 8.55 },
  ],
};

/** Prebuilt objects present from the start. */
export const PREBUILT_OBJECTS = ['desk', 'chairs_1'];
