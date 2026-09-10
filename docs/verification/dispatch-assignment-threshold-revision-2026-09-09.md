> Historical September 9 threshold revision. The later [whole-landmark and cartoon UI revision](../dispatch-assignments.md) supersedes its Chain route, UI and protocol version. The measurements below belong to this earlier build.

# Dispatch Assignments — approved revision

Updated September 9, 2026 on `codex/dispatch-assignments`. This implements Tyler’s explicit assignment-update requirements and replaces conflicting initial proposals. The separately named `ASSIGNMENT-UPDATE-HANDOFF.md` was not present in the repository or the searched Downloads/Documents locations; the full requirements pasted into the task were the implementation authority. No deployment or Git commit was made for this revision. The [initial implementation and preview receipt](dispatch-assignments-initial-2026-09-09.md) are historical.

## Current rules

| Assignment | Winning action | Progress |
| --- | --- | --- |
| Closing Time | Be the living primary case holder at zero | 120 seconds of cumulative shared possession. Loose time, death, briefing and Evidence Tampering do not count. Theft preserves the remaining time |
| Excessive Force | First to ten attributed kills while legitimately holding the primary Hot Case | Each kill is exactly one case-kill point. Personal progress survives death, disarm and reacquisition; it is independent of total kills |
| Chain of Custody | Carry through Icebox verification, Records west verification, then Records south filing | Two shared stamps remain with the case through theft. Every step, including final filing, requires a living carrier |

The shuffled three-assignment bag remains, with no immediate repeat at a cycle boundary. One assignment completion ends the match. There is no normal kill-limit victory, elapsed-match finish or highest-kills fallback in version-2 assignment rooms. Total kills are actual kills, without the old 2× holder multiplier. The pre-existing legacy version-1 scoring path remains separate.

Excessive Force evaluates possession synchronously after the attributed kill is confirmed by GameRoom and before subsequent contact resolution. Fire then collect before the kill: one point. Fire while carrying, lose the case before the kill: zero points. The existing attribution rules still decide who owns projectile, ricochet and corpse-missile kills. Firing, hitting a case, passive movement, or delivering a loose case awards no objective point. Misfiled Evidence is removed from active selection and presentation; its old intake delivery cannot win. Departed identities are pruned from active personal progress; a reconnect follows the existing new-player identity contract.

Evidence Tampering retains all eight weaponized, uncollectible cases. All three objectives pause and retain progress. No incident action is queued for later credit. Seven extras disappear at expiry. Chain restores an overlapping primary case to the outside approach and requires a fresh crossing; cleanup cannot verify or file it. The same assignment resumes afterward.

## Entrances and presentation

| Step | Exact crossing zone | Case center / outward normal | Aperture |
| --- | --- | --- | --- |
| Verify 1 | Icebox south loading entrance | (130, 3.65, −30.4) / +Z | 12 × 7 |
| Verify 2 | Records west entrance | (−48.6, 3.65, −59) / −X | 8 × 7 |
| File | Records south intake | (−16, 3.65, −36.4) / +Z | 10 × 7 |

Existing front-to-back physical crossing checks remain: projected case extents must fit the real opening, and intervening solid scenery rejects the crossing. No added button, dwell, errand, minimap or map geometry.

The **Top Rats leaderboard and personal rank card are removed**, including their DOM, styling and rank animations. The assignment panel takes their place. Closing Time has a large clock, explicit running/paused state, a visual pulse and foley ticks in the final 20 seconds; ticks accelerate to twice per second in the final five. Pauses silence the escalation. Excessive Force shows personal case kills, the current case-kill leader, scoring eligibility, separate total kills/deaths, and a distinct qualifying-kill confirmation. Verification confirms prominently and immediately identifies the next step. Past confirmations do not replay on late join.

Active doorway corner brackets and a floor stripe use the same aperture as scoring and remain visible through obstruction. The off-screen cue names the exact active entrance for both carriers and interceptors. Underground, it points first toward an existing ramp foot, then up to its street mouth; it is a directional exit cue, not a new pathfinding system. The Hot Case’s existing through-wall outline remains. Lights, scenery, gunplay, movement, camera, ordinary ball tuning, incidents, projectile caps, damage protections, roster policy and bounded AI navigation are preserved. Chain carriers use the existing delivery navigation; the other carriers keep fighting.

## Persistence and release compatibility

Protocol version is **3**. Client and Worker must be released together in a future authorized deployment. Welcome, ordinary/compact snapshots, win and reset messages carry objective progress. A finish remains immutable and creates one reset deadline. A stale reset event cannot interrupt an active assignment or a newer result.

Storage-only compatibility converts the earlier 45-second Closing Time state by retaining the amount already processed, preserves Chain stamps, replaces a persisted retired Misfiled round with a fresh Excessive Force assignment, and translates the old shuffle entry. Network decoding rejects retired/invalid state and bounds personal progress. This code is local and has not migrated any hosted room.

Private selection remains restricted to the existing local/private paths. Values are `closing-time`, `chain-of-custody`, `excessive-force`, or `auto`; active rooms cannot be changed by a joining client. See [tooling](../tooling.md).

The earlier playable port-5182 preview still serves its immutable **protocol-2 initial implementation** with 45-second Closing Time and Misfiled Evidence. Its private Worker version remains `88a7b24d-792c-44d4-b24a-bbe19a34e38d`, with the original September 9, 11:01 PM Pacific expiry. It does **not** contain this revision. Production is unchanged.

## Validation receipt

- **Automated:** 599 tests passed: 107 Worker, 470 client, 22 script. `npm run typecheck`, `npm run build` and `npm run visual:build` passed. Both builds retain the existing Vite large-chunk warning.
- **Scoring/physics:** actual delayed projectile kills cover both possession orders; rules and authoritative damage tests verify exactly one point, retained personal progress, ten-point completion, no win at 20 total kills, and immutable resolution. Real city physics covers case theft/disarm, carried Chain crossings, loose filing rejection, incident boundaries, eight hazards, progress retention, restoration and cleanup. Real bot navigation completes the Chain route.
- **Controlled multiplayer:** local Durable Object tests use ordinary and compact WebSocket clients through two shuffle cycles, compare results/resets, verify one reset event, test persisted case kills/stamps with eviction and late joins, and reject a stale match reset. Kill resolution is driven through the authoritative server handler; this is not a human multiplayer playtest or a hosted load benchmark.
- **Camera review:** static fixtures use the actual city, rat, case, HUD and shoulder-camera code. Reviewed the prominent held clock; exact Icebox, Records west and Records south apertures; verification confirmation; off-screen interceptor and sewer cues; Excessive Force confirmation; and narrow-screen Tampering. No movement, firing or pointer-lock automation was used. Foley scheduling is tested automatically; audible timing in play is not human-validated.
- **Test caveats:** the first default-concurrency suite timed out once in the unchanged full-map sewer physics test. That test passed independently, and all 470 client tests passed with `--maxWorkers=2`. The new reset guard correctly rejected two old test fixtures that inserted reset events into playing rounds; those fixtures now model a finished round, and all 107 Worker tests pass.

Logs are in `output/assignment-update-2026-09-09/`. Human playtesting remains for contested 120-second pacing, ten-case-kill pacing, moving-camera readability, audio escalation and the feel of chaotic steals/ricochets/corpse attacks. No deployment, production multiplayer check or human gameplay test was performed for this revision.

## Camera preview

The temporary local camera preview runs at [port 5188](http://127.0.0.1:5188/assignment-fixture.html?assignment=excessive-force&view=icebox&held&confirm). It is a **static visual fixture**, with no gameplay input, networking or scoring loop. The transient `rat-detective-assignment-camera-preview.service` expires two hours after launch and is not enabled at boot.

To reproduce after expiry: build with `npm run visual:build`, then serve `dist-visual` on an unused local port. Parameters: `assignment`, `view=icebox|archive|offscreen|sewer`, `stamps=0|1|2`, `phase=briefing|suspended|closed`, `held`, `remaining` (milliseconds), and `confirm` (a fixed visual verification/kill confirmation).
