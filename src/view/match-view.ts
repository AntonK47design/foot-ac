import type { Object3D, Scene } from 'three';
import { t } from '../core/i18n';
import type { Rect, V2 } from '../data/types';
import type { Chance, MatchPlayer, MatchScript } from '../sim/match';
import type { MatchUi } from '../ui/match-ui';
import type { LabelLayer } from '../ui/labels';
import type { Assets, CharacterKey } from './assets';
import type { AudioSystem } from './audio';
import type { CameraRig } from './camera';
import { Character, KITS, type CharAnim, type Kit } from './characters';
import type { Fx } from './fx';

const KIDS_M: CharacterKey[] = ['male-a', 'male-e', 'male-f'];
const KIDS_F: CharacterKey[] = ['female-b', 'female-c', 'female-d', 'female-e', 'female-f'];
const KID_SCALE = 1.6;
const RUN_SPEED = 5.2;

type BallAt = (x: number, y: number, z: number, rot?: number, scale?: number) => void;

interface Body {
  c: Character;
  x: number;
  z: number;
  tx: number;
  tz: number;
  /** Facing direction override (look at the ball when standing). */
  lookX: number;
  lookZ: number;
  oneShot: number;
}

type Phase = 'depart' | 'travel' | 'arrive' | 'intro' | 'setup' | 'build' | 'pass' | 'aim' | 'shot' | 'react' | 'end' | 'results' | 'return' | 'done';

/** Team bus trip: where it parks at the academy and where it stops at the stadium. */
export interface Trip {
  bus: Object3D;
  park: V2;
  stop: V2;
  place: string;
  /** Camera back on the coach after the trip. */
  home(): void;
}

export interface MatchHooks {
  /** Resolves chance i with Power Shot quality q (0..1); returns goal. */
  resolve(i: number, q: number): boolean;
  /** All chances played (or skipped): show results. */
  done(): void;
}

/**
 * Scripted highlight reel on the match pitch (GDD §4.5): 3–5 chances with choreographed runs and passes.
 * Pure presentation: outcomes come from the sim (pre-rolled, Power Shot quality only for ours).
 */
export class MatchDirector {
  active = false;
  private script: MatchScript | null = null;
  private hooks: MatchHooks | null = null;
  private ours: Body[] = [];
  private theirs: Body[] = [];
  private phase: Phase = 'done';
  private phaseT = 0;
  private idx = 0;
  private ourGoals = 0;
  private theirGoals = 0;
  private timeScale = 1;
  private ball = { x: 0, y: 0.15, z: 0, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, k: 0, dur: 1, spin: 0 };
  private goal = false;
  private quality = 0.5;
  private ourName = '';
  private time = 0;
  private portrait = false;

  constructor(
    private readonly scene: Scene,
    private readonly assets: Assets,
    private readonly rig: CameraRig,
    private readonly fx: Fx,
    private readonly audio: AudioSystem,
    private readonly labels: LabelLayer,
    private readonly ui: MatchUi,
    private readonly rect: Rect,
    private readonly goalW: number,
    private readonly ripple: (east: boolean) => void,
    private readonly trip: Trip,
  ) {}

  /** Pitch scale relative to the 13 × 5.2 m layout the choreography was designed on. */
  private get sx(): number {
    return (this.rect.x1 - this.rect.x0) / 13;
  }

  private get sz(): number {
    return (this.rect.z1 - this.rect.z0) / 5.2;
  }

  private get cx(): number {
    return (this.rect.x0 + this.rect.x1) / 2;
  }

  private get cz(): number {
    return (this.rect.z0 + this.rect.z1) / 2;
  }

  start(script: MatchScript, ourName: string, skippable: boolean, hooks: MatchHooks): void {
    this.script = script;
    this.hooks = hooks;
    this.ourName = ourName;
    this.active = true;
    this.idx = 0;
    this.ourGoals = 0;
    this.theirGoals = 0;
    const oppKit: Kit = { shirt: script.opponent.shirt, shorts: script.opponent.shorts, socks: script.opponent.shirt, trim: 0xffffff };
    this.ours = script.lineup.map((p, i) => this.body(p, KITS.academy, i));
    this.theirs = script.lineup.map((_, i) => this.body(null, oppKit, i + 31 * (script.opponent.id.length + 1)));
    for (const b of [...this.ours, ...this.theirs]) b.c.root.visible = false;
    this.portrait = this.rig.aspect < 1;
    this.ui.show(skippable);
    this.ui.onSkip = () => this.skip();
    this.updateScore();
    // the team bus pulls out of the academy street…
    const T = this.trip;
    T.bus.position.set(T.park.x, -0.3, T.park.z);
    T.bus.rotation.y = 0;
    T.bus.visible = true;
    this.rig.setHold({ x: T.park.x - 2, z: T.park.z, w: this.portrait ? 11 : 17 });
    this.audio.play('honk');
    this.setPhase('depart');
  }

  /** Match framing: landscape shows the whole pitch; portrait zooms in and follows the ball. */
  private holdPitch(): void {
    const w = this.portrait ? 10 : this.rect.x1 - this.rect.x0 + 3;
    this.rig.setHold({ x: this.cx, z: this.cz + (this.portrait ? -0.6 : 0.6), w });
  }

  private body(p: MatchPlayer | null, kit: Kit, seed: number): Body {
    const female = p ? p.female : seed % 2 === 0;
    const pool = female ? KIDS_F : KIDS_M;
    const model = pool[Math.abs((p ? p.id : seed) * 7 + seed) % pool.length] as CharacterKey;
    const c = new Character(this.assets, model, kit, KID_SCALE);
    this.scene.add(c.root);
    c.play('idle', 0);
    c.seek((seed * 0.37) % 1.5);
    return { c, x: 0, z: 0, tx: 0, tz: 0, lookX: 0, lookZ: 0, oneShot: 0 };
  }

  /** Kick-off positions: we defend west (x0) and attack east. */
  private formation(): void {
    const { cx, cz, sx, sz } = this;
    const r = this.rect;
    const ours: Array<[number, number]> = [
      [r.x0 + 0.5, cz],
      [cx - 3.6 * sx, cz - 1.6 * sz],
      [cx - 3.6 * sx, cz + 1.6 * sz],
      [cx - 1.2 * sx, cz - 1.5 * sz],
      [cx - 1.2 * sx, cz + 1.5 * sz],
      // 7-a-side: a holding midfielder and a striker
      [cx - 2.4 * sx, cz],
      [cx - 0.5 * sx, cz],
      // 11-a-side (Youth Stadium): two centre-backs and two wingers
      [cx - 3.9 * sx, cz - 0.6 * sz],
      [cx - 3.9 * sx, cz + 0.6 * sz],
      [cx - 0.9 * sx, cz - 2.2 * sz],
      [cx - 0.9 * sx, cz + 2.2 * sz],
    ];
    ours.forEach(([x, z], i) => this.target(this.ours[i], x, z));
    ours.forEach(([x, z], i) => this.target(this.theirs[i], 2 * cx - x, z));
  }

  private target(b: Body | undefined, x: number, z: number): void {
    if (!b) return;
    b.tx = x;
    b.tz = z;
  }

  private entered = false;

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.entered = false;
  }

  /** True once, on the first update of the current phase. */
  private enter(): boolean {
    if (this.entered) return false;
    this.entered = true;
    return true;
  }

  private chance(): Chance | undefined {
    return this.script?.chances[this.idx];
  }

  /** Attackers / defenders for the current chance. */
  private sides(c: Chance): { att: Body[]; def: Body[]; dir: number } {
    return c.side === 'us' ? { att: this.ours, def: this.theirs, dir: 1 } : { att: this.theirs, def: this.ours, dir: -1 };
  }

  private kickBall(tx: number, ty: number, tz: number, dur: number): void {
    const b = this.ball;
    b.fx = b.x;
    b.fy = b.y;
    b.fz = b.z;
    b.tx = tx;
    b.ty = ty;
    b.tz = tz;
    b.k = 0;
    b.dur = dur;
  }

  skip(): void {
    if (!this.script || !this.hooks) return;
    if (this.phase === 'depart' || this.phase === 'travel' || this.phase === 'arrive') this.arriveNow();
    for (let i = this.idx; i < this.script.chances.length; i++) this.hooks.resolve(i, 0.5);
    this.finish();
  }

  /** Match over (played or skipped): results are shown while the team celebrates at the stadium. */
  private finish(): void {
    const hooks = this.hooks;
    this.hooks = null;
    this.timeScale = 1;
    this.ui.hide();
    this.setPhase('results');
    hooks?.done();
  }

  /** After the results: the bus takes everyone home. */
  goHome(): void {
    if (!this.active) return;
    this.ui.fade(t('match.travel_home'), 1200);
    this.setPhase('return');
  }

  private cleanup(): void {
    for (const b of [...this.ours, ...this.theirs]) this.scene.remove(b.c.root);
    this.ours = [];
    this.theirs = [];
    this.active = false;
    this.phase = 'done';
    this.script = null;
    this.hooks = null;
    this.ui.hide();
    const T = this.trip;
    T.bus.position.set(T.park.x, -0.3, T.park.z);
    T.bus.rotation.y = 0;
    this.rig.setHold(null);
    T.home();
  }

  /** The bus is at the stadium: the teams run out from the door (north side of the bus) to their kick-off spots. */
  private arriveNow(): void {
    const T = this.trip;
    T.bus.rotation.y = -Math.PI / 2;
    T.bus.position.set(T.stop.x, -0.3, T.stop.z);
    const door = { x: T.stop.x - 1.9, z: T.stop.z - 1.6 };
    this.formation();
    [...this.ours, ...this.theirs].forEach((b, i) => {
      b.c.root.visible = true;
      // ours from the bus, theirs already warming up on the pitch
      if (i < this.ours.length) {
        b.x = door.x + (i % 3) * 0.5;
        b.z = door.z - Math.floor(i / 3) * 0.5;
      } else {
        b.x = b.tx;
        b.z = b.tz;
      }
    });
    this.ball.x = this.cx;
    this.ball.z = this.cz;
    this.ball.y = 0.15;
    this.ball.k = 1;
    this.holdPitch();
    this.ui.flash(t(this.script?.cup ? 'cup.kickoff_vs' : 'match.kickoff_vs', { team: this.script?.opponent.name ?? '' }), 'info');
    this.audio.play('whistle');
    this.setPhase('intro');
  }

  private updateScore(): void {
    const s = this.script;
    if (!s) return;
    this.ui.setScore(this.ourName, s.opponent.name, this.ourGoals, this.theirGoals, this.idx, s.chances.length);
  }

  update(realDt: number, ballAt: BallAt): void {
    if (!this.active) return;
    this.ui.update(realDt);
    const dt = realDt * this.timeScale;
    this.time += dt;
    this.phaseT += dt;
    const T = this.trip;
    // ── trip phases (no script needed)
    switch (this.phase) {
      case 'depart': {
        const k = Math.min(1, this.phaseT / 2.0);
        T.bus.position.z = T.park.z + 16 * k * k;
        this.rig.moveHold(T.park.x - 2, T.bus.position.z - 1);
        if (this.enter()) window.setTimeout(() => this.active && this.ui.fade(t('match.travel_out', { place: T.place }), 1500), 1300);
        if (this.phaseT > 2.0) this.setPhase('travel');
        return;
      }
      case 'travel':
        // the screen is dark: jump to the stadium road
        if (this.enter()) {
          T.bus.rotation.y = -Math.PI / 2;
          T.bus.position.set(T.stop.x + 16, -0.3, T.stop.z);
          // frame the road and the near touchline: the bus pulls up, then the camera eases onto the pitch
          const fz = T.stop.z - 3.5;
          this.rig.setHold({ x: T.stop.x, z: fz, w: this.portrait ? 12 : 18 });
          this.rig.snap(T.stop.x, fz);
        }
        if (this.phaseT > 0.5) this.setPhase('arrive');
        return;
      case 'arrive': {
        const k = Math.min(1, this.phaseT / 1.8);
        T.bus.position.x = T.stop.x + 16 * (1 - k) * (1 - k);
        if (k >= 1) this.arriveNow();
        return;
      }
      case 'results':
        this.moveBodies(dt);
        return;
      case 'return':
        if (this.phaseT > 0.6) this.cleanup();
        return;
    }
    if (!this.script) return;
    const c = this.chance();
    const { cx, cz } = this;
    const r = this.rect;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT > 2.2) {
          this.ui.clearBanner();
          this.setPhase('setup');
        }
        break;
      case 'setup': {
        if (!c) {
          this.setPhase('end');
          break;
        }
        if (this.enter()) {
          this.formation();
          const { att } = this.sides(c);
          const passer = att[c.passer] ?? att[1];
          if (passer) {
            this.ball.x = passer.tx;
            this.ball.z = passer.tz;
            this.ball.y = 0.15;
            this.ball.k = 1;
          }
          this.updateScore();
        }
        if (this.phaseT > 0.9) this.setPhase('build');
        break;
      }
      case 'build': {
        if (!c) break;
        const { att, def, dir } = this.sides(c);
        const side = c.shooter % 2 === 0 ? 1 : -1;
        const passer = att[c.passer];
        const shooter = att[c.shooter];
        if (this.enter()) {
          const { sx, sz } = this;
          if (passer) this.target(passer, cx + dir * 1.2 * sx, cz + side * 1.8 * sz);
          if (shooter) this.target(shooter, cx + dir * (r.x1 - r.x0) * 0.3, cz - side * 0.7 * sz);
          // the other attackers support wide, defenders mark the shooter and press the passer, the keeper covers
          att.forEach((b, i) => {
            if (i > 0 && b !== passer && b !== shooter) this.target(b, cx + dir * (i % 2 ? 0.2 : -1.0) * sx, cz - side * (i % 2 ? 1.9 : -0.2) * sz);
          });
          this.target(def[1], cx + dir * ((r.x1 - r.x0) * 0.3 + 0.9), cz - side * 0.2 * sz);
          this.target(def[2], cx + dir * 2.2 * sx, cz + side * 1.9 * sz);
          this.target(def[3], cx - dir * 0.6 * sx, cz - side * 1.9 * sz);
          this.target(def[4], cx + dir * 0.4 * sx, cz + side * 0.6 * sz);
        }
        if (passer) {
          this.ball.x = passer.x + dir * 0.35;
          this.ball.z = passer.z;
          this.ball.y = 0.15;
          this.ball.spin += dt * 12;
        }
        if (this.phaseT > 1.4) {
          if (shooter) this.kickBall(shooter.tx - dir * 0.3, 0.15, shooter.tz, 0.5);
          if (passer) passer.oneShot = 0.6;
          passer?.c.play('kick', 0.08, 1.3);
          this.audio.play('kick', 1.1);
          this.setPhase('pass');
        }
        break;
      }
      case 'pass':
        if (this.phaseT > 0.5) {
          if (c?.power) {
            this.timeScale = 0.18;
            this.ui.flash(t('match.your_shot'), 'info');
            this.ui.powerShot((q) => {
              this.quality = q;
              this.timeScale = 1;
              this.ui.flash(q >= 0.99 ? t('match.perfect') : q >= 0.5 ? t('match.good') : t('match.weak'), 'info');
              this.shoot();
            });
            this.setPhase('aim');
          } else {
            this.quality = 0.5;
            this.shoot();
          }
        }
        break;
      case 'aim':
        break;
      case 'shot':
        if (this.ball.k >= 1 && this.phaseT > 0.55) this.react();
        break;
      case 'react':
        if (this.phaseT > 1.6) {
          this.ui.clearBanner();
          this.idx++;
          this.setPhase(this.idx >= this.script.chances.length ? 'end' : 'setup');
        }
        break;
      case 'end':
        if (this.enter()) {
          this.updateScore();
          this.ui.flash(t('match.full_time'), 'info');
          this.audio.play('whistle');
          this.audio.play('whistle', 0.8);
        }
        if (this.phaseT > 1.6) this.finish();
        return;
      case 'done':
        return;
    }
    this.moveBodies(dt);
    this.moveBall(dt, ballAt);
    if (this.portrait) this.rig.moveHold(Math.max(r.x0 + 3.5, Math.min(r.x1 - 3.5, this.ball.x)), this.cz - 0.6);
  }

  private shoot(): void {
    const c = this.chance();
    const hooks = this.hooks;
    if (!c || !hooks) return;
    this.goal = hooks.resolve(this.idx, this.quality);
    const { att, def, dir } = this.sides(c);
    const shooter = att[c.shooter];
    shooter?.c.play('kick', 0.06, 1.4);
    if (shooter) shooter.oneShot = 0.6;
    this.audio.play('kick', 0.8);
    const gx = dir > 0 ? this.rect.x1 : this.rect.x0;
    const half = this.goalW / 2;
    const corner = (this.idx % 2 === 0 ? 1 : -1) * half * 0.6;
    const keeper = def[0];
    if (this.goal) {
      this.kickBall(gx + dir * 0.55, 0.5 + Math.abs(corner) * 0.25, this.cz + corner, 0.45);
      // keeper dives the wrong way
      if (keeper) this.target(keeper, gx - dir * 0.4, this.cz - corner * 0.8);
    } else if (c.roll < 0.5 || c.power) {
      // saved: the keeper gets there
      if (keeper) this.target(keeper, gx - dir * 0.6, this.cz + corner * 0.8);
      this.kickBall(gx - dir * 0.6, 0.4, this.cz + corner * 0.8, 0.45);
    } else {
      this.kickBall(gx + dir * 0.4, 0.9, this.cz + Math.sign(corner || 1) * (half + 0.7), 0.5);
    }
    this.setPhase('shot');
  }

  private react(): void {
    const c = this.chance();
    if (!c) return;
    const { att, def } = this.sides(c);
    const east = c.side === 'us';
    if (this.goal) {
      if (c.side === 'us') this.ourGoals++;
      else this.theirGoals++;
      this.updateScore();
      this.ui.flash(t('match.goal'), c.side === 'us' ? 'goal' : 'miss');
      this.audio.play('net');
      this.audio.play('cheer');
      this.ripple(east);
      this.fx.burst(this.ball.x, 1.0, this.ball.z, c.side === 'us' ? 60 : 20, 0.7);
      for (const b of att) {
        b.c.play('cheer', 0.1);
        b.oneShot = 1.2;
      }
    } else {
      const saved = Math.abs(this.ball.z - this.cz) < this.goalW / 2 + 0.2;
      this.ui.flash(saved ? t('match.saved') : t('match.wide'), c.side === 'us' ? 'miss' : 'goal');
      if (c.side === 'them') for (const b of def) {
        b.c.play('cheer', 0.1);
        b.oneShot = 1.2;
      }
      // ball settles with the keeper / rolls out
      this.kickBall(this.ball.x, 0.15, this.ball.z, 0.4);
    }
    this.setPhase('react');
  }

  private moveBodies(dt: number): void {
    const bx = this.ball.x;
    const bz = this.ball.z;
    for (const b of [...this.ours, ...this.theirs]) {
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      let anim: CharAnim = 'idle';
      if (d > 0.05) {
        const step = Math.min(d, RUN_SPEED * dt);
        b.x += (dx / d) * step;
        b.z += (dz / d) * step;
        b.c.root.rotation.y = Math.atan2(dx, dz);
        anim = 'run';
      } else {
        b.c.root.rotation.y = Math.atan2(bx - b.x, bz - b.z);
      }
      b.c.root.position.set(b.x, 0, b.z);
      if (b.oneShot > 0) b.oneShot -= dt;
      else b.c.play(anim, 0.15, anim === 'run' ? 1.1 : 1);
      b.c.update(dt, 60);
    }
    const c = this.chance();
    if (c && (this.phase === 'build' || this.phase === 'pass' || this.phase === 'aim')) {
      const { att } = this.sides(c);
      const sh = att[c.shooter];
      const name = c.side === 'us' ? this.script?.lineup[c.shooter]?.name.split(' ')[0] : null;
      if (sh && name) this.labels.place('m-shooter', sh.x, 2.25, sh.z, '', `<div class="bubble mname">${name}</div>`);
    }
  }

  private moveBall(dt: number, ballAt: BallAt): void {
    const b = this.ball;
    if (b.k < 1) {
      b.k = Math.min(1, b.k + dt / b.dur);
      const k = b.k;
      b.x = b.fx + (b.tx - b.fx) * k;
      b.z = b.fz + (b.tz - b.fz) * k;
      b.y = b.fy + (b.ty - b.fy) * k + Math.sin(k * Math.PI) * 0.6 * Math.min(1, b.dur);
      b.spin += dt * 20;
    }
    ballAt(b.x, b.y, b.z, b.spin, 0.3);
  }
}
