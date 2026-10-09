import { formatCash, t } from '../core/i18n';
import { STATS, type Position, type Rarity, type Stat } from '../data/types';
import { icon } from './icons';

export interface PanelHooks {
  onOpen(): void;
  onClose(): void;
}

/** Card-style modal (bottom sheet in portrait). One level deep; closing never needs Escape. */
export class Panel {
  protected readonly overlay: HTMLDivElement;
  protected readonly sheet: HTMLDivElement;
  protected readonly title: HTMLHeadingElement;
  protected readonly body: HTMLDivElement;
  isOpen = false;
  /** Called when the player closes the panel with ✕ or a tap outside. */
  onDismiss: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly hooks: PanelHooks,
    cls = '',
    closable = true,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay hidden';
    this.overlay.addEventListener('pointerdown', (e) => {
      if (closable && e.target === this.overlay) this.dismiss();
    });
    this.sheet = document.createElement('div');
    this.sheet.className = 'panel ' + cls;
    this.sheet.setAttribute('role', 'dialog');
    const head = document.createElement('div');
    head.className = 'panel-head';
    this.title = document.createElement('h2');
    head.appendChild(this.title);
    if (closable) {
      const x = document.createElement('button');
      x.className = 'btn-round close';
      x.innerHTML = icon('close');
      x.setAttribute('aria-label', t('settings.close'));
      x.addEventListener('click', () => this.dismiss());
      head.appendChild(x);
    }
    this.body = document.createElement('div');
    this.body.className = 'panel-body';
    this.sheet.append(head, this.body);
    this.overlay.appendChild(this.sheet);
    parent.appendChild(this.overlay);
  }

  protected show(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.overlay.classList.remove('hidden');
    this.hooks.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.add('hidden');
    this.hooks.onClose();
  }

  private dismiss(): void {
    const cb = this.onDismiss;
    this.close();
    cb?.();
  }
}

export interface CardData {
  name: string;
  position: Position;
  age: number;
  rarity: Rarity;
  ovr: number;
  stats: Record<Stat, number>;
  /** Highlight one stat (e.g. the MVP gain). */
  hot?: Stat | null;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Player card (rarity frame, OVR, position, 4 stat bars). */
export function cardHtml(p: CardData, size: 'big' | 'small' = 'big'): string {
  const bars = STATS.map(
    (s) =>
      `<div class="pc-stat${p.hot === s ? ' hot' : ''}"><span>${t('stat.' + s)}</span><i><b style="width:${Math.min(100, p.stats[s])}%"></b></i><em>${p.stats[s]}${p.hot === s ? ' ▲' : ''}</em></div>`,
  ).join('');
  return `<div class="pcard ${p.rarity} ${size}">
  <div class="pc-top"><span class="pc-ovr">${p.ovr}</span><span class="pc-pos">${t('pos.' + p.position)}</span><span class="pc-rar">${t('rarity.' + p.rarity)}</span></div>
  <div class="pc-name">${esc(p.name)}</div><div class="pc-age">${t('card.age', { age: p.age })}</div>
  <div class="pc-stats">${bars}</div></div>`;
}

function button(label: string, cls: string, onClick: () => void, sub?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'btn-big ' + cls;
  b.innerHTML = `<span>${label}</span>${sub ? `<small>${sub}</small>` : ''}`;
  b.addEventListener('click', onClick);
  return b;
}

export interface PodiumInfo {
  card: CardData;
  price: number;
  buyer: string;
  squadCount: number;
  squadSize: number;
  /** Who gets sold to make room when the squad is full. */
  replaces: { name: string; ovr: number; price: number } | null;
}

/** Graduation podium: SELL to a fictional club or PROMOTE to the Academy Squad. */
export class PodiumPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'podium-panel');
  }

  open(info: PodiumInfo, onSell: () => void, onPromote: () => void): void {
    this.title.textContent = t('podium.title');
    this.body.innerHTML = `<div class="podium-card">${cardHtml(info.card)}</div>`;
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.appendChild(
      button(t('podium.sell', { price: formatCash(info.price) }), 'sell', () => {
        this.close();
        onSell();
      }, t('podium.to_club', { club: info.buyer })),
    );
    const sub = info.replaces
      ? t('podium.replaces', { name: info.replaces.name, ovr: info.replaces.ovr, price: formatCash(info.replaces.price) })
      : t('podium.squad_count', { n: info.squadCount, size: info.squadSize });
    row.appendChild(
      button(t('podium.promote'), 'promote', () => {
        this.close();
        onPromote();
      }, sub),
    );
    this.body.appendChild(row);
    this.show();
  }
}

export interface ResultInfo {
  ourName: string;
  theirName: string;
  ourGoals: number;
  theirGoals: number;
  outcome: 'win' | 'draw' | 'loss';
  cash: number;
  points: number;
  mvp: CardData | null;
  rank: number;
  seasonOver: boolean;
  promoted: boolean;
  champion: boolean;
  divisionName: string;
}

export class ResultsPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'results-panel', false);
  }

  open(r: ResultInfo, onContinue: () => void, onTable: () => void): void {
    this.title.textContent = t('results.title');
    const season = r.seasonOver
      ? `<div class="season ${r.champion ? 'gold' : ''}">${r.promoted ? t('results.promoted', { division: r.divisionName }) : r.champion ? t('results.champions') : t('results.season_over', { rank: t('rank.' + Math.min(r.rank, 6)) })}</div>`
      : '';
    this.body.innerHTML = `
      <div class="score-big ${r.outcome}">
        <span class="sb-team">${esc(r.ourName)}</span><b>${r.ourGoals} – ${r.theirGoals}</b><span class="sb-team">${esc(r.theirName)}</span>
      </div>
      <div class="outcome ${r.outcome}">${t('results.' + r.outcome)}</div>
      ${season}
      <div class="rewards"><span>${icon('cash')}<b>+${formatCash(r.cash)}</b></span><span>${icon('star')}<b>${t('results.points', { n: r.points })}</b></span><span>${icon('trophy')}<b>${t('rank.' + Math.min(r.rank, 6))}</b></span></div>
      ${r.mvp ? `<div class="mvp"><div class="mvp-tag">${t('results.mvp')}</div>${cardHtml(r.mvp, 'small')}</div>` : ''}`;
    const row = document.createElement('div');
    row.className = 'choice-row';
    row.appendChild(
      button(t('results.table'), 'neutral', () => {
        this.close();
        onTable();
      }),
    );
    row.appendChild(
      button(t('results.continue'), 'promote', () => {
        this.close();
        onContinue();
      }),
    );
    this.body.appendChild(row);
    this.show();
  }
}

export interface SquadRow {
  id: number;
  card: CardData;
  value: number;
  apps: number;
  goals: number;
}

export class SquadPanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'squad-panel');
  }

  open(rows: SquadRow[], size: number, strength: number, onSell: (id: number) => void): void {
    this.title.textContent = t('squad.title', { n: rows.length, size });
    this.body.innerHTML = `<div class="squad-sub">${t('squad.strength', { ovr: Math.round(strength) })}</div>`;
    if (rows.length === 0) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = t('squad.empty');
      this.body.appendChild(e);
    }
    const list = document.createElement('div');
    list.className = 'squad-list';
    for (const r of rows) {
      const item = document.createElement('div');
      item.className = 'squad-item';
      item.innerHTML = `${cardHtml(r.card, 'small')}<div class="si-meta">${t('squad.apps', { apps: r.apps, goals: r.goals })}</div>`;
      let armed = false;
      const b = button(t('squad.sell', { price: formatCash(r.value) }), 'sell small', () => {
        if (!armed) {
          armed = true;
          b.querySelector('span')!.textContent = t('squad.sell_confirm');
          b.classList.add('armed');
          return;
        }
        onSell(r.id);
      });
      item.appendChild(b);
      list.appendChild(item);
    }
    this.body.appendChild(list);
    this.show();
  }
}

export interface TableRowInfo {
  name: string;
  us: boolean;
  p: number;
  w: number;
  d: number;
  l: number;
  gd: number;
  pts: number;
}

export class LeaguePanel extends Panel {
  constructor(parent: HTMLElement, hooks: PanelHooks) {
    super(parent, hooks, 'league-panel');
  }

  open(divisionName: string, season: number, round: number, rows: TableRowInfo[], next: string | null): void {
    this.title.textContent = divisionName;
    const head = `<tr><th>#</th><th class="tn">${t('league.team')}</th><th>${t('league.p')}</th><th>${t('league.w')}</th><th>${t('league.d')}</th><th>${t('league.l')}</th><th>${t('league.gd')}</th><th>${t('league.pts')}</th></tr>`;
    const body = rows
      .map(
        (r, i) =>
          `<tr class="${r.us ? 'us' : ''}${i === 0 ? ' top' : ''}"><td>${i + 1}</td><td class="tn">${esc(r.name)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`,
      )
      .join('');
    this.body.innerHTML = `<div class="squad-sub">${t('league.season', { season, round, rounds: 5 })}</div>
      <table class="ltable">${head}${body}</table>
      <div class="league-note">${next ? t('league.next', { team: esc(next) }) : ''}<br>${t('league.rule')}</div>`;
    this.show();
  }
}
