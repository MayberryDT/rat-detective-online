# Polish review guide

Part of the [polish plan](../polish-plan.md). This covers everything Tyler needs
for the one end-of-program review: where to play it, how to switch each item,
what to look for, the artifacts, and the choices I made that he should confirm.

Everything is on the local branch `polish/feel`, one commit per item. `main`
and production are untouched. Nothing is pushed or deployed to production.

## How to review

1. **Play the hosted private preview.** It uses production matchmaking and server bots, and is audible. The address and refresh command are under [Preview](#preview).
2. **Compare.** Add `?feel=off` to the address to see and hear the game exactly as it is in production today.
3. **Switch items one at a time.** Add `?feel=dev`, press Escape, choose Settings, then scroll to **Feel review**.
   - Each numbered item has an on/off box and its tuning values.
   - Changes save in this browser.
   - **Copy values** puts your tuned numbers on the clipboard, so you can paste them back to me.
   - Items marked "(reload)" change how rats are built, so reload after switching them.
4. **Settings for everyone.** Settings → Screen effects: **Camera shake** and **Flash strength**. Reduced interface motion also turns camera shake and the victory slow-motion off.
5. **Keep or cut.** For each item, tell me keep, tweak (with values) or cut. Each is one commit, so cutting is a clean revert.

For a quick look without playing, the **feel workshop** fires each effect on demand, using the real feel layer on the real city: `npx vite --config vite.visual.config.ts --port 5192`, then open `/feel-preview.html` (add `&mute=1` for silence).

## What each item does and how to see it

| # | Item | How to see it in play | Switch |
| --- | --- | --- | --- |
| 1 | Shot kick | Fire. The view nudges up and settles. Stronger in Scattershot and Popcorn Panic. | 1 Shot kick |
| 2 | Hit jolt | Get hit. The view shoves away from the shooter. | 2 Hit jolt |
| 3 | Damage direction and edge flash | Get hit. A red edge flash appears, with an arrow that keeps pointing at the attacker for about 1 s. | 3 Damage direction… |
| 4 | Impact freeze | Hit someone. Their model holds for about 55 ms. Your own view never freezes. | 4 Impact freeze |
| 5 | Bigger dripping splats | Shoot walls. Splats are bigger, last 6 s and drip down. | 5 Bigger dripping splats |
| 6 | Cheese stains | Hit a rat several times. Stains build up on its coat and clear on respawn. | 6 Cheese stains |
| 7 | Ironclad sparks | Shoot a rat wearing Ironclad. A silver spark burst joins the existing clang. | 7 Ironclad sparks |
| 8 | Kill bloom and punch-in | Get a kill. A ring bursts around the crosshair and the view briefly zooms in. | 8 Kill bloom… |
| 9 | Comic words | Two kills within 4 s (DOUBLE CHEESE!), a kill while flying (AIR MAIL!), a hit during Big Cheese (KER-CHEESE!). | 9 Comic words |
| 10 | Noir low health | At 2 HP the colour drains; at 1 HP it's nearly black and white, muffled, with a heartbeat. Quick Fix floods the colour back. | 10 Noir low health |
| 11a/b | Hat knock and pop-off | Hits knock the fedora askew, then it settles. On death it pops off and tumbles. | 11a, 11b |
| 12 | Death variety | Shot kills spin, explosive-incident kills fling, neutral traps flop. This changes body/head/hat motion only. | 12 Death variety |
| 13 | Death camera and iris | Die. The view turns to follow your body, then a noir iris closes on it. | 13 Death camera… |
| 14 | Model touch-ups | Whiskers, brows, slightly rounder cheeks, a rolled brim edge, shoes, pupils that follow aim and turns, and a blink on hits. | 14 (reload), 14b Shoes (reload) |
| 15 | Animation pass | Jump and land (squash and stretch). Brake hard (skid lean). Carry the case (hunch and glances). Launch (coat flare, flat ears). Kill (nod). Pick up items (puff, bounce, breath). | 15 Animation pass |
| 16 | Movement | Hard landing: view dip and dust. Launcher: the view widens and wind rushes. Hot Pursuit: speed streaks and a wider view. | 16 Movement |
| 17 | Sound | Footsteps (pavement, sewer water, catwalk metal, roof wood), coat swish, case rattle, cheese squelch, near-miss whizz, kill brass stab, stings (case pickup, your delivery, last 10 s), sewer echo, muffled interiors. | 17 Sound |
| 18 | City reacts | Pigeons scatter from shots and passing rats, newspapers kick up, trash cans tip, the manhole steams, hit lamp bulbs stutter. Props return after 25 s. | 18 City reacts |
| 19 | Rewards | Your ranking row punches when you score. Callouts: ON THE CASE, COLD CASE (killing the carrier), RAT RACKET (3 kills in one life). The winning moment plays in slow motion for 1.4 s before the victory card, which now carries a **Case File**. | 19 Rewards |

## Choices to confirm

These are places where I had to make a call. Each can be changed.

- **Lamps and neon (18).** The accepted rule says authored lamps and baked lighting stay steady, and lamp poles and signs are merged static geometry. So a hit lamp shows a stuttering glow at the bulb instead of swaying or flickering its real light, and signs don't react.
- **Hem sway (14).** No separate hem sway was added. The existing hem-to-hem sway stays, and the coat flares during launcher flight (15).
- **Eye tracking (14).** Pupils follow your aim and turns. They do not look toward nearby threats.
- **Death variety (12).** Server corpse physics is unchanged, because corpses are gameplay objects. Only the rat's secondary motion changes by cause.
- **Case File tallies (19).** Counted on the server, in memory only. If the room restarts mid-round they start again. They never affect scoring. The awards are Top Gun, Most Cheesed (damage taken), Butterfingers (case drops), Sewer Dweller (seconds underground) and High Flier (highest altitude). Each has a minimum before it shows.
- **Sound (17).** All new cues are synthesized in the browser, so no new sound files were added. Footsteps are quiet, and footsteps from other rats only play within 14 units.
- **Victory (19).** The victory card now appears 1.4 s after the win so the slow-motion moment is visible. With Reduced interface motion on, it appears immediately.
- **Model extras (14).** They reuse the rat's existing materials: whiskers use the eye white, brows and shoes the pupil black, and the brim edge the hat felt. This keeps each batched rat to one draw call.

## Artifacts (local, `output/polish/`)

| Artifact | What it shows |
| --- | --- |
| `14-model/sheet.png`, `closeup.png` | Model before and after: front, three-quarter, side, rear, close-ups |
| `15-anim/closeup.png` | Sneaky case carry |
| `03-damage/`, `05-splats/`, `07-sparks/`, `08-kill/`, `09-words/`, `10-noir/`, `11-hat/`, `13-deathcam/`, `16-movement/`, `18-city/`, `19-rewards/` | Workshop captures for each item |
| `17-sound/cues.wav` | Every new sound cue in order, rendered offline for listening (10.4 s) |
| `perf/baseline-F3.json`, `perf/final-halla.json` | Performance runs with feel off and on |

## Verification

- **Performance** (full-lobby render fixture, 12 batched rats and 256 balls, feel off then on, Halla AMD GPU):
  - Draw calls: 972 in both.
  - Triangles: +2.1%.
  - Render CPU p95: 16.3 → 17.2 ms (+5.5%, inside the 10% budget and ±7% noise).
  - Frame time on Halla varied between 30 and 60 Hz across runs, so it isn't a usable comparison.
  - The fixture doesn't include the screen overlays, dust or city props. Those add about six small instanced draws in the game.
- **Automated checks:** results of the final run are in the plan's evidence section.
- **Not verified:** nobody has played it, and sound character, timing and tuning are unjudged. That is the purpose of this review. There's no phone performance measurement.
