import { availableLocales, t } from '../core/i18n';
import type { GraphicsSetting } from '../view/quality';
import { icon } from './icons';

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  graphics: GraphicsSetting;
  language: string;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, music: true, vibration: true, graphics: 'auto', language: 'auto' };

export interface SettingsCallbacks {
  onChange(s: Settings): void;
  onReset(): void;
  onOpen(): void;
  onClose(): void;
  platformMuted(): boolean;
}

/** Settings panel (bottom sheet in portrait, centred card in landscape). Opening pauses the game. */
export class SettingsPanel {
  private readonly overlay: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private resetArmed = false;
  isOpen = false;

  constructor(
    parent: HTMLElement,
    private settings: Settings,
    private readonly cb: SettingsCallbacks,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay hidden';
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    const sheet = document.createElement('div');
    sheet.className = 'panel';
    sheet.setAttribute('role', 'dialog');
    const head = document.createElement('div');
    head.className = 'panel-head';
    head.innerHTML = `<h2>${t('settings.title')}</h2>`;
    const x = document.createElement('button');
    x.className = 'btn-round close';
    x.innerHTML = icon('close');
    x.setAttribute('aria-label', t('settings.close'));
    x.addEventListener('click', () => this.close());
    head.appendChild(x);
    this.body = document.createElement('div');
    this.body.className = 'panel-body';
    sheet.append(head, this.body);
    this.overlay.appendChild(sheet);
    parent.appendChild(this.overlay);
  }

  update(s: Settings): void {
    this.settings = s;
    if (this.isOpen) this.render();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.resetArmed = false;
    this.render();
    this.overlay.classList.remove('hidden');
    this.cb.onOpen();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.classList.add('hidden');
    this.cb.onClose();
  }

  private set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.settings = { ...this.settings, [k]: v };
    this.cb.onChange(this.settings);
    this.render();
  }

  private toggleRow(label: string, key: 'sound' | 'music' | 'vibration', note?: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<span class="row-label">${label}${note ? `<small>${note}</small>` : ''}</span>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const on of [true, false]) {
      const b = document.createElement('button');
      b.textContent = t(on ? 'settings.on' : 'settings.off');
      if (this.settings[key] === on) b.classList.add('sel');
      b.addEventListener('click', () => this.set(key, on));
      seg.appendChild(b);
    }
    row.appendChild(seg);
    return row;
  }

  private render(): void {
    const b = this.body;
    b.innerHTML = '';
    const muted = this.cb.platformMuted();
    b.appendChild(this.toggleRow(t('settings.sound'), 'sound', muted ? t('settings.muted_by_platform') : undefined));
    b.appendChild(this.toggleRow(t('settings.music'), 'music'));
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) b.appendChild(this.toggleRow(t('settings.vibration'), 'vibration'));
    // graphics
    const g = document.createElement('div');
    g.className = 'row';
    g.innerHTML = `<span class="row-label">${t('settings.graphics')}</span>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const v of ['auto', 'low', 'high'] as const) {
      const btn = document.createElement('button');
      btn.textContent = t('settings.graphics.' + v);
      if (this.settings.graphics === v) btn.classList.add('sel');
      btn.addEventListener('click', () => this.set('graphics', v));
      seg.appendChild(btn);
    }
    g.appendChild(seg);
    b.appendChild(g);
    // language
    const l = document.createElement('div');
    l.className = 'row';
    l.innerHTML = `<span class="row-label">${t('settings.language')}</span>`;
    const lseg = document.createElement('div');
    lseg.className = 'seg';
    for (const code of availableLocales()) {
      const btn = document.createElement('button');
      btn.textContent = t('lang.' + code);
      if (this.settings.language === code || (this.settings.language === 'auto' && code === 'en')) btn.classList.add('sel');
      btn.addEventListener('click', () => this.set('language', code));
      lseg.appendChild(btn);
    }
    l.appendChild(lseg);
    b.appendChild(l);
    // reset (inline two-step confirmation)
    const r = document.createElement('button');
    r.className = 'btn-wide danger' + (this.resetArmed ? ' armed' : '');
    r.textContent = this.resetArmed ? t('settings.reset_confirm') : t('settings.reset');
    r.addEventListener('click', () => {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.render();
        return;
      }
      this.resetArmed = false;
      this.cb.onReset();
      this.close();
    });
    b.appendChild(r);
  }
}
