# Paper Chase street/sewer guidance — September 13

Tyler reported the live Paper Chase arrow continuing to say “EXIT SEWER” outside
the sewer for Icebox, Records Bureau, Pump Station and other destinations. He
explicitly requested a fix without pushing it live.

## Cause and correction

The Jurisdiction implementation changed `ChaosView` to pass the local rat's mesh
feet to `AssignmentDestinations.updateCue`, instead of using camera height. This
was needed for reliable layer guidance while the shoulder camera is above street
level. Jurisdiction used a `y < -1` underground check; the retained Paper Chase
branch still used `y < 0`. Ground contact can put feet slightly below zero, causing
the street rat to be classified as underground on every update and delivery.

`assignmentGuidance.ts` now computes one shared `y < -1` classification before
branching by assignment. This preserves Jurisdiction's existing boundary (the
sewer ceiling is at -1), ignores small street contact penetration, and retains
real sewer exit/entry paths. No camera, physics, scoring, networking, timer, HUD
placement or bot behavior changed. No protocol bump is needed.

## Reproduction and validation

Ten new regression cases failed before the source fix: six destinations checked
at feet heights -0.1, -0.003, 0 and 0.3; four physical pipe exit routes checked from
the lower hall through the ramp to the street. They assert the actual target
point as well as the displayed layer instruction. Re-entering the sewer restores
exit guidance. A DOM integration assertion checks that the existing card changes
from “EXIT SEWER” to “DELIVER PAPERWORK INSIDE” after returning to grounded street
height. Sewer Maintenance still directs street rats underground.

All 44 focused guidance, destination and Jurisdiction tests passed. The full
suite passed all 1,131 tests (149 Worker, 951 client, 31 script), plus typecheck
and application build. The existing large-chunk build advisory remains. Evidence and before/after logs are in
`output/paper-chase-sewer-guidance-2026-09-13/`, including a diff against the exact
released guidance source (`fix-vs-release.patch`). No automated browser input or
human playtest was performed for this local fix.

At the end of the initial fix turn, no deployment, service restart or Git commit
had occurred. The subsequent explicit release authorization is recorded below.
Existing frozen private previews lack this fix.


## Authorized production release

Tyler subsequently requested “deploy it live”. Deployed with the explicit
production environment to `rat-detective-preview` at `https://ratdetective.online/`:
version **`b0518f94-4dc1-433f-af5f-7141a70d2d4b`**, protocol **18**. Previous version
`506ae57e-fd98-4a9d-b5e3-b51ce6e44779` restores the guidance bug if rolled back.

Compared all 164 source files against the preceding release: only
`src/prototype/assignmentGuidance.ts` differs, exactly matching the tested patch.
Reused the completed 1,131-test, typecheck and build validation. Recorded all
source hashes and 56 built asset hashes before deployment. No public room reset,
namespace change, local service restart or Git commit. Existing tabs need a
refresh to load the corrected client. All four rotating assignments remain.

Release evidence: `output/paper-chase-sewer-release-2026-09-13/`, including
`source-assets.json`, `versions-before.log`, `deploy.log` and live verification.

Post-deploy checks passed: all 56 live assets exactly match the reviewed build;
health/status return 200 and legacy root/path redirects remain correct. A passive
12-second default-matchmaking observer received protocol 18, eight participants,
original world version 2/seed 341283204, 1,942 valid messages, 1,480 movement
updates and 183 shots, with no invalid messages or early close. The public round
was Closing Time; no forced Paper Chase round or browser gameplay input was used.
The regression tests verify the corrected arrow logic; live asset comparison
verifies the corrected client is being served.
