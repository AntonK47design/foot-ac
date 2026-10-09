import './ui/styles.css';
import { AREA1 } from './data/areas/area1';
import { BALANCE } from './data/balance';
import { BUILD, SAVE_VERSION } from './data/constants';
import { analytics } from './core/analytics';
import { RealClock } from './core/clock';
import { resolveLocale, setLocale, t } from './core/i18n';
import { FixedLoop } from './core/loop';
import { SaveManager } from './core/save';
import { createPlatform, type Platform } from './platform/platform';
import { Sim, createInitialState } from './sim/sim';
import { Hud } from './ui/hud';
import { Input, type InputMethod } from './ui/input';
import { DEFAULT_SETTINGS, SettingsPanel, type Settings } from './ui/settings';
import { AudioSystem } from './view/audio';
import { GameView } from './view/game-view';
import { autoTier, FpsWatchdog, type Tier } from './view/quality';
import { RenderCore } from './view/renderer';

declare global {
  interface Window {
    __wk?: Record<string, unknown>;
    __wkBootT0?: number;
  }
}

const TEST_HOOKS = import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1';

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

async function boot(): Promise<void> {
  analytics.track('boot');
  const platform: Platform = await createPlatform();
  analytics.track('sdk_ready', { kind: platform.kind });
  platform.loadingStart();

  const clock = new RealClock();
  const saves = new SaveManager(platform, AREA1, () => clock.now());
  const loaded = saves.load();
  let settings: Settings = loaded?.settings ?? { ...DEFAULT_SETTINGS };
  const applyLocale = (): void =>
    setLocale(resolveLocale([settings.language !== 'auto' ? settings.language : undefined, platform.locale(), navigator.language, 'en']));
  applyLocale();

  const sim = new Sim(loaded?.game ?? createInitialState(AREA1, newSeed()), AREA1);

  // ── DOM layers: canvas → input layer → labels/popups → HUD → panels
  const gameEl = document.getElementById('game') as HTMLDivElement;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', t('game.title'));
  gameEl.appendChild(canvas);
  const inputLayer = document.createElement('div');
  inputLayer.className = 'input-layer';
  gameEl.appendChild(inputLayer);
  const worldUi = document.createElement('div');
  worldUi.className = 'world-ui';
  gameEl.appendChild(worldUi);
  const hud = new Hud(gameEl);

  const device = platform.deviceType();
  const pickTier = (): Tier => (settings.graphics === 'auto' ? autoTier(device) : settings.graphics === 'low' ? 'low' : 'high');
  const core = new RenderCore(canvas, pickTier());
  const audio = new AudioSystem();
  audio.platformMuted = platform.isMuted();
  audio.sound = settings.sound;
  audio.music = settings.music;
  platform.onMuteChange((m) => {
    audio.platformMuted = m;
    audio.applyVolume();
  });

  const haptic = (ms: number): void => {
    if (!settings.vibration) return;
    try {
      if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
    } catch {
      /* unsupported */
    }
  };

  const view = new GameView(core, sim, hud, audio, worldUi, haptic);
  // the mock reports 'desktop' everywhere; a coarse primary pointer means touch (phones, tablets, touch emulation)
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const initialMethod: InputMethod = device !== 'desktop' || coarse ? 'touch' : 'keyboard';
  const input = new Input(inputLayer, initialMethod);

  // ── sizing (live rotation, iOS address bar)
  const resize = (): void => {
    const w = gameEl.clientWidth || window.innerWidth;
    const h = gameEl.clientHeight || window.innerHeight;
    view.resize(w, h);
  };
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => window.setTimeout(resize, 120));
  window.visualViewport?.addEventListener('resize', resize);
  view.rig.snap(sim.state.coach.x, sim.state.coach.z);

  // ── blockers: panels / ads pause the sim; panels also stop gameplay
  const blockers = new Set<string>();
  let started = false;
  const refreshPause = (): void => {
    loop.simPaused = blockers.size > 0;
    input.enabled = blockers.size === 0;
    if (blockers.size > 0) input.clear();
    if (started) {
      if (blockers.has('panel') || blockers.has('ad')) platform.gameplayStop();
      else platform.gameplayStart();
    }
  };

  const persist = (reason: string): void => {
    sim.state.rng = sim.state.rng >>> 0;
    if (saves.save(sim.state, settings)) platform.record(`save (${reason})`);
  };

  const settingsPanel = new SettingsPanel(gameEl, settings, {
    onChange: (s) => {
      const langChanged = s.language !== settings.language;
      const gfxChanged = s.graphics !== settings.graphics;
      settings = s;
      audio.sound = s.sound;
      audio.music = s.music;
      audio.applyVolume();
      if (langChanged) {
        applyLocale();
        hud.setObjective(sim.objective);
      }
      if (gfxChanged) {
        core.applyTier(pickTier());
        resize();
        view.setTierEffects();
        loop.fpsCap = 0;
        watchdog.reset();
      }
      persist('settings');
    },
    onReset: () => {
      saves.clear();
      sim.loadState(createInitialState(AREA1, newSeed()));
      view.resetVisuals();
      hud.setCash(sim.state.cash, true);
      hud.setObjective(sim.objective);
      hintDone = false;
      persist('reset');
      hud.toast(t('toast.reset_done'));
    },
    onOpen: () => {
      blockers.add('panel');
      refreshPause();
    },
    onClose: () => {
      blockers.delete('panel');
      refreshPause();
    },
    platformMuted: () => platform.isMuted(),
  });
  hud.gear.addEventListener('click', () => settingsPanel.open());

  // ── hints: shown for the method the player actually uses until they've moved
  let hintDone = sim.state.coach.moved > 2;
  const updateHint = (): void => hud.showHint(hintDone ? null : input.lastMethod);
  input.onMethodChange(updateHint);
  updateHint();

  // ── sim → platform / analytics / save hooks
  sim.events.on('objectiveChanged', (e) => hud.setObjective(e.objective));
  sim.events.on('saveNeeded', (e) => persist(e.reason));
  sim.events.on('unlocked', () => {
    platform.reportCompletion(sim.completionPct());
    platform.setContext({ area: 1, academyLevel: sim.state.level, saveVersion: SAVE_VERSION, build: BUILD });
    analytics.once('first_unlock');
  });
  sim.events.on('cashCollected', () => analytics.once('first_cash'));
  sim.events.on('signed', (e) => {
    const tr = sim.trainee(e.id);
    if (tr && (tr.rarity === 'epic' || tr.rarity === 'wonderkid') && !sim.state.flags.firstEpicSigned) {
      sim.state.flags.firstEpicSigned = true;
      platform.happytime();
    }
  });
  sim.events.on('graduated', () => analytics.once('first_graduation'));
  hud.setObjective(sim.objective);
  hud.setCash(sim.state.cash, true);
  platform.reportCompletion(sim.completionPct());
  platform.setContext({ area: 1, academyLevel: sim.state.level, saveVersion: SAVE_VERSION, build: BUILD });

  // ── auth: the SDK swaps in the account's data → reload and rebuild
  platform.onAuthChange(() => {
    const blob = saves.load();
    if (!blob) return;
    sim.loadState(blob.game);
    settings = blob.settings;
    view.resetVisuals();
    hud.setCash(sim.state.cash, true);
    hud.toast(t('toast.progress_loaded'), 'good');
  });

  // ── loop
  const screen = { x: 0, y: 0 };
  const mouse = { x: 0, z: 0 };
  const minuteMarks = [1, 3, 5, 10, 15];
  let playSec = 0;
  const watchdog = new FpsWatchdog(() => {
    if (settings.graphics !== 'auto') return false;
    const next: Tier | null = core.tier === 'high' ? 'mid' : core.tier === 'mid' ? 'low' : null;
    if (!next) return false;
    core.applyTier(next);
    resize();
    view.setTierEffects();
    platform.record(`quality → ${next}`);
    return true;
  });

  const loop = new FixedLoop({
    update: (dt) => {
      input.screenMove(screen);
      if (screen.x !== 0 || screen.y !== 0) {
        sim.input.x = screen.x;
        sim.input.z = screen.y;
      } else if (input.mouseHeld && input.enabled) {
        view.mouseDirection(input.mouseX, input.mouseY, mouse);
        sim.input.x = mouse.x;
        sim.input.z = mouse.z;
      } else {
        sim.input.x = 0;
        sim.input.z = 0;
      }
      sim.tick(dt);
      if (!hintDone && sim.state.coach.moved > 2) {
        hintDone = true;
        updateHint();
        analytics.once('first_move');
      }
      playSec += dt;
      saves.stats.playSec += dt;
      saves.dirty = true;
      if (minuteMarks.length && playSec >= (minuteMarks[0] as number) * 60) analytics.track(`minute_${minuteMarks.shift()}`);
      if (saves.tick(dt)) persist('autosave');
    },
    render: (alpha, frameDt) => {
      view.frame(alpha, frameDt);
      if (!started) {
        started = true;
        // first controllable frame
        platform.loadingStop();
        platform.gameplayStart();
        analytics.track('first_frame', { ms: Math.round(performance.now() - (window.__wkBootT0 ?? 0)) });
        document.getElementById('boot')?.remove();
        void import('./view/music').then((m) => m.startMusic(audio)).catch(() => undefined);
      }
      if (watchdog.sample(frameDt) && loop.fpsCap === 0) {
        loop.fpsCap = 30;
        platform.record('fps cap 30');
      }
      hud.setCash(sim.state.cash);
      hud.setStars(sim.state.stars, sim.world.totalStars);
      const lv = sim.state.level;
      const lo = BALANCE.levelXp[lv - 1] ?? 0;
      const hi = BALANCE.levelXp[lv] ?? lo + 1000;
      hud.setLevel(lv, (sim.state.xp - lo) / Math.max(1, hi - lo));
    },
  });

  // precompile shaders before the first frame (no hitches on first unlock)
  try {
    core.renderer.compile(core.scene, view.rig.camera);
  } catch {
    /* compile is an optimisation only */
  }
  loop.start();

  // ── visibility: pause sim + render when hidden, save immediately (iOS may kill the tab)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      loop.stop();
      audio.setHidden(true);
      persist('hidden');
    } else {
      audio.setHidden(false);
      watchdog.reset();
      if (!blockers.has('ctx')) loop.start();
    }
  });
  window.addEventListener('pagehide', () => persist('pagehide'));

  // ── WebGL context loss
  let ctxOverlay: HTMLDivElement | null = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    loop.stop();
    blockers.add('ctx');
    persist('ctxlost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    ctxOverlay = document.createElement('div');
    ctxOverlay.className = 'ctx-lost';
    ctxOverlay.textContent = t('context.lost');
    ctxOverlay.addEventListener('pointerdown', () => {
      ctxOverlay?.remove();
      ctxOverlay = null;
      blockers.delete('ctx');
      resize();
      loop.start();
    });
    gameEl.appendChild(ctxOverlay);
  });

  if (TEST_HOOKS) {
    window.__wk = { sim, platform, view, saves, clock, settings: () => settings, persist, loop, input };
    const params = new URLSearchParams(location.search);
    if (params.get('debug') === '1') {
      void import('./ui/debug').then((m) => m.mountDebug({ sim, platform, view, clock, core, loop }));
    }
  }
}

boot().catch((e: unknown) => {
  // last-resort: never leave a blank page; log for the debug overlay / QA
  console.error('[boot]', e);
});
