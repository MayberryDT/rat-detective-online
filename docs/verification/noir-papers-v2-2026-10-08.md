# P4 repair: persistent, sparse, varied case papers in the wind

7–8 October 2026 (US/Central). Thread **[P4] Rat Detective physical clues**. Branch `feature/physical-case-clues` on Halla, commits `17fd922` (the repair) and `f958014` (every sheet leaving on screen blows away; a sturdier review driver). **Staging only; production not deployed.**

Tyler, on the 7 October candidate: better, but papers blinked and flipped between places and looks, were too many, looked identical, formed an artificial line and lay lifeless; he wanted paper that feels alive, with flutter and the odd flying sheet. The [stability and wind handoff](../handoffs/noir-paper-stability-and-wind-handoff.md) traced why. Tyler then said to move forward, allowed scripted movement for this review recording, and approved a staging deploy.

## Staging

| | |
| --- | --- |
| Build | `staging-2026-10-08-f958014` (`npm run deploy:staging` from a clean tree) |
| Worker | `7cc1dea5-65c8-4ba3-aed5-2dad758d0899` (the first deploy, `staging-2026-10-08-17fd922`, was Worker `114dafbc-970f-471e-baa9-6cef4e3814f6`) |
| Client | `index-DO7MeUYW.js` |
| Protocol / layout / mind | **36** / 7 (unchanged) / **14** |
| URL | <https://rat-detective-staging.mayberrydt.workers.dev/> |

Production stays `production-2026-10-06-2822d1a`, protocol 33.

## What changed

- **Authority (`src/shared/caseClues.ts`).** Sheets belong to the city: each keeps one id, place and look (`s` = family + 4·art + 16·shape) for life, and the role (starter or route) no longer touches the id, so nothing flips in place. A rat's route reads into anchors where the way needs telling (where sight breaks at a corner, the top and bottom of a ramp or shaft, a launcher's pad and landing, a long stretch of 17–24 units, the spill beside the case), and those anchors hold groups of 1–3 sheets. Groups are shared between routes (merged within 8 units, a corner only at that corner, one spill at the case). A group is held while a route within 45 units ahead or 16 behind wants it, lingers 10 s when nobody does, and a spot a sheet just left stays bare 4 s, so nothing is swapped in place. A relocation, return or reset retires everything. Each group is placed in sight of the previous group's sheets, from a rat's eyes (1.6) and the shoulder camera's pivot (3.5), and sees the way on; a single bridge sheet covers the rare corner no spot reads from. Starter spills: once per life, 300 ms after the spawn in the rat's own facing, after a wake from hibernation too, with sheets kept back so a crowded city never starves a fresh spawn. Placement and route search are bounded per step and resume where they stopped. Restores keep their sheets while the routes reclaim them.
- **Wind (`src/shared/paperWind.ts`, presentation only).** One pure function of place and server time: gust fronts roll downwind (off the harbour, along streets); a group's last sheet may hold a second resting spot `q` the authority checked, and strong gusts carry it there and back on a timetable every client computes alike. Interiors and sewers are calm. No server paper physics.
- **Renderer (`src/prototype/CaseFiles.ts`).** One record per sheet for life; admission keeps on-screen sheets in the budget and measures range from the rat, not the orbiting camera. A small vertex patch picks each sheet's atlas cell and lifts and flutters its upwind edge (only upward, never into the pavement). New sheets near you blow in, retired ones blow away (up to 12 in the air), passing rats and shots ruffle them, a loose sheet flies between its spots. Reduced motion and `?feel=off` (item *P4 Case papers in the wind*) keep every sheet still; replays keep papers still.
- **Documents (`casePaperDrawings.ts`, `CasePaperArt.ts`).** Twelve fronts in four families (statement, form, receipt, photograph) and a back each, one case file; two rest shapes per family; documents drawn at their sheets' own proportions; a hand-built mip chain stamps the red edge at a texel or more per level and fades it on tiny levels, so the edge stays about a pixel wide instead of shimmering. The edge follows the Blackout smoothly and no longer strobes with surges or muzzle flashes (`NoirCity` evidence uniforms).
- **Bots (`mindVersion` 14).** Bots read the same sheets where players see them (a loose sheet at its current spot), only within flashlight reach in a Blackout, and sweep their look once across the street when a lead ends ([bot overhaul](../bot-overhaul.md)).
- **Facts.** `clue` facts carry the rat's actor number, not its id: `lead`, `route`, `clear` ([city map](../city-map.md)). Protocol 36: the clue item shape changed.

## Failure scenarios, written before the verifier

F1 a sheet changes look or place under its id; F2 an id comes back; F3 a sheet is replaced where it lay outside a clear; F4 a sheet blinks (lives under 2 s); F5 a still observer sees churn; F6 walking past the starter's edge drops or re-lays it; F7 a fresh spawn has no lead in view; F8 a follower using only visible papers misses the case; F9 a restore drops the papers; F10 a clear leaves a sheet of the old placement; F11 a street view holds too many sheets; F12 paper bytes or paper work regress against the old build.

## Authority E2E: old build against the repair, same harness

`scripts/verify-case-trails.mjs`: the real `ChaosSimulation` and production server bots (8 bots, a still player and a pacing player, PAPER CHASE, deaths and respawns), every 30 Hz frame through the compact wire and decoded as a client; then a sight-only paper follower from 62 sampled spawns (each in its own room and random stream), the lifecycle checks and the routes. The baseline is the same harness building `src/` from `4b081c4` (`--ref`).

| Measure (6 simulated minutes) | Old build `4b081c4` | Repair |
| --- | --- | --- |
| Look or place changed under an id / ids that came back / blinks under 2 s | 17,377 / 7,827 / 8,167 | 0 / 0 / 0 |
| Replaced in place outside a clear | 98 | 0 |
| Sheet lifetime, median | 1.5 s | 13.1 s |
| Changes a still player sees within 40 units, a minute | 41 | 4.3 |
| Sheets in a rat's shoulder-camera view, median / p90 / max (every rat, each second) | 3 / 12 / 35 | 3 / 8 / 22 |
| Paper bytes on the wire, a second (one client) | 95,906 | 1,534 |
| Paper system time a step (`guide`), median / p99 / total | 0.31 / 2.02 / 8,745 ms | 0.09 / 1.07 / 3,573 ms |
| Whole simulation step, median (shared machine; varies about 20% run to run) | 1.36 ms | 0.94 ms |
| Restore: sheets kept after 1 s | 56 of 109 | 111 of 111 |
| Reset: old sheets surviving | 5 of 108 | 0 of 91 |
| Every sampled spawn has a lead in its opening camera view | 62 of 62 | 62 of 62 |
| Sight-only follower reaches the real case | 46 of 62 | **61 of 62** |
| Checks passed | 6 of 17 | **18 of 18** |

The follower sees from the shoulder camera's pivot, walks onto each paper it reads, waits up to 3 s for papers to blow in and retraces up to 60 units; it uses no route knowledge. Groups placed in the follower runs: 483 read from the previous group's sheets, 11 from a bridge sheet (16 bridges laid), 9 from the previous anchor, 1 on its own anchor. The follower's next paper was a median 14.8 units away (old trail: 5.1, a sheet every few steps).

Also passed (repair): starters survive pacing 13 units out and back, and walking past the release distance retires them once without a comeback; street–sewer routes both ways with every segment walkable; every launcher roof reachable with no invented segment; every one of the 930 spawns has a supported starter at four facings with real sight.

Paper work profile (`guideprof.mjs`, a populated room, 3 minutes): the largest single steps are the room's first route searches on a cold walk graph (75 ms old, 83 ms repair; same search code); placement is bounded to about 1.5 ms a step.

## Hosted staging checks (`staging-2026-10-08-f958014`)

| Check | Result |
| --- | --- |
| Two clients, late join, reconnect (`verify-case-clues-ws.mjs`, protocol 36, 7 bots) | Passed: 32 identical authority frames, bounded evidence on late join, the resumed client kept its papers |
| Gameplay review recording, desktop 1600×900, 96 s (`record-case-papers.mjs`, scripted keys and mouse following on-screen papers) | Passed: papers on screen at spawn (`desktop-spawn.png`); 40 papers read; 0 evicted by the budget, 0 vanished on screen without blowing away, 0 comebacks; 69 blown in, 15 blown away; no exceptions |
| Same at 960×540, 80 s | Passed: 39 papers read; 0 evicted, 0 popped, 0 comebacks; no exceptions |
| Room after the agents left | `/status` 0 players, 0 bots (human-seat hibernation intact) |

The first staging build (`17fd922`) recorded one sheet more than 45 units away vanishing instead of blowing away; `f958014` animates every departing sheet on screen in range.

## Other checks

- `npx tsc --noEmit -p tsconfig.json`: passes. The test config's only error is the existing `three-gpu-pathtracer` import in `test/visual/title-scene.ts`.
- `npx vitest run --maxWorkers=4`: 288 of 288 pass. With the default parallelism this machine times out worker tests on both builds (old: 14 failures, repair: 6; all pass when run alone).
- Static art and wind fixture (`capture-case-clues.mjs`): street, corner, sewer, Blackout, all twelve documents, and the wind view with a loose sheet's flight; desktop and reduced resolution. Not gameplay.
- Code review: five reviewers plus skeptics; confirmed findings were fixed (stale arrivals, receipts dipping into the pavement, starters after a wake, Blackout reach for bots, the end spill through walls, replays, the verifier's own checks).

## Artifacts

On Halla, `/home/halla/build/rat-detective/noir-papers-v2-20261007/`: `authority/papers-{4b081c4,worktree}.json` and their traces, `hosted/{desktop,reduced}-papers.{webm,mp4,json}` and stills, `candidate/visual/proof/` (fixture stills, clips, atlas), `art-preview/`. Review copies on Veelox: `/tmp/rat-detective-noir-review-v2/`.

## Repeat

From `/home/halla/workspaces/rat-detective-physical-clues`:

```sh
D=/home/halla/build/rat-detective/noir-papers-v2-20261007
node scripts/verify-case-trails.mjs --ref=4b081c4 --out=$D/authority --minutes=6 --spawns=62 --measure
node scripts/verify-case-trails.mjs --out=$D/authority --minutes=6 --spawns=62 --baseline=$D/authority/papers-4b081c4.json
P4_WS=wss://rat-detective-staging.mayberrydt.workers.dev/ws P4_RECEIPT=$D/hosted/room-e2e.json node scripts/verify-case-clues-ws.mjs
ANGLE=vulkan node scripts/record-case-papers.mjs --url=https://rat-detective-staging.mayberrydt.workers.dev/ --out=$D/hosted --seconds=95 --size=1600x900 --label=desktop
npx vite build --config vite.visual.config.ts --outDir $D/candidate/visual && P4_OUT=$D/candidate ANGLE=vulkan node scripts/capture-case-clues.mjs
```

## Limits

- No human has played it yet. The follower and the recording driver are proxies; Tyler's playtest decides whether the trail reads, how the wind feels and whether arrivals and departures are calm enough (in a populated room about one new sheet blows in near you every second or two at the start of a round, fewer later).
- One of 62 sampled spawns still lost the trail in the harness. The cause is not isolated.
- The recording ran in a headless agent browser on Halla's GPU: not a frame-rate claim, and its scripted driver sometimes grinds a wall before it hops clear.
- Timing on Halla was noisy (another session's work shared the machine); paper-work comparisons use the paper system's own time, not whole ticks.
- No `design/data/eras.json` entry: this build is staging only; add an era at a production release.
- Blackout keeps its established look: papers lie under the flashlight's overexposed beam with the red edge's glow dark.
