# Playtest diagnostics

Reviewed **2026-09-08**. Use this with [current state](current-state.md), [network guidance](network-smoothness.md) and [tooling](tooling.md). Public AI runs on the server; the localhost eleven-bot harness below is separate.

Client diagnostics are enabled by `?diagnostics` (a noninteractive panel) or automatically for the explicit local practice harness. A public `?diagnostics` session can export locally with F8, but does not upload client reports to the local journal. Ordinary public sessions do not automatically expose the diagnostics API.

September 10 private follow-up: the current play link omits diagnostics for parity with normal production. If `diagnostics=quiet` is explicitly enabled, reports remain bounded in memory and numeric relay summaries still publish, but gameplay no longer rewrites the full report history to synchronous localStorage or logs console objects every five seconds. Page exit, disposal and pointer-lock release preserve the local report; F8 remains available. The visible diagnostic panel retains its explicit logging behavior. See [investigation and limits](verification/audio-performance-2026-09-10.md).

Local normal matches with `?room=graybox-practice-NAME&bots=11` record diagnostics automatically. Add `&diagnostics` for an optional panel; the panel never takes mouse input. Press **F8** to download the current JSON report. Reports are also collected automatically in the local server journal, and persist under localStorage key `rat-detective-last-diagnostics`; `window.ratDiagnostics.snapshot()` and `.download()` are available while the session exists.

The bounded report contains at most 120 five-second summaries (ten minutes) and 100 errors/events. It includes frame median/p95, longest frame, stalls over100ms, maximum simulation/bot/presentation/render CPU times, renderer calls/triangles/resources, network parsing/traffic/send-failure counters, attempted/sent shots, received/rendered projectile counts, and snapshot age. Bot time is included in total simulation time. Render time measures CPU submission, not GPU duration. Network characters are UTF-16 string lengths, not wire bytes. Hidden-tab state is included; background suspension is not a gameplay benchmark. The last report survives leaving a match; download before starting another diagnostic match to preserve it separately.

Collected client logs:

```sh
journalctl --user -u rat-detective-game-preview.service --since '10 minutes ago' --no-pager
```

Production server logs belong to Worker `rat-detective-preview`; private relay gameplay logs belong to `rat-detective-network-test`. Inspect the correct environment. Server `room diagnostics` summaries report simulation tick cost/lag, step counts, projectiles, snapshot traffic and shot acceptance/rejection counts. Correlate report wall-clock timestamps with the journal. Localhost matches send one bounded summary every five seconds over the existing game WebSocket. The hosted relay retains it locally as a sanitized `client diagnostics` report; correlate its timestamp with hosted room logs. The retired local runtime wrote both report types into its own journal. No periodic HTTP requests are made: Wrangler's local proxy has a reported crash when HTTP polling at roughly five seconds coexists with WebSockets (https://github.com/cloudflare/workers-sdk/issues/15452). Only numeric performance fields are logged; collection is local-only and rate limited. F8 export is optional.

For invisible shots, compare sent shots → server accepted/rejected → received shots → rendered balls, plus snapshot age. For freezes, compare frame/phase peaks with server tick lag and network parsing time. Aggregate counters identify which layer to inspect; they are not proof of a particular rendering or performance fault by themselves.

Cloudflare Workers can freeze high-resolution clocks during an event. A zero observed server tick duration does not establish zero CPU cost; inspect tick gaps and use a profiler when CPU attribution is needed. Snapshot byte budgets are counted explicitly because oversized envelopes may be rejected by the client.

Current main preview: `http://127.0.0.1:5174/`, served by `rat-detective-game-preview.service` through the authenticated private hosted backend. Its journal retains sanitized client reports. Hosted room diagnostics live in the separate `rat-detective-network-test` Worker's logs. The former local workerd service `rat-detective-stable-preview.service` is stopped after repeated multi-second stalls despite zero swap; do not restart it as the normal gameplay preview. Port5175 remains a second relay to the same private backend. Retired port5173 may have stale tabs issuing old HTTP diagnostic requests; close those tabs.

For pauses with smooth client frames, compare `eventSilenceMaxMs` (time without either a socket or timer callback), `socketEvents`, and `checkpointSettlementMaxMs`. The checkpoint observer adds no writes and does not await settlement in the simulation. Its wall time includes runtime scheduling, so a large value does not prove slow disk I/O. `checkpointFailures` reports rejected settlement observations. A September 7 playtest recorded a 2,747 ms server tick gap with smooth client frames; the root cause remains unconfirmed.
