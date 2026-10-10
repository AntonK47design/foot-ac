import './ui/styles.css';
import { AREA1 } from './data/areas/area1';
import { BALANCE } from './data/balance';
import { BUILD, SAVE_VERSION } from './data/constants';
import { analytics } from './core/analytics';
import { RealClock } from './core/clock';
import { formatCash, resolveLocale, setLocale, t } from './core/i18n';
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
import { loadArea1Assets } from './view/assets';
import type { Objective } from './sim/objectives';
import { DIVISIONS } from './data/clubs';
import { computeOvr } from './sim/players';
import { opponentsOf, pairings, sortedTable } from './sim/match';
import { MatchUi } from './ui/match-ui';
import { LeaguePanel, OfficePanel, ResultsPanel, SquadPanel, type CardData, type OfficeData, type PanelHooks, type UpgradeRow } from './ui/panels';
import { UPGRADES, type UpgradeDef } from './data/upgrades';
import type { Position, Rarity, Stat } from './data/types';
import * as Meta from './sim/meta';
import type { ScoutTier } from './sim/state';
import { Ads } from './ui/ads';
import { AlbumPanel, DailyPanel, QuestsPanel, ScoutPanel, WelcomePanel, hms, type DailyView, type RewardView } from './ui/meta-panels';

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
  sim.now = clock.now();

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

  // Area 1 assets (characters + props) load before gameplayStart; the boot bar shows only if this takes > 1 s
  const assets = await loadArea1Assets();
  const vignette = document.createElement('div');
  vignette.className = 'vignette';
  gameEl.insertBefore(vignette, inputLayer);
  const view = new GameView(core, sim, hud, audio, worldUi, haptic, assets);
  const setObjective = (o: Objective | null): void => {
    if (!o) return hud.setObjective(null);
    const station = sim.world.pads.get(o.targetId)?.unlock;
    hud.setObjective(o, view.iconUrl(o.icon, station && station.type === 'lane' ? station.station : undefined));
  };
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
      // the match cinematic pauses the sim but is still gameplay (Power Shot); panels and ads stop it
      if (blockers.has('panel') || blockers.has('ad') || blockers.has('platform')) platform.gameplayStop();
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
        setObjective(sim.guide.objective);
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
      setObjective(sim.guide.objective);
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

  // ── M2: podium, squad, league, matches
  const panelHooks: PanelHooks = {
    onOpen: () => {
      blockers.add('panel');
      refreshPause();
    },
    onClose: () => {
      blockers.delete('panel');
      refreshPause();
    },
  };
  // ── ads (GDD §7): no offers at all with VITE_ADS=off
  const ads = new Ads(platform, {
    setBlocked: (on) => {
      if (on) blockers.add('ad');
      else blockers.delete('ad');
      refreshPause();
    },
    setMuted: (on) => {
      audio.adMuted = on;
      audio.applyVolume();
    },
    toast: (s) => hud.toast(s),
    playSec: () => saves.stats.playSec,
    usage: () => sim.state.meta.ads,
    today: () => Meta.dayKey(clock.now(), sim.tz),
    now: () => clock.now(),
  });
  const officePanel = new OfficePanel(gameEl, panelHooks);
  const resultsPanel = new ResultsPanel(gameEl, panelHooks);
  const squadPanel = new SquadPanel(gameEl, panelHooks);
  const leaguePanel = new LeaguePanel(gameEl, panelHooks);
  const matchUi = new MatchUi(gameEl);
  const card = (p: { name: string; position: Position; age: number; rarity: Rarity; stats: Record<Stat, number> }, hot: Stat | null = null): CardData => ({
    name: p.name,
    position: p.position,
    age: p.age,
    rarity: p.rarity,
    ovr: computeOvr(p.position, p.stats),
    stats: { ...p.stats },
    hot,
  });
  const ourName = (): string => t('team.us');
  const teamName = (id: string): string => (id === 'us' ? ourName() : (opponentsOf(sim.state.league.division).find((x) => x.id === id)?.name ?? id));
  const divisionName = (d: number): string => t(DIVISIONS[d]?.nameKey ?? 'league.div.0');
  const openLeague = (): void => {
    const L = sim.state.league;
    const rows = sortedTable(L).map((r) => ({ name: teamName(r.team), us: r.team === 'us', p: r.p, w: r.w, d: r.d, l: r.l, gd: r.gf - r.ga, pts: r.pts }));
    const nextIdx = pairings(L.round % 5)[0]?.[1] ?? 1;
    const next = sim.state.built[sim.area.matchPitch.objectId] ? (opponentsOf(L.division)[nextIdx - 1]?.name ?? null) : null;
    leaguePanel.open(divisionName(L.division), L.season, L.round, rows, next);
  };
  const openSquad = (): void => {
    const sq = sim.state.squad;
    const rows = sq.map((p) => ({ id: p.id, card: card(p), value: sim.transferValue(p), apps: p.apps, goals: p.goals }));
    const strength = sq.length ? sq.reduce((a, p) => a + computeOvr(p.position, p.stats), 0) / sq.length : 0;
    squadPanel.open(rows, sim.squadSize(), strength, (id) => {
      sim.releasePlayer(id);
      openSquad();
    });
  };
  hud.squadBtn.addEventListener('click', openSquad);
  hud.leagueBtn.addEventListener('click', openLeague);
  // ── Manager's Office computer: transfers + upgrades
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const effectText = (u: UpgradeDef, lv: number): string => {
    const at = (l: number): string => {
      switch (u.id) {
        case 'coach_carry':
          return t('upfx.balls', { n: BALANCE.coach.carryCap + l * u.step });
        case 'ballboy_carry':
          return t('upfx.balls', { n: BALANCE.staff.ballBoy.carryCap + l * u.step });
        case 'academy_offline':
          return t('upfx.offline', { h: Math.round((BALANCE.meta.offline.baseCapSec + l * u.step) / 3600) });
        case 'coach_sign':
        case 'reception_speed':
        case 'academy_bus':
        case 'assistant_drive':
          return t('upfx.less.' + u.id, { n: pct(1 - Math.pow(1 - u.step, l)) });
        default:
          if (u.tab === 'stations') return t('upfx.station', { lv: l + 1, rep: pct(1 - Math.pow(1 - u.step, l)), fee: pct(u.step * l) });
          return t('upfx.more.' + u.id, { n: pct(u.step * l) });
      }
    };
    if (lv >= u.maxLevel) return at(lv);
    // drills read "Lv 1 → Lv 2: …"; the rest "Standard → +7% speed"
    if (u.tab === 'stations') return `${t('upfx.lv', { lv: lv + 1 })} → ${at(lv + 1)}`;
    const now = lv === 0 && u.id !== 'coach_carry' && u.id !== 'ballboy_carry' && u.id !== 'academy_offline' ? t('upfx.base') : at(lv);
    return `${now} → ${at(lv + 1)}`;
  };
  const requirement = (u: UpgradeDef): string | null => {
    if (sim.upgradeUnlocked(u.id)) return null;
    if (u.requires?.staff) return t('office.needs_staff', { name: t('staff.' + (u.requires.staff.startsWith('assistant') ? 'assistant_any' : u.requires.staff)) });
    const pad = sim.world.padList.find((p) => p.unlock.type !== 'staff' && p.unlock.type !== 'lane' && 'id' in p.unlock && p.unlock.id === u.requires?.built);
    return t('office.needs_built', { name: pad ? t(pad.nameKey) : '' });
  };
  /** "▶ Get $X" when the cheapest upgrade is out of reach. */
  const officeAd = (): OfficeData['ad'] => {
    const cu = sim.cheapestUpgrade();
    if (!cu || sim.state.cash + 1e-6 >= cu.cost) return null;
    const amount = ads.officeAmount(cu.cost);
    return ads.offer('office', t('ads.get', { cash: formatCash(amount) }), () => {
      sim.grantBonus(amount, 'ad');
      hud.setCash(sim.state.cash);
    });
  };
  const officeData = (): OfficeData => {
    const g = sim.podiumGraduate();
    const full = sim.state.squad.length >= sim.squadSize();
    const w = full ? sim.weakestSquadPlayer() : undefined;
    const rows: UpgradeRow[] = UPGRADES.map((u) => ({
      id: u.id,
      tab: u.tab,
      name: t(u.nameKey),
      icon: u.icon,
      level: sim.upLevel(u.id),
      max: u.maxLevel,
      cost: sim.upgradeCost(u.id),
      locked: requirement(u),
      effect: effectText(u, sim.upLevel(u.id)),
    }));
    return {
      cash: sim.state.cash,
      waiting: sim.state.podiumQueue.length,
      rows,
      ad: officeAd(),
      transfer: g
        ? {
            card: card(g),
            price: sim.transferValue(g),
            buyer: sim.buyerFor(g.id),
            squadCount: sim.state.squad.length,
            squadSize: sim.squadSize(),
            replaces: w ? { name: w.name, ovr: computeOvr(w.position, w.stats), price: sim.transferValue(w) } : null,
          }
        : null,
    };
  };
  sim.events.on('podiumOpen', () => {
    officePanel.onDismiss = () => sim.dismissPrompt();
    officePanel.open(officeData, {
      sell: () => {
        sim.decideGraduate('sell');
        officePanel.refresh();
      },
      promote: () => {
        sim.decideGraduate('promote');
        officePanel.refresh();
      },
      buy: (id) => {
        if (sim.buyUpgrade(id)) hud.setCash(sim.state.cash);
      },
    });
  });
  sim.events.on('sold', (e) => {
    analytics.once('first_sale');
    if (e.record) platform.happytime();
  });
  sim.events.on('divisionUp', () => platform.happytime());
  sim.events.on('kickoffReady', () => {
    if (view.matchActive) return;
    blockers.add('match');
    refreshPause();
    hud.showHint(null);
    analytics.once('first_match');
    const script = sim.startMatch();
    view.startMatch(script, matchUi, ourName(), !!sim.state.flags.firstMatchPlayed, {
      resolve: (i, q) => sim.resolveMatchChance(i, q),
      done: () => {
        const firstMatch = !sim.state.flags.firstMatchPlayed;
        const r = sim.finishCurrentMatch();
        sim.state.flags.firstMatchPlayed = true;
        if (r && script.cup && r.outcome === 'win') platform.happytime();
        let rewardedAtBreak = false;
        const release = (): void => {
          view.endTrip();
          blockers.delete('match');
          refreshPause();
          updateHint();
          // midgame only at this natural break, never after the very first match or when a rewarded ad was watched here
          if (!firstMatch && !rewardedAtBreak) void ads.midgame();
        };
        if (!r) return release();
        resultsPanel.open(
          {
            ourName: ourName(),
            theirName: script.opponent.name,
            ourGoals: r.ourGoals,
            theirGoals: r.theirGoals,
            outcome: r.outcome,
            cash: r.cash,
            points: r.points,
            mvp: r.mvp && !r.mvp.sub ? card({ ...(sim.state.squad.find((p) => p.id === r.mvp?.id) ?? { name: r.mvp.name, position: r.mvp.position, age: 16, rarity: 'common', stats: r.mvp.stats }) }, r.mvpStat) : null,
            rank: r.rank,
            seasonOver: r.seasonOver,
            promoted: r.promoted,
            champion: r.champion,
            divisionName: divisionName(sim.state.league.division),
            cup: script.cup ? { tickets: r.outcome === 'win' ? BALANCE.meta.cup.tickets : 0 } : null,
            ad:
              r.cash > 0
                ? ads.offer('results', t('ads.x2', { cash: formatCash(r.cash) }), () => {
                    rewardedAtBreak = true;
                    sim.grantBonus(r.cash, 'ad');
                    hud.setCash(sim.state.cash);
                  })
                : null,
          },
          release,
          () => {
            release();
            openLeague();
          },
        );
      },
    });
  });

  // ── hints: shown for the method the player actually uses until they've moved
  let hintDone = sim.state.coach.moved > 2;
  const updateHint = (): void => hud.showHint(hintDone ? null : input.lastMethod);
  input.onMethodChange(updateHint);
  updateHint();

  // ── M4: daily reward, quests, scouting, Daily Cup, Hall of Fame, chests, offline earnings
  const dailyPanel = new DailyPanel(gameEl, panelHooks);
  const welcomePanel = new WelcomePanel(gameEl, panelHooks);
  const questsPanel = new QuestsPanel(gameEl, panelHooks);
  const scoutPanel = new ScoutPanel(gameEl, panelHooks);
  const albumPanel = new AlbumPanel(gameEl, panelHooks);
  const rewardToast = (r: RewardView | null): void => {
    if (!r) return;
    hud.setCash(sim.state.cash);
    const parts: string[] = [];
    if (r.cash > 0) parts.push('+' + formatCash(r.cash));
    if (r.tickets > 0) parts.push(t('toast.tickets', { n: r.tickets }));
    if (r.prospect) parts.push(t('rarity.' + r.prospect.rarity));
    if (parts.length) hud.toast(parts.join(' · '), 'gold', 2600);
    audio.play('unlock');
  };
  const dailyView = (): DailyView => ({
    days: [0, 1, 2, 3, 4, 5, 6].map((i) => Meta.dailyReward(sim.state, i)),
    index: Meta.dailyIndex(sim.state),
    available: Meta.dailyAvailable(sim.state, sim.now, sim.tz),
    nextIn: Meta.msToMidnight(sim.now, sim.tz),
  });
  const openDaily = (): void => dailyPanel.open(dailyView(), (doubled) => rewardToast(sim.claimDaily(doubled ? 2 : 1)), ads.offer('daily', t('ads.x2_short'), () => undefined));
  const questText = (kind: string, n: number): string => t('quest.' + kind, { n: kind === 'collect' ? formatCash(n) : n });
  const openQuests = (): void => {
    sim.updateMeta();
    questsPanel.open(
      () => sim.state.meta.quests.list.map((q) => ({ id: q.id, text: questText(q.kind, q.target), progress: q.progress, target: q.target, progressText: q.kind === 'collect' ? `${formatCash(Math.floor(q.progress))}/${formatCash(q.target)}` : `${Math.floor(q.progress)}/${q.target}`, reward: { cash: q.cash, tickets: q.tickets }, claimed: q.claimed })),
      () => Meta.msToMidnight(sim.now, sim.tz),
      (id) => rewardToast(sim.claimQuest(id)),
    );
  };
  const duration = (sec: number): string => (sec >= 3600 ? t('scout.dur_h', { n: Math.round(sec / 3600) }) : t('scout.dur_m', { n: Math.round(sec / 60) }));
  const TIERS: ScoutTier[] = ['local', 'regional', 'global'];
  const openScout = (): void =>
    scoutPanel.open(
      () => {
        const sc = sim.state.meta.scout;
        return {
          tiers: TIERS.map((tier) => {
            const S = BALANCE.meta.scout[tier];
            return { tier, name: t('scout.' + tier), duration: duration(S.sec), cost: Meta.scoutCost(tier), floor: S.floor, canStart: Meta.canScout(sim.state, tier) };
          }),
          active: sc.tier
            ? {
                name: t('scout.' + sc.tier),
                remaining: Math.max(0, sc.endsAt - sim.now),
                total: Math.max(1, sc.endsAt - sc.startedAt),
                ad: sc.endsAt - sc.startedAt <= BALANCE.ads.scoutMaxSec * 1000 ? ads.offer('scout', t('ads.finish_now'), () => sim.finishScoutNow()) : null,
              }
            : null,
          waiting: sim.state.prospects.length,
        };
      },
      (tier) => {
        if (sim.startScout(tier)) {
          hud.setCash(sim.state.cash);
          audio.play('unlock');
        }
      },
    );
  const openAlbum = (): void =>
    albumPanel.open(
      () => {
        const next = BALANCE.meta.album[sim.state.meta.albumClaimed];
        return {
          cells: Object.entries(sim.state.meta.album).map(([k, count]) => {
            const [position, rarity] = k.split(':') as [Position, Rarity];
            return { position, rarity, count };
          }),
          slots: Meta.albumSlots(sim.state),
          next: next ? { slots: next.slots, reward: { cash: next.cash, tickets: next.tickets } } : null,
          canClaim: !!Meta.albumClaimable(sim.state),
          lockedLevel: Meta.unlocked(sim.state, 'album') ? null : BALANCE.meta.unlockLevel.album,
        };
      },
      () => rewardToast(sim.claimAlbum()),
    );
  hud.button('quests', 'left', 'scroll', t('hud.quests'), openQuests);
  hud.button('album', 'left', 'trophy', t('hud.album'), openAlbum);
  hud.button('daily', 'right', 'gift', t('hud.daily'), openDaily);
  hud.button('scout', 'right', 'scout', t('hud.scout'), openScout);
  hud.button('cup', 'right', 'whistle', t('hud.cup'), () => hud.toast(t('cup.hint')));

  // scouting finds that land while a welcome panel is being built go into it instead of a toast
  let scoutNote: string[] | null = null;
  sim.events.on('scoutDone', (e) => {
    const msg = t('scout.done', { rarity: t('rarity.' + e.rarity), pos: t('pos.' + e.position) });
    if (scoutNote) scoutNote.push(msg);
    else hud.toast(msg, 'gold', 3200);
  });
  sim.events.on('albumSlot', () => {
    if (Meta.albumSlots(sim.state) > 1) hud.toast(t('album.new'), 'good');
  });
  sim.events.on('chest', (e) => {
    const parts = [e.cash > 0 ? t('toast.chest_cash', { level: e.level, cash: formatCash(e.cash) }) : t('toast.chest', { level: e.level })];
    if (e.tickets > 0) parts.push(t('toast.tickets', { n: e.tickets }));
    window.setTimeout(() => {
      hud.toast(parts.join(' · '), 'good', 2800);
      for (const [f, lv] of Object.entries(BALANCE.meta.unlockLevel)) if (lv === e.level) hud.toast(t('toast.feature.' + f), 'gold', 3600);
    }, 700);
  });

  /** Welcome back: offline earnings + today's daily reward + scout finds. Returns true when shown. */
  const welcomeBack = (awaySec: number): boolean => {
    scoutNote = [];
    sim.now = clock.now();
    sim.updateMeta();
    const notes = scoutNote;
    scoutNote = null;
    const off = Meta.offlineEarnings(sim.state, awaySec);
    const daily = Meta.dailyAvailable(sim.state, sim.now, sim.tz);
    if (off.cash <= 0 && !daily && !notes.length) return false;
    analytics.track('welcome_back', { awaySec: Math.round(awaySec), cash: off.cash });
    welcomePanel.open(
      { awaySec: awaySec >= BALANCE.meta.offline.minSec ? awaySec : 0, offlineCash: off.cash, capSec: awaySec > off.sec && off.cash > 0 ? off.sec : 0, daily: daily ? dailyView() : null, scoutDone: notes.length ? notes.join('<br>') : null },
      (doubled) => {
        const cash = off.cash * (doubled ? 2 : 1);
        sim.collectOffline(cash);
        const d = daily ? sim.claimDaily() : null;
        rewardToast({ cash: cash + (d?.cash ?? 0), tickets: d?.tickets ?? 0, prospect: d?.prospect ?? null });
      },
      off.cash > 0 ? ads.offer('welcome', t('ads.x2', { cash: formatCash(off.cash) }), () => undefined) : null,
    );
    return true;
  };

  // HUD badges and timers (4 Hz)
  let metaHudT = 0;
  const updateMetaHud = (dt: number): void => {
    metaHudT -= dt;
    if (metaHudT > 0) return;
    metaHudT = 0.25;
    const st = sim.state;
    hud.setTickets(st.tickets, st.tickets > 0 || Meta.unlocked(st, 'daily'));
    const qn = Meta.questsClaimable(st);
    hud.setButton('quests', Meta.unlocked(st, 'quests'), qn ? String(qn) : null);
    hud.setButton('album', Meta.albumSlots(st) > 0, Meta.albumClaimable(st) ? '!' : null);
    hud.setButton('daily', Meta.unlocked(st, 'daily'), Meta.dailyAvailable(st, sim.now, sim.tz) ? '!' : null);
    const sc = st.meta.scout;
    hud.setButton('scout', Meta.unlocked(st, 'scout'), !sc.tier && st.tickets > 0 ? '!' : null, sc.tier ? hms(sc.endsAt - sim.now) : null);
    const cupOk = Meta.unlocked(st, 'cup') && !!st.built[sim.area.matchPitch.objectId];
    hud.setButton('cup', cupOk, sim.cupAvailable() ? '!' : null, sim.cupAvailable() ? t('hud.cup_today') : hms(Meta.msToMidnight(sim.now, sim.tz)));
  };

  // ── sim → platform / analytics / save hooks
  sim.events.on('guideChanged', (e) => setObjective(e.objective));
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
  setObjective(sim.guide.objective);
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
      sim.now = clock.now();
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
        if (!blockers.has('panel')) platform.gameplayStart();
        analytics.track('first_frame', { ms: Math.round(performance.now() - (window.__wkBootT0 ?? 0)) });
        document.getElementById('boot')?.remove();
        void import('./view/music').then((m) => m.startMusic(audio)).catch(() => undefined);
      }
      if (watchdog.sample(frameDt) && loop.fpsCap === 0) {
        loop.fpsCap = 30;
        platform.record('fps cap 30');
      }
      hud.setCash(sim.state.cash);
      const as = sim.areaStars();
      hud.setStars(as.have, as.total);
      updateMetaHud(frameDt);
      hud.setSideButtons(sim.state.squad.length > 0 || sim.state.records.promoted > 0, !!sim.state.built[sim.area.matchPitch.objectId]);
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
  // returning player: offline earnings + daily reward before the first controllable frame
  if (loaded) welcomeBack(Math.max(0, (clock.now() - loaded.lastSeen) / 1000));
  loop.start();

  // ── portal pause (Playgama `pause_state_changed`, e.g. its own overlays): same as an open panel, minus the UI
  platform.onPauseChange((paused) => {
    if (paused) blockers.add('platform');
    else blockers.delete('platform');
    audio.portalPaused = paused;
    audio.applyVolume();
    refreshPause();
  });

  // ── visibility: pause sim + render when hidden, save immediately (iOS may kill the tab)
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = clock.now();
      loop.stop();
      audio.setHidden(true);
      persist('hidden');
    } else {
      audio.setHidden(false);
      watchdog.reset();
      if (!blockers.has('ctx')) loop.start();
      const away = hiddenAt ? (clock.now() - hiddenAt) / 1000 : 0;
      hiddenAt = 0;
      if (away >= BALANCE.meta.offline.minSec && blockers.size === 0) welcomeBack(away);
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
    window.__wk = { sim, platform, view, saves, clock, settings: () => settings, persist, loop, input, welcomeBack, ads, audio };
    const params = new URLSearchParams(location.search);
    if (params.get('debug') === '1') {
      void import('./ui/debug').then((m) => m.mountDebug({ sim, platform, view, clock, core, loop }));
    }
  }
}

const showcase = import.meta.env.DEV && new URLSearchParams(location.search).get('showcase') === '1';
(showcase
  ? import('./view/showcase').then((m) => {
      document.getElementById('boot')?.remove();
      return m.runShowcase(document.getElementById('game') as HTMLDivElement);
    })
  : boot()
).catch((e: unknown) => {
  // last-resort: never leave a blank page; log for the debug overlay / QA
  console.error('[boot]', e);
});
