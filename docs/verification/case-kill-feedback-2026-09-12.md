# Case lifecycle and kill confirmation — September 12, 2026

Initially implemented locally; Tyler subsequently requested production deployment.
**Now live on Worker `1b524e23-5b91-4da5-a6f1-128df88924ac`**, protocol 15.
Deployed from the tested working tree, not yet committed. The checkout was clean
before this work. No authority, scoring, protocol, animation, audio mix or physics changes.

## Reproduced case defects

The earlier correction cleared stale pickup predictions but missed the next
frame's interaction check. GameSession checks interactions before ChaosView.update.
After a Chain of Custody delivery, the authoritative case is loose at its new
site while the mesh still occupies the last carried pose. Using that mesh as the
pickup target produces a fresh false claim and reattaches the case until rejection
or timeout. Interaction now uses the current authoritative case position; the
segment sweep, reach, speed limits and authoritative eligibility remain intact.

The compact-snapshot integration regression now renders the carrier at the
destination before delivery and checks interactions after applying the delivery
snapshot but before rendering. It failed on the preceding source and now passes
for both non-winning deliveries. The third delivery still closes the round;
the winning case remains during the result screen as before.

Separately, gameReset cleared predictions but retained the confirmed owner and
grip. Reset now clears the old view state, immediately detaches the sleeve, hides
the primary prop/beacon, removes extra case visuals and pauses the old world
presentation until the next snapshot. A new regression failed on the preceding
source and now verifies detachment before any new snapshot, multiple frames in
that gap, and the fresh case appearing at its correct site afterward.

## Kill feedback

Only authoritative playerDied events crediting the local player against another
rat trigger the new feedback. Zero-HP damage packets, other players' kills,
neutral deaths and self deaths do not duplicate or falsely award it. Existing
nonlethal hit confirmation and the hit-confirm sound remain.

The lethal X is red, larger and held for 500 ms. Ordinary hits during that hold
cannot overwrite it. Beneath the aim point, a 2.4-second Bangers headline reads
“RAT DOWN · [victim]”, followed by an Outfit quip. The 24-line shuffled pool uses
the existing MunicipalQuips mechanism: every line appears before reuse, with no
immediate boundary repeat. Examples: “THE ALIBI HAD HOLES.” and “PROMOTED TO FLOOR
INSPECTOR.” Names are inserted as text. Rapid kills replace one bounded notice
and refresh its lifetime. Death, round reset and disposal clear feedback/timers.
Compact landscape styling and reduced-motion alternatives are included.

## Checks and limits

- Focused regression/HUD/session/quip checks: 44 passing tests.
- Full suite: **1,031 passing** (146 Worker, 856 client, 29 script).
- Typecheck, production build and diff whitespace checks pass. The build retains
  the existing large-chunk advisory.
- Silent static browser layout inspected at 1280×720 and 640×360. Fixture under
  `output/kill-feedback-2026-09-12/` imports the actual crosshair CSS and local
  Bangers font; it is not a hosted gameplay preview.
- No automated browser gameplay/input checks, production traffic, deployment or
  Git commit. Human playtest timing and acceptance remain outstanding.

Prior context: `brain:sessions/2026/09/rat-detective-explosion-delivery-2026-09-12`.
The earlier receipt established stale prediction cleanup; this follow-up covers
the missed interaction-before-render ordering and confirmed reset ownership.

## Authorized production release

Tyler requested “push it live for me.” The guarded `npm run deploy:production`
rebuilt and deployed the matching client and Worker to the existing
`rat-detective-preview` environment and domains. Version
`1b524e23-5b91-4da5-a6f1-128df88924ac` replaces
`fea69807-c936-47cf-98a1-22171a59143a`. No Git commit or Git push was performed.

All 56 live files exactly match the deployed local build. Health, sharing metadata
and both old-domain redirects pass. A bounded passive protocol observer received
83 valid snapshots with zero decoding errors, normal eight-rat backfill and all
18 pickup sites. Same-ID reconnect completed in 819 ms. The initially empty room
returned to zero humans/bots after the reservation expired. Public room
`public-live-v2`, world seed 341283204/version 2, existing namespaces and the
16-rat cap remain intact. No gameplay movement/firing or forced reset was sent.

Evidence: `output/case-kill-production-2026-09-12/` contains the deployment log,
source patch/hashes and production verification result. Existing tabs must reload
to receive the updated client. The earlier local-only checks above remain dated
evidence; this section supersedes their undeployed status.
