import { expect, test } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

const H = 3_600_000;

test.describe('M4 meta', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('a day later: welcome back shows offline earnings and the day-2 reward', async ({ page }) => {
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    // level 2 with a ball boy hired and some income; day 1 already claimed
    await page.evaluate(() => {
      const wk = window.__wk!;
      const sim = wk.sim as {
        state: { level: number; tickets: number; staff: Array<Record<string, unknown>>; coach: Record<string, unknown>; meta: { incomeRate: number } };
        now: number;
        claimDaily(): unknown;
      };
      sim.state.level = 2;
      sim.state.staff.push({ ...sim.state.coach, id: 'ball_boy', kind: 'ball_boy', state: 'idle', carry: 0, target: null, timer: 0, goal: null, path: [], pathI: 0, stuckT: 0, bestD: 0, moving: false });
      sim.state.meta.incomeRate = 2;
      sim.now = (wk.clock as { now(): number }).now();
      sim.claimDaily();
    });
    const tickets0 = await page.evaluate(() => (window.__wk!.sim as { state: { tickets: number } }).state.tickets);
    await page.evaluate((ms) => {
      const wk = window.__wk!;
      (wk.clock as { skip(ms: number): void }).skip(ms);
      (wk.welcomeBack as (s: number) => boolean)(ms / 1000);
    }, 25 * H);
    const panel = page.locator('.overlay:not(.hidden) .welcome-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.wb-cash')).toContainText('+');
    await expect(panel.locator('.cal-day.today')).toContainText('Today');
    await expect(panel.locator('.cal-day.done')).toHaveCount(1);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'screenshots/m4-welcome.png' });
    const cash0 = await page.evaluate(() => (window.__wk!.sim as { state: { cash: number } }).state.cash);
    await panel.locator('.btn-big').click();
    await expect(panel).toBeHidden();
    const after = await page.evaluate(() => (window.__wk!.sim as { state: { cash: number; tickets: number } }).state);
    expect(after.tickets).toBe(tickets0 + 1); // day 2 = 1 Scout Ticket
    expect(after.cash).toBeGreaterThan(cash0 + 1000); // 2/s × 50% × 2 h cap
    // HUD: daily button shows, claimed for today
    await expect(page.locator('.btn-side', { hasText: 'Daily' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('quests, scouting and the Hall of Fame open from the HUD', async ({ page }) => {
    const errors = attachConsole(page);
    await page.goto('/');
    await waitForGameplay(page);
    await page.evaluate(() => {
      const sim = window.__wk!.sim as { state: { level: number; tickets: number; meta: { album: Record<string, number> } }; updateMeta(): void };
      sim.state.level = 7;
      sim.state.tickets = 3;
      sim.state.meta.album = { 'FW:common': 2, 'MF:rare': 1 };
      sim.updateMeta();
    });
    const open = page.locator('.overlay:not(.hidden) .panel');
    await page.locator('.btn-side', { hasText: 'Quests' }).click();
    await expect(open.locator('.quest')).toHaveCount(3);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'screenshots/m4-quests.png' });
    await open.locator('.close').click();
    await page.locator('.btn-side', { hasText: 'Scout' }).click();
    await expect(open.locator('.scout-tier')).toHaveCount(3);
    await open.locator('.scout-tier').nth(1).locator('.btn-big').click();
    await expect(open.locator('.scout-active')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'screenshots/m4-scout.png' });
    await open.locator('.close').click();
    await page.locator('.btn-side', { hasText: 'Hall of Fame' }).click();
    await expect(open.locator('.album .slot.got')).toHaveCount(2);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'screenshots/m4-album.png' });
    await open.locator('.close').click();
    await expect(page.locator('.overlay:not(.hidden)')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
