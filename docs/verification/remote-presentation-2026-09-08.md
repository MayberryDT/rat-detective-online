# Remote presentation timing follow-up — 2026-09-08

## Scope and evidence

Implemented the supported first steps from the user-supplied Rat Detective multiplayer review. The review was research input, not authority to deploy or run live probes. The original research ZIP preserved the dirty working-tree baseline; changes were reviewed against that snapshot rather than assuming HEAD represented the game.

Three initial real-mesh tests failed on the old schedule: root presentation held at 120 Hz; mean body bob at 30 Hz was 0.488 of 60 Hz at speed 6.5, and 0.466 at speed 18. The corrected integration tests now run the actual GameSession animation method, real RemotePlayers, Three.js meshes and Cannon physics with GPU/transport/city work replaced. They pass at 120/144 Hz and maintain a 30/60 Hz bob ratio above 0.8 at both actor speeds. These are deterministic offline measurements, not live visual acceptance or a load benchmark.

## Changes

- GameSession samples remote poses once before physics and presents alive rats once after physics. Legacy death updates keep their original fixed-step order. Local controller/camera, AI/navigation, projectile tuning and collision shapes are unchanged.
- RemotePlayers keeps the same delayed-root collider policy, including frames with zero physics steps. RatEntity has a narrow alive-presentation method that does not overwrite the render root from physics.
- RatAnimator separates elapsed motion time from bounded smoothing time. Snapshot history generations and long frame gaps trigger a locomotion-only rebase; action cues survive, while respawn retains the full reset.
- Initial, periodic and other chaos send paths share serializeServerMessage. Only chaos wire numbers are rounded; other messages, simulation and persistence keep their precision.

## Validation

- Focused presentation/session/animation/buffer tests: 38 passed.
- Focused room/validation/serializer tests: 27 passed.
- npm run typecheck: passed.
- npm test: 418 passed (72 Worker, 343 client, 3 script tests).
- npm run build: passed; Vite reported its existing large-chunk advisory.
- Checked attachments, glow/muzzle alignment, tail deformation, pause/teleport rebasing, respawn, endpoint gait settling, legacy death cadence, shared-corpse visibility and collider cleanup.
- No deployment, service restart, commit, live probe or automated browser-input testing.

Two fixture issues were corrected during test development: restoring the shared canvas shim after global mock cleanup, and asserting the existing shared-corpse collision filter mask (not collisionResponse). No production behavior was changed to accommodate those expectations.

## Remaining verification and follow-ups

Human playtest: two humans plus public AI; observe starts/stops, turns, jumps, shooting while carrying, death/respawn and tab-away/return. Compare actual actor progress with visible child animation. Record environment/build and whether the affected rats are humans or AI. The report's absent-animation symptom at healthy 60 Hz is not conclusively explained by this scheduling fix.

Higher display rates now perform remote geometry animation more often. Tail/geometry optimization, broader diagnostics, human capture timestamps, buffer cursor/offset/idle tuning and server fanout changes remain measurement-driven follow-ups. No new wire fields, buffer timing tuning or performance/capacity claims were introduced. Uniform compact serialization is not an exhaustive payload-budget proof.

Deployment remains separate. Rollback should undo only this follow-up's scoped edits, preserving the pre-existing uncommitted game changes. Do not reset the working tree to HEAD.
