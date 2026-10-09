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

## Round 3 (9 October, Tyler's second staging session)

**Tyler:** the police band "a thousand lines a second", "super loud and obnoxious"; freezes again and a slow entry; "shot through a rat's head like five times" and nothing happened; "we gotta log that stuff so you can figure out what's going on".

**What his session logged** (staging mirror, session 03:49:37–03:51:57 UTC, build `staging-2026-10-09-e8aa1fa`):
- First 30 s: stalls of 1,250, 3,267 and 1,067 ms (worst frame 4.3 s), with 259 and 291 programs linked: the welcome compiling both sewer-lamp states at once (round 2's fix) doubled the entry's links.
- He took the Persuader at 03:50:14 and fired 18 shots: none hit (`targets` empty); several reached the server 66–130 ms apart and were refused by the 550 ms hammer (no slug), and a slug at .62 of ball speed outlived the 250 ms view compensation.
- His deaths were bot headshots from 32–39 m.
- The scanner feed (client): a call scrolled off by the three-row cap was re-added every frame, playing the squelch every frame.

**Fixes:** the feed shows each call once (a `heard` set), two rows, only case calls key the set and quieter (.32), at least 3 s between calls on the server; the other lamp state is compiled in the background, a material at a time, at most 4 ms a frame; the Persuader slug at .9 of ball speed, .38 wide; **stall reports now carry `shaders` (which programs linked, by name and count) and `events` (`perfMarks`: welcome, lamps-on/off, died, respawn, claim, radio), and main-thread attribution that arrives after a stall is recorded is filled in.**

**Checked** (staging `staging-2026-10-09-a61d969`, Worker `e30e27ee-39f8-4a03-9a29-0bdabdaf5f52`):
- Worker 33/33, client 172 test files pass; typecheck passes.
- Live census, 150 s: 1 program linked at the first play frame, none after; **38 scanner calls shown in 150 s** (one per 4 s, each once).
- `verify-entry.mjs`, staging vs production on Halla's headless Chrome: warm room 1.6–1.8 s (production 2.1–3.4 s); cold room clicked after load 13.3 s on the first wake after the deploy (welcome 11.6 s), then 3.3 s (production 2.3–2.6 s); clicking at once, both 15–25 s (the page itself loads in 13–15 s on this machine). EN2 failed only on the first post-deploy wake.

**Not checked:** a human session on this build; whether the first wake after a deploy is slower than before this branch (not measured on main right after a deploy).

## Round 4 (9 October, Tyler's third staging session)

**Tyler:** faster to get in; latency ("hitting people feels off", running over pickups without taking them); the flock is distracting from the carrier; get rid of Bad Ammunition; wants to equip a Persuader through admin tools.

**Found:**
- His pings this session: 160–205 ms (lowest 115 ms; jitter to 67 ms; max 336 ms), against a 54 ms lowest at 00:00 on production's build. Bot playback delay rose to 250–350 ms, beyond the 250 ms shot compensation bound, so shots at what he saw could miss.
- The server's CPU is not the cause: `benchmark-server-tick --room --bots=10` main vs branch, median tick 4.9 vs 4.7 ms, p95 33.2 vs 25.7 ms.
- From Halla (edge MCI), plain requests to the room server take 160–200 ms on **production and staging alike**; an agent's WebSocket ping on staging was 54 ms at best, 82 ms median, but 235 ms p95 and 1.1 s p99. The spikes are not attributed yet.
- **A real bug, also in production:** `caseClues.printFor` could lay a 17th paw print in a run (a pair pushed past `PRINTS.run`); `validPrints` then made every client refuse the whole chaos frame and reconnect, again and again while the run lived. The room benchmark hit it at tick 3743. Fixed on the branch; production still has it.

**Changed:** print runs capped at 16; Bad Ammunition removed (stored rooms run Crossfire); admin **Give me** (any pickup to the admin's own rat, game socket only); a carrier never sees or hears its own flock.

**Checked:** typecheck; worker suite 32/33 with the recorder test passing alone (17/17; it timed out under load); client suite 172 files; the 3-minute room benchmark decodes every frame after the fix. Staging Worker `256c57f0-72c2-43f0-919d-7a10443a7407`, build `staging-2026-10-09-dfab77b`.

## Round 5 (9 October): the ping, the Pea Souper

**Tyler:** "figure out why the ping is so bad, and we need to fix it. Don't hotfix production, fix it here"; a thick noir fog with the rats always visible and the lights breaking through; a penthouse safe (below, in progress).

**Found (the ping):** the room, not the build. Staging's `public-live-v2` runs in **Seattle** (`/status?colo=`, staging diagnosis), as does its Matchmaker; this machine and Halla enter Cloudflare at **Kansas City**. Probes (`probe-city-marks.mjs`, an agent rat, every 500 ms):

| Room | Ping min / median / p95 / p99 | Late chaos frames |
|---|---|---|
| `public-live-v2`, Seattle, through the Seattle Matchmaker | 56 / 83 / 225 / 1,700 ms | about 140 in 120 s, all network |
| Bot-free test room, Chicago, direct | 18–19 / 28–37 / 83–88 ms | (no frames) |
| `public-live-v3`, Dallas, through the Chicago Matchmaker | 50 / 62 / 190 / 333 ms | 137 in 120 s, all network |
| `public-live-v3`, Dallas, direct (the fix) | 17–42 / 25–54 / 97–102 / 182–221 ms | 48–70 in 90 s, almost all network |

Rooms first reached from Kansas City land in Chicago or Dallas (6 of 6); the `enam` hint also gave Atlanta, Miami and Newark (3 of 8). A WebSocket returned through a Durable Object keeps flowing through it, so the Matchmaker's place counts as much as the room's.

**Changed:** the public city is `public-live-v3`, first reached from Kansas City (staging: Dallas), with the old room's history copied in (`POST /api/city/v1/copy`, `scripts/copy-city.mjs`); public joins connect the Worker straight to the room (the Matchmaker only for overflow); `/status` names the colo. Production moves at the next release, by the steps in [the public room](../live-service.md#the-public-room).

**Checked (the copy):** staging copied 5,451,031 rows in about 9 minutes; the new room's `/api/heat/v1?days=all`, `/api/city/v1/places?days=all`, `/api/city/v1/flows?days=all` and the first 10,000 events are identical to the old room's before the move (snapshots under `/home/halla/build/rat-detective/room-move/`).

**The Pea Souper:** a new incident (protocol 42): fog density .058 in yellow-grey `0x4b4a36` over the city and sky; lamp haze cones 2.8× brighter and 1.5× wider, searchlights 4× (both unfogged shaders, so they glow through); rat bodies already ignore the fog, and every rat's far outline now starts at 3 units and is full at 12, 2.4 px, .9 opaque; a foghorn when it rolls in and every 16 s. Only uniforms change: no program links. Bots see the case and its papers only within 24 units in it (`FOG_REACH`, `mindVersion` 19); rats as ever.

**Checked (the fog):** static art inspection (`city-view.html?incident=pea-souper&rats=…`, Halla's GPU): on the quay, the cranes and warehouses vanish past about 35 units, the lamp cones glow through, and four rats at about 12–50 units stay plainly visible; the same view clear for comparison (`/home/halla/build/rat-detective/fog/`). Typecheck; worker 288, client 1,520, scripts 46 tests pass. Staging Worker `52f0e831-a163-40f4-a411-89b05a757fc5`.

**Not checked:** the fog in live play by a human; the copy on production (next release).
