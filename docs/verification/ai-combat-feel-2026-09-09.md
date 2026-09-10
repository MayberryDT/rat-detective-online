# AI combat feel preview — September 9, 2026

User requested much more frequent bot shooting with less accurate, more human combat aim while preserving case swarming, fighting priorities, Dispatch activation and navigation. Implemented as uncommitted changes on main after `af66f36`. Public production unchanged.

## Implementation

`src/shared/BotCombat.ts` owns combat perception, aim and trigger rhythm. `ObjectiveBotBrain` retains objective selection, routes, movement, progress recovery and precise Dispatch shots. Combat uses an independent seeded random stream with mixed seeds so bots do not synchronize their opening volley and future combat tuning does not consume navigation randomness.

- Initial target acquisition: 200–450 ms. New target/death/reset reacquires; no immediate opening shot.
- Fire spacing: 100–143 ms (7–10 shots/sec during bursts), burst duration 600–1500 ms, pause 180–450 ms. No accumulated/catch-up volleys. Existing 12/sec server limiter remains.
- Observation intervals: 160–260 ms; tracking blend has a 200 ms time constant. Copies observed coordinates rather than retaining a live target reference for aiming.
- Aim offset: 4–8 degrees, held for 250–500 ms before correction. Angular error creates larger misses at longer range. No perfect lead prediction or added headshot targeting.
- 25% of bursts may finish briefly at the last observed point after visibility is lost, for at most 180 ms. No new hidden burst or hidden-position update.
- Dispatch stays precise, visible-only, at the existing 350–750 ms cadence and takes priority over combat fire. Shared minimum trigger spacing prevents combined Dispatch/combat bursts from exceeding the normal rate envelope.
- Ordinary balls, 256-shot capacity, immunity, damage attribution, movement/navigation and case priorities were not retuned.

## Validation

Typecheck, production build and full suite passed: **516 tests** (100 Worker, 394 client, 22 scripts). Existing large JS chunk warning remains. Tests requiring instant/centered combat shots were updated to verify acquisition followed by imperfect aim; muzzle-origin and pose-before-shot checks remain.

New coverage: reaction limits, per-second firing bound, burst pauses, seed desynchronization, angular distance scaling, held error, delayed strafe tracking, bounded last-seen follow-through, target/death/reset handling, no stall catch-up volleys and Dispatch priority. Seven-bot ten-second workloads for Scattershot, Popcorn and Bad Ammunition verify bounded projectile count and fresh human shot admission. They do not guarantee full projectile lifetime under sustained saturation.

Deterministic 60-second **geometric aim proxy** at 30 units, with a laterally oscillating target: new 359 shots versus old 103 (3.49× overall); body-radius intersections 2/359 versus 45/103. This is not a ballistic simulation, measured live hit rate, damage-per-minute result or human acceptance. Actual shooting frequency depends on visibility and encounter duration. The original request's 5–10× overall activity has not been established; current burst cadence is 7–10/sec with pauses.

The existing actual-city navigation diagnostic passed in the final full suite. No automated browser input playtest or capacity certification was performed.

## Private normal-game preview

- URL: http://127.0.0.1:5181/?room=graybox-benchmark-match-ai-feel
- Private Worker version: `4b768ca2-7362-4c21-97e8-04fd24990f2c`
- Expiry: September 9, 2026 at 17:43 Pacific (September 10 00:43 UTC).
- Automatic room cap 24; one human plus seven AI when alone. Existing incident changes and approved cartoon pop remain.
- New fixture health/identity verified by the deployment script; local HTML matches the current build. Human feel and full-game lethality await playtest.

## Playtest correction: slower taps and speculative ricochets

Tyler found the initial bursts too rapid and requested shooting even without visible opponents, including alleyways, walls, buildings and sewers. This correction supersedes the initial cadence and visible-only activity described above.

- Combat spacing is now 240–380 ms (about 2.6–4.2 shots/sec within a burst), with 900–2000 ms bursts and 300–650 ms pauses. The previous 3.49× activity figure no longer describes this tuning.
- `BotOpportunisticFire` adds one-to-three speculative shots per group, spaced 280–450 ms, with 800–1800 ms between groups. It receives only self pose, travel heading and the current navigation waypoint, never an enemy position.
- Most groups aim roughly along the travel corridor (±0.16 radians), while 35% aim obliquely to either side (0.35–0.85 radians), allowing ordinary world collisions to produce ricochets. Route slope influences vertical aim for stairs/sewers. This is a local directional heuristic, not actual wall detection or calculated bank shots at opponents.
- Short held facing avoids a one-frame sideways twitch on speculative shots. Visible combat cancels speculative groups; Dispatch retains precise priority. A shared 240 ms gate prevents combat/speculative transitions producing rapid double shots.
- No navigation search, objective priority, weapon tuning, damage rule or capacity change was introduced.

Validation: typecheck and full 520-test suite (100 Worker, 398 client, 22 scripts) passed, followed by 47 focused controller/objective/speculative tests and typecheck/build after the final facing hold. New tests cover no-opponent firing, slower spacing, forward/oblique direction mix, downhill aim, pauses, no catch-up volleys, held facing, priority, death/reset and unchanged case movement/routes. Seven-bot incident pressure checks still verify the 256 cap and fresh human admission. Gameplay feel remains for Tyler.

Updated private version: `57c2e7fe-4b0f-4aff-8fa4-e937e64f1f6a`. Preview: http://127.0.0.1:5181/?room=graybox-benchmark-match-ai-feel-v2 . Expires September 9 at 17:51 Pacific. Public production unchanged; AI changes remain uncommitted. Deployment health identity verified, and local HTML checked against the rebuilt client.

## Playtest correction: irregular groups, quiet stretches, and recovery

- Visible combat now chooses a single shot 35% of the time, otherwise two to six shots. Taps retain 240–380 ms spacing and short 300–650 ms between-group pauses (in addition to the final tap's cooldown). Delayed perception, angular error and Dispatch priority remain.
- Speculative fire chooses singles 40% of the time, otherwise two to five shots. Groups run within 6–10 second active windows separated by 3–7 seconds of quiet. The average window allocation is about 62% active, not a guarantee that shots occur during 62% of frames. Within active windows, taps stay 280–450 ms apart with 450–1500 ms group pauses. Long suspended frames expire the window instead of replaying missed shots.
- Active room ticks check due player/round deadlines before physics and drain the existing durable event queue. Alarm delivery remains the idle/recovery mechanism. No SQL scan is added to ordinary ticks; due checks use the bounded player roster. A regression test withholds alarm execution and verifies one respawn with no duplicate queue entry.
- Normal-game pointer lock focuses the canvas, suppresses context menus, auxiliary-click/scroll defaults and Tab/Space focus defaults while locked. Escape remains browser-controlled. This hardens plausible unwanted-unlock paths; the original cause was not captured.
- `?diagnostics=quiet` records frame/transport diagnostics without a panel. Added bounded focus, visibility, Escape, pointer-lock/error and local death/respawn events; F8 exports the report. Event listener cleanup is tested.

The reported Evidence Tampering stall is **not confirmed fixed**. A local Node full-city, 600-step physics-only probe measured approximately 0.60 ms mean / 0.94 ms p95 without the incident, 0.56 / 0.98 ms with freely moving cases, and 1.71 / 2.73 ms with all eight cases repeatedly forced to 220 units/sec. The last workload used 2,400 Cannon steps versus 600 baseline. These are isolated measurements without players, bot navigation, network delivery, rendering or corpse load; they do not reproduce the full session or certify hosted timing. Case/ball physics were preserved rather than changed on this evidence.

Validation: typecheck, build and full **522-test** suite passed (101 Worker, 399 client, 22 scripts). Existing bundle-size warning remains. Rhythm tests now explicitly check singles and multiple burst lengths, multi-second speculative gaps and no catch-up fire. No browser gameplay/input automation was used. Human feel, unexpected focus loss and the original combined incident lag remain playtest checks.

Updated private preview: http://127.0.0.1:5181/?room=graybox-benchmark-match-ai-feel-v3&diagnostics=quiet . Private Worker version `2757e4bb-d461-4471-b168-9fc677dd9b28`, expires September 9 at 18:18 Pacific (September 10 01:18 UTC). Fixture health/identity verified during deployment and relay startup; served HTML matches the current build. Public production remains unchanged; this follow-up remains uncommitted.
