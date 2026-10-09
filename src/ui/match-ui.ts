import { t } from '../core/i18n';
import { BALANCE } from '../data/balance';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

/**
 * Match overlay: live score bar, GOAL!/SAVED! banners, the Power Shot timing meter and the Skip button.
 * Power Shot input: Space, a click or a tap anywhere (Escape is never bound).
 */
export class MatchUi {
  private readonly root: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly meter: HTMLDivElement;
  private readonly needle: HTMLDivElement;
  private readonly zone: HTMLDivElement;
  private readonly skipBtn: HTMLButtonElement;
  private meterCb: ((q: number) => void) | null = null;
  private meterT = 0;
  private zoneCenter = 0.5;
  private needlePos = 0;
  onSkip: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'match-ui hidden', parent);
    this.score = el('div', 'm-score', this.root);
    this.banner = el('div', 'm-banner hidden', this.root);
    this.meter = el('div', 'm-meter hidden', this.root);
    el('div', 'm-meter-label', this.meter, t('match.power_shot'));
    const bar = el('div', 'm-bar', this.meter);
    this.zone = el('div', 'm-zone', bar);
    this.needle = el('div', 'm-needle', bar);
    el('div', 'm-meter-hint', this.meter, t('match.power_hint'));
    this.skipBtn = el('button', 'm-skip hidden', this.root, t('match.skip'));
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip?.();
    });
    // the whole overlay catches the Power Shot tap/click while the meter is up
    this.root.addEventListener('pointerdown', (e) => {
      if (!this.meterCb || e.target === this.skipBtn) return;
      e.preventDefault();
      this.hit();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || !this.meterCb) return;
      e.preventDefault();
      this.hit();
    });
  }

  show(skippable: boolean): void {
    this.root.classList.remove('hidden');
    this.skipBtn.classList.toggle('hidden', !skippable);
    this.banner.classList.add('hidden');
    this.meter.classList.add('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.meterCb = null;
  }

  setScore(us: string, them: string, ourGoals: number, theirGoals: number, chance: number, chances: number): void {
    const dots = Array.from({ length: chances }, (_, i) => `<i class="${i < chance ? 'done' : i === chance ? 'now' : ''}"></i>`).join('');
    this.score.innerHTML = `<span class="ms-team us">${us}</span><b>${ourGoals} – ${theirGoals}</b><span class="ms-team">${them}</span><div class="ms-dots">${dots}</div>`;
  }

  flash(text: string, kind: 'goal' | 'miss' | 'info'): void {
    this.banner.className = `m-banner ${kind}`;
    this.banner.textContent = text;
    void this.banner.offsetWidth;
    this.banner.classList.add('in');
  }

  clearBanner(): void {
    this.banner.className = 'm-banner hidden';
  }

  /** Shows the timing meter; calls back once with quality 0..1 (tap, Space, or a weak auto-shot on timeout). */
  powerShot(cb: (q: number) => void): void {
    this.meterCb = cb;
    this.meterT = 0;
    this.zoneCenter = 0.3 + Math.random() * 0.4;
    this.zone.style.left = `${(this.zoneCenter - BALANCE.match.powerZone / 2) * 100}%`;
    this.zone.style.width = `${BALANCE.match.powerZone * 100}%`;
    this.meter.classList.remove('hidden');
  }

  get meterActive(): boolean {
    return this.meterCb !== null;
  }

  /** Real-time update (the meter runs in UI time, not sim time). */
  update(dt: number): void {
    if (!this.meterCb) return;
    this.meterT += dt;
    // ping-pong needle, speeding up slightly
    const sp = BALANCE.match.powerSpeed * (1 + this.meterT * 0.15);
    const ph = (this.meterT * sp) % 2;
    this.needlePos = ph < 1 ? ph : 2 - ph;
    this.needle.style.left = `${this.needlePos * 100}%`;
    if (this.meterT > BALANCE.match.powerTimeout) {
      const cb = this.meterCb;
      this.meterCb = null;
      this.meter.classList.add('hidden');
      cb(0.2);
    }
  }

  private hit(): void {
    const cb = this.meterCb;
    if (!cb) return;
    this.meterCb = null;
    const d = Math.abs(this.needlePos - this.zoneCenter);
    const half = BALANCE.match.powerZone / 2;
    // perfect inside the zone, falling off over another zone width
    const q = d <= half ? 1 : Math.max(0, 1 - (d - half) / (half * 2.5));
    this.meter.classList.add('hidden');
    cb(q);
  }
}
