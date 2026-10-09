import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

/** Small tiling pattern textures (64–128 px) drawn on canvas: floors and surfaces (ART_BIBLE §6). */
export type Pattern = 'tilesTeal' | 'rubberBlue' | 'wood' | 'paving' | 'astro' | 'tartan' | 'turf' | 'deck' | 'blueprint' | 'curb' | 'asphalt';

const cache = new Map<Pattern, CanvasTexture>();

function make(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  draw(g, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

function noise(g: CanvasRenderingContext2D, s: number, alpha: number, n: number, seed = 1): void {
  let x = seed * 9301 + 49297;
  const rnd = (): number => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    g.fillRect(rnd() * s, rnd() * s, 2, 2);
  }
}

const DRAW: Record<Pattern, () => CanvasTexture> = {
  // 2×2 tiles per texture repeat; repeat 1 per metre → 0.5 m tiles
  tilesTeal: () =>
    make(128, (g, s) => {
      g.fillStyle = '#4FB5B0';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#5FC7C2';
      g.fillRect(0, 0, s / 2, s / 2);
      g.fillRect(s / 2, s / 2, s / 2, s / 2);
      g.strokeStyle = 'rgba(30,80,80,0.35)';
      g.lineWidth = 3;
      for (const p of [0, s / 2, s]) {
        g.beginPath();
        g.moveTo(p, 0);
        g.lineTo(p, s);
        g.moveTo(0, p);
        g.lineTo(s, p);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(4, 4, s / 2 - 8, 6);
      g.fillRect(s / 2 + 4, s / 2 + 4, s / 2 - 8, 6);
    }),
  rubberBlue: () =>
    make(64, (g, s) => {
      g.fillStyle = '#4E7FD9';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#6A95E6';
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          g.beginPath();
          g.arc(x * 16 + 8 + (y % 2) * 8, y * 16 + 8, 3.2, 0, Math.PI * 2);
          g.fill();
        }
    }),
  wood: () =>
    make(128, (g, s) => {
      const cols = ['#D49A5E', '#C98B4F', '#DCA66B', '#C48549'];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = cols[i] as string;
        g.fillRect(0, (i * s) / 4, s, s / 4);
        g.fillStyle = 'rgba(90,50,20,0.35)';
        g.fillRect(0, (i * s) / 4, s, 2);
        g.fillRect(((i * 53) % s) + 10, (i * s) / 4, 2, s / 4);
      }
      noise(g, s, 0.05, 400, 3);
    }),
  deck: () =>
    make(128, (g, s) => {
      const cols = ['#B87A42', '#C98B4F', '#BF8148', '#C68A50'];
      for (let i = 0; i < 8; i++) {
        g.fillStyle = cols[i % 4] as string;
        g.fillRect((i * s) / 8, 0, s / 8, s);
        g.fillStyle = 'rgba(70,40,15,0.4)';
        g.fillRect((i * s) / 8, 0, 2, s);
      }
      noise(g, s, 0.05, 300, 5);
    }),
  paving: () =>
    make(128, (g, s) => {
      g.fillStyle = '#DCC89C';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#E8D7B0';
      g.fillRect(0, 0, s / 2, s / 2);
      g.fillRect(s / 2, s / 2, s / 2, s / 2);
      g.strokeStyle = 'rgba(120,95,60,0.35)';
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, s / 2 - 3, s / 2 - 3);
      g.strokeRect(s / 2 + 1.5, 1.5, s / 2 - 3, s / 2 - 3);
      g.strokeRect(1.5, s / 2 + 1.5, s / 2 - 3, s / 2 - 3);
      g.strokeRect(s / 2 + 1.5, s / 2 + 1.5, s / 2 - 3, s / 2 - 3);
      noise(g, s, 0.04, 500, 7);
    }),
  astro: () =>
    make(64, (g, s) => {
      g.fillStyle = '#2E9E5B';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#38B068';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 8 + (y % 2) * 4, y * 8, 3, 3);
    }),
  tartan: () =>
    make(64, (g, s) => {
      g.fillStyle = '#D9503A';
      g.fillRect(0, 0, s, s);
      noise(g, s, 0.08, 500, 11);
    }),
  turf: () =>
    make(128, (g, s) => {
      g.fillStyle = '#4FBF4A';
      g.fillRect(0, 0, s, s / 2);
      g.fillStyle = '#45B041';
      g.fillRect(0, s / 2, s, s / 2);
      noise(g, s, 0.05, 600, 13);
    }),
  blueprint: () =>
    make(64, (g, s) => {
      g.fillStyle = 'rgba(90,180,255,0.30)';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(191,227,255,0.55)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, s - 2, s - 2);
      g.strokeStyle = 'rgba(191,227,255,0.25)';
      g.beginPath();
      g.moveTo(s / 2, 0);
      g.lineTo(s / 2, s);
      g.moveTo(0, s / 2);
      g.lineTo(s, s / 2);
      g.stroke();
    }),
  curb: () =>
    make(64, (g, s) => {
      g.fillStyle = '#E9DFC8';
      g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(120,100,70,0.35)';
      g.fillRect(s / 2 - 1, 0, 2, s);
      noise(g, s, 0.05, 200, 17);
    }),
  asphalt: () =>
    make(64, (g, s) => {
      g.fillStyle = '#3A3550';
      g.fillRect(0, 0, s, s);
      noise(g, s, 0.06, 400, 19);
    }),
};

export function pattern(p: Pattern): CanvasTexture {
  let t = cache.get(p);
  if (!t) {
    t = DRAW[p]();
    cache.set(p, t);
  }
  return t;
}

/** Radial / linear gradient textures used for baked contact-AO decals. */
let aoRadial: CanvasTexture | null = null;
let aoLinear: CanvasTexture | null = null;
export function aoTextures(): { radial: CanvasTexture; linear: CanvasTexture } {
  if (!aoRadial) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(25,15,40,0.55)');
    grd.addColorStop(0.6, 'rgba(25,15,40,0.25)');
    grd.addColorStop(1, 'rgba(25,15,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    aoRadial = new CanvasTexture(c);
  }
  if (!aoLinear) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(25,15,40,0.5)');
    grd.addColorStop(1, 'rgba(25,15,40,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
    aoLinear = new CanvasTexture(c);
  }
  return { radial: aoRadial, linear: aoLinear };
}
