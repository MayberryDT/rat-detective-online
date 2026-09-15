# Wall cases and directional obstacle jumps — September 14

Tyler's observer playtest reported bots failing to collect cases next to walls,
failing to get over several objects and jumping almost vertically. The screenshot
shows a loose genuine case beside a wall during Improper Disposal. Its exact map
coordinate was not recovered; the live room had moved on by the diagnostic capture.

## Reproduced failures

1. With a pending city route, a grounded local waypoint produces horizontal
   takeoff. After the 150 ms local-step refresh, the walking support probe returns
   no point because the bot is airborne. The controller then brakes horizontal
   velocity toward zero. The minimized brain test reproduces this without enemies.
2. The navigation graph supplies walking routes; ordinary jump impulses do not
   specify a landing beyond an obstruction. Controlled real-physics tests at
   obstacle heights 1.25, 1.65 and 2 units reproduce missing direct traversal.
3. A case in a body-wide gap beside a wall is physically collectible, but that gap
   has no centered two-unit navigation node. The global path sends the bot around
   the adjacent object, leaving it on the wrong side of the case. A controller and
   ChaosSimulation test reproduces this failure. Initial ordinary wall and grid
   offset tests already passed: wall contact alone is not the universal cause.

Evidence: `output/wall-case-jumps-2026-09-14/red.log`, `obstacle-red.log`,
`gap-red.log` and `hypotheses.md`. The controlled gap reproduces the reported
failure class; it does not establish the exact geometry in Tyler's screenshot.

## Implementation

- A nearby visible genuine case gets a precise, supported final approach using
  full-body clearance. A blocked 2.5-unit step can shorten to 1 or 0.4 units.
  The bot stops within a conservative collection distance instead of requiring
  its body to occupy the case center or a coarse grid endpoint. Authority still
  owns pickup reach, LOS, eligibility, speed and protection rules.
- Short obstacle jumps choose a supported landing four or six units ahead, check
  for a low solid obstacle and check body clearance through an upper jump envelope.
  Tall walls, low ceilings, missing landings and clear paths reject the proposal.
  Visible counterfeit landing hazards are excluded. Each brain probes at most
  once per 900 ms, and the existing jump cooldown still applies.
- A jump retains its landing target while airborne, including lateral/diagonal
  movement. Steering brakes at that target. A planned obstacle jump discards its
  obsolete walking detour and reconnects to ordinary routing after landing.
  Death, reset, landing, timeout and authored launcher transitions clear the state.
  Existing trap avoidance and Jurisdiction boundary checks remain final guards.

The jump impulse, gravity, player controls, case collection radius, damage and
scoring were not retuned. This extends short obstacle traversal; it does not
make every object climbable or enable arbitrary wall and gap shortcuts. Shared
city planning retains its six-field cap and 2 ms / 96 expansion budget.

Implementation reference contract:
[wall-case/jump references](../../.research/wall-case-jumps-implementation-references.json)
and its online-validated receipt. Historical traversal constraints:
`brain:sessions/2026/09/rat-detective-bot-vertical-traversal-2026-09-12`.

## Verification and preview

Focused physics checks cover wall/grid placements, the narrow-gap reproduction,
low obstacles in four horizontal directions and real city bins, crates and a
dumpster. The real dumpster traversal passes diagonally over its edge: the rat's
footprint overlaps the obstacle above its top, rather than requiring a jump over
its exact center. Safety checks reject high walls, ceilings, absent landing
support and unnecessary open-floor jumps. Existing building-exit, stair and
launcher tests are included in regression validation.

`npm run typecheck`, `npm test` (1,318 tests: 161 Worker, 1,092 client and
65 scripts), and `npm run build` pass. The existing large-client-chunk advisory
remains. The first full run hit an unrelated non-atomic mock-log append race in
`omarchyDesktop.test.mjs`; the final complete run passed without modifying that
test or desktop behavior. Final evidence: `typecheck-final.log`, `tests-final.log`
and `build-final.log` in the task output directory. Production is not released
by this playtest follow-up. Human observation remains the check for incidents,
shared-room contention and map locations outside the focused fixtures.


## Hosted private observation

- Worker: `rat-detective-capacity-test`.
- Version: `95371214-da4d-4771-b8c4-ceaa15979490`, protocol 18.
- Fixture: `a39f9b06e9e1b1388093cc25f3e9d90c879ea1519e791a01cf2ba4625694b8fb`.
- Frozen receipt: `output/hosted-capacity-deployment-2026-09-15T03-57-06-286Z/deployment.json`.
- Expires **September 15, 12:57 AM Pacific** (07:57 UTC).
- [Observe ten hosted bots](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-combined-jumps-r1&observe=1).

The existing preview service serves the matching frozen client and hosted Worker.
The room uses the combined bot policy with ten bots plus the nonparticipating
observer. Normal matchmaking remains eight participants with a ten-rat maximum.
No production deployment or browser gameplay-input automation was performed.

Hosted protocol verification passed: all 56 served files matched the frozen client;
two observers and a reconnect received at least 30 Jurisdiction snapshots each;
all ten bots published movement; the roster remained ten bots and zero humans
before, during and after. Observer action rejection also passed. The disposable
verification room was cleaned up. See `hosted-check.json` and `hosted-check.log`
in the task output directory. Human playtest remains pending.
