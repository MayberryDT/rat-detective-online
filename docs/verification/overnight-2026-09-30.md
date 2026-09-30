# Overnight work: 30 September 2026

Tyler, after playing production with a friend: fix clarity at 1 HP, show health packs from 2 HP, rethink pickups and add health packs, mark 3+ kill streaks. Then, going to bed: "get [the bots] close to the human measurements … then just start optimizing the game … especially for Windows … keep optimizing all night."

Everything below is on branch `bots/overhaul` and on **staging only**. Production is unchanged (Worker `aecb77d2`).

## Gameplay

| Change | Commit | Where to read more |
| --- | --- | --- |
| Low health fades the city to black and white with lifted shadows and film grain, instead of going dark. Rats, cheese, cases and pickups keep their colour. | `21b4f36` | [juice review](../juice/review.md), items 10 and T2 |
| Quick Fix kits show through walls from 2 HP (was 1 HP). The case still hides its markers only at 1 HP. | `21b4f36` | same |
| Kill streak mark: from 3 kills since your last death, a red stamp under the nameplate (ARMED, DANGEROUS at 5, PUBLIC ENEMY at 8, with tally marks) and a smouldering fedora. Counted on the server for humans and bots alike. | `8fbecdc` | [juice plan](../juice-plan.md) |
| Layout 4: 23 supply sites (was 16). Quick Fix 7 → 14. The four upstairs or rooftop Ironclad sites nobody took on layout 3 moved to ground floors. The worst of the 25 deadliest street places is now 3.4 s' run from a medkit (was 6.7 s). | `f09314e` | [city map](../city-map.md), proposal `design/city/proposals/supplies-v4.json` |

## Bots (motor iterations 3 to 5, `mindVersion` 4)

Measured with `scripts/bot-sim.mjs` (24 rooms of 4 minutes) against the humans' production numbers. Overall gap 0.193 → 0.155 over iterations 3 to 5; iteration 3 alone narrowed every named gap against production's bots. The loop stopped when two further candidates made the gap worse on both seed sets. See [the bot overhaul plan](../bot-overhaul.md), Motor rewrite.

| Measure | Humans | Bots now |
| --- | --- | --- |
| Strafe key held (median) | 314 ms | 200 ms |
| Strafe flips a minute | 22 | 36 |
| Aim held still | 44% | 43% |
| Trigger pulls a fight-minute | 261 | 218 |
| Shots while strafe-jumping, a minute | 27.5 | 20.6 |
| Hit rate under 5 / 5–10 units | 25% / 9% | 30% / 11% (was 48% / 30% in production) |
| Hit rate, all shots | 5% | 3.3% |

Still open: bots turn and flick their aim more than humans (every flick counted: humans 11.8 a fight-minute, bots about 32), and fire more shots with no rat in sight (59% against 40%).

## Performance (for Windows)

Nobody has Windows. The work targets what costs most on Chrome and Edge for Windows (ANGLE on Direct3D 11: slow program links, dearer draws and program switches, high-DPI laptops) and was measured on Halla's integrated AMD GPU by counts, GPU timers and pixel checks, because Halla's load made wall-clock timings unreliable.

| Area | Change | Measured |
| --- | --- | --- |
| Adaptive quality | Settings → Graphics: Auto (default), High, Medium, Low. Auto lowers render resolution, then costly extras, to hold 60 fps; it keeps a step only if it helps | Steps down on a GPU-bound 1920×1080 at DPR 1.5; keeps High when CPU-bound |
| GPU choice | Opaque canvas; asks for the high-performance GPU (dual-GPU laptops) | — |
| Software rendering | A note on the title when the browser draws WebGL without the graphics card | — |
| Lighting | Spot and point lights skip pixels they don't reach | Main render GPU time −25% (1920×1080: 20.8 → 15.5 ms) |
| First-use hitches | Every program finishes its first use before play; the Most Wanted searchlight and film grain no longer build mid-game | Programs first used in play 14 → 0; in-play stalls 26–314 ms → 0 |
| Program switches | Program re-selections per frame 68 → 0; draws 581 → 564; program binds 241 → 191; vertex-attribute calls 862 → 0 | Census of three views, pixels within 1 level |
| Scene work | Static objects stop recomputing matrices | Matrix recomputes per frame 3,062 → 1,297 |
| Round-end lineup | The five lineup rats are batched | Draws 728 → 220 a lineup frame (about +0.3 ms GPU on Halla; worth it where draws are dear) |
| Hunch sketch | Sketches of rats behind the camera are culled | Pixel-identical |
| Textures | Every scene texture uploads at load and at the welcome; restock dials share one icon per supply kind | Textures first uploaded in play 42 → 6; first launch 10 → 0; first supply claim's longest frame 67–117 → 33 ms; load time unchanged |
| Supply displays | Part shapes built once and shared | Building all 23: 773–932 → 430–504 ms cold |
| Rats | Tails draw inside the rat batch and bend only when drawn | Busy street draws 779 → 699; 10 rats' main-thread 5.2 → 3.6 ms |
| Deaths | Corpses build in about 5 ms instead of 14 | — |
| Garbage | Per-frame allocations removed in the HUD, camera, animator, ball sweeps and three.js bindings | Busy fight 20.7 → 16.0 MB/s; longest GC pause 17.7 → 12.7 ms |
| Supplies | Outline shells culled off screen | Up to 116k fewer triangles a frame |

## Telemetry

Every human client now reports its frame performance every 30 seconds and when leaving: fps, frame-time percentiles, frames over 33 and 100 ms, main-thread time, GPU name (shows ANGLE Direct3D 11 on Windows), OS, browser, DPR, render size and graphics level. It is recorded as a `perf` city fact. After the next session, mirror the archive and run `node scripts/perf-report.mjs` to see exactly how the game runs on Windows.

The agents' own headless browser reports a fake Windows GPU ("Intel UHD Graphics 620, D3D11") with `navigator.platform` "Linux x86_64"; ignore such rows.

## Checks

Before each staging deploy: both typechecks, the worker, client and script suites and the build, run on a clean copy of the commit on Halla. Under Halla's load several room tests time out; each failure passed when rerun alone or with longer timeouts. One real test break was fixed: `cornerCuts` picked details by `BoxGeometry` class, which the new geometry views replaced (`5a9cd89`). After the last deploy, a staging session was entered and rendered normally.

| Staging Worker | Contents |
| --- | --- |
| `7b331917-5064-4203-b6b9-ea6b314f2f62` | Gameplay batch |
| `44a71940-1a64-4ff1-956d-0f8325c77e9e` | + bots iteration 3, adaptive quality, telemetry, first perf wave |
| `93fd2a2d-d227-43c9-9135-92824140bc64` | + bots iterations 4–5 and every perf commit through `7d9d580` (client `index-CuxdowyE.js`) |
| `136bd427-024a-4cf3-b091-fb93c17a47ee` | **Final:** everything through `e2102a7`, including texture pre-upload and shared supply shapes (client `index-Cq-PgP4w.js`). Full suites green on a clean copy (worker 238/238, client 1,533/1,533, scripts 125/125) |
| `4c39e3f2-c145-49d1-9473-8dbe3d80c605` | Morning fix `37551e0` (client `index-Cvbd1Zkc.js`): Tyler found Medium and Low unusable, with jumpy rat movement. They had redrawn the flashlight's shadow only every second or third frame, and the flashlight rides with the rat, so the rat's own shadow lagged and snapped. It now redraws every frame at every level |
| `a252ebcb-caa0-46c8-b0f5-d503834ea55f` | Tyler's morning asks (client `index-CiWfjEoy.js`, **protocol 24**, **layout 5**): round end 30 s (`d48c7bd`); a random supply for each new kill streak title (`d48c7bd`); the **Stakeout** pickup (`99acf64`, `8d7d59e`) with four crossroads sites. Worker suite 239/239, client 1,542/1,542 after the Dispatch test update, scripts 125/125, build passed |

A perf report from a real staging session was recorded end to end (`/api/city/v1/events?type=perf`).

## Limits

- No Windows measurement. The first real numbers will come from telemetry.
- None of this is played by a human yet. Production still runs `aecb77d2`.
- Layout 4 makes older clients show "The game has updated" (world version check).
