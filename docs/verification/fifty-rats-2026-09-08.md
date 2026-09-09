# Fifty-rat capacity work — September 8, 2026

Paused for independent research after the final measured stage. The target is **50 total rats**, with the hour-long soak explicitly deferred. No public admission change or production deployment has been made. The approved playback baseline is preserved in `output/approved-playback-baseline-2026-09-08/baseline.tar.gz` with its manifest.

## Implemented and under evaluation

- Prepare compact snapshot motion/rest fragments once per broadcast, retaining per-connection dictionaries, acknowledgements and bounded event queues. The 50-recipient / 256-ball local codec benchmark reduced encoding time by about 88%; this is a local microbenchmark, not a Cloudflare CPU measurement.
- Distribute full-feed generators across Veelox and Halla; label results by host. Optional clustered placement, bounded application-level latency/jitter, reconnect churn and eleven production-controller AI rats in private rooms. AI cleanup and expiry are test-fixture controls, absent from the production room.
- Compare four versus eight outstanding snapshots in the private copied fixture. The application default remains four. Additional fixture pong counters measure coalescing and in-flight frames.
- A no-input renderer fixture uses actual city, remote animation and chaos views with synthetic positions. It measures rendering separately from network capacity.
- Share each rat's identical outline material across its parts, retaining the existing tint, silhouette, animation and death fade.

## Evidence so far

| Run | Result |
| --- | --- |
| Original distributed 12-rat baseline, 45 seconds per phase | Idle, movement and combat passed; Scattershot failed p95 arrival gap at 105 ms |
| Prepared encoding, four-frame window, 12 rats | Idle failed p95 at 102 ms; no errors/disconnects |
| Eight-frame window, 12-rat idle, 45 seconds | Aggregate gates passed (p95 94 ms, p99 131 ms, maximum 836 ms); Halla alone still had p95 110 ms. Not proof that the window eliminates stalls |
| Eight-frame distributed ladder retry | Failed during join with abnormal socket closes and a join timeout; higher levels not attempted |
| Eleven AI plus one client, 45 seconds per phase | Idle, movement, combat, Scattershot and churn passed; ladder advanced to 24 |
| Eleven AI plus one client, 15-second movement and churn phases | Both passed, complete roster recovered, cleanup returned successfully. Short harness smoke only |
| Renderer before material sharing, 12 rats / 256 balls | Frame p95 16.8 ms; render submission p95 8.3 ms; 961 draw calls |
| Renderer before material sharing, 50 rats / 256 balls | Frame p95 33.4 ms; render submission p95 25.1 ms; 2,899 draw calls |

**Screenshot review found the initial camera occluded by a building. The rows above are submitted-work measurements only, not visible-crowd validation. The fixture was corrected; see the final receipt below.**

Renderer viewport was 781×815, DPR 1.10, visible tab, five-second warmup and fifteen-second measurement. CPU submission is not GPU time. These measurements do not certify end-to-end gameplay or full-screen performance.

The first eight-frame idle test still coalesced snapshots (194 on Veelox and 221 on Halla). Server simulation timestamps had 33 ms p95 gaps but occasional gaps over 600 ms. The raw per-host evidence must remain visible even when an aggregate gate passes.

Fable was consulted after distinct unsuccessful capacity approaches. Its ACK-window hypothesis motivated a bounded private experiment; inspection confirmed ACKs already occur on decode/buffer insertion without waiting for presentation. Movement batching and an explicit playback quality profile were subsequently implemented and tested; neither establishes a capacity guarantee. Both permitted advisor consultations in this task have been used.

## Clock-rate follow-up

A 50-rat run reported server ping timestamps 5.2 seconds old on average while round-trip ping latency averaged 104 ms. Movement/snapshot timestamps showed similar ages. This rules out interpreting raw timestamp age as network transit alone. Cloudflare freezes timer APIs during CPU execution ([runtime documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/)); the exact hosted timing mechanism remains an inference.

The presentation buffer now estimates source-clock rate from a bounded eight-window lower-latency sample history. Fits use pairwise slopes separated by at least two seconds, bounded to 0.5–2× and adjusted at most 0.05 per observation window. History and playback cursor are remapped together, retaining rendered pose continuity. The existing 100–350 ms buffer, 90–110% playback slew, no extrapolation and lifecycle barriers remain. Tests cover ordinary jitter and source clocks 25–50% slower than receipt time. The approved continuous moving-rat replay still holds 0.45% of frames, with maximum step 0.273 units versus 0.282 previously; its delay estimate increased to about 288 ms.

`--quality=playback` is an explicit new profile; default arrival gates are unchanged. It requires at least 600 eligible moving-pose frames with ≤1% held, complete rosters, no invalid messages/errors/unexpected disconnections/skipped sends, generator loop p99 ≤25 ms, no ≥1-second delivery/silence, and bounded source gaps. Every report retains separate `arrivalPassed` and `playbackPassed` verdicts. This does not retroactively turn earlier failures into passes. The initial probe mistakenly discarded rate history on respawn; it was corrected to match the game's retained buffer history before repeat validation.

## Remaining acceptance work

Complete and repeat the staged ladder through 50 with movement, combat, Scattershot, reconnects, clustered/dispersed positioning, AI workload and latency/jitter. Measure actual playback continuity under load, inspect failures and resource cleanup, finish rendering comparisons and focused/full validation. Record precise private deployment versions and retained reports. **Fifty-rat gameplay is not yet verified.**

## Final stop and research handoff

At the owner’s request, iteration stopped after `fifty-batched` on private version `b0c268e6-af2a-437e-9b5c-bcc008deb697`. All 50 rats joined (49 server AI, one observer), but the first 45-second phase failed: arrival gap p95 1,157 ms, p99 1,679 ms, maximum 2,735 ms; maximum silence 2,191 ms; 5,863 held samples out of 49,868 eligible rat-frame samples (11.76%). Both arrival and playback quality profiles failed. Later phases were not attempted. Server cleanup logs reached zero players/connections. Public admission and production remain unchanged.

The corrected visible renderer fixture measured frame p95 33.4 ms, render submission CPU p95 23.6 ms, presentation CPU p95 6.8 ms, 2,986 draw calls and 1,319,843 triangles at 781×815 / DPR 1.10. This is roughly 30 FPS without networking, not a successful end-to-end 50-rat playtest.

Final application validation passed 457 tests (92 worker, 351 client, 14 scripts), typecheck and build. A subsequent preview CLI room/cleanup edit was syntax-checked only. The full working-source and evidence package is `/home/tyler/Downloads/rat-detective-research-handoff-2026-09-08.zip`, with `HANDOFF.md`, a short `RESEARCH-PROMPT.md`, raw result reports, diagnostics, replay evidence, local CPU profiles, advisor feedback and a hash manifest. Fifty-rat acceptance remains unfinished; future experiments described above are deferred pending research.
