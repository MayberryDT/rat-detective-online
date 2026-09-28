# Performance baseline — 28 September 2026

Phase 0 of the [optimization overhaul](../juice-plan.md). Nothing about the game changed; this records where time goes today so each fix can be judged by numbers. Production is Worker `be7ac8ba…`, protocol 20.

## How it was measured

All runs on **Halla** (AMD Ryzen laptop, Radeon "Renoir" integrated GPU, headless Chrome through ANGLE/OpenGL ES, 1280×720 at device pixel ratio 1, muted). Halla is a modest machine and was shared with other work, so repeated runs vary by up to ±15%; compare runs made back to back.

| Tool | What it does |
| --- | --- |
| `?diagnostics=quiet` (existing) | Now also reports per-phase **means** (`phaseMeanMs`) and GPU time of the main render (`gpuMedianMs`, `gpuP95Ms`, via `EXT_disjoint_timer_query_webgl2`; `src/session/gpuTimer.ts`, moved from the visual fixtures). |
| `scripts/profile-client.mjs` | Headless Chrome CPU profile plus allocation sampling (including collected objects) of any game page. `--sourcemaps=dist` maps a `vite build --sourcemap` bundle back to source; `gameInclusive` charges library time to the game function that asked for it. No gameplay input; `--click` only presses the title's Enter. |
| `test/visual/capacity-render.html` (existing) | Real city, remote rats, chaos view and noir layer with synthetic motion. New `rats=9` and `corpses=16` options. |
| `scripts/benchmark-server-tick.mjs` | GameRoom's 30 Hz tick with 9 bots (two 60 Hz bot+chaos steps, snapshot, compact frames, 1 Hz checkpoint JSON). Deterministic; the **trajectory hash** covers every bot pose and every ball position, so an optimization must leave it unchanged. `--scenario=burst` adds a 120-ball eruption every 3 s; `--ticks` for warm runs; `--profile --profile-from`; `--ref` builds any commit for A/B. |

Hosted runs used the private capacity fixture (version `65a12a75-1b24-4d25-986b-2b8334f865cc`, same code as production plus the diagnostics above, built with source maps): an **observer** in `graybox-benchmark-ai-perf1` and an idle **player** in `graybox-benchmark-match-polish-r1`, each with 9 bots, 25 s warm-up and a 30 s profile.

## Client

| Scene | fps | Draw calls | Triangles | GPU median / p95 | CPU per frame (means) |
| --- | ---: | ---: | ---: | --- | --- |
| Hosted observer | 30 | 413 | 0.95 M | 17.3 / 19.4 ms | simulation 8.9, presentation 2.5, render 18.2 ms |
| Hosted idle player | 37 | 260 | 0.86 M | 13.7 / 15.1 ms | simulation 6.4, presentation 2.4, render 14.0 ms |
| Fixture: 9 rats in view | 34 | 954 | 1.49 M | 19.2 / 21.0 ms | render p95 26.2, presentation p95 4.9 ms |
| Fixture: plus 256 balls | 36 | 956 | 1.86 M | 18.0 / 18.6 ms | render p95 17.8 ms |
| Fixture: plus 16 corpses | 26 | **2,874** | 1.86 M | 20.5 / 22.4 ms | render p95 32.7 ms |

On this machine the **main thread is saturated** (the profiler saw almost no idle time) and the GPU is close behind. Both need work; CPU first.

Where the hosted main thread goes (share of busy time, observer / player):

| Cost | Share | Audit item |
| --- | --- | --- |
| three.js render internals (scene traversal, uniforms, draw submission) | ≈50% | 3, 5, and draw calls |
| `RatController.updateCamera`: two raycasts against every camera blocker, run once per physics step **and** once per frame | **11.6% / 8.1%** | 16 |
| `Object3D.updateMatrixWorld` (inside render): about 1,500 static city objects recompute matrices every frame | 8.0% / 8.4% | 3 |
| Tail deformation (`deformTails` plus `computeVertexNormals`): the top two allocators after street lights | ≈6% | 10 |
| Client cannon world step (`collisionPairs`, `solve`, `integrate`) | ≈7% | 22 |
| `StreetLightPool.update` selection | 2%; **largest allocator** (17–20% of all allocation) | 9 |
| Rain matrices (`setFromEuler`) | ≈2% | 8 |
| `AudioListener` parameter ramps | 0.8% | 21 |
| Chaos decode (`readValue`, delivery `read`) | ≈1% | 17–19 |

Corpses cost the most per event: 16 corpses add **1,920 draw calls** (40 unbatched meshes × main pass and two shadow maps) and drop the fixture from 34 to 26 fps (item 1). Dead rats also evaluate the tail's curve with `getPointAt` for every tail vertex every frame (new item N4), which made `deformTails` 11.5% of the corpse scene.

The 256-ball scene costs no more than the empty one (36 vs 34 fps, within noise), so the ball instance uploads (item 7) are small.

## Server

These ticks are about 2.5× the 27 September figures (different machine and newer code), so compare shares and back-to-back runs, not absolute numbers.

| Run | Bots ms/tick | Chaos ms/tick | Total ms/tick |
| --- | ---: | ---: | ---: |
| Idle, first 10 s (cold walk graph) | 7.9 | 3.4 | 11.5 |
| Idle, 40–60 s | 3.6 | 2.2 | 6.0 |
| Idle, warm (3–6 min) | 3.1 | 1.6 | **4.8** |
| Burst every 3 s (peak 144 balls), warm | 3.4 | 2.0 | 5.5 |

Snapshot, wire encoding and checkpoint JSON together cost 0.1–0.2 ms/tick. With zero sockets the tick is no cheaper (6.6 vs 6.4 ms), because the simulation, not delivery, dominates.

Where the warm tick goes (CPU self time):

| Cost | Share | Audit item |
| --- | --- | --- |
| cannon internals in **two worlds, each with 1,433 static bodies**: the solver's per-body loops (`solve` 20%), `integrate` 13%, `insertionSortX` 8.5%, `clearForces` 3.7%, `internalStep` 3% | **≈48%** | 27 (new detail N3) |
| `SpatialRayQuery.unchanged`: re-checks all 1,433 static poses in both worlds every step | **15.5%** | new N2 |
| `StaticCityBroadphase.collisionPairs` | 6.6% | 27 |
| Bot brain, ray queries and the chaos step | ≈8% | 13, 14 |
| Ball sweeps (`sweepSphereBody`) | 0.8% (1.6% in bursts); but 10–19% of allocation | 24 |
| Pickup checks (`collectPickup`) | 0.7%; 9–11% of allocation | 29 |

In the first minute, before the walk graph is warm, `BotNavigation.clear` is **14% of CPU and 63% of all allocation**: it builds three constant arrays and three objects per solid for every probe. This recurs after every deploy or room restart (new item N1).

## Re-ranked audit

Measured on Halla. "High" means a clear share of a saturated frame or tick.

| Rank | Item | Measured | Decision |
| --- | --- | --- | --- |
| 1 | **N3/27** Two server cannon worlds each carry 1,433 static bodies through every per-body loop | ≈48% of the warm tick | Phase 4 design choice: fewer static bodies changes contact order, so it needs an equivalence proof, not a surgical edit. |
| 2 | **N2** Static pose re-check every step | 15.5% of the warm tick | Phase 1: surgical. |
| 3 | **16** Camera raycasts per physics step | 8–12% of the client main thread | Phase 2: surgical. |
| 4 | **3** Static matrices recomputed every frame | ≈8% of the client main thread | Phase 3b. |
| 5 | **1** Unbatched corpses | +1,920 draws; −8 fps with 16 corpses | Phase 3a. |
| 6 | **10 + N4** Tail deformation, dead-tail curve evaluation | ≈6% (11.5% with corpses); top allocators | Phase 3b. |
| 7 | **22** Client cannon step | ≈7% | Phase 4 (same static-body structure as N3). |
| 8 | **9** Street-light selection | 2%, largest client allocator | Phase 3b. |
| 9 | **N1** Cold navigation probe allocations | 14% of CPU for the first minute | Phase 1: surgical. |
| 10 | **8** Rain matrices | ≈2% | Phase 3b. |
| 11 | **24, 25, 29** Sweep, ball-loop and pickup allocations | <2% CPU, ≈30% of server allocation | Phase 1: cheap. |
| 12 | **17–21, 23** Decode, validation, audio listener, small churn | ≈1% each | Phase 2. |
| 13 | **N5** A material re-selects its shader program every frame | ≈1% | Phase 3: find the material first. |
| 14 | **2, 15, 12, 13** Own-rat batching, empty stain draws, HUD writes | small, not isolated | Phase 3. |
| — | **26** No-socket snapshot | <1% of the tick | Drop. |
| — | **7** Instance buffer uploads | not measurable | Drop unless Phase 3 profiles disagree. |
| — | **4, 5, 14** Lights, shadow redraws, grain | GPU is 13–21 ms, so these matter for GPU | Phase 4 with GPU timing. |

## Reproduce

```
# server (repeat and compare hashes)
node scripts/benchmark-server-tick.mjs --scenario=idle --ticks=10800
node scripts/benchmark-server-tick.mjs --scenario=burst --ticks=9000 --profile --profile-from=5400
# client fixture (visual Vite server on 5192)
node scripts/profile-client.mjs --url='http://127.0.0.1:5192/capacity-render.html?rats=9&balls=0&corpses=16&batch=1&noir=1&mute=1' --out=test-results/client-profile --label=fixture-corpses --warmup=6000 --seconds=12
# hosted: build with `vite build --sourcemap`, deploy the capacity fixture, run the relay, then
node scripts/profile-client.mjs --url='http://127.0.0.1:5194/?room=graybox-benchmark-ai-perf1&observe=1&diagnostics=quiet&mute=1' --click='#enter-city-btn' --sourcemaps=dist --out=test-results/client-profile --label=hosted-observe --warmup=25000 --seconds=30
```

Profiles, summaries and bench JSON are in Halla's `test-results/` (not committed).

## Limits

- One machine. Halla's integrated GPU is weaker than Tyler's; the main-thread shares should transfer, the absolute frame rates will not.
- Headless Chrome with a synthetic 1280×720 window; no phone measurement.
- The server bench mirrors the room tick; the GameRoom socket, storage and movement paths are absent. Production CPU (`cpuTime`) is the final judge for Phase 1.
- The idle player stood still at its spawn; the observer did not move. Views differ between runs, so draw counts differ.
