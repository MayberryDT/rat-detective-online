# AI playback and rigid batching — September 8, 2026 (PDT)

Work stopped at the user’s request after the final lower-count regression passed. The bounded 50-rat test passed all five stages; this is not a long-soak or human-client capacity certification. Public admission and deployment are unchanged. The private fifty-rat workload is 49 authoritative AI plus one observer. Human-client capacity, 100-rat acceptance and the long soak remain deferred.

## Findings and final implementation

Per-actor captures showed fresh packets (under 120 ms old) mapping to an interpolation timeline 800–1100 ms behind the receiver. Stop/go eligibility also creates false held samples, but stationary-interior holds explained only a small minority of the failing live runs. Existing raw hold and arrival gates were retained.

Clock-phase rebasing, more conservative reserves, removing rate fitting, a rolling offset envelope, receipt-only timing and a latest-receipt target were evaluated as separately labeled controls. Positive phase rebasing helped but did not reliably meet the gate. Removing rate fitting was worse. These experimental controls remain in `scripts/fixtures/PhaseCorrectedSnapshotBuffer.mjs` and can be enabled with `--playback-candidates`; normal benchmarks run only the actual implementation and frozen approved control.

`BotSnapshotBuffer` uses monotonic receiver time for server-owned `rd-ai-` streams. Pending distinct source steps delivered in bursts retain their spacing; stale source samples and old-life samples remain rejected. The final delay floor is 250 ms (five nominal AI pose updates), with the existing 350 ms upper bound and no extrapolation. Source time is not used as an absolute wall-clock mapping for these simulation-driven actors. Human remote playback retains its previous source-clock algorithm; the temporary positive phase correction was not retained there. No new animation fields, movement physics or ball tuning were introduced.

The production-shaped remote renderer now batches rigid leaves while keeping the original named procedural hierarchy and original raycast objects. Tails, muzzle effects, carry anchors and local-player geometry remain separate. A small material palette retains per-part color, emissive intensity, roughness and metalness, including hit flashes. The skinning shader uses inverse-transpose normal transforms to preserve shading under nonuniform procedural scale. Shadow geometry remains intact. Skeleton resources are explicitly disposed. Conservative rig bounds are checked against animated vertices; living-tail bounds avoid repeated scans, while death-tail bounds remain dynamic. Unlit non-shadow-casting outline tails no longer recompute unused normals.

## Same-input network evidence before final deployment

All runs below used private server version `fb043754-53ad-4614-8729-6be130e724dc`. Experimental receiver changes ran simultaneously against the same accepted poses and sample clock. Arrival-only profiles are not combined passes.

| Run suffix / phase | Previous current held | Candidate held | Interpretation |
| --- | ---: | ---: | --- |
| `phase-candidate-workloads` movement | 2.792% | 1.163% | Phase correction helps but fails hold gate |
| `phase-candidate-workloads` combat | 2.410% | 1.116% | Same limitation |
| `phase-rate-control` combat | 8.166% | 4.956% | Phase correction still fails; no-rate variant 5.354% |
| `adaptive-reserve-control` combat | 10.319% | 4.146% | Extra reserve with source mapping remains insufficient |
| `delivery-timeline-control` movement | 11.452% | 0.654% | Receiver-timed AI candidate passes hold predicate |
| `delivery-timeline-control` combat | 5.177% | 0.521% | Receiver-timed AI candidate passes hold predicate; arrival p95 101 ms fails combined acceptance |

Complete historical runs, including failures, remain under `output/hosted-capacity-*`. Fable consultations `57aa81d0-81ae-46c3-a995-69325dcdc35a` and `addf0fd5-a5b8-458d-843c-d6b478c26d8a` were reviewed and accepted as advice, not as validation receipts. Both processes stopped. The user authorized ongoing advisor use until revoked.

## Rendering evidence

Matched fixture camera, 1280×720, DPR 1, 50 rats and 256 balls. Five-second warmup and fifteen-second measurement; counters include shadows. GPU queries are asynchronous; same-pose pixel readback occurs after timing collection.

- Matching unbatched run: 5911 calls, frame p95 36.2 ms, render CPU p95 22.9 ms, GPU p95 14.50 ms.
- Palette batching sample: about 1480 calls, median frame 16.7 ms, p95 33.3 ms, render CPU p95 13.1 ms and GPU p95 12.88 ms. This establishes a substantial improvement, not a locked 60 FPS guarantee.
- Same-pose batched/unbatched pixel comparison: only 3–4 of 2,764,800 RGB channels differed by more than two levels in the sampled frames. Maximum differences ranged 4–9 levels. This is a fixed-pose rendering comparison, not human motion acceptance.
- A later sample overlapped validation/build work and is explicitly retained as `output/rigid-batch-review/palette-validation-overlap.json`; it is not used as a clean performance result.

Artifact directory: `output/rigid-batch-review/`. Vertex tests exercise walking, aiming, blinking and death poses; original picking distances/object identity and skeleton disposal are checked.

## Validation and private deployment

470 tests passed: 94 worker, 357 client, 19 script. Typecheck and build passed; the existing bundle-size advisory remains. Logs are in `output/ai-delivery-closeout/logs/`.

Private deployment: `813b58f2-ca64-4bf8-a077-52757f6b168e`, receipt `output/hosted-capacity-deployment-2026-09-09T01-53-37-374Z/deployment.json`. Expiry: 2026-09-09 03:53:37 UTC. It includes the AI-specific buffer and batching changes. The full combined-gate five-phase run is being appended after completion; no completion claim should be inferred from admission alone.

## Clean renderer confirmation

After builds/tests finished, `output/rigid-batch-review/palette-clean.json` recorded 895 measured frames: frame p50 16.7 ms, p95/p99 16.8 ms, render CPU p95 13.3 ms, presentation CPU p95 3.4 ms and GPU p95 12.686 ms. Calls: 1486 versus matching baseline 5911. The same-pose pixel comparison found only three RGB channels above a two-level difference (maximum eight). This is a clean synthetic renderer pass at approximately 60 FPS for 50 rats / 256 balls.

The first final-implementation network run (`ai-delivery-full`, 01:54 UTC) passed arrival but failed held samples: 543/26970 (2.01%) versus approved control 3508/26970 (13.01%). All remaining newest-edge holds occurred after actual packet age exceeded playback delay; the largest per-actor receipt gaps were 425–426 ms despite source gaps of 50 ms. Blackout actor-time was zero. A full-reserve same-input control is being measured; the original gate was not changed.

## Burst-spacing follow-up

Fable consultation ecf35d57-b0ed-4344-8894-6548fe0d1c6f identified near-simultaneous delivery as a concrete receiver issue. Source spacing was preserved only for exactly equal receipt timestamps. The correction also recognizes bursts separated by at most 10 ms and at most one quarter of their source interval. It shifts retained history and the render cursor together, preserving the currently displayed pose. Normal delivery and human buffers remain unchanged. A targeted one-millisecond burst regression passes.

The full-reserve control (01:58 UTC) did not reliably solve the problem: movement raw holds were 1.77% even at 350 ms, versus 3.07% at the current adaptive delay. Combat and incident full-reserve controls were 0.58% and 0.77%. The permanent 350 ms floor was not adopted.

Validation after burst correction: typecheck and build passed; 471 tests passed on repeat (94 worker, 358 client, 19 script). The first full run encountered the existing randomized eleven-bot navigation assertion; the failure and repeat logs are both retained in output/ai-delivery-closeout/logs. No navigation assertion or behavior was changed to make the repeat pass. Private deployment f66d9408-7c42-4946-b711-181e58740265 is being checked with both arrival and raw-playback gates.

## Final pending-pose reflow and measurement correction

The initial near-burst candidate was rejected for acceptance even though newest-edge holds nearly vanished. A deterministic repeated-burst test exposed accumulated presentation delay (up to 7.91 world units behind current movement, with 0.325-unit jumps in a 5 ms sample). Shifting the entire history and cursor was the cause. The corrected algorithm walks backward only through pending poses whose source spacing actually overlaps; older correctly spaced history remains untouched. It anchors the displayed pose without moving the playback cursor backward. A 250 ms AI floor covers the tested 200 ms delivery batches without recurring holds. Human timing is unchanged.

The repeated-burst characterization after correction has zero held samples, maximum 5 ms position step 0.0542 units, and maximum position lag 1.756 units at 6.5 units/second (about 270 ms). Permanent tests additionally cover three-pose batches every 150 ms and receipt jitter, asserting monotonic position, bounded steps and bounded age. These checks caught an intermediate incorrect reflow implementation; failure logs remain retained.

Playback metric version 2 preserves raw frames/held/classification and excludes only `stationaryInterior` holds from BOTH numerator and denominator: identical bracketing positions entail a stationary rendered position. The threshold remains 1%; oldest/newest/moving-interior/unknown holds remain failures. Missing classification uses the old conservative rate; inconsistent classifications fail closed. A positive-control frozen renderer remains a failure. New gates also require zero history-bound forward skips and maximum buffered render age <=600 ms (350 ms maximum adaptive delay plus 250 ms margin). Historical results are not relabeled as new combined passes. Fable independently confirmed the stationary false positive and the accumulated-delay risk; consultation 7a31dcd0-5169-4d85-b543-55139c176927 was reviewed and accepted, process stopped.

Latest code validation: 474 tests (94 worker, 359 client, 21 script), typecheck and build passed. Private deployment b614a0ea-0c23-4d09-a590-f215ab0f3fb2, receipt output/hosted-capacity-deployment-2026-09-09T02-16-30-680Z/deployment.json, includes bounded reflow. The five-phase fresh combined test is in progress.

## Delivery attribution and compact-v2

After bounded reflow, the normal-checkpoint local observer still recorded occasional real gaps; Halla also failed an arrival p95 threshold (106 ms) despite only 0.333% unintended holds and no skips. A private-only 10-second periodic-checkpoint control improved typical arrival timing but still had a 1090 ms maximum gap. A second control run passed movement/combat/incident arrival measurements. These variable workloads do not prove a single cause. The sparse-checkpoint behavior was NOT adopted in application code; normal 2500 ms player and 1000 ms chaos checkpoints remain. The optional `--checkpoint-control` fixture flag exists only for reproducing that diagnostic and is recorded in the fixture identity/overrides. Cloudflare documents [automatic SQL write coalescing and output gates](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/); wrapping existing synchronous writes in another transaction was not treated as a demonstrated cure.

Bytes-by-type attribution found roughly 70% of received application payload was chaos state. The new negotiated `compact-v2` sends lossless integer motion differences when shorter than the previous full integer row, with the existing precision, cadence, complete per-frame membership and 300-frame keyframes. Owner/identity changes and fresh baselines use full rows. The decoder validates before committing any baseline; malformed deltas, missing baselines, duplicates, overflow and negative handles on full frames are rejected. `compact-v1` and full JSON remain available. The 305-frame/256-projectile regression reconstructs exactly the existing quantized states and requires at least 20% less payload than v1. No ball tuning or simulation changes were made.

The first v2 normal-checkpoint run passed arrival (88/160/320 ms) and unintended holds (0.250%) but had a 713 ms maximum actor-history age after a sparse actor update. Its launcher options still labeled the transport v1 while the frozen client actually negotiated v2; the manifest retains the original options and an explicit correction. Subsequent launches honor explicit v1/v2 and default to v2. A bounded recovery anchor now blends from the displayed pose after a 250–999 ms receipt gap, preventing the empty delivery interval from persisting as clock debt; holds during the outage remain measured. The recovery continuity regression passes. Current full validation and fresh combined phases follow below.

## Fifty-rat combined pass

Fresh deployment 80a77630-2c7f-4197-9167-bb048b2ce3a7 completed all five 45-second phases with normal persistence intervals and compact-v2. All rosters/scoreboards retained 50 entries (49 server AI plus one observer), with zero invalid messages, unexpected disconnects or errors. Seven deliberate reconnects completed in churn. Every phase also passed the ORIGINAL raw held <=1% predicate, in addition to the classified hold and continuity checks.

| Phase | Arrival p95 / p99 / max ms | Raw held | Unintended held | Maximum render age ms | History skips | Peak balls |
| --- | --- | --- | --- | --- | --- | --- |
| idle | 98 / 135 / 349 | 0.497% | 0.275% | 339.2 | 0 | 256 |
| movement | 94 / 150 / 357 | 0.501% | 0.204% | 253.1 | 0 | 180 |
| combat | 95 / 135 / 200 | 0.864% | 0.548% | 250.0 | 0 | 183 |
| incident | 98 / 153 / 244 | 0.167% | 0.000% | 250.0 | 0 | 256 |
| churn | 100 / 145 / 213 | 0.302% | 0.083% | 331.3 | 0 | 256 |

Raw data: output/hosted-capacity-2026-09-09T02-55-07-563Z-recovery-delta-full/50.json. The raw blackout actor-time counter includes intentional victory pauses and sparse idle heartbeats, so it is retained as a diagnostic rather than claimed to be zero. This is a bounded AI workload pass, not 50 simultaneous human clients or an all-network-conditions guarantee. Final application validation passed 480 tests (97 worker, 362 client, 21 script), typecheck and build; the known randomized navigation assertion failed the first run and passed the repeat, with both logs retained. Lower-count regressions follow.

## Lower-count reconnect harness correction

The first 12-rat run passed idle/movement/combat/incident, but churn exceeded the hold threshold despite complete rosters, good arrival timing and bounded age. Closer inspection confirmed the probe already cleared tracks at reconnect start, but continued sampling and counting late frames during the deliberate closing interval. The real GameSession clears remotes on welcome. The probe now pauses sampling and ignores late packets after an intentional close begins, and a new welcome also resets its presentation sample clock without erasing accumulated metrics. The initial history-retention diagnosis was too broad. A regression verifies earlier measured holds survive the reconnect operation. All 22 script tests pass. This is a harness correction; the already-passing 50-rat run used the more conservative old churn probe.

The corrected 12-rat churn rerun passed: arrival p95/p99/max 71/178/319 ms, complete 12-entry rosters, no protocol errors, and bounded playback. The earlier 12-rat churn failure remains in its original result folder. This completes the five 12-rat stages across the original four-phase pass and the corrected churn rerun.

Known route uncertainty predates this capacity follow-up: GBrain `brain:sessions/2026/09/rat-detective-bot-navigation-regression` recorded one of eleven bots making less progress around local obstructions after the shared-flow-field fix. The existing randomized actual-city navigation assertion remains intermittently failing; no assertion was weakened or gameplay navigation changed to obtain the later passing full suite.

## Lower-count and shared-stall limits

A short 24-rat run failed idle arrival/playback; repeating with the standard 30-second warmup and 45-second phases passed idle, then hit a 1112 ms movement-delivery gap. These failures are retained, and a single full 50-rat pass is not being presented as a guarantee against all transient stalls.

The paired-socket diagnostic used 23 AI plus two observers. Movement and combat passed combined gates. Both independent connections observed the same 480 ms gap at exactly the same receiver timestamp and source timestamp, then a matched 266–267 ms gap. This contradicts attributing the pauses solely to independent per-socket packet loss; a shared server or network cause remains possible. Incident arrival passed, but the new render-age gate failed on the OTHER human observer's unchanged human SnapshotBuffer (1178 ms), not an rd-ai actor. Human-client capacity remains outside this goal; this diagnostic is not a 25-human or completed 25-rat capacity certification. No further human-buffer changes were made based on it.

The 32-rat run after deployment settled passed all five standard 45-second phases with a 30-second warmup: arrival p95 67/75/73/74/73 ms, p99 139/148/143/144/146 ms, complete 32-entry rosters, no protocol errors and all playback/continuity gates passed. The immediate post-deploy attempt disconnected during startup and is retained separately. The private deployment helper now verifies the exact new authenticated health identity before announcing readiness; this does not guarantee that every subsequent connection will be fault-free.


## Final closeout — September 8, 2026 (PDT)

The final 24-rat repeat (`output/hosted-capacity-2026-09-09T03-48-57-958Z-final-ladder-24-repeat/24.json`) passed idle, movement, combat, incident and churn, each measured for 45 seconds after a 30-second warmup. Arrival p95 was 91/93/79/91/92 ms, p99 was 160/153/155/153/169 ms, and maxima were 440/353/452/442/402 ms. Every phase passed arrival, playback and continuity gates, with complete 24-entry rosters and no protocol errors. Earlier failed attempts remain in the evidence.

The final ladder therefore has bounded passes at 12, 24, 32 and 50 total rats. Twelve passed across its initial four stages and a corrected reconnect-stage rerun; 24, 32 and 50 each passed a complete five-stage run. These runs use server-owned AI plus receiving observers, not equivalent populations of human browser clients. Intermittent delivery spikes in earlier attempts prevent a claim of universal smoothness.

Application validation passed the full 480-test suite, typecheck and build. Subsequent harness-only fixes passed 22 script tests. An earlier full-suite attempt failed the existing randomized navigation diagnostic; that failure is retained and its assertion was not weakened.

Owned benchmark, log-capture and visual-fixture processes are stopped. No new preview was started. Public deployment and admission remain unchanged. The last private fixture is version `bec007eb-205d-441a-b3b5-4b4cd8c4069a`, configured for 23 AI, with fixture expiry September 9 at 05:42:33 UTC. The successful 50-rat deployment was `80a77630-2c7f-4197-9167-bb048b2ce3a7`; lower-count fixtures used the same application source. No 100-rat acceptance, long soak, public cap increase or human playtest was performed in this closeout.
