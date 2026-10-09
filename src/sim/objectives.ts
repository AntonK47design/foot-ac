import { BALANCE } from '../data/balance';
import type { IconId, Supply } from '../data/types';
import { dist2 } from './geom';
import { firstName } from './players';
import type { Sim } from './sim';

export type ObjectiveIcon = IconId | 'cash' | 'sign' | 'move';

export interface Objective {
  /** i18n key */
  key: string;
  params?: Record<string, string | number>;
  icon: ObjectiveIcon;
  x: number;
  z: number;
  targetId: string;
  /** World radius of the target zone (for the arrow / bot). */
  radius: number;
}

/**
 * Picks what the player should do next. Order: tutorial cash → affordable pad → collect cash towards
 * the next pad → starving station → sign → refill → collect → save up.
 * This also drives the economy bot, so it must always return something sensible.
 */
export function computeObjective(sim: Sim): Objective | null {
  const s = sim.state;
  const c = s.coach;
  const area = sim.area;

  // 1. tutorial: first cash pile
  if (!s.flags.firstCash) {
    const p = sim.pile('starter_a');
    if (p && p.amount > 0) return { key: 'obj.collect_cash', icon: 'cash', x: p.x, z: p.z, targetId: p.id, radius: BALANCE.cash.collectRadius };
  }

  // 2. a graduate waits in the office: sell or promote at the computer (the big payout moment)
  const grad = sim.podiumGraduate();
  if (grad) {
    const P = area.office.computer;
    return { key: 'obj.podium', params: { name: firstName(grad) }, icon: 'podium', x: P.x, z: P.z, targetId: 'podium', radius: BALANCE.transfer.zoneRadius };
  }

  const pads = sim.visiblePads();
  let cheapest = null as (typeof pads)[number] | null;
  for (const p of pads) if (!cheapest || sim.padRemaining(p) < sim.padRemaining(cheapest)) cheapest = p;

  // 4. an affordable pad
  let bestPad = null as (typeof pads)[number] | null;
  for (const p of pads) {
    if (s.cash + 1e-6 >= sim.padRemaining(p) && (!bestPad || sim.padRemaining(p) < sim.padRemaining(bestPad))) bestPad = p;
  }
  // keep paying the pad we're standing on
  if (c.padId && sim.paying) {
    const on = sim.world.pads.get(c.padId);
    if (on) bestPad = on;
  }
  if (bestPad) {
    return { key: 'obj.unlock', params: { name: bestPad.nameKey }, icon: bestPad.icon, x: bestPad.pos.x, z: bestPad.pos.z, targetId: bestPad.id, radius: BALANCE.pad.radius };
  }

  // 5. collect cash if the piles would make the next pad affordable
  let pileTotal = 0;
  for (const p of s.piles) pileTotal += Math.floor(p.amount);
  const nearestPile = (): (typeof s.piles)[number] | null => {
    let best = null as (typeof s.piles)[number] | null;
    let bestD = Infinity;
    for (const p of s.piles) {
      if (p.amount < 1) continue;
      const d = dist2(c.x, c.z, p.x, p.z) / Math.max(1, p.amount);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };
  if (cheapest && s.cash + pileTotal >= sim.padRemaining(cheapest)) {
    const p = nearestPile();
    if (p) return { key: 'obj.collect_cash', icon: 'cash', x: p.x, z: p.z, targetId: p.id, radius: BALANCE.cash.collectRadius };
  }

  // 3. a trainee is blocked by an empty basket and nobody else will refill it (balls, then water)
  for (const supply of SUPPLIES) {
    if (!needsCoach(sim, supply)) continue;
    let starving: string | null = null;
    for (const t of s.trainees) if (sim.isWaitingForBalls(t) && t.stationId && sim.station(t.stationId).supply === supply) starving = t.stationId;
    if (starving) return ballObjective(sim, starving);
  }

  // 5a. sign a waiting trainee (until a receptionist exists)
  const dt = sim.deskTrainee();
  if (dt && sim.canSign()) {
    const sp = area.desk.coachSpot;
    return { key: 'obj.sign', params: { name: firstName(dt) }, icon: 'sign', x: sp.x, z: sp.z, targetId: 'desk', radius: BALANCE.desk.zoneRadius };
  }

  // 5b. a match is ready on the match pitch
  if (sim.matchAvailable()) {
    const K = area.matchPitch.kickoff;
    return { key: 'obj.kickoff', icon: 'pitch', x: K.x, z: K.z, targetId: 'kickoff', radius: BALANCE.match.kickoffRadius };
  }

  // 6. keep baskets topped up while nobody automates it
  for (const supply of SUPPLIES) {
    if (!needsCoach(sim, supply)) continue;
    const need = sim.neediestStation(0.4, undefined, supply);
    if (!need) continue;
    const ss = s.stations[need];
    let demand = 0;
    if (ss) {
      for (const o of ss.occupants) if (o) demand++;
      demand += ss.queue.length;
    }
    if (demand > 0 || (c.carry > 0 && sim.coachCarryKind() === supply)) return ballObjective(sim, need);
  }

  // 6b. an upgrade at the office computer (only when it doesn't stall saving up for the next pad)
  const up = sim.cheapestUpgrade();
  if (up && s.cash + 1e-6 >= up.cost && sim.upgradeFitsBudget(up.cost)) {
    const P = area.office.computer;
    return { key: 'obj.upgrade', icon: 'podium', x: P.x, z: P.z, targetId: 'office', radius: BALANCE.transfer.zoneRadius };
  }

  // 7. any decent pile
  if (pileTotal >= BALANCE.objectives.minPileWorth) {
    const p = nearestPile();
    if (p) return { key: 'obj.collect_cash', icon: 'cash', x: p.x, z: p.z, targetId: p.id, radius: BALANCE.cash.collectRadius };
  }

  // 8. save up for the cheapest pad
  if (cheapest) {
    return {
      key: 'obj.save_for',
      params: { name: cheapest.nameKey, cost: Math.ceil(sim.padRemaining(cheapest)) },
      icon: cheapest.icon,
      x: cheapest.pos.x,
      z: cheapest.pos.z,
      targetId: cheapest.id,
      radius: BALANCE.pad.radius,
    };
  }
  return null;
}

const SUPPLIES: readonly Supply[] = ['ball', 'water'];

/** The coach has to run this supply: its source is built and no runner (ball boy / water carrier) does it. */
function needsCoach(sim: Sim, supply: Supply): boolean {
  if (!sim.supplySource(supply)) return false;
  return !sim.hasStaff(supply === 'water' ? 'water_carrier' : 'ball_boy');
}

function ballObjective(sim: Sim, stationId: string): Objective {
  const c = sim.state.coach;
  const st = sim.station(stationId);
  const supply: Supply = st.supply ?? 'ball';
  const water = supply === 'water';
  const src = sim.supplySource(supply) ?? sim.area.crate.spot;
  const cap = sim.carryCap();
  const zr = BALANCE.crate.zoneRadius;
  const nearSrc = dist2(c.x, c.z, src.x, src.z) <= zr * zr;
  const holding = c.carry > 0 && sim.coachCarryKind() === supply;
  if ((holding && c.carry >= cap) || (holding && !nearSrc)) {
    const b = st.basket ?? st.pile;
    return { key: water ? 'obj.bring_water' : 'obj.bring_balls', icon: water ? 'water' : 'ball', x: b.x, z: b.z, targetId: 'basket:' + stationId, radius: BALANCE.basket.zoneRadius };
  }
  return { key: water ? 'obj.grab_water' : 'obj.grab_balls', icon: water ? 'water' : 'ball', x: src.x, z: src.z, targetId: water ? 'water' : 'crate', radius: BALANCE.crate.zoneRadius };
}
