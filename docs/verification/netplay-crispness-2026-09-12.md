# Netplay crispness implementation

**Date:** September 12, 2026
**Scope:** Isolated `codex/netplay-crispness` worktree; protocol 15 client and Worker
**Deployment:** Not deployed. Production remains protocol 14 and the September 11 release.

## Outcome

This branch implements the interaction-time coherence work from the September 12 [netplay responsiveness audit](../netplay-responsiveness-audit-2026-09-12.md). Local movement and the existing one-real-ID shot presentation remain immediate, while authority now evaluates latency-sensitive actions against a bounded, identifiable world history and returns explicit results.

### Shots

- Every local shot piggybacks the newest sequenced movement pose. Authority applies that pose before validating the muzzle and creating the projectile.
- The client includes the source-server time actually represented by the remote rat under the aim ray. Authority clamps this to at most 250 ms of rewind.
- Authority retains 500 ms / at most 40 samples of rat pose, life, alive and Ironclad state. During the first 250 ms of ball flight, rat collision is evaluated at `viewAt + ballAge`; static world geometry remains current and authoritative.
- The genuine case has matching historical pose/ownership playback during the compensated interval. An unavailable or incompatible history falls back to current authority.
- All cheese balls, including ordinary 0.15-radius rounds, now use continuous sphere sweeps. Head/body selection still uses the established three rat shapes.
- Direct `shotResult` messages report first authority step, rat body/head hit, Ironclad reflection, case/fake-case contact, world/Dispatch/launcher contact, capacity eviction, lifetime, reset and validation rejection. Terminal results retire the exact locally predicted ball immediately; non-terminal contacts do not.
- Damage, hit markers, score, impulse and incident outcomes remain authority-only. Historical collision never rewinds static walls, crosses a respawn life, trusts a client-reported victim, or exceeds the compensation cap.

### Case and power-ups

- The server keeps the meaningful previous accepted movement segment instead of overwriting it on every unchanged simulation step.
- Genuine case and power-up claims use continuous closest-approach geometry over a bounded 350 ms / 6-unit segment, with the existing wall, eligibility, generation, velocity, dangerous-case and former-carrier rules.
- The client independently detects a same-frame path crossing and sends a sequenced `pickupIntent` with the current pose. The intent is only a request; the Worker resolves the atomic claim.
- The claimant receives a direct `pickupResult` with accepted/rejected status, reason, authority epoch/tick and effect deadline. A short recent-claim ledger correlates an intent with an automatic authority claim that won the race immediately before it.
- Pickup props hide tentatively on contact and roll back after a rejection/timeout. Case carry pose is anticipated locally, but ownership/scoring remain disabled until authority accepts. Hot Pursuit movement begins on acceptance; snapshots remain recovery truth.
- Reload resume carries the last accepted movement sequence in `welcome`, preventing a fresh page from having all low sequence numbers discarded.

## Audit evidence

The Worker emits bounded aggregate netplay fields inside its existing five-second `room diagnostics` record:

- counts by action/outcome/rejection/fallback;
- accepted-to-first-step and accepted-to-contact/terminal average and maximum spans;
- compensated hit count, average/maximum rewind, and average/maximum current-versus-viewed target displacement;
- stale movement-sequence and server correction counts;
- existing tick gaps, ACK lag, delivery high-water, snapshot bytes and checkpoint settlement beside the interaction metrics.

A client opened with `?diagnostics=quiet` keeps a bounded in-memory/F8 report containing:

- ping RTT EWMA, minimum, maximum and jitter;
- remote presentation-delay range and the source time represented under aim;
- input-to-confirm/result p50, p95, p99 and maximum by outcome;
- bounded recent causal entries, snapshot epoch/tick, socket backlog, parse/apply cost and projectile-presentation health.

Press **F8** to download the report or run `window.ratDiagnostics.snapshot()` in the page. Quiet mode does not synchronously rewrite history or retain console report objects during active play. Client reports are not uploaded from production; the Worker-side aggregate is automatic. Logs retain no names, resume credentials, raw socket frames, full snapshots or client-selected victim identities.

## Fixed verification

- `npm run typecheck` passes for application and test TypeScript projects.
- `npm test` passes: 140 Worker/shared tests, 781 client tests and 27 script tests (**948 total**).
- `npm run build` passes. The existing large client-chunk warning remains; this change adds no new build failure.
- `npm audit --audit-level=high` reports zero vulnerabilities.
- Focused netplay suites cover displayed source time, sequenced action validation, end-to-end direct results, swept pickup crossing versus teleport, historical moving-target collision, visible ball-radius grazing, direct terminal/non-terminal shot reconciliation and diagnostic sanitization.

## Remaining acceptance boundary

No browser input automation, hosted Worker, deployment or production mutation was performed. Project policy leaves gameplay feel to a human two-client test. A frozen matching hosted preview with normal server-owned backfill is still required before enabling this protocol in production. The key human check is victim-side cover fairness at 150–250 ms alongside the shooter-side reduction in visually clean misses.

## September12 merge and release follow-up

The worktree was subsequently previewed, then Tyler requested it merged with the
accepted final model. The combined protocol15 release is documented in the
[integration receipt](model-netplay-integration-2026-09-12.md); the initial
not-deployed and isolated-branch status above is historical. That topic branch
has been merged and deleted.
