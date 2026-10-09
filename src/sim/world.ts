import { BALANCE } from '../data/balance';
import type { AreaDef, ObjectDef, PadDef, Rect, StationDef, StationKind, Stat, V2 } from '../data/types';
import { rectToWorld, toWorld } from './geom';

export interface LaneGeo {
  spot: V2;
  target: V2;
  footprint: Rect[];
}

export interface StationGeo {
  def: StationDef;
  id: string;
  kind: StationKind;
  stat: Stat;
  basket: V2 | null;
  pile: V2;
  lanes: LaneGeo[];
  footprint: Rect[];
  queueStart: V2;
  queueStep: V2;
  cfg: (typeof BALANCE.stations)[StationKind];
}

export interface ObjectGeo {
  def: ObjectDef;
  footprint: Rect[];
}

/** World-space geometry precomputed from an area definition. */
export class WorldGeo {
  readonly stations = new Map<string, StationGeo>();
  readonly objects = new Map<string, ObjectGeo>();
  readonly pads = new Map<string, PadDef>();
  readonly padList: PadDef[];
  readonly totalStars: number;

  constructor(readonly area: AreaDef) {
    for (const s of area.stations) {
      this.stations.set(s.id, {
        def: s,
        id: s.id,
        kind: s.kind,
        stat: s.stat,
        basket: s.basket ? toWorld(s.center, s.rot, s.basket) : null,
        pile: toWorld(s.center, s.rot, s.pile),
        lanes: s.lanes.map((l) => ({
          spot: toWorld(s.center, s.rot, l.spot),
          target: toWorld(s.center, s.rot, l.target),
          footprint: (l.footprint ?? []).map((r) => rectToWorld(s.center, s.rot, r)),
        })),
        footprint: s.footprint.map((r) => rectToWorld(s.center, s.rot, r)),
        queueStart: toWorld(s.center, s.rot, s.queueStart),
        queueStep: (() => {
          const a = toWorld({ x: 0, z: 0 }, s.rot, s.queueStep);
          return a;
        })(),
        cfg: BALANCE.stations[s.kind],
      });
    }
    for (const o of area.objects) {
      this.objects.set(o.id, { def: o, footprint: o.footprint.map((r) => rectToWorld(o.pos, o.rot, r)) });
    }
    for (const p of area.pads) this.pads.set(p.id, p);
    this.padList = area.pads;
    this.totalStars = area.pads.reduce((a, p) => a + p.stars, 0);
  }

  queueSlot(st: StationGeo, i: number): V2 {
    return { x: st.queueStart.x + st.queueStep.x * i, z: st.queueStart.z + st.queueStep.z * i };
  }

  /** Static walkable rects for NPC navigation (plot + street corridor to the bus). */
  walkable(): Rect[] {
    return this.area.walkable;
  }
}
