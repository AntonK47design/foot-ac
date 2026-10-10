import { expect, test, type Page } from '@playwright/test';
import { attachConsole, coach, waitForGameplay } from './helpers';

type Wk = {
  sim: {
    world: { padList: Array<{ id: string; area: number }>; pads: Map<string, unknown> };
    unlockPad(p: unknown): void;
    state: { coach: { x: number; z: number; px: number; pz: number; carry: number }; cash: number };
    area3Open(): boolean;
    coachCarryKind(): string;
    squadSize(): number;
  };
};

async function unlock(page: Page, filter: number | string[]): Promise<void> {
  await page.evaluate((f) => {
    const sim = (window.__wk as unknown as Wk).sim;
    const ids = typeof f === 'number' ? sim.world.padList.filter((p) => p.area <= f).map((p) => p.id) : f;
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

test.describe('M7 Youth Stadium', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('locked behind its gate, bibs feed the drills, the stadium makes the squad 11-a-side', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    await unlock(page, 2);
    await teleport(page, 14.5, 36.5);
    await expect(page.locator('.lock-sign span').filter({ hasText: /^Youth Stadium$/ })).toBeVisible();
    await page.screenshot({ path: 'screenshots/m7-gate-locked.png' });
    // the fence holds until the gate pad is bought
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyS');
    expect((await coach(page)).z).toBeLessThan(40);
    await unlock(page, ['p3_gate', 'p3_kit', 'p3_crossing', 'p3_heading', 'p3_kitman', 'p3_cross_l2', 'p3_juggling', 'p3_head_l2', 'p3_reaction']);
    expect(await page.evaluate(() => (window.__wk as unknown as Wk).sim.area3Open())).toBe(true);
    await expect(page.locator('.lock-sign span').filter({ hasText: /^Youth Stadium$/ })).toBeHidden();
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyS');
    expect((await coach(page)).z).toBeGreaterThan(40.5);
    // Kit Room → bib stack
    await teleport(page, 10.1, 43.0);
    await expect.poll(async () => page.evaluate(() => (window.__wk as unknown as Wk).sim.coachCarryKind())).toBe('bib');
    expect((await coach(page)).carry).toBeGreaterThan(0);
    await page.screenshot({ path: 'screenshots/m7-kit-room.png' });
    await teleport(page, -6.0, 47.0);
    await page.screenshot({ path: 'screenshots/m7-drills.png' });
    await unlock(page, ['p3_jug_l2', 'p3_kitman2', 'p3_tactics', 'p3_react_l2', 'p3_shop', 'p3_analysis']);
    await teleport(page, 6.0, 57.6);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: 'screenshots/m7-rooms.png' });
    await unlock(page, ['p3_stadium', 'p3_stand_main', 'p3_lights', 'p3_stand_sides']);
    expect(await page.evaluate(() => (window.__wk as unknown as Wk).sim.squadSize())).toBe(11);
    await teleport(page, 2.0, 66.0);
    await page.screenshot({ path: 'screenshots/m7-stadium.png' });
    expect(errors).toEqual([]);
  });
});
