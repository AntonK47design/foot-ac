import { BALANCE } from '../data/balance';
import { computeObjective, type Objective } from './objectives';
import type { Sim } from './sim';
import { currentStep } from './tutorial';

export type GuideMode = 'tutorial' | 'lost' | 'hidden';

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

  private set(mode: GuideMode, o: Objective | null): void {
    const prev = this.objective;
    const changed = mode !== this.mode || !prev !== !o || (prev && o && (prev.key !== o.key || prev.targetId !== o.targetId || prev.params?.name !== o.params?.name));
    this.mode = mode;
    this.objective = o;
    if (changed) this.sim.events.emit('guideChanged', { objective: o, mode });
  }

  update(dt: number): void {
    const sim = this.sim;
    const c = sim.state.coach;
    this.idle = Math.hypot(c.vx, c.vz) < 0.2 ? this.idle + dt : 0;
    this.sinceProgress += dt;
    const step = currentStep(sim);
    const stepObj = step ? step.objective(sim) : null;
    // a route step that is something to do: show it. A "save up" step stays put like a goal; if the player then
    // stands still or nothing happens for a while, the lost hint shows what earns the money (that pad stays the
    // only one it points at), and the step comes back on the next bit of progress
    const saving = stepObj?.key === 'obj.save_for';
    if (step && !saving) {
      this.set('tutorial', stepObj);
      return;
    }
    const focus = saving ? stepObj?.targetId : undefined;
    const OB = BALANCE.objectives;
    if (this.mode === 'lost') {
      this.lostT += dt;
      if (this.lostT >= OB.lostRefreshSec) {
        this.lostT = 0;
        this.set('lost', computeObjective(sim, focus));
      }
      return;
    }
    if (this.idle >= OB.lostIdleSec || this.sinceProgress >= OB.lostNoProgressSec) {
      this.lostT = 0;
      this.sinceProgress = 0;
      this.set('lost', computeObjective(sim, focus) ?? stepObj);
      return;
    }
    if (step) this.set('tutorial', stepObj);
    else if (this.mode !== 'hidden') this.set('hidden', null);
  }
}
