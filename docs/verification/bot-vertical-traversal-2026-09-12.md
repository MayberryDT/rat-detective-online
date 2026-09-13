# Bot launcher, rooftop pursuit and armor routes — September 12, 2026

Status: deployed at Tyler’s explicit request to https://ratdetective.online/
on Worker **`b601b744-da80-431e-a9c0-1522029f5448`**, protocol 15, from the tested
working tree. Predecessor: `1b524e23-5b91-4da5-a6f1-128df88924ac` (case/kill
release). Source remains uncommitted; no Git push was performed.

## Problem and behavior

Tyler found that bots never sought upper-floor/roof Ironclad Alibis, and a human
could hold the case on a roof in Closing Time without bots following. The former
pickup policy required current-floor proximity and sight. The walking graph
contained rooftop surfaces but no launcher transitions. Three stair graphs also
stopped at a quarter-unit seam between ramp and landing that physical rat feet
can cross.

`BotLaunchRoutes.ts` maps five existing launchers to supported main roofs:
dumpster → Records, freight → Icebox, mousetrap → Needleworks, pressure → Pump,
and geyser → Gate. Paths retain explicit launch/descent actions. Bots center on
the pad, check trigger visibility/cooldown, and fire real cheese at the existing
control. Only an authoritative launch event starts ascent steering. They rise
above the facade, steer toward an open landing, brake over it, and resume ordinary
navigation/combat after landing. Reverse routes physically drop toward the street.
The sixth launcher (fan) has no new authored route in this change.

The controller now recognizes the actual thick trigger body as visible. A ray
blocked by other scenery still fails. Launch force, damping, steering physics,
cheese trajectory, damage and scoring authority are unchanged. Failed pad waits
expire after 8.5 seconds; flight steering expires after 10 seconds. Death and reset
discard traversal state. Deliberate pad waiting does not trigger stuck recovery.

Nearby visible usable pickups retain the existing current-floor/24-unit priority,
including armor refreshes. Separately, a bot may plan a trip to an available known
Ironclad site within 65 horizontal units, at most once per 25–35 seconds. New trips
are skipped while carrying, pursuing an advertised carrier, near an available
loose case, or already armored for more than four more seconds. Claimed sites and
failed destinations are excluded. This corrects the previous same-floor-only rule
without restoring unbounded global supply priority.

Navigation support checks probe at most 0.3 units along an unsupported step to
bridge the stair seam, with height and body clearance retained. Ordinary routes
still require support. Shared reverse flow fields remain capped at six, with
96 expansions / 2 ms per update; launcher links add a fixed five-edge scan.

## Verification

The new physical regressions use the production `ServerBotController` and
`ChaosSimulation` with world seed 341283204/version 2. They are deterministic
simulation tests, not browser or hosted gameplay previews. Route-isolation tests
filter snapshot pickups to the intended site; they never inject a successful
launch or pickup, teleport a bot onto a roof, or invoke recovery.

- Five Closing Time pursuit cases start at street level, fire actual launcher
  triggers, and require grounded contact near the rooftop carrier.
- Four stair cases start outside each landmark and require an actual authority
  collection event at the second-floor Ironclad site.
- Five rooftop supply cases start at street level, require an actual collection,
  then require a return to street height. All prohibit recovery callbacks.
- Focused planning tests check cooldown/occlusion, waiting without false flight,
  authority-confirmed ascent, steering bounds, timeout, stale events, death/reset,
  strategic supply intervals and carrier priority. Navigation regressions retain
  wall/sewer/atrium clearance and the frozen-clock operation budget.

Final validation: `npm run typecheck`, `npm test` and `npm run build` pass.
The full suite passes **1,052 tests**: 146 Worker, 877 client/shared and 29 Node
script tests. `git diff --check` is clean. The build retains its existing large
client-chunk advisory. Earlier trial failures identified the stair seam, trigger
visibility and pad-centering defects; the final physical route tests all pass.
One steering assertion was corrected to allow ordinary floating-point rounding
at the 12-unit speed bound.

## Production verification

Deployed with `npm run deploy:production`. All **56 live files** exactly match
the built client after asset propagation. The initial immediate fetch raced
propagation; the subsequent complete comparison passes. Health and old-host
root/path/query redirects pass. A bounded passive observer decoded **113 snapshots
with zero errors**, joined eight rats with all 18 supply sites, and resumed the
same identity in **587 ms**. After the reservation expired the room returned to
zero humans/bots. `public-live-v2`, world seed 341283204/version 2, protocol 15,
namespace and the 16-rat cap are preserved. Saved source/config hashes match the
deployed tree. Evidence: `output/bot-vertical-production-2026-09-12/`.

## Limits

The five authored main roof routes and four upper-floor sites are covered; this
does not establish access to every decorative tower or arbitrary roof. Physical
tests demonstrate arrival and collection, not a guarantee of killing a camping
human. Live multiplayer congestion, incidents during traversal and subjective
difficulty still need human playtesting. No browser gameplay/input automation,
local service restart or Git commit was performed for this follow-up.

Prior context: [restock/bot/launcher receipt](restock-bots-launchers-2026-09-11.md)
and GBrain `sessions/2026/09/rat-detective-restock-bots-launchers`.
