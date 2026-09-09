# Implementation evidence


> **Historical record — September 6 implementation verification.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](../README.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

Reference: `08e8005`. These checks describe their actual scope; unit tests are not presented as manual gameplay tests.

| Requirement | Evidence |
|---|---|
| Preserve rat visuals | Historical RatEntity rendered in the same fixture: alive, turned, damaged and dead pixel-identical; respawn differs by restored outline. `rat-reference-comparison.json`. |
| Repeated visual regression | Five checked-in images under `test/visual/baselines`; a second capture matched all five exactly. Manual in-app review covered turning, flash, settled corpses and restored respawn. |
| Projectile/collision tuning | `test/client/projectiles.test.ts`: flight, speed/gravity, ricochet, head/body damage, resolved descriptor parity and cosmetic aim exclusion. Existing collider/outline tests retained. |
| Timing consistency | `test/client/controller.test.ts`: actual Cannon simulation at 30/60/144 rendered FPS gives identical movement/braking/rotation and grounded jump trajectories; 60 Hz constants asserted. |
| Shared world and safe spawns | `worldSpec.test.ts` samples 2,000 spawns across 100 deterministic seeds plus forced fallback. `cityGenerator.test.ts` compares generated Cannon boxes with shared building dimensions. |
| Two browser clients | Local Worker preview on port 5176, isolated room `visual-review-20260906`: Review One and Review Two both display both scores and world seed 635747619, version 1. Different draw counts reflect different spawn/camera positions. |
| Input/HUD/state | Focus/pointer-lock clearing, literal-text scoreboard, deadline-driven overlays, injured/dead snapshots and restored presentation are covered by focused client tests. |
| Transport recovery | `network.test.ts`: join timeout, bounded retry, stale socket generations, heartbeat, backpressure, protocol/world version rejection and cleanup. |
| Server game flow | Isolated real Worker smoke passed join v1, movement, shot, damage, death, score, timed respawn and leave. Worker tests exercise actual Durable Object sockets and alarms. |
| Real browser input | Final `npm run smoke:gameplay` passed with actual pointer lock, W movement (6.10 units), Space jump (2.63-unit observed rise), and mouse-click shot (direction length 1). Input was delivered through the browser; game state was not injected. These timing-dependent observations are smoke outcomes, not tuning constants. |
| Audio lifetime | `audio.test.ts`: late loader callbacks, failure handling, natural-end disconnect and disposal. Gunshot concurrency intentionally retains existing single-voice playback; no sound/volume/positional-audio redesign. |
| Scenery performance | `rendering-comparison.json`: identical-world draw calls 637 → 302; triangles 10,450 → 13,800 due to batch culling. Median frame interval unchanged at 16.7 ms. No FPS gain claimed. |
| Historical allocations | `world-scenery-benchmark.json` executes original CityGenerator from git, rather than hardcoding old counts. Different random-stream layouts prevent interpreting it as an identical-view FPS comparison. |
| Physics broadphase | `physics-benchmark.json`: small CPU-only gain, so NaiveBroadphase retained pending stronger evidence. |
| Development checks | Application and test-source typecheck passed. Final application verification: 86 tests passed (28 Worker + 58 client). Dependency audit reported zero vulnerabilities. Production build passed, including extracted unchanged CSS. |

## Additional integration evidence

- Final completion review added explicit rate-limit quota/reset-boundary and identity/message isolation/cleanup tests. Both pass; no application behavior changed.

- `sessionResources.test.ts` uses real city/entity/controller/weapon/remote-player/Cannon modules with only external boundaries faked. Two full session cycles, replacement world snapshots, damage/death/respawn and teardown preserve 147 active bodies, then end with zero bodies, empty scene, no listeners/timers/RAF, and owned resources disposed once.
- Join, respawn and round reset all call `spawnForWorld(this.world)` in `GameRoom`; the common algorithm has 2,000 sampled-spawn plus 100 fallback checks.
- Actual WebSocket-handler traffic and SQL recovery measurements are recorded in `server-traffic.json`. Awaited socket cleanup exposed a missing close acknowledgement in the local Worker test runtime; `webSocketClose` now explicitly closes its side as well as removing the player. This follows the [Cloudflare hibernation example](https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/).
- Isolated watch workflow rebuilt stale dist before serving, returned health 200, rebuilt again after touching the HTML, and released its port on SIGTERM. A stubborn descendant that survived its wrapper's SIGTERM is now killed through process-group escalation; the verification process confirmed the descendant was gone.
- Final isolated Worker WebSocket smoke and real-input browser gameplay smoke both passed against `index-CZgtWzYx.js`. Final five-state screenshot comparisons again had zero pixel differences. WebGL-disabled entry smoke displayed the expected error view.

## Release verification and completion review

Runtime implementation is committed in `12f96e0`; tooling and visual verification are committed in `4edf9fa`; rate-limit regression coverage is committed in `090d347`. Integration, persistence measurements, full-session resource tests and local final checks are complete as described above.

Staging at `https://rat-detective-staging.mayberrydt.workers.dev` passed health (HTTP 200), exact-byte JavaScript/CSS comparisons against local dist, an isolated two-client WebSocket game flow, and real browser movement/jump/shoot checks. Browser pointer lock was acquired; movement was 5.80 units, jump rise 2.96 units, and the resolved shot direction had length 1. A separate manual browser join confirmed the city, rat, aligned outline, health bar and scoreboard rendered. See [staging.md](staging.md) for deployment details. Production deployment is outside this work's scope.

A final read-only audit reconciled phases 1–7 with source and tests and found no omitted implementation requirements. Unchanged-position suppression is client-side; accepted movement still broadcasts server-side. Rate-limit unit tests prove quota/window/isolation/cleanup, while source review confirms their GameRoom wiring; they are not presented as an end-to-end overload test.

The in-app browser and extension-driven tab did not acquire pointer lock during this review. The dedicated headless Chrome regression runner did acquire it and verified real movement, jumping and shooting. Manual rendered review covers appearance; subjective play feel remains something the user can assess beyond automated invariant checks.
