# Compact snapshots and bounded delivery — September 8, 2026

Scope: working-tree implementation and an authenticated private capacity Worker. Production remains unchanged, including 24-player admission, eleven reserved AI slots, projectile physics, lifetimes and object caps. This is not certification for 100-player gameplay or a human animation verification.

## Implementation

- `src/shared/chaosWire.ts`: negotiated compact-v1 frames, per-stream projectile dictionaries, integer motion tuples at existing three-decimal precision, unchanged-field omission and full keyframes every 300 sent frames. Every frame includes complete projectile membership; omitted projectiles disappear. Decoding reconstructs and validates the ordinary chaos state before committing its baseline. Legacy JSON remains supported.
- `src/worker/ChaosDelivery.ts`: at most four unacknowledged snapshot frames per connection. New poses replace unsent poses. Visual impacts retain the newest 256 queued effects and drain in batches of 64; older cosmetic effects may be omitted during congestion. Launch cues remain separately queued with a bounded overflow reset. An acknowledgement timeout also resets the stream. Gameplay damage, shot and death messages retain their existing paths.
- `NetworkManager`: apply decoded gameplay state before acknowledging it; reject invalid frames and reconnect. New server streams reset the decoder baseline.
- Benchmarks use the real decoder and acknowledgement path, sample equivalent legacy packet sizes, and optionally collect aggregate process-owned TCP counters. They now report socket close codes/reasons. A separate expiring loopback preview serves the copied client build.

This bounds the chaos snapshot channel, not all outbound traffic. Per-client encoding has CPU cost; bandwidth reductions do not establish CPU headroom. Coalescing does not replay every intermediate projectile pose. Missing remote animations still require the two-window human playtest described in the hosted guide.

## Initial private measurements

Version `ea517301-23a5-439b-83ae-71d27105df06`, Worker `rat-detective-capacity-test`. The initial version reset on cosmetic impact-queue overflow as well as launch overflow and timeout. It was revised after the failures below; these measurements must not be silently attributed to the revision.

At 12 clients, 30-second warmup and planned 45-second phases:

| Phase | Payload Mbps across all clients | Gap p95 / p99 / max (ms) | Result |
| --- | ---: | --- | --- |
| Idle | 0.76 | 54 / 76 / 139 | Passed |
| Movement | 5.83 | 57 / 84 / 837 | Passed |
| Combat | 14.30 | 63 / 98 / 1118 | Failed worst-gap gate |

Ordinary combat previously measured 35.92 Mbps at a similar peak ball count (59 versus 60). Samples of equivalent decoded combat states were about 71% smaller in compact form. Aggregate comparisons are separate runs, not identical trajectories or guarantees of steady-state throughput.

A separate 12-client Scattershot attempt reached 256 balls and measured 38.90 Mbps over only 10.2 seconds, then all twelve connections closed. Equivalent-state samples were about 70% smaller. This is an aborted run, not a passing comparison against the earlier 162.64 Mbps full-length baseline. A repeat recorded close code 1013, `Snapshot stream needs reconnect`; it also failed delivery gates. The client reason does not identify which server reset condition fired. The cosmetic queue could accumulate faster than it drained under congestion, so the revision retains recent cosmetic impacts rather than disconnecting on that backlog. Timeout and launch protection remain.

Complete rosters and scoreboards passed at 2, 8, 12, 24, 32, 50, 75 and 100 clients with zero invalid messages, errors or disconnects during admission. This checked compact transport admission only, without sustained combat or browser rendering.

Artifacts under repository `output/`:

- `hosted-capacity-2026-09-08T21-11-11-613Z-compact-12/results.json`
- `hosted-capacity-2026-09-08T21-17-26-968Z-compact-scattershot/results.json`
- `hosted-capacity-2026-09-08T21-21-18-328Z-compact-scattershot-close-reasons/results.json`
- `hosted-capacity-2026-09-08T21-20-33-602Z-compact-rosters/results.json`

TCP out-of-order counters increased during the first Scattershot attempt; this is insufficient to assign the stall to the network or server. Cloudflare clock limitations still apply. See [the hosted guide](../hosted-capacity-baseline.md) and [earlier baseline](hosted-capacity-2026-09-08.md).

## Revised deployment and checks

Private version **`d6c123de-4c43-4b22-8caf-b5f81e91c933`**, fixture `22eaec29f2590433650d107b7f130df280ecc64794cd822e726588033be4f59e`, expires **2026-09-08 23:23:58 UTC / 4:23:58 PM PDT**. Deployment receipt: `output/hosted-capacity-deployment-2026-09-08T21-23-58-054Z/deployment.json`.

The first revised attempt failed during admission with a socket error and abnormal close (1006). A fresh-room repeat admitted all 12 clients and completed 45.147 seconds of Scattershot with 256 peak balls, **zero disconnects, errors or invalid frames**, and **25.40 Mbps** aggregate payload. Equivalent-state samples were **66.9% smaller** than legacy JSON. However, gap p95/p99/max was **207/796/1591 ms**, maximum observed silence 1410 ms, and generator loop p99 14 ms: **failed smoothness gates**. No higher sustained player count was attempted. Lower aggregate bandwidth partly reflects reduced delivery cadence and must not be presented as compression alone.

Revision artifacts: `hosted-capacity-2026-09-08T21-24-15-315Z-compact-revised-scattershot/results.json` and `hosted-capacity-2026-09-08T21-24-34-181Z-compact-revised-scattershot-repeat/results.json` under `output/`.

Validation: **444 tests passed** (89 Worker, 345 client, 10 script), typecheck and production build passed; existing build chunk-size warning remains. Tests cover codec precision and membership, baseline validation, legacy compatibility, acknowledgement after application, blocked-stream control traffic, resumed delivery, retained launch cues, bounded cosmetic backlog and timeout/overflow protection. Documentation links and tracked diff whitespace passed. No browser gameplay/input automation was run.

Human preview: **http://127.0.0.1:5190/?room=graybox-benchmark-human-playtest**. Ports 5180/5181 were already occupied and were left untouched. The new relay serves the revised copied client build and shuts down at fixture expiry. HTTP page/health and a separate room's welcome plus two acknowledged compact frames passed. Open the preview in two windows and move one rat while watching it from the other; visible animation and frame pacing remain unverified by a human.

Production and the existing preview relay were not deployed or restarted. Owned load generators and the diagnostic tail were stopped; only the explicitly prepared expiring human preview remains running. Follow-up priority is correlating long arrival gaps with server work and network delivery, then measuring sustained movement/combat at increasing levels after the 12-client gates pass. The bandwidth improvement alone does not justify raising public admission.

A final **100-client admission check on the revised version** also passed: every client saw all 100 roster and scoreboard entries, with zero invalid messages, errors or disconnects. Artifact: `output/hosted-capacity-2026-09-08T21-26-38-411Z-compact-revised-roster/results.json`. This remains admission-only evidence.

## Six-bot human playtest

At the user's request, `scripts/playtest-six-bots.mjs` adds exactly six headless AI clients to the existing private `graybox-benchmark-human-playtest` room through localhost:5190. It reuses the frozen fixture's `ServerBotController` navigation/physical steering and compact decoder; the private Worker still owns damage, scores and respawns. It does not add bots to public rooms or change the deployed game. The clients stop at the fixture's expiry or on a connection failure, and SIGTERM removes all six. Start it only once per room to avoid duplicate bots:

```sh
node scripts/playtest-six-bots.mjs --deployment=/absolute/deployment.json
```

This is a local playtest driver, not production AI hosting or a capacity benchmark. Syntax and protocol/activity checks validate the driver; visible animation remains for the human playtest.
