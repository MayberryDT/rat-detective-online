# Chaos leaves evidence: the October batch

**Status:** round 2 built on branch `juice/chaos-evidence` (Halla `/home/halla/workspaces/rat-detective-chaos-evidence`), **protocol 41**, `mindVersion` 18, on staging for Tyler's play. Not in production.

## Why

Tyler, 8 October: improve the game across the board by pushing what makes Rat Detective itself: crazy cartoony chaos, chill noir vibes and real detective work. The direction he chose: the chaos should leave evidence, the evidence should send you into more chaos, and the noir should tell the story. He picked five ideas and turned one down:

| # | Idea | Kind | Status |
| --- | --- | --- | --- |
| 1 | **Chalk outlines**: where a body lay, a chalk outline and the rat's fedora; rain wears them down | Server mark + presentation | Built |
| 2 | **Dead rats talk**: a rat that saw the carrier in its last 6 s drops a tip, a note with a chalk arrow to where it saw them; bots read tips too | Rule (information) | Removed in round 2 |
| 3 | **Sewer muck**: a rat climbing out of the sewer tracks dark prints for about 12 units | Server mark + presentation | Built |
| 4 | **The lull**: no incident, nothing near you for 8 s, not carrying: the music drops back, the rain comes up, the neon hums | Presentation (audio) | Built; Strudel lull track drafted, not yet in the game |
| 5 | Inner monologue lines | — | **Turned down** (Tyler: "not a huge fan") |
| 6 | **The Evening Edition**: the results banner becomes a front page; the headline is Exhibit A where it happened; the round opens on a typed case file name | Presentation | Built |

## Round 2 (Tyler's staging play, 9 October)

Tyler played round 1 on staging: "I hate code violation ... we gotta get rid of it"; a 5 s freeze with a disconnect; "I
haven't seen when rats die how they point people to the case"; "I like the chalk outlines with the fedoras". Then: "I love
it all. Let's implement all of it ... make the pigeon scatter super obvious ... we want a lot more police scanner."

| Change | Status |
| --- | --- |
| **The freeze:** a respawn near a sewer mouth flipped the eight sewer lamps; the welcome compiled only the showing lamp state, so 36 programs linked at once (5.35 s on Tyler's laptop, then a delivery-timeout disconnect). The welcome now compiles both lamp states, and every 2 s of play new programs get the other state in the background (`GameSession.compileOtherLampState`). | Fixed; verified live (below) |
| **Code Violation removed** (stored rooms run Crossfire); its faulty supplies, misfires and hopping supplies go. | Done |
| **Dead rats talk removed** (too rare and too small to read); chalk outlines and fedoras stay. | Done |
| **Fresher trail:** each case paper shows its age: crisp bright white when just laid, yellowing, grimy after two minutes. | Done |
| **Hot wax:** the carried case drips sealing wax along the carrier's real path, a drop every 1.6 units; white-orange and glowing as it lands, cooling to a dark red bead, gone after 25 s. | Done |
| **Pigeons:** in the open the carrier flushes a flock every 12–18 s: 44 big pale pigeons burst out across the street at head height, climb and circle over the roofs, then scatter; feathers drift down; a clatter of wings. | Done |
| **Police scanner:** the radio calls the carrier's whereabouts every 8 s (where it was 4 s ago, coarse: a landmark, the sewers, the roofs, or the part of town, and its heading), the case taken or loose, rats down, rats airborne, pigeons spooked; about one call every 4 s. A POLICE BAND strip bottom left, case calls in case red, a squelch and two chirps. | Done |
| **The Persuader:** a snub-nose revolver pickup (random supply sites, kill streak rewards). 15 s on a timer like every weapon; one big slow slug a click, at most one every 550 ms; 2 damage, headshots kill; every hit knocks the rat flying. Brass cylinder and cheese sight, an evidence-box display, a card, its own claim, shot and hit sounds. | Done |

Bots read the same evidence a player does (`CarrierSight.lead`, `mindVersion` 18): radio calls (heard by all), pigeons
over the roofs in sight, the freshest wax drop in sight.

## The rules (what is true in play)

- **Marks are true.** The server lays every mark from what happened; nothing is invented or attributed falsely. They belong to the round: `ChaosSimulation.reset` clears them all. Source: [`src/shared/cityMarks.ts`](../../src/shared/cityMarks.ts).
- **Chalk** (`ChaosState.chalk`, at most 24): drawn when a corpse goes the ordinary way (it lay its 10 s, or a newer body took its slot), on the floor under it, head toward the body's long axis. None for bodies lost in the harbour or outside the city, or for drownings. The client draws it in over 0.9 s, then wears it to 40% over 3 minutes, with a fedora in the rat's hat colour beside the head.
- **Tips** (round 1 only, removed in round 2): a dead witness's note and chalk arrow toward where it saw the carrier.
- **Wax** (`ChaosState.wax`, runs of up to 8 drops, at most 40, each kept 25 s), **flocks** (`ChaosState.flocks`, at most 6, kept 9 s) and the **scanner** (`ChaosState.scanner`, the last 6 calls, kept 20 s; [`policeScanner.ts`](../../src/shared/policeScanner.ts), place words in [`radioPlaces.ts`](../../src/shared/radioPlaces.ts)).
- **Muck** (`ChaosState.muck`, at most 32 runs of up to 6 prints, each kept 30 s): any rat whose feet go from below y −2 to above lays prints on supported ground (`BotNavigation.printGround`) for 12 units or 6 s. Every rat, so a print says "someone came up here", not who. Bots do not read muck.
- **No clocks, no x-ray.** Nothing here times a mode or shows a rat through walls. Tips point at a past sighting, never a live position.

## Presentation

- [`CityMarksView`](../../src/prototype/CityMarksView.ts) inside `CaseFiles` (same evidence lighting, warm-up, clear and replay stillness as the papers): instanced chalk outlines, notes and arrows (one canvas texture each, per-instance ink), instanced fedoras with instance colour, and the muck as a second `PawPrints` in muck ink.
- [`eveningEdition.ts`](../../src/ui/eveningEdition.ts): `caseName(roundId)` (a number and a noir case name, the same on every client), `placePhrase(p)` (inside or outside a landmark, in the sewers, or the part of town), headline templates per highlight kind, and a deck from the round report. `GameHud.frontPage` sets the masthead (THE EVENING RAT), the dateline (CITY FINAL · CASE #… · title · assignment), the headline and the deck on the results banner; the board stays dark. The assignment reveal types the case file name under NEW CASE ASSIGNED.
- The lull: `FeelDirector.lull` (0…1, settles over 4 s, wakes in 0.6 s); `TitleMusic.setLull` drops the boogie to half; `FeelSound.rain` lifts the rain by up to 80%; `FeelAudio.setHum` is a synthesized neon buzz scaled by how near a sign you are (open air only).
- Music: [`design/music/lull.strudel.js`](../../design/music/lull.strudel.js) is a draft for [Strudel](https://strudel.cc): paste, play, tweak, export. Strudel is AGPL, so only exported audio ships, never its code. Once Tyler picks a take it becomes `public/music/lull.mp3` and the boogie crossfades into it in the lull.

## Verification

See [the receipt](../verification/chaos-evidence-2026-10-08.md).

## Open

- Tyler's play: do tips change where you go? (The research test: "I saw X, so I went Y, and I was right.")
- The lull track: a Strudel take, then the crossfade.
- Rolling back past protocol 40 drops the marks harmlessly (older code ignores the fields), but a protocol 39 client cannot join a protocol 40 room.
