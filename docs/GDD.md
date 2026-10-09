# Build "Wonderkid Academy": a 3D football academy builder for CrazyGames

> Saved verbatim from the project brief. This is the source of truth for design and acceptance criteria.

## 0. Your role and mission

You are the lead developer and technical game designer on a small web-game studio. Build a 3D idle-arcade simulator (genre reference: CrazyGames' "Doctor Hero" — walk around an isometric world, carry stacks of items, stand on cost pads to unlock rooms/stations, serve NPC "customers", hire staff to automate) re-themed as a football (soccer) youth academy builder, ready for submission to CrazyGames with the CrazyGames HTML5 SDK v3 fully integrated.

Every design and engineering decision is judged against four platform KPIs. Treat them as the acceptance criteria of the whole project, not as an afterthought.

Working title: Wonderkid Academy (keep it in one constant GAME_TITLE; it may change).

## 1. The KPIs: definitions, targets, levers

CrazyGames measures these automatically. The dashboard KPIs are reported for desktop traffic, so the desktop experience decides Basic Launch. Mobile (phones and tablets, touch) is equally first-class: the game must be submitted as mobile-friendly, qualify for the mobile homepage, and play as well on a phone as on a laptop (see §9b). Never treat mobile as a later port. Every feature is built and checked on both from Milestone 0.

| KPI | Exact CrazyGames definition | Target | Our previous title (context) | Primary levers |
|---|---|---|---|---|
| Gameplay conversion | Plays lasting ≥ 1 min ÷ visits of the game page | ≥ 75 % | 54.95 % (bottom 20 %) | Tiny initial download, gameplay in ≤ 3 s, zero menus, a first minute packed with rewards |
| Avg playtime | Avg time per play, excluding time away from the game | ≥ 10:00 | ≈ 7:55 | Always a next goal ≤ 60 s away, escalating loop (automation → bigger systems), matches as spectacle, no dead air |
| Retention D1 | Share of users who play again 1 day after their first play | ≥ 15 % | ≈ 5.8 % | Reliable cloud save, daily reward with a visible "tomorrow" reward, real-time scout timers, daily cup, unfinished goals, named players you're attached to |
| CTR | Share of users who click the thumbnail anywhere on the platform | Out of bottom 20 % | bottom 20 % | Covers and preview video (generated via capture mode, §5.4), bright readable art, title |

CrazyGames' own benchmarks: successful games have 10+ min playtime and 10–15 % D1; top titles have 80 %+ conversion, load in < 10 s and ship < 20 MB. Basic Launch (7–21 days, ≥ 500 plays, ads disabled) decides whether we get a Full Launch, so the Basic Launch build must hit the KPIs without any ad rewards.

## 2. Non-negotiables (hard constraints)

- Gameplay within 3 s on a normal desktop connection. No title screen, no main menu, no "Play" button, no intro, no splash logo. A new player lands in the world, already controllable. gameplayStart() fires on the first controllable frame.
- Initial download ≤ 3 MB (hard cap 5 MB; CrazyGames' mobile-homepage limit of 20 MB must never be close). CrazyGames measures initial size from load start until the first gameplayStart(), so everything not needed for the first 2 minutes is lazy-loaded after it.
- Bundle hygiene: relative paths only (vite base: './'), ≤ 1,500 files, ≤ 250 MB total. No runtime network requests except the CrazyGames SDK script, and no CDN fonts or libraries at runtime.
- No custom fullscreen button, no external links, no cross-promotion, no own ads, and no alert/confirm/prompt.
- Keys: never bind Escape or browser shortcuts. Movement uses KeyboardEvent.code (so AZERTY/QWERTZ work automatically). Call preventDefault on arrows and space so the parent page doesn't scroll.
- Body CSS: user-select:none (all vendor prefixes), touch-action:none on the canvas, overscroll-behavior:none, and respect env(safe-area-inset-*).
- Readable at 800×450 with devicePixelRatio 1, and good-looking at 1280×720, 1920×1080, 844×390 (mobile landscape) and 390×844 (mobile portrait).
- Consistent simulation at 60/144/165 Hz: fixed-timestep simulation (60 Hz with accumulator, clamped delta) and interpolated rendering.
- The game must fully work with an adblocker, without the SDK (script blocked or failed), and with ads disabled (Basic Launch). Nothing may freeze or soft-lock.
- Original IP only: no real clubs, players, leagues, competitions, crests, kit designs or sponsor brands. All club names are fictional (e.g. "Riverside Rovers", "Northgate FC"). PEGI-12-safe content.
- English is required. All strings live in a locale file from day one.
- Browsers: desktop Chrome/Edge/Safari/Firefox plus iOS Safari, Android Chrome and Samsung Internet. It must run smoothly on a 4 GB-RAM Chromebook, a mid-range Android phone (~4 GB RAM) and an iPhone 11-class device. iOS: resume the AudioContext on a touchend/click gesture.
- Mobile-ready: touch controls, portrait and landscape, safe areas, and the CrazyGames app's fullscreen mode. See §9b.

## 3. Game concept

Fantasy: You're the coach-founder of a tiny academy on a muddy park pitch. Kids show up, you sign them, train them, and turn them into stars. Sell them to clubs for huge fees or keep them to win the league. Grow from a single goal and a ball crate to an elite youth stadium.

Design pillars

- Zero-friction start: the player is playing within 3 s and understands the game within 10 s, with no text needed.
- Always a next thing: at any moment there is something affordable or about to be (≤ 60 s), and an objective arrow pointing at it.
- Watch them grow: every trainee is a named kid with visible stats, a rarity and an OVR rating, so you get attached to your players.
- A living academy: the world is busy and bouncy (kids running drills, balls flying, nets rippling, cash piling up) and gets visibly bigger every minute.

What makes it more than a reskin: player development with rarity (variable rewards), a sell-vs-keep decision, short watchable matches with a skill moment, and a collection album. These drive playtime and D1 far beyond a pure "unlock rooms" loop.

## 4. Core loop and systems

### 4.1 Controls and camera

- Desktop: WASD/arrows or hold the left mouse button and the coach runs toward the cursor's ground point. Show both on the onboarding hint ("WASD or hold mouse").
- Touch: a floating virtual joystick that appears where the thumb lands (as in the reference video). Details are in §9b.
- All input methods are always active at the same time (touch laptops, tablets with keyboards). Show the hint for the method the player actually used last, not just the one guessed from the device type.
- All world interactions are proximity-based (walk onto a pad or zone). No in-world clicking is needed. UI buttons only for panels.
- Camera: fixed 3/4 isometric-style angle (perspective, FOV ~35° for a near-orthographic look, ~50° pitch). Smooth follow with slight look-ahead. It zooms out gradually as the academy grows. On a major unlock it does a short 1 s pan to the new object; this pan is skippable by moving.
- Objective guidance: an objective pill (icon + 2–4 words) plus a bouncing 3D arrow above the target, and a screen-edge arrow when the target is off-screen.

### 4.2 Coach actions

- Pick up cash by walking over cash piles. Bills fly into the HUD counter.
- Unlock pads: stand on a pad and cash drains into it (coins fly in, radial fill, ~0.6–1.5 s). When full, the object pops in with a bounce, confetti, a sound and +stars.
- Carry stack: stand at a source (ball crate, later water bottles, kits) to stack items on your back (capacity starts at 5, upgradable). They sway with spring physics. Walk to a sink (drill basket) to unload.
- Timed interactions: stand in a zone with a radial progress ring (e.g. sign a trainee at the desk, 1.5 s).

### 4.3 Trainee lifecycle (the "customers")

- The bus arrives at the gate with a trainee. They have a procedural fictional name, age 12–17, position (GK/DF/MF/FW), 4 stats (PAC, SHO, PAS, DRI), OVR, rarity (Common 70 % / Rare 22 % / Epic 7 % / Wonderkid 1 %; scouting raises the odds) and a diverse look (boys and girls, skin tones, hair). A floating mini card shows name, OVR and a rarity colour.
- They wait on queue chairs (with emoji mood bubbles if waiting long).
- Sign-up desk: the coach (later a Receptionist) signs them.
- Optional Changing Room step (once unlocked): it boosts training gains.
- Training: they visit unlocked stations, queue if busy, and perform reps. Each rep gives +stat XP (floating "+1 SHO"), drops cash ("training fee") onto that station's pile, and consumes station supplies (balls) that someone must refill.
- Graduation: at the area's graduation OVR they walk to the Graduation Podium with a glowing card. When the coach steps there, a small panel offers [SELL to <fictional club> $X] or [PROMOTE to Academy Squad]. Selling triggers a gold card flip, a "SOLD!" stamp and a coin fountain. Their potential cap depends on rarity (Common ≤ 65, Rare ≤ 75, Epic ≤ 85, Wonderkid ≤ 95).
- Every graduate is added to the Hall of Fame album (collection).

### 4.4 Stations (data-driven; each has levels 1–5: rep speed, cash per rep, stat gain, capacity/lanes)

- Area 1: Shooting Goal (SHO), Dribble Cones (DRI), Passing Wall (PAS), Sprint Track (PAC), Changing Room (buff).
- Area 2: Gym (all stats, small), Hydration Point (carry water bottles to trainees for stamina), Laundry (carry dirty kits to the machine), Physio Room (match injuries), 7-a-side pitch.
- Area 3: Tactics Room (OVR bonus), Analysis Lab, Fan Shop (passive cash), 11-a-side Youth Stadium with stands (big match income). Every area adds one new carry chore so the hands-on loop stays fresh, and a staff hire that automates it shortly after.

### 4.5 Academy Squad and matches

- The squad size grows by area (5-a-side → 7 → 11). Squad strength comes from the best players' OVR, so there is real tension between keeping good players and selling them.
- Kick-off pad on the academy pitch: a match is available every ~3 min (a visible countdown on the pad). There is also a Daily Cup match once per calendar day with a big reward.
- Match = scripted highlight engine, NOT a physics football sim. It shows 3–5 attacking "chances" per match (~6–10 s each, ~45 s total) played out on the real pitch with choreographed runs and passes along waypoints. The outcome of each chance is rolled from attacker stats vs. opponent strength.
- Skill moment: on our attacks, a Power Shot timing meter appears (press Space/click/tap when the needle is in the green zone) and strongly raises the goal chance. 1–2 per match.
- After the first match, a "Skip ▶▶" button jumps to the result.
- Results screen: score, cash (gate receipts scale with stands), trophy points and an MVP who gets +stat. This is a natural break: gameplayStop() → (midgame ad, Full Launch only) → gameplayStart().
- League ladder: 5 divisions × 6 fictional academies. Points from wins; topping the division gives a promotion celebration (happytime()).

### 4.6 Staff and automation

Hire pads in-world (e.g. "Hire Ball Boy $150"). Staff: Ball Boy (refills balls), Receptionist (signs trainees), Assistant Coach per station (+rep speed), Kit Manager, Water Carrier, Accountant (late: collects all cash piles into one safe). Staff have upgrade levels. The first automation happens around minute 3: the moment the chore starts feeling repetitive, it disappears and the game escalates.

### 4.7 Upgrades: the Manager's Office (step in → upgrade panel)

Tabs: Coach (move speed, carry capacity, sign speed, negotiation +% transfer fee), Staff, Stations, and Academy (offline earnings cap 2 h → 8 h, scout odds, stands capacity). Opening the panel pauses the sim and calls gameplayStop().

### 4.8 Areas and progression

- Area 1 "Sunday Park" (~25 unlockables), Area 2 "Training Ground" (~35), Area 3 "Youth Stadium" (~40). Locked areas are visible behind construction fences with a padlock and price sign, to build curiosity.
- Star bar (top centre, like "0/55" in the reference) shows progress in the current area. Completing the area opens the gate to the next one.
- Academy Level (from XP: unlocks, graduations, wins) gives a chest on every level-up and unlocks features progressively so the start stays simple:
  - Lvl 2 → Daily Reward.
  - Lvl 3 → Customisation (academy name, crest, kit colours; optional, with random defaults).
  - Lvl 4 → Daily Quests.
  - Lvl 5 → Scout Office.
  - Lvl 6 → Daily Cup.
  - Lvl 7 → Hall of Fame rewards.
- reportGameCompletedPercentage() = share of v1 content unlocked. It is monotonic and reaches 100 only when everything is done.

### 4.9 Meta and retention systems

- Welcome-back panel (session start, or the tab regaining visibility after ≥ 3 min). One combined panel showing:
  - offline earnings: automated stations at 50 % rate, capped by the Office upgrade;
  - today's daily reward. Buttons: [Collect] and, Full Launch only, [▶ Collect ×2] with equal size and styling. For returning players this panel is shown over the rendered world before the first gameplayStart(), which fires when it closes.
- Daily Reward calendar (7 days): day 7 is a guaranteed Epic prospect plus a kit cosmetic. Tomorrow's reward is always shown ("Tomorrow: Rare Scout Ticket"). A missed day doesn't wipe progress.
- Daily Quests (3/day, local midnight reset): e.g. "Sign 10 trainees", "Win 2 matches", "Sell a player for $500+". Rewards: cash and Scout Tickets.
- Scout Office: send scouts on real-time missions: 5 min (common+), 30 min (rare+), 8 h "Global trip" (epic+, wonderkid chance). The long mission is the strongest D1 hook. Prompt it naturally ("Your scout can search South America overnight"), and show timers on the HUD badge.
- Hall of Fame album: slots by position × rarity, milestone rewards, and visible empty slots.
- Account prompt: once Area 1 is ~70 % complete (≈ minute 10), and only if user.isUserAccountAvailable and not logged in, show a non-blocking card: "Save your academy to your CrazyGames account" → showAuthPrompt(). Never force it, and never show it in the first 5 minutes.
- Never-dead-air rule: if the player has nothing affordable for > 20 s, the objective system points at the best cash source or an upgrade.

## 5. Metric playbooks (design these deliberately)

### 5.1 Conversion: load fast, then make the first 60 s irresistible

Loading:

- loadingStart(), then fetch only Area 1 core content, precompile shaders (renderer.compile), loadingStop(), then gameplayStart().
- Show an HTML/CSS progress bar inside index.html (no JS framework) only if loading takes > 1 s.
- Lazy-load music, Areas 2–3, the match crowd and non-critical SFX after gameplayStart().

First-60-seconds beat sheet (average player following the arrow):

| t | Beat |
|---|---|
| 0 s | Sunny park pitch, coach in the centre, two kids kicking a ball nearby for life. A $15 cash pile glows 3 m away. Hint on desktop: animated keycaps + mouse icon ("WASD or hold mouse"). Hint on touch: animated finger dragging a joystick ("Drag to move"). |
| ≤ 5 s | Cash picked up → +15 pop, coin sound. The arrow jumps to the Ball Crate pad. |
| ≤ 12 s | First unlock (crate pops in), +1 star. Next: Shooting Goal pad. |
| ≤ 20 s | Goal unlocked; the bus honks and the first trainee (always Rare, OVR card visible) gets off. |
| ≤ 25 s | "Sign Leo" → desk ring → signed. He runs to the goal. |
| ≤ 35 s | "Grab balls" → stack of 5 on your back → "Bring balls" → basket. |
| ≤ 45 s | Leo shoots: GOAL, net ripple, "+1 SHO", cash drops on the pile. |
| ≤ 60 s | Cash collected; 3 unlocks done; second trainee arriving; the next 2 pads already visible with prices. |

No text walls, ever. Hints disappear once the action has been done. Onboarding is just objectives inside gameplay; it never blocks, and players can ignore it.

### 5.2 Playtime: the first-session pacing curve (verified by the simulator, §15)

| Time | Target state |
|---|---|
| ~2:00 | Academy Lvl 2 → chest + Daily Reward unlocked (claim day 1, see day 2 teaser) |
| ~3:00 | First automation: hire Ball Boy |
| ~4:30 | First graduation → first transfer sale (big payout moment) |
| ~5:30 | Squad bench + Kick-off pad → first match |
| ~7:30 | Office upgrades; Area 2 gate visible with price; Daily Quests |
| ~10:00 | ≥ 15 unlocks total; Area 1 ≈ 70 %; Scout Office available; account prompt |
| 15–20:00 | Area 1 complete → Area 2 opens (a fresh burst of cheap pads) |

Tuning rules:

- Gaps between purchases: 10–20 s early, 30–45 s by minute 10, ≤ 90 s by minute 30. Never more than 60 s without an affordable purchase or a match during the first 30 min.
- Costs grow ~1.3–1.45× per step within an area; each area resets to cheap pads with a higher income baseline.
- Matches every ~3 min act as session punctuation and spectacle.
- Automation must arrive just as a chore starts feeling repetitive.

### 5.3 D1 retention: give them a reason to come back tomorrow

Ranked by impact:

1. Bulletproof save via the SDK data module, restored exactly (positions of piles, trainees in progress, timers).
2. Daily reward with the tomorrow-teaser.
3. 8 h scout mission running overnight.
4. Daily Cup ("next cup in 14:22:10").
5. Daily quests.
6. Unfinished goals: area star bar, squad missing players, empty Hall of Fame slots, the next area visible.
7. Offline earnings.
8. Account login for cross-device saves.
9. Enough content that sessions 2–4 still bring new stations, chores, staff, divisions and areas.

Zero tolerance for bugs and rough edges: a single soft-lock kills D1.

### 5.4 CTR: build the marketing assets into the game

Add a capture mode (?capture=1, dev build only):

- It hides the HUD and stages a hero scene: the coach pointing, a glowing Wonderkid in golden boots striking a ball, a busy academy and stadium behind, golden-hour lighting.
- It renders stills at 1920×1080, 800×1200 and 800×800 with consistent composition so the game is recognisable at every size.
- It plays a scripted 15–20 s camera tour for the preview video in 16:9 and 2:3. The first frame equals the cover. Beats: unlock pop, Wonderkid card reveal, match goal celebration, academy timelapse growth. No cursor, no black frames, no fast-forward.

Cover rules (CrazyGames):

- The only text allowed is the game title (large and stylised).
- No "Play/New/Updated", no borders, no icons or store logos.
- No blur; not a plain gameplay screenshot.

The in-game look must match the cover: bright, saturated and readable at thumbnail size.

## 6. CrazyGames SDK v3 integration (exact API)

In index.html `<head>`, before game code:

```html
<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
```

Write one wrapper module src/platform/platform.ts exposing a typed Platform interface. Rules:

- No other file touches window.CrazyGames.
- Every call is wrapped in try/catch (the SDK throws on non-CrazyGames domains, where environment === 'disabled').
- If the script didn't load, or the environment is disabled, fall back to a MockPlatform that logs to the debug overlay and can simulate ads, unfilled ads, adblock and login.
- On localhost the real SDK runs in local mode, and ?useLocalSdk=true forces it on other hosts.

```ts
await window.CrazyGames.SDK.init();                 // during the loading screen; must complete before any other call
window.CrazyGames.SDK.environment;                  // 'local' | 'crazygames' | 'disabled'

// game module
SDK.game.loadingStart(); SDK.game.loadingStop();
SDK.game.gameplayStart(); SDK.game.gameplayStop();
SDK.game.happytime();                               // sparingly
SDK.game.settings;                                  // { muteAudio, disableChat }
SDK.game.addSettingsChangeListener(fn);             // muteAudio overrides in-game audio toggles
SDK.game.reportGameCompletedPercentage(0..100);     // HTML5 only, monotonic
SDK.game.setGameContext({...}); SDK.game.clearGameContext(); // debugging context for user feedback

// ads
SDK.ad.requestAd('midgame' | 'rewarded', { adStarted, adFinished, adError });
// adError codes: adsDisabledBasicLaunch | unfilled | adblock | adCooldown | other
await SDK.ad.hasAdblock();

// data (cloud save for logged-in users, localStorage for guests; same API as localStorage)
SDK.data.getItem(key); SDK.data.setItem(key, string); SDK.data.removeItem(key); SDK.data.clear();
// ≤ 1 MB as JSON; SDK debounces ~1 s (can take up to 30 s); errors: dataLimitExcedeed | dataModuleDisabled

// user
SDK.user.isUserAccountAvailable;                    // boolean property
await SDK.user.getUser();                           // null if logged out
await SDK.user.showAuthPrompt();                    // throws userCancelled etc.
SDK.user.addAuthListener(fn); SDK.user.removeAuthListener(fn);
SDK.user.systemInfo;                                // { countryCode, device:{type:'desktop'|'tablet'|'mobile'}, os, browser }
```

Event map

| Moment | Call |
|---|---|
| Boot | init() → loadingStart() |
| Area 1 core ready | loadingStop() |
| First controllable frame (or Welcome-back panel closed) | gameplayStart() |
| Blocking panel opens (Office, settings, results, customisation, Hall of Fame) | gameplayStop(); sim paused |
| Panel closes | gameplayStart() |
| Match highlight playing | stays in gameplay (it's interactive) |
| First Epic/Wonderkid signed, record transfer, division promotion, cup win | happytime() (never for regular unlocks or pickups) |
| Each unlock (throttled) and on load | reportGameCompletedPercentage(n), setGameContext({ area, academyLevel, saveVersion, build }) |

Further rules:

- gameplayStart/gameplayStop are an idempotent state machine in the wrapper. Never double-call. Never call on tab blur/focus (CrazyGames handles that).
- Mute: settings.muteAudio === true silences everything regardless of in-game toggles.
- Auth: on login the SDK swaps in the account's data, so the game must re-read the save and rebuild state and show a toast "Progress loaded from your account".
- Locale: use a locale field in systemInfo if one exists at runtime, else navigator.language, else English.
- Use systemInfo.device.type for control hints and the default quality tier.

## 7. Monetization (behind a flag; OFF for Basic Launch)

- Build flag VITE_ADS=off|on. With off, no ad UI exists anywhere and no ad requests are made.
- Also, at runtime, any adsDisabledBasicLaunch error switches ads off for the session. A rewarded button must never stay clickable while doing nothing.
- The economy must feel generous without ads; ads only add on top.

Rewarded (only on non-gameplay panels, never on the active gameplay screen):

- Each button has a video icon and states the exact reward ("▶ +$1,250").
- An equally sized and styled "No thanks" or a cash alternative sits next to it.
- Grant the reward only on adFinished. On adError, toast "Ad not available, try again later".

Placements:

- Welcome-back ×2.
- Office upgrade short on cash: "▶ Get $X", where X ties to progress (≈ 30–40 % of the cheapest locked item); 3 min cooldown.
- Match results ×2 prize. If used, no midgame on that break (never offer both at one break).
- Scout Office: finish a ≤ 30 min mission instantly, max 3/day.
- Daily reward ×2.

Diminishing returns on repeat use; daily caps.

Midgame:

- Only at natural breaks: closing match results, closing the area-complete celebration. Never on navigation (Office, settings).
- Never before 5 min cumulative playtime and never after the very first match.
- Just request at every break; the SDK enforces a 3 min spacing.
- On request: block input and pause the sim. On adStarted: mute. On adFinished/adError: resume, unmute, and continue normally.

Adblock: hide rewarded buttons and show a small inline note in the panel. No popups, never block play.

Banners: none in v1.

## 8. Art and audio direction

- Style: bright, saturated, chunky low-poly toon (like the reference), with soft rounded shapes (RoundedBoxGeometry from three/addons). Flat colours via vertex colours or a small palette texture; no photo textures.
- Palette (one palette.ts):

| Element | Colour(s) |
|---|---|
| Grass stripes | #5DC453 / #52B848 |
| Lines | #FFFFFF |
| Track | #E2583E |
| Cash | #3DDC84 |
| Stars | #FFC83D |
| Sky | #8ED6FF → #DFF4FF gradient |
| Academy colours (customisable) | blue #2F6BFF + yellow #FFD23F |
| Rarity | Common grey, Rare blue, Epic purple, Wonderkid animated gold |

- World: never a black void. Surround the playable island with low-poly trees, fences, a road with the bus, and distant city silhouettes. Locked zones show construction fences and padlocks.
- Characters: procedural chibi humanoids (head ≈ 40 % of height) from capsules and spheres, with canvas-generated face textures (a few eye/mouth variants) and hair variants. Kits use academy colours and numbers.
- Procedural animation: idle bob, walk/run, carry, kick, celebrate, sit.
- Render all humanoids with per-body-part InstancedMesh (all heads in one, all torsos in one, …) with per-instance colour, so draw calls stay constant regardless of crowd size.
- Lighting: HemisphereLight plus one warm DirectionalLight. Real shadows only on the "High" tier; blob shadows under all characters everywhere. ACES tone mapping, sRGB output. No post-processing.
- Juice everywhere:
  - squash-and-stretch pop-ins, coin arcs into the HUD, number popups, net ripple, tiny camera shake on big moments;
  - footstep dust, confetti, the gold card shine;
  - NPC emoji bubbles, idle kids juggling balls.
- Every action has visual and audio feedback within 100 ms.
- Optional: CC0 models (Kenney/Quaternius) are allowed. Each must be < 300 KB, compressed with gltf-transform (meshopt), lazy-loaded if not in Area 1, and listed in CREDITS.md. Procedural is the default.
- Audio: procedural WebAudio SFX (coin, pop, whistle, kick, net, cheer, cash register), so they add almost nothing to the bundle. One cheerful music loop (≤ 600 KB, lazy-loaded after gameplayStart). Consistent loudness; music ducks during matches for crowd and whistle.
- Fonts: one rounded display font and one body font (OFL), subset woff2, bundled locally.

## 9. UI / HUD

- DOM/CSS overlay above the canvas: crisp at any DPR and easy to localise. Scale with clamp() on min(vw, vh). Minimum 14 px text at 800×450. Hit targets ≥ 48 px.
- HUD:
  - top-left: settings gear and an academy badge (level ring; CrazyGames username/avatar if logged in);
  - top-centre: area star bar;
  - top-right: cash (animated counting) and Scout Tickets;
  - right edge: objective pill and timer badges (daily reward, scouts, cup);
  - the bottom stays clean during gameplay.
- Panels are one level deep, fast to open and close, with clear labelled buttons.
- Settings: Sound, Music, Graphics (Auto/Low/High), Language, Reset progress (inline two-step confirmation).
- Layouts for landscape and portrait are specified in §9b.

## 9b. Mobile (first-class, not a port)

Orientation and layout

- Support both portrait and landscape and switch live on rotation with no reload, no state loss and no stretched frame. Select both orientations in the submission form.
- Portrait is the main phone layout for this genre:
  - HUD stacked at the top inside the safe area;
  - objective pill below the cash bar;
  - joystick zone in the lower ~60 % of the screen;
  - panels open as bottom sheets reachable with the thumb.
- Landscape phone (e.g. 844×390): HUD in the corners, panels centred and scrollable. Nothing may be cut off at 390 px height.
- Camera: derive distance and FOV from the aspect ratio so the same world area is visible in portrait and landscape. Portrait zooms out vertically, never crops the coach's surroundings.
- Use 100dvh and listen to visualViewport resize, so the iOS address bar and keyboard never break the layout. Respect env(safe-area-inset-*) on all four sides (notch, home indicator, rounded corners).
- The game must work inside the CrazyGames mobile app in fullscreen mode as well as in mobile browsers.

Touch controls

- Floating joystick:
  - it appears where the thumb lands, anywhere outside UI elements;
  - dead zone ~8 px, max radius ~60 px (scaled with screen size);
  - movement speed is analog to the drag distance;
  - the joystick base follows the thumb if it's dragged beyond the radius, and fades out on release.
- Track the first touch for movement. Additional fingers can only press UI and never hijack the joystick.
- Tap targets: all buttons ≥ 48 px with ≥ 8 px spacing, placed where thumbs reach. No hover-only information; anything that's a tooltip on desktop is a tap on mobile.
- Power Shot (match skill moment): a large tap target or tap-anywhere, with generous timing on touch (+30 % green zone) to compensate for touch latency.
- Suppress mobile browser behaviour:
  - long-press menus (contextmenu preventDefault, -webkit-touch-callout:none);
  - text selection and the magnifier (user-select:none);
  - double-tap zoom and pinch zoom (touch-action:none on the game root plus the viewport meta);
  - pull-to-refresh (overscroll-behavior:none).
- Haptics: short navigator.vibrate pulses (10–25 ms) on coin pickups, unlocks and goals, feature-detected (Android only; iOS ignores it) with a Vibration toggle in Settings.

Mobile performance

- Default to the Mid tier on mobile (shadows off, blob shadows only, DPR ≤ 1.5).
- Use the Low tier (DPR 1, reduced particles and crowd) when navigator.deviceMemory ≤ 4, on older iOS, or when the FPS watchdog trips.
- Prefer a stable 30 FPS over a jittery 40–55 FPS on low-end phones: lock to 30 if the 60 FPS target isn't held.
- Keep GPU memory small: textures ≤ 1024 px, one shared face atlas, and geometry merged/instanced (§8).
- Handle webglcontextlost / webglcontextrestored:
  - pause;
  - rebuild GPU resources from the sim state;
  - show a small "Tap to continue" if needed.
- Never lose progress; the save is independent of the renderer.
- Pause rendering and the sim tick when the page is hidden (app switch, screen lock). Save on visibilitychange:hidden and pagehide; iOS often kills background tabs without further events.
- Watch thermals: no uncapped frame loops, no wasted work while idle-looking. Long sessions on a phone are the playtime goal.

Mobile-specific UX

- Text stays readable on a 360 px-wide phone (minimum 14 px, ideally 16 px for body text). Card names truncate gracefully, and numbers abbreviate ($12.4K, $1.2M).
- Sessions on mobile are shorter and more fragmented: make sure progress is saved after every meaningful action, and that the welcome-back panel works well after short interruptions too.
- Audio starts muted until the first touch (browser policy), then fades in. No audio error dialogs.

## 10. Tech architecture

- Stack: TypeScript (strict, no any), Vite, three.js (latest stable), Vitest, Playwright, ESLint. No physics engine (kinematic movement, circle colliders, grid nav).
- Strict separation of simulation and view: the sim (economy, trainees, stations, staff, timers, matches) is pure TS with no three.js imports, driven by a fixed tick. It runs headless for tests and the economy bot. The view layer subscribes to sim events.
- Content is data: areas, pads, stations, staff, costs, rewards and objectives are declared in src/data/ (ids, positions, prerequisites, costs, star rewards, objective text keys). Adding Area 4 should require only data plus new station behaviours.
- All tunables live in src/data/balance.ts. No magic numbers in systems.
- Clock abstraction (real time + dev offset) so offline earnings, daily resets and scout timers can be tested by "skipping time".
- Pathfinding: a nav grid per area (1 m cells) with A* and cached station-to-station paths, simple separation steering, and queue slots at stations.
- Object pools for coins, cash bills, particles, balls and popups. No per-frame allocations in hot paths.
- Suggested layout:

```
  src/
    main.ts
    platform/   (platform.ts, crazygames.ts, mock.ts)
    core/       (loop, events, rng, clock, save, i18n, analytics)
    sim/        (economy, trainees, stations, staff, squad, match, objectives,
                 tutorial, daily, quests, scouting, offline, progression)
    view/       (renderer, quality, camera, palette, builders/, humanoids, fx, audio)
    ui/         (hud, panels/, toasts, styles.css)
    data/       (balance.ts, areas/, names.ts, clubs.ts, locales/en.json)
  tools/        (economy-sim.ts, size-check.ts, zip.ts)
  tests/        (unit/, e2e/)
```

- analytics.track(event, props): console logging in dev, a no-op in prod, and ready for a provider later. Funnel events:
  - boot, sdk_ready, first_frame, first_move, first_cash, first_unlock;
  - tutorial_step_n, minute_1/3/5/10/15;
  - first_graduation, first_match, area_complete, ad_*.

## 11. Performance and size budgets (enforced by scripts)

| Budget | Target |
|---|---|
| Initial transfer until gameplayStart | ≤ 3 MB (fail > 5 MB) |
| JS (brotli) | ≤ 400 KB |
| Time to gameplayStart | ≤ 2.5 s desktop broadband; ≤ 6 s on mobile ("Fast 4G" + 4× CPU throttle) |
| FPS | 60 on an integrated-GPU laptop; 60 on a recent phone; a stable ≥ 30 on the low tier (4 GB Chromebook, mid-range Android, iPhone 11-class) |
| GPU memory (mobile) | Textures ≤ 1024 px; no crash after 30 min of play on an iPhone 11-class device |
| Draw calls | ≤ 150 |
| Visible triangles | ≤ 300 k |
| JS heap | < 250 MB, no GC spikes |
| DPR cap | High 2, Mid 1.5, Low 1 |

- Auto quality: start by device type. If the average FPS stays < 45 for 3 s, step down (shadows off → lower DPR → fewer props/particles). Never step up mid-session in a way that causes visible popping.
- Pause rendering when the tab is hidden. Clamp delta on return.

## 12. Save system

- One versioned JSON blob in SDK.data under key save (target < 100 KB): { v, created, lastSeen, cash, tickets, xp, level, areas, pads, stations, staff, trainees, squad, league, collection, daily, quests, scouting, cosmetics, settings, stats:{ playSec, sessions, firstDay } }
- Migrations for every schema change. Validate on load; on corrupt data, keep a backup key and start fresh rather than crash.
- Save triggers: every unlock/purchase/graduation/match, every 10 s if dirty, and on visibilitychange:hidden and pagehide.
- Read before write: load existing data before the first save so progress is never overwritten.
- If the data module is unavailable (dataModuleDisabled, mock), fall back to localStorage and log a warning.

## 13. Localization

- en.json is complete and the source of truth. Build the i18n layer with interpolation and plurals, and let the HUD adapt to longer strings (German!).
- After v1, add de, fr, es, pt-BR, pl, tr, it. Only add a language if the translation quality is high, as CrazyGames requires.

## 14. Quality bar (CrazyGames QA rejects on overall quality, so this matters)

- Nothing may look like programmer art: no default grey materials, no unstyled boxes, no Times New Roman, no debug text in prod.
- One consistent art style and palette, no z-fighting, no clipping through walls, no text overflow at any listed resolution.
- Zero console errors or warnings in prod, no unhandled promise rejections, no soft-locks. NPCs never get stuck (add a watchdog that re-paths or teleports stuck NPCs).
- Responsive feel: input-to-motion < 50 ms, every action gets feedback, consistent audio levels.
- Self-review loop: after every milestone, take Playwright screenshots at all listed resolutions and look at them critically against §8 and §9. Fix what looks cheap before moving on.

## 15. Tooling and verification (create these early, run them often)

| Command | What it does |
|---|---|
| npm run dev / build / preview | Standard Vite commands |
| npm run check | tsc --noEmit + eslint |
| npm run test | Vitest: economy maths, save migrations, daily reset across midnight/timezones, offline-earnings caps, rarity rolls, match outcome distribution, platform wrapper state machine |
| npm run sim | Headless economy bot (§15.1) |
| npm run e2e | Playwright smoke tests (§15.2) |
| npm run size | Brotli/gzip sizes of everything loaded before gameplayStart; fails over budget |
| npm run zip | Production build → dist/ → wonderkid-academy.zip (relative paths; file count check) for upload |

15.1 Economy bot (npm run sim). Runs the real sim code headlessly. A bot walks the objective path at coach speed (travel time from real distances) and makes sensible choices. It simulates 0–60 min and prints a timeline: unlocks, level-ups, first automation, first sale, first match, area completion, longest gap without an affordable action. It fails if any §5.1/§5.2 target is missed. Also run it for a "distracted" bot at 70 % efficiency.

15.2 E2E smoke tests (npm run e2e). Using the mock platform:

- gameplayStart fires ≤ 3 s after navigation;
- no console errors;
- simulated WASD reaches the first cash and first pad, and the pad unlocks;
- save → reload restores state;
- skipping the clock 25 h shows the welcome-back panel and day-2 reward;
- screenshots at all resolutions.

Mobile runs: repeat the core e2e flow with Playwright device emulation (an iPhone profile and a Pixel profile, hasTouch: true, both orientations).

- Drive movement with touch events on the joystick, not keys.
- Rotate mid-session and assert the HUD stays inside the safe area and the state is unchanged.
- Assert that no UI element overlaps another at 360×640, 390×844, 844×390 and 1024×768 (tablet).

Real-device check: at every milestone from M1, serve the game on the LAN (vite --host). Give me the URL and a QR code in the terminal so I can test on my iPhone/Android, and list what to check on the phone.

Debug overlay (?debug=1, dev builds only):

- FPS, draw calls, triangles, heap, quality tier, SDK event log;
- cheats: +cash, skip time (+1 h / +1 day), skip tutorial;
- toggles to simulate adblock, unfilled ads, and login/logout.

## 16. Milestones (each ends with all checks green, screenshots reviewed, a git commit, and a short summary)

- M0 Foundation:
  - Vite/TS/three scaffold, platform wrapper and mock, fixed-step loop, renderer with quality tiers;
  - input (keys + hold-mouse + touch joystick), follow camera;
  - procedural coach walking on a styled pitch tile; size and zip scripts;
  - responsive canvas for portrait/landscape with live rotation, safe areas, mobile CSS hardening (§9b).
  - Accept: gameplayStart ≤ 2 s locally, 60 FPS, initial size ≪ 3 MB; the coach is controllable by touch joystick in emulated iPhone portrait and landscape.
- M1 Vertical slice (first ~5 min of Area 1):
  - cash, pads, carry stack, Ball Crate, Shooting Goal, Dribble Cones;
  - trainee lifecycle up to training and cash drops, sign-up desk;
  - objectives, arrow, star bar, HUD, juice and SFX v1; economy bot v1.
  - Accept: §5.1 beat sheet met in the bot and in a manual run, on desktop and in mobile emulation (portrait + landscape).
  - → STOP and ask me to playtest on desktop and on my phone (LAN URL + QR). Give me the run command and 5 things to pay attention to.
- M2 Players: stats, rarity, OVR cards, graduation podium, transfers, squad, Kick-off pad, match highlight engine with Power Shot, results screen, league ladder.
- M3 Automation and Area 1 complete:
  - all staff, Manager's Office upgrades, remaining Area 1 stations, Area 2 gate;
  - balance pass until the bot meets §5.2 through minute 20.
- M4 Retention:
  - save, load and migrations; welcome-back, offline earnings, daily reward, quests, scouting;
  - academy levels with feature unlocks, customisation, Hall of Fame, account prompt and auth reload, Daily Cup.
- M5 SDK audit and ads:
  - verify the event map against the real SDK on localhost (local env);
  - rewarded and midgame behind VITE_ADS, adblock handling, happytime, completion %, game context.
- M6 Area 2 content + balance → Basic Launch candidate (VITE_ADS=off).
- M7 Area 3, polish, performance on low-tier desktop and phones, capture mode (§5.4), submission checklist.

Every milestone's acceptance includes: the new features work with touch, in portrait and landscape, and nothing overlaps at the mobile resolutions.

## 17. How you work

- First, save this entire spec verbatim to docs/GDD.md. Create a concise CLAUDE.md with the non-negotiables (§2), mobile rules (§9b), budgets (§11), SDK rules (§6), commands (§15) and code conventions.
- Plan each milestone briefly, then implement it. Don't stop at scaffolding: keep going milestone by milestone unless blocked or at the M1 playtest gate.
- Make reasonable decisions yourself within this spec and log them in docs/DECISIONS.md. Ask me only for real design forks that would be expensive to reverse.
- Never violate §2. If a feature conflicts with a budget, the budget wins. Propose an alternative.
- Keep sim logic unit-tested. Run check, test, sim, size and e2e before every commit.
- At the end of every milestone, report:
  - what's playable;
  - bot timeline excerpt (key timestamps);
  - initial size;
  - FPS on the low tier;
  - known issues;
  - next steps.

## 18. Submission checklist (generate docs/SUBMISSION.md and tick it off)

- [ ] SDK script in `<head>`; init awaited; wrapper is the only SDK consumer.
- [ ] gameplayStart/gameplayStop/loadingStart/loadingStop match the event map; no double calls; none on blur/focus.
- [ ] muteAudio respected live; audio resumes on gesture (iOS).
- [ ] Data module is the save path; "Progress Save" selected in the submission form; login reloads the save.
- [ ] Works with adblock, without the SDK, and with ads disabled; no dead rewarded buttons; midgame only at natural breaks after 5 min; audio muted on adStarted.
- [ ] No fullscreen button, no Esc binding, no external links, no real IP, English complete.
- [ ] Initial download ≤ 3 MB; time to gameplay ≤ 3 s; relative paths; ≤ 1,500 files; zip tested by unzipping and serving statically.
- [ ] 800×450 @ DPR 1 readable; 144 Hz behaviour identical; Safari tested; low tier ≥ 30 FPS.
- [ ] Mobile: marked mobile-friendly in the submission form with both orientations selected; touch joystick and all panels usable one-handed; live rotation without state loss; safe areas respected; works in the CrazyGames app fullscreen mode; no long-press/zoom/pull-to-refresh glitches; audio works on iOS after the first tap; tested on a real iPhone (Safari) and a real Android phone (Chrome); WebGL context loss recovers; 30 min play session without a crash on iPhone 11-class hardware.
- [ ] Covers 1920×1080, 800×1200, 800×800 and preview videos 16:9 + 2:3 (15–20 s, no sound) exported from capture mode.
- [ ] CREDITS.md with fonts, models and licences.
