# Historical network investigation — September 7–8, 2026

This is a dated measurement narrative, including a mitigation that later failed. It is not the current deployment or preview guide. See [current network guidance](../network-smoothness.md) and [live service](../live-service.md).

# Network smoothness

**Follow-up: the local-runtime mitigation failed in human play.** A later session recorded a 46,541 ms tick gap while client rendering stayed smooth and the service had zero swap. The short fresh-process result below did not establish a durable fix. The normal port5174 preview now uses `rat-detective-game-preview.service`, a lightweight relay to the private hosted backend; the old local workerd service is stopped. No further physics or presentation changes were made to address that server freeze.

This pass separates server update stalls from display jitter. A smooth renderer cannot compensate for a server that stops delivering state for seconds.

## Presentation

Remote rats use a bounded history of timestamped poses instead of easing toward the most recently received position. The server timestamp preserves spacing inside delayed packet batches; older servers fall back to receipt times. Interpolation adapts between 75 and 200 ms and never extrapolates remote rats through walls. Respawns, teleports and long gaps reset incompatible history.

Balls, loose cases and ragdolls use approximately 75 ms of interpolation with six samples per object. Extrapolation remains capped at the previous 80 ms. New balls appear immediately and acquire the delay gradually; removed objects disappear immediately. Velocity reversals and charged-ball transitions discard incompatible paths. Case ownership and HUD updates remain immediate. Solo prototype simulation bypasses the buffer.

These are presentation delays, not changes to simulation speed or projectile physics. Local movement and predicted firing remain immediate. Bots calculate muzzle positions from their actual simulation pose and send that pose before a shot, independently of their interpolated display model.

## Repeatable transport probe

Run `node scripts/probe-network.mjs http://127.0.0.1:5174 --seconds=45 --output=/tmp/rat-network-local.json`.

The bounded probe uses twelve sockets: one complete state receiver and eleven welcome-only bot connections. It sends human poses at 20 Hz, bot poses at 10 Hz, shots every 1.2 seconds and pings every second. `--seconds=300 --shot-ms=500` runs a five-minute sustained firing check; durations are capped at300 seconds and firing intervals at a minimum350 ms. It records update-gap percentiles, RTT, message bytes, disconnects and the probe process's own event-loop delay. Optional `--pids=PID,PID` records Linux process faults, scheduler wait and swapped memory. This is a transport workload, not a full gameplay or capacity benchmark; fresh rooms may have different procedural seeds.

For the isolated hosted endpoint, add `--token-file=/path/to/private.json`. That file contains `NETWORK_TEST_TOKEN`; never put the token in a URL or command line. The separate `wrangler.network-test.jsonc` deployment exposes only authenticated `/health` and `/ws`, with its own Durable Object namespace and no game assets. It does not change production or staging.

The wrapper follows Cloudflare's [environment separation](https://developers.cloudflare.com/workers/wrangler/environments/) and [secret deployment](https://developers.cloudflare.com/workers/configuration/secrets/) mechanisms. Checkpoint observations retain the existing [storage guarantees](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

## Playable comparison

`npm run preview:hosted` serves the current `dist` on localhost (default port 5175) and relays WebSockets to the authenticated test Worker. Set `RAT_NETWORK_ORIGIN` to its HTTPS origin and `RAT_NETWORK_TOKEN_FILE` to the private JSON file. Build first with `npm run build`. The relay binds only to 127.0.0.1, checks the local Host/Origin, bounds queues, keeps credentials server-side and retains sanitized client diagnostics in its local log. It makes no periodic HTTP requests. `/health` reports relay health, not upstream availability.

The active comparison service is `rat-detective-hosted-preview.service`. Read automatic client reports with `journalctl --user -u rat-detective-hosted-preview.service --since '10 minutes ago'`. Hosted room diagnostics are in the separate test Worker's Cloudflare logs.

The local workerd service on 5174 was restarted with runtime-only `MemoryLow=768M` and `MemorySwapMax=0`. These protect that service from reclaim and swapping; no global VM settings were changed. Protection is not a reserved RAM allocation or a guarantee against exhaustion. It has not yet been validated after prolonged idle or host memory pressure.

## September 7 measurements

Each transport run lasted 45 seconds. All had twelve connections and zero disconnects or protocol errors.

| Run | Update gap p95 | Worst gap | Gaps over 250 ms | Ping p95 |
| --- | ---: | ---: | ---: | ---: |
| Existing local runtime | 1,718 ms | 4,512 ms | 18 | 6,727 ms |
| Original server, private hosted | 67 ms | 167 ms | 0 | 49 ms |
| Fresh protected local candidate | 37 ms | 44 ms | 0 | 4 ms |
| Updated hosted server through playable relay | 61 ms | 254 ms | 1 | 42 ms |

The existing local workerd incurred 13,291 major page faults during the run; the fresh candidate incurred four. Probe event-loop delay stayed around 11 ms. The local baseline overlapped another active room; the candidate also combined a restart, memory protection and code changes. These comparisons strongly support a local runtime/paging contribution, but do **not** isolate swap protection or prove a code-only latency reduction. Different room seeds and physical outcomes also varied projectile counts (60–256 peak); this is not a capacity certification.

Independent checks isolate two specific improvements:

- A real Durable Object test sends 150 identical idle poses and observes 13 movement broadcasts (91% fewer), while checkpoints and activity remain intact. Moving poses and corrections are immediate. This does not explain the transport probe's improvement because its rats continuously change poses.
- A deterministic 100-units/sec jitter replay reduces the worst unexpected displayed correction from 2.5 to 0.276 units (89% lower). This measures presentation, not latency, physics accuracy or human hit feel.

Raw bounded reports are in [verification/network-2026-09-07](network-2026-09-07/). Original hosted version: `082ba2ad-a327-4032-930c-4e243c6dfc95`; updated private hosted version: `b959490c-28cc-4915-8765-64098bef4393`. Production and ordinary staging were not deployed. Browser input tests were intentionally left to human playtesting.

## Sustained hosted follow-up

After the local mitigation failed, the main5174 path was switched to the authenticated hosted relay and tested for300seconds with twelve probe clients firing every500ms:7,148 shots, peak256balls, zero disconnects/errors. Update gaps: mean33.03ms, p9575ms, p99114ms, max381ms; three gaps exceeded250ms. Ping p9565ms/max245ms. No multi-second gap occurred. A separate human play session was active during part of this run; its sampled diagnostics also showed fresh snapshots and smooth frame timing. This remains a bounded transport check, not a guarantee against future freezes. See `verification/network-2026-09-07/rat-network-hosted-sustained.json` and `verification/local-freeze-followup.md`.
