# Accepted combined bots and cameos — September 14, 2026

Tyler accepted the hosted observation playtest and requested committing all project
changes and deploying them. The full working tree was already committed as
`ede484b`; this release promotes the approved combined bot policy and includes
its navigation, settings, observation infrastructure and cameo work.

## Included behavior

- Combined purposeful maneuvers, movement-goal commitment and attention are the
  normal server bot policy. The ten-rat maximum and eight-participant normal
  backfill remain, with existing human replacement and reconnect reservations.
- Landmark doorway routing, wall-case final approaches, directional obstacle
  jumps and completed sewer ramp crossings include the accepted playtest fixes.
- Spider-rat is on the reachable south Gate tower beside Sewer Geyser. Bat-rat
  remains in sewer Maintenance. Both retain the accepted cosmetic reactions.
- Player settings and the polished scrollbar/Resume layout remain included.
- Walking observation remains restricted to authenticated private bot fixtures.
  Production keeps its ordinary four-assignment rotation. The private preview's
  first-Paper-Chase override and ten-bot stress population are not production
  defaults.

Promotion exposed one interaction in existing Dispatch firing: choosing a shot
consumed the cooldown before attention could finish turning. Its cooldown now
starts only after the aligned shot survives the firing checks. Tests drive actual
simulation ticks and verify the shot, aim, movement and target priorities;
previous instant-turn assumptions were updated. No additional movement or weapon
tuning was introduced.

## Validation and release

- Code commit: **`c5a2534`**, following the full-project commit `ede484b`.
- Production: https://ratdetective.online/, Worker `rat-detective-preview`,
  environment `production`.
- Version: **`2869db51-e214-4c90-a620-c204cfaaf034`**.
- Predecessor: `60f63b24-a014-47c9-a3ba-772bea41ef5b`.
- Protocol 18; existing `public-live-v2` and its version-2 world are retained.
- All **1,385 tests passed**: 161 Worker, 1,158 client and 66 scripts.
- Typecheck and build passed; the existing large-chunk advisory remains.
- The 94 targeted brain/controller/zone/experiment and four opportunistic-fire
  checks pass. Release source hashes stayed unchanged through validation.
- Deployed with `npx wrangler deploy --env production` using the checked build.

The private sewer crossing evidence includes 48 physical traversals across all
four entrances in both directions and two assignments.

Source contract and prior evidence:
[combined policy](bot-combined-2026-09-14.md),
[sewer crossings](sewer-exits-2026-09-14.md),
[wall cases and jumps](wall-case-jumps-2026-09-14.md),
[building corners](carrier-corners-2026-09-14.md),
[cameos and reachable placement](superhero-cameos-2026-09-14.md).

Local release evidence is in `output/combined-production-2026-09-14/`.
No browser gameplay automation, public stress test, forced round reset or
namespace replacement is part of this release. The bounded live check verifies
delivery and participation; human acceptance covers the preceding preview.

## Live verification

All **58 production assets** exactly match the release build, including the two
cameo GLBs. Health, companion status and old-host root/path/query redirects pass.
A ten-second passive protocol check received **303 chaos snapshots** and **1,439
movement messages** in the retained version-2 world, seed **341283204**. Normal
matchmaking produced eight participants and seven server bots; all seven moved
more than one unit. The current persisted assignment was Jurisdiction. No public
round was forced to change.

The check disconnected normally. A later status read confirmed zero players and
zero bots with the same canonical room, world and round start. All source hashes
were stable through validation and deployment. GitHub receives the existing
full-project history and the release/receipt commits via a normal fast-forward
push to the configured upstream `origin/master`.

The predecessor understands protocol18 and retains settings and the ten-rat cap,
but rollback would remove combined attention/commitment, later traversal fixes,
private observer infrastructure and cameos. Preserve the public namespace and
stored world when diagnosing any future issue.
