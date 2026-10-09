import type { Rect } from '../data/types';

/**
 * Uniform nav grid (cell size in metres) with A* (8-neighbour, no corner cutting),
 * line-of-sight smoothing and a path cache that is cleared whenever obstacles change.
 */
export class NavGrid {
  readonly w: number;
  readonly h: number;
  private readonly blocked: Uint8Array;
  private readonly cache = new Map<number, number[]>();
  // A* scratch buffers (reused, no per-query allocation besides the result)
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly heap: Int32Array;
  private heapSize = 0;

  constructor(
    readonly bounds: Rect,
    readonly cell: number,
    private readonly walkable: Rect[],
  ) {
    this.w = Math.ceil((bounds.x1 - bounds.x0) / cell);
    this.h = Math.ceil((bounds.z1 - bounds.z0) / cell);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.closed = new Uint8Array(n);
    this.heap = new Int32Array(n * 8);
  }

  /** Rebuilds blocked cells from obstacles (inflated by the agent radius). */
  rebuild(obstacles: Rect[], inflate: number): void {
    this.cache.clear();
    const { w, h, cell, bounds } = this;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = bounds.x0 + (i + 0.5) * cell;
        const z = bounds.z0 + (j + 0.5) * cell;
        let ok = false;
        for (const r of this.walkable) {
          if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
            ok = true;
            break;
          }
        }
        if (ok) {
          for (const r of obstacles) {
            if (x >= r.x0 - inflate && x <= r.x1 + inflate && z >= r.z0 - inflate && z <= r.z1 + inflate) {
              ok = false;
              break;
            }
          }
        }
        this.blocked[j * w + i] = ok ? 0 : 1;
      }
    }
  }

  cellOf(x: number, z: number): number {
    const i = Math.max(0, Math.min(this.w - 1, Math.floor((x - this.bounds.x0) / this.cell)));
    const j = Math.max(0, Math.min(this.h - 1, Math.floor((z - this.bounds.z0) / this.cell)));
    return j * this.w + i;
  }

  isBlocked(x: number, z: number): boolean {
    return this.blocked[this.cellOf(x, z)] === 1;
  }

  private cx(c: number): number {
    return this.bounds.x0 + ((c % this.w) + 0.5) * this.cell;
  }
  private cz(c: number): number {
    return this.bounds.z0 + (Math.floor(c / this.w) + 0.5) * this.cell;
  }

  /** Nearest unblocked cell (BFS ring search). */
  private nearestOpen(c: number): number {
    if (!this.blocked[c]) return c;
    const ci = c % this.w;
    const cj = Math.floor(c / this.w);
    for (let r = 1; r < Math.max(this.w, this.h); r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const k = j * this.w + i;
          if (!this.blocked[k]) return k;
        }
      }
    }
    return c;
  }

  /** Returns a flat [x0,z0,x1,z1,...] list of waypoints, ending exactly at (tx,tz). */
  findPath(sx: number, sz: number, tx: number, tz: number): number[] {
    if (this.lineOfSight(sx, sz, tx, tz)) return [tx, tz];
    const s = this.nearestOpen(this.cellOf(sx, sz));
    const t = this.nearestOpen(this.cellOf(tx, tz));
    const key = s * 100003 + t;
    let cells = this.cache.get(key);
    if (!cells) {
      cells = this.astar(s, t);
      this.cache.set(key, cells);
    }
    // smooth from the actual start position
    const out: number[] = [];
    let ax = sx;
    let az = sz;
    let k = 0;
    while (k < cells.length) {
      let best = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.lineOfSight(ax, az, this.cx(cells[m] as number), this.cz(cells[m] as number))) {
          best = m;
          break;
        }
      }
      const c = cells[best] as number;
      ax = this.cx(c);
      az = this.cz(c);
      out.push(ax, az);
      k = best + 1;
      if (this.lineOfSight(ax, az, tx, tz)) break;
    }
    out.push(tx, tz);
    return out;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.ceil(len / (this.cell * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isBlocked(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  private push(c: number): void {
    const heap = this.heap;
    let i = this.heapSize++;
    heap[i] = c;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.f[heap[p] as number] as number) <= (this.f[c] as number)) break;
      heap[i] = heap[p] as number;
      i = p;
    }
    heap[i] = c;
  }

  private pop(): number {
    const heap = this.heap;
    const top = heap[0] as number;
    const last = heap[--this.heapSize] as number;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.heapSize) break;
      const r = l + 1;
      const m = r < this.heapSize && (this.f[heap[r] as number] as number) < (this.f[heap[l] as number] as number) ? r : l;
      if ((this.f[heap[m] as number] as number) >= (this.f[last] as number)) break;
      heap[i] = heap[m] as number;
      i = m;
    }
    heap[i] = last;
    return top;
  }

  private astar(s: number, t: number): number[] {
    const { w, h } = this;
    this.g.fill(Infinity);
    this.closed.fill(0);
    this.heapSize = 0;
    const ti = t % w;
    const tj = Math.floor(t / w);
    const hfn = (c: number): number => {
      const dx = Math.abs((c % w) - ti);
      const dz = Math.abs(Math.floor(c / w) - tj);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    this.g[s] = 0;
    this.f[s] = hfn(s);
    this.parent[s] = -1;
    this.push(s);
    while (this.heapSize > 0) {
      const c = this.pop();
      if (c === t) break;
      if (this.closed[c]) continue;
      this.closed[c] = 1;
      const ci = c % w;
      const cj = Math.floor(c / w);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const n = j * w + i;
          if (this.blocked[n] || this.closed[n]) continue;
          if (di && dj && (this.blocked[cj * w + i] || this.blocked[j * w + ci])) continue;
          const ng = (this.g[c] as number) + (di && dj ? 1.4142 : 1);
          if (ng < (this.g[n] as number)) {
            this.g[n] = ng;
            this.f[n] = ng + hfn(n);
            this.parent[n] = c;
            if (this.heapSize < this.heap.length) this.push(n);
          }
        }
      }
    }
    if (this.g[t] === Infinity) return [t];
    const out: number[] = [];
    for (let c = t; c !== -1; c = this.parent[c] as number) out.push(c);
    out.reverse();
    return out;
  }
}
