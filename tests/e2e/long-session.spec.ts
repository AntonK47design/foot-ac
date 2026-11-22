import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { attachConsole, driveBot, installBot, waitForGameplay } from './helpers';

interface Sample {
  heapMb: number;
  geometries: number;
  textures: number;
  programs: number;
  actors: number;
  time: number;
}

async function sample(page: Page, cdp: CDPSession): Promise<Sample> {
  await page.waitForTimeout(1300); // popups / flying coins finish on their timers
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return page.evaluate((used) => {
    type View = { core: { renderer: { info: { memory: { geometries: number; textures: number }; programs: unknown[] | null } } }; actors: Map<string, unknown> };
    const wk = window.__wk as unknown as { view: View; sim: { state: { time: number } } };
    const info = wk.view.core.renderer.info;
    return { heapMb: used / 1e6, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0, actors: wk.view.actors.size, time: wk.sim.state.time };
  }, usedSize);
}

/**
 * Long-session leak guard (DECISIONS §86): a late-game academy keeps churning characters (trainees come and go,
 * every match spawns two line-ups). After warm-up the GPU resource counts and the JS heap must stay flat.
 * Without the fixes textures grew by ~20 per simulated minute here.
 */
test.describe('long session', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('heap and renderer.info stay flat while characters churn', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = attachConsole(page);
    await page.setViewportSize({ width: 480, height: 270 });
    await page.goto('/');
    await waitForGameplay(page);
    await installBot(page);
    // late game: everything built, so characters (and matches) churn while the static scene no longer grows
    await page.evaluate(() => {
      const sim = (window.__wk as unknown as { sim: { world: { padList: Array<{ id: string }>; pads: Map<string, unknown> }; unlockPad(p: unknown): void } }).sim;
      for (const p of sim.world.padList) sim.unlockPad(sim.world.pads.get(p.id));
    });
    const cdp = await page.context().newCDPSession(page);
    // ~20 sim steps per rendered frame (the loop maximum) keeps the run inside the budget on SwiftShader
    await driveBot(page, 60, 0.33);
    const warm = await sample(page, cdp);
    let last = warm;
    for (let i = 0; i < 3; i++) {
      await driveBot(page, 50, 0.33);
      last = await sample(page, cdp);
    }
    console.log('long session', JSON.stringify({ warm, last }));
    expect(last.time - warm.time).toBeGreaterThan(140);
    // bone textures used to grow with every character ever spawned (+~20 per simulated minute)
    expect(last.textures - warm.textures).toBeLessThanOrEqual(Math.max(8, last.actors - warm.actors + 4));
    expect(last.geometries - warm.geometries).toBeLessThanOrEqual(4);
    expect(last.programs).toBe(warm.programs);
    expect(last.heapMb - warm.heapMb).toBeLessThan(6);
    // SwiftShader's read-back performance note (boot-time icon atlas) is a driver hint, not a game error
    expect(errors.filter((e) => !e.includes('GPU stall due to ReadPixels'))).toEqual([]);
  });
});
