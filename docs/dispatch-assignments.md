# Dispatch Assignments — whole-landmark rules and noir UI

Updated September 9, 2026 on `codex/dispatch-assignments`. Tyler’s latest requests supersede the earlier doorway-based Chain proposal and uniform assignment HUD. No deployment or Git commit was made. The working tree contains earlier authorized game changes and must not be replaced by HEAD.

Historical receipts: [initial assignment implementation](verification/dispatch-assignments-initial-2026-09-09.md), [120-second/ten-kill threshold revision](verification/dispatch-assignment-threshold-revision-2026-09-09.md). The named `ASSIGNMENT-UPDATE-HANDOFF.md` was absent from the earlier repository/Downloads/Documents search; the explicit requirements pasted into the task and subsequent corrections govern this implementation.

## Current rules

| Assignment | Winning action | Progress |
| --- | --- | --- |
| Closing Time | Hold the legitimate primary case at zero | 120 seconds of cumulative shared living possession. Loose, briefing and Tampering time pause the clock; theft preserves it |
| Excessive Force | Reach ten attributed kills while holding the primary case when each kill resolves | Exactly one qualifying point per kill. Personal case kills persist through death, disarm and reacquisition, independently of total kills |
| Chain of Custody | Carry the case inside all six landmarks in the match’s shuffled order | Each entire interior is one stop. Five shared verifications, then a carried sixth visit closes the case. Theft retains the route and completed stops |

All six Chain landmarks are shuffled with Fisher–Yates **once at match creation**. There is no fixed first or last building. The selected order is persisted and replicated unchanged through theft, snapshots, late joining and eviction. A route contains every landmark exactly once; unknown, duplicate or incomplete routes fail protocol validation. Random shuffling does not promise that a whole permutation can never happen again.

| Landmark | Accepted player interior bounds: X / Z / Y | Existing navigation approach |
| --- | --- | --- |
| Icebox | 106..154 / −91..−31 / −0.5..24 | South loading entrance |
| Sewer Maintenance | 60..70 / −42..−30 / −7.5..−1 | Maintenance corridor |
| Pump Station | 100..150 / 99..137 / −0.5..24 | South entrance |
| Needleworks | −143..−67 / 56..108 / −0.5..24 | South entrance |
| West Sluice | −146..−128 / −32..32 / −0.5..24 | Walk strip beside the ramp |
| Records Bureau | −48..16 / −81..−37 / −0.5..24 | South entrance |

X/Z must be strictly inside; Y includes the lower bound and excludes the upper. This accepts alternate entrances and interior floors while excluding roofs, outside pavement, and the street directly above Maintenance. Approach coordinates guide the existing bots and recovery only; they do not constrain where entry scores. There are no interaction buttons, stationary waits, extra deliveries, north/south building subdivisions or new map geometry. Needleworks is the existing name of the user’s Needle landmark. West Sluice is separate from Pump Station, so including the omitted landmark makes six stops. Historical geography was checked against GBrain `brain:sessions/2026/09/rat-detective-distinct-interiors-playtest-pass-2026-09-07` and current shared layouts.

The shuffled three-assignment bag still has no immediate repeat across cycle boundaries. One completion ends the match. There is no normal kill-limit, elapsed-match victory or highest-kills fallback in version-2 assignment rooms. Total kills are actual kills; the old 2× carrier multiplier remains only in the separate legacy version-1 path.

Excessive Force judges possession synchronously at attributed kill resolution: fire then collect before the kill scores; fire while carrying then lose it before the kill does not. Existing projectile, ricochet and corpse-missile attribution remains. Misfiled Evidence is absent from active selection and UI, and loose delivery cannot win. Departed identities are pruned; reconnection retains the existing new-player identity contract.

Evidence Tampering retains eight weaponized, uncollectible cases, suspends all three objectives, and preserves their progress. Incident kills are not banked for afterward. Seven extras disappear at expiry. An original case overlapping any Chain landmark—including overlap by its physical extent with its center outside—is returned to the exterior approach before pickups resume. Cleanup therefore cannot provide a verification or victory to a waiting player. A fresh carried visit still works.

The subsequent [ricochet and lighting trial](verification/tampering-ricochets-lighting-2026-09-09.md) replaces the incident's extreme flight with sustained lateral rebounds and short hops, smooths case bounces, reduces case draw submissions and lowers its buzz. Assignment suspension/resumption is unchanged. The lighting trial is reversible with `lighting=classic`.

## Presentation

Latest follow-up: [dark cards, exterior-only silhouettes, Dispatch siren and Maintenance workshop](verification/noir-ui-silhouette-siren-2026-09-09.md). The rules and shuffled routes above are unchanged.

- **Excessive Force:** top five ranked by case kills out of ten, including zero-point players; personal progress and rank if outside the five; total kills/deaths kept separate. Eligibility reads “KILLS COUNT” or “GET THE CASE TO SCORE.” New qualifying kills get a distinct confirmation.
- **Closing Time:** its own large, torn-paper clock, holder/running or loose/paused status, and “HOLD IT AT ZERO!” instruction. Final 20 seconds pulse and tick; final five tick twice per second. Pauses silence the escalation.
- **Chain:** its own destination placard, whole-building name, current stop out of six, six stamp boxes, and a large instruction to take the case inside the yellow building. A completed visit immediately stamps progress and names the next landmark. The last instruction explicitly says entry wins.
- **Destination visibility:** the active landmark gets one yellow outer silhouette with a soft halo, rendered through obstruction. A union mask removes internal edges; there are no visible mask faces or wireframe boxes. Only the current landmark is outlined. It remains subdued during suspension. The directional label names the destination for carriers and interceptors; off-screen arrows and both up/down sewer transition cues use existing pipe ramps. The case’s red through-wall outline stays intact. No minimap.
- **Noir/cartoon contrast:** dark paper cards and restrained title arrival, with crooked lettering, oversized winner headline/name, subdued victory rays, giant “RAT DOWN!” death lettering and popping countdown. The two title slogans “YOUR EXTREMELY REAL BADGE” and “CHEESE! CRIME! CHAOS!” are removed. They retain the three-second server respawn deadline and six-second winner reset. Reduced-motion preferences suppress decorative animation.

Tyler rejected light cards and the overly cartoonish title. The current palette uses **deep logo-purple (#1a0c21), nearly black textured paper, muted lettering and small ochre accents**. Ready Dispatch machines now have a small rotating red roof siren and a short nearby sound every seven seconds; busy machines stop both. Sewer Maintenance has a compact wall bench/tool board, supply cabinet and breaker panel. Its two furniture solids share client/server geometry; the center and west entrance stay clear. Map lighting is unchanged. Gameplay controls, shoulder camera, guns, case grip/physics, ball tuning, incidents, caps, damage protections and bounded navigation remain intact.

## Persistence and preview boundaries

Requested full-game preview: [play the latest build](http://127.0.0.1:5183/?room=graybox-benchmark-match-noir-v11&diagnostics=quiet). On September 9 at 9:41 PM Pacific, the dedicated private capacity Worker was refreshed to `ac070400-9c4d-41f8-94ac-ae9dba8cc4d2`, protocol **4**, matching immutable client `index-B8KzGliD.js`. The relay expires September 10 at **1:41 AM Pacific**. Automatic rooms backfill to eight total rats. Public production is unchanged. The older port-5182/protocol-2 preview is superseded and incompatible with this refreshed backend. A separate passive private-pool check received eight players and 170 valid snapshots with active Chain of Custody, zero invalid packets; it did not exercise gameplay input. Deployment receipt: `output/hosted-capacity-deployment-2026-09-10T04-41-08-665Z/deployment.json`; check receipt: `output/noir-ui-2026-09-09/full-preview-check.json`. Local service: `rat-detective-noir-full-preview.service`.

Protocol is **4**. A future authorized release must ship matching client and Worker. Strict decoding accepts any valid six-landmark permutation. Storage-only restoration replaces an obsolete doorway Chain round with a fresh shuffled Chain assignment and removes stale reset events; compatible current routes restore without rerolling. Older 45-second Closing Time and retired Misfiled storage migrations remain. No hosted room was migrated.

Historical preview: port 5182 served the initial protocol-2 implementation (`88a7b24d-792c-44d4-b24a-bbe19a34e38d`). The requested protocol-4 full-game preview above supersedes it.

The updated [local camera preview](http://127.0.0.1:5188/assignment-fixture.html?assignment=chain-of-custody&view=city) serves `dist-visual` via the temporary `rat-detective-assignment-camera-preview.service`. Its two-hour lifetime began around 8:12 PM Pacific. It is a **static presentation fixture**, with no gameplay input, scoring loop or network. Bottom links expose each HUD and the title/win/death screens. Rebuild with `npm run visual:build`; after expiry, serve `dist-visual` on an unused local port. See [tooling](tooling.md).

Fixture options: `assignment=closing-time|chain-of-custody|excessive-force`; `view=city|icebox|archive|offscreen|sewer|maintenance|dispatch`; `stamps=0..5`; `phase=title|briefing|suspended|closed|death`; `held`; `remaining` in milliseconds; `confirm`. Its route is intentionally fixed for reproducible images; live matches shuffle it. Death presentation replays every 4.5 seconds, separately from real match timing. The Dispatch view has an opt-in LISTEN button for the actual ready sound; `dispatch=busy` shows the stopped beacon.

## Latest validation

**623 automated tests passed** (107 Worker, 494 client, 22 script), plus typecheck and application/visual builds. Static camera review covered the dark UI, exterior silhouettes, Maintenance furnishings and ready/busy beacon. See the [September 9 noir/workshop receipt](verification/noir-ui-silhouette-siren-2026-09-09.md) for new checks and limits. No human playtest, human audio review or hosted multiplayer check was performed for this pass.

## Prior whole-landmark validation receipt

- **Automated:** 613 tests passed: 107 Worker, 484 client, 22 script. Client suite ran with `--maxWorkers=2`. Typecheck, application build and visual build passed; Vite retains its existing large-chunk warning.
- **Rules/physics:** both possession-at-projectile-kill orders; exactly one objective point; death/disarm/reacquisition; no win at 20 total kills; immutable winner; held-time/incident boundaries; all six full volumes including alternate interior positions and floors; wrong-layer rejection; theft of the final stop; loose-case rejection; physical-extent overlap at each of the six landmarks during Tampering cleanup, followed by successful fresh carried entry. One old HUD assertion expected the retired plain winner string and was updated for structured, safely rendered winner text.
- **Route checks:** 100 deterministic shuffles verify unique complete permutations, varied orders and final stops, strict decode and restoration. Six bounded server-bot simulations enter the individual landmarks from their exterior approaches through real city physics/navigation. These are not a full contested six-stop traversal playtest.
- **Controlled multiplayer:** local Durable Object tests use ordinary and compact WebSocket clients through two assignment cycles, compare authoritative wins/resets and shuffled routes, verify one reset event, test case kills/stamps/order after eviction and late join, and reject obsolete reset deadlines. Test handlers drive positions and attributed damage. This is neither hosted multiplayer validation nor human playtesting.
- **Camera review:** actual city, rat, case and unchanged shoulder-camera code under fixed presentation states. Reviewed the distinct HUDs, full Icebox outline through intervening buildings, Maintenance in the sewer, off-screen/transition cues, title, winner and death states, and narrow layouts. The narrow sewer label was moved below the larger card after a visible overlap was found. Final colors were reviewed after the user requested a quieter palette. No movement, shooting or pointer-lock automation was performed.

Logs are under `output/assignment-cartoon-2026-09-09/`. Human playtesting remains for full-route pacing, contested steals, moving-camera clarity, audio timing and the feel of the revised presentation. No deployment, production multiplayer check or human gameplay test was performed.
