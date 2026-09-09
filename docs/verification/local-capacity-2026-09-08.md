# Local capacity benchmark — September 8, 2026

## Result

The test-only server admitted 100 synthetic WebSocket clients, but **this is not a passing 100-player game test**. Sustained server/network timing degraded at much smaller populations. The original combat ladder stopped at twelve players after >10-second snapshot gaps; a corrected lighter scan stopped at 32. No level passed every long-ladder phase, so no candidate qualified for the proposed 30-minute soak.

The existing client also rejects scoreboard arrays with more than 64 entries (`src/shared/messageValidation.ts`, `parseScores`). `NetworkManager` treats a rejected server message as a connection failure. The 75/100 admission tests recorded invalid updates. Changing the room's 24-player admission constant alone therefore cannot deliver 100-player compatibility.

## Runs and findings

| Players | Workload | Result |
| --- | --- | --- |
| 2 | Four 45-second phases after 30-second warm-up | Typical snapshot p95 37–53 ms; movement had a 1.311-second pause. No protocol errors/disconnects. |
| 8 | Same four-phase ladder | Movement p95 49 ms; combat 58 ms; Scattershot 356 ms, maximum 6.606 seconds, peak 256 balls. |
| 12 | Same four-phase ladder | Movement p95 268 ms; combat 7.441 seconds; Scattershot maximum 10.290 seconds. Safety stop. |
| 24 | Corrected join-first scan, 15-second idle/movement phases after 10-second warm-up | Connected, but too few snapshots to calculate inter-snapshot gaps in either phase. Server logs recorded a 15.820-second tick gap. Failed, not zero-latency. |
| 32 | Corrected join-first scan | Connected; idle maximum gap 11.800 seconds. Stopped before movement/combat. |
| 50 | Admission only, no movement/combat | All 50 admitted; no invalid startup messages observed. No stability claim. |
| 75 | Admission only | All 75 synthetic clients admitted; 639 invalid startup-message observations. Not compatible with normal browser behavior. |
| 100 | Admission only | All 100 synthetic clients admitted; 2,781 invalid startup-message observations. Not compatible with normal browser behavior. |

Invalid-message observations count each recipient's rejection, not unique bugs. The admission harness retained connections to count successful welcomes and record protocol failures; real browser clients would take their normal failure/reconnect path. Thus the 75/100 figures do not certify real-client connection stability.

All receiving clients used the actual parser and maintained their own player state. Generator loop-delay p99 statistics were approximately 11 ms in measured phases. This supports distinguishing observed server stalls from a stalled generator; it does not identify the server's root cause. Server diagnostics show multi-second gaps and callback silence with dropped simulation time. Some delayed shot traffic was rate-limited despite nominal send rates below the configured per-second limit. Snapshot age upon eventual receipt can remain small while delivery is discontinuous: gap and silence evidence matters.

The host was in normal desktop use, with about 3.8 GiB initially available and roughly 10 GiB of existing swap usage. Available memory during the early measured phases remained above roughly 2.5 GiB. Two inspected workerd processes had zero major faults during one eight-player observation; that limited observation does not rule out paging elsewhere or establish a cause. Local workerd results are not production Cloudflare measurements.

## Method and corrections

The harness launches and owns a loopback-only local Worker on an unused port, with fresh durable state per count. It copies the current dirty source rather than HEAD. Production configuration, source limits and running hosted relays were not changed. Test-only changes: MAX_PLAYERS=100 (MAX_CONNECTIONS=108), fixed city seed 341283204, a loopback guard and a local Scattershot fixture. The normal 256-ball/16-corpse limits, ball physics, movement rate limits, protocol byte limits, AI code and simulation cadence remain intact.

The original ladder started client movement during joining, then measured only after all clients joined and the 30-second warm-up. An initial higher-count scan under this behavior timed out beyond 24 clients. A corrected scan waited for every welcome before starting traffic; it admitted 32, showing that the earlier timeout was not a hard 24-player limit. These are different admission workloads; the earlier data is retained, not rewritten.

The initial gap statistic only measured intervals between received snapshots. A phase with too few arrivals reported numeric zeros with count=0 and correctly failed its sample-count gate; those zeros must not be read as excellent latency. The final harness reports null percentiles for missing data and explicitly measures continuing silence, including when no later snapshot arrives. A new unit regression covers this. Historical JSON was preserved unchanged. The corrected guard would stop the 24-player scan earlier; no claim is made that every historical run used the final guard.

The shortened scan was a diagnostic follow-up after the heavy safety stop, not a substitute for the original full duration. The final 50/75/100 check was admission-only and sent no movement or combat traffic. No 30-minute soak or browser-input automation was performed. GPU rendering, actual animation feel, internet jitter and server AI decision-making at enlarged counts were not measured.

## Artifacts

- [Original long ladder](../../output/local-capacity-2026-09-08T19-33-30-288Z-ladder/results.json)
- [Per-phase CSV](../../output/local-capacity-2026-09-08T19-33-30-288Z-ladder/summary.csv)
- [Initial scan with traffic during joining](../../output/local-capacity-2026-09-08T19-45-47-771Z-light-scan/results.json)
- [Corrected join-first scan](../../output/local-capacity-2026-09-08T19-50-42-969Z-joined-first-scan/results.json)
- [50/75/100 admission-only results](../../output/local-capacity-2026-09-08T19-54-22-592Z-admission-only/results.json)

Each folder contains its source-hash manifest, separate per-level results and server logs. Reports include traffic, snapshot/movement age, latency histograms, host memory and process-tree CPU/RSS samples. Percentiles use millisecond bins with an overflow bin at ten seconds; exact maxima are retained. CPU is sampled coarsely from process time; summed RSS can double-count shared pages. Diagnostic windows can straddle phase boundaries. No passing capacity claim should be inferred from conditional latency samples alone.

## Harness validation

Six Node script tests passed, including bounded options, no external target, weighted histogram aggregation and the missing-snapshot/silence regression. The final guard smoke passed four five-second workloads at two clients (maximum observed gap 52 ms); this is a harness check, not evidence against the long-run stalls. Captured application source hashes remained unchanged, documentation links and whitespace checks passed, and no workerd processes remained after cleanup.

## Next steps

1. Establish reliable timing on the private hosted test backend or resolve the local runtime's callback stalls. Do not change production or blame a particular cause without comparison evidence.
2. Review all membership/scoreboard/admission limits together for a coordinated >64-player protocol change; do not raise just one constant in production.
3. Repeat the full ladder with healthy timing and real client failure behavior. Then profile fanout, message application, simulation and visible remote mesh costs separately.
4. Human-test one browser in the loaded room, including movement, firing, carrying, deaths and reconnects. Validate a realistic human/AI mix independently of the all-synthetic-human test.
5. Only a promising sustained level should advance to repeated boundary runs and the 30-minute soak. Keep projectile saturation/playability in the acceptance criteria.

Reusable runner: [benchmark-local.mjs](../../scripts/benchmark-local.mjs). Instructions: [local capacity testing](../local-capacity-testing.md). No application code, production deployment, service restart or Git commit was performed for this benchmark task.
