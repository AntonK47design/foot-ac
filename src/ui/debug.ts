import type { RealClock } from '../core/clock';
import type { FixedLoop } from '../core/loop';
import type { Platform } from '../platform/platform';
import { MockAdapter } from '../platform/mock';
import type { Sim } from '../sim/sim';
import type { GameView } from '../view/game-view';
import type { RenderCore } from '../view/renderer';

interface DebugDeps {
  sim: Sim;
  platform: Platform;
  view: GameView;
  clock: RealClock;
  core: RenderCore;
  loop: FixedLoop;
}

interface PerfMemory {
  memory?: { usedJSHeapSize: number };
}

/** ?debug=1 overlay (dev / test builds only): perf stats, SDK log, cheats, platform toggles. */
export function mountDebug(d: DebugDeps): void {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:50;background:rgba(0,0,0,.72);color:#fff;font:12px/1.35 monospace;padding:8px;border-radius:8px;max-width:340px;pointer-events:auto;user-select:text';
  const stats = document.createElement('pre');
  stats.style.margin = '0 0 6px';
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
  const log = document.createElement('pre');
  log.style.cssText = 'margin:6px 0 0;max-height:120px;overflow:auto;opacity:.85';
  box.append(stats, btns, log);
  document.body.appendChild(box);
  const add = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px monospace;padding:4px 6px;border-radius:6px;border:0;cursor:pointer';
    b.addEventListener('click', fn);
    btns.appendChild(b);
  };
  add('+$500', () => {
    d.sim.state.cash += 500;
  });
  add('+1h', () => d.clock.skip(3600_000));
  add('+1d', () => d.clock.skip(86400_000));
  add('skip tutorial', () => {
    const s = d.sim.state;
    s.flags.firstCash = true;
    for (const id of ['p_crate', 'p_goal', 'p_cones']) {
      const p = d.sim.world.pads.get(id);
      if (p) d.sim.unlockPad(p);
    }
  });
  const mock = d.platform.adapter instanceof MockAdapter ? d.platform.adapter : null;
  if (mock) {
    add('adblock', () => (mock.options.adblock = !mock.options.adblock));
    add('unfilled', () => (mock.options.unfilled = !mock.options.unfilled));
    add('login', () => mock.setUser({ username: 'MockCoach' }));
    add('logout', () => mock.setUser(null));
    add('mute', () => mock.setMuted(!mock.isMuted()));
  }
  let frames = 0;
  let acc = 0;
  let fps = 0;
  let last = performance.now();
  const tick = (): void => {
    const now = performance.now();
    acc += now - last;
    last = now;
    frames++;
    if (acc >= 500) {
      fps = (frames * 1000) / acc;
      frames = 0;
      acc = 0;
      const st = d.view.stats();
      const mem = (performance as Performance & PerfMemory).memory;
      stats.textContent =
        `fps ${fps.toFixed(0)}  tier ${d.core.tier}${d.loop.fpsCap ? ' cap' + d.loop.fpsCap : ''}\n` +
        `calls ${st.calls}  tris ${(st.tris / 1000).toFixed(1)}k\n` +
        `heap ${mem ? (mem.usedJSHeapSize / 1048576).toFixed(0) + 'MB' : 'n/a'}  sdk ${d.platform.kind}\n` +
        `t ${d.sim.state.time.toFixed(0)}s  trainees ${d.sim.state.trainees.length}  clock+${(d.clock.offsetMs / 3600000).toFixed(1)}h`;
      log.textContent = d.platform.log
        .slice(-12)
        .map((e) => `${(e.t / 1000).toFixed(2)} ${e.msg}`)
        .join('\n');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
