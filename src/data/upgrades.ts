/**
 * Manager's Office upgrades (GDD §4.7). Pure data: the sim reads effects through `Sim.up*()` helpers.
 * Cost of the next level = base × growth^level. Effects are per level (multiplicative or additive as noted).
 */

export type UpgradeTab = 'coach' | 'staff' | 'stations' | 'academy';

export type UpgradeId =
  | 'coach_speed'
  | 'coach_carry'
  | 'coach_sign'
  | 'coach_negotiation'
  | 'ballboy_speed'
  | 'ballboy_carry'
  | 'reception_speed'
  | 'assistant_drive'
  | 'st:shooting_goal'
  | 'st:dribble_cones'
  | 'st:passing_wall'
  | 'st:sprint_track'
  | 'academy_matchday'
  | 'academy_bus'
  | 'academy_offline';

export interface UpgradeDef {
  id: UpgradeId;
  tab: UpgradeTab;
  /** i18n key of the name; the effect line uses `up.<id>.fx` with {now} / {next}. */
  nameKey: string;
  icon: string;
  maxLevel: number;
  base: number;
  growth: number;
  /** Effect per level (e.g. 0.08 = +8 %). */
  step: number;
  /** What must exist before the upgrade can be bought: a built object/station id or a staff id. */
  requires?: { built?: string; staff?: string };
}

const up = (id: UpgradeId, tab: UpgradeTab, icon: string, maxLevel: number, base: number, growth: number, step: number, requires?: UpgradeDef['requires']): UpgradeDef => ({
  id,
  tab,
  nameKey: 'up.' + id,
  icon,
  maxLevel,
  base,
  growth,
  step,
  requires,
});

export const UPGRADES: UpgradeDef[] = [
  // Coach
  up('coach_speed', 'coach', 'move', 5, 600, 1.55, 0.07),
  up('coach_carry', 'coach', 'ball', 5, 700, 1.55, 1),
  up('coach_sign', 'coach', 'sign', 4, 550, 1.65, 0.15),
  up('coach_negotiation', 'coach', 'cash', 5, 1100, 1.6, 0.08),
  // Staff
  up('ballboy_speed', 'staff', 'staff', 5, 1000, 1.55, 0.12, { staff: 'ball_boy' }),
  up('ballboy_carry', 'staff', 'ball', 4, 1200, 1.65, 2, { staff: 'ball_boy' }),
  up('reception_speed', 'staff', 'sign', 4, 1500, 1.65, 0.2, { staff: 'receptionist' }),
  up('assistant_drive', 'staff', 'whistle', 4, 2100, 1.65, 0.08, { staff: 'assistant:shooting_goal' }),
  // Stations (drill level 1 → 5): faster reps and higher fees
  up('st:shooting_goal', 'stations', 'goal', 4, 800, 1.6, 0.12, { built: 'shooting_goal' }),
  up('st:dribble_cones', 'stations', 'cones', 4, 950, 1.6, 0.12, { built: 'dribble_cones' }),
  up('st:passing_wall', 'stations', 'wall', 4, 1200, 1.6, 0.12, { built: 'passing_wall' }),
  up('st:sprint_track', 'stations', 'track', 4, 1600, 1.6, 0.12, { built: 'sprint_track' }),
  // Academy
  up('academy_matchday', 'academy', 'trophy', 4, 1300, 1.65, 0.25, { built: 'match_pitch' }),
  up('academy_bus', 'academy', 'shelter', 4, 1000, 1.65, 0.1),
  // offline earnings cap: 1 h + 1 h per level (→ 4 h); step must match BALANCE.meta.offline.perLevelSec
  up('academy_offline', 'academy', 'clock', 3, 1500, 1.8, 3600),
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
