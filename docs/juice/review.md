# Juice review guide

Part of the [juice plan](../juice-plan.md). This covers everything Tyler needs
for the one end-of-program review: where to play it, how to switch each item,
what to look for, the artifacts, and the choices I made that he should confirm.

Everything is on the local branch `polish/feel`, one commit per item. `main`
and production are untouched. Nothing is pushed or deployed to production.

## How to review

1. **Play the hosted private preview.** It uses production matchmaking and server bots, and is audible. The address and refresh command are under [Preview](#preview).
2. **Compare.** Add `?feel=off` to the address to see and hear the game exactly as it is in production today.
3. **Switch items one at a time.** Add `?feel=dev`, press Escape, choose Settings, then scroll to **Juice review**.
   - Each numbered item has an on/off box and its tuning values.
   - Changes save in this browser.
   - **Copy values** puts your tuned numbers on the clipboard, so you can paste them back to me.
   - Items marked "(reload)" change how rats are built, so reload after switching them.
4. **Settings for everyone.** Settings → Screen effects: **Camera shake** and **Flash strength**. Reduced interface motion also turns camera shake and the victory slow-motion off.
5. **Keep or cut.** For each item, tell me keep, tweak (with values) or cut. Each is one commit, so cutting is a clean revert.

For a quick look without playing, the **feel workshop** fires each effect on demand, using the real feel layer on the real city: `npx vite --config vite.visual.config.ts --port 5192`, then open `/feel-preview.html` (add `&mute=1` for silence).

## Preview

Private hosted fixture (production matchmaking, server bots, 10-rat cap, audible), serving this branch's client and Worker:

- **Play:** http://127.0.0.1:5193/?room=graybox-benchmark-match-polish-r1 on Veelox. Add `&feel=off` to compare, `&feel=dev` for the switches.
- **Fixture:** Worker `rat-detective-capacity-test`, version `fca0a23a-3fbd-4cdd-acbc-a4106844e563` (third batch, protocol 19, including the review fixes). It expires **6:37 PM PDT, 27 September**.
- **Deploy receipt:** `output/hosted-capacity-deployment-2026-09-27T21-37-46-887Z/deployment.json`.
- **Smoke-tested:** a scripted client joined through the relay: protocol 19, seed 341283204, 9 server bots plus the client, PAPER CHASE playing. In 15 s it saw 2 bot deaths, both headshots (`playerDied.headshot`), and respawns at 5 HP. A headless browser stayed connected for 20 s with no socket close.

**If the preview has expired**, build and redeploy, then start the relay again:

```sh
npm run build
node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=9 --cap=10
node scripts/preview-capacity.mjs --deployment=/absolute/path/to/new/deployment.json --port=5193 --room=graybox-benchmark-match-polish-r1
```

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

## Noir pass (second batch)

All eight pieces Tyler picked, at Bold strength. **Noir strength** is the slider at the top of the Juice review panel: 0 is today's city and 1 is extreme. Each piece has its own switch. Rats, cheese, cases, pickups and cameos are never changed.

| # | Piece | What to look for | Switch |
| --- | --- | --- | --- |
| N1 | Deeper shadows | The dark areas between lamp pools sink; pools and lit windows stay bright. | N1 Deeper shadows |
| N2 | Colour-drained city | Buildings, streets and props go cold grey-blue. Windows and lamps keep some warmth; rats pop. | N2 Colour-drained city |
| N3 | Rain and wet streets | Rain around you outdoors (none indoors or in the sewers), splashes, warm lamp reflections streaking across the street toward you, and a rain bed. | N3 Rain and wet streets |
| N4 | Haze | Light cones under the nearest streetlamps and a little more cold fog. | N4 Haze |
| N5 | Venetian-blind light | Warm striped window light on the landmark interior floors. | N5 Venetian-blind light |
| N6 | Film grain, vignette, letterbox | Grain (desktop only), darker corners, and letterbox bars during your death camera and the victory slow-motion. | N6 Film grain… |
| N7 | Neon accents | Red and teal neon (HOTEL, JAZZ, BAR, DINER…) on the landmark facades, buzzing now and then. The only saturated colour in the city. | N7 Neon accents |
| N8 | Searchlights and lightning | Beams sweeping over the landmark roofs, and every 30–70 s a double lightning flash that lights the sky, followed by distant thunder. | N8 Searchlights and lightning |

Workshop captures: `output/polish/20-noir/` (off / Bold / full), `21-rain/`, `22-atmos/` (haze, skyline, lightning), `23-dressing/` (neon, blinds).

**Noir performance** (full-lobby render fixture on the Halla AMD GPU with the whole juice city layer, `?noir=1`, feel off then on):
- Draw calls: 972 → 995 (+23).
- Triangles: +3.2%.
- Render CPU p95: 15.7 → 17.4 ms (+10.8%). That's at the edge of the 10% budget, with ±7% run-to-run noise.
- Frame p95: 33.4 ms in both runs. Halla's headless run is capped at 30 Hz, so the frame budget (≤16.9 ms) couldn't be checked here.
- Extra GPU fill (rain, haze and neon, which are additive) isn't captured by this CPU figure.
- Phones get fewer drops and no grain or colour filter.

**Noir choices to confirm:**
- **Fog (N4)** also thins distant rats slightly, because fog is scene-wide.
- **Lightning (N8)** briefly brightens the whole scene, including rats, through the existing hemisphere light.
- Neon signs and venetian blinds are on the four landmark buildings only.

## Third batch (T1–T5)

Tyler's third brain dump. T4 and T5 change the rules and the protocol (19), so the client and Worker must match.

| # | Item | How to see it in play | Switch |
| --- | --- | --- | --- |
| T1 | Instant, smooth entry | Load the page, reroll the name a few times, press Enter. Rerolls stay responsive while the city prepares, and Enter no longer freezes on a city-wide shader rebuild. | none (always on) |
| T2 | Noir scales with health | At full health the noir is a light hint. Each lost hit point thickens the shadows, colour drain, fog, grain and vignette. At 1 HP the case's outline, locator and guidance vanish, and Quick Fix kits glow green through walls. | T2 Noir by health, T2b Last hit point |
| T3 | Enemy readability | Far opponents get a faint cool moonlit edge (at most 1.5 px, half opacity) that fades in from 16 to 45 units; close rats have none. Rats ignore the noir fog, so distance and low HP don't swallow them. New noir nameplate: spaced small-caps name over five slanted HP pips that flash and drain when lost. | none (always on) |
| T4 | Five hit points; headshots kill | Body hits take 1 of 5 HP. Any headshot kills: the hat blasts off, cheese splats the head, the rat hangs for a beat before falling, the killer gets a brass ringed X, a HEADSHOT notice and callout, and the kill feed adds "· HEADSHOT". A knock-whistle-bell plays; other rats' headshots fade with distance. | T4 Headshot juice (presentation only; the rules are fixed) |
| T5 | Round end and police lineup | Rounds now end with 10 s before the next. As the slow motion ends, the camera cuts to a precinct lineup: the top five in rank order against a height chart, winner last. Flashbulbs pop one rat at a time and stamp each award across the chest; the winner gets a gold CASE CLOSED stamp and a hop. The Case File shrinks to the top-left corner and has seven new awards. | T5 Police lineup |

Workshop: **Headshot suspect 2 (T4)** and **Police lineup (T5)**. Captures: `output/polish/25-enemy/`, `27-headshot/`, `28-lineup/`, and the live lineup in `29-lineup-live/`.

**T1 measurements** (Halla AMD laptop GPU, private fixture through the relay; the relay adds a network hop):
- Enter to the first play frame: 2.1–2.4 s before, 0.7–1.2 s after.
- The worst freeze after Enter: about 1.4 s before, about 0.35 s after.
- The 300 ms target is **not** met on Halla. About 250–300 ms of what remains is the network round trip through the relay, and about 250 ms is building the other rats on the welcome. Unmeasured on Tyler's desktop.

**Third batch choices to confirm:**
- **Other damage (T4).** To keep instant kills instant, a Crossfire bank shot and a fast case missile now deal the full 5. A fast loose-case hit stays 2 and slower contacts 1, so those now take a smaller share of health.
- **Headshot hold (T4).** The rat hangs 0.16 s before the ragdoll launches; its hat flies off at once.
- **Warm-up (T1).** Rerolling or clicking on the title pauses the city preparation for 350 ms, so it never stutters under your input. Pressing Enter ends the pauses. An Enter during the final warm-up waits for it to finish (under a second on Halla).
- **Lineup rank (T5).** The server ranks by the assignment's own progress (deliveries, zone time, case kills, or case time in Closing Time), then kills, case time and fewest deaths. Rats without an award get "PERSON OF INTEREST".
- **Lineup light (T5).** The room is lit only by the stage's existing spotlight, moved there for the lineup, so no new light is added and nothing recompiles.
- **New awards (T5).** Sharpshooter needs 8 trigger pulls and counts one hit per pull; eruption and burst balls don't count. Legwork ignores respawn and launcher jumps.

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
- **Automated checks** (run on Halla):
  - Typecheck, build and visual build pass.
  - Client: 1,188 tests; 1,186 pass. The 2 failures are 5-second timeouts in `neighborhood.test.ts`; both tests pass when that file runs alone.
  - Scripts: all pass.
  - Worker: 171–173 of 175 pass. The failures are `persistentBots` "ten-rat cap", `matchmaking` "unreserved title connection" and `gameRoom` "full room". Unmodified `main` failed the same tests in the same full-suite runs on Halla, and all of them pass alone on both branches.
  - The frozen weapon/case trajectory tests (`locomotionPolish`, `ratActing`, `outfitStudio`, `gunSleeve`, `muzzlePose`, `caseCarry`) pass.
  - New tests: `cameraFeel` (restore exactness, frame-rate settling, bounds, reset) and `roundAwards` (Case File tallies and wire validation).
- **Third batch checks** (Halla, after the review fixes): typecheck and build pass. Client 1,192 of 1,193 pass; the one failure is the known `neighborhood.test.ts` full-suite timeout. Worker 173 of 175; the two failures are the known `persistentBots` "ten-rat cap" flakes, which pass alone. Scripts 123 of 123. New failure-mode tests in `roundAwards` (teleports, one hit per trigger, minimum shots, flights counted once, lineup order and wire validation).
- **Third batch review:** one independent reviewer found 9 issues: the Case File lost or doubled around the lineup, an Enter mid-warm-up stripping real rats, a welcome compile gate that could hang rendering, shared eyeshine resources freed by any enemy's disposal, the death camera fighting the lineup, full-volume distant headshots, burst balls inflating accuracy, a headshot hold overriding a shared corpse, and the ink outline fading after respawn. All fixed in `c7ef025`; a re-review confirmed each fix and found nothing new.
- **Independent review:** one reviewer read the full diff and found 11 material issues, all fixed. A re-review then confirmed the fixes and raised three follow-ups, also fixed: the corpse-follow window, the hat floor and the freeze baseline. The authority, protocol and aim invariants were confirmed intact.
- **Not verified:** nobody has played it, and sound character, timing and tuning are unjudged. That is the purpose of this review. There's no phone performance measurement.
