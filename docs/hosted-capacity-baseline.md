# Private hosted capacity testing

The local and hosted runners now use the same full-feed clients and generated server fixture. Source is copied from the current working tree, preserving pending changes. Only the copy receives 100-player admission, a fixed city seed (341283204), and a 25-second Scattershot fixture. Production still admits 24 players with its existing public AI reservations. The 100-entry scoreboard parser is a wire-format ceiling, not evidence of supported gameplay capacity.

## Prepare and deploy

```sh
npm run benchmark:prepare-hosted
npm run benchmark:prepare-hosted -- --deploy
```

The first command prepares and validates a bundle without publishing. The second explicitly deploys to **rat-detective-capacity-test** only. It creates a private random token outside the repository, uploads it as a secret, and prints the deployment receipt path. The receipt records the Worker URL, version, source hashes, fixture identity, expiry and private credential-file path; it contains no token value. Keep the generated runtime directory for repeatable tests with its exact parser.

The fixture expires after 120 minutes by default (`--minutes=10` through `240`). Expiry rejects new connections; the runner also stops at expiry and closes its existing sockets. The Worker exposes authenticated health and test-room WebSockets only. It has a separate namespace, no public-domain routes, no public-room access, and no asset route. The existing hosted preview relay and network-test Worker are separate.

## Run the ladder

Use the absolute receipt path printed by deployment:

```sh
npm run benchmark:hosted -- --deployment=/absolute/deployment.json
```

Default counts are **2, 8, 12, 24, 32, 50, 75, 100**, increasing in that order. Each count uses a fresh room, a quiet admission period, 30-second warmup and 45 seconds each of idle, movement, combat and Scattershot. Every synthetic client receives and validates the complete feed. Movement uses small spawn-area circles at 20Hz; ordinary combat fires every 1.2 seconds and Scattershot every 0.5 seconds. Normal projectile tuning, lifetime, ball and corpse caps remain intact. No browser rendering or public AI is simulated.

The runner accepts no arbitrary target URL. It validates the private hostname, token, receipt expiry and server fixture identity before opening clients. Failed startup or warmup prevents higher loads. It stops the ladder after a phase fails quality thresholds, and polls every five seconds for severe silence, protocol errors, disconnects, generator delay, low available memory or expiry. All sockets and threads are closed on completion or interruption.

Quality gates match the local runner: snapshots must arrive; gap p95 ≤100ms, p99 ≤250ms, worst gap and ongoing silence <1 second; generator event-loop p99 ≤25ms; zero invalid updates, errors, disconnects and skipped sends. These are experimental gates, not an SLA. Hosted measurements include the WAN and generator machine, whereas local measurements share CPU and memory with workerd.

For a shorter bounded check:

```sh
npm run benchmark:hosted -- --deployment=/absolute/deployment.json --players=2 --warmup=5 --phase-seconds=5
```

`--admission-only` checks joining without movement/combat; it does not qualify a capacity level. A 30-minute soak at a previously passing level uses four 450-second phases. Never claim an admission-only run or short smoke test as sustained support for that player count.

## Evidence

Results and manifests are written under `output/hosted-capacity-*`, with one JSON file per level and combined `results.json`. Metrics include snapshot gaps, observed ages, RTT, movement age, received bytes, event-loop delay, shot/death/respawn observations, peak balls and protocol errors. Event counts are recipient observations, not unique gameplay events. Cloudflare server memory and CPU are not measured by the client runner.

Optional server diagnostics:

```sh
node scripts/capture-capacity-logs.mjs --deployment=/absolute/deployment.json --output=/absolute/diagnostics.ndjson
```

Start the tail **before** starting a fresh benchmark room; a tail started after a long-lived WebSocket request may miss that request’s diagnostics. This captures console logs and exception summaries from the dedicated Worker, discarding request data and headers. Stop it with Ctrl-C; it also stops at fixture expiry. A tail may omit events; use client receipts as the primary measurement and do not treat missing logs as proof of server health.

The original local measurements remain dated in [the local receipt](verification/local-capacity-2026-09-08.md). The first deployment and measured outcomes are recorded in [the hosted verification receipt](verification/hosted-capacity-2026-09-08.md).

Generate a compact report and CSV with `node scripts/report-capacity.mjs --results=/absolute/results.json --output=/absolute/report.md`.

Hosted `Date.now()` and `performance.now()` advance only after I/O, so server timestamps and zero measured tick cost cannot independently prove CPU headroom or pinpoint a delivery stall. Use them alongside arrival gaps, RTT and diagnostics; [Cloudflare documents these clock limits](https://developers.cloudflare.com/workers/runtime-apis/performance/).

## Compact transport and human preview

New fixtures and clients default to `--transport=compact-v2`; use `--transport=compact-v1` for the previous integer-tuple format or `--transport=legacy` for an explicit full-JSON comparison. Every client still reconstructs and validates the full gameplay state. Projectile motion uses integer tuples at the existing three-decimal precision, with stream-local ID dictionaries and unchanged-field omission. Version 2 additionally sends lossless integer differences from the previous sent projectile motion when smaller. Every frame still carries complete projectile membership. Full keyframes recur every 300 sent frames. Version 1 and legacy clients remain supported.

Each compact connection allows four unacknowledged chaos frames. While blocked, newer poses replace unsent poses; visual impacts retain a bounded backlog of the newest effects, while launch cues remain queued. Acknowledgement timeout or launch-queue overflow closes the connection for resynchronization. This bounds snapshot delivery only; other gameplay messages retain their existing paths. It does not establish 100-player capacity or eliminate all network stalls.

The runner samples compact and equivalent reconstructed legacy packet sizes once per second on one client. Aggregate bandwidth also reflects cadence and other messages. Hosted phases additionally capture aggregate TCP counters for the generator's sockets where available; these alone cannot identify a server or network root cause.

For a human playtest of the exact prepared client against its private Worker:

```sh
node scripts/preview-capacity.mjs --deployment=/absolute/deployment.json
```

This starts a separate loopback relay on port 5180 and prints the room URL. Open the same URL in two browser windows to observe the other rat's walk, turn, shoot, jump and landing animations. The relay stops at fixture expiry. Existing preview services are untouched; synthetic protocol tests do not verify visible animation.

See [compact snapshot verification](verification/compact-snapshots-2026-09-08.md) for the private deployment and remaining failures.

## Fifty-rat work in progress

See [the September 8 fifty-rat receipt](verification/fifty-rats-2026-09-08.md) for current failures and measured limits. Public capacity is unchanged.

The private fixture can run a larger AI roster without modifying application defaults:

```sh
node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=49
node scripts/benchmark-hosted.mjs --deployment=/absolute/deployment.json --players=50 --server-bots=49 --phases=idle,movement,combat,incident,churn
```

`players` is total rats; `server-bots` must match the prepared fixture. Here there are 49 autonomous rats and one full-feed client. This does not test 50 human connections. AI keeps navigating and fighting during all phases; the phase names control the synthetic clients and incident trigger. Normal completion cleans up the private AI room, and fixture expiry bounds abandoned work. Do not deploy a new fixture while an earlier measurement is active.

For a generator on the owned Halla machine, prepare its credential-free runtime with `node scripts/prepare-capacity-remote.mjs --deployment=/absolute/deployment.json`, then supply the returned `/tmp/rat-capacity-...` path as `--remote-runtime=...`. Four generator groups normally alternate between Veelox and Halla. `--remote-first` starts on Halla, useful for the single viewing client in an AI crowd test. The private token is passed over authenticated SSH through stdin, not command arguments or a remote credential file.

`--layout=clustered` clusters synthetic clients; AI follows its own navigation. `--latency=50 --jitter=25` adds an ordered 50–75 ms application-delivery delay in each direction. It is not packet-loss or TCP emulation. Reports separate host timing, and newer fixtures provide an informational moving-pose playback probe on one socket per generator. That probe excludes stationary/dead tracks and the first second after reset; its eligible held-frame fraction is not a complete browser frame-rate measurement. Existing error, silence and arrival-gap gates remain in effect.

The separate visible renderer fixture is `test/visual/capacity-render.html?rats=50&balls=256` through the visual Vite server. It uses synthetic positions and actual models. Verify the camera view with a screenshot, keep the tab visible, and avoid concurrent CPU/GPU workloads during measurement.

The explicit `--quality=playback` profile now retains separate arrival/playback verdicts and hard stall/error gates. See [the final fifty-rat receipt](verification/fifty-rats-2026-09-08.md) for failed runs and probe limitations; no 50-rat capacity claim follows from this option.
