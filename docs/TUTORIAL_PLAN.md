# Tutorial plan from Playgama telemetry (2026-10-17 → 2026-11-16)

> **Status:** sections 1 and 4 still apply. What was built is a simpler version of sections 2–3: one straight line
> through Sunday Park to the first match and the Ball Boy, with no upgrade changes (DECISIONS §86).

Source: Playgama Developer Console telemetry for *Kickoff Academy: Football Tycoon*: 1,087 sessions, 653 users,
the `tut_*` step events (with `sec` = sim time), `minute_*` marks, and a sample of 25 session timelines (Nov 1–16).

## 1. What the data says

### Funnel: new players (unique users, % of those who finished step 1)

| Step | Users | % | Median time | What it is |
|---|---:|---:|---:|---|
| `tut_cash` | 520 | 100 % | 4 s | grab starter cash |
| `tut_crate` | 498 | 96 % | ~10 s | buy ball crate (10) |
| `tut_goal` | 476 | 92 % | 18 s | buy shooting goal (20) |
| `tut_sign` / `grab` / `bring` | 456 | 88 % | 36 s | sign Leo, carry balls |
| `tut_fees` | 445 | 86 % | 44 s | collect training fees |
| `tut_cones` | 431 | **83 %** | **57 s** | buy dribble cones (20); **the guided route ends here** |
| `tut_graduate` | 289 | **56 %** | **220 s** | first sale/promotion at the office |
| `tut_upgrade` | 224 | 43 % | 425 s | first office upgrade (cheapest is 550) |
| `tut_match` | 225 | 43 % | 469 s | first match |
| `tut_safe` | 218 | 42 % | — | first safe pickup |
| `tut_gate` | 187 | 36 % | 621 s | Training Ground opened (1,900) |
| `tut_bottles` | 184 | 35 % | — | Area 2 loop learned |
| `tut_gate3` | 116 | 22 % | 1,780 s | Youth Stadium opened |

Session length: median **4.6 min**, mean 31 min (a long tail of idle and offline players).
`minute_1` 470 → `minute_3` 345 (−27 %) → `minute_5` 296 → `minute_10` 219 → `minute_15` 172 users.

### Findings

1. **The first minute works.** 83 % of starters finish the scripted route at ~1 min, losing about 4 % per step.
   No change is needed there.
2. **The biggest leak is the dead zone between 1:00 and 3:40.** A third of the players who finish the route (142 of 431, or 27 % of all starters) drop
   between `tut_cones` and `tut_graduate`. That lines up with the `minute_1 → minute_3` drop. In the 25 sampled
   sessions, **7 quit 10–130 s after `tut_cones`**. In this window:
   - the route has ended, so the pill and arrow **hide** (`guide.ts` → `hidden`). They come back only after
     8 s of standing still or 20 s with no progress;
   - the payoff (Leo graduating) takes ~2.5 min more (`gradOvrGain: 4` with fees and reps), and nothing tells
     the player it is coming;
   - one sampled session saw `first_graduation` and quit before the office step, because the step is `optional`
     and only appears after the graduate already exists.
3. **The second leak: the next hooks arrive too late.** The first upgrade comes at a median of 7 min, because the
   cheapest upgrade costs 550 while the early pads cost 10–85. The first match comes at ~8 min. Both
   are strong "the game opens up" moments, and the players who reach them go on to `minute_10` and beyond.
   Today 57 % of starters never see them.
4. **Area 2 → Area 3 is a 20-minute gap with −38 %** (`gate` 187 → `gate3` 116). These are committed players, so
   it is a mid-game pacing problem, not a tutorial one. It is noted here and out of scope.
5. **Before the tutorial:** `core_initialization_started` 1,080 sessions → `first_frame` 971 (**−10 % at load**).
   `first_frame` p50 is 3.9 s, but p90 is 9.4 s, over the 8 s mobile budget. This conversion loss comes before the
   tutorial even starts.

## 2. Optimal tutorial: "never without a next goal" for the first 10 minutes

Principle: keep minute 0–1 as it is. Then **chain short, always-visible goals, each paying off in ≤ 45 s**, and pull the
three big hooks (first graduate, first upgrade, first match) **inside the first 5 minutes**, each one teased before
it lands.

| Phase | Time target | Steps (new ones in **bold**) | Purpose |
|---|---|---|---|
| A. Core loop | 0:00–1:00 | cash → crate → goal → sign → grab/bring → fees → cones (unchanged) | learn move, buy, carry, collect |
| B. First star | 1:00–2:15 | **`leo_progress`**: pill "Leo is training: 2/4 ★ to go pro" with a progress bar on Leo · **`wall`** (50) or **`bench`** (45) as the next buy · **`graduate`** becomes a **required** step and starts the moment Leo graduates | fills the dead zone with a visible countdown to the payoff |
| C. Big payoff | 2:15–3:00 | **`podium`**: guided sell-vs-promote choice at the office, with an explainer card · the sale pays enough for the next step | first "my player" moment (also the first `happytime` candidate if Epic) |
| D. Grow | 3:00–4:30 | **`first_upgrade`**: a tutorial-priced upgrade (see changes) right after the sale, arrow to the office · **`cones_l2` → `match_pitch`** chained | shows the second progression axis early |
| E. Spectacle | 4:30–5:30 | **`match`** becomes a required step once the pitch is built: guided kickoff | variety spike before the minute-5 drop |
| F. Long goal | 5:30–10:00 | `safe` · **`gate_goal`**: permanent HUD tracker "Training Ground 640 / 1,900" with the arrow to the best next pad, then `gate` → water → gym → bottles (unchanged) | gives the session a destination |

Steps that must not wait for an `optional` moment are made **required** with a `ready` that holds the route, so the
route never ends (and the guide never hides) before `tut_gate`.

## 3. Concrete changes (all tunables in `balance.ts`)

1. **Guide never hides during onboarding** (`guide.ts`): while `!flags['tut:gate']`, fall back to `lost` mode immediately
   (`computeObjective`) instead of `hidden`. After that keep today's behaviour, but use `lostIdleSec 8 → 5` and
   `lostNoProgressSec 20 → 12` until level 4.
2. **Faster first graduate:** add `trainee.firstGradOvrGain: 2` (only for the first signed trainee, Leo). Expected
   first graduate at ~1:45 instead of ~3:40.
3. **Leo progress pill** (`tutorial.ts` new step `leo_progress`, string `tut.leo_progress`: "Leo: {n}/{total} to go pro"):
   it is the active objective whenever no pad is affordable, and its arrow points to the drill that is short of balls.
4. **`graduate` is no longer optional:** it stays in the route with `ready: podiumGraduate()`. Until then
   `leo_progress` shows.
5. **First upgrade cheaper:** add `upgrades.firstPurchaseDiscount: 0.25`, which puts the first `coach_sign` or
   `coach_speed` at ~140–150. Players reach that within ~30 s of the first sale (`transfer.base 55`, ×OVR). The
   `upgrade` intro then fires at ~3:30 instead of ~7:00.
6. **Match pulled in:** shorten the path to the pitch by changing `p_match.requires` from `['p_cones_l2']` to
   `['p_cones']`, with the route ordering `wall → match pitch`. Make `match` a required step after the pitch is built.
7. **Gate tracker:** once `match` is done, show a persistent HUD goal "Training Ground: {cash}/{cost}". The
   lost-mode arrow keeps choosing the best next pad.
8. **Don't break the first matches with ads:** keep `midgameMinPlaySec: 300` and skip the first match break (already
   the case). With the match now at ~5 min, also skip the second break, so the first interstitial lands at ≥ 8 min.

## 4. Targets and how to measure them

New `tut_*` events come for free (each step is emitted). Add `tut_leo_progress` and `tut_podium` and compare
the same 14-day windows before and after:

| Metric | Now | Target |
|---|---:|---:|
| `tut_cones` → `tut_graduate` | 67 % | ≥ 85 % |
| starters reaching `tut_match` | 43 % | ≥ 60 % |
| median `tut_match` time | 469 s | ≤ 330 s |
| `minute_3` / `minute_1` users | 73 % | ≥ 85 % |
| `minute_10` / `minute_1` users | 47 % | ≥ 55 % |
| median session | 4.6 min | ≥ 7 min |
| init → `first_frame` | 90 % | ≥ 95 % (separate loading work) |

Run `npm run sim` after the balance edits: the economy bot must still reach the gate at roughly the same total time
(the discount and the earlier pitch add ~150 of value, which is small next to the 1,900 gate).
