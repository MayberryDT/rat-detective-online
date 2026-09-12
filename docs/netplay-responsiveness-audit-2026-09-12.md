# Rat Detective netplay responsiveness audit

**Date:** September 12, 2026  
**Scope:** Current protocol-14 client/Worker path, with emphasis on shots that visually cross a rat without damage and case/power-up contacts that confirm late or are missed.  
**Status:** Audit and implementation plan only. No gameplay, protocol, service, deployment, or production state was changed.

## Executive conclusion

Rat Detective really is about 90% of the way to excellent netplay. The difficult foundational work is already present: local movement is immediate, local shots begin at the animated muzzle in the real-ID projectile pool, remote motion has bounded adaptive interpolation, shared physical objects use one playback clock, movement and shots retain causal ordering, replaceable state coalesces under pressure, and authority still owns damage and objectives.

The remaining 10% is not primarily “more interpolation.” It is **interaction-time coherence**. The client draws one coherent-but-delayed world, while the server decides collisions against another, newer world:

1. A human opponent is deliberately presented **100–350 ms in the past**; bots use at least **250 ms**. The local aim and predicted ball sweep use that displayed pose. The server, however, tests the ball against the target's latest received pose. The shot message carries no displayed server tick or movement sequence, and the server retains no pose history for collision adjudication. A clean visual hit can therefore be a clean authoritative miss.
2. A power-up claim tests only the player's position at an authority step. It does not test the path between accepted movement samples. The case has a short path test, but that history is overwritten every simulation step and disabled when its sample is more than 150 ms old. This makes pickup quality depend on packet/tick timing.
3. A firing player gets projectile-birth confirmation and later snapshots, but no explicit authoritative shot outcome. Non-healing power-up collection likewise has no direct result message. Presentation has to infer success from disappearance or a later state snapshot, so even a correctly accepted action can feel late or ambiguous.

The highest-value correction is therefore a small **interaction layer** on top of the current transport: server-tick identity, bounded pose history, explicit shot/pickup results, swept pickup validation, and reversible local anticipation. A transport rewrite is not the right first move.

## Scope, method, and evidence limits

This audit traced input, movement sampling, WebSocket delivery, Worker validation, server simulation, compact state delivery, interpolation, local shot prediction, pickup resolution, persistence ordering, and current diagnostics. It compared the current tree with the accepted September 10–11 verification receipts and prior optimization research in GBrain.

A deterministic offline reproduction was added under ignored audit output at `output/netplay-audit-2026-09-12/reproduce.ts`. It uses the real `ChaosSimulation`, real rat colliders, real pickup radius, and real case approach logic. Five focused client suites also passed: **65/65 tests** across local shot presentation, snapshot buffering, combat, case collision, and pickups. No browser input automation, live-room manipulation, or deployment was performed.

The offline reproductions establish mechanisms, not their live frequency. Existing hosted probes measured delivery gaps but did not capture shot view-time, target history, action-to-result latency, or disputed contacts. Consequently, this report can identify why the symptoms are possible and rank likely contributors, but it cannot honestly assign a production percentage to each cause yet.

## What is already strong and should be preserved

### Immediate local control

`GameSession.shoot()` performs the local gun animation and creates a local projectile immediately after a successful socket send ([GameSession.ts](../src/session/GameSession.ts#L175)). `LocalShotPresentation` uses the real shot IDs, shares the server-seeded Bad Ammunition/Scattershot pattern, reconciles rather than duplicates, and never awards local damage ([LocalShotPresentation.ts](../src/shared/LocalShotPresentation.ts#L17)). This directly fixed the old confirmation-delayed gun response and should remain the foundation.

### Bounded, jitter-aware presentation

Human rat playback uses a 100–350 ms adaptive reserve, gentle 90–110% cursor correction, and no extrapolation through walls ([SnapshotBuffer.ts](../src/shared/SnapshotBuffer.ts#L5)). Shared balls, cases, and corpses use a related 100–350 ms clock, 32 samples, and no more than 80 ms extrapolation ([ChaosPresentation.ts](../src/shared/ChaosPresentation.ts#L10)). The dated replay reduced held moving frames from 22.96% to 2.35%, with p95 displacement capped at 1.10× nominal; that was a real presentation improvement, not evidence that network stalls disappeared.[2]

### Good congestion and ordering defenses

Movement is replaceable and dropped locally above 64 KiB socket backlog rather than queued stale; broader congestion forces reconnect above 256 KiB ([NetworkManager.ts](../src/network/NetworkManager.ts#L293)). The Worker has bounded reliable delivery, cumulative acknowledgement, movement coalescing, fragmentation budgets, and eight compact chaos frames in flight ([ConnectionDelivery.ts](../src/worker/ConnectionDelivery.ts#L5), [ChaosDelivery.ts](../src/worker/ChaosDelivery.ts#L5)). A shot is delivered after its shooter's pending movement sample, including a compact combined representation when supported ([GameRoom.ts](../src/worker/GameRoom.ts#L1363)). These are the right invariants.

### Correct authority boundaries

Local sweeps only affect the display. The Worker owns damage, scores, case impulses, incidents, pickup ownership, and final projectile removal. Owner/body filtering now occurs before closest-hit selection, so an excluded owner or owned case cannot hide a wall behind it ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L817)). That fixes a defect identified in the earlier optimization audit and should not be reopened.[5]

## Finding 1 — the shooter and authority evaluate different target times

**Priority: P0. Confidence: very high. This is the main explanation for clean-looking shots that miss.**

The sequence today is:

1. Remote movement is sampled from a delayed buffer.
2. The sampled position is written to both the visible rat mesh and its local Cannon body ([RemotePlayers.ts](../src/session/RemotePlayers.ts#L53)).
3. Camera aim raycasts that delayed visible scene, and local projectile prediction sweeps the same delayed Cannon bodies ([CheeseGun.ts](../src/weapons/CheeseGun.ts#L94), [CheeseGun.ts](../src/weapons/CheeseGun.ts#L155)).
4. The shot message sends only `shotId`, origin, and direction. It carries no server tick, view tick, movement sequence, RTT estimate, or predicted contact ([networkProtocol.ts](../src/shared/networkProtocol.ts#L105)).
5. On the Worker, every simulation step places rat hitboxes at the newest `PlayerData` position and sweeps the ball against those current hitboxes ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L395), [ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L759)). No historical target poses exist.

That creates a deterministic disagreement even on a perfectly stable connection. The lower rat collider has radius 0.6. In the audit reproduction, a direct 20-unit shot hits with the target shifted 0.55 units sideways but misses at 0.61 units. A normal rat moving at 18 units/s covers **0.594 units in 33 ms**, **1.8 units in the minimum 100 ms presentation reserve**, and a Hot Pursuit rat covers **2.61 units in 100 ms**. Gravity makes the real tolerance slightly direction- and distance-dependent, but the order of magnitude is decisive.

This is not a rare theoretical race. For perpendicular movement, the minimum presentation reserve alone is three lower-body radii. The reason many shots still work is that targets stop, move partly along the firing line, collide with walls, cross the shot later, or are hit in larger combined body/chest regions. The architecture nonetheless guarantees a class of visually valid misses.

Valve's classic lag-compensation model solves the same perceptual contract by retaining player history and evaluating a shot at the command's viewed time, accounting for packet latency and client interpolation.[6] Rat Detective cannot copy a hitscan implementation wholesale because its cheese balls have travel time, gravity, walls, ricochets, cases, and delayed reactions. It should adopt the **time-alignment principle**, not turn the weapon into hitscan.

### A secondary origin-age issue

Human movement is normally sent at most once every 50 ms ([GameSession.ts](../src/session/GameSession.ts#L343)). Firing does not force or piggyback the current local pose in the inbound shot message. The Worker accepts an origin within 12 units of the newest server pose ([validation.ts](../src/worker/validation.ts#L22)), which avoids false rejection but means the launch can be based on a newer client muzzle than the server's shooter pose. The outbound movement/shot ordering protects observers from causal reversal; it does not make the inbound pose contemporaneous with the trigger.

This is probably smaller than target-time mismatch at ordinary cadence, but it becomes meaningful when a movement update is dropped due to socket backlog or a frame stall.

## Finding 2 — inferred projectile outcomes cannot produce consistently coherent feedback

**Priority: P1. Confidence: high.**

The firing client gets a `playerShot` birth payload containing server-resolved ball IDs and velocities, then learns projectile continuity/removal through chaos snapshots ([networkProtocol.ts](../src/shared/networkProtocol.ts#L159)). Damage is a separate `playerDamaged` event. There is no per-ball terminal message saying “hit this rat at this tick,” “hit the case,” “expired,” “was rejected,” or “was removed by capacity/reset.”

This leaves ambiguous visual states:

- If the local sweep hits the delayed displayed rat, the ball is hidden immediately, but authority may miss the newer rat. A later authoritative snapshot can cause correction or continued flight.
- If the local sweep misses while authority hits the newer rat, the ball remains visible until the damage/removal reaches the client; it can appear to travel through the displayed silhouette and then vanish.
- Snapshot absence after confirmation is treated as an authoritative hit/removal even though the client does not know which terminal cause occurred ([LocalShotPresentation.ts](../src/shared/LocalShotPresentation.ts#L65)).

The current rule—no speculative hit marker or damage—is correct. What is missing is a reliable authoritative **shot-result ledger** that lets presentation settle the one real ball without guessing.

## Finding 3 — ordinary balls are rendered as spheres but adjudicated as centerline rays

**Priority: P2. Confidence: high; likely explains grazing “through the coat” reports after time alignment is fixed.**

The visible ordinary cheese ball has radius 0.15 ([ballTuning.ts](../src/shared/ballTuning.ts#L1), [CheeseProjectileModel.ts](../src/weapons/CheeseProjectileModel.ts#L3)). The authority uses a centerline ray for ordinary balls and only switches to a radius-aware sphere sweep for enlarged balls ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L812)). Therefore a visible ball can overlap the edge of a rat by up to 0.15 units while its centerline misses.

The rat's authoritative body is also three simple spheres—0.6 lower body, 0.45 chest, 0.28 head—while the visible coat, ears, hat, limbs, and tail extend outside them ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L395)). Some apparent edge hits are cosmetic silhouette rather than collider hits.

This mismatch is much smaller than the 1.8–2.61-unit temporal mismatch, so globally enlarging hitboxes first would conceal the main fault and change gameplay balance. After time alignment, ordinary shots should use a 0.15-radius sweep or a measured smaller forgiveness shell so the collision volume matches the graphic. A hitbox-overlay practice fixture should quantify coat/limb false expectations before adjusting the rat shapes.

## Finding 4 — power-ups can be tunneled through

**Priority: P0/P1. Confidence: certain. This directly explains walking through a power-up without an instant claim.**

Available power-ups test only the current reach point against a 1.5-unit radius ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L234), [pickups.ts](../src/shared/pickups.ts#L9)). They do not use the `pickupApproaches` path that the genuine case uses.

The deterministic reproduction moved a rat from two units before a Quick Fix to two units beyond it in 50 ms. Both endpoints were 2.154 units from the pickup because of the vertical reach offset, the path crossed the pickup center, and the pickup remained unclaimed. This is a normal geometric tunneling failure, not a WebSocket failure. A four-unit sample gap corresponds to roughly 222 ms at ordinary speed or 153 ms under Hot Pursuit; shorter crossings can fail depending on the approach angle and pickup elevation.

At a stable 20 Hz movement cadence, many crossings will have an endpoint inside 1.5 units and succeed. Frame stalls, dropped replaceable movement, source pauses, diagonal paths, and Hot Pursuit increase the chance that neither accepted endpoint lands inside the sphere.

## Finding 5 — the case sweep is useful but tied to simulation timing

**Priority: P1. Confidence: certain mechanism; live frequency unmeasured.**

The genuine case has a 2.25-unit pickup radius plus a between-position closest-approach test. It accepts only paths no longer than six units and no older than 150 ms, with wall checks ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L946)). This is why it feels much better than the original case.

However, `pickupApproaches` is refreshed at the end of every 60 Hz simulation step, even when no new player movement arrived ([ChaosSimulation.ts](../src/shared/ChaosSimulation.ts#L912)). It therefore represents “position at the previous sim step,” not “previous accepted movement sample.” Under ordinary ticks this happens to preserve the crossing for the next step. After a source-time gap greater than 150 ms, the first catch-up step rejects the stale approach and then overwrites it with the newest position; subsequent catch-up steps have no crossing left to test.

The reproduction catches the same six-unit crossing at 50 ms and misses it at 200 ms. A prior hosted pickup check observed compact snapshot gaps of 106 ms p95 and 535 ms maximum; another observed 302 ms maximum.[4] Snapshot delivery gaps are not proof of equivalent server simulation gaps, but they show that the end-to-end path can exceed the case's 150 ms memory. Current diagnostics do measure maximum source tick gap, yet no interaction trace links a missed case approach to that gap.

The path history should belong to accepted movement inputs, with a sequence and timestamp, rather than incidental simulation iterations.

## Finding 6 — pickup success has no dedicated low-latency result path

**Priority: P1. Confidence: high.**

The simulation emits `collected` and `healed` events. `GameRoom.applyPickupEvents()` broadcasts only healing; ordinary buff collection is discarded at that layer and reaches clients through the next chaos state ([GameRoom.ts](../src/worker/GameRoom.ts#L879)). The local player applies Ironclad and Hot Pursuit only when that authoritative chaos snapshot is received ([GameSession.ts](../src/session/GameSession.ts#L325)). Case ownership also arrives through state/lifecycle updates rather than a claimant-specific acknowledgement.

Nominal pickup feedback therefore includes:

| Stage | Nominal added delay before visible confirmation |
| --- | ---: |
| Wait for next movement send | 0–50 ms |
| Uplink and Worker event scheduling | network-dependent |
| Wait for authority step | 0–33 ms at the 30 Hz room timer |
| Snapshot serialization/delivery/downlink | network- and flow-dependent |
| Client apply/render | 0–1 frame |

The local player receives no same-frame anticipation, so all of that latency is felt. This is exactly the kind of action where prediction can improve feel without granting authority: hide/animate the prop locally, play a tentative grab cue, and show a reversible pending card; the server still decides whether the claim was legal and contested.

## Finding 7 — persistence may amplify some confirmation spikes, but it is not yet proven

**Priority: P2 investigation. Confidence: medium as a risk, low as an observed cause.**

The room checkpoints a changed case owner before sending the tick's chaos snapshot ([GameRoom.ts](../src/worker/GameRoom.ts#L1129)). Quick Fix forces a player write before broadcasting healing. Cloudflare Durable Objects use output gates: outgoing messages are held while storage writes from the event are pending, so clients cannot observe state that failed to persist.[8] This is the correct durability guarantee, but it can add storage settlement time to an interaction result.

The game records a maximum checkpoint settlement span, but its own comment correctly notes that this is runtime-exposed source time rather than an independent disk/wall measurement ([RoomDiagnostics.ts](../src/worker/RoomDiagnostics.ts#L55)). It is not correlated with individual pickup latency. Measure this before changing persistence. Do not weaken the case/reconnect durability contract on speculation.

## Finding 8 — current diagnostics prove health, not interaction correctness

**Priority: P0 prerequisite. Confidence: very high.**

Current client diagnostics capture parsing/apply cost, counts, socket backlog, reconnects, frame distributions, snapshot age, and projectile-presentation aggregates. Worker diagnostics capture traffic, delivery high-water marks, acknowledgement lag, tick gaps/cost, snapshot sizes, checkpoint settlement maxima, and aggregate shot acceptance reasons ([PerformanceStats.ts](../src/session/PerformanceStats.ts#L4), [RoomDiagnostics.ts](../src/worker/RoomDiagnostics.ts#L1)). This is good bounded operational telemetry.

It does not record:

- local input time → server acceptance → first simulation → terminal outcome → client application;
- the server tick actually displayed when a shot was aimed;
- current versus historical target pose at collision;
- predicted contact versus authoritative result;
- previous/current accepted movement segment for a pickup;
- pickup enter/intent/result timing and rejection reason;
- whether a case claim coincided with tick, delivery, or storage delay.

Without those links, another broad FPS/network capture can say that a pause happened but not why a specific shot or pickup felt wrong.

## Recommended target architecture

### Phase 0 — give every interaction a time identity

Ship this first, without changing outcomes.

1. Add a monotonically increasing `simTick` plus a room/lifecycle epoch to chaos and movement snapshots. A reconnect or reset must not let an old tick refer to a new life or room generation.
2. Expose the actual presented server time/tick from `SnapshotBuffer` and the shared chaos clock. When firing, send the displayed target-world tick, latest local movement sequence, and shot trigger sequence. Do not trust a client wall clock.
3. Piggyback the freshest local pose on a shot and process that pose before spawning the ball. Bound it by sequence monotonicity, elapsed time, legal movement envelope, launcher state, and correction rules. The existing 12-unit origin check remains a final sanity guard, not the primary synchronization method.
4. Use existing ping/pong or snapshot acknowledgements to maintain min/median/EWMA RTT and jitter. Today the client pings every 20 seconds and ignores pong for timing ([NetworkManager.ts](../src/network/NetworkManager.ts#L267), [GameSession.ts](../src/session/GameSession.ts#L321)). Prefer piggybacked clock samples over aggressive standalone ping traffic.
5. Add a bounded interaction trace ring—off by default or sampled—that records IDs/ticks/reasons, never resume tokens, names, raw frames, or console-retained objects. Export it through the existing F8 diagnostic bundle.

The key metrics are `inputToAccepted`, `acceptedToFirstStep`, `firstStepToTerminal`, `terminalToApplied`, `displayAgeAtShot`, `currentVsViewedTargetDelta`, `pickupEnterToIntent`, `intentToResult`, and correction/rejection reason counts.

### Phase 1 — make pickup geometry continuous and feedback immediate

1. Store the previous two or three **accepted movement samples** per player in the Worker, with sequence, server receipt tick, life epoch, and pose. Do not overwrite the meaningful segment on each unchanged simulation step.
2. Apply the same swept closest-approach test to all genuine power-ups and the genuine case. Validate line of sight, site generation/deadline, case speed, former-carrier delay, death, assignment state, and movement plausibility. Keep the segment length bounded. Replace the hard 150 ms age dependency with a history window derived from accepted movement cadence—initially 250–350 ms—while also enforcing maximum plausible distance for elapsed time.
3. Add a client `pickupIntent` generated when the local continuous player path intersects a visible, available pickup/case. Send it with the current movement sample in one packet. The intent is a prompt to evaluate, never proof of ownership.
4. Return a reliable `pickupResult` directly to the claimant: interaction ID, object ID, object generation, accepted/rejected reason, authoritative tick, owner, and effect deadline. Keep snapshots as recovery truth.
5. Add reversible same-frame anticipation:
   - Power-up: locally collapse/hide the prop, play the grab motion/cue, and present a pending card. Ironclad reflection, healing, and authoritative world ownership still wait for acceptance. Hot Pursuit may begin as explicitly tentative local motion if rollback is implemented and movement validation is tightened.
   - Case: use a short hand/grab anticipation and local highlight change; attach the objective and enable scoring only after acceptance. A contested rejection releases the anticipation cleanly.

This removes both kinds of badness: the server no longer misses a path crossing, and the player no longer waits an RTT before receiving any acknowledgement that the grab happened.

### Phase 2 — make every real shot end explicitly

Add a bounded, reliable `shotResult` keyed by real ball ID and trigger ID. Minimum terminal reasons should include rat body/head hit, Ironclad reflection, case/fake-case contact, world terminal, lifetime, capacity eviction, reset, and validation rejection. Include authority tick, contact point/normal, victim ID plus life epoch where relevant, and applied damage—not a full trajectory log.

The presentation contract becomes:

- local shot still starts immediately;
- local contact may stop the visual ball in a short pending-impact state but never awards damage or a hit marker;
- the result confirms one impact/hit marker or resumes/blends the ball on a miss;
- snapshot state remains a fallback after lost/rejoined delivery;
- duplicate/late results are idempotent by epoch and ball ID.

This makes reconciliation understandable and testable instead of inferring all removals from snapshot absence.

### Phase 3 — compensate physical projectiles against the world the shooter saw

Retain roughly 500 ms of simplified target history. For 16 rats, even 32 compact pose samples per rat is small. Store body pose, life epoch, alive state, Ironclad state, and any collision-relevant carried-case relationship. Static city geometry does not need history.

For each shot, derive a validated `viewTick` from the server tick the client actually displayed. Clamp it using available history, measured transport timing, monotonicity, and a rollout maximum—start around 200–250 ms even though presentation can reach 350 ms. The client cannot request an arbitrary old favorable world.

For the compensated portion of an ordinary ball's flight, evaluate each ball segment against target collider poses at:

`viewTick + authoritativeBallAge`

That is the historical world advancing at normal speed from the moment the shooter saw it. Test static walls/cases and target history consistently, preserve gravity and restitution, and stop compensation after a bounded early-flight window. Long ricochet chains, Delayed Reaction, Big Cheese, ownership changes, deaths/respawns, and insufficient history fall back to current authority under explicit rules.

This is preferable to classic hitscan rewind because it preserves projectile travel and lead. It is also preferable to trusting a client-reported hit. A lower-risk first prototype can run normal authority and the historical check side by side, logging disagreement without changing damage. Then enable compensation in a private hosted room and measure shooter false negatives against victim-side “hit after cover” complaints.

Suggested conflict rules:

- never rewind through a static wall;
- never damage a different life epoch;
- never undo a result already committed by authority;
- clamp compensation more tightly for unstable/high-loss clients;
- include held-case/ironclad state at the evaluated tick or fall back;
- make fallback reason visible in diagnostics, not gameplay UI.

### Phase 4 — align collision volume and tune buffers only after time coherence

Once historical adjudication is working:

1. Change ordinary ball collision from a centerline ray to a sphere sweep matching the visible 0.15 radius, or test a smaller measured shell if full radius is too generous.
2. Use the hitbox-practice overlay to decide whether coat/limb silhouettes need collider refinement. Do not make hats or tails damageable just because they are visible.
3. Keep a single presented server tick available to aim, remote bodies, carried cases, and shot prediction. Separate adaptive estimators may have different delay amounts, but an interaction must know which tick each collider represents.
4. Tune the 100 ms human and 250 ms bot floors only from hosted loss/jitter evidence. Snapshot interpolation inherently trades added visual delay for smoothness; reducing the buffer without adding time-aware adjudication merely makes motion choppier while leaving disagreements under real jitter.[7]

## Priority and expected payoff

| Rank | Change | Expected player payoff | Engineering risk |
| --- | --- | --- | --- |
| 1 | Tick/view identity + bounded interaction traces | Makes every later fix measurable; identifies actual live failure distribution | Low |
| 2 | Swept power-up/case inputs + direct result + local anticipation | Removes walk-throughs and makes grabs feel immediate | Low–medium |
| 3 | Explicit terminal shot results | Eliminates ambiguous disappearance/reappearance and enables agreement metrics | Medium |
| 4 | Shadow-mode historical projectile adjudication | Directly attacks clean visual hit/authority miss | Medium–high |
| 5 | Enable bounded physical-projectile compensation | Largest combat fairness/feel gain | High; needs human multi-client review |
| 6 | Match ordinary ball radius and refine hitboxes | Removes grazing visual mismatch | Medium gameplay-feel change |
| 7 | Buffer-floor tuning or transport experiments | Smaller smoothness/latency improvements after correctness | Medium; evidence-dependent |

## What not to do

- **Do not simply reduce interpolation delay.** The present buffer solved visible holds/jumps. Lower delay without historical collision moves the mismatch around and increases jitter.
- **Do not globally enlarge rat hitboxes as the first fix.** At 100 ms, temporal error can be 1.8–2.61 units; a reasonable geometry adjustment cannot cover it without making shots feel magnetized.
- **Do not trust client damage or arbitrary client timestamps.** Send displayed server ticks and interaction intents, then clamp/replay on authority.
- **Do not convert cheese balls to hitscan.** Their physical travel, gravity, ricochets, case interaction, and incidents are central to the game.
- **Do not remove durable case checkpoints to chase latency.** First correlate output-gate settlement with actual interaction traces.
- **Do not start with a WebSocket/WebTransport rewrite.** The current flow control is sophisticated and the proven defects occur above transport. Cloudflare's WebSocket guidance also recommends batching high-frequency updates, which the room already does.[9]

## Verification plan and definition of “crisp”

### Deterministic tests

- Moving perpendicular target at delays 0/50/100/150/250/350 ms; direct and head shots; normal and Hot Pursuit speed.
- `viewTick + ballAge` historical collision with gravity at 5/20/50 units.
- Wall-before-target, target-before-wall, doorway exit, death/respawn epoch, Ironclad activation/expiry, carried-case disarm, ricochet before/after compensation cutoff.
- 50/150/400 ms confirmation plus loss/reordering/reconnect, preserving one visible ball per real ID.
- Power-up/case path crossings at 20–350 ms and 0–6 units, diagonal/vertical approaches, wall occlusion, contests, full-health medkits, stale site generation, former carrier delay, server tick catch-up.
- Pending pickup acceptance/rejection rollback and duplicate results.

### Hosted synthetic checks

Use a frozen matching client and hosted Worker with normal eight-participant backfill, as required by the project. Inject controlled delay/jitter/loss only in the harness, not by altering production tuning. Run two real network clients so one supplies reproducible perpendicular movement while the other fires.

Report at least:

- visual-contact/authority agreement by displayed age bucket;
- p50/p95/p99 input→result and receipt→server-result;
- historical-compensation accept count and fallback reasons;
- victim behind-cover disagreement count;
- pickup path intersections, accepts, rejects, and rollbacks;
- tick gaps, ACK lag, snapshot gaps, storage settlement, frame p95, and correction distance;
- zero duplicate balls, duplicate claims, old-life hits, through-wall claims, or token/state leakage.

### Initial acceptance gates

- Same-frame local shot remains unchanged.
- Same-frame pickup anticipation on eligible local crossing.
- Server pickup resolution within one room tick after receipt at p95, excluding measured platform stalls.
- Zero misses for valid, unobstructed swept pickup segments inside the allowed history envelope.
- At least 99% visual-contact/authority agreement in controlled 0–200 ms direct-shot scenarios; every disagreement has an explicit fallback reason.
- No statistically meaningful rise in victim-side post-cover hits under the initial compensation cap.
- No regression in 16-rat cap, eight-participant production backfill, projectile cap, shot lifetime, reconnect/case preservation, assignment rules, or compact-delivery budgets.
- Human two-client playtest is the final acceptance for “crisp”; automated results cannot certify feel.

## Recommended execution order

The safest high-payoff implementation sequence is:

1. Protocol 15 instrumentation: epoch/tick identity, RTT/clock evidence, movement sequence, action trace export. No outcome changes.
2. Swept power-ups and movement-sample-based case history; `pickupIntent`/`pickupResult`; reversible local anticipation.
3. `shotResult` terminal ledger and coherent pending-impact reconciliation.
4. Historical projectile adjudication in shadow mode, using the exact displayed tick.
5. Private hosted two-client comparison, then enable a conservative compensation cap.
6. Only then test radius-aware ordinary ball sweeps and buffer-floor tuning.

This sequence should make pickups feel better before the riskiest combat change, while the instrumentation added first tells us whether the historical shot prototype improves the exact live symptom instead of merely moving it.

## Sources

1. Rat Detective current production handoff: [docs/current-state.md](current-state.md) and [production receipt](verification/pickup-reconnect-production-2026-09-11.md).
2. Rat Detective shared playback evidence: [physics-playback-2026-09-10.md](verification/physics-playback-2026-09-10.md).
3. Rat Detective responsive shooting evidence: [responsive-shooting-2026-09-10.md](verification/responsive-shooting-2026-09-10.md).
4. Rat Detective pickup/case evidence: [pickup-playtest-refinement-2026-09-11.md](verification/pickup-playtest-refinement-2026-09-11.md) and `output/pickup-refinement/final-hosted-check.json` / `output/pickup-refinement/restock-hosted-check.json`.
5. Prior internal research and accepted follow-ups: `brain:sessions/2026/09/rat-detective-optimization-research-assessment-2026-09-10`, `brain:sessions/2026/09/rat-detective-shared-physics-playback-2026-09-10`, `brain:sessions/2026/09/rat-detective-responsive-single-ball-shooting-2026-09-10`, and `brain:sessions/2026/09/rat-detective-pickup-reconnect-production`.
6. Valve Developer Community, [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) and [Latency Compensating Methods in Client/Server In-game Protocol Design and Optimization](https://developer.valvesoftware.com/w/index.php?title=Latency_Compensating_Methods_in_Client%2FServer_In-game_Protocol_Design_and_Optimization&uselang=en).
7. Glenn Fiedler, [Snapshot Compression](https://www.gafferongames.com/post/snapshot_compression/) (snapshot interpolation latency/smoothness trade-off).
8. Cloudflare, [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) and [Durable Objects glossary](https://developers.cloudflare.com/durable-objects/reference/glossary/) (single-threaded coordination and output gates).
9. Cloudflare, [Use WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (Durable Object WebSocket lifecycle and batching guidance).
