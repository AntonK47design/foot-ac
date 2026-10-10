/**
 * Store assets for CrazyGames (GDD §5.4 capture mode): cover images (1920×1080, 800×1200, 800×800) and gameplay
 * preview videos (landscape + portrait), rendered from the real game frame by frame.
 *   npm run build:e2e && npx tsx tools/capture.ts [covers|videos]
 * Uses the test-hooks build (window.__wk); nothing here ships in the game.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';

const OUT = 'store';
const PORT = 4175;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

type V = { x: number; z: number; w: number };

async function boot(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  // tsx/esbuild wraps named functions in __name(); evaluated callbacks need it in the page too
  await page.addInitScript('window.__name = (f) => f;');
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => (window.__wk?.platform as { log: Array<{ msg: string }> } | undefined)?.log.some((e) => e.msg === 'gameplayStart'), null, { timeout: 30_000 });
  // drive frames by hand from here on
  await page.evaluate(() => (window.__wk!.loop as { stop(): void }).stop());
}

/** Builds a busy academy: `area` 1 = Sunday Park complete, 2 = Training Ground too; then lets it run. */
async function stage(page: Page, area: 1 | 2, warmSec: number, cash = 0): Promise<void> {
  await page.evaluate(
    ([area, warmSec, cash]) => {
      type Sim = { world: { padList: Array<{ id: string; area: number }> }; unlockPad(p: unknown): void; tick(dt: number): void; state: { cash: number; flags: Record<string, boolean>; level: number; xp: number } };
      const sim = window.__wk!.sim as Sim;
      // skip the tutorial route (no guide pill in the shots)
      for (const k of ['cash', 'crate', 'goal', 'sign', 'grab', 'bring', 'fees', 'cones', 'gate', 'water', 'gym', 'bottles', 'gate3', 'kit', 'crossing', 'bibs']) sim.state.flags['tut:' + k] = true;
      for (const p of sim.world.padList) if (p.area <= area) sim.unlockPad(p);
      sim.state.cash = cash;
      for (let i = 0; i < warmSec * 60; i++) sim.tick(1 / 60);
    },
    [area, warmSec, cash] as const,
  );
}

async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => {
    const loop = window.__wk!.loop as { advance(dt: number): void };
    for (let i = 0; i < n; i++) loop.advance(1 / 30);
  }, n);
}

async function hold(page: Page, v: V | null): Promise<void> {
  await page.evaluate((v) => (window.__wk!.view as { rig: { setHold(h: V | null): void } }).rig.setHold(v), v);
}

/** Hides the HUD and world labels (covers) or just the hints (videos), and adds the title for covers. */
async function dress(page: Page, mode: 'cover' | 'video', layout?: 'landscape' | 'portrait' | 'square'): Promise<void> {
  await page.addStyleTag({
    content:
      mode === 'cover'
        ? '#game > *:not(canvas):not(.vignette):not(.store-title){display:none!important}'
        : '.hint,#boot,.overlay{display:none!important}',
  });
  if (mode !== 'cover') return;
  await page.evaluate((layout) => {
    const t = document.createElement('div');
    t.className = 'store-title st-' + layout;
    t.innerHTML = '<b>KICKOFF<br>ACADEMY</b><i>FOOTBALL TYCOON</i>';
    document.getElementById('game')!.appendChild(t);
    const s = document.createElement('style');
    s.textContent = `
      .store-title{position:absolute;display:flex;flex-direction:column;align-items:center;gap:.5em;pointer-events:none;z-index:50;font-family:var(--display);text-align:center}
      .store-title b{font-weight:600;color:#fff;line-height:.92;letter-spacing:.02em;-webkit-text-stroke:.09em #1d2433;paint-order:stroke fill;text-shadow:0 .08em 0 #1d2433,0 .16em .2em rgba(0,0,0,.35)}
      .store-title i{font-style:normal;font-weight:600;color:#1d2433;background:#ffd23f;border:.12em solid #1d2433;border-radius:999px;padding:.12em .7em;box-shadow:0 .14em 0 #1d2433;letter-spacing:.06em}
      .store-title.st-landscape{left:5%;top:50%;transform:translateY(-50%);font-size:58px}
      .store-title.st-landscape b{font-size:2.6em}
      .store-title.st-portrait{left:0;right:0;top:5%;font-size:30px}
      .store-title.st-portrait b{font-size:2.5em}
      .store-title.st-square{left:0;right:0;top:5%;font-size:26px}
      .store-title.st-square b{font-size:2.3em}`;
    document.head.appendChild(s);
  }, layout);
}

async function cover(name: string, w: number, h: number, v: V, title: 'landscape' | 'portrait' | 'square', dpr = 2): Promise<void> {
  const browser = await chromium.launch({ args: ARGS });
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  await boot(page, w, h);
  await stage(page, 1, 75);
  await hold(page, v);
  await frames(page, 90);
  await dress(page, 'cover', title);
  await frames(page, 2);
  const raw = `${OUT}/.${name}@2x.png`;
  await page.screenshot({ path: raw, timeout: 240_000 });
  // supersampled render → exact size, sharp edges
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${w}:${h}:flags=lanczos`, `${OUT}/${name}.png`]);
  rmSync(raw);
  await browser.close();
  console.log('✔', `${OUT}/${name}.png`);
}

/** 20 s of real gameplay: the coach auto-plays (follows the best objective), buying, collecting, refilling. */
async function video(name: string, w: number, h: number, seconds = 20): Promise<void> {
  const browser = await chromium.launch({ args: ARGS });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await boot(page, w, h);
  // mid-way through Sunday Park with cash in hand: the clip shows pads being bought, drills running, cash collected
  await page.evaluate(() => {
    type Pad = { id: string; area: number; cost: number };
    const sim = window.__wk!.sim as { world: { padList: Pad[] }; isPadVisible(p: Pad): boolean; unlockPad(p: Pad): void; tick(dt: number): void; state: { cash: number; flags: Record<string, boolean> } };
    for (const k of ['cash', 'crate', 'goal', 'sign', 'grab', 'bring', 'fees', 'cones']) sim.state.flags['tut:' + k] = true;
    for (let n = 0; n < 13; n++) {
      const next = sim.world.padList.filter((p) => p.area === 1 && sim.isPadVisible(p)).sort((a, b) => a.cost - b.cost)[0];
      if (next) sim.unlockPad(next);
    }
    for (let i = 0; i < 45 * 60; i++) sim.tick(1 / 60);
    sim.state.cash = 700;
  });
  await dress(page, 'video');
  // steer like a player (hooked into the input layer the game reads every step), but never into menus:
  // graduates are sold in the background and the office / Team Bus stop are skipped
  await page.evaluate(() => {
    const wk = window.__wk!;
    type O = { x: number; z: number; targetId: string };
    type Pad = { id: string; pos: { x: number; z: number } };
    const sim = wk.sim as {
      objective: O | null;
      state: { coach: { x: number; z: number }; piles: Array<{ x: number; z: number; amount: number }> };
      nav: { findPath(a: number, b: number, c: number, d: number): number[] };
      visiblePads(): Pad[];
      canAfford(p: Pad): boolean;
      podiumGraduate(): unknown;
      decideGraduate(c: 'sell' | 'promote'): void;
      area: { crate: { spot: { x: number; z: number } } };
    };
    const target = (): { x: number; z: number } => {
      const ob = sim.objective;
      if (ob && !['podium', 'office', 'kickoff'].includes(ob.targetId)) return ob;
      const pad = sim.visiblePads().find((p) => sim.canAfford(p));
      if (pad) return pad.pos;
      const c = sim.state.coach;
      let best: { x: number; z: number } | null = null;
      for (const p of sim.state.piles) if (p.amount >= 5 && (!best || Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(best.x - c.x, best.z - c.z))) best = p;
      return best ?? sim.area.crate.spot;
    };
    (wk.input as { screenMove(o: { x: number; y: number }): void }).screenMove = (o) => {
      o.x = 0;
      o.y = 0;
      if (sim.podiumGraduate()) sim.decideGraduate('sell');
      const t = target();
      const c = sim.state.coach;
      if (Math.hypot(t.x - c.x, t.z - c.z) < 0.4) return;
      const p = sim.nav.findPath(c.x, c.z, t.x, t.z);
      const wx = p[2] ?? t.x;
      const wz = p[3] ?? t.z;
      const d = Math.hypot(wx - c.x, wz - c.z) || 1;
      o.x = (wx - c.x) / d;
      o.y = (wz - c.z) / d;
    };
  });
  await frames(page, 15);
  const dir = `${OUT}/.frames-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = seconds * 30;
  for (let i = 0; i < n; i++) {
    await frames(page, 1);
    await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 100 === 0) console.log(`  ${name}: frame ${i}/${n}`);
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', `${OUT}/${name}.mp4`]);
  rmSync(dir, { recursive: true, force: true });
  await browser.close();
  console.log('✔', `${OUT}/${name}.mp4`);
}

async function main(): Promise<void> {
  if (!existsSync('dist-e2e/index.html')) throw new Error('run `npm run build:e2e` first');
  mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const what = process.argv[2] ?? 'all';
  try {
    if (what === 'portrait') await cover('cover-portrait-800x1200', 800, 1200, { x: 4.0, z: -5.0, w: 16 }, 'portrait', Number(process.argv[3] ?? 2));
    if (what === 'all' || what === 'covers') {
      await cover('cover-landscape-1920x1080', 1920, 1080, { x: 5.5, z: -2.5, w: 24 }, 'landscape');
      await cover('cover-portrait-800x1200', 800, 1200, { x: 4.0, z: -5.0, w: 16 }, 'portrait');
      await cover('cover-square-800x800', 800, 800, { x: 3.5, z: -3.5, w: 14 }, 'square');
    }
    if (what === 'preview') await video('video-preview', 960, 540, 20);
    if (what === 'all' || what === 'videos') {
      await video('video-landscape-1920x1080', 1920, 1080);
      await video('video-portrait-1080x1920', 1080, 1920);
    }
  } finally {
    server.kill();
  }
}

void main();
