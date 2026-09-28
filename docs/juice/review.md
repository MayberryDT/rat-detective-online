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

- **Play:** http://127.0.0.1:5193/?room=graybox-benchmark-match-ui-dispatch-r2 on Veelox. Add `&feel=off` to compare, `&feel=dev` for the switches.
- **Fixture:** Worker `rat-detective-capacity-test`, version `4d36bfa7-ee64-4a2d-b155-a0f01603ccdc` (seventh batch plus the evidence-wall title, Carbon scrawl HUD and 5 s + 10 s round end; protocol 22, client `index-2N0BOxl9.js`). It expires about **6:00 PM PDT, 28 September**.
- **Deploy receipt:** `output/hosted-capacity-deployment-2026-09-28T22-01-35-121Z/deployment.json`.
- **Smoke-tested:** a scripted client joined through the relay: protocol 22, seed 341283204, 9 server bots plus the client; within seconds it saw a bot's Dispatch call on the wire (`caller` set, Blackout active, then cooldown). The scripted client acknowledges every frame and gets disconnected after 5–30 s (relay backpressure or the room's inbound budget); that is the throwaway client, not the game client.

**If the preview has expired**, build and redeploy, then start the relay again:

```sh
npm run build
node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=9 --cap=10
node scripts/preview-capacity.mjs --deployment=/absolute/path/to/new/deployment.json --port=5193 --room=graybox-benchmark-match-ui-dispatch-r2
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

## Fourth batch (protocol 20)

What changed and how to see it is in the [juice plan](../juice-plan.md#fourth-batch-the-hunch-pickups-and-incidents-agreed-2026-09-27-released-2026-09-28). Incidents still come from shooting a Dispatch box: 13 are in rotation (never the same twice in a row), each active for 25 s with a 16 s cooldown. Pinning one incident only works on a local development server, not on the hosted preview.

| Item | What to look for | Switch |
|---|---|---|
| The Hunch | At full health, rats behind walls within 40 units appear as a boiling pencil sketch with a faint tail. Making someone: shutter, photo corners, `MADE: NAME`. Being made: YOU'VE BEEN MADE, violin sting, an eye on the screen edge. | H The Hunch (always on); H2 Made moments |
| Supplies | 14 sites, each with a reason (see the plan). Iron trench coat on a dummy, doctor's bag, red wingtips, each under a work lamp; the lamp stutters out on a claim; claim cards get a stamp. | none |
| Bad Ammunition | Jams (CLICK.), harmless duds (PFFT.), coughing shots with smoke, backfire soot, wobbling balls. | I2 Bad Ammunition juice |
| Blackout | The city goes dark; lightning and nearby shots light it for a beat. | I3 Blackout (tuning only) |
| Clean Bill / Malpractice / Most Wanted / Rat Race / All Units | Heal-all plus city-wide Hunch; hopping, sometimes exploding kits; searchlight and bounty on the leader; everyone hustles with faster cheese; respawns beside the case or zone. | none |

## Fifth batch: launchers, ragdolls and the living model (protocol 21)

What changed is in the [juice plan](../juice-plan.md#fifth-batch-launchers-ragdolls-and-the-living-model-agreed-2026-09-28). Workshop buttons in `feel-preview.html` (prefixed L5–L7, R, M1) show each piece without a match.

| Item | What to look for | Switch |
|---|---|---|
| L1 Launch profiles | No two throws alike: the wind tunnel goes tallest and straightest, the rat trap and freight ram throw far and flat, the geyser and dumpster go wild. You drift unless you steer against it. About one in seven is an OVERPRESSURE misfire: higher, sparks, smoke, a shriek. | none (gameplay) |
| L2 The tell | 0.2 s between the trigger hit and the throw: the machine shudders, squashes down, the cap flashes fast and a whine rises. | none (gameplay) |
| L3 Everything flies | Bodies, cheese and counterfeit cases on a pad get thrown too. A counterfeit re-plants itself wherever it lands and is still a trap. | none (gameplay) |
| L4 Landings | Coming down from a throw shoves everyone within 7 units away; landing right on a rat does 1 damage (your credit). Landing on another machine's pad fires it. | none (gameplay) |
| L5 Launch moment | Each machine spits its own debris and has its own voice; a dust ring; hats blow off rats near the pad; your own launch kicks the view. | L5 Launch moment |
| L6 Flight | Screams, flailing legs and ears, a whipping tail, contrails behind every launched rat, speed streaks, a floaty beat at the top. | L6 Flight |
| L7 Landing | Cracked-pavement crater, dust, THUD or KA-THUD, shake nearby. A thrown case whistles like a falling bomb and bursts paperwork where it lands. | L7 Landing |
| R Ragdoll | Dead rats flop: head, ears, arm, shoes and whiskers swing on springs from the body's motion, then splay out at rest with X eyes and a tongue. Headshots snap the head back; explosions fling limbs wide; a rat killed mid-launch flails all the way down. The popped hat rolls away on its brim. Shooting a body jolts its limbs with a squeak. Bodies now pile on each other. | R Ragdoll limbs |
| M1 Face | Ears and whiskers bounce on jumps and landings; wide eyes and an open-mouth scream on a launch; a gasp when a ball whizzes past your head. | M1 Face |
| M2 Body springs | The tail swings out behind turns, the hat rocks with each step, and the head flinches away from a hit. | M2 Body springs |
| M3 Extras | Every rat wears one extra picked from its name: a cigarette, a detective's star or a scarf in its hat colour. | M3 Personality extras (reload) |

**Calls I made (tell me if any is wrong):**
- The tell delays every throw by 0.2 s, including Pressure Surge pulses.
- Drift fades by about a quarter per second and stops when you land; bots drift too but keep steering to their roof routes.
- Landing on your own machine's pad does not fire it again (the wind tunnel would bounce you forever).
- Squash damage is 1, the same as a body hit; it can finish off a rat and counts as your kill.
- The movement check now allows 80 u/s sideways (was 35) so drift, steering and shoves are never rejected as cheating.

## Sixth batch: launcher machines, pressure triggers and Pressure Surge (protocol 21)

What changed is in the [juice plan](../juice-plan.md#sixth-batch-launcher-machines-pressure-triggers-and-pressure-surge-agreed-2026-09-28). Workshop buttons in `feel-preview.html` prefixed `P` set every machine's pressure, fire them, view each machine, open street launchers and turn the surge look on.

| Item | What to look for | Switch |
|---|---|---|
| P1 Pressure triggers | The remote red caps are gone: each machine stands on its pad's rim with a big red trigger on top. Standing on the pad fills it in 10 s (two rats in 5 s); every cheese ball on the trigger adds a second's worth. Pressure never drains. Full, it hangs half a second; shoot it then for an overpressure. It can't refill for a second after firing. | none (gameplay) |
| P2 Triggers, touched up | After Tyler's first look: plain lit red (no glow, no outline, no strobing), so you only notice it near the launcher, and about 2.2 times the size across (about five times the target face), so stray cheese from nearby fights slowly fills it. | none |
| P2 Trigger hits | Every ball the server counts on a trigger: the trigger punches flat and springs back, the machine rocks away from the hit, the needle jumps, steam and red paint chips and cheese crumbs spit out, a clank and chuff with a ping that climbs as the machine fills, and a small thump to your view nearby (harder when it's nearly full). A hit during the one-second cooldown is a dull dead thud. | L5 Launch moment |
| P2 Launch blast | A flash, a white-hot core shooting up, the machine's coloured air column blooming out, a shock ring across the ground, speed streaks, a dust burst from the pad's rim and a haze left hanging, plus twice the debris (brass, trash, bolts, sewer water, splinters and cheese, paper and leaves). Overpressure is taller and wider with dirty smoke and sparks. | L5 Launch moment |
| P2 Machines | Pressure Works boiler with gauge and valve wheel; Sanitation Dept dumpster with a CRUSH plunger; Freight Ram with an emergency stop; Sewer Geyser standpipe with a hydrant cap; Rat Trap spring box with a red-waxed cheese; Wind Tunnel turbine with a red motor cap. Building: needle climbs, trigger pulses, wisps. Straining: swelling, shudder, more steam, creaks. Danger: violent rattle, red pool on the ground, siren, a popped bolt, and your view shakes on the pad. Each fires its own way (piston, catapult floor and slamming lid, ram punch and ramp, cover blasting off, trap bar snapping over, turbine whirl). | L5 Launch moment (rumble on the pad) |
| P3 Surge chaos | During Pressure Surge the machines fill themselves (faster as it goes), street launchers open beside rats (a rattling manhole with a glow and steam, then an eruption a second later), pads suck nearby rats in with little hops, and in the last 1.5 s every machine and a launcher under every street rat blow as overpressure. | none (gameplay) |
| P4 Surge look | Steam from the streets, a deep rising rumble, a restless view, and the city lights stuttering with each eruption. No HUD. | P4 Surge look |

**Calls I made:**
- A ball counts once per machine even if it ricochets back onto the trigger.
- Coming down on another machine's pad fills it to bursting (it fires after its half-second hang).
- Bots on a launcher route stand on the pad and shoot the trigger about three times a second.
- The Icebox Loading Yard's bot hold spots moved off the Freight Ram's pad, so holders aren't thrown every ten seconds.
- Street launchers only open on open street under the sky, never indoors or in the sewers.

## Seventh batch: UI, Dispatch and ragdolls (protocol 22)

What was agreed is in the [juice plan](../juice-plan.md#seventh-batch-ui-dispatch-and-ragdolls-brainstorming-2026-09-28). Workshops: `feel-preview.html` (buttons prefixed `R7` for ragdolls and `D` for Dispatch) and `ui-preview.html` (every UI surface with scripted data).

| Item | What to look for | Switch |
|---|---|---|
| R1 A body that bends | The coat has a soft spine (hips, belly, chest), so a corpse curves and folds; the living rat is unchanged. | R7 Ragdoll body |
| R2 Real ragdoll | Each corpse is an 8-point chain (belly, hips, chest, head, two feet, gun hand, tail) pinned to the physics body's position; the rigid spin is never shown. Bodies fold, flop over ledges, drape and end sprawled. | R7 Ragdoll body |
| R3 Go limp first | A 0.1 s buckle and waist fold before the body flies; the whole-body tumble dropped from 16 to 4 rad/s (the launch itself is unchanged). | R7 Ragdoll body |
| R4 Land like a sack | Belly squash, head bounce, limbs flung out, then a sprawl and one last twitch. | R7 Ragdoll body |
| R5 Shooting a body | The point nearest the hit kicks and the spine folds the other way, with a ripple through the coat. Cheese stains stay on the bent coat. | R7 Ragdoll body |
| D Pillars | Nine black iron alarm pillars with a big red bell on top replace the five yellow kiosks: one at each landmark corner, the central crossroads, two avenue intersections and one in the sewers. The bell (a 2.6-unit box, 5.4 up) counts from any side. | D1 Dispatch pillar |
| D Ready | Bursts of ringing, a blurred hammer, a trembling post and a turning red beacon throwing red on the pavement. Only the nearest one or two play the siren; every ready bell rings. | D1 Dispatch pillar |
| D The shot | The bell goes berserk, sparks, the call-box glass shatters, your view kicks nearby, streetlamps across the city flash red, a police radio squawks, every pillar rings while the incident is picked; the pick spins on each pillar face and the name is stamped there. | D2 Dispatch shot |
| D Running and ending | Pillars show the incident and a countdown; a big last-3-seconds count, a finale beat and an all-clear whistle. LINE BUSY now lasts **21 s** (was 16). Hits while busy clank and chip but never start anything. | D1 Dispatch pillar |
| D Rewards | Everyone sees DISPATCHED BY NAME on the roll and a kill-feed line; the caller instantly gets a random supply with its usual card (never Quick Fix at full health); the Case File has a DISPATCHER award (most calls). Bots detour to ring a nearby ready bell. | none (gameplay) |
| U1 Look and motion | One shared motion kit (slam, stamp, type-in, count-up, sliding rows, exits) that honours Reduced interface motion everywhere; the hot-case badge is a manila evidence tag, destination guidance a drawn gold pointer, the connection box a telegram slip. Same midnight-paperwork palette. | several `U` switches |
| U2 Title to city | The title is a detective's desk with a case folder and an ENTER CITY stamp; entering opens like an iris onto the city (about 0.66 s) without delaying control. | Title swoop |
| U3 Settings and pause | A tabbed case folder with a paper slide between tabs, stamps and sounds. | Case folder |
| U4 Score and assignment | Numbers roll, ranks slide, +N flies to your row, bars ease; the Jurisdiction clock shakes and ticks in its last 10 s. | Score motion |
| U5 Kill feed | Ticker tape: each name in its own ink, you in gold (or a red edge when you die), icons for gun, headshot, the city and Dispatch; lines tear away after 4 s. | Telegram feed |
| U6 Crosshair | Opens into four ticks as you move and fire; the hit X grows with damage. | Reactive crosshair |
| U7 Death | The death camera plays first; RAT DOWN arrives 1.1 s later with a pocket-watch respawn clock. | Death beat |
| U8 Round end | Case File awards count up and stamp in one at a time; results rows slide into their final order. | Case File stamps |
| U9 Scoreboard and touch | The Tab scoreboard slides in like paper with a sound and rows slide as ranks change; pickup cards drop away when they expire; touch buttons squash and the stick springs home. | Paper slide |

**Calls I made:**
- Tyler didn't pick a new UI palette, so the kit keeps today's midnight-paperwork colours and fonts.
- Bots only detour to a bell on the same level within 45 units when not carrying the case, not fighting and with no loose case near; an unrung bell is given up after 12 s.
- Dispatch rewards come through the existing supply paths, so the caller sees the usual claim card.
- The ragdoll chain uses a shared ray budget (4800 per second) for ground and wall contact.


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
