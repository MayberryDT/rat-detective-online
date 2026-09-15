# Building-corner carrier routing — September 14

Tyler observed successive Jurisdiction carriers collecting the same case, running
into a building corner and dying there. He has seen it in multiple buildings;
the exact original location is unknown. This follow-up fixes shared navigation,
not Jurisdiction scoring or bot combat tuning.

## Reproduction and cause

A cold `ServerBotController`, the real seeded city colliders and a single carrier
reproduce long pauses at Needleworks corners without enemies. Baseline behavior
also reproduces the northwest pause. Pre-solving the city flow field removes it:
local fallback is targeting a distant zone while the bounded search is pending,
so it can settle against interior geometry far from a useful exit. Merely checking
that the rat eventually escapes within 30 seconds missed the problem.

Testing a short doorway leg exposed a second existing attachment defect. A jump
could invalidate the old search origin; the replacement used feet around y=5.4
and snapped to the y=8 floor. The bot then landed downstairs and accepted a route
starting overhead. It continued jumping at that waypoint for the rest of a
30-second reproduction. Vertical bouncing also concealed lack of horizontal
progress from recovery checks.

Diagnostic evidence is in `output/carrier-corners-2026-09-14/`: `reproduction.log`,
`minimized.log`, `baseline.log`, `warm-route.log` and `route-adoption.log`.
These establish the failure class, not the precise pile of rats Tyler saw.

## Change

- Bots leaving a landmark first route to a door opening authored in the same
  layout that cuts its collision walls. Local fallback uses that exit too.
  The actual case/assignment objective is retained; outside, normal city routing
  resumes. Goals inside the same building and rooftop routes retain their paths.
- Fresh searches and completed-route attachment require floor support: a real
  physics contact or a checked walkable surface within the existing foot tolerance.
  This also permits immediate routing on spawn before the first contact. A nearby
  old origin no longer permits attachment to a first waypoint on another floor.
- Stuck progress uses horizontal movement, so jumping in place cannot count as
  travel. Existing reset, suppression and recovery machinery remains in place.

Shared flow fields, the six-field cap, the 2 ms / 96 expansion budget, real stair
and launcher physics, combat, pickups and scoring are unchanged.

The implementation contract is
[carrier routing references](../../.research/carrier-routing-implementation-references.json),
with an online-validated receipt. Prior shared-budget guidance:
`brain:sessions/2026/09/rat-detective-bot-navigation-regression`.

## Verification

Twenty real-city physics cases cover all four ground-floor corners of all four
landmarks plus their four upper-floor armor locations. Every carrier must exit
within 40 simulated seconds without requesting a recovery teleport. Ground-floor
cases must never spend two seconds without a quarter-unit of horizontal progress
after initial settling; upstairs cases allow six seconds for the longer cold
stair search. All twenty pass.

Focused navigation, real pickup collection, vertical traversal and launch tests
pass. Unit regressions cover a pending grounded route surviving a jump and
rejection of an overhead first waypoint after landing. `npm run typecheck`,
`npm test` (1,268 tests: 161 Worker, 1,042 client and 65 script) and `npm run build`
pass. The existing large-bundle warning remains. A one-line type assertion in the
concurrently added static cameo viewer was aligned with the existing visual
fixtures so the combined workspace typecheck could pass; its behavior is unchanged.
Logs are `typecheck-final.log`, `tests-final.log` and `build-final.log`.

This is a private candidate. Human observation across rounds remains the useful
check for other corner locations, shared planner contention and case handoffs;
these isolated tests do not prove every possible route is free of stalls.

## Hosted private preview

- Worker: `rat-detective-capacity-test`.
- Version: `addde7a2-9e8e-41df-bf86-e28b0df812a5`, protocol 18.
- Fixture: `9c2252ae587bae4f07c0494e8164a6790eba1d2ee3923ef5387753106542c17a`.
- Frozen receipt: `output/hosted-capacity-deployment-2026-09-15T02-40-07-477Z/deployment.json`.
- Expires September 14 at **11:40 PM Pacific** (September 15, 06:40 UTC).
- [Observe ten hosted bots](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-combined-corners-r1&observe=1).

The relay serves the frozen matching client through the existing preview service.
This is the combined policy and a full ten-bot Jurisdiction fixture; an observer
occupies no rat slot. Ordinary human joins still replace bots. Normal matchmaking
elsewhere remains eight participants with the ten-rat cap. Production was not
deployed by this follow-up.

Hosted protocol checks passed against a disposable room: all 56 served assets
matched the frozen client, two observers and a reconnect received at least 30
Jurisdiction snapshots each, and all ten bots published movement. The roster
remained ten bots and zero humans before, during and after those connections.
Observer action rejection also passed. Evidence: `hosted-check.json` and
`hosted-check.log` in the carrier-corner output directory. No automated browser
input was used; the new build awaits Tyler's human observation.
