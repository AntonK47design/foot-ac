import { expect, test } from '@playwright/test';
import { attachConsole, coach, objective, steerKeys, steerTouch, waitForGameplay } from './helpers';

const SHOT_DIR = 'screenshots';

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('boots straight into gameplay ≤ 3 s with no console errors', async ({ page }) => {
    const errors = attachConsole(page);
    const t0 = Date.now();
    await page.goto('/');
    await waitForGameplay(page);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(3000);
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
    // no menu, controllable: hint shows WASD
    await expect(page.locator('.hint-text')).toHaveText('WASD or hold mouse');
  });

  test('WASD reaches the first cash and first pad, the pad unlocks, and save → reload restores', async ({ page }) => {
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    const o = await objective(page);
    expect(o?.key).toBe('obj.collect_cash');
    await steerKeys(page, o!.x, o!.z);
    await expect.poll(async () => (await coach(page)).cash).toBeGreaterThanOrEqual(15);
    const o2 = await objective(page);
    expect(o2?.key).toBe('obj.unlock');
    await steerKeys(page, o2!.x, o2!.z, 12_000, 0.3);
    await expect.poll(async () => (await coach(page)).stars, { timeout: 5000 }).toBe(1);
    const total = await page.evaluate(() => (window.__wk!.sim as { world: { totalStars: number } }).world.totalStars);
    await expect(page.locator('.starbar-text')).toHaveText(`1/${total}`);
    // save → reload
    await page.evaluate(() => (window.__wk!.persist as (r: string) => void)('test'));
    const before = await coach(page);
    await page.reload();
    await waitForGameplay(page);
    const after = await coach(page);
    expect(after.stars).toBe(1);
    expect(after.cash).toBeCloseTo(before.cash, 3);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.5);
    expect(errors).toEqual([]);
  });

  test('hold-mouse moves the coach towards the cursor', async ({ page }) => {
    await page.goto('/');
    await waitForGameplay(page);
    const before = await coach(page);
    await page.mouse.move(1100, 360);
    await page.mouse.down();
    // hold until the coach has moved (software GL in CI can run at a few FPS), up to 3 s
    for (let i = 0; i < 30 && (await coach(page)).x <= before.x + 1; i++) await page.waitForTimeout(100);
    await page.mouse.up();
    const after = await coach(page);
    expect(after.x).toBeGreaterThan(before.x + 1);
  });

  test('settings panel pauses gameplay and resumes on close', async ({ page }) => {
    await page.goto('/');
    await waitForGameplay(page);
    await page.locator('.gear').click();
    await expect(page.locator('.overlay:not(.hidden) .panel')).toBeVisible();
    const log1 = await page.evaluate(() => (window.__wk!.platform as { log: Array<{ msg: string }> }).log.map((e) => e.msg));
    expect(log1.filter((m) => m === 'gameplayStop').length).toBe(1);
    await page.locator('.overlay:not(.hidden) .panel .close').click();
    const log2 = await page.evaluate(() => (window.__wk!.platform as { log: Array<{ msg: string }> }).log.map((e) => e.msg));
    expect(log2.filter((m) => m === 'gameplayStart').length).toBe(2);
  });

  test('office transfer choice, squad and a full match with a Power Shot', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    type W = { sim: { unlockPad(p: unknown): void; world: { pads: Map<string, unknown> }; state: Record<string, unknown> & { coach: { x: number; z: number; px: number; pz: number }; squad: unknown[]; cash: number }; spawnTrainee(): { stats: Record<string, number> } | undefined; graduate(t: unknown): void; area: { office: { computer: { x: number; z: number } }; matchPitch: { kickoff: { x: number; z: number } } } } };
    await page.evaluate(() => {
      const sim = (window.__wk as unknown as W).sim;
      for (const id of ['p_crate', 'p_goal', 'p_cones', 'p_wall', 'p_cones_l2', 'p_match']) sim.unlockPad(sim.world.pads.get(id));
      const t = sim.spawnTrainee();
      if (t) sim.graduate(t);
    });
    const tp = (x: number, z: number): Promise<void> =>
      page.evaluate(([x, z]) => {
        const c = (window.__wk as unknown as W).sim.state.coach;
        c.x = c.px = x as number;
        c.z = c.pz = z as number;
      }, [x, z]);
    const P = await page.evaluate(() => (window.__wk as unknown as W).sim.area.office.computer);
    // wait for the graduate to sit down in the office, then go to the computer
    await expect.poll(async () => page.evaluate(() => ((window.__wk as unknown as W).sim.state.podiumQueue as number[]).length), { timeout: 5000 }).toBe(1);
    await expect
      .poll(async () => page.evaluate(() => !!(window.__wk as unknown as { sim: { podiumGraduate(): unknown } }).sim.podiumGraduate()), { timeout: 30_000 })
      .toBe(true);
    await tp(P.x, P.z);
    await expect(page.locator('.office-panel')).toBeVisible({ timeout: 10_000 });
    const stops = async (): Promise<number> => page.evaluate(() => (window.__wk!.platform as { log: Array<{ msg: string }> }).log.filter((e) => e.msg === 'gameplayStop').length);
    expect(await stops()).toBe(1);
    await page.locator('.office-panel .btn-big.promote').click();
    expect(await page.evaluate(() => (window.__wk as unknown as W).sim.state.squad.length)).toBe(1);
    // the office stays open on its upgrade tabs: buy one, then close
    await page.locator('.office-panel .tab').nth(1).click();
    await page.evaluate(() => ((window.__wk as unknown as W).sim.state.cash = 1000));
    await page.locator('.office-panel .tab').nth(1).click();
    await page.locator('.office-panel .up-item .btn-big.sell').first().click();
    expect(await page.evaluate(() => Object.keys((window.__wk as unknown as W).sim.state.upgrades as object).length)).toBe(1);
    await page.locator('.office-panel .btn-round.close').click();
    await expect(page.locator('.office-panel')).toBeHidden();
    await expect(page.locator('.btn-side').first()).toBeVisible();
    // kick off: the cinematic plays, the Power Shot meter takes Space, results stop gameplay
    const K = await page.evaluate(() => (window.__wk as unknown as W).sim.area.matchPitch.kickoff);
    await tp(K.x, K.z);
    await expect(page.locator('.match-ui')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.m-meter')).toBeVisible({ timeout: 60_000 });
    await page.keyboard.press('Space');
    await expect(page.locator('.results-panel')).toBeVisible({ timeout: 90_000 });
    const cash = await page.evaluate(() => (window.__wk as unknown as W).sim.state.cash);
    await page.locator('.results-panel .btn-big.promote').click();
    await expect(page.locator('.results-panel')).toBeHidden();
    await expect(page.locator('.match-ui')).toBeHidden();
    const rows = await page.evaluate(() => ((window.__wk as unknown as W).sim.state.league as { table: Array<{ p: number }> }).table.filter((r) => r.p === 1).length);
    expect(rows).toBe(6);
    expect(cash).toBeGreaterThan(0);
    const log = await page.evaluate(() => (window.__wk!.platform as { log: Array<{ msg: string }> }).log.map((e) => e.msg));
    expect(log[log.length - 1]).toBe('gameplayStart');
    expect(errors).toEqual([]);
  });

  for (const [w, h] of [
    [800, 450],
    [1280, 720],
    [1920, 1080],
  ]) {
    test(`screenshot ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w as number, height: h as number });
      await page.goto('/');
      await waitForGameplay(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOT_DIR}/desktop-${w}x${h}.png` });
    });
  }
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile only');

  test('touch joystick moves the coach, rotation keeps state and HUD inside the screen', async ({ page, context }, info) => {
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    await expect(page.locator('.hint-text')).toHaveText('Drag to move');
    const cdp = await context.newCDPSession(page);
    const o = await objective(page);
    await steerTouch(page, cdp, o!.x, o!.z);
    const collected = (): Promise<number> => page.evaluate(() => (window.__wk!.sim as { state: { stats: { cashCollected: number } } }).state.stats.cashCollected);
    await expect.poll(collected).toBeGreaterThanOrEqual(15);
    // walk onto the Ball Crate pad (it may already be paid if the drag crossed it)
    const pad = await page.evaluate(() => (window.__wk!.sim as { world: { pads: Map<string, { pos: { x: number; z: number } }> } }).world.pads.get('p_crate')!.pos);
    if ((await coach(page)).stars < 1) await steerTouch(page, cdp, pad.x, pad.z, 15_000, 0.35);
    await expect.poll(async () => (await coach(page)).stars, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: `${SHOT_DIR}/${info.project.name}-portrait.png` });

    // rotate to landscape mid-session
    const vp = page.viewportSize()!;
    const before = await coach(page);
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await page.waitForTimeout(500);
    const after = await coach(page);
    expect(after.cash).toBe(before.cash);
    expect(after.stars).toBe(before.stars);
    for (const sel of ['.gear', '.badge', '.starbar', '.cash', '.objective']) {
      const b = await page.locator(sel).boundingBox();
      expect(b, sel).not.toBeNull();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.y).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(vp.height + 0.5);
      expect(b!.y + b!.height).toBeLessThanOrEqual(vp.width + 0.5);
    }
    await page.screenshot({ path: `${SHOT_DIR}/${info.project.name}-landscape.png` });
    expect(errors).toEqual([]);
  });
});

test.describe('layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'run once with touch emulation');
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [844, 390],
    [1024, 768],
  ]) {
    test(`no HUD overlap at ${w}x${h}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel', 'once');
      await page.setViewportSize({ width: w as number, height: h as number });
      await page.goto('/');
      await waitForGameplay(page);
      await page.waitForTimeout(400);
      const sels = ['.gear', '.badge', '.starbar', '.cash', '.objective'];
      const boxes = [];
      for (const s of sels) boxes.push({ s, b: (await page.locator(s).boundingBox())! });
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!.b;
          const c = boxes[j]!.b;
          const overlap = a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
          expect(overlap, `${boxes[i]!.s} overlaps ${boxes[j]!.s}`).toBe(false);
        }
      await page.screenshot({ path: `${SHOT_DIR}/layout-${w}x${h}.png` });
    });
  }
});
