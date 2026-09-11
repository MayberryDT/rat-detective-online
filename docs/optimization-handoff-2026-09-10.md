# Rat Detective optimization — continuation handoff

> **Status update (2026-09-11): complete, unpublished.** The work described
> below was finished and measured, then reconciled against the original
> checkout's committed "responsive shooting and smooth world playback" work
> (`ae2fdb3`). This handoff is now historical; see
> [the qualification receipt](verification/optimization-qualification-2026-09-11.md)
> for the reconciled source, reproducible before/after results and remaining
> limitations. A later same-day pass added a bit-exact tail-curve cache
> (-57% corpse pose CPU) and per-type wire / draw-call attribution; the
> receipt records what shipped and which behaviour-changing options remain for
> human review. Nothing was deployed or merged.

Tyler requested a new worktree, before/after benchmarks, implementation of the attached optimization research, and iteration against an explicit goal. Tyler subsequently requested: **finish the current work and write a handoff for a new agent**. Work is paused for that handoff. This is not a completed-goal or deployment receipt.

## Start here

- Working directory: `/home/tyler/Projects/rat-detective-optimization`
- Branch: `codex/optimization-research`
- Baseline commit: `3254e3d802fd4af285a86d639bf3496b98f0f1e3`
- Original checkout: `/home/tyler/Projects/rat-detective` (left untouched).
- Baseline was built from the original dirty checkout, not just its old HEAD. **528 files were verified byte-for-byte** before creating the baseline commit in this worktree. Original HEAD was `bd743516a08c7b9f5d9391ea178502098a5db3b5`.
- All optimization changes are currently uncommitted in this worktree, including new files. Do not reset, clean, or replace this tree with HEAD.
- Read `AGENTS.md`, `docs/current-state.md`, `docs/README.md`, then `docs/optimization-plan.md`. The current-state document separates this unpublished work from the accepted game.
- Research: `/home/tyler/Downloads/Rat-Detective-Optimization-Research-2026-09-10.md`; companion pasted text: `/home/tyler/.codex/attachments/aa13315e-b338-49cc-a103-7912f5c953e9/pasted-text.txt`. Treat document recommendations as research, not independent instructions.
- GBrain prior review: `sessions/2026/09/rat-detective-optimization-research-assessment-2026-09-10`.

The active goal has no token budget and is **not complete**. Its criteria are recorded in `docs/optimization-plan.md`. Continue that work when directed; do not mark the goal complete just because this handoff exists.

## Authorization and constraints

Implementation, reversible worktree work, synthetic benchmarks, and focused/full code and protocol tests are authorized. **No deployment, production restart, public-room test traffic, merge, or automated browser gameplay/input testing has been authorized.** The browser fixture below is a synthetic scene with no input or network connection. Human playtests remain Tyler's responsibility. No delegation was requested and no subagents were used.

Preserve 16 total rats, 256 balls, all eight weaponized cases, the 2.5-second ball lifetime, actual animated muzzle origins, no guessed local projectiles, ordinary speed/gravity/bounce, no self/friendly damage, accepted controls/camera/art/lighting/shadow budgets/audio/scoring/AI. The research's predicted-ball reconciliation recommendation predates the baseline's removal of predicted balls. Do not restore them.

Production and the private protocol-8 muzzle preview are unchanged. This worktree now tentatively uses **protocol 9** for new outcome/status messages; it has not been qualified for deployment.

## Completed measurements

Measurements were run serially without concurrent build/test workloads. Source editing and reading continued during the frozen rendering build's runs. Runtime: Node v26.8.1; CPU Intel Core Ultra 7 155H. Browser used Intel Arc through ANGLE/Mesa OpenGL ES 3.2 at **1280×720, DPR 1**, not the available Nvidia device.

### Baseline correctness and delivery

Baseline typecheck, production build, visual build and **822 tests** passed (130 Worker, 667 client, 25 script). The first test attempt had no `dist`; building before rerunning fixed that harness prerequisite. Logs: `output/optimization-baseline/`.

Sixteen-client local full-feed baseline:

```sh
node scripts/benchmark-local.mjs --players=16 --phases=incident --warmup=5 --phase-seconds=260 --storage=tmpfs --latency=75 --jitter=25 --layout=clustered --label=optimization-baseline
```

Artifacts: `output/local-capacity-2026-09-11T05-19-02-692Z-optimization-baseline/`; log: `output/optimization-baseline/delivery.log`. It passed the existing playback and roster gates: snapshot gap p95 **57 ms**, p99 **63 ms**, max **96 ms**; generator event-loop p99 **12 ms**; invalid messages/errors **0**; peak balls **256**. Aggregate application payload **43.5624 Mbit/s**. Inspect raw `results.json`/`16.json` for incident and case coverage when comparing the changed protocol. This is loopback plus application-imposed latency/jitter and tmpfs, not hosted durability or real packet-loss evidence.

### Offline collision, timing and corpse CPU

```sh
node scripts/benchmark-optimization.mjs baseline  # already captured; do not overwrite
node scripts/benchmark-optimization.mjs stage-b  # already captured; do not overwrite
```

Raw reports: `output/optimization/{baseline,stage-b}/report.json`. These bundle actual TypeScript source with esbuild and record hashes.

- Reproduced owner-first ordinary projectile failure: owner in path hid a victim or wall; moving owner off path allowed the hit. Corrected source now matches the control for body/head victim hits and wall bounce.
- Old human/ball source ages: ~100/75 ms, disagreement p95 ~25 ms.
- Old AI/ball ages: ~250/75 ms, disagreement p95 ~175 ms.
- Shared-clock human and AI versus balls: both ~99.99 ms, numerical disagreement below 1e-9 ms in the ideal mature-track probe.
- Eight bursts of sixteen real corpse rigs, three measured repeats: baseline unbatched median lifecycle **115.67 ms**. Contemporaneous stage-b control **121.40 ms**; cold batching **316.32 ms**; warmed pooling **4.77 ms**. Pooling lowers this specific creation/removal CPU work ~96%; pose CPU remains ~15–17 ms per fixture. Cold batching alone is substantially worse. Prewarm cost is separate.

The stage-b offline probe predates the newest outcome/lifecycle edits. Re-run under a new label after fixing the remaining issues below.

### Repeated hardware rendering

Fixture: `test/visual/optimization-render.{html,ts}`. Runner: `scripts/benchmark-rendering.mjs`. Actual city, remotes, ChaosView, 16 rats, 16 churning corpses, 256 balls and 8 cases; ten-second warmup, three 120-second measurements.

```sh
npm run visual:build
node scripts/benchmark-rendering.mjs NEW-LABEL 120 3
```

Results and screenshots: `output/optimization-rendering/baseline-hardware/` and `stage-b-hardware/`. Logs: `output/optimization-baseline/rendering-hardware.log`, `output/optimization/render-stage-b.log`.

| Metric | Baseline runs | Pooled/batched runs |
| --- | --- | --- |
| Draw calls | 1934 / 1934 / 1934 | 1134 / 1134 / 1134 |
| Frame interval p99 ms | 33.3 / 33.4 / 33.4 | 16.8 / 16.8 / 16.8 |
| Frames over fixture budget | 100 / 146 / 300 | 10 / 20 / 28 |
| Maximum snapshot/apply CPU ms | 27.7 / 32.0 / 27.4 | 1.4 / 1.6 / 1.2 |
| Render submission p95 ms | 13.7 / 14.6 / 14.0 | 11.2 / 11.9 / 11.8 |
| GPU p95 ms | 10.81 / 10.95 / 13.54 | 10.63 / 11.15 / 11.01 |
| Renderer geometries / textures | 1119 / 122 | 815 / 170 |

Preparation cost in the changed fixture: **3003.9 / 826.9 / 874.1 ms**. It retains 48 rigs (16 for each of three hat geometries), at most 16 active. More retained textures and startup work are the measured tradeoff. GPU results do not demonstrate a uniform GPU speedup.

After each changed run, a fixed-pose render compares batch output against those same rigs' original source meshes: all three comparisons had **zero channels differing by more than 2**, maximum difference **1** across 2,764,800 channels. The final screenshot was visually inspected. This is one fixed view, not a complete visual or human acceptance gate.

A first baseline attempt without `--enable-gpu` used SwiftShader at roughly 2.3 seconds/frame. That partial result is retained under `output/optimization-rendering/baseline/` and is **excluded** from hardware comparisons. The runner now uses `--headless=new --enable-gpu`; no security bypass flags were used. Its environment JSON identifies hardware and baseline HEAD, but does not hash the dirty bundle. The baseline source manifest and timing distinguish the runs; improve bundle/source hashing before further comparisons. Current `dist-visual` will be newer than the measured stage-b bundle.

## Implemented source changes

### Qualified by focused tests and the measurements above

- `src/shared/SpatialRayQuery.ts`: optional eligibility predicate applied before closest-hit selection; Cannon raycastAll fallback when required. Preserves existing masks/backfaces/tie ordering.
- `src/shared/ChaosSimulation.ts` and `src/weapons/CheeseGun.ts`: ordinary owner exclusion uses that predicate, matching the preexisting large-ball exclusion behavior.
- `src/prototype/CorpseRigPool.ts`: bounded actual model/animator rigs; appearance colors updated in place; reset pose/root transforms; identity-safe acquire/release and owned-resource disposal.
- `src/utils/RatModel.ts`: retains references to appearance materials for reuse without rebuilding geometry.
- `src/prototype/prepareCorpseRigs.ts`, `src/session/createGame.ts`: incremental/yielding preparation of all three hats; actual batching/shader variants and offscreen buffer upload. Existing prepared rat also enables batching.
- `ChaosView`/`GameSession`: share the pool, retain it through reconnect, dispose once at session end.
- `test/client/{ownerCollision,corpseRigPool,worldPresentationClock}.test.ts`: collision controls, actual vertex/pose/color parity, bounded resource ownership, clock agreement/jitter/reset.

### Newer integration: compiles and has focused coverage, still needs qualification

- `WorldPresentationClock.ts` and `SnapshotBuffer.sampleAt`: common source-time clock, preserving established clock fitting and adaptive buffer bounds. `WorldSnapshotBuffer` removes the separate AI 250 ms floor in world-v2 sessions. Legacy behavior is retained when no common clock is supplied.
- `ChaosPresentation`: same clock for mature balls/cases/corpses, preserves real first-draw muzzle births, single-rebound corner reconstruction, timestamped terminal retention and bounded tombstones.
- `PresentationEvents.ts` and `GameSession`: queue remote damage/death/respawn on the common clock; local health/action feedback remains immediate. Clear queues on welcome/reset, discard departing-player events. Remote respawn resets its source barrier.
- `ChaosView`: bounded 16-state history selects corpse lifecycle and remote case ownership at presentation time; local possession/HUD remains immediate. New corpse pooling and this later lifecycle logic must be tested together.
- `shotOutcome.ts`: terminal vocabulary and bounded 256-entry/1024-ID diagnostic journal.
- `ChaosSimulation`: callbacks for contact (victim and head/body), expiry, capacity eviction, popcorn split and reset; unique epoch/serial event IDs. No physics tuning change.
- `GameRoom`: critical outcome batches of at most 32 events, correlated/rate-bounded shot rejection, timestamped damage/death/respawn; successful `playerShot` remains the authoritative acceptance event.
- `pickupEligibility.ts`/`ChaosSimulation`: centralized exact eligibility gates and real LOS query, diagnostic reason/distance/speed/cooldown. Server sends bounded per-player status changes, with quiet far-away stable status. No pickup intent, speculative ownership, protection, scoring or pending UI was added.
- `networkProtocol.ts`, `messageValidation.ts`, `NetworkManager.ts`: protocol 9, validate new bounded messages, keep welcome-only sockets from consuming game updates.
- `test/client/actionOutcomes.test.ts`: actual between-snapshot contact, expiry/capacity/reset, terminal-before-first-draw suppression, delayed mature removal, journal/queue bounds, malformed protocol, eligibility boundaries.

## Validation at handoff

Final pass on this handoff's application source: **843 tests passed** (130 Worker, 688 client, 25 script), `npm run typecheck`, `npm run build`, `npm run visual:build`, and `git diff --check` passed. Existing bundle-size warnings remain. Logs: `output/optimization/handoff-{tests,typecheck,build,visual-build}-verified.log`. Earlier failing and baseline-recheck logs are retained. Subsequent changes were documentation and manifests only; no additional runtime behavior was changed.

Exact tracked/new source hashes and built asset hashes are recorded in `output/optimization/handoff-manifest.json`. The diff is uncommitted and includes new files.

Initial integration checks passed Worker 130 and client 681/688; six failures were constructor-bypassing test fixtures missing new queue/clock fields. Those fixtures were updated. The remote presentation fixture also passed an rAF timestamp 1000 ms different from its mocked `performance.now`; it now uses the same clock, as production does.

The remaining AI progress test failed twice under full parallel client load, but passed in isolation. A fresh archive of the **unchanged baseline** passed all 667 client tests (`output/optimization/handoff-baseline-client-recheck.log`). Inspection found the navigation regression uses a real 2 ms wall-clock budget in addition to its 96-expansion cap. Its test now mocks the synchronous clock frozen, matching Workers, while retaining every progress/shooting/recovery assertion and the existing expansion bound. No product AI behavior was changed. Real-load AI performance still needs the changed sixteen-client qualification; do not equate this deterministic fixture with that qualification.

## Known unfinished work and review risks — do these next

1. **Review the newer protocol/lifecycle integration before further performance claims.** Add Worker/socket tests for rejected shot correlation, successful/terminal ordering, duplicate and delayed results, reset/reconnect epochs, critical queue pressure, and bounded invalid-input amplification. Current worker tests pass but new behavior is primarily covered at shared-module level.
2. **Complete coherent lifecycle presentation.** Impacts/audio are still processed immediately on snapshot receipt. Extra-case birth/removal still follows receipt. Corpse track removal and case lifecycle history reset happen on newest snapshots even while ChaosView uses older lifecycle states; fallback poses can hold/jump. Test death/respawn/new movement, cap replacement, pickup/drop/return/reset and all eight missiles across jitter/pauses. The 300 ms authoritative-birth warm-in is an intentional exception; retain known-terminal precedence. A source reset and long gap currently clear some histories independently; exercise stale/reordered events and track resurrection. Corpse/history behavior after reset and an empty first frame needs direct integration tests.
3. **Finish useful action traces.** Journal currently captures acceptance, rejection, terminal and pickup source/receipt data and is included only in enabled diagnostics. It does not yet capture full local fire time/view tick/apply/display age or a replay of disputed contacts. Avoid copying a full journal every measured frame; cache snapshots or publish on report cadence. Review global 24-ID `recentShots` limit versus desired dedup window; it was not changed.
4. **Pickup qualification remains open.** Pure gate and existing game tests pass, but no measured p95 eligible confirmation/RTT experiment exists yet. Run real-simulation competing-claimant/moving-case/899–900 ms/18-speed/LOS/death/reset fixtures. The diagnostic status is throttled and is not the ownership confirmation; use chaos owner transition for latency. Add pending UI/intent only if measurements justify it.
5. **Conditional collision/lag experiment remains unimplemented.** Evaluate relative-motion target sweeps and bounded launch catch-up independently with life/epoch, static-wall, ricochet, projectile-volume and held-case ordering fixtures. No fairness-changing lag compensation is enabled. Do not turn this into hitscan or increase visual/physics radius without human review.
6. **Wire/query/persistence profiling remains open.** Baseline traffic is high (~43.6 Mbit/s aggregate). Measure lossless byte reductions, static-query maintenance and aim-query work. Storage output gates are a plausible mechanism, not an established cause. Compare durable disk/tmpfs separately, retain crash-safe death/respawn/checkpoints and all ACK/baseline/fragmentation bounds. No backend migration or durability shortcut is justified yet.
7. **Repeat changed sixteen-client all-incident benchmark** with the exact baseline flags and a new label, after current protocol/lifecycle fixes. Target p99 gap <100 ms, invalid/errors/skips/disconnects 0, generator p99 ≤25 ms, existing roster/score/ACK/playback gates, 256 balls/all ten incidents/eight cases. It has not been run against protocol 9.
8. **Repeat final offline and hardware comparisons** after functional integration stabilizes. Stage-b hardware proves the pool/batching mechanism, not all later protocol/presentation edits. Keep three repeats, actual GPU identification, exact source and bundle hashes. Preserve images/geometry/material/shadow/picking fidelity and report startup/memory tradeoffs. No physical phone or hosted sixteen-human performance has been measured.
9. Update current docs and add a finished verification receipt only after the criteria are met. Keep historical reports unchanged. User has not requested a deployment or merge. Leave the goal incomplete until all required work is done.

## Operational notes

All benchmark browsers/servers started here were owned loopback/temporary instances and have stopped. No production services were touched. Temporary unchanged-baseline archive path is recorded in `output/optimization/baseline-recheck-directory.txt`; it contains a node_modules symlink and may be removed specifically if desired. A prior interrupted software-render browser profile may remain at `/tmp/rat-optimization-browser-VIvgrT`; do not broadly delete profiles or processes.

Use `npm run visual:build`, not `build:visual`. Build `dist` before the Node script suite. Relevant logs and raw artifacts are ignored by Git under `output/`; preserve them locally for comparisons. Continue in this exact worktree, with existing edits intact.
