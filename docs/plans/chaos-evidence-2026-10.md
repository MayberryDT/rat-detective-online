# Chaos leaves evidence: the October batch

**Status:** built on branch `juice/chaos-evidence` (Halla `/home/halla/workspaces/rat-detective-chaos-evidence`), **protocol 40**, `mindVersion` 17. Not deployed. Needs Tyler's play and OK before staging or production.

## Why

Tyler, 8 October: improve the game across the board by pushing what makes Rat Detective itself: crazy cartoony chaos, chill noir vibes and real detective work. The direction he chose: the chaos should leave evidence, the evidence should send you into more chaos, and the noir should tell the story. He picked five ideas and turned one down:

| # | Idea | Kind | Status |
| --- | --- | --- | --- |
| 1 | **Chalk outlines**: where a body lay, a chalk outline and the rat's fedora; rain wears them down | Server mark + presentation | Built |
| 2 | **Dead rats talk**: a rat that saw the carrier in its last 6 s drops a tip, a note with a chalk arrow to where it saw them; bots read tips too | Rule (information) | Built |
| 3 | **Sewer muck**: a rat climbing out of the sewer tracks dark prints for about 12 units | Server mark + presentation | Built |
| 4 | **The lull**: no incident, nothing near you for 8 s, not carrying: the music drops back, the rain comes up, the neon hums | Presentation (audio) | Built; Strudel lull track drafted, not yet in the game |
| 5 | Inner monologue lines | — | **Turned down** (Tyler: "not a huge fan") |
| 6 | **The Evening Edition**: the results banner becomes a front page; the headline is Exhibit A where it happened; the round opens on a typed case file name | Presentation | Built |

## The rules (what is true in play)

- **Marks are true.** The server lays every mark from what happened; nothing is invented or attributed falsely. They belong to the round: `ChaosSimulation.reset` clears them all. Source: [`src/shared/cityMarks.ts`](../../src/shared/cityMarks.ts).
- **Chalk** (`ChaosState.chalk`, at most 24): drawn when a corpse goes the ordinary way (it lay its 10 s, or a newer body took its slot), on the floor under it, head toward the body's long axis. None for bodies lost in the harbour or outside the city, or for drownings. The client draws it in over 0.9 s, then wears it to 40% over 3 minutes, with a fedora in the rat's hat colour beside the head.
- **Tips** (`ChaosState.tips`, at most 8): every 250 ms the server notes which living rats have a clear line to the case carrier within 80 units (eye to body, the bots' sight range). When such a rat dies (with a body) within 6 s of its last sighting, while that same rat still carries the case, a tip lies where it fell, pointing at where it saw them. A tip goes when that rat stops carrying the case, or after 45 s. The carrier killing a witness that saw them leaves a tip pointing at the carrier: being seen is the danger.
- **Bots read tips** (`mindVersion` 17) the way a player reads the arrow: a tip in sight within 30 units updates their fix on the carrier if it is newer than their own. Same information for everyone; no new sight. `CarrierSight.tip` in [`carriers.ts`](../../src/shared/bots/motor/carriers.ts).
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
