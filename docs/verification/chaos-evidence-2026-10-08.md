# Chaos leaves evidence: build receipt (8 October 2026)

**What:** the batch in [the plan](../plans/chaos-evidence-2026-10.md): chalk outlines, dead rats talk (tips), sewer muck, the lull and the Evening Edition. Protocol 40, `mindVersion` 17.
**Where:** branch `juice/chaos-evidence`, commits `ccb262d`, `9525578` and this receipt's commit; staging Worker `6d0af4c8-e53f-4eae-b80e-8f670d852f77`, build `staging-2026-10-09-9525578`, client `index-B5CbJ2-m.js`. **Not in production.**
**Artifacts (Halla):** `/home/halla/build/rat-detective/chaos-evidence-202610/` (`marks/visual/proof/` stills and `capture.json`; `front-page/` results and round-start stills; `staging/marks-probe.json`). Benchmark JSON: `test-results/server-tick/ab-main.json`, `ab-worktree.json` in the Halla worktree.

## What was checked

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run build` | Pass |
| `npm test` | Worker suite 33 files pass. Client suite: 171 of 173 files pass, 1 skipped; `sewerNorthBranches` timed out at 5 s while a benchmark ran beside it and passes alone (8/8). The four client files that first failed did so because their stand-ins lacked the new `setLull` / `frontPage` hooks; with those added they pass (31/31). `node --test test/scripts/*.test.mjs` run on its own: 46/46 pass |
| Headless room, 10 bots, 3 min (`benchmark-server-tick --room --bots=10 --recipients=4 --ticks=5400`, every chaos frame decoded) | 37 chalk outlines, 8 tips, 8 muck runs laid; every frame decoded. The marks cost about 6 bytes a tick on the wire (chalk 5, muck 1, tips under 1) |
| Same run, `main` vs branch | Median tick 5.49 → 5.84 ms, p95 35.5 → 35.9 ms, p99 61.5 → 59.6 ms; client 148.7 → 153 KB/s. The trajectory hash changes (`d4f65969…` → `49ab2fd4…`): expected, since bots now read tips and the room diverges, so the two runs are different games |
| Staging probe (`scripts/probe-city-marks.mjs`, one `agent=1` rat in `public-live-v2`, 180 s) | Welcome on protocol 40, 7 bots, 23 deaths, 5 carriers, 0 errors. 17 chalk outlines and 4 tips arrived; tip arrows ran 24–64 m, the witness had seen the carrier 50–367 ms before dying. **No muck in that window** (the headless room shows muck forms; bots rarely came up from the sewer here) |
| Chalk, tip and muck stills (`VIEWS=chalk,tip,muck node scripts/capture-case-clues.mjs`, Halla GPU, real city materials) | Looked at: the outline reads as a police outline with the fedora by the head; the tip's arrow is clear from the shoulder camera; the note's writing is not readable at that distance; muck reads as olive prints after one fix (first pass was invisible dark brown, and the first outline looked like an insect: both redrawn) |
| Results board (`ui-preview.html`, results action) | Looked at: THE EVENING RAT between rules, dateline `CITY FINAL · CASE #3427 · THE LONG GOODBYE · EXCESSIVE FORCE`, headline `SKY HIGH: WHISKERS LAUNCHED IN THE EAST END`, CASE CLOSED BY, deck; the stats strip and boards still lay out below it at 1440×900 |
| Round start (`ui-preview.html`, briefing action) | Looked at: `CASE #8419 · THE MISSING MOZZARELLA` typed under NEW CASE ASSIGNED |

## Not checked

- **Sound.** The lull (boogie at half, rain up to +80%, the neon hum) was never heard: no audio check was possible here. Its numbers are first guesses for Tyler to judge.
- **Human play.** Whether tips change where players go is for Tyler's play.
- The Strudel draft was not played; its syntax follows Strudel's documented functions but was not run.
- Phones and the small-screen results layout were not captured.

## Round 2 (9 October): the freeze, Code Violation out, wax, pigeons, scanner, the Persuader

**Where:** commit `f1b73c4` and later on `juice/chaos-evidence`; staging build `staging-2026-10-09-f1b73c4` (Worker `0be7227b-c4e7-4947-9a61-fd1652a03caf`), then the display-pose fix redeployed (see the staging row in [live service](../live-service.md)). Protocol 41, `mindVersion` 18.

### The freeze Tyler hit (diagnosis)

- The staging city mirror (`node scripts/city-mirror.mjs --base=<staging>`, then the perf facts) held Tyler's session: at 02:07 UTC a **5,350 ms frame** with **36 programs linked** in the second before it; the connection then closed on `delivery-timeout` (close 1013) and recovered 1.1 s later. The recorder's facts put it right after a respawn (killed by a Tommy Gun at 02:06:56, respawned in the Icebox at 02:06:59). His laptop played at low quality, 0.7 scale; its program count kept rising in play (181 → 278).
- `scripts/program-census-live.mjs` (a muted agent browser in the real client against staging, naming each program first linked in play and the light set) reproduced the class: about 60 programs linked after play began, and when the eight sewer lamps became visible **26 programs linked at once with a 750 ms frame** (Halla's GPU), 6 more as they hid. Cause: the welcome re-adopts the city's materials and compiled only the showing lamp state.
- Keeping the lamps always counted (at zero intensity) was measured and rejected: `test/visual/lamp-cost.html` (`scripts/run-fixture.mjs`) shows **+15–17% GPU time** on three street views (12.2 → 14.1, 14.4 → 16.9, 13.5 → 15.8 ms at 1280×720 on Halla).
- Fix: compile both lamp states at the welcome, and every 2 s of play compile the other state for programs that appeared since.

### Checked

| Check | Result |
| --- | --- |
| Live program census on staging, fix only (two 180 s runs) | **0 programs linked during play** in either run; the lamps flipped 9 times |
| Live program census on round-2 staging (180 s) | **0 programs linked during play**; longest frames 117–150 ms (headless Halla, none with a link) |
| `npm run typecheck`; worker suite; client suite; script tests | Pass: worker 33/33 files, client 172 files (1 skipped), scripts 46/46 |
| Staging probe, round 2 (`probe-city-marks.mjs`, 180 s, `public-live-v2`) | Protocol 41, 6 bots, 22 deaths, 5 carriers, 0 errors: 29 chalk outlines, 6 muck runs, 78 wax runs, 4 flocks, **44 radio calls** (e.g. `ALL UNITS: INSPECTOR CHISEL HAS THE CASE AT RECORDS.`, `DISPATCH: SUSPECT WITH THE CASE HOLED UP OUTSIDE RECORDS.`) |
| Headless room, 10 bots, 3 min (weapons handed out every 10 s) | 647 Persuader slugs fired, 13 knock-flying shoves, every chaos frame decoded; median tick 4.6 ms |
| Stills: wax, pigeons, the Persuader display and held gun | Looked at. Wax first read as tiny dots and the pigeons as invisible edge-on V's, then as white slashes; reworked to bigger glowing drops, camera-facing pigeon silhouettes that burst at head height, and a near-lens shrink. The revolver display was floating, then end-on; it now stands on its grip on the box. The fixture's own clock ran backwards on its first frame (headless frame timestamps lag the clock) and is fixed. |

### Not checked

- Sound: the wing clatter, the scanner squelch, the wax hiss (a fresh drop within 14 units, at most every 350 ms), the Persuader's shot, hit and claim. Never heard.
- Whether the pigeons are obvious from across the city in real play (the stills are close; a far flock was not captured).
- The Persuader in human hands; the 550 ms hammer and the knockback strength are first guesses.
- Smaller hitches Tyler felt ("little hang-ups"): the headless runs show 100–150 ms frames with no program link; not yet attributed.
