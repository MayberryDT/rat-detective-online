# Highlight clock across game windows — 21 September 2026

The 10:42–10:48 Pacific session registered three double-kills, a round win,
one spectacular launch and six local chaos deaths. All 11 markers reached the
helper with eligibility `ok`, but all were `missed` before a save job existed.
Their translated event times were approximately 21,753.8 seconds behind receipt.
No recordings from that session exist in the catalog or staging directory.

The long-lived helper retained clock samples across game documents, although
each document's `performance.now()` has a different origin. Old zero-RTT
samples also outranked refreshed samples indefinitely. This is separate from
the previously repaired integer-seconds GSR save failure.

## Correction

- Accepted session-start for a different document creates a fresh clock map and
  seeds it from the start timestamp before acknowledging the client. Immediately
  flushed early markers therefore have calibration before the next ping.
- Discovery pings without an active session receive a reply without changing
  calibration. During a session, another document or session cannot calibrate
  the clock. Same-document start retries retain calibration.
- Valid refreshes discard samples older than 90 seconds (three refresh periods).

Only `highlights/clock.py` and `highlights/service.py` changed in the helper.
The deployed game, connector, protocol, recorder and catalog schema are unchanged.

## Verification and installation

Four new tests failed before the correction and passed afterward. Both closed
and replaced-session tests advance twelve simulated hours, start a fresh
document, submit a win before another ping, and follow heartbeat dispatch through
clip publication with twelve seconds before the event and six after. These use
the fake capture backend in isolated catalogs, not a live desktop recording.
Additional regressions cover foreign/unscoped pings, same-document retries, and
expired zero-latency samples.

All 30 focused pipeline, service, repair, protocol and media tests passed,
including FFmpeg trim/reel checks. Typecheck, Python compilation and diff
whitespace checks passed. Full `npm test`: 174 server tests, 1,181 client tests
and 107 script tests passed (1,462 total). One existing launcher test failed:
`return focuses an exact Rat Detective app identity and ignores a matching title`
returned `pending` instead of `focused`. An isolated copy with both pre-fix
helper modules reproduced the same failure. The launcher was not changed.
Logs: `output/highlights-clock-2026-09-21/npm-test.log` and
`output/highlights-clock-2026-09-21/baseline-launcher-test.log`.
No frontend/Worker build was needed for this Python-only correction.

Installed the two tested modules in the existing Veelox helper and plugin
copies, with backups in `output/highlights-clock-2026-09-21/installed-backup/`.
Verified both installed copies byte-match source. Restarted only the idle helper
through its owned shutdown/launcher path. Status returned `ready`, enabled,
waiting for the game, with the existing clip count and last session preserved.
No shell restart, game deployment or GitHub publication was needed.

The next human gameplay session is the remaining live-capture check. This repair
cannot recover footage discarded from the previous session's replay buffer.

Timing contract: [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/).
Research binding: `.research/highlights-document-clock-implementation-references.json`.
