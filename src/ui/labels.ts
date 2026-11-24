import type { Camera } from 'three';
import { Vector3 } from 'three';
import { isCompact } from './compact';

/** Phones: labels must fit this far inside the left/right screen edge. */
const EDGE_PX = 6;

const v = new Vector3();

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** Projects world points to CSS pixels. */
export class Projector {
  w = 1;
  h = 1;
  constructor(private readonly camera: Camera) {}
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    v.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.visible = v.z < 1 && v.z > -1;
    return out;
  }
}

interface LabelEntry {
  el: HTMLDivElement;
  used: boolean;
  html: string;
  cls: string;
  /** Last written style state: style writes (and their strings) only happen on change. */
  shown: boolean;
  dim: boolean;
  /** Position in tenths of a pixel (the precision written to the transform). */
  tx: number;
  ty: number;
  /** Rendered size (px) for the phone edge / top-band checks; w -1 = measure again (content length changed). */
  w: number;
  h: number;
}

/**
 * Keyed pool of absolutely positioned DOM labels anchored to world positions.
 * begin() → place(...) for each visible label → end() hides the rest. No per-frame allocation once warm.
 */
export class LabelLayer {
  readonly root: HTMLDivElement;
  private readonly pool = new Map<string, LabelEntry>();
  private readonly sp: ScreenPoint = { x: 0, y: 0, visible: false };
  /** Screen y (px) of the top HUD band's bottom (measured from the HUD): labels reaching above it are dimmed / hidden. */
  topReserve = 0;

  constructor(parent: HTMLElement, private readonly projector: Projector) {
    this.root = document.createElement('div');
    this.root.className = 'labels';
    parent.appendChild(this.root);
  }

  begin(): void {
    for (const e of this.pool.values()) e.used = false;
  }

  place(key: string, x: number, y: number, z: number, cls: string, html: string): HTMLDivElement | null {
    const p = this.projector.project(x, y, z, this.sp);
    let e = this.pool.get(key);
    if (!e) {
      const div = document.createElement('div');
      this.root.appendChild(div);
      div.className = 'lbl';
      e = { el: div, used: false, html: '', cls: '', shown: true, dim: false, tx: NaN, ty: NaN, w: -1, h: 0 };
      this.pool.set(key, e);
    }
    e.used = true;
    if (e.cls !== cls) {
      e.el.className = 'lbl ' + cls;
      e.cls = cls;
    }
    if (e.html !== html) {
      // re-measure only when the content's length changes (a ticking price keeps its width; no layout per frame)
      if (html.length !== e.html.length) e.w = -1;
      e.el.innerHTML = '<div class="c">' + html + '</div>';
      e.html = html;
    }
    if (!p.visible || p.x < -200 || p.y < -200 || p.x > this.projector.w + 200 || p.y > this.projector.h + 200) {
      this.hide(e);
      return null;
    }
    const compact = isCompact();
    // phones: no half-cut labels at the side edges and none reaching into the top HUD band, judged by the label's
    // top (labels grow upwards from their anchor); desktop dims those instead
    if (compact && (this.cutOff(e, p.x) || p.y - e.h < this.topReserve)) {
      this.hide(e);
      return null;
    }
    if (!e.shown) {
      e.el.style.display = '';
      e.shown = true;
    }
    // labels sliding under the top HUD band are dimmed so the HUD stays readable
    const dim = !compact && p.y < this.topReserve;
    if (dim !== e.dim) {
      e.el.style.opacity = dim ? '0.25' : '';
      e.dim = dim;
    }
    const tx = Math.round(p.x * 10);
    const ty = Math.round(p.y * 10);
    if (tx !== e.tx || ty !== e.ty) {
      e.tx = tx;
      e.ty = ty;
      e.el.style.transform = `translate3d(${tx / 10}px, ${ty / 10}px, 0)`;
    }
    return e.el;
  }

  private hide(e: LabelEntry): void {
    if (!e.shown) return;
    e.el.style.display = 'none';
    e.shown = false;
  }

  /** The centred label would stick out of the left/right screen edge (width measured once per content change). */
  private cutOff(e: LabelEntry, x: number): boolean {
    if (e.w < 0) {
      if (!e.shown) {
        e.el.style.display = '';
        e.shown = true;
      }
      e.w = e.el.offsetWidth;
      e.h = e.el.offsetHeight;
    }
    const half = e.w / 2;
    return x - half < EDGE_PX || x + half > this.projector.w - EDGE_PX;
  }

  end(): void {
    for (const [k, e] of this.pool) {
      if (e.used) continue;
      this.hide(e);
      if (this.pool.size > 80) {
        e.el.remove();
        this.pool.delete(k);
      }
    }
  }
}

/** Floating "+1 SHO" / "+$15" popups and coins flying to the HUD (pooled DOM). */
export class Popups {
  private readonly root: HTMLDivElement;
  private readonly free: HTMLDivElement[] = [];
  private readonly coinFree: HTMLDivElement[] = [];
  private readonly sp: ScreenPoint = { x: 0, y: 0, visible: false };

  constructor(parent: HTMLElement, private readonly projector: Projector, private readonly coinHtml: string) {
    this.root = document.createElement('div');
    this.root.className = 'popups';
    parent.appendChild(this.root);
  }

  text(x: number, y: number, z: number, text: string, cls: string): void {
    const p = this.projector.project(x, y, z, this.sp);
    if (!p.visible) return;
    const e = this.free.pop() ?? document.createElement('div');
    e.className = 'popup ' + cls;
    e.textContent = text;
    e.style.left = `${p.x}px`;
    e.style.top = `${p.y}px`;
    this.root.appendChild(e);
    window.setTimeout(() => {
      e.remove();
      if (this.free.length < 24) this.free.push(e);
    }, 1100);
  }

  /** Coins fly from a world point to a screen point (the HUD cash counter). */
  coins(x: number, y: number, z: number, to: { x: number; y: number }, count: number, onArrive: () => void): void {
    const p = this.projector.project(x, y, z, this.sp);
    const sx = p.visible ? p.x : to.x;
    const sy = p.visible ? p.y : to.y;
    const n = Math.max(1, Math.min(10, count));
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const e = this.coinFree.pop() ?? document.createElement('div');
      e.className = 'fly-coin';
      e.innerHTML = this.coinHtml;
      const jx = (Math.random() - 0.5) * 60;
      const jy = (Math.random() - 0.5) * 40 - 20;
      e.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(0.6)`;
      e.style.opacity = '1';
      this.root.appendChild(e);
      const delay = i * 40;
      window.setTimeout(() => {
        e.style.transform = `translate3d(${sx + jx}px, ${sy + jy}px, 0) scale(1)`;
      }, 16 + delay);
      window.setTimeout(() => {
        e.style.transform = `translate3d(${to.x}px, ${to.y}px, 0) scale(0.7)`;
      }, 200 + delay);
      window.setTimeout(() => {
        e.remove();
        if (this.coinFree.length < 30) this.coinFree.push(e);
        arrived++;
        if (arrived === 1 || arrived === n) onArrive();
      }, 720 + delay);
    }
  }
}
