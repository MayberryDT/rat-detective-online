# Rat Detective improvement plan

## Objective and constraints

Address the architecture audit incrementally while preserving the established shooting, collision tuning, camera, rat model, outline alignment, lighting, audio assets and visual style. Keep Three.js, Cannon and the Worker/Durable Object architecture. Use small, reversible commits on main; avoid a framework or ECS rewrite.

Source: [architecture audit](architecture-audit.md), baseline `08e8005`, and GBrain `brain:sessions/2026/09/rat-detective-deep-audit-08e8005`.

## Current status

Implementation commits: `12f96e0` (sessions/shared multiplayer state), `4edf9fa` (development and verification tooling), and `090d347` (rate-limit regression tests). The completion review reconciled phases 1–7 with current source/tests. All 86 tests and type-checking pass; local visual and gameplay verification and staging session checks pass. See the [checklist](implementation-checklist.md) and [evidence](verification/implementation-evidence.md) for the exact scope and retained design decisions. Production publishing remains a separate action.

The phases below describe the entire scope and its acceptance gates. Review existing implementations against each gate instead of rewriting them.

## 1. Lock down the baseline

- Record movement, jump, gravity, projectile speed, bounce, damage, hit shapes, camera and rendering settings.
- Keep deterministic screenshots for every hat, turning, damage, full death and respawn.
- Establish repeatable rendering, physics and network workloads with fixed seeds and cameras.

Gate: behavior-sensitive changes have a named baseline and a comparison method. Gameplay correctness corrections—shared collision geometry, safe spawns, matching networked shots, cosmetic aim exclusion and timing normalization—are explicitly distinguished from tuning changes.

## 2. Correct state and presentation bugs

- Render player names as text; preserve HUD styling.
- Apply health/death state from initial snapshots without replaying historical effects.
- Restore every alive visual property on respawn, including outline opacity.
- Clear input on blur, pointer-lock loss and session transitions.
- Derive respawn and round overlays from server state and deadlines.
- Keep remote projectile visuals synchronized through pass-through updates.

Gate: focused regression tests cover each failure, and visual comparisons preserve appearance except the intended respawn restoration.

## 3. Establish shared multiplayer state

- Use a room-owned world seed and generator version, with separate layout and cosmetic random streams.
- Build rendering and collision from the same layout; choose join, respawn and round-reset positions with collider clearance.
- Resolve each shot once and transmit its actual origin/direction; replay that descriptor remotely.
- Restrict aim queries to intended physical targets.
- Include complete player, round and deadline state in snapshots; validate versioned messages at boundaries.

Gate: two clients agree on geometry and shot descriptors; tests cover many spawn seeds, injured/dead late joins and incompatible messages. Preserve projectile physics and hit shapes.

## 4. Make session ownership explicit

- Keep bootstrap small; GameSession owns connection/play/recovery states and dependency lifetimes.
- Network transport owns socket parsing, scheduling, timeout and retry; presentation code owns entities and HUD.
- Centralize damage, death and respawn transitions.
- Provide one idempotent teardown for renderer, world, bodies, entities, projectiles, audio, listeners, timers and animation frames.
- Add visible connection failure/retry states and reconcile a fresh snapshot after reconnect.
- Handle audio load failures and cleanup while retaining existing assets and volumes.

Gate: repeated actual session start/stop cycles release all owned resources; timeout, stale socket, disconnect and reconnect tests pass.

## 5. Improve room reliability and defensive boundaries

- Reconcile attached sockets with persisted players during room recovery; separate connection validity from movement freshness.
- Recover pending respawn/round-reset deadlines through alarms.
- Enforce finite values, protocol compatibility, room capacity and message-rate bounds.
- Keep critical score/death/round transitions durable; document the public game's client-trust limitations.
- Expose useful aggregate diagnostics for connections, traffic, checkpoints and pending events.

Gate: isolated Durable Object tests cover socket closure, reconstruction, deadlines and validation. Stronger server-authoritative combat gets a separate design and 50/100/200 ms latency evaluation before implementation; it must not silently change responsiveness.

## 6. Optimize measured costs

- Batch repeated opaque scenery while retaining transforms, materials, shadows and appropriate culling. Review transparent geometry separately.
- Serialize each broadcast once; suppress unchanged movement with independent liveness.
- Checkpoint positions on a documented cadence while retaining immediate critical-state persistence and recovery correctness.
- Profile raycasts and broadphase; adopt alternatives only with representative evidence.
- Prune obsolete helpers, duplicated constants, unused paths and stale documentation after replacement paths are verified.

Gate: report draw calls, submitted triangles, frame-time percentiles, allocations and actual message/write counts. A lower object or draw-call count is not proof of higher FPS. Checkpoint tests must drive the public message path and verify recovery of the latest eligible pose.

## 7. Normalize simulation carefully

- Use the recorded 60 Hz behavior as the reference for control smoothing and fixed simulation steps.
- Define input, movement, physics, remote collision placement, projectile queries and presentation ordering explicitly.
- Make edge-jump grace deliberate and bounded.

Gate: compare movement, turning and jumping at 30/60/144 Hz; retain shooting and collision constants. Review actual keyboard/mouse gameplay and visual fixtures before accepting timing changes.

## 8. Finish tooling and release verification

- Keep development and preview full-stack, with watched client rebuilds and consistent URLs.
- Type-check application and test code; run regression, isolated WebSocket, real-input browser and screenshot comparisons in CI.
- Verify helper startup failures and shutdown leave no child servers behind.
- Complete a separate staging deployment using the final source/assets; verify health, two-client state and actual movement/jump/shoot behavior.
- Reconcile every checklist item with evidence, commit the remaining documentation/helpers, and confirm a clean main branch.

Gate: staging is verified before release readiness is claimed. Production publishing is a separate authorized action. Record the release commit and previous deployment for rollback; account for protocol and persistence compatibility before rolling back server changes.

## Execution order and completion

Baseline → correctness → shared state → session ownership → server reliability → measured optimization → simulation comparisons → staging/closeout. Tooling and focused tests accompany the relevant changes throughout.

For subsequent work, use this sequence and its recorded evidence as the regression contract. If a gate fails, fix that specific issue in a separate commit and rerun affected checks; rerun the complete suite after the final application change.

Complete means every audit item is implemented and verified, or explicitly evaluated with a documented reason to retain the current behavior. No unexplained unchecked items, assumed performance gains, or unverified deployment claims.
