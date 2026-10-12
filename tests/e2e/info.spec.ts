import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

type Wk = {
  sim: { state: { coach: { x: number; z: number; px: number; pz: number } } };
  view: { projector: { project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): { x: number; y: number; visible: boolean } } };
};

test('tapping the office or the sign-up desk explains it', async ({ page, isMobile }) => {
  const errors = attachConsole(page);
  await page.goto('/');
  await waitForGameplay(page);
  for (const [x, z, title] of [
    [-10.0, 2.05, "Manager's Office"],
    [-13.1, -8.4, 'Sign-up desk'],
  ] as const) {
    await page.evaluate(
      ([x, z]) => {
        const c = (window.__wk as unknown as Wk).sim.state.coach;
        c.x = c.px = x + 1.5;
        c.z = c.pz = z + 2;
      },
      [x, z],
    );
    await page.waitForTimeout(1200);
    const p = await page.evaluate(([x, z]) => (window.__wk as unknown as Wk).view.projector.project(x, 0.6, z, { x: 0, y: 0, visible: true }), [x, z]);
    expect(p.visible).toBe(true);
    if (isMobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await expect(page.locator('.info-card:not(.hidden)')).toContainText(title);
  }
  expect(errors).toEqual([]);
});
