# Local preview freeze follow-up — 2026-09-07 Pacific


> **Historical record — September 7 local-runtime investigation.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](../network-smoothness.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

The longer human play session failed after the earlier 45-second probe passed. The short run established only that one fresh preview stayed responsive for 45 seconds. It did **not** establish sustained stability or prove paging was the cause. The follow-up ran with `MemoryLow=768M`, `MemorySwapMax=0`, and zero swap reported by the supervisor during the failure. Swap protection was therefore **not a sufficient fix**.

This pass read existing journals and source only. It did not start/restart services, change gameplay code, run a browser, or perform another load test. The failed workerd PIDs were already gone; their per-thread scheduler, page-fault, and cgroup pressure counters cannot be reconstructed retrospectively.

## Observed failure

The room had twelve connected rats. Times below are UTC on September 8 (September 7 at 23:xx Pacific).

| Log time | Largest tick gap | Largest room event silence | Reported tick cost max | Completed checkpoint settlement max |
|---|---:|---:|---:|---:|
| 06:17:18 | 5,767 ms | 5,751 ms | 20 ms | 4 ms |
| 06:19:02 | 12,301 ms | 12,277 ms | 10 ms | 3 ms |
| 06:19:11 | 8,484 ms | 6,014 ms | 6 ms | 506 ms |
| 06:19:57 | 46,541 ms | 30,828 ms | 27 ms | 21 ms |

At 06:19:57, 2,911 socket events and 247 accepted shots were recorded in the reporting window, but only one simulation tick ran. Afterward the projectile pool reached its existing 256-ball cap. These counters are consistent with input arriving/being processed in bursts while simulation advancement was starved; they do not establish that bullets originally caused the starvation.

The client kept rendering. A delayed report delivered at 06:20:13 recorded a 16.7 ms median frame, no frames over 100 ms, and a 29,587 ms snapshot age. Invalid-message and send-failure counts remained zero. Client report delivery time is not its sample time: reports themselves were delayed, so matching only their log timestamps to server windows would be misleading.

The server resumed processing and logged ordinary player departures before the supervisor stopped it. The service journal reports a normal stop, 88.953 seconds of total CPU over 11 minutes 9.502 seconds, and a 1 GiB memory peak. No matching kernel OOM kill, suspend/resume, hung-task, or watchdog entry was found in the 23:10–23:21 Pacific journal interval. That is **absence of a logged kill/suspend**, not proof that resource contention or runtime blocking never occurred. Total CPU over the whole session cannot explain where time went during a particular gap.

## What existing instrumentation does not see

- `eventSilenceMaxMs` describes this room's socket-entry and timer markers. It is not an independent heartbeat for the workerd process, Wrangler proxy, other rooms, or the operating system. It cannot distinguish room input gating from global runtime scheduling, synchronous unmeasured work, or a paused process.
- `tickCostMaxMs` starts after attachment lookup and disconnected-player reconciliation. It excludes that timer prelude, all socket-handler execution, and waiting outside callbacks. Workers clocks can also be frozen within an event. A 27 ms reported cost does not rule out a long unmeasured stall.
- Checkpoint settlement observes completed `storage.sync()` probes started after chaos checkpoints, at most one outstanding. It does not separately time each player write, alarm operation, SQL call, or all runtime input/output gates. Short completed probes argue against those measured checkpoints being the whole delay; they do not eliminate every storage/runtime gating path. The 506 ms sample should not be omitted.
- Source inspection found `blockConcurrencyWhile` only around constructor migration/hydration, not an explicit recurring multi-second application lock. The timer itself is synchronous and bounded to 200 ms of catch-up simulation per callback. Neither observation identifies the runtime's cause.

## Correct interpretation and next boundary

The evidence establishes prolonged **authoritative update starvation in the local preview**, with the client renderer still responsive. It does not establish OOM, swap, a particular CPU bottleneck, a particular Durable Object gate, or a specific workerd defect as the sole cause. The earlier major-page-fault correlation remains an observation about an earlier run, not a diagnosis for this zero-swap failure.

Moving the local preview's game connection through the private hosted worker is a containment change: it bypasses the failing local simulation runtime. Its own longer probe and human playtest must be evaluated separately; do not present either a previous 45-second success or the switch itself as proof that all freezes are resolved. No physics, scoring, or projectile-cap changes are justified by this read-only pass.

If local-runtime diagnosis resumes, capture an independent process heartbeat and per-thread CPU/wait/fault/pressure samples during the actual gap, plus callback-entry/duration and storage-phase timing. Until then, avoid another speculative tuning change based solely on low reported tick cost.

Evidence: `rat-detective-stable-preview.service` user journal, kernel journal, and `src/worker/GameRoom.ts` / `src/worker/RoomDiagnostics.ts`, inspected after the stopped 23:15–23:20 Pacific play session. Raw diagnostic payloads and unrelated system log data are not copied into this document.
