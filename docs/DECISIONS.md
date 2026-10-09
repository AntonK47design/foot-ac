# Decisions log

Decisions made within the GDD where the spec left room. Newest at the bottom.

## M0 / M1

1. **Stack**: three 0.186, Vite 7, Vitest 3, TypeScript 5.9 (strict), Playwright 1.56 (matches the pre-installed Chromium). No physics engine.
2. **Coordinates**: +x east (screen right), +z south (towards camera), y up. The camera never rotates, so screen-space input maps directly to world x/z.
3. **Fonts**: Fredoka 600 (display) + Nunito 700/800 (body), Latin subset woff2 from @fontsource, bundled (~48 KB). Latin-ext will be added with de/pl/tr locales.
4. **Music** is procedural WebAudio (lazy chunk, ~1.3 KB) instead of a 600 KB file. Same "lazy after gameplayStart" rule, near-zero bytes.
5. **Pads sit on the interaction spot** of what they unlock (basket, crate front, pile). After unlocking, the coach is already standing where the next action happens.
6. **Bus arrivals start when the Shooting Goal is unlocked** (≈ beat "≤ 20 s"), so the first minute has no idle trainees. The first trainee is always "Leo", Rare, FW.
7. **Trainees graduate and leave in M1** (graduation bonus dropped on the desk pile). M2 replaces this with the podium sell/promote decision.
8. **Objective priority** (also drives the economy bot): tutorial cash → affordable pad → collect cash that makes the next pad affordable → refill a starving station → sign at desk → keep baskets topped up → collect any pile → save up. Putting "sign" above "refill" soft-locked the economy in bot runs (every basket empty, coach stuck signing), so it sits below.
9. **Signing is capacity-gated**: the desk only signs when Σ(lanes + 3 queue slots) has room; the desk shows a red "Full" tag otherwise. This prevents unbounded queues.
10. **Ball Boy (first automation) is in M1** because §5.2 puts it at ~3:00, inside the M1 "first ~5 min" window. The bot lands it at 2:15–2:35 (focused) and ~3:00 (distracted).
11. **Area 1 has 15 pads / 20 stars in M1.** M3 adds the remaining ~10 (changing room, office, receptionist, podium, squad bench, kick-off pad, Area 2 gate) to reach ~25.
12. **Save blob shape**: `{ v, created, lastSeen, game: SimState, settings, stats }`. The GDD's flat field list (cash, pads, trainees…) lives inside `game`, so one structure is shared by save, tests and the bot. Agent paths are transient and recomputed after load.
13. **Rendering**: static scenery is merged into 3 vertex-coloured meshes. Each station/object is one merged mesh, and humanoids are 14 InstancedMeshes (one per body part / hair style). One shared Lambert material. A busy scene uses ~36 draw calls and ~82k triangles.
14. **Faces**: one 512×256 canvas atlas (8 variants) on a sphere-cap patch, offset per instance through an instanced UV attribute (onBeforeCompile).
15. **Labels, popups and flying coins are DOM**, projected each frame from pooled keyed elements, so text stays crisp at any DPR and is localisable. Labels under the top HUD band are dimmed.
16. **Quality tiers**: desktop → High (shadows, DPR 2), unless deviceMemory ≤ 4 (→ Mid). Phones → Mid, or Low when deviceMemory ≤ 4 / iOS < 15. The watchdog steps down after 3 s below 45 FPS and locks to 30 FPS at Low. The Graphics setting offers Auto/Low/High as specified (Mid is reachable only via Auto).
17. **SDK init timeout 2.5 s**, then the mock is used. A blocked or slow SDK script can never hold back gameplayStart.
18. **Mock ads default to `adsDisabledBasicLaunch`**, mirroring Basic Launch. With `VITE_ADS=off` the wrapper never calls the adapter.
19. **E2E runs against a production build with test hooks** (`--mode e2e` → `VITE_TEST_HOOKS=1` → `window.__wk`). The debug overlay and hooks are compiled out of the normal prod build.
20. **Touch e2e uses CDP touch events** (real pointerType `touch`) on Chromium device emulation. WebKit isn't installed in CI, so the iPhone profile runs on Chromium with iPhone viewport/UA/touch.

## Art overhaul

21. **`docs/ART_BIBLE.md` overrides GDD §8 and the size budget** (user directive): dark void + raised plot, rigged CC0 characters, CC0 prop packs, initial ≤ 6 MB, tris ≤ 400 k.
22. **Asset sources reachable from the build environment**: KayKit packs (official GitHub repos, CC0) clone fine and are imported into `assets-src/kaykit/` with their licence files (Furniture, Prototype, City Builder, Restaurant Bits). kenney.nl, quaternius.com and itch.io are blocked by the sandbox network policy; Kenney Mini Characters must be supplied by the user. Third-party GitHub re-bundles of mixed packs were rejected (unverifiable licence provenance).
23. **Touch hint**: the initial input method uses `matchMedia('(pointer: coarse)')` as well as the SDK device type, and the first pointer event of any type switches the hint immediately (fixes WASD hint in phone emulation with the mock platform).
24. **"Chairs" → "benches"** in all player-facing names (football-themed furniture).
25. **Characters: Kenney Mini Characters (CC0, supplied by the user)**, one GLB per model (GLTFLoader renames duplicate bone names inside one file), clips shared from `male-a` (idle, walk, sprint, sit, holding-both = carry, emote-yes = cheer, attack-kick-right = kick, pick-up, interact). Kids ×1.6 (~1.1 m), adults ×1.85.
26. **Kit recolouring at build time + runtime tint**: `tools/kit-remap.ts` moves shirt/shorts/socks UVs into four unused white palette cells (rows 0–1); a Lambert `onBeforeCompile` tints those cells per role (academy kit, coach tracksuit, staff orange bib, random casual). Skin, shoes, hair and faces keep the original palette. Materials are cached per kit and share one program.
27. **Head merged into body skin** (identical skins) → 1 draw call per character. Showcase: 24 characters, ~90 draw calls including shadow passes, ~280 k triangles.
28. **Roles**: coach = `male-c` (cap), staff = `male-b`/`male-d`, trainees = the remaining eight. `female-a` is excluded from trainees (she holds props).
29. **Portrait width 9.5 m** instead of the art bible's ~10–11 m: at 10.5 m characters drop to ~5 % of the viewport height. Landscape keeps 17 m.
30. **KayKit scale fixes**: Furniture/Restaurant bits are modelled at ~2× real scale (×0.45–0.85); City Builder bits at ~0.2× (×4–6). Brown KayKit trash bags read as rocks → replaced with coded academy bins.
31. **Contact AO** = merged radial/linear gradient decals (under props, along wall bases) + baked vertex AO on coded geometry; no SSAO/post.
32. **Pads 1.3 m** (was 2.2 m). Ghost holograms render after pads (`renderOrder`), price label sits on the front half of the pad so it never covers the ghost.
33. **Gameplay moved onto the diorama** with the same pad/station ids. Save v2 migration flags `relayout`; on load the sim puts the coach at spawn and each trainee/staff at the logical spot for its state, while cash, pads, stations and stats are kept.
34. **Retune for the bigger layout** (longer walks, gate detours): coach 6.0 m/s, training fees +1, Ball Boy $175 after bench + cone lane 2, flags $75 after the wall, cooler after the sprint track. Bot: first automation 2:15 (focused) / 2:50 (distracted); all §5.1 beats pass.
35. **Arriving trainees go straight to a free desk** instead of sitting first (the reception is far from the bus).
36. **Icon atlas** rendered once at start in a separate short-lived WebGL context (toDataURL), then disposed: no `readPixels` stall warnings on the main context.
37. **Initial download** now includes the Area 1 GLBs (characters + props): ~1.7 MB transferred, within the 6 MB art-bible budget. The KayKit city pack is not shipped until a later area needs it.
38. **Street z-fighting fixed**: the street base block's top was coplanar with the asphalt plane, which caused flickering bands. The block now sits 4 cm lower, and the bus-stop sign stands at street level.
39. **The changing room has a job** (playtest feedback that it felt pointless): signed trainees walk to a changing-room bench, sit for `trainee.changeTime` with a 👕 bubble, switch from casual clothes into the academy kit with a puff, and then head to a station. If all 6 bench seats are taken they skip straight to the station, so this can't soft-lock. Trainees in `toLocker`/`changing` count against training capacity. The view-only "filler" kids are removed (one was clipping into the construction barrels).
40. **Less crowding**: bus every 13 s (was 9), station queues hold 1 (was 3). Removed the free-kick mannequins from the shooting lane and the decorative plaza ball rack that blocked the walk to the pitch gate. The dugout is now open-topped because its roof hid the drills from the camera. The dead-end alley between the clubhouse and the pitch fence is blocked, since the bot could get trapped there.
41. **Decor does something** (`BALANCE.perks`, shown on the pad and toasted on unlock): Bunting +20% training fees, Water Cooler trains 20% faster (now $110 after the bunting, before the Ball Boy), Team Bench gives a 2× graduation bonus. Ball Boy is $185.
42. **Less hand-holding**: the 3D guide arrow and the edge pointer show only for the first 3 unlocks. After that they appear only when the coach has stood still for 5 s. The objective pill stays as a passive hint.
43. **Bigger Area 1** (playtest: "map too small"). The plot grows from 27×19 m to 34×24 m. The clubhouse keeps its size and moves to the north-west corner. The pitch grows from 14×7 m to 20×9 m, each drill zone is wider and further from its neighbours, and the lanes are spaced further apart. The track is 18 m long, and the plaza and construction sites spread out. The ball crate moves to the middle of the plaza so ball runs to the far passing wall stay short. Decor that used to be hard-coded in the unlockable builders now reads its position from `AREA1.objects`. Rebalanced for the longer walks: coach 6.8 m/s, trainees 4.0, Ball Boy 3.8; Ball Boy $165, cooler $70. Old saves are snapped onto the new layout by the existing relayout path (piles follow the defs; agents re-path).
44. **Camera width** moves to `BALANCE.camera` and is chosen from screenshot sweeps (landscape 17/19/21/23 m, portrait 9.5–12.5 m). 21 m landscape and 11 m portrait show most of the pitch and plaza at once while the coach stays at about 12% of the viewport height (art bible target 9–12%). 23 m made the characters too small.
45. **Second Ball Boy** (playtest: one ball boy couldn't keep up). New pad `p_ballboy2` ($150, unlocks after the first hire), which adds staff `ball_boy_2`. A ball boy skips baskets another ball boy is already heading to or unloading at, and only falls back to a shared basket if nothing else needs balls, so the two split the work. Each has its own idle spot near the crate, and the second uses a different character model. Area 1 now has 21 stars.
46. **M2 Players.**
    - **Podium:** graduates queue at a podium in front of the clubhouse (one on top, three waiting in line). When the coach steps on the gold ring, a card panel offers SELL (to a fictional club) or PROMOTE (to the Academy Squad, max 5). If the squad is full, promoting sells the weakest player. If the line is full, the next graduate is auto-sold, so graduation never blocks training.
    - **Transfer value:** 55 × (OVR / 45)^2.2 × rarity, rounded to $5. Typical early values are about $55 for a common graduate and $110–165 for a rare one.
    - **Graduation bonus:** removed, because the sale replaces it. The Team Bench perk is now +25% transfer fees.
    - **Pure sim (`sim/match.ts`):** the match engine and the league. Outcomes are pre-rolled; only the Power Shot quality (0..1) shifts our chance by ±0.45, so results are deterministic and the economy bot can play matches instantly.
    - **League:** 5 divisions × 6 fictional academies, one round-robin season (5 rounds). Finishing 1st promotes you (happytime).
    - **Match Pitch:** a 5-a-side pitch on the south plaza ($100, after Cone Lane 2) with a kick-off ring. A match is available every 180 s.
    - **Squad on the pitch:** between matches, squad members do keepy-uppies on the Match Pitch.
    - **Cinematic:** a 3–5 chance highlight reel with choreographed runs and passes. The camera holds on the pitch (landscape) or follows the ball (portrait). The Power Shot meter takes Space, a click or a tap. Skip is available from the second match.
    - **Gameplay events:** the cinematic pauses the sim but keeps gameplay running. Results, podium, squad and league panels call gameplayStop. happytime fires on a record sale (not the first sale) and on promotion.
    - **Save v3:** adds the podium queue, squad, league, match timer and records. Old saves get defaults.
47. **M2 retune** (from a parameter sweep against the sim checks): Ball Boy $190 (pad moved off the crate walking route, because cash was draining into it), Match Pitch $100, Water Cooler $50, transfer base 55. Bot timeline: first sale ~1:30, first match ~2:20, first hire ~2:30. All §5.1 beats and the automation window pass.
48. **Matches are played away, reached by the Team Bus** (playtest request). The south plaza gets its decor back. The `match_pitch` unlock (ids unchanged, so saves keep it) is now the **Team Bus stop** by the gate ($85): the kick-off ring, a bench and a stop sign, with a blue team bus parked on the widened academy street. Squad members juggle at the stop between matches.
    - **The stadium:** its own island far east of the academy (x≈64–96) with an 18×9 m pitch, stands, floodlights, dugouts and a road. It is built once at load and frustum-culled, so it costs nothing while you are at the academy.
    - **The trip:** the bus pulls away (camera follows), a "Off to Sunday Park Stadium…" travel card covers the jump, the bus pulls up at the stadium, our team runs out of the door, and the match plays. After the results, a "Heading home…" card brings the camera back to the coach.
    - **Choreography:** scales with the pitch size. Skip also skips the trip.
    - **Sim:** unchanged apart from the kick-off position. Retuned the Team Bus to $85 because of the longer walk to the gate.
