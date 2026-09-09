# Local capacity benchmark

Results from the first run: [September 8 receipt](verification/local-capacity-2026-09-08.md).

The benchmark is a synthetic single-room server/network test. It does not certify browser frame rate, player feel, production Cloudflare capacity or AI navigation at the same count.

Run from the project with installed dependencies and a current `dist` build:

```sh
node scripts/benchmark-local.mjs
```

Default ladder: 2, 8, 12, 24, 32, 50, 75, 100 synthetic humans. Clients wait for all welcomes before movement traffic begins. Each level gets a fresh loopback-only Worker, 30 seconds of warm-up, then 45 seconds each of idle, movement, combat and Scattershot. All clients receive and validate the complete feed using the real server-message parser. Four Node worker threads share load generation (two at the two-player level).

The script accepts no target URL. It creates its own port, source copy and durable state under a timestamped `output/local-capacity-*` directory. Production source constants stay at 24 players / 32 sockets. Only the copied protocol changes to 100 players / 108 sockets, with city seed 341283204. A copied, loopback-only test hook sets normal 25-second Scattershot windows; the incident phase refreshes them every 24 seconds. No protocol limit, ball/corpse cap, collision or weapon-physics tuning is raised. Public managed bots are not enabled.

The local preview at 5174 is a hosted relay and is not used. The benchmark does not start or restart the retired stable preview service. Runtime processes are stopped after each level; source copies and results remain for review.

## Bounded variants

```sh
# Admission only: no movement/combat load, no stability claim
node scripts/benchmark-local.mjs --players=50,75,100 --admission-only --label=admission-only

# Harness smoke, not a capacity result
node scripts/benchmark-local.mjs --players=2 --warmup=5 --phase-seconds=5 --label=smoke

# Short connection/movement diagnostic scan, not a stability test
node scripts/benchmark-local.mjs --players=24,32,50,75,100 --phases=idle,movement --warmup=10 --phase-seconds=15 --label=light-scan

# Repeat a selected boundary
node scripts/benchmark-local.mjs --players=24,32 --label=boundary-repeat

# Thirty minutes of measured workload at a previously promising count
node scripts/benchmark-local.mjs --players=24 --phase-seconds=450 --label=soak
```

Choose distinct phases from idle, movement, combat and incident with `--phases`. Counts are bounded to 2–100, at most eight distinct levels. Warm-up is 5–60 seconds; each measured phase is 5–450 seconds. Longer runs should be selected only after the ladder and generator health are reviewed.

## Workload and evidence limits

Idle clients publish a pose approximately once per second. Moving clients publish approximately 20 Hz, using small, continuous oscillations around valid spawn points; they do not run browser physics or navigation. Combat fires at most once per 1.2 seconds per living client; incident combat at most twice per second, with normal five-ball Scattershot. Shots aim toward the nearest known living opponent and can be blocked by city geometry. Clients honor health, death, respawn and round state. Death/respawn counts show whether those transitions actually occurred; no count is a claim of lifecycle coverage when there were no deaths.

The load generator skips application sends above 64 KiB of queued data. Every recipient parses and validates its own feed. Received death/shot/respawn counts are recipient observations, not unique server events. Traffic excludes TCP/WebSocket framing; bytes are UTF-8 payload bytes. Snapshot and movement age compare clocks on the same physical host. They do not estimate internet latency.

The script reports one-millisecond latency histograms (overflow bin at 10 seconds, exact maxima retained), continuing silence even without new snapshots, per-thread loop-delay p99 sampled each second, server diagnostic windows, process-tree CPU seconds/RSS, generator RSS and host available memory. Per-phase server windows can straddle phase boundaries; use their timestamps. Local workerd cost timing is not a hosted CPU guarantee. Fixed seed does not remove all random spawn/shot outcomes, so repeat boundary levels.

Provisional phase pass criteria: snapshot gap p95 ≤100 ms, p99 ≤250 ms, maximum and continuing silence <1 second; generator loop-delay statistic p99 ≤25 ms; no invalid messages, error messages, disconnects or skipped sends. These are coarse server/network gates, not a promise of smooth animation. Inspect snapshot age, effective throughput, server dropped time, projectile pressure and CPU as well. A cap-saturated scene may retain fewer useful shots despite a passing timing gate.

The runner stops increasing load for severe generator delay (>250 ms p99), snapshot gaps or continuing silence (>10 seconds), available memory below 512 MiB, or server process-tree RSS above 2 GiB. A failed phase marks a level degraded. An unavailable runtime is reported as failure, not successful load rejection.

Output: `manifest.json`, per-level JSON reports, aggregate `results.json`, and per-level server logs. The manifest records source hashes and the fixture differences. Never deploy the generated benchmark copy; use the normal repository and release procedure for application work.

## Hosted comparison follow-up

See [private hosted baseline preparation](hosted-capacity-baseline.md) for the separate authenticated Worker configuration and the scoreboard compatibility fix. Both runners now share the same client workload and copied server fixture. Hosted results are recorded separately.
