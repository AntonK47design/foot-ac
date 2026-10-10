import type { AreaDef } from '../types';
import { AREA3_LOCKED, AREA3_OBJECTS, AREA3_OBSTACLES, AREA3_PADS, AREA3_STAFF_SPOTS, AREA3_STATIONS } from './area3';
import { AREA1_LAYOUT, AREA3_OFFSET } from './area1-layout';

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
  navBounds: { x0: -51.0, z0: -12.0, x1: 20.0, z1: 40.0 },
  walkable: [
    { x0: -16.6, z0: -11.6, x1: 16.6, z1: 11.6 },
    { x0: 16.0, z0: -0.6, x1: 20.0, z1: 1.4 },
    // Area 2 "Training Ground" (south); the gate and the plot border are obstacles
    { x0: -16.6, z0: 11.6, x1: 16.6, z1: 39.6 },
    // Area 3 "Youth Stadium" (west of Sunday Park; the border and its gate are obstacles)
    { x0: -50.6, z0: -11.6, x1: -16.6, z1: 23.6 },
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
  water: { objectId: 'hydration', spot: { x: 13.8, z: 16.1 } },
  bibs: { objectId: 'kit_room', spot: { x: 10.1 + AREA3_OFFSET.x, z: 43.0 + AREA3_OFFSET.z } },
  expansions: [
    {
      area: 2,
      gateObjectId: 'area2_gate',
      plot: AREA1_LAYOUT.area2.plot,
      bounds: { x0: -16.6, z0: -11.6, x1: 16.6, z1: 39.6 },
      // construction fence across the gate until the Training Ground opens
      lockedObstacles: [{ x0: 8.5, z0: 11.6, x1: 12.5, z1: 12.4 }],
    },
    { area: 3, gateObjectId: 'area3_gate', plot: AREA1_LAYOUT.area3.plot, bounds: { x0: -50.6, z0: -11.6, x1: -16.6, z1: 23.6 }, lockedObstacles: AREA3_LOCKED },
  ],
  shop: { objectId: 'fan_shop', pile: AREA1_LAYOUT.area3.shopPile },
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
    // ── Area 2 "Training Ground": drills fed with water bottles from the Hydration Point
    {
      id: 'gym',
      kind: 'gym',
      stat: 'ALL',
      area: 2,
      center: { x: -12.8, z: 16.0 },
      rot: 0,
      lanes: [
        { spot: { x: -1.6, z: 0.6 }, target: { x: -1.6, z: -1.2 }, footprint: [{ x0: -2.4, z0: -1.7, x1: -0.8, z1: -0.7 }] },
        { spot: { x: 1.4, z: 0.6 }, target: { x: 1.4, z: -1.2 }, footprint: [{ x0: 0.6, z0: -1.7, x1: 2.2, z1: -0.7 }] },
      ],
      basket: { x: 3.0, z: 2.0 },
      pile: { x: -2.4, z: 2.6 },
      queueStart: { x: 0, z: 3.0 },
      queueStep: { x: 0, z: 1 },
      footprint: [],
    },
    {
      id: 'rondo',
      kind: 'rondo',
      stat: 'PAS',
      area: 2,
      center: { x: -4.4, z: 16.0 },
      rot: 0,
      lanes: [
        { spot: { x: -0.8, z: 0.4 }, target: { x: -2.2, z: -0.8 } },
        { spot: { x: 0.8, z: 0.4 }, target: { x: 2.2, z: -0.8 } },
      ],
      basket: { x: 2.6, z: 2.2 },
      pile: { x: -2.6, z: 2.4 },
      queueStart: { x: 0, z: 3.4 },
      queueStep: { x: 0, z: 1 },
      // ring of passing mannequins (open to the south)
      footprint: [
        { x0: -2.6, z0: -0.9, x1: -2.1, z1: -0.4 },
        { x0: -1.5, z0: -2.4, x1: -1.0, z1: -1.9 },
        { x0: 1.0, z0: -2.4, x1: 1.5, z1: -1.9 },
        { x0: 2.1, z0: -0.9, x1: 2.6, z1: -0.4 },
      ],
    },
    {
      id: 'freekick',
      kind: 'freekick',
      stat: 'SHO',
      area: 2,
      center: { x: 3.8, z: 16.0 },
      rot: 0,
      lanes: [
        { spot: { x: -1.0, z: 1.4 }, target: { x: -0.8, z: -2.9 } },
        { spot: { x: 1.0, z: 1.4 }, target: { x: 0.8, z: -2.9 } },
      ],
      basket: { x: 2.6, z: 2.4 },
      pile: { x: -2.4, z: 2.6 },
      queueStart: { x: 0, z: 3.6 },
      queueStep: { x: 0, z: 1 },
      footprint: [
        { x0: -2.0, z0: -3.6, x1: 2.0, z1: -2.7 },
        { x0: -1.2, z0: -1.3, x1: 0.4, z1: -0.8 },
      ],
    },
    {
      id: 'agility',
      kind: 'agility',
      stat: 'PAC',
      area: 2,
      center: { x: -10.4, z: 23.2 },
      rot: 0,
      lanes: [
        { spot: { x: 5.2, z: -0.55 }, target: { x: -5.0, z: -0.55 } },
        { spot: { x: 5.2, z: 0.6 }, target: { x: -5.0, z: 0.6 } },
      ],
      basket: { x: 6.4, z: 1.8 },
      pile: { x: 6.6, z: -1.8 },
      queueStart: { x: 6.8, z: 0.0 },
      queueStep: { x: 1, z: 0 },
      footprint: [],
    },
    {
      id: 'skills',
      kind: 'skills',
      stat: 'DRI',
      area: 2,
      center: { x: 1.6, z: 24.4 },
      rot: 0,
      lanes: [
        { spot: { x: -1.2, z: 0.8 }, target: { x: -1.2, z: -1.6 } },
        { spot: { x: 1.2, z: 0.8 }, target: { x: 1.2, z: -1.6 } },
      ],
      basket: { x: 3.0, z: 1.0 },
      pile: { x: -2.8, z: 1.6 },
      queueStart: { x: 0, z: 3.4 },
      queueStep: { x: 0, z: 1 },
      footprint: [{ x0: -2.2, z0: -2.6, x1: 2.2, z1: -2.0 }],
    },
    ...AREA3_STATIONS,
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
    // ── Area 2
    { id: 'area2_gate', kind: 'gate', area: 2, pos: { x: 10.5, z: 12.0 }, rot: 0, footprint: [] },
    { id: 'hydration', kind: 'water', area: 2, pos: { x: 13.8, z: 15.0 }, rot: 0, footprint: [{ x0: -0.75, z0: -0.45, x1: 0.75, z1: 0.4 }] },
    {
      id: 'physio',
      kind: 'room',
      area: 2,
      pos: { x: 13.0, z: 23.6 },
      rot: 0,
      // room rect x 9.6…16.4, z 20.6…26.6: back wall, west wall, front stubs (door x 12.2…13.8), treatment beds
      footprint: [
        { x0: -3.4, z0: -3.15, x1: 3.4, z1: -2.85 },
        { x0: -3.55, z0: -3.15, x1: -3.25, z1: 3.15 },
        { x0: -3.55, z0: 2.85, x1: -0.8, z1: 3.15 },
        { x0: 0.8, z0: 2.85, x1: 3.4, z1: 3.15 },
        { x0: -2.6, z0: -2.4, x1: -0.6, z1: -1.4 },
        { x0: 0.6, z0: -2.4, x1: 2.6, z1: -1.4 },
      ],
    },
    {
      id: 'seven_pitch',
      kind: 'decor',
      variant: 'seven',
      area: 2,
      pos: { x: 0, z: 34.2 },
      rot: 0,
      // fence around x −12…12, z 29…39.4 with a gate in the north side (x −1…1)
      footprint: [
        { x0: -12.15, z0: -5.35, x1: -1.0, z1: -5.05 },
        { x0: 1.0, z0: -5.35, x1: 12.15, z1: -5.05 },
        { x0: -12.15, z0: -5.35, x1: -11.85, z1: 5.35 },
        { x0: 11.85, z0: -5.35, x1: 12.15, z1: 5.35 },
        { x0: -12.15, z0: 5.05, x1: 12.15, z1: 5.35 },
      ],
    },
    ...AREA3_OBJECTS,
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
    // M3 staff: receptionist, one assistant coach per drill, accountant
    { id: 'p_reception', area: 1, pos: { x: -11.5, z: -9.7 }, cost: 260, stars: 1, xp: 12, requires: ['p_ballboy'], unlock: { type: 'staff', id: 'receptionist' }, icon: 'sign', nameKey: 'staff.receptionist' },
    { id: 'p_asst_goal', area: 1, pos: { x: -2.4, z: -6.8 }, cost: 320, stars: 1, xp: 12, requires: ['p_goal_l2', 'p_sprint'], unlock: { type: 'staff', id: 'assistant:shooting_goal' }, icon: 'whistle', nameKey: 'staff.assistant_goal' },
    { id: 'p_asst_cones', area: 1, pos: { x: 3.7, z: -7.2 }, cost: 380, stars: 1, xp: 12, requires: ['p_cones_l2', 'p_asst_goal'], unlock: { type: 'staff', id: 'assistant:dribble_cones' }, icon: 'whistle', nameKey: 'staff.assistant_cones' },
    { id: 'p_asst_wall', area: 1, pos: { x: 15.9, z: -7.0 }, cost: 460, stars: 1, xp: 12, requires: ['p_wall_l2', 'p_asst_cones'], unlock: { type: 'staff', id: 'assistant:passing_wall' }, icon: 'whistle', nameKey: 'staff.assistant_wall' },
    { id: 'p_asst_track', area: 1, pos: { x: -13.6, z: 8.8 }, cost: 560, stars: 1, xp: 12, requires: ['p_track_l2', 'p_asst_wall'], unlock: { type: 'staff', id: 'assistant:sprint_track' }, icon: 'whistle', nameKey: 'staff.assistant_track' },
    { id: 'p_accountant', area: 1, pos: { x: -9.0, z: 5.7 }, cost: 900, stars: 2, xp: 20, requires: ['p_reception', 'p_shelter'], unlock: { type: 'staff', id: 'accountant' }, icon: 'cash', nameKey: 'staff.accountant', major: true },
    { id: 'p_bench', area: 1, pos: { x: 3.4, z: -0.1 }, cost: 45, stars: 1, xp: 8, requires: ['p_cones'], unlock: { type: 'object', id: 'bench' }, icon: 'bench', nameKey: 'obj.bench' },
    { id: 'p_sprint', area: 1, pos: { x: 2.9, z: 10.45 }, cost: 140, stars: 2, xp: 12, requires: ['p_ballboy'], unlock: { type: 'station', id: 'sprint_track' }, icon: 'track', nameKey: 'station.sprint_track', major: true },
    { id: 'p_flags', area: 1, pos: { x: 5.9, z: 9.8 }, cost: 75, stars: 1, xp: 8, requires: ['p_wall'], unlock: { type: 'object', id: 'flags' }, icon: 'flag', nameKey: 'obj.flags' },
    { id: 'p_wall_l2', area: 1, pos: { x: 11.4, z: -5.6 }, cost: 180, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'passing_wall' }, icon: 'lane', nameKey: 'lane.passing_wall' },
    { id: 'p_shelter', area: 1, pos: { x: 15.0, z: -0.4 }, cost: 220, stars: 1, xp: 10, requires: ['p_chairs2', 'p_wall'], unlock: { type: 'object', id: 'bus_shelter' }, icon: 'shelter', nameKey: 'obj.bus_shelter' },
    { id: 'p_cooler', area: 1, pos: { x: -10.4, z: -3.5 }, cost: 50, stars: 1, xp: 8, requires: ['p_flags'], unlock: { type: 'object', id: 'water_cooler' }, icon: 'cooler', nameKey: 'obj.water_cooler' },
    { id: 'p_track_l2', area: 1, pos: { x: -4.5, z: 8.9 }, cost: 320, stars: 1, xp: 8, requires: ['p_sprint'], unlock: { type: 'lane', station: 'sprint_track' }, icon: 'lane', nameKey: 'lane.sprint_track' },
    // ── Area 2 "Training Ground" (the gate needs every Area 1 pad; filled in below)
    { id: 'p2_gate', area: 2, pos: { x: 10.5, z: 10.5 }, cost: 1900, stars: 3, xp: 40, requires: [], unlock: { type: 'object', id: 'area2_gate' }, icon: 'gate', nameKey: 'obj.area2_gate', major: true },
    { id: 'p2_water', area: 2, pos: { x: 13.8, z: 16.1 }, cost: 600, stars: 2, xp: 14, requires: ['p2_gate'], unlock: { type: 'object', id: 'hydration' }, icon: 'water', nameKey: 'obj.hydration', major: true },
    { id: 'p2_gym', area: 2, pos: { x: -9.8, z: 18.0 }, cost: 900, stars: 2, xp: 14, requires: ['p2_water'], unlock: { type: 'station', id: 'gym' }, icon: 'gym', nameKey: 'station.gym', major: true },
    { id: 'p2_rondo', area: 2, pos: { x: -1.8, z: 18.2 }, cost: 1200, stars: 2, xp: 14, requires: ['p2_gym'], unlock: { type: 'station', id: 'rondo' }, icon: 'rondo', nameKey: 'station.rondo', major: true },
    { id: 'p2_gym_l2', area: 2, pos: { x: -11.4, z: 18.2 }, cost: 1400, stars: 1, xp: 10, requires: ['p2_rondo'], unlock: { type: 'lane', station: 'gym' }, icon: 'lane', nameKey: 'lane.gym' },
    { id: 'p2_carrier', area: 2, pos: { x: 12.0, z: 17.4 }, cost: 1800, stars: 2, xp: 16, requires: ['p2_rondo'], unlock: { type: 'staff', id: 'water_carrier' }, icon: 'staff', nameKey: 'staff.water_carrier', major: true },
    { id: 'p2_fk', area: 2, pos: { x: 6.4, z: 18.4 }, cost: 2200, stars: 2, xp: 14, requires: ['p2_carrier'], unlock: { type: 'station', id: 'freekick' }, icon: 'freekick', nameKey: 'station.freekick', major: true },
    { id: 'p2_rondo_l2', area: 2, pos: { x: -5.6, z: 18.8 }, cost: 2000, stars: 1, xp: 10, requires: ['p2_fk'], unlock: { type: 'lane', station: 'rondo' }, icon: 'lane', nameKey: 'lane.rondo' },
    { id: 'p2_agility', area: 2, pos: { x: -4.0, z: 25.0 }, cost: 2800, stars: 2, xp: 14, requires: ['p2_fk'], unlock: { type: 'station', id: 'agility' }, icon: 'agility', nameKey: 'station.agility', major: true },
    { id: 'p2_fk_l2', area: 2, pos: { x: 2.6, z: 18.9 }, cost: 2600, stars: 1, xp: 10, requires: ['p2_agility'], unlock: { type: 'lane', station: 'freekick' }, icon: 'lane', nameKey: 'lane.freekick' },
    { id: 'p2_skills', area: 2, pos: { x: 4.6, z: 25.4 }, cost: 3400, stars: 2, xp: 14, requires: ['p2_agility'], unlock: { type: 'station', id: 'skills' }, icon: 'skills', nameKey: 'station.skills', major: true },
    { id: 'p2_agility_l2', area: 2, pos: { x: -8.0, z: 25.6 }, cost: 3200, stars: 1, xp: 10, requires: ['p2_skills'], unlock: { type: 'lane', station: 'agility' }, icon: 'lane', nameKey: 'lane.agility' },
    { id: 'p2_skills_l2', area: 2, pos: { x: 3.0, z: 27.6 }, cost: 3800, stars: 1, xp: 10, requires: ['p2_skills'], unlock: { type: 'lane', station: 'skills' }, icon: 'lane', nameKey: 'lane.skills' },
    { id: 'p2_carrier2', area: 2, pos: { x: 15.6, z: 17.4 }, cost: 2000, stars: 1, xp: 12, requires: ['p2_agility'], unlock: { type: 'staff', id: 'water_carrier_2' }, icon: 'staff', nameKey: 'staff.water_carrier_2' },
    { id: 'p2_physio', area: 2, pos: { x: 13.0, z: 27.6 }, cost: 4400, stars: 2, xp: 16, requires: ['p2_skills'], unlock: { type: 'object', id: 'physio' }, icon: 'physio', nameKey: 'obj.physio', major: true },
    { id: 'p2_seven', area: 2, pos: { x: 0, z: 28.2 }, cost: 6000, stars: 3, xp: 24, requires: ['p2_physio'], unlock: { type: 'object', id: 'seven_pitch' }, icon: 'pitch', nameKey: 'obj.seven_pitch', major: true },
    { id: 'p2_asst_gym', area: 2, pos: { x: -9.4, z: 14.4 }, cost: 4000, stars: 1, xp: 12, requires: ['p2_gym_l2', 'p2_physio'], unlock: { type: 'staff', id: 'assistant:gym' }, icon: 'whistle', nameKey: 'staff.assistant_gym' },
    { id: 'p2_asst_rondo', area: 2, pos: { x: -7.4, z: 14.2 }, cost: 4600, stars: 1, xp: 12, requires: ['p2_rondo_l2', 'p2_asst_gym'], unlock: { type: 'staff', id: 'assistant:rondo' }, icon: 'whistle', nameKey: 'staff.assistant_rondo' },
    { id: 'p2_asst_fk', area: 2, pos: { x: 7.0, z: 14.2 }, cost: 5200, stars: 1, xp: 12, requires: ['p2_fk_l2', 'p2_asst_rondo'], unlock: { type: 'staff', id: 'assistant:freekick' }, icon: 'whistle', nameKey: 'staff.assistant_fk' },
    { id: 'p2_asst_agility', area: 2, pos: { x: -4.0, z: 21.4 }, cost: 5800, stars: 1, xp: 12, requires: ['p2_agility_l2', 'p2_asst_fk'], unlock: { type: 'staff', id: 'assistant:agility' }, icon: 'whistle', nameKey: 'staff.assistant_agility' },
    { id: 'p2_asst_skills', area: 2, pos: { x: 5.6, z: 22.0 }, cost: 6400, stars: 1, xp: 12, requires: ['p2_skills_l2', 'p2_asst_agility'], unlock: { type: 'staff', id: 'assistant:skills' }, icon: 'whistle', nameKey: 'staff.assistant_skills' },
    // ── Area 3 "Youth Stadium" (the gate needs every Training Ground pad; filled in below)
    ...AREA3_PADS,
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
  staffSpots: {
    receptionist: { x: -12.1, z: -10.1, yaw: Math.PI },
    'assistant:shooting_goal': { x: -2.4, z: -6.8, yaw: -HALF_PI },
    'assistant:dribble_cones': { x: 3.7, z: -7.2, yaw: -HALF_PI },
    'assistant:passing_wall': { x: 15.9, z: -7.0, yaw: HALF_PI },
    'assistant:sprint_track': { x: -13.6, z: 8.8, yaw: Math.PI },
    accountant: { x: -9.0, z: 5.7, yaw: -HALF_PI },
    'assistant:gym': { x: -9.4, z: 14.4, yaw: -HALF_PI },
    'assistant:rondo': { x: -7.4, z: 14.2, yaw: -HALF_PI },
    'assistant:freekick': { x: 7.0, z: 14.2, yaw: HALF_PI },
    'assistant:agility': { x: -4.0, z: 21.4, yaw: Math.PI },
    'assistant:skills': { x: 5.6, z: 22.0, yaw: HALF_PI },
    ...AREA3_STAFF_SPOTS,
  },
  safe: { x: -7.9, z: 5.6 },
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
    // border between Sunday Park and the Training Ground (gate gap x 8.5…12.5; locked separately)
    { x0: -17.0, z0: 11.6, x1: 8.5, z1: 12.4 },
    { x0: 12.5, z0: 11.6, x1: 17.0, z1: 12.4 },
    ...AREA3_OBSTACLES,
  ],
};

// The Training Ground gate opens once every Sunday Park pad is done.
const gate = AREA1.pads.find((p) => p.id === 'p2_gate');
if (gate) gate.requires = AREA1.pads.filter((p) => p.area === 1).map((p) => p.id);
// …and the Youth Stadium gate once every Training Ground pad is done.
const gate3 = AREA1.pads.find((p) => p.id === 'p3_gate');
if (gate3) gate3.requires = AREA1.pads.filter((p) => p.area === 2).map((p) => p.id);

/** Prebuilt objects present from the start. */
export const PREBUILT_OBJECTS = ['desk', 'chairs_1'];
