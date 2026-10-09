import { expect, test, type Page } from '@playwright/test';
import { attachConsole, coach, waitForGameplay } from './helpers';

type Wk = { sim: { world: { padList: Array<{ id: string; area: number }>; pads: Map<string, unknown> }; unlockPad(p: unknown): void; state: { coach: { x: number; z: number; px: number; pz: number; carry: number }; cash: number }; area2Open(): boolean; coachCarryKind(): string } };

async function unlock(page: Page, filter: 'area1' | string[]): Promise<void> {
  await page.evaluate((f) => {
    const sim = (window.__wk as unknown as Wk).sim;
    const ids = f === 'area1' ? sim.world.padList.filter((p) => p.area === 1).map((p) => p.id) : f;
    for (const id of ids) sim.unlockPad(sim.world.pads.get(id));
  }, filter);
}

async function teleport(page: Page, x: number, z: number): Promise<void> {
  await page.evaluate(
    ([x, z]) => {
      const c = (window.__wk as unknown as Wk).sim.state.coach;
      c.x = c.px = x;
      c.z = c.pz = z;
    },
    [x, z],
  );
  await page.waitForTimeout(900);
}

test.describe('M6 Training Ground', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('locked behind the gate, opens with the gate pad, water drills work', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    await unlock(page, 'area1');
    await teleport(page, 10.5, 9.0);
    await expect(page.locator('.lock-sign', { hasText: 'Training Ground' })).toBeVisible();
    await page.screenshot({ path: 'screenshots/m6-gate-locked.png' });
    // the fence holds: walking south stops at the border
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyS');
    expect((await coach(page)).z).toBeLessThan(12);
    await unlock(page, ['p2_gate', 'p2_water', 'p2_gym', 'p2_rondo', 'p2_gym_l2', 'p2_fk', 'p2_rondo_l2', 'p2_agility', 'p2_fk_l2', 'p2_skills']);
    expect(await page.evaluate(() => (window.__wk as unknown as Wk).sim.area2Open())).toBe(true);
    await expect(page.locator('.lock-sign', { hasText: 'Training Ground' })).toBeHidden();
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyS');
    expect((await coach(page)).z).toBeGreaterThan(12.5);
    // hydration point → water stack
    await teleport(page, 13.8, 16.1);
    await expect.poll(async () => page.evaluate(() => (window.__wk as unknown as Wk).sim.coachCarryKind())).toBe('water');
    expect((await coach(page)).carry).toBeGreaterThan(0);
    await page.screenshot({ path: 'screenshots/m6-hydration.png' });
    await teleport(page, -3.0, 20.0);
    await page.screenshot({ path: 'screenshots/m6-drills.png' });
    await unlock(page, ['p2_physio', 'p2_seven']);
    await teleport(page, 4.0, 30.0);
    await page.screenshot({ path: 'screenshots/m6-seven.png' });
    expect(errors).toEqual([]);
  });
});
