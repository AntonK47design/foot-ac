# CrazyGames SDK: localhost checklist (M5)

The CI container can't reach `sdk.crazygames.com`. There, `tests/e2e/sdk.spec.ts` checks the event map against a recording stand-in for the SDK. This checklist covers the real SDK, which needs a run on your machine.

## Run

```bash
VITE_TEST_HOOKS=1 npm run build && npm run preview               # http://localhost:4173/?debug=1 (SDK runs in "local" mode on localhost)
VITE_TEST_HOOKS=1 VITE_ADS=on npm run build && npm run preview   # same, with ad placements enabled
```

`VITE_TEST_HOOKS=1` keeps the `?debug=1` overlay in the build. It shows the platform log (every SDK call, in order). Never ship a build made with it.

## Boot

- [ ] The log shows `sdk ready (local)`, not `→ mock`.
- [ ] Order: `loadingStart` → `loadingStop` → `gameplayStart` within ~2 s. There is no title screen.
- [ ] With an adblocker on (and the SDK script blocked), the game still boots, on the mock (`sdk script missing → mock`).

## Gameplay state machine

- [ ] Opening Settings, the Office computer, Squad, League, Quests, Scouting, Daily or Hall of Fame logs `gameplayStop`. Closing it logs `gameplayStart`.
- [ ] A match (bus trip + highlights) does **not** stop gameplay. The results panel does.
- [ ] Switching tabs, alt-tab and blur/focus produce **no** gameplay calls. There are never two `gameplayStart` (or two `gameplayStop`) in a row.
- [ ] Returning player (play, wait 3+ min with a Ball Boy hired, reload): the Welcome-back panel shows first, and `gameplayStart` comes only after **Collect**.

## Platform signals

- [ ] `happytime` fires only for: the first Epic/Wonderkid signed, a record transfer, a division promotion and a Daily Cup win.
- [ ] `completion N` rises with unlocks and never goes down.
- [ ] `setGameContext` carries `area, academyLevel, saveVersion, build`.
- [ ] Toggling the platform mute (`muteAudio`) silences sound and music whatever the in-game toggles say.

## Data / account

- [ ] Progress survives a reload (saved through `SDK.data`).
- [ ] Log in from the account prompt (5+ min of play and 70% of the stars). The account's progress loads and the toast "Progress loaded from your account" appears.

## Ads (`VITE_ADS=on` build only)

- [ ] With `VITE_ADS=off` (Basic Launch build) no ad button appears anywhere and the log has no `requestAd`.
- [ ] Rewarded buttons have a ▶ icon and state the reward:
  - Welcome back (×2 offline cash)
  - Daily (Claim ×2)
  - Office (Get $X when short on cash)
  - Results (×2 prize)
  - Scouting (Finish now, missions ≤ 30 min)
- [ ] During an ad the game is paused and silent. The reward lands only after the ad finishes.
- [ ] Results ×2 used → no midgame when closing results. Midgame never after the very first match or before 5 min of play.
- [ ] With an adblocker: no rewarded buttons, just a small grey note in the panel. No popups.
- [ ] An `adsDisabledBasicLaunch` error removes the buttons for the session, with no toast.
