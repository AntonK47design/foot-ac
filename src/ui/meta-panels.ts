import { formatCash, t } from '../core/i18n';
import type { Position, Rarity } from '../data/types';
import { icon } from './icons';
import { Panel, type PanelHooks } from './panels';
import { adElement, type AdOffer } from './ads';

/** Reward as shown in the UI. */
export interface RewardView {
  cash: number;
  tickets: number;
  prospect?: { rarity: Rarity } | null;
}

export function rewardHtml(r: RewardView): string {
  const parts: string[] = [];
  if (r.cash > 0) parts.push(`<span class="rw rw-cash">${icon('cash')}<b>${formatCash(r.cash)}</b></span>`);
  if (r.tickets > 0) parts.push(`<span class="rw rw-tix">${icon('ticket')}<b>×${r.tickets}</b></span>`);
  if (r.prospect) parts.push(`<span class="rw rw-pro ${r.prospect.rarity}">${icon('star')}<b>${t('rarity.' + r.prospect.rarity)}</b></span>`);
  return parts.join('');
}

function btn(label: string, cls: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn-big ' + cls;
  b.innerHTML = `<span>${label}</span>`;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** "Claim" next to an equally sized rewarded "▶ ×2" (GDD §7), or the claim button alone. */
function claimRow(label: string, ad: AdOffer | null | undefined, onClaim: (doubled: boolean) => void): HTMLElement {
  const main = btn(label, ad && !ad.blocked ? 'neutral' : 'sell', () => onClaim(false));
  const adEl = adElement(ad, (ok) => {
    if (ok) onClaim(true);
  });
  if (!adEl) return main;
  const row = document.createElement('div');
  row.className = adEl.tagName === 'BUTTON' ? 'choice-row' : 'claim-col';
  row.append(main, adEl);
  return row;
}

export function hms(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// ───────────────────────────── daily calendar ─────────────────────────────

export interface DailyView {
  days: RewardView[];
  /** Slot today's claim gives (0–6). */
  index: number;
  available: boolean;
  /** ms until tomorrow's reward. */
  nextIn: number;
}

function calendarHtml(d: DailyView): string {
  return `<div class="cal">${d.days
    .map((r, i) => {
      const cls = i < d.index ? 'done' : i === d.index ? (d.available ? 'today' : 'next') : '';
      const tag = i === d.index ? (d.available ? t('daily.today') : t('daily.tomorrow')) : i === d.index + 1 && d.available ? t('daily.tomorrow') : t('daily.day', { n: i + 1 });
      return `<div class="cal-day ${cls}${i === 6 ? ' big' : ''}"><small>${tag}</small>${rewardHtml(r)}${i < d.index ? '<em>✓</em>' : ''}</div>`;
    })
    .join('')}</div>`;
}

export class DailyPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'daily-panel');
  }

  open(d: DailyView, onClaim: (doubled: boolean) => void, ad?: AdOffer | null): void {
    this.title.textContent = t('daily.title');
    this.body.innerHTML = calendarHtml(d);
    if (d.available) {
      this.body.appendChild(
        claimRow(t('daily.claim'), ad, (doubled) => {
          onClaim(doubled);
          this.close();
        }),
      );
    } else {
      const n = document.createElement('div');
      n.className = 'empty';
      n.textContent = t('daily.come_back', { time: hms(d.nextIn) });
      this.body.appendChild(n);
    }
    this.show();
  }
}

// ───────────────────────────── welcome back ─────────────────────────────

export interface WelcomeView {
  awaySec: number;
  offlineCash: number;
  /** Seconds the offline earnings were capped at (to explain the cap), or 0. */
  capSec: number;
  daily: DailyView | null;
  scoutDone: string | null;
}

/** Session start / back after ≥ 3 min: offline earnings + today's daily reward in one panel. */
export class WelcomePanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'welcome-panel', false);
  }

  open(w: WelcomeView, onCollect: (doubled: boolean) => void, ad?: AdOffer | null): void {
    this.title.textContent = t('welcome.title');
    const h = Math.floor(w.awaySec / 3600);
    const m = Math.floor((w.awaySec % 3600) / 60);
    const away = h > 0 ? t('welcome.away_h', { h, m }) : t('welcome.away_m', { m: Math.max(1, m) });
    let html = '';
    if (w.offlineCash > 0) {
      html += `<div class="wb-offline"><div>${away}</div><div class="wb-cash">${icon('cash')}<b>+${formatCash(w.offlineCash)}</b></div>${w.capSec ? `<small>${t('welcome.capped', { h: Math.round(w.capSec / 3600) })}</small>` : ''}</div>`;
    } else if (w.awaySec > 0) html += `<div class="wb-offline"><div>${away}</div><small>${t('welcome.no_auto')}</small></div>`;
    if (w.scoutDone) html += `<div class="wb-scout">${icon('star')}<span>${w.scoutDone}</span></div>`;
    if (w.daily) html += `<div class="wb-daily"><b>${t('daily.title')}</b>${calendarHtml(w.daily)}</div>`;
    this.body.innerHTML = html;
    this.body.appendChild(
      claimRow(w.daily?.available ? t('welcome.collect_all') : t('welcome.collect'), ad, (doubled) => {
        onCollect(doubled);
        this.close();
      }),
    );
    this.show();
  }
}

// ───────────────────────────── quests ─────────────────────────────

export interface QuestView {
  id: string;
  text: string;
  progress: number;
  target: number;
  /** "3/10" or "$1.2K/$12K". */
  progressText: string;
  reward: RewardView;
  claimed: boolean;
}

export class QuestsPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'quests-panel');
  }

  open(list: () => QuestView[], resetIn: () => number, onClaim: (id: string) => void): void {
    this.title.textContent = t('quests.title');
    const render = (): void => {
      this.body.innerHTML = '';
      for (const q of list()) {
        const row = document.createElement('div');
        row.className = 'quest' + (q.claimed ? ' claimed' : '');
        const pct = Math.min(100, (q.progress / q.target) * 100);
        row.innerHTML = `<div class="q-text"><b>${q.text}</b><i class="q-bar"><b style="width:${pct}%"></b></i><small>${q.progressText}</small></div><div class="q-reward">${rewardHtml(q.reward)}</div>`;
        const done = q.progress >= q.target;
        row.appendChild(
          btn(q.claimed ? '✓' : done ? t('quests.claim') : t('quests.todo'), done && !q.claimed ? 'sell small' : 'neutral small', () => {
            onClaim(q.id);
            render();
          }, !done || q.claimed),
        );
        this.body.appendChild(row);
      }
      const n = document.createElement('div');
      n.className = 'empty';
      n.textContent = t('quests.reset', { time: hms(resetIn()) });
      this.body.appendChild(n);
    };
    render();
    this.show();
  }
}

// ───────────────────────────── scouting ─────────────────────────────

export interface ScoutTierView {
  tier: 'local' | 'regional' | 'global';
  name: string;
  duration: string;
  cost: RewardView;
  floor: Rarity;
  canStart: boolean;
}

export interface ScoutView {
  tiers: ScoutTierView[];
  active: { name: string; remaining: number; total: number; ad: AdOffer | null } | null;
  waiting: number;
}

export class ScoutPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'scout-panel');
  }

  open(view: () => ScoutView, onStart: (tier: ScoutTierView['tier']) => void): void {
    this.title.textContent = t('scout.title');
    const render = (): void => {
      const v = view();
      this.body.innerHTML = '';
      if (v.active) {
        const a = document.createElement('div');
        a.className = 'scout-active';
        const pct = 100 - Math.min(100, (v.active.remaining / v.active.total) * 100);
        a.innerHTML = `<b>${t('scout.active', { name: v.active.name })}</b><i class="q-bar"><b style="width:${pct}%"></b></i><small>${t('scout.back_in', { time: hms(v.active.remaining) })}</small>`;
        const adEl = adElement(v.active.ad, (ok) => ok && render(), 'small');
        if (adEl) a.appendChild(adEl);
        this.body.appendChild(a);
      }
      if (v.waiting > 0) {
        const w = document.createElement('div');
        w.className = 'empty';
        w.textContent = t('scout.waiting', { n: v.waiting });
        this.body.appendChild(w);
      }
      for (const s of v.tiers) {
        const row = document.createElement('div');
        row.className = 'scout-tier';
        row.innerHTML = `<div class="q-text"><b>${s.name}</b><small>${s.duration} · ${t('scout.finds', { rarity: t('rarity.' + s.floor) })}</small></div><div class="q-reward">${s.cost.cash || s.cost.tickets ? rewardHtml(s.cost) : t('scout.free')}</div>`;
        row.appendChild(
          btn(t('scout.send'), s.canStart ? 'promote small' : 'neutral small', () => {
            onStart(s.tier);
            render();
          }, !s.canStart),
        );
        this.body.appendChild(row);
      }
    };
    render();
    this.show();
  }
}

// ───────────────────────────── Hall of Fame ─────────────────────────────

export interface AlbumView {
  cells: Array<{ position: Position; rarity: Rarity; count: number }>;
  slots: number;
  next: { slots: number; reward: RewardView } | null;
  canClaim: boolean;
  lockedLevel: number | null;
}

export class AlbumPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'album-panel');
  }

  open(view: () => AlbumView, onClaim: () => void): void {
    this.title.textContent = t('album.title');
    const render = (): void => {
      const v = view();
      const rar: Rarity[] = ['common', 'rare', 'epic', 'wonderkid'];
      const pos: Position[] = ['GK', 'DF', 'MF', 'FW'];
      let grid = `<div class="album"><span></span>${rar.map((r) => `<span class="ah ${r}">${t('rarity.' + r)}</span>`).join('')}`;
      for (const p of pos) {
        grid += `<span class="ah">${t('pos.' + p)}</span>`;
        for (const r of rar) {
          const c = v.cells.find((x) => x.position === p && x.rarity === r)?.count ?? 0;
          grid += `<span class="slot ${r}${c ? ' got' : ''}">${c ? `${icon('star')}<i>×${c}</i>` : '?'}</span>`;
        }
      }
      grid += '</div>';
      this.body.innerHTML = `<div class="squad-sub">${t('album.slots', { n: v.slots })}</div>${grid}`;
      if (v.next) {
        const m = document.createElement('div');
        m.className = 'album-next';
        m.innerHTML = `<span>${t('album.milestone', { n: v.next.slots })}</span><div class="q-reward">${rewardHtml(v.next.reward)}</div>`;
        if (v.lockedLevel) {
          const s = document.createElement('small');
          s.textContent = t('album.locked', { level: v.lockedLevel });
          m.appendChild(s);
        } else
          m.appendChild(
            btn(t('quests.claim'), v.canClaim ? 'sell small' : 'neutral small', () => {
              onClaim();
              render();
            }, !v.canClaim),
          );
        this.body.appendChild(m);
      }
    };
    render();
    this.show();
  }
}

// ───────────────────────────── account nudge ─────────────────────────────

/** One-time nudge for guests with real progress (GDD §6: progress lives in the account). */
export class AccountPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'account-panel');
  }

  open(onLogin: () => void): void {
    this.title.textContent = t('game.title');
    this.body.innerHTML = `<div class="empty">${t('account.text')}</div>`;
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.appendChild(btn(t('account.later'), 'neutral', () => this.close()));
    row.appendChild(
      btn(t('account.login'), 'promote', () => {
        this.close();
        onLogin();
      }),
    );
    this.body.appendChild(row);
    this.show();
  }
}
