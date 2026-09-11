# Optimization qualification - September 11, 2026

This receipt closes the unpublished `codex/optimization-research` work: the
accepted physics-playback, responsive-shooting and audio work from the original
checkout are reconciled with the optimization's protocol-9, shared-presentation
clock, outcome and pickup diagnostics work, and the recorded acceptance
criteria are measured on that reconciled source. It is not a deployment
receipt. Nothing was deployed, merged or pushed, and no production or
public-room traffic was touched.

An earlier same-day pass (`reconcile-1`/`reconcile-16`/`reconcile-render-1`)
measured a partially reconciled tree. This receipt supersedes those numbers
with the final reconciled source. The baseline comparison still refers to
`output/optimization/baseline/` and
`output/optimization-rendering/baseline-hardware/`.

## What changed in the reconciliation

The baseline commit `3254e3d` was a byte-for-byte snapshot of the original
dirty checkout. The original checkout then committed the accepted
"responsive shooting and smooth world playback" work as `ae2fdb3`. That work
was ported in and merged with the optimization changes:

- `LocalShotPresentation`, `shotPattern`, `SpatialRayQuery`, `CheeseGun` and
  the accepted `ChaosSimulation` volley resolution are taken from the accepted
  source. `ChaosView` now starts one immediate real-ID ball per accepted local
  input (`fire`), merges the authoritative confirmation (`confirm`), reconciles
  through the indexed presentation sweeps, and never replays the local gun on
  the owner echo. `GameSession` calls `chaos.fire(shot)` only after a successful
  send and passes `gun.tracePresentation`.
- `ChaosPresentation` keeps the optimization's shared clock: remote rats,
  balls, bodies, cases and remote presentation events sample one
  `WorldPresentationClock` cursor (32 samples, 100-350 ms adaptive reserve,
  90-110% advancement, 80 ms bounded prediction edge, one-second reset,
  stale-observation rejection, explicit `reanchor`). The optimization's
  `outcome` terminal handling, `ChaosView` corpse pooling and bounded
  historical lifecycle selection are retained alongside the responsive shots.
- New real birth payloads go only to the firing player. Observers keep the
  production shot packet and snapshot playback; the owner echo never adds a
  second ball or replays the gun.
- The accepted audio mix (gun gain .4, common world fade scale 32) and the
  quiet-diagnostic change (no synchronous history write or console object per
  report during play) match the accepted source byte for byte.

Preserved: 16 total rats, 256 balls, all eight weaponized cases, 2.5-second ball
lifetime, real animated muzzle origins, no guessed local projectiles, ordinary
speed/gravity/bounce, no self or friendly damage, and the accepted
controls/camera/art/lighting/shadow/audio/scoring/AI.

## Offline collision, presentation and corpse cost

```sh
node scripts/benchmark-optimization.mjs reconcile-2
```

Report: `output/optimization/reconcile-2/report.json`.

Owner-eligibility fixtures (`eligibleContact`):

| Obstacle | Owner on path | Baseline | Reconciled |
| --- | --- | --- | --- |
| victim body/head | yes | matched control | true |
| victim body/head | no | matched control | true |
| static wall | yes | matched control | true |
| static wall | no | matched control | true |

Shared presentation timing (`now - presented source time`), 60 Hz frames after
an 8 s warm-in:

| Track | Rat age median | Ball age median | Disagreement p95 |
| --- | ---: | ---: | ---: |
| Baseline human | 99.99 ms | 75 ms | 25.0 ms |
| Baseline AI | 249.96 ms | 75 ms | 174.98 ms |
| Reconciled human | 100 ms | 100 ms | 1.18e-12 ms |
| Reconciled AI | 100 ms | 100 ms | 1.18e-12 ms |

AI delay improves from 250 ms to 100 ms, and every track samples the same room
time to numerical precision (well inside one 60 Hz step). The ball is no longer
presented ahead of the rats.

Corpse lifecycle CPU, eight bursts of sixteen real corpse rigs:

| Mode | Median lifecycle ms | Median pose ms |
| --- | ---: | ---: |
| Unbatched (contemporaneous control) | 125.90 | 15.51 |
| Cold batching | 310.19 | 17.50 |
| Warmed pooled (reconciled) | **4.75** | 15.46 |

Pooled reuse lowers lifecycle CPU work **96.2%** against this run's control and
95.9% against the original 115.67 ms baseline median, well past the required
20%. Cold batching alone remains a regression and is not the shipped path. The
pool retains 48 rigs (16 per hat geometry), holds at most 16 active, and resets
and disposes within that bound.

## Sixteen-client all-incident delivery

```sh
node scripts/benchmark-local.mjs --players=16 --phases=incident --warmup=5 \
  --phase-seconds=260 --storage=tmpfs --latency=75 --jitter=25 \
  --layout=clustered --label=reconcile-16
```

Artifacts:
`output/local-capacity-2026-09-11T08-22-26-383Z-reconcile-16/`.

| Metric | Baseline | Reconciled | Gate |
| --- | ---: | ---: | --- |
| Snapshot gap p95 | 57 ms | 53 ms | - |
| Snapshot gap p99 | 63 ms | **59 ms** | < 100 ms |
| Snapshot gap max | 96 ms | 93 ms | no unexplained >= 1 s gap |
| Server source gap p99 | - | 50 ms | - |
| Generator event-loop p99 | 12 ms | 11 ms | <= 25 ms |
| Invalid messages | 0 | **0** | 0 |
| Errors | 0 | **0** | 0 |
| Unexpected disconnects | - | **0** | 0 |
| Skipped sends | - | **0** | 0 |
| Peak balls | 256 | 256 | 256 |
| Longest silence | - | 68 ms | - |
| Incidents exercised | - | all ten | all ten |
| Missing case snapshots | - | 0 | 0 |
| Tampering case snapshots | - | 10512 | eight cases retained |
| Aggregate payload | 43.56 Mbit/s | 46.42 Mbit/s | - |

All existing gates pass: `passed`, `arrivalPassed`, `playbackPassed` and
`rosterPassed` are true. This is loopback plus application-imposed 75 ms
delay/25 ms jitter on tmpfs - not hosted durability or real packet-loss
evidence. Payload rose modestly; the byte-reduction profile remains open.

## Hardware rendering

```sh
npm run visual:build
node scripts/benchmark-rendering.mjs reconcile-render-2 120 3
```

Fixture: `test/visual/optimization-render.{html,ts}` - the real city, remotes,
ChaosView, 16 rats, 16 churning corpses, 256 balls and 8 cases at 1280x720,
DPR 1, ten-second warmup and three 120-second runs. The runner records the
`dist-visual` bundle hash in `environment.json` so a later rebuild cannot
silently re-label a different artifact.

Artifacts: `output/optimization-rendering/{baseline-hardware,reconcile-render-2}/`.
GPU: ANGLE (Intel, Mesa Intel(R) Arc(TM) Graphics (MTL), OpenGL ES 3.2).

| Metric | Baseline runs | Reconciled runs |
| --- | --- | --- |
| Draw calls | 1934 / 1934 / 1934 | **1134 / 1134 / 1134** |
| Frame interval p99 ms | 33.3 / 33.4 / 33.4 | **16.8 / 16.8 / 16.8** |
| Frames over fixture budget | 100 / 146 / 300 | **2 / 3 / 3** |
| Snapshot apply p95 ms | - | 0.20 / 0.20 / 0.20 |
| Maximum snapshot/apply CPU ms | 27.7 / 32.0 / 27.4 | **1.5 / 7.1 / 1.2** |
| Render submission p95 ms | 13.7 / 14.6 / 14.0 | 10.5 / 10.7 / 10.1 |
| GPU p95 ms | 10.81 / 10.95 / 13.54 | 11.34 / 11.18 / 11.39 |
| Renderer geometries / textures | 1119 / 122 | 815 / 170 |
| Preparation ms | 3003.9 / 826.9 / 874.1 | 2959.9 / 801.4 / 799.4 |

The pooled/batched mechanism halves draw calls, halves the frame interval and
removes almost all over-budget frames. GPU p95 is statistically unchanged;
this is not a uniform GPU speedup, and more retained textures plus extra
preparation are the measured tradeoff. A fixed-pose comparison against the
same rigs' original source meshes found **zero channels differing by more than
2** (maximum difference 1) across 2,764,800 channels with `samePose: true`.

## Contract tests, typecheck and builds

| Check | Result |
| --- | --- |
| `npm test` | 135 Worker + 723 client + 25 script = **883 passed** |
| `npm run typecheck` | clean (source and test configs) |
| `npm run build` | clean (existing chunk-size warning) |
| `npm run visual:build` | clean |
| `git diff --check` | clean |

The Worker/socket suite covers bounded outcome batching without loss or
reordering, per-reason rejected-shot correlation, one acceptance plus a
duplicate rejection for a replayed shot ID, an authoritative `expired` outcome
for a real shot that never appears in a later snapshot, and a throttled pickup
diagnostic with an explicit reason. Shared-module `actionOutcomes` tests cover
between-snapshot contact, expiry/capacity/reset epochs, terminal-before-first-
draw suppression, journal/queue bounds and malformed protocol input. Client
`session`/`chaosProjectiles` tests cover the single immediate local ball, the
owner-only birth echo and the accepted muzzle/instanced-ball reconciliation.
Logs: `output/reconcile-2/*.log`, `output/optimization/reconcile-final-*.log`.
Source and built-asset hashes are in `output/optimization/handoff-manifest.json`.

## Second optimization pass - measured headroom

After the reconciliation closed, a further pass attacked the remaining
measured costs and added attribution for the ones that were still guesses.
Nothing in the accepted gameplay, physics, audio or visuals changed.

Changed:

- `RatAnimator` now caches each tail's authored tube-curve projection per
  vertex (`Float64Array`, bit-identical to the per-frame evaluation) instead of
  re-running `path.getPointAt()` for every vertex of every corpse every frame.
  The reused wave map also stops allocating per frame. Corpus pose CPU for 16
  real corpse rigs fell from **15.46 ms to 6.68 ms (-57%)**; pooled lifecycle
  cost is unchanged at **4.57 ms**. New test
  `test/client/corpseRigPool.test.ts` asserts the cached sample equals the
  authored curve bit for bit.
- `SpatialRayQuery` now maintains its dynamic-body list from add/remove events,
  so only a static add/remove invalidates the BVH. The authority simulation
  still calls `refresh()` once per step explicitly, so this does not remove
  that scan; it removes the redundant internal refresh on the client
  presentation trace and bot paths.

New attribution (all outside the measured interval):

- The sixteen-client runner reports `wireBytesByType`, `maxInFlight` and
  `coalescedSnapshots`. The `opt-16` run attributes the payload: **chaos
  87.9%**, shotOutcomes 3.8%, playerShot 2.9%, scoreboardUpdate 1.9%,
  playersMoved 1.7%, damage/death/respawn 1.7%. `maxBuffered` 1337,
  `maxInFlight` 6 of 8, zero coalesced snapshots.
- The rendering fixture reports a per-phase split (`move`, `state`, `present`,
  `render`) and a draw-call attribution by category. City scenery dominates:
  scenery meshes 925 calls over 2418 objects, then groups 249, cases 72,
  chaos 52, city fixtures 42, incident props 41, sprites 16 (indicative; the
  per-child isolation can double-count shared passes).
- The offline benchmark additionally encodes the same 30 Hz 256-ball stream
  with and without delta motion. Delta framing is **26% smaller**
  (17,762 to 13,153 bytes/frame) for +0.19 ms/frame encode CPU. This confirms
  the already-shipped `compact-v2` delta path rather than proposing a change:
  `NetworkManager` already requests `chaos=compact-v2`.
- `LocalShotPresentation` replay of one responsive local ball costs
  **0.23 ms over 150 frames**, so the added local reconciliation is not a
  measurable client cost.

Measurements on the changed source:

| Check | Result |
| --- | --- |
| `opt-2`/`opt-3` offline | collisions all eligible; shared clock 100/100 ms, disagreement 1.2e-12; pooled pose 6.68 ms |
| `opt-16` sixteen-client | gap p99 **62 ms**, generator p99 11 ms, invalid/errors/disconnects/skipped **0**, 256 balls, all ten incidents, eight retained cases, gates pass |
| `opt-render` rendering | 1134 draw calls, pixel parity (0 channels > 2, `samePose: true`), `present` p95 2.9-3.1 ms (improved) |
| `npm test` | 135 Worker + 723 client + 25 script = **883 passed** |

The `opt-render` sessions ran alongside a user desktop browser and other
desktop work, so CPU-side `render` time and over-budget frames were inflated
relative to the quieter `reconcile-render-2` session (render p95 12-13 ms vs
10.1-10.7 ms) while GPU p95 was unchanged or lower (11.0 vs 11.3 ms). That
pattern is CPU contention, not a rendering regression; draw calls and the
pixel comparison are identical. The corpse-pose win shows up in the CPU
`present` phase (2.9 vs 3.5 ms p95).

Deliberately not shipped (each changes accepted behaviour and needs human
review, so it is recorded rather than guessed):

- Interest management / per-client ball-and-corpse culling. Chaos is 87.9% of
  bytes, but culling can hide interacting balls, and the Tampering incident
  requires all eight cases visible.
- Snapshot-rate reduction (30 Hz to 20 Hz) and transport compression.
- Distance/settled LOD for corpse tail animation (a presentation
  approximation; the safe, bit-exact curve cache was taken instead).
- Merging static city scenery, which the new attribution shows is the largest
  draw-call group (925 calls / 2418 objects). It needs a geometry-merge pass
  with its own visual comparison.
- Backend or durability migration; storage gates remain a plausible cause, not
  an established one.

## Practice-mode diagnostics fix

The solo-versus-eleven-bots playtest surfaced a repeating "Invalid message"
notice plus a freeze/reconnect cycle about two minutes in. Root cause was in
the protocol-9 diagnostics work: `GameSession` passed
`actions: this.actions.snapshot()` into the per-frame stats details, and
`PerformanceStats` publishes those details to the server every five seconds.
The journal grows to 256 entries, so the published report exceeded the
8192-byte client message budget; `parseClientMessage` rejected it before the
server-side sanitizer could trim it, and the room answered `Invalid message`
every five seconds. The same journal was also re-serialized into the local
`localStorage` diagnostics snapshot (up to 120 reports of 256 entries): a
multi-megabyte synchronous write on pointer-lock loss or pagehide, which can
block the browser main thread past the five-second delivery acknowledgement
bound that `ConnectionDelivery.check()` enforces. That close/reconnect is the
observed freeze, play, freeze cycle.

Fixed:

- `ActionJournal.summary(recent = 8)` publishes a total plus the newest eight
  entries. The full journal stays local for the F8 export.
- `PerformanceStats.record` accepts a lazy details thunk and builds the report
  only when one is actually published, so nothing is copied per frame.
- `NetworkManager.send` refuses any outbound message larger than
  `MAX_MESSAGE_BYTES` (counted as `oversizeCount`, warned once), so an
  oversized client message can no longer be classified as invalid input.
- `oversizeCount` joins the networked diagnostics allowlist.

Regression tests: `test/client/actionOutcomes.test.ts` asserts the published
report shape stays under budget with a full journal, and
`test/client/network.test.ts` asserts an oversized outbound message is dropped
and counted. 885 tests, typecheck, production build and visual build pass.

## Remaining limitations

- Nothing is deployed or merged. Production and the private protocol-8 preview
  are unchanged; the worktree tentatively uses protocol 9.
- The rendering fixture has no player input or network and is one fixed view
  plus one fixed-pose comparison. It is not a human visual-acceptance gate, and
  frames over budget were not entirely eliminated (2-3 of ~7200).
- Browser CPU/GPU figures identify one Intel Arc host at 1280x720, DPR 1. No
  physical phone, hosted sixteen-human or universal-device performance was
  measured. Missing GPU timing would be unavailable, not zero.
- Pickup confirmation latency is verified structurally (explicit reasons, real
  LOS query, throttled status, authoritative ownership via chaos owner
  transition) and by the pure gate plus Worker throttle tests. No measured
  p95 eligible-confirmation/RTT experiment was run.
- The conditional relative-motion collision and bounded launch catch-up
  experiment remains unimplemented; no fairness-changing lag compensation is
  enabled.
- Wire/query/persistence profiling remains open. Payload rose slightly in this
  run; lossless byte reductions and static-query/aim-query maintenance were not
  implemented. Storage output gates are a plausible mechanism, not an
  established cause.
- Human playtesting of the reconciled playback, responsive shooting, audio and
  pickup diagnostics remains Tyler's; automated gameplay/pointer-lock/input
  checks were not run, per project policy.
