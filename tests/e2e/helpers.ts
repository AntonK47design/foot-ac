import type { CDPSession, Page } from '@playwright/test';

export interface CoachState {
  x: number;
  z: number;
  cash: number;
  carry: number;
  stars: number;
}

export async function waitForGameplay(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.waitForFunction(
    () => (window.__wk?.platform as { log: Array<{ msg: string }> } | undefined)?.log.some((e) => e.msg === 'gameplayStart'),
    null,
    { timeout: 10_000, polling: 50 },
  );
  return Date.now() - t0;
}

export async function coach(page: Page): Promise<CoachState> {
  return page.evaluate(() => {
    const sim = window.__wk!.sim as { state: { cash: number; stars: number; coach: { x: number; z: number; carry: number } } };
    const s = sim.state;
    return { x: s.coach.x, z: s.coach.z, cash: s.cash, carry: s.coach.carry, stars: s.stars };
  });
}

export async function objective(page: Page): Promise<{ x: number; z: number; key: string } | null> {
  return page.evaluate(() => {
    const o = (window.__wk!.sim as { objective: { x: number; z: number; key: string } | null }).objective;
    return o ? { x: o.x, z: o.z, key: o.key } : null;
  });
}

/** Next nav waypoint from the coach towards (x,z) — walls and fences block straight lines. */
export async function waypoint(page: Page, x: number, z: number): Promise<{ x: number; z: number }> {
  return page.evaluate(
    ([tx, tz]) => {
      const sim = window.__wk!.sim as { state: { coach: { x: number; z: number } }; nav: { findPath(a: number, b: number, c: number, d: number): number[] } };
      const c = sim.state.coach;
      const p = sim.nav.findPath(c.x, c.z, tx as number, tz as number);
      return { x: p[0] ?? (tx as number), z: p[1] ?? (tz as number) };
    },
    [x, z],
  );
}

/** Steers the coach to a world point with real WASD key presses. */
export async function steerKeys(page: Page, x: number, z: number, maxMs = 12_000, tol = 0.45): Promise<void> {
  const t0 = Date.now();
  const held = new Set<string>();
  const set = async (want: Set<string>): Promise<void> => {
    for (const k of [...held]) if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
    for (const k of want) if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  };
  while (Date.now() - t0 < maxMs) {
    const c = await coach(page);
    if (Math.hypot(x - c.x, z - c.z) < tol) break;
    const wp = await waypoint(page, x, z);
    const dx = wp.x - c.x;
    const dz = wp.z - c.z;
    const want = new Set<string>();
    if (dx > 0.25) want.add('KeyD');
    if (dx < -0.25) want.add('KeyA');
    if (dz > 0.25) want.add('KeyS');
    if (dz < -0.25) want.add('KeyW');
    await set(want);
    await page.waitForTimeout(30);
  }
  await set(new Set());
}

/** Drags a touch joystick (CDP touch events → pointerType 'touch'). */
export async function touchDrag(cdp: CDPSession, from: { x: number; y: number }, dir: { x: number; y: number }, holdMs: number, page: Page): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dir.x * 60 * i) / steps, y: from.y + (dir.y * 60 * i) / steps, id: 1 }],
    });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Steers with the touch joystick towards a world point. */
export async function steerTouch(page: Page, cdp: CDPSession, x: number, z: number, maxMs = 15_000, tol = 0.5): Promise<void> {
  const vp = page.viewportSize() ?? { width: 390, height: 844 };
  const from = { x: vp.width / 2, y: vp.height * 0.72 };
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const c = await coach(page);
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < tol) break;
    const wp = await waypoint(page, x, z);
    const dx = wp.x - c.x;
    const dz = wp.z - c.z;
    const dw = Math.hypot(dx, dz) || 1;
    await touchDrag(cdp, from, { x: dx / dw, y: dz / dw }, Math.min(400, dw * 110), page);
  }
}

export function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    // the CrazyGames SDK script cannot be reached from the sandboxed CI network; the game must cope
    if (m.location().url.includes('crazygames')) return;
    if (m.text().includes('Failed to load resource')) return;
    errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  return errors;
}

/**
 * Takes over the game loop for fast-forwarded long sessions: the coach follows `sim.objective` like the economy
 * bot, office prompts are decided, results are continued and match cinematics skipped. Afterwards call
 * `driveBot(page, simSec, frameDt)` to advance; real rAF frames stop.
 */
export async function installBot(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Obj = { targetId: string; x: number; z: number; radius: number };
    type Grad = { id: number };
    const wk = window.__wk as unknown as {
      sim: {
        objective: Obj | null;
        state: { time: number; cash: number; coach: { x: number; z: number }; squad: unknown[]; built: Record<string, boolean> };
        input: { x: number; z: number };
        nav: { findPath(a: number, b: number, c: number, d: number): number[] };
        area: { matchPitch: { objectId: string } };
        tick(dt: number): void;
        podiumGraduate(): Grad | undefined;
        weakestSquadPlayer(): Grad | undefined;
        squadSize(): number;
        ovr(p: Grad): number;
        decideGraduate(d: 'sell' | 'promote'): void;
        cheapestUpgrade(): { id: string; cost: number } | null;
        upgradeFitsBudget(c: number): boolean;
        buyUpgrade(id: string): boolean;
      };
      loop: { stop(): void; advance(dt: number): void };
    };
    const { sim, loop } = wk;
    loop.stop();
    const tick = sim.tick.bind(sim);
    let path: number[] = [];
    let pathI = 0;
    let pathKey = '';
    const d2 = (a: number, b: number, c: number, d: number): number => (a - c) ** 2 + (b - d) ** 2;
    sim.tick = (dt: number): void => {
      const o = sim.objective;
      const c = sim.state.coach;
      sim.input.x = 0;
      sim.input.z = 0;
      if (o) {
        const key = `${o.targetId}:${o.x.toFixed(2)}:${o.z.toFixed(2)}:${Math.floor(sim.state.time / 2)}`;
        if (key !== pathKey) {
          pathKey = key;
          path = sim.nav.findPath(c.x, c.z, o.x, o.z);
          pathI = 0;
        }
        const stopR = Math.min(0.5, o.radius * 0.4);
        if (d2(c.x, c.z, o.x, o.z) > stopR * stopR) {
          while (pathI * 2 < path.length - 2 && d2(c.x, c.z, path[pathI * 2] as number, path[pathI * 2 + 1] as number) < 0.09) pathI++;
          const dx = (path[pathI * 2] ?? o.x) - c.x;
          const dz = (path[pathI * 2 + 1] ?? o.z) - c.z;
          const d = Math.hypot(dx, dz);
          if (d > 0.01) {
            const k = Math.min(1, d / 0.6 + 0.35);
            sim.input.x = (dx / d) * k;
            sim.input.z = (dz / d) * k;
          }
        }
      }
      tick(dt);
    };
    const shown = (sel: string): HTMLElement | undefined =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((e) => !e.closest('.hidden') && !e.classList.contains('hidden'));
    const handleUi = (): void => {
      const office = shown('.overlay .office-panel');
      if (office) {
        for (let g = sim.podiumGraduate(); g; g = sim.podiumGraduate()) {
          const w = sim.weakestSquadPlayer();
          const pitch = !!sim.state.built[sim.area.matchPitch.objectId];
          const promote = pitch && (sim.state.squad.length < sim.squadSize() || (!!w && sim.ovr(g) > sim.ovr(w) + 2));
          const btn = shown('.office-panel .btn-big.' + (promote ? 'promote' : 'sell'));
          if (btn) btn.click();
          else sim.decideGraduate(promote ? 'promote' : 'sell');
        }
        for (let n = 0; n < 6; n++) {
          const up = sim.cheapestUpgrade();
          if (!up || sim.state.cash < up.cost || !sim.upgradeFitsBudget(up.cost)) break;
          sim.buyUpgrade(up.id);
        }
        office.querySelector<HTMLElement>('.close')?.click();
        return;
      }
      const res = shown('.results-panel .btn-big.promote');
      if (res) return res.click();
      shown('.m-skip')?.click();
      document.querySelector<HTMLElement>('.overlay:not(.hidden) .close')?.click();
    };
    (window as unknown as { __wkDrive: (sec: number, fd: number) => number }).__wkDrive = (sec, fd) => {
      const t0 = sim.state.time;
      let frames = 0;
      while (sim.state.time - t0 < sec && frames < 200_000) {
        loop.advance(fd);
        if (++frames % 3 === 0) handleUi();
      }
      return sim.state.time;
    };
  });
}

/** Advances a bot-driven session (see installBot) by `simSec` simulated seconds, rendering every `frameDt`. */
export async function driveBot(page: Page, simSec: number, frameDt = 0.25): Promise<number> {
  return page.evaluate(([s, fd]) => (window as unknown as { __wkDrive: (sec: number, fd: number) => number }).__wkDrive(s as number, fd as number), [simSec, frameDt]);
}
