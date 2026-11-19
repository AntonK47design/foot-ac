# Prompt: build a new 3D idle-arcade "tycoon" web game in the Kickoff Academy style

> Paste everything below the line into a new Claude Code session, in an empty repository.
> First fill in the **Game card** (section 1). Everything else is reusable as it is.
> This brief distils what worked, and what failed, while building and launching *Kickoff Academy: Football Tycoon*
> on CrazyGames and Playgama.

---

## 0. Your role and mission

You are the lead developer and technical game designer of a small web-game studio. Build a **3D idle-arcade tycoon**:

- an isometric, bright diorama world;
- one controllable hero who walks around, carries stacks of a supply and stands on **cost pads** to build stations and rooms;
- NPC **customers** who arrive, get served, pay into cash piles and leave;
- **staff** you hire to automate each chore;
- an **office** with upgrades;
- **gated areas**, each unlocked with a big purchase.

Ship it ready for **CrazyGames** (HTML5 SDK v3) and **Playgama** (Bridge SDK) from one codebase.

Judge every decision against the portal KPIs (section 2). Treat them as the acceptance criteria of the whole project.

Keep the title in one constant (`GAME_TITLE`); it may change.

## 1. Game card (fill this in)

| Slot | Kickoff Academy (reference) | New game |
|---|---|---|
| Theme / fantasy | Run a youth football academy | `<…>` |
| Hero (player character) | Coach | `<…>` |
| Customer NPC | Trainee who signs up, trains, graduates | `<…>` |
| Arrival | Bus drops trainees at the gate | `<…>` |
| Check-in point | Sign-up desk (hero stands there to serve) | `<…>` |
| Carried supply per area | Balls (area 1), water (area 2), bibs (area 3) | `<…>` |
| Stations (4–5 per area) | Shooting goal, dribble cones, passing wall, sprint track… | `<…>` |
| "Big payoff" moment | Graduation: sell for a transfer fee or add to the squad | `<…>` |
| Spectacle event | Short match highlights with a timing mini-game | `<…>` |
| Staff | Ball boy, receptionist, assistant coach, accountant (cash → safe) | `<…>` |
| Areas | Sunday Park → Training Ground → Youth Stadium | `<…>` |
| Collectible / attachment | Named players with rarity, stats and OVR cards | `<…>` |
| Fictional names | Clubs, people (no real brands) | `<…>` |

Map every Kickoff system onto the new theme one-to-one before you write any code. Put the mapping in `docs/GDD.md`.

## 2. The KPIs: what they mean and what we learned

| KPI (CrazyGames definition) | Target | What Kickoff Academy got | Lesson |
|---|---|---|---|
| Gameplay conversion (plays ≥ 1 min ÷ visits) | ≥ 75 % | 56 % desktop, **29 % mobile** | The first 60 s decide everything. See section 5. |
| Avg playtime | ≥ 10 min | **11–14 min** (mid / near top) | An always-visible next goal plus automation escalation works. Keep it. |
| D1 retention | ≥ 15 % | 6–14 % (tiny samples) | Daily reward, timers, unfinished goals. Judge only on weekly averages. |
| CTR (thumbnail clicks) | Out of bottom 20 % | **0.8 %** (bottom 20 %) | Covers made from in-game renders failed. Use illustrated key art (section 12). |
| Rating | n/a | 10/10 | Polish and fair, ad-free progression pay off. |

Basic Launch gives about **70–100 plays a day**. With numbers that small, day-to-day swings are noise. Never react to a single day; compare 3–4-day windows before and after a change, and note upload dates.

## 3. Non-negotiables

- **Gameplay first:**
  - gameplay within ≤ 4 s on desktop and ≤ 8 s on mobile Fast 4G;
  - no title screen, menu, Play button, intro or splash;
  - `gameplayStart()` fires on the first controllable frame.
- **Size and files:**
  - initial download ≤ 6 MB (fail above 10 MB), JS ≤ 400 KB brotli;
  - lazy-load anything not needed in the first 2 minutes;
  - `base: './'`, relative paths only, ≤ 1,500 files;
  - no runtime network except the portal SDK script; bundle fonts locally.
- **Portal rules:** no fullscreen button, external links, cross-promotion, own ads, or `alert`/`confirm`/`prompt`.
- **Keyboard:**
  - never bind Escape or browser shortcuts;
  - read movement from `KeyboardEvent.code`;
  - `preventDefault` on arrows and space.
- **Simulation:** fixed 60 Hz sim (accumulator, clamped delta) with interpolated rendering.
- **Robustness:** the game must work with an adblocker, without the SDK, and with ads off. No soft-locks, ever.
- **Content:** original IP only, PEGI-12. No real brands, clubs, logos or people. All strings live in `src/data/locales/en.json`.
- **Resolutions:** readable at 800×450 at DPR 1; good at 1280×720, 1920×1080, 844×390 and 390×844.

## 4. Core loop template (data-driven)

- **Hero:** moves at ~6.8 m/s. Carries a stack of up to 5 items, picked up from a source (crate) and dropped into station baskets.
- **Pads:** each pad shows price + icon + a ghost of what it builds. Standing on it drains cash into it, over 0.6–1.5 s scaled by price. Pads `require` earlier pads, so the next 1–2 are always visible.
- **Customers:** arrive → wait on seats → hero serves them at the check-in point → change or prepare → visit stations for N reps (each rep pays into the station's cash pile and raises a stat) → the payoff moment → leave.
- **Payoff moment:** a choice panel (sell now for cash, or keep them for the long-term system). It is the emotional hook; make it a card with rarity colours.
- **Staff:** one hire per chore (supply runner per area, receptionist, per-station assistant, accountant moving cash into a safe). The first automation should come at about 2:15–4:00.
- **Office upgrades:** cost = base × growth^level. These are the "always something to buy" filler between pads.
- **Areas:** about 30 stars each. The gate is one big purchase. Each area adds a new supply type and higher-paying stations.
  - Design each new area in its own coordinate frame and place it with an offset.
  - Put its gate close to the hub. A long walk to a new area was a real complaint.
- **Spectacle event** every ~3 min: a short, skippable, fun-to-watch sequence with one input. Reward cash ×N.
- **All tunables live in `src/data/balance.ts`;** systems contain no magic numbers.

## 5. The first 60 seconds (the conversion playbook; the most important section)

What raised or would raise conversion in Kickoff Academy:

1. **Spawn next to the first cash.** It must be 2 m away, in the open and fully visible, with no walls between camera and hero. The first purchase must land at about 0:02 and the second at about 0:04.
2. **The first customer is already waiting.** When the first station is built, seat the first customer at the check-in point straight away. Do not make them walk from the bus: a 50 m walk delayed the first income to 0:27.
3. **Opening boost.** For the first ~50 s of total play time, customers walk 1.5× faster, serving takes half as long and changing takes 40 % as long, fading out over 20 s. Leave cash and rep speed alone so the economy is unchanged. Key it to total play time so returning players never see it.
4. **Beat sheet targets** (enforced by the economy bot):

   | Beat | Target |
   |---|---|
   | First cash | ≤ 5 s |
   | First unlock | ≤ 12 s |
   | First customer served | ≤ 10 s |
   | First income | ≤ 15 s |
   | 3 unlocks | ≤ 20 s |
   | First payoff moment | ~60 s |
   | Purchases in the first 3 min | Average gap ≤ 20 s, longest ≤ 35 s |

5. **Iframe keyboard focus.** Portals embed the game in an iframe, and the page around it often keeps the keyboard. Keys then do nothing and players leave thinking it's broken.
   - Call `window.focus()` on the first frame.
   - Also check `document.hasFocus()`. While false, show "Click the game, then WASD (or hold mouse)" instead of "WASD".
   - Hold-mouse-to-move must always work as well.
6. **Touch hint.** On touch devices (coarse pointer), show an animated finger plus "Drag to move" from the first frame. Never show the keyboard hint on a phone.
7. **A fixed tutorial route,** not a planner. It's a pill at the top plus a world arrow, in a fixed order (cash → first supply source → first station → serve → grab supply → deliver → collect fees → second station).
   - Then optional feature intros that wait until they matter: first payoff ("Office: sell X or add to your squad"), first affordable upgrade, first spectacle, first safe cash.
   - An optional step that isn't ready is skipped, never blocking.
   - Store each step as a flag so old saves skip what they've done.
   - The pill wraps to 2 lines. The arrow's off-screen check uses its real height, so targets under the HUD get an edge pointer.
8. **Tap to explain.** A quick tap or click (< 280 ms, < 12 px) on any station, desk or room shows a 5-second card saying what it does, without pausing the game. Drags and holds stay movement.
9. **Juice on every reward:** cash fly-to-HUD, pop sounds, star-bar fill, level-up burst. Use haptics (10–25 ms) on mobile.

## 6. Economy bot and pacing (build in M1, run before every commit)

- `npm run sim` runs the **real sim code** headlessly. A bot follows the guide at hero speed with real path distances and prints a timeline (unlocks, first automation, first payoff, area gates, longest unaffordable gap).
- Run it for a **focused** bot and a **distracted** bot (70 % efficiency). Judge dead air and first automation over **10 seeds** (median plus worst), because single seeds are chaotic.
- Example gates:
  - area 2 opens at 7–16 min, area 2 complete at 30–40 min, area 3 complete at 62–80 min;
  - never more than 60 s with nothing affordable (focused) or 85 s (distracted);
  - dead air per window has median and worst bounds.
- When a change shifts pacing, fix the content (prices, an extra cheap upgrade). Do not loosen the test.

## 7. Retention and meta (M4)

- **Saves:** cloud save via the portal SDK with local fallback. Save on `visibilitychange:hidden` and `pagehide`. Use versioned migrations, so old saves keep their economy and get their agents re-placed.
- **Daily rewards:** a welcome-back panel with offline earnings, plus a 7-day daily reward that shows tomorrow's prize.
- **Goals:** quests (3 a day), real-time timers (a scout or production timer), a daily event (cup), an album/collection, academy levels that unlock features.
- **Auth:** a change of login reloads the save and shows a toast.

## 8. Art (read before modelling anything)

Write `docs/ART_BIBLE.md` first. It overrides any "procedural art" idea.

- **Fill the frame:** at least 65 % of every frame is walls, furniture, NPCs and world UI.
- **Value ladder:** dark desaturated void → floors → walls → interactables and characters → UI.
- **Enclosure:** every activity has its own floor and edge (rooms with cutaway walls, fenced zones, a raised plot with a curb).
- **Scale:** characters are big (9–12 % of viewport height), with readable faces.
- **Squint test:** the hero, pads and stations pop first.
- **Assets:**
  - use CC0 packs only (record licences in `assets-src/`);
  - process them with `tools/assets.ts` (prune, dedupe, weld, meshopt, WebP ≤ 512 px) into `public/assets/*.glb` plus a manifest;
  - load them with GLTFLoader + MeshoptDecoder.
- **Never ship primitive placeholders.** If an asset is missing, stop and ask.
- **Performance lessons:**
  - batch static geometry **per plot**, never across the whole map (one street mesh made a batch span everything);
  - distance-cull skinned characters (they default to `frustumCulled=false`) and animate off-screen ones at 8 Hz;
  - cull whole plots by camera rect;
  - use 12-tri boxes for repeated tiny things like seats and bibs, not rounded boxes;
  - no shadows on far areas.
- **Budgets:** ≤ 150 draw calls, ≤ 400 k triangles, Low tier ≥ 30 FPS with 30 characters, heap < 250 MB, textures ≤ 1024 px. DPR cap: High 2, Mid 1.5, Low 1.

## 9. Platforms, SDKs and ads

- Only `src/platform/*` touches a portal SDK. Every call is wrapped in try/catch.
- Use a `MockPlatform` fallback and a `Platform` interface: storage, gameplay start/stop, loading start/stop, ads, happytime, analytics, auth, pause.
- `gameplayStart`/`gameplayStop` is an idempotent state machine. Never call them on blur or focus. Blocking panels → stop plus sim paused; closing → start.
- **Builds:** pick the platform with `VITE_PLATFORM=crazygames|playgama` and a `%PLATFORM_SDK%` placeholder in `index.html`. Ads are behind `VITE_ADS=off|on` (off for CrazyGames Basic Launch).
- **Playgama:**
  - emit `playgama-bridge-config.json` (`disableLoadingLogo`, `sendAnalyticsEvents`, `useBuiltInErrorPopup:false`);
  - call `game_ready`, preload storage, handle `pause_state_changed`, which pauses the sim and audio;
  - give the ad state flow a 90 s timeout.
- **Analytics:** use only the portal's own analytics (Playgama Bridge `analytics.send`), never GA4 or any other third party. Send funnel events (`tut_<step>`, `first_frame`, `minute_N`, `info_tap`) so drop-off is visible per step.
- **Rewarded placements** players actually want: ×2 match cash, skip a timer, instant cash at the office, double offline earnings. Interstitials only at natural breaks, never after the very first spectacle, and not within the first ~3 min.
- `settings.muteAudio` overrides all audio. Audio pauses while ads run and while the tab is hidden.
- `happytime()` only for big moments (first rare drop, record sale, promotion, cup win).

## 10. Mobile (first-class from M0)

- **Layout:** portrait and landscape with live rotation and no state loss. Use `100dvh`, `visualViewport` resize and `env(safe-area-inset-*)` on all sides.
- **Joystick:** a floating joystick where the first touch lands (dead zone 8 px, radius ~60 px scaled). Extra fingers only press UI.
- **Touch UI:** buttons ≥ 48 px with ≥ 8 px spacing; text ≥ 14 px (16 px body); no hover-only information.
- **Browser gestures:** suppress long-press, text selection, zoom and pull-to-refresh.
- **Quality tiers:** Mid by default on mobile; Low when `deviceMemory` ≤ 4 or the FPS watchdog trips. Prefer a locked 30 FPS over jitter.
- **Lifecycle:** handle WebGL context loss. Pause sim and render while hidden.

## 11. Architecture and conventions

- Use three.js + TypeScript strict (no `any`) + Vite, ESM, 2-space indent, single quotes, semicolons.
- **Folders:**
  - `src/sim/**` is **pure TS** (no three.js, no DOM); the view subscribes to sim events;
  - `src/data/**` holds all content (areas, stations, pads, upgrades, names, locales);
  - `src/core` holds clock, seeded rng, events, i18n, save, loop and analytics;
  - `src/view` holds three.js; `src/ui` holds the DOM/CSS overlay (scaled with `clamp()`, text via `t()`); `src/platform` holds the SDK wrappers.
- **Hot paths:** no per-frame allocations; use pools and reuse vectors.
- **Debug code:** `?debug=1` and `?showcase` never ship in production builds (behind a build-time flag).

## 12. Store assets (CTR)

- **Covers from illustrated key art, not game renders.** Renders of a small 3D game read as busy mush at 200–300 px. Have the user generate the key art with an image AI from a brief. Example brief, adapted to the theme:

  > Bright, glossy 3D cartoon game cover art, mobile tycoon style. A cheerful `<hero>` in `<outfit>` stands in the foreground, grinning and pointing at the viewer, holding a big stack of green cash. Behind them, a busy colourful `<place>`: `<customers>` doing `<activity>`, cash notes flying. Strong rim lighting, saturated colours, blue sky, shallow depth of field so the hero pops. Clear empty sky at the top for a title. No text, no logos, no real brands. 16:9, as high resolution as possible.

- **What gets clicks at small size:** one big face with an emotion, one reward object (cash), few elements, high contrast.
- **Composing the covers:** build `tools/compose-cover.ts`, which renders HTML in Playwright at 2× and downscales with ffmpeg lanczos.
  - It produces landscape 1920×1080, square 800×800, portrait 800×1200 and portrait 1080×1920.
  - Use a chunky yellow logo with a thick dark outline, a red subtitle badge and a slight tilt. Keep it out of the top-left corner (portal labels sit there).
  - For tall crops of wide art, push the art down and continue the sky above it, so the logo never covers the face, the hand or the cash.
  - Also export JPG copies under portal size limits.
- **Video:** a capture tool records real gameplay (no menus) at 1920×1080 and 1080×1920 for preview videos.

## 13. Tooling (create early, run often)

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run dev:lan` | LAN URL plus a QR code in the terminal for phone testing |
| `npm run check` | `tsc --noEmit` + eslint (ignore dist folders) |
| `npm run test` | Vitest: economy, saves and migrations, daily reset, tutorial route (follow the real nav path), platform state machine |
| `npm run sim` | Economy bot (section 6) |
| `npm run size` | Bytes loaded before gameplayStart; fails over budget |
| `npm run e2e` | Playwright on desktop plus iPhone and Pixel emulation, both orientations. Covers: gameplayStart time, no console errors, the first pad bought by keys or touch, save/reload, +25 h welcome-back, HUD overlap at 360×640 / 390×844 / 844×390 / 1024×768, rotation keeps state, one spec per area |
| `npm run zip` / `zip:playgama` | Upload zips per portal |
| `npm run capture` | Store video and screenshots |
| `?debug=1` (dev only) | FPS, draw calls, triangles, heap, tier, SDK log; cheats (+cash, skip time, skip tutorial) |

Run check, test, sim, size and e2e **before every commit**.

## 14. Milestones (each ends green, with screenshots reviewed, a commit and a short report)

- **M0 Foundation:**
  - scaffold, platform wrapper plus mock, fixed-step loop, quality tiers;
  - input (keys, hold-mouse, touch joystick), follow camera;
  - size and zip scripts, mobile CSS hardening.
- **M1 Vertical slice (first ~5 min of area 1):**
  - pads, carry stack, the first 2–3 stations, the customer lifecycle, check-in point;
  - tutorial route, HUD, juice, economy bot v1;
  - the section 5 beat sheet met in the bot. **Stop here and ask the user to playtest on desktop and phone**, with the LAN URL, a QR code and 5 things to check.
- **M2 The payoff system:** cards, rarity, the sell-or-keep choice, the spectacle event, its results screen and progression ladder.
- **M3 Automation:** all area 1 staff, office upgrades and the area 2 gate. Balance to minute 20.
- **M4 Retention:** saves and migrations, welcome-back, offline earnings, daily reward, quests, timers, levels, album, daily event.
- **M5 SDKs and ads:** audit the event map against the real SDKs, rewarded and interstitial behind flags, adblock handling, a Playgama build.
- **M6 Area 2** plus balance to ~40 min → Basic Launch candidate.
- **M7 Area 3,** performance pass, capture mode, covers, submission checklist (`docs/SUBMISSION.md`).

## 15. How you work

- First save this brief as `docs/GDD.md`, with the filled Game card. Write a concise `CLAUDE.md` holding sections 3, 8 (budgets), 9, 10, 11 and 13.
- Plan each milestone briefly, then build it. Keep going milestone by milestone, unless you're blocked or at the M1 playtest gate.
- Make reasonable decisions yourself and log each in `docs/DECISIONS.md`, numbered, with why and the measured result. Ask only about expensive-to-reverse design forks.
- If a feature conflicts with a budget, the budget wins; propose an alternative.
- Verify in the real build, not just tests. Drive it with Playwright, take screenshots at the key resolutions and look at them.
- **Report at the end of each milestone:**
  - what's playable;
  - key bot timestamps;
  - initial size;
  - FPS on the Low tier;
  - known issues;
  - next steps.
- **After launch,** read the dashboards with the user:
  - judge 3–4-day windows, never single days;
  - compare before and after each upload;
  - fix the biggest lever first (usually CTR, then the first minute).
