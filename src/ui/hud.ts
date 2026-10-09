import { formatCash, formatNumber, t, hasKey } from '../core/i18n';
import type { Objective } from '../sim/objectives';
import { icon } from './icons';
import type { InputMethod } from './input';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

/** Top HUD: settings + level badge, star bar, cash, objective pill, hint, toasts, edge arrow. */
export class Hud {
  readonly root: HTMLDivElement;
  readonly gear: HTMLButtonElement;
  private readonly cashText: HTMLSpanElement;
  private readonly cashBox: HTMLDivElement;
  private readonly starFill: HTMLDivElement;
  private readonly starText: HTMLSpanElement;
  private readonly levelText: HTMLSpanElement;
  private readonly portrait: HTMLDivElement;
  private readonly levelRing: SVGCircleElement;
  private readonly objPill: HTMLDivElement;
  private readonly objIcon: HTMLSpanElement;
  private readonly objText: HTMLSpanElement;
  private readonly hint: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  readonly edge: HTMLDivElement;
  private shownCash = 0;
  private targetCash = 0;
  private hintMethod: InputMethod | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const tl = el('div', 'hud-tl', this.root);
    this.gear = el('button', 'btn-round gear', tl, icon('gear'));
    this.gear.setAttribute('aria-label', t('hud.settings'));
    const badge = el('div', 'badge', tl);
    badge.innerHTML = `<div class="portrait"></div><svg viewBox="0 0 44 44" class="ring"><circle cx="22" cy="22" r="19" class="ring-bg"/><circle cx="22" cy="22" r="19" class="ring-fg"/></svg>`;
    this.portrait = badge.querySelector('.portrait') as HTMLDivElement;
    this.levelRing = badge.querySelector('.ring-fg') as SVGCircleElement;
    this.levelText = el('span', 'badge-lv', badge);

    const tc = el('div', 'hud-tc', this.root);
    const bar = el('div', 'starbar', tc);
    el('span', 'starbar-icon', bar, icon('star'));
    const track = el('div', 'starbar-track', bar);
    this.starFill = el('div', 'starbar-fill', track);
    this.starText = el('span', 'starbar-text', track);

    const tr = el('div', 'hud-tr', this.root);
    this.cashBox = el('div', 'cash', tr);
    el('span', 'cash-icon', this.cashBox, icon('cash'));
    this.cashText = el('span', 'cash-text', this.cashBox, '$0');

    this.objPill = el('div', 'objective hidden', this.root);
    this.objIcon = el('span', 'obj-icon', this.objPill);
    this.objText = el('span', 'obj-text', this.objPill);

    this.hint = el('div', 'hint hidden', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.edge = el('div', 'edge-arrow hidden', this.root, icon('arrow'));
  }

  setCash(v: number, instant = false): void {
    this.targetCash = Math.floor(v);
    if (instant) {
      this.shownCash = this.targetCash;
      this.cashText.textContent = formatCash(this.shownCash);
    }
  }

  bumpCash(): void {
    this.cashBox.classList.remove('bump');
    void this.cashBox.offsetWidth;
    this.cashBox.classList.add('bump');
  }

  cashAnchor(): { x: number; y: number } {
    const r = this.cashBox.getBoundingClientRect();
    return { x: r.left + 22, y: r.top + r.height / 2 };
  }

  setStars(stars: number, total: number): void {
    this.starFill.style.width = `${Math.min(100, (stars / Math.max(1, total)) * 100)}%`;
    const txt = t('hud.stars', { stars, total });
    if (this.starText.textContent !== txt) this.starText.textContent = txt;
  }

  bumpStars(): void {
    const bar = this.starFill.parentElement?.parentElement;
    if (!bar) return;
    bar.classList.remove('bump');
    void bar.offsetWidth;
    bar.classList.add('bump');
  }

  /** Rendered coach face (data URL). */
  setPortrait(url: string): void {
    this.portrait.style.backgroundImage = `url(${url})`;
  }

  setLevel(level: number, progress: number): void {
    const txt = t('hud.level', { level });
    if (this.levelText.textContent !== txt) {
      this.levelText.textContent = txt;
      bounce(this.levelText);
    }
    const c = 2 * Math.PI * 19;
    this.levelRing.style.strokeDasharray = `${c}`;
    this.levelRing.style.strokeDashoffset = `${c * (1 - Math.max(0, Math.min(1, progress)))}`;
  }

  /** `iconUrl`: icon rendered from the real 3D model (icon atlas); falls back to the SVG icon. */
  setObjective(o: Objective | null, iconUrl?: string): void {
    if (!o) {
      this.objPill.classList.add('hidden');
      return;
    }
    const params: Record<string, string | number> = { ...(o.params ?? {}) };
    if (typeof params.name === 'string' && hasKey(params.name)) params.name = t(params.name);
    this.objIcon.innerHTML = iconUrl ? `<img alt="" src="${iconUrl}">` : icon(o.icon === 'sign' ? 'sign' : o.icon);
    this.objText.textContent = t(o.key, params);
    this.objPill.classList.remove('hidden');
    this.objPill.classList.remove('pop');
    void this.objPill.offsetWidth;
    this.objPill.classList.add('pop');
  }

  showHint(method: InputMethod | null): void {
    if (method === this.hintMethod) return;
    this.hintMethod = method;
    if (!method) {
      this.hint.classList.add('hidden');
      return;
    }
    if (method === 'touch') {
      this.hint.innerHTML = `<div class="hint-touch"><span class="finger"></span><span class="ring"></span></div><span class="hint-text">${t('hint.touch')}</span>`;
    } else {
      this.hint.innerHTML = `<div class="hint-keys"><div class="keys"><span class="k k-w">W</span><span class="k k-a">A</span><span class="k k-s">S</span><span class="k k-d">D</span></div><span class="mouse"><span class="mouse-btn"></span></span></div><span class="hint-text">${t('hint.desktop')}</span>`;
    }
    this.hint.classList.remove('hidden');
  }

  toast(text: string, kind: 'info' | 'good' | 'gold' = 'info', ms = 2400): void {
    const e = el('div', `toast ${kind}`, this.toasts);
    e.textContent = text;
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      e.classList.add('out');
      window.setTimeout(() => e.remove(), 350);
    }, ms);
  }

  update(dt: number): void {
    if (this.shownCash !== this.targetCash) {
      const diff = this.targetCash - this.shownCash;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 10)));
      this.shownCash += Math.sign(diff) * Math.min(Math.abs(diff), step);
      this.cashText.textContent = formatCash(this.shownCash);
    }
  }

  static formatNumber = formatNumber;
}

function bounce(e: HTMLElement): void {
  e.classList.remove('bump');
  void e.offsetWidth;
  e.classList.add('bump');
}
