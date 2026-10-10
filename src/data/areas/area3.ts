import type { ObjectDef, PadDef, Rect, StationDef, V2 } from '../types';
import { AREA1_LAYOUT, AREA3_OFFSET } from './area1-layout';

/**
 * Area 3 "Youth Stadium": the third plot, west of Sunday Park (see area1-layout.ts `area3`). Positions below are written
 * in the plot's design frame and placed with `D()`; station-local coordinates are unaffected.
 * New chore: training bibs from the Kit Room to four drills. Rooms and the Fan Shop are perks; the stadium makes
 * the squad 11-a-side and multiplies match income. Merged into the academy AreaDef in area1.ts.
 */
const HALF_PI = Math.PI / 2;
const A = AREA1_LAYOUT.area3;
/** Design-frame point → world (the plot was drawn at x −17…17, z 40…76). */
const D = (x: number, z: number): V2 => ({ x: x + AREA3_OFFSET.x, z: z + AREA3_OFFSET.z });
/** The gate: a gap in the plot's east edge (shared with Sunday Park, beside the Manager's Office). */
const GATE_X = A.plot.x1;
const GATE_Z = (A.gateGap[0] + A.gateGap[1]) / 2;

/** Wall rects (local to the room centre) for a room with a south doorway, like the Physio Room. */
function roomWalls(r: Rect, door: [number, number]): { pos: V2; footprint: Rect[] } {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const hw = (r.x1 - r.x0) / 2;
  const hd = (r.z1 - r.z0) / 2;
  const t = 0.15;
  return {
    pos: { x: cx, z: cz },
    footprint: [
      { x0: -hw - t, z0: -hd - t, x1: hw + t, z1: -hd + t },
      { x0: -hw - t, z0: -hd - t, x1: -hw + t, z1: hd + t },
      { x0: hw - t, z0: -hd - t, x1: hw + t, z1: hd + t },
      { x0: -hw - t, z0: hd - t, x1: door[0] - cx, z1: hd + t },
      { x0: door[1] - cx, z0: hd - t, x1: hw + t, z1: hd + t },
    ],
  };
}

const tactics = roomWalls(A.tactics, A.tacticsDoor);
const analysis = roomWalls(A.analysis, A.analysisDoor);

export const AREA3_STATIONS: StationDef[] = [
  {
    // wingers whip crosses into a small goal guarded by a mannequin
    id: 'crossing',
    kind: 'crossing',
    stat: 'PAS',
    area: 3,
    center: D(-12.6, 45.6),
    rot: 0,
    lanes: [
      { spot: { x: -2.8, z: 1.6 }, target: { x: -0.7, z: -3.3 } },
      { spot: { x: 2.8, z: 1.6 }, target: { x: 0.7, z: -3.3 } },
    ],
    basket: { x: 3.0, z: 3.6 },
    pile: { x: -3.0, z: 3.6 },
    queueStart: { x: 0, z: 3.2 },
    queueStep: { x: 0, z: 1 },
    footprint: [
      { x0: -2.0, z0: -4.6, x1: 2.0, z1: -3.9 },
      { x0: -0.25, z0: -2.3, x1: 0.25, z1: -1.8 },
    ],
  },
  {
    // heading pendulums: a ball hangs from a frame over each lane
    id: 'heading',
    kind: 'heading',
    stat: 'SHO',
    area: 3,
    center: D(-4.5, 44.6),
    rot: 0,
    lanes: [
      { spot: { x: -1.4, z: 0.6 }, target: { x: -1.4, z: -0.7 }, footprint: [{ x0: -2.5, z0: -0.95, x1: -2.25, z1: -0.65 }, { x0: -0.55, z0: -0.95, x1: -0.3, z1: -0.65 }] },
      { spot: { x: 1.4, z: 0.6 }, target: { x: 1.4, z: -0.7 }, footprint: [{ x0: 0.3, z0: -0.95, x1: 0.55, z1: -0.65 }, { x0: 2.25, z0: -0.95, x1: 2.5, z1: -0.65 }] },
    ],
    basket: { x: 2.4, z: 2.6 },
    pile: { x: -2.4, z: 2.6 },
    queueStart: { x: 0, z: 2.8 },
    queueStep: { x: 0, z: 1 },
    footprint: [],
  },
  {
    // keepy-uppy circle
    id: 'juggling',
    kind: 'juggling',
    stat: 'DRI',
    area: 3,
    center: { x: A.juggling.x, z: A.juggling.z },
    rot: 0,
    lanes: [
      { spot: { x: -1.2, z: 0.2 }, target: { x: -1.2, z: -0.6 } },
      { spot: { x: 1.2, z: 0.2 }, target: { x: 1.2, z: -0.6 } },
    ],
    basket: { x: 2.4, z: 2.0 },
    pile: { x: -2.4, z: 2.0 },
    queueStart: { x: 0, z: 2.4 },
    queueStep: { x: 0, z: 1 },
    footprint: [],
  },
  {
    // sprint to the reaction-light board and back
    id: 'reaction',
    kind: 'reaction',
    stat: 'PAC',
    area: 3,
    center: D(-11.6, 55.4),
    rot: 0,
    lanes: [
      { spot: { x: 3.8, z: -0.8 }, target: { x: -3.7, z: -0.8 } },
      { spot: { x: 3.8, z: 0.8 }, target: { x: -3.7, z: 0.8 } },
    ],
    basket: { x: 4.4, z: 2.6 },
    pile: { x: 4.4, z: -2.6 },
    queueStart: { x: 4.8, z: 0 },
    queueStep: { x: 0, z: 1 },
    footprint: [{ x0: -4.7, z0: -1.9, x1: -4.3, z1: 1.9 }],
  },
];

export const AREA3_OBJECTS: ObjectDef[] = [
  { id: 'area3_gate', kind: 'gate', area: 3, pos: { x: GATE_X, z: GATE_Z }, rot: 0, footprint: [] },
  { id: 'kit_room', kind: 'kit', area: 3, pos: D(10.1, 41.6), rot: 0, footprint: [{ x0: -1.3, z0: -0.55, x1: 1.3, z1: 0.45 }] },
  { id: 'tactics_room', kind: 'room', area: 3, pos: tactics.pos, rot: 0, footprint: tactics.footprint },
  { id: 'analysis_lab', kind: 'room', area: 3, pos: analysis.pos, rot: 0, footprint: analysis.footprint },
  {
    id: 'fan_shop',
    kind: 'shop',
    area: 3,
    pos: { x: (A.shop.x0 + A.shop.x1) / 2, z: (A.shop.z0 + A.shop.z1) / 2 },
    rot: 0,
    footprint: [{ x0: -(A.shop.x1 - A.shop.x0) / 2, z0: -(A.shop.z1 - A.shop.z0) / 2, x1: (A.shop.x1 - A.shop.x0) / 2, z1: (A.shop.z1 - A.shop.z0) / 2 }],
  },
  {
    // 11-a-side pitch: fenced all round (the squad trains there; the coach plays matches away)
    id: 'youth_stadium',
    kind: 'decor',
    variant: 'stadium',
    area: 3,
    pos: { x: (A.stadium.x0 + A.stadium.x1) / 2, z: (A.stadium.z0 + A.stadium.z1) / 2 },
    rot: 0,
    footprint: (() => {
      const hw = (A.stadium.x1 - A.stadium.x0) / 2 + 0.35;
      const hd = (A.stadium.z1 - A.stadium.z0) / 2 + 0.35;
      const t = 0.15;
      return [
        { x0: -hw - t, z0: -hd - t, x1: hw + t, z1: -hd + t },
        { x0: -hw - t, z0: hd - t, x1: hw + t, z1: hd + t },
        { x0: -hw - t, z0: -hd - t, x1: -hw + t, z1: hd + t },
        { x0: hw - t, z0: -hd - t, x1: hw + t, z1: hd + t },
      ];
    })(),
  },
  { id: 'stand_main', kind: 'decor', variant: 'stand', area: 3, pos: { x: 0, z: 0 }, rot: 0, footprint: [A.standMain] },
  { id: 'stand_sides', kind: 'decor', variant: 'stand', area: 3, pos: { x: 0, z: 0 }, rot: 0, footprint: [A.standWest, A.standEast] },
  {
    id: 'stadium_lights',
    kind: 'decor',
    variant: 'lights',
    area: 3,
    pos: { x: 0, z: 0 },
    rot: 0,
    footprint: A.lights.map((p) => ({ x0: p.x - 0.3, z0: p.z - 0.3, x1: p.x + 0.3, z1: p.z + 0.3 })),
  },
];

const pad = (
  id: string,
  pos: V2,
  cost: number,
  stars: number,
  xp: number,
  requires: string[],
  unlock: PadDef['unlock'],
  icon: PadDef['icon'],
  nameKey: string,
  major = false,
): PadDef => ({ id, area: 3, pos, cost, stars, xp, requires, unlock, icon, nameKey, ...(major ? { major } : {}) });

/**
 * Pads sit on the basket (drills), the pick-up spot (Kit Room), the pile (Fan Shop) or in front of the door (rooms),
 * never inside what they (or a later pad) build: the stadium pads wait in the walkway north of the main stand.
 * The gate pad stands in Sunday Park, just outside the gap.
 */
export const AREA3_PADS: PadDef[] = [
  pad('p3_gate', { x: GATE_X + 2.2, z: GATE_Z }, 6000, 3, 60, [], { type: 'object', id: 'area3_gate' }, 'gate', 'obj.area3_gate', true),
  pad('p3_kit', D(10.1, 43.0), 2500, 2, 20, ['p3_gate'], { type: 'object', id: 'kit_room' }, 'bib', 'obj.kit_room', true),
  pad('p3_crossing', D(-9.6, 49.2), 3500, 2, 20, ['p3_kit'], { type: 'station', id: 'crossing' }, 'crossing', 'station.crossing', true),
  pad('p3_heading', D(-2.1, 47.2), 5000, 2, 20, ['p3_crossing'], { type: 'station', id: 'heading' }, 'heading', 'station.heading', true),
  pad('p3_cross_l2', D(-14.4, 47.0), 6500, 1, 14, ['p3_kitman'], { type: 'lane', station: 'crossing' }, 'lane', 'lane.crossing'),
  pad('p3_kitman', D(11.8, 45.6), 6000, 2, 22, ['p3_heading'], { type: 'staff', id: 'kit_manager' }, 'staff', 'staff.kit_manager', true),
  pad('p3_juggling', D(5.0, 47.0), 8000, 2, 20, ['p3_kitman'], { type: 'station', id: 'juggling' }, 'juggling', 'station.juggling', true),
  pad('p3_head_l2', D(-6.8, 45.6), 9000, 1, 14, ['p3_juggling'], { type: 'lane', station: 'heading' }, 'lane', 'lane.heading'),
  pad('p3_reaction', D(-7.2, 57.6), 12000, 2, 20, ['p3_juggling'], { type: 'station', id: 'reaction' }, 'reaction', 'station.reaction', true),
  pad('p3_jug_l2', D(0.2, 44.0), 12500, 1, 14, ['p3_reaction'], { type: 'lane', station: 'juggling' }, 'lane', 'lane.juggling'),
  pad('p3_kitman2', D(8.2, 45.8), 10000, 1, 16, ['p3_reaction'], { type: 'staff', id: 'kit_manager_2' }, 'staff', 'staff.kit_manager_2'),
  pad('p3_tactics', { x: (A.tacticsDoor[0] + A.tacticsDoor[1]) / 2, z: A.tactics.z1 + 0.75 }, 14000, 2, 24, ['p3_reaction'], { type: 'object', id: 'tactics_room' }, 'tactics', 'obj.tactics_room', true),
  pad('p3_react_l2', D(-10.0, 53.0), 15000, 1, 14, ['p3_tactics'], { type: 'lane', station: 'reaction' }, 'lane', 'lane.reaction'),
  pad('p3_shop', { x: A.shopPile.x, z: A.shopPile.z }, 14000, 2, 24, ['p3_tactics'], { type: 'object', id: 'fan_shop' }, 'shop', 'obj.fan_shop', true),
  pad('p3_analysis', { x: (A.analysisDoor[0] + A.analysisDoor[1]) / 2, z: A.analysis.z1 + 0.75 }, 16000, 2, 24, ['p3_shop'], { type: 'object', id: 'analysis_lab' }, 'analysis', 'obj.analysis_lab', true),
  pad('p3_stadium', D(1.8, 59.6), 22000, 3, 36, ['p3_analysis'], { type: 'object', id: 'youth_stadium' }, 'stadium', 'obj.youth_stadium', true),
  pad('p3_stand_main', D(-5.8, 59.6), 18000, 2, 24, ['p3_stadium'], { type: 'object', id: 'stand_main' }, 'stand', 'obj.stand_main', true),
  pad('p3_lights', D(14.2, 61.6), 16000, 2, 24, ['p3_stand_main'], { type: 'object', id: 'stadium_lights' }, 'lights', 'obj.stadium_lights', true),
  pad('p3_stand_sides', D(-14.2, 61.6), 20000, 3, 30, ['p3_lights'], { type: 'object', id: 'stand_sides' }, 'stand', 'obj.stand_sides', true),
  // assistant coaches, one per drill
  pad('p3_asst_cross', D(-8.2, 42.6), 12000, 1, 16, ['p3_cross_l2', 'p3_tactics'], { type: 'staff', id: 'assistant:crossing' }, 'whistle', 'staff.assistant_crossing'),
  pad('p3_asst_head', D(-0.9, 41.8), 13500, 1, 16, ['p3_head_l2', 'p3_asst_cross'], { type: 'staff', id: 'assistant:heading' }, 'whistle', 'staff.assistant_heading'),
  pad('p3_asst_jug', D(6.6, 43.4), 15000, 1, 16, ['p3_jug_l2', 'p3_asst_head'], { type: 'staff', id: 'assistant:juggling' }, 'whistle', 'staff.assistant_juggling'),
  pad('p3_asst_react', D(-11.6, 59.4), 16500, 1, 16, ['p3_react_l2', 'p3_asst_jug'], { type: 'staff', id: 'assistant:reaction' }, 'whistle', 'staff.assistant_reaction'),
];

export const AREA3_STAFF_SPOTS: Record<string, V2 & { yaw: number }> = {
  'assistant:crossing': { ...D(-8.2, 42.6), yaw: HALF_PI },
  'assistant:heading': { ...D(-0.9, 41.8), yaw: HALF_PI },
  'assistant:juggling': { ...D(6.6, 43.4), yaw: HALF_PI },
  'assistant:reaction': { ...D(-11.6, 59.4), yaw: 0 },
};

/**
 * Border between Sunday Park / the Training Ground and the Youth Stadium (gate gap locked separately), and the empty
 * corner south of the Youth Stadium (west of the Training Ground): the coach's bounds are one rectangle around all plots.
 */
const EDGE = 0.4;
export const AREA3_OBSTACLES: Rect[] = [
  { x0: GATE_X - EDGE, z0: A.plot.z0 - EDGE, x1: GATE_X + EDGE, z1: A.gateGap[0] },
  { x0: GATE_X - EDGE, z0: A.gateGap[1], x1: GATE_X + EDGE, z1: A.plot.z1 + EDGE },
  { x0: A.plot.x0 - EDGE, z0: A.plot.z1 - EDGE, x1: GATE_X + EDGE, z1: AREA1_LAYOUT.area2.plot.z1 + EDGE },
];

export const AREA3_LOCKED: Rect[] = [{ x0: GATE_X - EDGE, z0: A.gateGap[0], x1: GATE_X + EDGE, z1: A.gateGap[1] }];
