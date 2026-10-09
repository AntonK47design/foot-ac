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
    const dx = x - c.x;
    const dz = z - c.z;
    if (Math.hypot(dx, dz) < tol) break;
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
    const dx = x - c.x;
    const dz = z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) break;
    await touchDrag(cdp, from, { x: dx / d, y: dz / d }, Math.min(400, d * 120), page);
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
