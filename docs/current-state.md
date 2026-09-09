# Current Rat Detective state

Verified from source and release records on **2026-09-08**. This is the handoff for new work, not a request to implement everything in old research. Deployment details live in [live-service.md](live-service.md).

## Pending local changes

The September 8 multiplayer review follow-up separates remote presentation from fixed-step physics and unifies chaos wire encoding. It passed 418 tests, typecheck and build, but is **not deployed or human-playtested**. See [the implementation receipt](verification/remote-presentation-2026-09-08.md). The shipped baseline below remains the release record.

The capacity follow-up accepts up to 100 scoreboard entries while preserving 24-player admission, and adds an isolated authenticated hosted ladder. The private copied fixture is deployed for measurement; the public game is unchanged. The hosted ladder completed four phases through 12 clients, stopped at 24 on a delivery gap, and verified complete rosters/scoreboards through 100 in a separate admission check. These do not establish supported capacity. See [hosted capacity testing](hosted-capacity-baseline.md) and [results](verification/hosted-capacity-2026-09-08.md).

The next capacity follow-up adds negotiated compact chaos snapshots and per-connection acknowledgement limits. It is deployed only to the private capacity fixture. Bandwidth is lower, but sustained delivery failures remain; 100-player gameplay and visible remote animation are not yet verified. See [compact snapshot verification](verification/compact-snapshots-2026-09-08.md).

The subsequent human playtest still found choppy remote animation. A private-client playback follow-up now smooths delay changes and prevents catch-up jumps after buffer starvation; replay results improved and the user subsequently confirmed the private playtest was dramatically smoother. This is visual acceptance, not capacity certification. See [remote playback](verification/remote-playback-2026-09-08.md).

The fifty-total-rat follow-up is in progress on the private capacity Worker. It adds shared snapshot preparation, distributed generators, larger private AI rosters, a visible renderer fixture and clock-rate adaptation in remote playback. Fifty rats have been admitted and exercised, but failures remain and the target is not yet certified. Public capacity stays unchanged. See [the ongoing receipt](verification/fifty-rats-2026-09-08.md).

The latest private follow-up adds receiver-timed presentation for server-owned AI and rigid remote-mesh batching with material/shadow preservation. The 49-AI-plus-observer workload passed all five combined 50-rat stages, including the original raw hold threshold; the renderer fixture achieved a 16.8 ms p95 frame time at 50 rats and 256 balls. Application validation passed 480 tests, typecheck and build; a subsequent harness reconnect regression also passes. Bounded lower-count regressions now pass at 12, 24 and 32 rats (12 across four initial stages plus a corrected churn rerun). Work stopped at the user’s request; no final preview was started. Earlier delivery spikes and the randomized navigation-test failure remain documented, and public capacity is unchanged. See [AI playback and batching](verification/ai-delivery-and-rigid-batching-2026-09-08.md).

## Fifty-rat human preview — September 8 closeout

At the user’s request, the completed working tree is being committed and a full-game private preview is available at `http://127.0.0.1:5180/?room=graybox-benchmark-ai-human-fifty`. It uses 49 server-owned AI plus the human player, with the normal city and game loop. Private deployment `fa4f7eaf-2b38-4cb4-9257-e8375a555496` expires September 9 at 08:10 UTC (1:10 AM PDT); the relay shuts down at expiry. Public production is unchanged. Build passed again for this preview. Raw generated captures and deployment staging remain outside Git under `output/`, with the separate evidence ZIP in Downloads.

## Creative direction

Wild, interacting physical comedy is the point. Lucky ricochets, chain reactions, flying rats and spectacular consequences are features. Preserve usable controls, understandable interactions, navigation and continued participation without balancing away the fun.

The city is a dark noir metropolis with varied high-contrast windows and lights. Its approved scale is an extension of the original city, not a tiny test arena. Dense blocks, short buildings, tall high-rises, alleys, dead ends, landmarks and sewers should read as a city. Keep a few deliberate open spaces rather than broad empty gaps. Aboveground lights stay visible; sewer lights may respond to proximity. Windows change occasionally and asynchronously.

Landmarks include Records Bureau, Icebox, Needleworks, Pump Hall / pumping station, and Gate. Their roles and current scale matter more than literal old research layouts. Needleworks was an alternate in the original research but is now implemented. Interiors have distinct layouts and stairs. Pipes and manholes connect sewers; vehicles and grime support the rat-city identity. Current approved model detail supersedes old concept prompts.

## Shipped game loop

- Free-for-all multiplayer with 3 HP, body damage 1, head damage 3, 20 credited kills to win, 5-second respawns and a 6-second victory display before reset.
- The Hot Case is auto-collected nearby, carried in the unused hand beside the rat, and knocked loose when hit by bullets, which reflect off it. Loose cases are enlarged; carried cases shrink to the normal model. Opaque leather, protruding documents, animated grip and a prominent red outline are intentional. Locator text is subtle, without the old giant icon/arrow. Carriers do not need their own overhead locator.
- Holding any case gives **2× kill credit** on the scoreboard. This is not double projectile damage. Case pickup/loss announcements teach its importance. There is no current minimap. No self-damage; no friendly-fire damage. There is no implemented team mode to infer from that requirement.
- Five Dispatch stations, one at each landmark, share a readiness / roulette / incident / cooldown lifecycle. Shoot the bright red target. Roulette is large but toward the top, preserving the view of aiming and play. Default timings: 2.4-second roll, 25-second incident, 16-second cooldown.
- Six launcher types: pressure, dumpster/compactor, freight ram, sewer geyser, mousetrap and fan. Each has a separated red-topped trigger, related nearby launcher, distinct animation/audio and randomized launch direction constrained to the city. Launch effects currently last 1.5 seconds; do not restore the overlong versions.
- Dead rats are physical, shootable missiles with damage attribution. Improper Disposal greatly increases launch force and adds damaging cheese-ball bursts. Burst kills credit the rat that caused the death, allowing chains; shooting a missile can transfer its damage credit. Ordinary cheese balls remain spherical.

## Dispatch catalog

`src/shared/incidentCatalog.ts` is the authoritative ID/copy list; simulation behavior is in `ChaosSimulation.ts`.

| Incident | Current behavior |
| --- | --- |
| Improper Disposal | Fast corpse missiles plus death bursts, up to 120 balls subject to the shared cap |
| Bad Ammunition | Every shot fires two balls |
| Pressure Surge | Every launcher fires together every three seconds |
| Evidence Tampering | Three extra carryable cases, four total; loose shot cases become deadly ricocheting missiles |
| Crossfire | Balls become visibly red and lethal after their first wall bounce |
| Scattershot | Five-ball fan per shot |
| Return to Sender | Balls reverse once after about 0.8 seconds |
| Cheesequake | Existing balls hop every three seconds |
| Ricochet Racket | First wall bounce splits a shot into three balls |
| Popcorn Panic | Surviving a ball hit launches the rat upward |

Evidence Tampering extras are removed at expiry, including carried extras, models, physics bodies and bonuses. One case per rat. Original case remains. Kickback is removed and legacy snapshots map it to Scattershot. After Hours Collection maps to Crossfire. Do not reintroduce either removed incident from old notes.

## AI and rounds

Public bots run in the Durable Object, independent of browsers. Each new round selects 8, 9, 10 or 11 bots and fresh distinct names from the existing rat-name pool. IDs come from `rd-ai-00` through `rd-ai-10`; active names/count persist through reconnects, status requests and eviction. Legacy fixed-eleven rooms migrate without rerolling a running round. Eleven slots remain reserved, leaving thirteen human slots under the 24-player cap.

Priority: available loose case; otherwise chase a case carrier; otherwise visible opponents; otherwise useful exploration. A carrier fights rather than pursuing its own case. Bots shoot more frequently and shoot visible Dispatch targets while passing. Navigation includes street/interior/sewer geometry; it is not a guarantee that every route succeeds.

Shared reverse destination flow fields avoid eleven independent searches for the same case. Pending searches preserve usable routes and allow checked local steps. Work is bounded to 96 expansions / 2 ms per update, with six cached fields. Worker clocks can freeze within a callback, so the operation bound is essential. Bots move at 6.5 units/sec, publish at 20 Hz plus before shots, and use source simulation timestamps. Human movement remains 18 units/sec.

Recovery measures actual progress. After sustained grounded failure, an escape attempt starts at 8 seconds and rescue at 30 seconds; launches have a grace period. Moving bots must not be scattered merely because a route is pending. Failed goals are temporarily suppressed and retried. A stationary unreachable primary case has a multi-bot recovery watchdog with a nearby-human exception. Preserve health and scores during recovery.

## Where to work

| Area | Main source |
| --- | --- |
| Session / networking / remote presentation | `src/session/GameSession.ts`, `src/network/NetworkManager.ts`, `src/session/RemotePlayers.ts`, `src/shared/SnapshotBuffer.ts` |
| Authoritative room / rules / roster | `src/worker/GameRoom.ts`, `src/worker/gameState.ts`, `src/shared/botRoster.ts` |
| Bots | `src/worker/ServerBotController.ts`, `src/shared/ObjectiveBotBrain.ts`, `src/shared/BotNavigation.ts` |
| Projectiles, cases, corpses, incidents | `src/shared/ChaosSimulation.ts`, `chaosState.ts`, `incidentCatalog.ts`, `ballTuning.ts` in the same directory |
| Collision performance | `src/shared/SpatialRayQuery.ts`, `src/shared/StaticCityBroadphase.ts` |
| Shared map geometry | `src/shared/grayboxLayout.ts`, `cityPlan.ts`, `landmarkLayout.ts`, `sewerLayout.ts`, `playerSpawns.ts` |
| City / landmarks / controls / case visuals | `src/world/CityGenerator.ts`, `src/prototype/` |
| Rat, animation, muzzle and controller | `src/utils/RatModel.ts`, `RatAnimator.ts`, `muzzlePose.ts`, `src/entities/RatEntity.ts`, `src/player/RatController.ts` |
| Shot feedback / sounds | `src/weapons/CheeseGun.ts`, `CheeseImpactEffects.ts`, `src/audio/EntityAudio.ts` |
| HUD, title and sharing | `src/ui/`, `src/style.css`, `index.html`, `public/logo.png`, `public/share-title-v1.png` |
| Diagnostics | `src/session/PerformanceStats.ts`, `src/worker/RoomDiagnostics.ts`, `src/shared/diagnosticReport.ts` |

Version 2 uses shared server-authoritative chaos simulation. Version 1 retains the earlier client-hit path. `NormalGameBots.ts` is an explicit localhost practice harness with eleven browser clients; it does not define production AI count or hosting. Static prototype pages are visual/solo tools, not proof of multiplayer correctness.

## Known limits and next-work boundaries

- Current global shot cap is **256**, maximum corpses **16**. Bursts yield capacity to fresh trigger pulls. These are current implementation limits, not approval to raise caps or reduce chaos arbitrarily.
- The ambition of 50–100 players has not been achieved or certified. Public admission remains thirteen humans plus 8–11 AI. Bounded probes and unit tests do not constitute a capacity benchmark or 24-hour soak.
- Local workerd showed multi-second authoritative stalls even with zero swap; the hosted relay bypasses that runtime. Root cause was not conclusively identified.
- The separate slow/choppy AI regression was reproduced as stalled pathfinding plus misguided recovery. The shared-navigation fix improved it; occasional local obstruction remained in a live observation. Do not blame the new domain without evidence.
- Client human movement remains trusted within a finite envelope; the game is not cheat-proof. See the authority document.
- Short-building facade variety and model polish can improve. Gun immediacy, dense-map visibility, routes, collision truth and real network feel still need human playtesting when changed.
- Latest application validation: 409 tests, typecheck and build passed for release `e3a70ae3-246f-4712-94dc-a692495ac045`. Sharing HTML/image and redirect were checked live. Roster replacement was tested in Durable Object integration tests; no forced live reset or browser-input test was performed for that release.

Private capacity research follow-up is recorded in [the implementation receipt](verification/capacity-review-implementation-2026-09-08.md). These working-tree changes do not represent a new production release or a verified public capacity increase.
