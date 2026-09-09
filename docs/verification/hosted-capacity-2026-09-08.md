# Hosted capacity implementation and results — 2026-09-08

Implemented and deployed the private test system, then ran the ladder. **Every client received a valid complete roster and scoreboard through 100 clients. Sustained gameplay testing completed all four phases through 12 clients; 24 stopped on a delivery-gap threshold. This is not a demonstrated 12-player hard ceiling or 100-player gameplay support.**

## What shipped to the private fixture

- Shared local/hosted fixture builder with checked source anchors: copies the dirty working tree, raises admission to 100 only in that copy, fixes seed 341283204, and adds a copied 25-second Scattershot control.
- Shared full-feed client workers, bounded phase/count options, snapshot/RTT/event-loop/traffic measurements, server timestamp gaps and bounded gap examples.
- Private deployment helper with dry-run, random secret outside the repository, source hashes, deployment receipt and expiry.
- Hosted runner restricted to the dedicated private Worker; validates receipt, authentication, fixture identity and complete rosters. Stops higher sustained loads after failed quality gates, and closes sockets/threads.
- Console-only diagnostic capture that discards request data/headers, plus Markdown/CSV report generation.
- Named 100-entry scoreboard ceiling and a real NetworkManager test covering a 100-player welcome and scoreboard without disconnecting. The public admission cap stays 24.

Dedicated Worker: `rat-detective-capacity-test`, https://rat-detective-capacity-test.mayberrydt.workers.dev. Deployed version: `91f00624-89d8-4801-8a3a-fe07f0d872ef`. Fixture: `2545c2c1d468fb0f8998eef78db1cf5abbbc2d2b5acffc6685696981136411f6`. Initial expiry: **2026-09-08 22:19:25 UTC** (15:19 PDT). Expiry prevents new connections; the runner independently stops at expiry. The normal no-player room cleanup stops simulation after clients leave.

[Deployment receipt](../../output/hosted-capacity-deployment-2026-09-08T20-19-25-967Z/deployment.json) contains paths and provenance, no secret value. No deployment to production or the existing network-test relay backend occurred. The main source contains no benchmark incident control and still has `MAX_PLAYERS=24`.

## Measurements

Each sustained count: quiet admission, 30-second warmup, then 45 seconds each idle, movement, combat and Scattershot. The first attempt stopped at 2 clients after a 1,127ms movement gap; [that report is retained](../../output/hosted-capacity-2026-09-08T20-19-44-178Z-full-ladder/report.md).

A diagnostic repeat added server timestamp gap observations without changing gameplay or quality gates:

| Clients | Idle p95 | Movement p95 | Combat p95 | Scattershot p95 | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2 | 62ms | 58ms | 59ms | 64ms | All four phases passed |
| 8 | 73ms | 75ms | 76ms | 82ms | All four phases passed |
| 12 | 67ms | 69ms | 68ms | 72ms | All four phases passed |
| 24 | 53ms | — | — | — | Idle worst gap 1,874ms; stopped |
| 32–100 | — | — | — | — | Sustained phases deferred by stop gate |

The 24-client idle p99 was 135ms, generator event-loop p99 11ms, and there were no invalid updates, errors or disconnects. Several clients saw the same delivery pause; corresponding consecutive snapshot timestamps were about 33ms apart. RTT reached 1,745ms. This is evidence of a shared delivery/runtime pause, not proof of a player-count ceiling or a specific network fault. The earlier 2-client failure also prevents interpreting 12 as a stable supported maximum.

[Diagnostic repeat report and CSV](../../output/hosted-capacity-2026-09-08T20-23-16-158Z-timestamp-diagnostic/report.md) and [full results](../../output/hosted-capacity-2026-09-08T20-23-16-158Z-timestamp-diagnostic/results.json).

Scattershot reached the normal 256-ball cap at 8 and 12 clients. Aggregate received payload rates were approximately **105 Mbps** and **163 Mbps**, respectively, excluding WebSocket/TCP framing. This flags bandwidth as a scaling concern; it does not explain the 24-client idle pause, when traffic was about 4 Mbps. Ordinary combat exercised death and respawn. These event counts are recipient observations, not unique kills.

The final separate admission run checked 2, 8, 12, 24, 32, 50, 75 and 100 clients. At **every count**, every client received the full roster and scoreboard at that count, with zero invalid messages, errors or disconnects. This closes the earlier 64-score compatibility failure. [Verified admission results](../../output/hosted-capacity-2026-09-08T20-37-32-224Z-verified-rosters/results.json). An earlier full-feed admission run that finished once all welcomes arrived is retained under `output/hosted-capacity-2026-09-08T20-35-53-895Z-admission-ladder`; the final receipt additionally waits for complete rosters and collects counters after all welcomes.

## Validation and limits

- Typecheck passed; full suite **433 tests** (80 worker, 344 client, 9 script). Application build and private deployment dry-run passed, with the existing large JavaScript chunk advisory.
- Final script tests passed after the roster-completion check. The strengthened check was also exercised against all eight real hosted admission levels.
- Shared local smoke: 2 clients, 5-second warmup and four 5-second phases passed; worst gap 43ms. [Local smoke](../../output/local-capacity-2026-09-08T20-18-54-818Z-shared-harness-smoke/results.json).
- Actual private endpoint checks: unauthenticated health 401, authenticated matching fixture health 200, public room 404 and status route 404.
- All owned client and tail processes stopped; no workerd process remained. The private deployment remains available only until its configured expiry or a later explicit redeployment.

No browser rendering/input test, public AI mix, or 30-minute soak was run. Sustained levels above 24 were not forced past the stop condition. This was an active desktop over a WAN, not a dedicated load generator; application checks briefly overlapped the repeat's two-client stage. Later larger phases were not accompanied by those checks. Tail diagnostics are partial and may miss long-lived requests or sampled events.

Hosted clocks only advance after I/O, and cross-machine clock offset affects raw snapshot ages. Timestamp gaps and zero tick cost are not independent CPU profiling. See [Cloudflare's clock documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/). Further capacity qualification needs a second controlled network path/generator, longer repeat runs, a real browser/AI workload and a soak at a repeatedly passing count. Do not raise the public cap from these results.

[Commands and implementation guide](../hosted-capacity-baseline.md).
