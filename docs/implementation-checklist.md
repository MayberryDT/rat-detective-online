# Implementation verification checklist


> **Historical record — completed early architecture checklist.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](README.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

This is a completion checklist, not a claim that unchecked work is finished. Baseline: `08e8005`. Production deployment is outside the automatic release gate.

- [x] Record gameplay/render/collision baseline constants.
- [x] Capture the original local gameplay view.
- [x] Deterministic visual fixture: all hats, turn, damage, death, respawn.
- [x] Fixed-scenario renderer and traffic comparisons.
- [x] Scoreboard text rendering and HUD deadline/timer tests.
- [x] Complete respawn presentation restoration tests.
- [x] Injured/dead late-join state tests.
- [x] Input clear/dispose test.
- [x] Remote projectile visual synchronization test.
- [x] Shared room seed/version and independent cosmetic RNG.
- [x] Identical layouts and safe join/respawn/reset positions across seeds.
- [x] Identical shot descriptors and explicit aim targets.
- [x] Existing projectile tuning/head/body/ricochet comparisons.
- [x] Transport join timeout, retry, stale socket, heartbeat and cleanup tests.
- [x] Complete snapshot/reconnect integration tests.
- [x] Durable Object attached-socket recovery and deadline/alarm tests.
- [x] Session/HUD/transport/state ownership extraction integrated.
- [x] Repeated complete session teardown/restart verified.
- [x] Audio failure and disposal handling.
- [x] Protocol boundary/version/capacity/rate tests.
- [x] Room diagnostics and authoritative-state policy documented.
- [x] Stronger combat-authority design and latency evaluation gate documented.
- [x] Scenery batching visual/culling/resource comparisons.
- [x] Broadcast serialization and persistence policy measurements.
- [x] Physics broadphase microbenchmark recorded; current broadphase retained pending broader evidence.
- [x] Frame-rate movement/jump/turn comparisons at30/60/144Hz.
- [x] Explicit simulation order with current remote collision state.
- [x] Full-stack watch/preview and consistent smoke URLs.
- [x] Application and test source typecheck.
- [x] CI isolated Worker and visual verification gates.
- [x] Separate staging configuration and dry-run validation.
- [x] Staging build/session verification.
- [x] Final full tests/build/audit and manual rendered review.
- [x] Final requirement-by-requirement review and coherent commits.

Evidence and scope: [implementation-evidence.md](verification/implementation-evidence.md). All gates completed. Runtime/tooling/test commits are recorded in the evidence; the documentation closeout commit contains this completed checklist. Production publishing and git push were not performed.
