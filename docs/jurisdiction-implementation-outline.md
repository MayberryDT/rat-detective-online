# Jurisdiction implementation outline

Design agreed with Tyler on 13 September 2026. This is the dated implementation plan. Implementation and verification are now recorded in the [private implementation receipt](verification/jurisdiction-2026-09-13.md); use that receipt for completed work and remaining limits.

## Outcome and scope

Add Jurisdiction as the fourth Dispatch Assignment. A living rat earns personal points by carrying the genuine Hot Case inside the active zone. The zone moves around the city. Enemies must disarm or kill the carrier to stop scoring; entering the zone alone does not contest it.

Use this briefing:

> JURISDICTION
>
> BRING THE CASE INTO THE ZONE. HOLD IT THERE TO SCORE.
>
> FIRST TO 60 WINS.

The agreed first release has 6 locations: Records Forecourt, Icebox Loading Yard, Central Crossroads, Needleworks Factory Floor, Pump Station Ground Floor and Sewer Junction. The 3 outdoor locations alternate with the 3 enclosed locations where possible.

This document completes the requested planning work. It does not authorize a production deployment, service restart or Git commit. When implementation proceeds, preserve the existing dirty tree and follow [AGENTS.md](../AGENTS.md), [current state](current-state.md) and the relevant preview procedure in [tooling](tooling.md).

The following decisions are agreed:

- one active zone and one genuine scoring case
- one point per second, first to 60 accumulated personal points
- a zone move every 45 seconds and a 10-second advance warning
- enemies inside the zone do not pause scoring
- death, theft and leaving preserve earned points
- the case stays in its physical location when the zone moves
- existing incidents, pickups, combat and free-for-all participation remain
- zones cover a specific fighting area and floor, not a whole building

Exact boundaries and the edge-case defaults below are implementation proposals. Keep them explicit in the implementation receipt. Treat the 60-point target and 45/10-second timing as the initial tuning; human feedback can revise them.

## Zone placement and shared geometry

Create a shared zone catalogue, provisionally `src/shared/jurisdictionZones.ts`. Use stable IDs, labels, an outdoor/enclosed category, floor identity, scoring geometry, guidance anchors, entry approaches and a small set of defensive positions. The server, renderer, bots and geometry tests must consume the same definitions.

Coordinates below are candidate centres or search areas in world X/Z. They identify where to author a zone; they are not collision-certified final bounds. Surface height is approximately Y=0; the sewer floor is Y=-7.

| ID | Location and candidate centre | Boundary and approach requirements |
| --- | --- | --- |
| `records-forecourt` | Records main entrance, around (-16, -27) | Use the reserved forecourt south of the building. Start around 24 by 12 units. Keep the boundary outside the entrance pillars and walls. Preserve avenue approaches and access through Records. |
| `icebox-yard` | Icebox loading forecourt, around (124, -19) | Start around 22 by 14 units, west of the parked curb truck. Use the truck as edge cover without enclosing a fully sheltered scoring pocket. Keep the loading entrance and street approaches open. The sewer mouth is an approach route, not part of this zone. |
| `central-crossroads` | Main avenue crossing west of Icebox, around (70, -18) | Fit a compact cross-shaped footprint to the two 14-unit streets. Keep all 4 approaches open. Do not apply a 28-unit square over adjacent buildings. |
| `needleworks-floor` | Central ground-floor work area, around (-105, 82) | Explore an area around 26 by 22 units, shaped around actual workbenches and partitions. All 3 external doors must connect to it by supported routes. Exclude stairs and adjoining enclosed rooms. |
| `pump-floor` | Ground-floor pump area, around (125, 120) | Shape a connected area around the pump machinery. Exclude the glazed control booth, stairs and upper catwalk. Verify routes from the north, south and east doors rather than assuming a rectangular footprint is open. |
| `sewer-junction` | Central junction at (0, 0), floor Y=-7 | Follow the existing 12-unit central chamber and short sections of the west, east and south tunnels. This is a T-shaped junction: there is no northern arm. Start with about 8 to 10 units of tunnel beyond each chamber opening, then check combat space and visibility. |

The outdoor reservations are in [cityPlan.ts](../src/shared/cityPlan.ts). Interior walls, floors and furnishings are in [landmarkLayout.ts](../src/shared/landmarkLayout.ts). Sewer topology is in [sewerLayout.ts](../src/shared/sewerLayout.ts). Cover vehicles have shared collision definitions in [vehicleLayout.ts](../src/shared/vehicleLayout.ts).

Represent footprints with a small union of rectangles or simple polygons, plus explicit exclusions where needed. Render the outer boundary of the union without internal seams. A sewer arm must stop at a wall; a rectangular bounding box around the T must not become the scoring footprint.

Use the carrier's authoritative feet position for membership. Define horizontal edge inclusion consistently and test exact boundary values. Do not count a gun, tail or carried-case mesh protruding across the line. Reject non-finite positions.

Define a vertical band per surface. Allow ordinary jumps within the footprint, but exclude the next floor, rooftops, overhead streets and high launcher flight. Derive the bands from actual feet coordinates, ordinary jump height and floor spacing. Do not copy Chain's whole-building Y range. Small negative grounded feet must still count at street level; they must not identify the rat as underground.

Placement is complete when each zone has:

- supported, connected usable space for a moving carrier
- multiple independently usable approaches, with 3 for the sewer junction
- no scoring pocket inside a solid, separate room or wrong floor
- legible boundaries from the shoulder camera and relevant upper approaches
- bot entry, defensive and exit anchors with physical clearance
- enough separation from pickup claim reach to require leaving the zone to claim a supply

Keep existing map geometry and pickup positions. Prefer reshaping a boundary to moving a building, machine, vehicle or pickup. Sewer Maintenance and rooftop zones are outside this first release. An approach defect that requires a map change should be reported with evidence before broadening this feature.

## Scoring and case behaviour

Store personal progress as authoritative milliseconds. Display whole points and a smooth progress gauge. A player wins at 60,000 eligible milliseconds, not at a rounded client display value.

An interval earns progress only while the round and assignment are active, the genuine primary case has a living owner, the case is collectible and not returning, and that owner is inside the active zone. Do not add a capture delay, stationary requirement, capture meter or entry button.

| Event | Required outcome |
| --- | --- |
| Carrier enters the active zone | Scoring begins from the authoritative eligible interval |
| Another living rat enters | Carrier keeps scoring; no contested state |
| Carrier is disarmed or killed | Scoring stops at the resolved ownership or death boundary |
| Case lies inside the zone | Nobody scores |
| Another rat collects it inside | The new owner's personal score advances; the former score remains |
| Carrier leaves or moves onto another floor | Scoring stops; banked progress remains |
| Zone moves | Old zone stops scoring; only the new zone is eligible |
| Carrier is already in the next zone when it activates | Scoring starts there without requiring an artificial exit and re-entry |
| Case is lost, recovered or returned by existing safety logic | Preserve ordinary case recovery; no recovery-time score |
| Score reaches the target | Commit one immutable result and the existing end-of-round reset |

There is no bonus for killing inside the zone and no highest-kills fallback. Total kills, deaths and total possession remain separate statistics. Jurisdiction progress is neither total case time nor Closing Time's shared clock.

Preserve genuine-case pickup reach, run-by collection, disarm protection, enemy disarms, own-shot case exclusion, carry pose and prediction cleanup. Zone movement never teleports, drops or respawns the case. The existing round reset can still reset it normally.

Recommended reconnect default: the retained rat stays part of ongoing play during its existing 30-second reservation. It keeps its score and can continue earning while alive, carrying and inside, just as it remains vulnerable to attack. Reconnecting must neither duplicate nor erase progress. Reservation expiry removes the participant and its active score entry through the existing departure path. A committed winner result remains immutable. Empty-room sleep earns no progress.

## Timing and rotation

Keep the existing assignment briefing. Start the first zone's full 45-second active duration when the briefing ends. Movement, loose-case time and ordinary incidents do not stop zone rotation.

Shuffle the 3 outdoor IDs and 3 enclosed IDs separately. Randomize the starting category and interleave the lists. Each 6-zone bag contains every location once. At the next bag, continue the category alternation and preserve no immediate repeats. Do not silently omit the sewer when selection becomes inconvenient.

Select and persist the next destination before its 10-second warning. If the warning crosses a bag boundary, prepare the next bag in advance. A reload, late join or room restoration must not reroll an announced destination.

Use active simulated elapsed time for scoring and zone duration. The client receives the authoritative remaining duration with a server time sample for display. Wall-clock gaps while a room is asleep or execution is stalled must not generate score or silently skip multiple zones. Document how the implementation rebases display timestamps on restoration.

Split processed intervals at briefing completion, zone relocation and classic suspension boundaries. A long processed interval must not credit its full duration to the final zone or final owner. Use bounded work based on the existing simulation step and catch-up limits.

Preserve deterministic simulation ordering for damage and ownership. Define exactly which state earns each processed interval. Credit no time before a pickup or after a resolved loss. Human pose updates are sampled authority inputs; do not claim continuous sub-packet occupancy precision. Do not add a broad static-city ray or rewind accepted movement to implement scoring.

If reaching 60 points coincides with relocation, reaching the target at the end of the eligible old-zone interval wins first. A death or disarm already resolved before that interval cannot earn it. Record tests for this ordering so refactors cannot change it accidentally.

## Incidents and pickups

The genuine case now participates in the mode, so the existing default incident roster can remain. Improper Disposal affects dead rats and their cheese bursts; it does not need a new case-specific variant.

| System | Jurisdiction behaviour |
| --- | --- |
| Planted Evidence | Keep all 10 counterfeits as hazards. They never score. The genuine case and zone scoring remain active. Preserve lethal contact, reflection behaviour, existing placement and burst caps. |
| Improper Disposal and other default incidents | Keep normal damage, disarms, projectile behaviour and zone rotation. Do not globally pause Jurisdiction during roulette, reveal or cooldown. |
| Classic Evidence Tampering | Keep the private classic-only weaponized cases. Suspend scoring and freeze the zone duration. Preserve personal progress and the announced destination. Resume with the remaining duration once the primary case is legitimately collectible again. Cleanup itself cannot score. |
| Ironclad Alibi | Carrier can score while protected. The carried case remains shootable; counterfeit contact remains lethal. |
| Hot Pursuit | Preserve the current speed boost and movement allowance. Faster entry or departure changes eligible time normally. |
| Quick Fix | Preserve full-health eligibility, instant normal healing and 45-second site deadline. Do not put its claim volume inside a scoring zone. |

Classic restoration does not require relocating a loose case outside the hill: a loose case awards nothing. A fresh legitimate pickup supplies the required ownership transition. Preserve Chain's separate fresh-entry cleanup behaviour.

Do not increase the 256-ball cap, add local damage authority or alter ordinary cheese lifetime, speed, gravity or bounce to accommodate enclosed fights.

## Authority, state and compatibility

Extend the existing assignment system instead of creating a second match controller. Use the stable mode ID `jurisdiction` and a distinct result method such as `zone-held`.

Add mode-specific state, preferably under a discriminated Jurisdiction field. At minimum it must represent:

- bounded personal held milliseconds keyed by player ID
- current bag, bag position and any prepared next bag
- a monotonically increasing zone serial within the round
- remaining zone duration and the sample needed for display
- the current scoring owner, or an equivalent authoritative eligibility status
- the existing round ID, phase, revision and immutable result

Derive current and next zone IDs from the schedule where practical. If both are serialized for convenience, validate consistency. Keep the static geometry in the matching shared client and Worker build; do not transmit arbitrary polygons every tick.

Update strict assignment parsing, stored-state restoration, welcome and round messages, ordinary snapshots, compact snapshot deltas, game-won messages and reset handling. Validate known IDs, complete unique bags, category order, indices, finite bounded durations, safe score-map keys, participant limits and result consistency. Use the existing safe handling for arbitrary player identifiers.

Do not allow Jurisdiction fields to appear in another mode or another mode's progress to become Jurisdiction points. Preserve valid in-progress legacy assignments when loading old storage. An existing 3-mode playlist bag can finish before the next refill introduces Jurisdiction; it must not reset the current match.

The current source uses protocol 15. This additive strict schema needs a coordinated client and Worker protocol update. Select the next available version at implementation time rather than assuming 16 remains unused. Update all private selection paths through the existing trusted controls; public query parameters must not force an assignment or zone.

Persist the physical case, objective state, rotation and result together through the existing room checkpoint transaction. The source currently limits a restored assignment playlist bag to 3 entries; replace that assumption with the assignment catalogue length.

Treat these update frequencies separately:

- score accumulation follows the fixed simulation step
- state delivery follows the existing bounded snapshot cadence
- ordinary checkpoints retain the current periodic cadence
- ownership, phase, relocation and result transitions trigger appropriate durable updates

`GameRoom` currently includes assignment revision in its checkpoint signature. Do not increment a revision used for forced checkpoints on every scoring millisecond or frame. Continuous progress must still reach compact clients without forcing a storage transaction per tick. Keep a separate transition serial or revise the checkpoint signature deliberately. The existing approximately 1-second periodic checkpoint can carry continuous progress; do not claim zero loss after an abrupt crash between checkpoints.

On reset, departure, epoch change and disposal, clear mode-specific transient caches, prediction, indicators and bot goals. Client anticipation may animate the gauge, but it cannot award points, announce a winner or continue scoring indefinitely without fresh authority.

## Bots and spawning

Extend `ObjectiveBotBrain` and the hosted bot integration. Keep the shared navigation planner, supported local steps, failure suppression, imperfect perception and aim, launcher confirmation, descent routes and existing supply priorities.

| Situation | Bot behaviour |
| --- | --- |
| Genuine case is loose | Seek the real case using existing pickup and danger rules |
| Bot carries outside the zone | Route to a reachable zone entry, then a valid defensive position |
| Bot carries inside | Fight and move among a small set of supported in-zone positions; do not deliberately evade outside the zone as a Closing Time carrier would |
| Enemy carries | Pursue the advertised carrier, approach through different entrances or intercept a reachable approach |
| Case is inside the zone | Resolve the case objective normally; do not queue harmlessly at the zone centre |
| Next zone is announced | Allow a bounded subset of non-carriers to intercept the next approach. Carrier may leave early when estimated travel time justifies it. Do not send the entire lobby away from the current carrier. |
| Classic suspension | Stop mode-specific scoring behaviour and preserve existing incident survival behaviour |

Choose among a few shared entry and defensive anchors. Do not request a unique flow field for every rat on every decision. A reached defensive position is successful navigation; local strafing or holding must not trigger a stalled-route rescue.

Add zone serial to objective invalidation. Do not use continuously changing scores or countdown values as route keys. Preserve working routes while a replacement plan is pending. Clear failed-goal records at meaningful ownership, zone or round transitions.

Immediate visible, usable, current-floor pickups within 24 units keep their existing priority. Longer Ironclad trips remain throttled and yield to carriers and nearby loose cases. Do not add omniscient tracking of hidden enemies or counterfeit objectives.

Use a shared Jurisdiction-aware spawn filter for joins, human respawns, bot backfill, bot rescue and round reset where applicable. Exclude the active footprint plus a modest configurable margin from supported spawn candidates. Keep normal enemy-distance selection among the remaining candidates. Maintain a bounded, prevalidated outside-zone fallback so filtering cannot prevent continued participation. Reconnect restores the existing rat in place; it is not a spawn.

## Presentation and guidance

Add a lightweight zone renderer, provisionally `src/prototype/JurisdictionZones.ts`. Draw a steady, depth-tested boundary and restrained floor treatment using the shared footprint. Avoid full-screen washes, tall opaque walls, extra live lights or through-wall building silhouettes. Keep the visual boundary aligned with scoring exclusions and floor height.

Only the active zone receives the full treatment. During the final 10 seconds, show a clearly secondary next-location marker and label. A transition changes the boundary once; late joins must not replay old activation announcements.

Keep the top-left assignment score card visible during briefing, roulette, incident reveal and cooldown on desktop and touch. Show personal points out of 60, the leader or top 5, current location and floor, time until relocation, and the announced next location when available.

Use short status text:

- `SCORING` when the local carrier is eligible
- `TAKE THE CASE TO THE ZONE` when carrying outside
- `GET THE CASE` when it is loose or elsewhere
- `DISARM THE CARRIER` when another rat is scoring
- `PROGRESS PAUSED` during classic suspension

Do not show `CONTESTED`: enemy presence does not pause this mode. Keep actual kill confirmations and possession indicators separate from objective progress. Update the held-Tab scoreboard to rank Jurisdiction by authoritative held time, and add the proper victory copy. Kills must not become a score tie-break that awards a different winner.

Give all players the active zone name, distance, off-screen arrow and `STREET`, `GROUND FLOOR` or `SEWER` label. Preserve the existing case marker. When carrying, zone guidance has priority; when seeking the case, keep the case readable alongside the destination.

Generalize guidance beyond Chain's destination IDs. Avoid the existing simple `y < 0` test for new surface classification. Guide street players to supported sewer mouths and sewer players to the correct branch; do not point them into the ground or through a ceiling. Use shared approach metadata and a bounded route-distance estimate where available. Label a straight-line distance honestly if a route distance is not available.

Use at most one short warning at 10 seconds and one relocation cue, deduplicated by round and zone serial. Reuse bounded UI audio and the accepted mix. Avoid a sound or announcement on every earned point. Respect reduced motion and keep the aiming area, touch controls, pickup cards and credits clear.

## Implementation file map

The new filenames are proposals. Existing paths were checked on 13 September 2026.

| Responsibility | Files |
| --- | --- |
| Zone data and membership | New `src/shared/jurisdictionZones.ts`; geometry references in `cityPlan.ts`, `landmarkLayout.ts`, `sewerLayout.ts`, `vehicleLayout.ts` and `pickups.ts` |
| Rules, schedule, state and parsing | `src/shared/assignments.ts`, `src/shared/AssignmentRules.ts` |
| Physical eligibility and incident boundaries | `src/shared/ChaosSimulation.ts` |
| Protocol and compact delivery | `src/shared/networkProtocol.ts`, `src/shared/chaosWire.ts`, `src/worker/validation.ts`; follow existing client decoder call sites |
| Checkpoints, playlist, wins and reconnect | `src/worker/GameRoom.ts` |
| Spawn selection | `src/worker/gameState.ts` and all `GameRoom.ts` spawn call sites |
| Bot objectives and hosted execution | `src/shared/ObjectiveBotBrain.ts`, `src/shared/BotNavigation.ts`, `src/worker/ServerBotController.ts` |
| Zone rendering and navigation cues | New `src/prototype/JurisdictionZones.ts`, `src/prototype/assignmentGuidance.ts`, `src/prototype/ChaosView.ts`; reuse appropriate destination-view integration |
| HUD, results and scoreboard | `src/prototype/DispatchHud.ts`, `src/prototype/dispatchHud.css`, `src/ui/MatchScoreboard.ts`, `src/ui/GameHud.ts`, `src/ui/touchControls.css` |
| Session transitions and cleanup | `src/session/GameSession.ts` and the existing view lifecycle |
| Evidence and current documentation | This outline, `docs/dispatch-assignments.md`, `docs/current-state.md`, `docs/README.md`, a dated verification receipt |

Search for assumptions that there are exactly 3 modes, ternaries that default to Closing Time or Excessive Force, and assignment IDs used in private fixtures. Do not implement a broad unrelated assignment refactor merely to add the fourth mode.

## Build sequence and acceptance

1. Record the starting tree and re-read the current release constraints. Author the 6 shared footprints and approach anchors. Check production seed 341283204 and the existing default city fixture. Produce a static placement receipt with final coordinates, floor bands, exclusions and route evidence.
2. Implement pure scoring, zone rotation and parsing tests first, then connect them to the authoritative simulation. Add exact ownership, relocation and suspension boundaries without changing the movement acceptance path.
3. Extend storage, protocol, ordinary and compact delivery, reconnect, playlist restoration and one-winner reset handling. Prove that continuous scoring does not force per-tick checkpoints.
4. Implement the hosted bots' entry, defence, interception and zone-change behaviour. Add spawn filtering and bounded fallbacks. Run physical route checks through all 6 locations, including sewer entry and return.
5. Implement boundaries, HUD, floor-aware guidance, scoreboard, results and cleanup. Review static shoulder-camera views at desktop and compact touch sizes. Browser gameplay and input testing remain Tyler's human playtest responsibility.
6. Run focused affected tests, then `npm run typecheck`, `npm test` and `npm run build`. Run `npm run visual:build` when adding or changing visual fixtures. Investigate relevant failures; do not replace visual baselines without reviewing the changed result.
7. When implementation and preview work are authorized, prepare a frozen matching client and hosted Cloudflare Worker. Use normal matchmaking with 8 participants when alone and the 16-rat cap. A separate full-lobby fixture can test congestion. Verify served client identity and protocol parity before handing Tyler an audible preview.
8. Collect human feedback, make scoped tuning corrections and record what was actually checked. Public release remains a separate action under the user's release authorization. Coordinate client and Worker versions, keep `public-live-v2` and its namespace, and prepare a rollback that can safely handle saved Jurisdiction state.

The automated acceptance matrix must include:

| Area | Evidence required |
| --- | --- |
| Scoring | Solo holder, enemy presence, loose case, counterfeits, death, disarm, theft, return, fractional accumulation and target clamp |
| Space | Every footprint edge, exclusions, doorway crossings, disconnected rooms, ordinary jumps, upper floors, rooftops and street above sewer |
| Timing | Briefing, 10-second warning, 45-second relocation, both sides of a bag boundary, large bounded tick, no sleeping-time credit and score-at-relocation ordering |
| Incidents | Planted Evidence stays live; classic pause freezes duration and progress; cleanup alone scores nothing; Ironclad case disarm remains possible |
| Persistence | Mid-score and warning restoration, late join, same-ID reconnect, expiry cleanup, ongoing death during outage, one immutable result and no duplicate reset |
| Protocol | Ordinary and compact round trips, strict invalid-state rejection, old stored modes, playlist growth and mixed-version rejection |
| Bots | All zone entries and exits, carrier remaining in-zone, varied attack approaches, loose-case recovery, no fake-case pursuit and no score-driven replanning storm |
| Spawns | Human and bot paths stay outside the active zone; reconnect stays in place; bounded fallback remains available |
| UI | All statuses and floors, true personal score, actual winner, no replayed cues on join, persistent card during roulette and compact layouts |
| Performance | Bounded payloads, checkpoint cadence, planner work and render resources during scoring and indoor incidents; reset releases resources |
| Existing game | Other 3 assignments, movement batching, pickup deadlines, reconnect, local shots, enemy disarms and existing launcher routes remain correct |

Extend the relevant existing suites: `test/client/assignments.test.ts`, `assignmentPhysics.test.ts`, `assignmentBots.test.ts`, `assignmentGuidance.test.ts`, `dispatchHud.test.ts`, plus `test/worker/assignments.test.ts`, `gameRoom.test.ts` and `chaosWire.test.ts`. Add dedicated zone geometry coverage. Confirm current scoreboard and session coverage before creating duplicate tests.

Human playtesting should establish whether carriers can earn short stretches of progress, whether both interior zones can be attacked from multiple routes, and whether sewer deaths remain funny rather than preventing participation. Check travel time with and without Hot Pursuit, boundary clarity while jumping, and the value of staying versus rotating early. Measure these separately from synthetic route success or hosted packet validity. No real-phone performance claim follows from a compact screenshot.

Keep agent browser inspections muted. Human preview links stay audible. Do not run automated pointer-lock or gameplay input checks unless Tyler requests them.

## Remaining uncertainty and completion record

The principal uncertainties are final physical boundaries, sewer congestion, travel time between floors and the pace of a 60-point race. Resolve geometry through focused checks and combat feel through the human preview. No further design decision is needed to start the proposed implementation defaults.

The final receipt should record final zone geometry, any tuning changes, protocol and preview versions, test results, storage and navigation observations, screenshots actually reviewed, and human feedback. Distinguish implemented, tested, accepted and deployed status. Update current docs only when behaviour changes; retain this outline as the dated design baseline.

Current sources take precedence over old receipts. In particular, [Dispatch Assignments](dispatch-assignments.md) still contains dated protocol and reconnect statements. Use [current state](current-state.md) and the [reconnect receipt](verification/reconnect-case-protection-2026-09-11.md) for the later contract.

Relevant GBrain history, read for this outline:

- `brain:sessions/2026/09/rat-detective-bot-navigation-regression` explains why per-bot replanning and unnecessary rescue must stay bounded; its old population and tuning figures are historical
- `brain:sessions/2026/09/rat-detective-reconnect-case-protection` records the retained vulnerable rat, private credentials and same-ID recovery; its pre-release deployment status is historical

