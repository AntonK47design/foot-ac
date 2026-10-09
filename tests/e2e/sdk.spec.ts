import { expect, test, type Page } from '@playwright/test';
import { attachConsole, waitForGameplay } from './helpers';

/**
 * M5 SDK audit: a recording stand-in for window.CrazyGames.SDK (the real script can't be fetched from CI)
 * exercises the CrazyGamesAdapter path and checks the §6 event map.
 */
async function fakeSdk(page: Page): Promise<void> {
  await page.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.addInitScript(() => {
    const cg = { calls: [] as string[], data: {} as Record<string, string>, settingsL: [] as Array<(s: unknown) => void>, authL: [] as Array<(u: unknown) => void> };
    (window as unknown as { __cg: typeof cg }).__cg = cg;
    const rec = (n: string): void => void cg.calls.push(n);
    const settings = { muteAudio: false, disableChat: false };
    (window as unknown as { CrazyGames: unknown }).CrazyGames = {
      SDK: {
        environment: 'local',
        init: async () => rec('init'),
        game: {
          loadingStart: () => rec('loadingStart'),
          loadingStop: () => rec('loadingStop'),
          gameplayStart: () => rec('gameplayStart'),
          gameplayStop: () => rec('gameplayStop'),
          happytime: () => rec('happytime'),
          settings,
          addSettingsChangeListener: (fn: (s: unknown) => void) => cg.settingsL.push(fn),
          reportGameCompletedPercentage: (p: number) => rec('completion:' + p),
          setGameContext: () => rec('context'),
        },
        ad: {
          requestAd: (type: string, cb: { adStarted?: () => void; adFinished?: () => void }) => {
            rec('requestAd:' + type);
            setTimeout(() => {
              cb.adStarted?.();
              setTimeout(() => cb.adFinished?.(), 200);
            }, 50);
          },
          hasAdblock: async () => false,
        },
        data: {
          getItem: (k: string) => cg.data[k] ?? null,
          setItem: (k: string, v: string) => {
            rec('setItem');
            cg.data[k] = v;
          },
          removeItem: (k: string) => delete cg.data[k],
        },
        user: {
          isUserAccountAvailable: true,
          systemInfo: { device: { type: 'desktop' } },
          getUser: async () => null,
          showAuthPrompt: async () => ({ username: 'coach' }),
          addAuthListener: (fn: (u: unknown) => void) => cg.authL.push(fn),
        },
      },
    };
  });
}

const calls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __cg: { calls: string[] } }).__cg.calls);
const gameplayCalls = async (page: Page): Promise<string[]> => (await calls(page)).filter((c) => c === 'gameplayStart' || c === 'gameplayStop');

test.describe('M5 SDK audit', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('event map: boot order, idempotent gameplay state, panels, blur, data and completion', async ({ page }) => {
    const errors = attachConsole(page);
    await fakeSdk(page);
    await page.goto('/');
    await waitForGameplay(page);
    expect(await page.evaluate(() => (window.__wk!.platform as { kind: string }).kind)).toBe('local');
    const c0 = await calls(page);
    const first = (n: string): number => c0.indexOf(n);
    expect(first('init')).toBe(0);
    expect(first('loadingStart')).toBeGreaterThan(first('init'));
    expect(first('loadingStop')).toBeGreaterThan(first('loadingStart'));
    expect(first('gameplayStart')).toBeGreaterThan(first('loadingStop'));
    expect(c0).toContain('context');
    // a blocking panel stops gameplay, closing resumes; tab blur/focus never touches it
    await page.locator('.gear').click();
    await expect.poll(async () => (await gameplayCalls(page)).at(-1)).toBe('gameplayStop');
    await page.locator('.overlay:not(.hidden) .close').first().click();
    await expect.poll(async () => (await gameplayCalls(page)).at(-1)).toBe('gameplayStart');
    const before = (await gameplayCalls(page)).length;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForTimeout(300);
    const g = await gameplayCalls(page);
    expect(g.length).toBe(before);
    for (let i = 1; i < g.length; i++) expect(g[i], 'never double-called').not.toBe(g[i - 1]);
    // saves go through SDK.data
    await page.evaluate(() => (window.__wk!.persist as (r: string) => void)('test'));
    expect(await calls(page)).toContain('setItem');
    // completion % is monotonic
    const pct = (await calls(page)).filter((c) => c.startsWith('completion:')).map((c) => Number(c.split(':')[1]));
    for (let i = 1; i < pct.length; i++) expect(pct[i]!).toBeGreaterThan(pct[i - 1]!);
    expect(errors).toEqual([]);
  });

  test('muteAudio overrides audio; auth change reloads the save with a toast', async ({ page }) => {
    await fakeSdk(page);
    await page.goto('/');
    await waitForGameplay(page);
    await page.evaluate(() => {
      const cg = (window as unknown as { __cg: { settingsL: Array<(s: unknown) => void> } }).__cg;
      for (const fn of cg.settingsL) fn({ muteAudio: true });
    });
    expect(await page.evaluate(() => (window.__wk!.audio as { platformMuted: boolean }).platformMuted)).toBe(true);
    // the account's save (here: 999 cash) replaces the guest one on login
    await page.evaluate(() => {
      const wk = window.__wk!;
      (wk.persist as (r: string) => void)('pre-login');
      const cg = (window as unknown as { __cg: { data: Record<string, string>; authL: Array<(u: unknown) => void> } }).__cg;
      const k = Object.keys(cg.data)[0]!;
      const blob = JSON.parse(cg.data[k]!) as { game: { cash: number } };
      blob.game.cash = 999;
      cg.data[k] = JSON.stringify(blob);
      for (const fn of cg.authL) fn({ username: 'coach' });
    });
    await expect(page.locator('.toast', { hasText: 'Progress loaded' })).toBeVisible();
    expect(await page.evaluate(() => (window.__wk!.sim as { state: { cash: number } }).state.cash)).toBe(999);
  });

  test('rewarded ad: gameplay stops while it plays, reward only after it finished', async ({ page }) => {
    await fakeSdk(page);
    await page.goto('/');
    await waitForGameplay(page);
    const ok = await page.evaluate(async () => {
      const wk = window.__wk!;
      (wk.platform as { enableAdsForTesting(): void }).enableAdsForTesting();
      return (wk.ads as { rewarded(p: string): Promise<boolean> }).rewarded('daily');
    });
    expect(ok).toBe(true);
    const c = await calls(page);
    const i = c.indexOf('requestAd:rewarded');
    expect(i).toBeGreaterThan(0);
    expect(c.slice(0, i).filter((x) => x.startsWith('gameplay')).at(-1)).toBe('gameplayStop');
    expect(c.slice(i).filter((x) => x.startsWith('gameplay'))[0]).toBe('gameplayStart');
    expect(await page.evaluate(() => (window.__wk!.audio as { adMuted: boolean }).adMuted)).toBe(false);
  });
});
