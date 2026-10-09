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
