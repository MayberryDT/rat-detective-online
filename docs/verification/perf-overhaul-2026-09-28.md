# Optimization overhaul — 28 September 2026

Branch `perf/overhaul` (from `main` at the [baseline](perf-baseline-2026-09-28.md)), one commit per item. Private preview only; not pushed or deployed to production. Measured on Halla with the same tools, scenes and machine as the baseline, so compare against that receipt.

## Results

### Server (room tick benchmark, 9 bots, `main` vs branch, back to back)

| Run | Bots ms/tick | Chaos ms/tick | Total ms/tick |
| --- | --- | --- | --- |
| Idle, first 10 s | 7.9 → 4.4 | 3.6 → 0.8 | 11.8 → **5.3** |
| Idle, warm (2–3 min) | 3.0 → 0.4 | 1.6 → 0.3 | 4.8 → **0.9** (−81%) |
| Burst every 3 s, warm | 3.0 → 0.5 | 1.6 → 0.3 | 4.8 → **1.0** (−79%) |

Bot play is comparable: 5,107 vs 4,973 shots in three minutes, peak balls 144 vs 146. Only the physics restructure changes results (see below); every other server commit kept the trajectory hash identical.

### Client (Halla integrated GPU, 1280×720)

| Scene | fps | GPU median | CPU per frame (means or p95) | Draws |
| --- | --- | --- | --- | --- |
| Hosted observer | 30 → **43.5** | 17.3 → 12.1 ms | simulation 8.9 → 3.3, presentation 2.5 → 1.6, render 18.2 → 15.4 | 413 → 390 |
| Hosted idle player | 37 → **43** | 13.7 → 10.9 ms | simulation 6.4 → 3.0, presentation 2.4 → 1.8, render 14.0 → 16.0 (busier view) | 260 → 505 (view differs) |
| Fixture, 9 rats | 34 → **49** | 19.2 → 12.1 ms | render p95 26.2 → 18.0, presentation p95 4.9 → 3.4; frame median 33.3 → 16.7 | 954 → 933 |
| Fixture, 256 balls | 36 → **48** | 18.0 → 12.6 ms | render p95 17.8 → 17.9 | 956 → 935 |
| Fixture, 16 corpses | 26 → **38** | 20.5 → 13.7 ms | render p95 32.7 → 22.3, presentation p95 8.8 → 5.2 | 2,874 → **1,077** |

Hosted views were not identical between runs (bots move), so compare the observer rows most closely.

## What changed

Server:
- **Fixed city bodies outside Cannon's body loops** (`StaticCityBroadphase`): the ~1,430 city boxes per world are paired against moving bodies through a grid and answer `world.raycast*` through `aabbQuery`, instead of sitting in `world.bodies` where the solver, integrator and force clearing loop over them every step. Both server worlds and the client world use it. Contacts are the same pairs; their order changes, so the solver's results differ slightly (this is the physics change Tyler said can be tuned later).
- Allocation-free navigation probes, sphere sweep and pickup range checks; UTF-8 byte counts without encoding.
- (First pass, superseded by the above: fixed bodies skipped the per-step pose recheck.)

Client:
- Camera wall checks once per frame instead of once per physics step.
- Static city matrices computed once; hidden outlines skip matrix updates.
- Corpses and the local rat draw as one skinned batch like remote rats.
- Tail wave and death projection once per ring, not per vertex.
- Street-light selection and rain without per-frame allocation or per-drop rotations.
- No more per-frame shader re-selection: additive or flat double-sided transparent materials render in one pass; launcher instances and the outline tail own their materials.
- **The eight sewer lamps are hidden above ground** instead of set to zero; every lit pixel had been computing them. Both light variants compile during loading. About −30% GPU on the street.
- Smaller: chaos validation and decoding, local-shot reconciliation, audio listener ramps, empty stain draws.

## Checks

- Typecheck and builds pass. Client suite 1,206/1,206; scripts 123/123; Worker suite 175/176, the failure being the known ten-rat-cap timeout that passes alone.
- New test: fixed city bodies keep every contact pair and every Cannon raycast hit of a reference world with the city in `world.bodies`.
- The 120-ball burst test now compares the ray index against Cannon's raycast on identical physics.
- Tests that pinned implementation details (one shared outline material, `TextEncoder` calls, world body counts) now check behaviour.
- Batched-versus-unbatched corpses: 18 of 2.7 million colour channels differed by more than 2 levels (the same batching remote rats already use).

## For Tyler's playtest

- Physics contact order changed: rats, cases and corpses may settle or bounce very slightly differently.
- Corpses and your own rat now use the batched model. The rat should look identical; say if anything about your rat, its outline or corpses looks off.
- Measured but not changed, because they change the look: freezing the shadow maps (−1 to −3 ms) or dropping them (−3 ms GPU, −6 ms CPU).

## Remaining

Render submission (three.js traversal and draw calls, ≈15 ms CPU on Halla) is now the largest cost. Rats still pose about 1,400 nodes per frame. Production CPU (`cpuTime`) and a real-phone check have not been measured.
