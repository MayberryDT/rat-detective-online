# Paw prints and the eye-catch: verification receipt (8 October 2026)

## Revision: prints cross the gaps (current)

Tyler, on the first version: "you put the paw prints in the exact same spot as the papers, and it completely ruins the whole point of it … It's still too hard to follow." He was right: four prints beside each group told a player at a paper which way to go, but nothing marked the 15–22 units between groups, where players get lost. The verifier's checks were all taken standing at a paper, so they could not see the problem. Approved fix ("do it"): pairs of prints across every gap.

- **What changed** (`0ff15e2`, `5bcbafc`, `b0e248d`): each group's run now spans the route to the next group, with a left-right pair every 4.5 units, stopping 2.5 units short of the next group's papers (up to 16 prints). Bots and the follower look along the nearest print. Prints are indexed by grid cell for the placement checks, and checked at the two-decimal position they are sent with. The recorder follows prints pair by pair (`6a524b4`).
- **The missing check, written before the change (P10):** walking the trail with only the screen's view, is a print or paper on screen within 10 units ahead? Pairs at most 6 units apart, and every run ending within 8 units of the next paper.

| Screen-only follower, 62 spawns | No prints `6774b0c` | Prints across gaps `b0e248d` |
| --- | --- | --- |
| A print or paper on screen within 10 units ahead, share of the walk | 80% | **99%** |
| Next paper on screen at the first look | 27% | 92% |
| Reaches the case | 56 / 62 | **62 / 62** |
| Time to the case, median / p90 | 24.4 / 62.2 s | 17.7 / 26.7 s |

The first version (prints beside papers, `631ba5e`) scored 91% on the same walk measure.

- **Checks:** 31 of 33 pass (`gaps-final3/papers-b0e248d.json`). P10: 607 of 610 runs have pairs within 6 units, and 596 end within 8 units of a further paper. The papers-only sight follower reaches the case from 62 of 62 spawns. Prints on screen within 30 units: median 6, p90 20. 10,659 prints checked: none floating, under a sheet or tangled with another run. No run blinks, changes or comes back. A restore keeps 65 of 65 runs, and a reset clears them all.
- **F12 and P8 fail, by design:** prints add 2.3 KB/s (about 4% of a client's traffic). Side by side under the same load, the paper system's time went from 5.87 to 7.27 s over 6 minutes, and its p99 per step from 1.76 to 2.74 ms. The whole simulation step is no slower (median 1.44 against 1.58 ms).
- **Bots:** 73% of a bot's next paper after reading one with prints lay within 45° of where the prints pointed (840 reads).
- **Staging** `staging-2026-10-08-23fa1e1` (Worker version `1a6226cd-1a5d-41ac-bd17-6c35b9db0446`, client `index-BIrnTbR3.js`, protocol 37, `mindVersion` 15):
  - The two-client and reconnect check passed: 32 identical frames, papers and prints.
  - Desktop recording (100 s): 42 papers read, 19 runs followed pair by pair, 0 sheets or prints popped, 4 eye-catches.
  - 960×540 recording (85 s): 35 papers read, 20 runs followed, 0 popped, 10 eye-catches.
  - The room returned to 0 players and 0 bots.
- **Tests:** 288 of 288 and the build pass. One full test run made during the authority runs failed 4 room tests on delivery-acknowledgement timeouts under load; they pass alone and in a quiet full run.
- **Artifacts:** `gaps-final/` (no-prints walk baseline), `gaps-final3/`, `gaps-authority/` (prints beside papers under the new checks), `hosted/`. Review copies on Veelox: `/tmp/rat-detective-paw-prints/`.

The rest of this receipt describes the first version (prints beside the papers) and stays as history.


Thread: **[P4] Rat Detective physical clues**. Staging only; production is not deployed.

Tyler played the papers repair ([its receipt](noir-papers-v2-2026-10-08.md)): "they look great now … it's not obvious enough where you need to go … add some detective-like footprints … not a whole trail … sparse paw prints on the ground that go along with the papers". The scope he approved ("implement all of it"): a short run of prints leaving each paper group the way the trail goes on, in case-red ink, plus an eye-catching gust on far papers; bots reading prints the same way; staging and a scripted-movement review recording. What changed is in [the plan](../plans/noir-physical-clues.md#paw-prints-and-the-eye-catch-8-october-in-brief).

## Builds

| | |
| --- | --- |
| Staging | build `staging-2026-10-08-51fbc6c`, Worker version `efc18eb6-46fc-440a-9f94-54d4184e9f24`, client `index-BbXM9bsa.js`, **protocol 37**, layout 7, `mindVersion` 15, branch `feature/physical-case-clues` |
| Commits | `83df92d` prints, `6cdb9eb` runs never tangle, `631ba5e` a starter's prints keep clear of its rat, `477fe93` verifier seam fix, `1959688` stronger eye-catch and fixture view, `51fbc6c` docs |
| Baseline | `6774b0c`, the papers repair on staging before this (protocol 36) |

The authority run below built `src/` from `631ba5e`; `1959688` changes only the client's eye-catch (`CaseFiles.ts`) and the fixture, and the hosted checks ran on the final staging build.

## Failure modes, written before the code

In `scripts/verify-case-trails.mjs`, beside F1–F12 from the repair: **P1** a trail group without prints; **P2** prints pointing away from the way to the case; **P3** looking where they point shows no further paper; **P4** a run changing, coming back, blinking, or re-laid while the case lay still; **P5** prints crowding the view; **P6** a print floating, sinking, under a sheet, tangled with another run, or under a freshly spawned rat; **P7** a restore dropping prints or a reset leaving them; **P8** print bytes; **P9** prints not helping, measured with a follower that sees only its screen.

## Does it read better? (real authority, 62 sampled spawns, same harness)

Three followers walk from each spawn to the real case using only what they can see. *Sight* sees every paper in sight around it (F7, F8). *Screen* sees only the shoulder camera's view and, at each paper, keeps facing the way it walked; when nothing new is on screen it turns a quarter at a time. *Prints* is the same, but at each paper it faces where the prints beside it point and, if nothing new is on screen, walks the prints to their end and looks from there, as a player would.

| Screen-only follower | Baseline `6774b0c` (no prints) | Prints `631ba5e`, facing them |
| --- | --- | --- |
| Next paper on screen at the first look | 27% | **92%** |
| Quarter turns to find the next paper | 1.4 | **0.14** |
| Reaches the case | 56 / 62 | **62 / 62** |
| Time to the case, median / p90 | 24.4 / 62.2 s | **17.0 / 28.6 s** |

The sight follower reaches the case from 61 of 62 spawns on the baseline and 62 of 62 with prints; every spawn shows a lead in its opening view on both (F7).

The screen follower that ignores prints on the new build: 54 / 62, 27% first look, 1.4 turns (the trail itself is unchanged; it simply doesn't use the prints).

## Checks (`papers-631ba5e.json`): 29 of 31 pass

- Papers keep the repair's stability: F1–F4 zero look changes, comebacks, replacements and blinks; still-observer churn 5.5 a minute (bar 15; baseline 4.3); a street view median 3, p90 6 sheets on screen.
- **P1** 477 of 491 trail groups carry prints. **P2** from 646 of 661 runs read, the way to the case leaves within 45° of where they point. **P3** looking where 614 of 661 runs point shows a further paper or the case. **P4** 1,569 runs, none changed, came back or blinked; median life 14.1 s; 1 re-laid, while the case was moving. **P5** prints on screen within 30 units: median 4, p90 10. **P6** 5,871 prints: ground under heel and toe in the real collision world, none under a sheet or within a unit of another run, none under a fresh spawn. **P7** a restore kept 25 of 25 runs; a reset left none. **P9** as above.
- **F12 and P8 fail, by design.** They compare against the paper-only baseline, and prints add work and bytes. Papers 1,487 B/s plus prints 1,618 B/s against the baseline's 1,534 B/s of papers. The tick benchmark puts a client at about 57 KB/s, so prints add about 3%. The paper system's own time, both builds side by side under the same load (`timing/`): total 5,150 against 4,617 ms over 6 minutes (+12%), p99 per step 1.82 against 1.44 ms, median 0.117 against 0.102 ms; whole simulation step median 1.12 against 1.22 ms (no change). In a CPU profile, laying prints is about 6% of the paper system's time.
- **Server tick** (`benchmark-server-tick.mjs`, 9 bots, 4 recipients, 3,600 ticks): snapshot and wire are now cheaper than before prints: sheets and runs never change once laid, so snapshots share them and the wire caches their text (snapshot 0.05 against 0.19 ms a tick, wire 0.38 against 0.43 ms). Tick median 3.16 against 2.90 ms: the difference is bot time late in the run, where play diverges because bots now follow prints; the bots' print code is 12 ms over the whole run. The wire still decodes losslessly: the same trajectory hash before and after the cache.
- **Bots** (reported, not a check): 79% of a bot's next paper after a paper with prints lay within 45° of where they pointed (578 of 728). A short run with prints but the `mindVersion` 14 bot measured 58%.

## Hosted staging

| Check | Result |
| --- | --- |
| Two clients, late join, reconnect (`verify-case-clues-ws.mjs`, protocol 37, 6 bots) | Passed: 29 identical authority frames, papers and prints; the resumed client kept its papers and prints |
| Review recording, desktop 1600×900, 100 s (scripted keys and mouse: follows on-screen papers, walks prints to their end and looks the way they point) | Passed: 41 papers read, 26 print runs followed; 0 sheets evicted or popped, 0 comebacks; 42 runs stamped in, 0 vanished on screen; 2 eye-catch gusts; no exceptions |
| Same at 960×540, 85 s | Passed: 34 papers read, 20 runs followed; 0 evicted, 0 popped; 46 runs stamped in, 0 vanished; 1 eye-catch; no exceptions |
| Room after the agents left | `/status` 0 players, 0 bots |

Earlier staging builds that day were checked the same way. Their stills led to `6cdb9eb` (two runs beside the starter papers read as one muddled cluster) and `631ba5e` (a starter's run passed under the freshly spawned rat and read as its own footprints).

## Look (static fixture, not gameplay)

`capture-case-clues.mjs` at 1280×720 and a reduced size. The new *Paw prints* view compares case-red ink with pale chalk (`?ink=chalk`): chalk turned grey and all but vanished on the dark street, so red was chosen. The *Eye-catch* view swings the camera round to a paper lying in the open 25 units off: it lifts once and lands where it lay. In the street view the far papers lie under an overhang, where no gust may lift them. In a Blackout prints are lit like the papers (visible under the flashlight). Right paws are the left paw's art mirrored in the texture: an earlier build mirrored the mesh and lit every other print from below.

## Other checks

- `npm run typecheck`: passes except the existing `three-gpu-pathtracer` import in `test/visual/title-scene.ts`.
- `npx vitest run --maxWorkers=4`: 288 of 288. One full run had one failure (`persistentBots`: a case pickup during Evidence Tampering), which passed three times alone and in two further full runs; treated as a timing flake under load, not fixed.
- `npm run build`: passes.

## Artifacts

On Halla, `/home/halla/build/rat-detective/paw-prints-20261008/`: `authority/papers-{6774b0c,631ba5e}.json` and traces (plus the earlier `83df92d`, `6cdb9eb` runs); `timing/` (side-by-side paper-system time); `hosted/{desktop,reduced}-papers.{webm,mp4,json}`, stills and `room-e2e.json`; `candidate/visual/proof/` (fixture stills, red and chalk, clips including `desktop-eyecatch.mp4`); `prof/` (CPU profiles). Review copies on Veelox: `/tmp/rat-detective-paw-prints/`.

## Repeat

From `/home/halla/workspaces/rat-detective-physical-clues`:

```sh
D=/home/halla/build/rat-detective/paw-prints-20261008
node scripts/verify-case-trails.mjs --ref=6774b0c --out=$D/authority --followers=sight,screen --measure
node scripts/verify-case-trails.mjs --ref=631ba5e --out=$D/authority --baseline=$D/authority/papers-6774b0c.json
P4_WS=wss://rat-detective-staging.mayberrydt.workers.dev/ws P4_RECEIPT=$D/hosted/room-e2e.json node scripts/verify-case-clues-ws.mjs
ANGLE=vulkan node scripts/record-case-papers.mjs --url=https://rat-detective-staging.mayberrydt.workers.dev/ --out=$D/hosted --seconds=100 --size=1600x900 --label=desktop
node scripts/benchmark-server-tick.mjs --bots=9 --recipients=4 --ticks=3600 [--ref=6774b0c]
npx vite build --config vite.visual.config.ts --outDir $D/candidate/visual && P4_OUT=$D/candidate ANGLE=vulkan node scripts/capture-case-clues.mjs
```

A cold staging room can take more than 10 s to welcome its first socket after a deploy; the two-client check then fails at `welcome`, and passes once the room is warm.

## Limits

- Nobody has played it by hand. The followers and the recording driver are proxies; Tyler's playtest decides whether the prints make the way obvious, whether red ink is right, and whether the eye-catch is noticeable without being fussy.
- From 25 units a lifting paper is still small on screen; it was strengthened once (`1959688`) from the fixture clip, not from play.
- Prints read as paws within about 8 units and as red marks to about 30; past that they are not drawn. They tell a player at a paper which way to go; spotting the next paper from far off is still the papers' (and the gust's) job.
- When someone carries the case, a run turns only once the case has moved more than 8 units from where it pointed, the run has lain 5 s, and the way from its group has turned; until then it can point at where the carrier was.
- One spawn outside the 62-spawn sample (638, a sewer tunnel) loses every follower with and without prints: the harness's camera-height sight hits the tunnel's low ceiling. Not isolated further.
- Recordings ran in a headless agent browser on Halla's GPU: not a frame-rate claim.
- No `design/data/eras.json` entry: staging only; add an era at a production release.
