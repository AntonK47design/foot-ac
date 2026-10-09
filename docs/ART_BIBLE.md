# Wonderkid Academy — Art Bible

Source of truth for how the game looks. Overrides GDD §8 where they conflict.
Reference frames: `docs/art/reference/` (principles only — never copy assets, layout or UI).

## 1. Principles (from the reference)

1. **Fill the frame.** ≥ 65 % of every gameplay frame is walls, furniture, NPCs and world UI. Empty floor ≤ 35 %.
2. **Value ladder** (darkest → brightest): void → floors → walls → interactables & characters → UI.
3. **Enclosure.** Every activity lives in a *space* with its own floor and edges: rooms with cutaway walls, fenced drill zones, a raised plot with a curb.
4. **Scale & closeness.** Characters are big (9–12 % of viewport height), faces readable, strong perspective.
5. **World UI tells you what to do.** Pads show price + icon + ghost of the object. Stations show supply counters. NPCs show request bubbles.
6. **Squint test.** Blur a grayscale screenshot: coach, pads and stations must still pop first.

## 2. Palette

| Layer | Role | Values |
|---|---|---|
| Void | background around the plot | `#241E33` base, vignette to `#17121F` |
| Plot curb | edge of the academy island | top `#E9DFC8`, side `#B7A88A`, shadow side `#5A4C66` |
| Outdoor ground (plot) | paths / plaza | warm paving `#E8D7B0` / `#DCC89C` (checker tiles 1 m) |
| Pitch turf | training pitch | stripes `#4FBF4A` / `#45B041`, lines `#FFFFFF` |
| Drill surfaces | dribble strip | astro turf `#2E9E5B` with dot pattern `#38B068` |
| | sprint track | tartan `#D9503A`, lane lines `#F6E7D8` |
| | passing zone | wooden deck `#C98B4F` / `#B87A42` |
| Clubhouse floors | Reception | teal tiles `#5FC7C2` / `#4FB5B0` |
| | Changing room | blue rubber `#4E7FD9` with dots `#6A95E6` |
| Walls | interior | `#F3EEE6`, top trim `#2F6BFF`, skirting `#1F3F99` |
| | exterior side | `#D9D1C4` |
| Academy colours | kits, banners, flags | blue `#2F6BFF`, yellow `#FFD23F`, white |
| Interactables | most saturated | goal frame white, cones `#FF7A2E`, cash `#3DDC84`, stars `#FFC83D` |
| Blueprint ghost | locked expansions, pad ghosts | `#5AB4FF` @ 35 % opacity, edges `#BFE3FF` |
| Rarity | ring + badge | common `#A7B0BE`, rare `#3D8BFF`, epic `#A35CFF`, wonderkid animated gold `#FFC83D` |
| UI | panels / pills | fill white or saturated; outline `#1D2433` 3–4 px; text white with dark stroke |

No mid-value green-on-green: green surfaces are always framed by a light curb, fence or line.

## 3. Area 1 layout — "Sunday Park" diorama (~26 × 18 m)

```
 north (top of screen)
 ┌──────────────────────────────────────────────┐
 │ void + city silhouettes (dark)                │
 │  ┌────── TRAINING PITCH (fenced) ─────────┐   │
 │  │ shooting lane │ dribble strip │ pass   │   │
 │  │ (goal + net)  │ (astro, cones)│ boards │   │
 │  └───────────────────────────────────────┘   │
 │  sprint track (tartan, hurdles) along pitch  │
 │ ┌ CLUBHOUSE (cutaway) ┐  plaza   bus gate ─▶ │
 │ │ Reception │ Changing │ crate, ball racks    │
 │ └───────────┴──────────┘  benches, flags      │
 └──────────────────── curb ─────────────────────┘
```

- **Plot**: raised 0.25 m with a light curb on all sides; outside is the dark void (+ distant silhouettes, blueprint ghosts of locked areas).
- **Clubhouse**: back walls 2.4 m, side walls full height, front walls 0.3 m stubs, doorways 1.6 m. Rooms: Reception (desk, waiting **benches**, trophy cabinet, posters of fictional clubs), Changing Room (lockers, benches, kit hooks). Later: Office, Physio.
- **Training pitch**: half-size, mowing stripes, crisp lines, low fence with academy-colour boards; each drill on its own surface.
- **Locked expansions**: translucent blue blueprint ghosts behind construction fences with padlock + price sign.
- **No mud blobs.** Ever.

### Prop list per zone (≥ 15 distinct props visible in any frame)

| Zone | Props |
|---|---|
| Reception | sign-up desk + monitor, waiting benches, trophy cabinet, framed posters (fictional clubs), plant, bin, rug, water cooler |
| Changing room | lockers, benches, kit hooks with shirts, towel stack, bin, rubber floor |
| Shooting lane | goal with net mesh + post caps + base weights, penalty spot, ball cart, free-kick mannequins, pop-up goal |
| Dribble strip | cone slalom (2-tone cones), poles with bases, agility ladder, cone stacks |
| Passing zone | wooden rebound boards (2-tone), target rings, ball rack |
| Sprint track | tartan lanes, start/finish lines, hurdles, stopwatch stand |
| Plaza / edges | floodlights, academy flags & banners, dugout bench, scoreboard, tactics board, bins, plants, benches, bus stop, fence |

## 4. Characters

- **Source**: rigged CC0 chibi characters (Kenney Mini Characters preferred) with shared AnimationClips; `SkeletonUtils.clone` per instance.
- **Animations**: idle, walk, run, carry (arms forward), sit, cheer, kick (library or procedural lower-body layer).
- **Roles at a glance**: coach = tracksuit + cap + whistle; trainees = academy kit (palette swap) with number on the back, varied hair/skin; staff = orange bibs.
- **Rarity**: coloured ring under the feet + OVR badge above the head.
- **Scale**: 9–12 % of viewport height at the gameplay camera; faces visible.
- **Perf**: ≤ 40 on screen; animation update at 15–30 Hz when off-screen/far; VAT bake if Low can't hold 30 FPS.
- **Rim light**: subtle (fresnel add in the character material).

## 5. Camera

| | Value |
|---|---|
| FOV | 48° (vertical) |
| Pitch | 52° |
| Landscape | ~17 m world width visible |
| Portrait | ~10.5 m world width visible |
| Follow | smooth, slight look-ahead; zoom out only when the playable area grows |

## 6. Materials & lighting

- Toon/Lambert materials; KayKit palette texture for kit props; 64–128 px tiling pattern textures for floors (tiles, stripes, rubber dots, wood planks).
- Baked vertex AO: darken wall bases, under furniture, plot curb.
- Sun: warm, short soft shadows on Mid/High; blob shadows on Low.
- Hemisphere fill tinted towards the void colour for cohesion.
- No post-processing.

## 7. World UI

- **Unlock pad**: rounded-square floor tile, white dashed border; big price (cash icon + number, bold white with dark outline); item icon; translucent blue hologram ghost of the object hovering above; fill animates while paying; on completion the ghost turns solid with squash-and-stretch + dust ring + confetti.
- **Stations**: supply chips "3/8 ⚽". **Trainees**: request bubbles (icon + emoji mood), compact OVR badge. **Cash**: "+$" floaters.

## 8. HUD

- Bold rounded display font, dark stroke + drop shadow; 3–4 px dark outlines; saturated fills.
- Cash pill ~1.4× previous; big star overlapping the progress bar; coach portrait (rendered) with level ring.
- Objective pill shows a real rendered icon of the target (icon atlas rendered from the 3D models at load).
- Everything bounces on change; cash counter rolls.

## 9. Do / Don't

| Do | Don't |
|---|---|
| Bevels, 2–3 tone accents, detail parts (caps, weights, net mesh) | Raw cylinders/boxes/capsules |
| Every zone has its own floor and an edge | Objects floating on open grass |
| Dark void around a bright plot | Green-on-green mid values |
| Fictional clubs, academy colours | Real clubs, logos, sponsors, kit designs |
| Football-themed furniture (benches, lockers, trophies) | Generic "chairs" |
| Pack assets via `tools/assets.ts` (meshopt, WebP ≤ 512 px) | Raw glTF in `public/` |

## 10. Budgets (overrides GDD §11 for size/time)

Initial download ≤ 6 MB (hard cap 10 MB) · gameplayStart ≤ 4 s desktop / ≤ 8 s mobile Fast 4G · draw calls ≤ 150 · triangles ≤ 400 k · Low tier ≥ 30 FPS with 30 characters.
