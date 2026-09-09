# Capacity review implementation — September 8, 2026 (PDT)

The research follow-up is being implemented in the dirty working tree. Production and public admission remain unchanged. This is not a 50-rat certification. UTC run directories roll into September 9.

## Implemented

- Hit persistence stores final victim state once, including lethal respawn deadline, and avoids unchanged nonlethal shooter writes. Regression tests check saved state and durable respawn events.
- Alarm scheduling reads the durable alarm, recomputes the pending minimum after the asynchronous read, and avoids unchanged writes. It does not cache state across hydration or alarm firing. Existing lifecycle tests and new alarm-operation checks pass.
- Source-clock labels explicitly disavow independent wall-time/CPU measurement. Counters attribute player/room writes, alarm reads/changes, snapshot offers/acceptance and movement batch tick/event flushes, occupancy and overwrite counts.
- Playback bookkeeping updates only on accepted poses. Added rejected samples, actual probe callback counts, eligible actor-time, blackout actor-time and maximum conditional hold. Existing held-sample gate remains unchanged.
- Receiver clock uses epoch-aligned monotonic integer milliseconds. New diagnostic echo is private-fixture-only, joined-socket-only and rate limited; it does not touch player activity. Reports retain echo RTT and callback processing duration separately.
- Explicit `--quality=both` requires existing arrival and playback predicates, including per-host checks; other profiles remain separately labeled.
- Renderer fixture accepts zero rats, uses a fixed 50 ms source schedule with original source timestamps, counts all shadow/main passes and supports bounded asynchronous GPU timer queries without blocking readback.
- Tail longitudinal wave calculations are reused across ring vertices and rigs. Independent before/after replay compared actual position/normal arrays byte-for-byte across walking, turning, airborne and death-floor projection scenarios. Death projection remains per rig. This is a small CPU optimization, not a crowd draw-call solution.
- A frozen approved SnapshotBuffer is available as a read-only simultaneous probe control. Current game interpolation was not rolled back or retuned.

## Measurements

All rendering rows used the same visible camera, 1280×720 viewport and DPR 1, five-second warmup and fifteen-second sample. Earlier 781×815 results are not a direct A/B.

| Rats / balls | Frame p95 ms | Render CPU p95 ms | Presentation CPU p95 ms | Whole-frame calls |
| --- | ---: | ---: | ---: | ---: |
| 0 / 0 | 16.8 | 5.5 | 0.7 | 853 |
| 0 / 256 | 16.7 | 4.1 | 0.7 | 854 |
| 50 / 0, before tail reuse | 33.4 | 27.6 | 7.0 | 5919 |
| 50 / 256, tail reuse | 35.9 | 24.2 | 5.7 | 5922 |

A later combined GPU-enabled sample measured GPU p95 17.075 ms, frame p95 37.7 ms, render-call CPU p95 24.1 ms, presentation p95 5.7 ms, 5903 calls. Separate percentiles are not additive. Scene cadence and workload vary across samples; this does not establish a causal FPS gain from the tail change. Full evidence: `output/capacity-review-implementation/renderer-matrix.json`.

Private version `e19d874e-f475-488d-82c7-e96a729fce00` (49 AI, window eight): first 50-rat run failed idle with arrival p95 70 ms but maximum 1669 ms and 1105 ms silence. Repeat passed idle arrival (82/203/479 ms p95/p99/max) and movement arrival (86/220/508), then failed combat p95 at 124 ms. Neither is a combined gameplay pass.

Version `82abbcdd-fab3-4d86-9b21-6a311be726c3` added the private echo. The first harness attempt failed warmup because fractional monotonic timestamps violated the existing integer ping schema; corrected the generator to integer milliseconds without weakening validation. The corrected run passed arrival (78/145/243 ms) and had no measured blackouts, but failed playback: 2945/34125 eligible samples held (8.63%). Ping and echo both p95 102 ms; callback processing p95 1 ms. This sample does not implicate ping activity writes as its primary delay.

## Validation and limits

Application typecheck/build passed. The final complete app suites passed 94 worker and 351 client tests; later script checks passed 17 tests. One earlier full run failed the existing randomized/time-budget-sensitive AI progress assertion; an isolated rerun and subsequent full run passed. This failure remains in logs; no navigator change or threshold relaxation was made. A temporary tail comparison initially failed from missing Node require/DOM setup; the corrected real-mesh comparison succeeded with nonempty outputs.

The latest comparison run and cleanup will be appended below. Further acceptance requires repeatable dual-gate success and the owner's visible gameplay test. Full all-count ladder, matched legacy persistence A/B, lifecycle-inclusive local CPU profile and rigid crowd geometry optimization remain unfinished. No 100-rat attempt, human-client capacity claim, public deployment or hour-long soak.

## Final same-input comparison and stopping point

Private version `fb043754-53ad-4614-8729-6be130e724dc`, run `output/hosted-capacity-2026-09-09T00-13-15-527Z-review-control`: all 50 joined; arrival p95/p99/max 75/131/292 ms; silence maximum 276 ms; ping/echo p95 both 142 ms. Current buffer held 3145/49738 samples (6.32%); simultaneous approved control held 4038/49738 (8.12%). Current probe recorded 2147 actor-ms blackout, maximum conditional hold 466 ms and zero rejected poses. Both probes received the same samples and presentation clock. The runner correctly failed combined acceptance and stopped before later phases. No rollback of the approved presentation behavior or current rate fit was made.

Final complete validation: **462 tests passed (94 worker, 351 client, 17 scripts)**, typecheck and build. Large-chunk build advisory remains. The final fixture-only GPU instrumentation and control harness were included in these checks. Final room cleanup completed through the runner; diagnostic tail and owned port-5200 fixture server stopped. Normal preview and production services remain untouched. The private deployment is expiry-limited, not removed.

This completes a tested implementation iteration, not the whole capacity objective. Remaining blockers are repeatable remote-pose continuity below the 1% hold threshold and the roughly 5900-call crowd rendering path missing 60 FPS. The full staged workload ladder, offline lifecycle profile, persistence A/B isolation and human combined acceptance remain outstanding. The owner subsequently approved additional Fable consultations until revoked. Consultation `3371b4f8-1d87-40b2-a751-415ea76682e5` completed and was accepted for probe-only classification. Its causal rankings remain hypotheses; equal source and receipt gaps do not prove a harmless stationary interval.

Next discriminator: correlate per-actor accepted source/receipt gaps, movement batch barriers, buffer occupancy/slew and hold intervals in a bounded capture. The simultaneous comparison excludes a simple “revert clock fit” solution; the echo observations do not exonerate storage/output queues during other stalled runs. Broader geometry changes need transform/shape regression evidence and the owner's eventual visual acceptance.

## Advisor follow-up: measurement classification

A deterministic perfect-delivery stop/go stream reproduced 51/999 held samples with no blackout. New harness-only classification reads the frozen buffers’ interpolation history without modifying it, separating newest-edge, oldest-edge, stationary-interior, moving-interior and unknown holds. More than 90% of this reproduction is stationary-interior; small boundary differences remain visible rather than discarded. Deliberately withholding continuous movement packets produces newest-edge holds. Both current and approved control buffers are covered. Existing raw holds and gates remain unchanged. Reports retain a bounded top-32 list of paired per-actor receipt/source gaps and hold age/occupancy categories. These are diagnostic observations, not causal labels.

An incidental harness failure exposed equal-deadline timer reordering in simulated network delay. A ready-prefix queue now preserves message order independently of timer callback ordering, uses a monotonic scheduling clock and clears queues on close. All 19 script tests passed after these harness changes. Application source was not changed in this follow-up; the earlier application validation remains separately dated above.

Bounded follow-up run `output/hosted-capacity-2026-09-09T01-04-27-279Z-hold-classification` reused private version `fb043754-53ad-4614-8729-6be130e724dc`: 50 joined, zero errors/invalid messages, arrival p95/p99/max 128/234/459 ms. Current held 6767/45338 (14.93%): 6404 newest-edge, 352 stationary-interior, 11 oldest-edge; approved held 6621/45338 (14.60%). Thus ordinary delayed stationary intervals explain only a small fraction in this run. Most newest-edge samples had two or fewer poses and packet age below adaptive delay. This supports further investigation of refill/timeline behavior, not a blanket claim that the gate is wrong. The top-gap list in this first instrumented run includes death/respawn gaps and must not be interpreted as live movement starvation. The subsequent probe excludes generation-crossing gap pairs and clears the diagnostic source timestamp on respawn. Maximum conditional hold was 929 ms despite packet recency remaining under 500 ms, demonstrating that continuing packet receipt alone does not rule out repeated-pose holds. Runner exited after the failed phase and completed its cleanup path. No public deployment or capacity increase was made.
