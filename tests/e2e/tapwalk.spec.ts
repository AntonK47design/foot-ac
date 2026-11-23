import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

type Wk = {
  sim: { state: { coach: { x: number; z: number; moved: number } } };
  view: { projector: { project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean } } };
};

// A single click / tap (no hold, no keyboard focus needed) walks the coach to the ground point.
test('a single click or tap on the ground walks the coach there', async ({ page, isMobile }) => {
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  const start = await page.evaluate(() => {
    const c = (window.__wk as unknown as Wk).sim.state.coach;
    return { x: c.x, z: c.z };
  });
  const target = { x: start.x + 2.5, z: start.z + 1.5 };
  const p = await page.evaluate(
    ([x, z]) => (window.__wk as unknown as Wk).view.projector.project(x, 0, z, { x: 0, y: 0, visible: true }),
    [target.x, target.z],
  );
  expect(p.visible).toBe(true);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect
    .poll(
      async () =>
        page.evaluate(([x, z]) => {
          const c = (window.__wk as unknown as Wk).sim.state.coach;
          return Math.hypot(c.x - x, c.z - z);
        }, [target.x, target.z]),
      { timeout: 4000 },
    )
    .toBeLessThan(0.8);
  // enough to count as the player's first move (hint hides, `first_move` fires)
  expect(await page.evaluate(() => (window.__wk as unknown as Wk).sim.state.coach.moved)).toBeGreaterThan(2);
  await expect(page.locator('.hint')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});
