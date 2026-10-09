# CrazyGames submission checklist (§18)

Status legend: [x] done & verified · [~] implemented, needs real-device/real-SDK verification · [ ] not yet (milestone noted)

- [x] SDK script in `<head>`; init awaited (2.5 s timeout → mock); `src/platform/*` is the only SDK consumer.
- [~] gameplayStart/gameplayStop/loadingStart/loadingStop match the event map; no double calls (unit-tested state machine); none on blur/focus. Real-SDK audit is M5.
- [~] muteAudio respected live (settings listener); audio resumes on gesture (pointerdown/touchend/keydown). Verify on iOS.
- [~] Data module is the save path (localStorage fallback); login reloads the save + toast. "Progress Save" must be selected in the submission form.
- [~] Works without the SDK (verified: CI has no access to sdk.crazygames.com) and with ads off. Rewarded/midgame are M5.
- [x] No fullscreen button, no Esc binding, no external links, no real IP, English complete (all strings in `en.json`).
- [x] Initial download ≤ 3 MB (≈ 235 KB transferred); relative paths; ≤ 1,500 files (7). Zip via `npm run zip`.
- [~] Time to gameplay ≤ 3 s (e2e: ~1–2 s locally). 800×450 @ DPR 1 readable (screenshot reviewed). 144 Hz identical (unit-tested loop). Safari / low tier ≥ 30 FPS: real-device test pending.
- [~] Mobile: touch joystick, portrait + landscape with live rotation (e2e), safe areas, long-press/zoom/pull-to-refresh suppressed. Pending: real iPhone + Android, CrazyGames app fullscreen, 30-min session, context-loss recovery on device.
- [ ] Covers 1920×1080, 800×1200, 800×800 + preview videos from capture mode (M7).
- [x] CREDITS.md with fonts and licences.
