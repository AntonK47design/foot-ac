import { BALANCE } from '../data/balance';
import { computeObjective, type Objective } from './objectives';
import type { Sim } from './sim';
import { CORE_STEPS, coreProgress, currentStep } from './tutorial';

export type GuideMode = 'tutorial' | 'lost' | 'hidden';

/** Hints that earn towards the next build of the opening line (see objectives.earnObjective). */
const EARN_KEYS = new Set(['obj.collect_cash', 'obj.collect_fees', 'obj.podium', 'obj.sign', 'obj.grab_balls', 'obj.bring_balls', 'obj.grab_water', 'obj.bring_water', 'obj.grab_bibs', 'obj.bring_bibs']);

/**
 * What the player is told to do (objective pill + guide arrow).
 * - tutorial: the fixed route (sim/tutorial.ts), step by step;
 * - otherwise hidden, so the player plans their own route;
 * - lost: after standing still or a long stretch without progress, the best next thing is shown and stays put
 *   (re-picked at most every `lostRefreshSec`) until the player makes progress.
 * Pure sim logic: the host reads `objective` / `mode` and listens for 'guideChanged'.
 */
export class Guide {
  objective: Objective | null = null;
  mode: GuideMode = 'hidden';
  private idle = 0;
  private sinceProgress = 0;
  private lostT = 0;
  /** Seconds the current tutorial objective has been shown (earn hints are held a moment: no flicker). */
  private heldT = 0;

  constructor(private readonly sim: Sim) {
    const progress = (): void => this.progress();
    const ev = sim.events;
    ev.on('unlocked', progress);
    ev.on('signed', progress);
    ev.on('cashCollected', progress);
    ev.on('upgraded', progress);
    ev.on('matchFinished', progress);
    ev.on('sold', progress);
    ev.on('promoted', progress);
    ev.on('ballDropped', (e) => {
      if (!e.byStaff) progress();
    });
  }

  private progress(): void {
    this.sinceProgress = 0;
    if (this.mode === 'lost') this.set('hidden', null);
  }

  /**
   * Keeps showing the current "earn towards the next build" hint for a moment when the best one changes (a player
   * sitting down at the desk shouldn't swap the arrow mid-run). Never holds back the build itself, the next step,
   * or "bring" once the coach has the supplies.
   */
  private holdEarnHint(o: Objective | null): boolean {
    const prev = this.objective;
    if (!prev || !o || this.mode !== 'tutorial' || prev.step?.n !== o.step?.n) return false;
    if (!EARN_KEYS.has(prev.key) || !EARN_KEYS.has(o.key)) return false;
    if (prev.key === o.key && prev.targetId === o.targetId) return false;
    if (o.key.startsWith('obj.bring_') && this.sim.state.coach.carry > 0) return false;
    return this.heldT < BALANCE.objectives.earnHoldSec;
  }

  private set(mode: GuideMode, o: Objective | null): void {
    const prev = this.objective;
    const changed = mode !== this.mode || !prev !== !o || (prev && o && (prev.key !== o.key || prev.targetId !== o.targetId || prev.params?.name !== o.params?.name || prev.step?.n !== o.step?.n));
    this.mode = mode;
    this.objective = o;
    if (changed) this.heldT = 0;
    if (changed) this.sim.events.emit('guideChanged', { objective: o, mode });
  }

  update(dt: number): void {
    const sim = this.sim;
    const c = sim.state.coach;
    this.idle = Math.hypot(c.vx, c.vz) < 0.2 ? this.idle + dt : 0;
    this.sinceProgress += dt;
    const step = currentStep(sim);
    if (step) {
      const o = step.objective(sim);
      const n = coreProgress(sim);
      if (o && n > 0) o.step = { n, total: CORE_STEPS.length };
      this.heldT += dt;
      if (this.holdEarnHint(o)) return;
      this.set('tutorial', o);
      return;
    }
    const OB = BALANCE.objectives;
    if (this.mode === 'lost') {
      this.lostT += dt;
      if (this.lostT >= OB.lostRefreshSec) {
        this.lostT = 0;
        this.set('lost', computeObjective(sim));
      }
      return;
    }
    if (this.idle >= OB.lostIdleSec || this.sinceProgress >= OB.lostNoProgressSec) {
      this.lostT = 0;
      this.sinceProgress = 0;
      this.set('lost', computeObjective(sim));
      return;
    }
    if (this.mode !== 'hidden') this.set('hidden', null);
  }
}
