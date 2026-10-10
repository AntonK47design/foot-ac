# Kickoff Academy: Football Tycoon — working rules

3D idle-arcade football academy builder for CrazyGames (three.js + TS + Vite). Full spec: `docs/GDD.md`. **Look: `docs/ART_BIBLE.md` (overrides GDD §8 and the size budget).** Decisions log: `docs/DECISIONS.md`.

## Non-negotiables (§2)
- Gameplay ≤ 4 s desktop / ≤ 8 s mobile Fast 4G. No title screen/menu/Play button/splash. `gameplayStart()` on first controllable frame.
- Initial download ≤ 6 MB (fail > 10 MB); JS ≤ 400 KB brotli. Lazy-load everything not needed in the first 2 min (Area 1 assets load before gameplayStart).
- `base: './'`, relative paths, ≤ 1,500 files. No runtime network except the CrazyGames SDK script. Fonts bundled locally.
- No fullscreen button, external links, cross-promo, own ads, `alert/confirm/prompt`.
- Never bind Escape or browser shortcuts. Movement via `KeyboardEvent.code`. `preventDefault` on arrows/space.
- Fixed 60 Hz sim (accumulator, clamped delta) + interpolated render.
- Must work with adblock, without SDK, with ads disabled. No soft-locks, ever.
- Original IP only, PEGI-12. All strings in `src/data/locales/en.json`.
- Readable at 800×450 DPR 1; good at 1280×720, 1920×1080, 844×390, 390×844.

## Mobile (§9b)
- Portrait + landscape, live rotation, no state loss. `100dvh`, `visualViewport` resize, `env(safe-area-inset-*)` on all sides.
- Floating joystick where the first touch lands (dead zone 8 px, radius ~60 px scaled); extra fingers only press UI.
- Buttons ≥ 48 px, ≥ 8 px spacing; text ≥ 14 px (16 px body). No hover-only info.
- Suppress long-press, selection, zoom, pull-to-refresh. Haptics 10–25 ms (feature-detected, toggle).
- Mid tier default on mobile; Low when deviceMemory ≤ 4 / FPS watchdog; prefer locked 30 FPS over jitter.
- Handle WebGL context loss. Pause sim+render when hidden. Save on `visibilitychange:hidden` and `pagehide`.

## Budgets (§11)
Initial ≤ 6 MB (hard 10 MB) · JS ≤ 400 KB br · gameplayStart ≤ 4 s desktop / ≤ 8 s mobile · draw calls ≤ 150 · tris ≤ 400 k · Low ≥ 30 FPS with 30 characters · heap < 250 MB · DPR cap High 2 / Mid 1.5 / Low 1 · textures ≤ 1024 px.

## SDK (§6)
- Only `src/platform/*` touches `window.CrazyGames`. Every call in try/catch. Fallback: `MockPlatform`.
- `gameplayStart/Stop` is an idempotent state machine in the wrapper. Never call on blur/focus.
- Blocking panels → `gameplayStop()` + sim paused; close → `gameplayStart()`.
- `settings.muteAudio` overrides all audio. Auth change → reload save + toast.
- `happytime()` only for: first Epic/Wonderkid, record transfer, promotion, cup win.
- Ads behind `VITE_ADS=off|on` (off for Basic Launch); `adsDisabledBasicLaunch` → ads off for session.

## Commands (§15)
- `npm run dev` / `build` / `preview` · `npm run dev:lan` (LAN URL + QR)
- `npm run check` (tsc + eslint) · `npm run test` (vitest) · `npm run sim` (economy bot)
- `npm run size` (initial bytes, fails over budget) · `npm run e2e` (Playwright) · `npm run zip`
- Run check, test, sim, size, e2e before every commit.

## Code conventions
- TypeScript strict, no `any`. ESM. 2-space indent, single quotes, semicolons.
- `src/sim/**` is pure TS: **no three.js / DOM imports**. View subscribes to sim events.
- Content is data in `src/data/`; all tunables in `src/data/balance.ts` (no magic numbers in systems).
- Time via `core/clock.ts`, randomness via `core/rng.ts` (seeded).
- Hot paths: no per-frame allocations; use pools; reuse vectors.
- Art: CC0 packs in `assets-src/` (with licences) → `tools/assets.ts` (prune/dedupe/weld/meshopt, WebP ≤ 512 px) → `public/assets/*.glb` + manifest; load with GLTFLoader + MeshoptDecoder.
- Never ship primitive placeholders; if an asset is missing, stop and ask. No real clubs/brands on posters, banners, kits.
- `?showcase` / debug code never ships in prod builds.
- UI is DOM/CSS overlay; scale with `clamp()`; text via `t()` from `core/i18n.ts`.
- Log design decisions in `docs/DECISIONS.md`.
