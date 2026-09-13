# Explosion damage and carried-case correction — September 12, 2026

**Subsequently released:** Tyler accepted the corrected gameplay preview and
requested everything committed and published. See the
[production receipt](animation-production-2026-09-12.md). The preview-stage
measurements and scope below are historical.

Tyler accepted the exaggerated animations in gameplay, then requested two fixes
before release: Planted Evidence and Improper Disposal explosions should also
hurt their initiator; investigate a Chain of Custody case apparently staying in
hand after entry, disappearing much later, and the round ending after one delivery.
Production remains unchanged. Existing uncommitted animation work is preserved.

## Changes

Both radial eruptions retain the initiating player's attribution and mark their
balls as explosive. That provenance survives storage and any subsequent split.
Collision and authoritative damage allow these balls to hit their initiator;
self deaths grant no kills, assignment points or win. Normal shots, ordinary
ricochet/split rounds and a shooter's carried-case exclusion retain their previous
protection. Ironclad still reflects explosive cheese. Ball count, cap, speed,
gravity, radius and lifetime are unchanged; neutral counterfeit contact traps
remain lethal and uncredited.

The new optional provenance is authority-only state. Both compact and legacy
visual frames omit it and retain protocol 15; they do not decide collision
eligibility. Storage retains the marker and shared state validation checks it.
The private client and Worker are
still frozen together. The static practice lifecycle uses the same damage rule.

Case prediction previously could outlive its simulation epoch or a round reset.
An accepted old claim waited for a matching old epoch forever, while pending
claims also survived delivery updates until their response/timeout. Reproduced
tests showed an obsolete grip remaining attached after reset/epoch change.
Ownership confirmation, delivery, round/epoch changes and resets now clear
superseded case predictions. Cancelled claim acknowledgements cannot reattach
them. Ordinary pending pickup animation and rejection/timeout rollback remain.

## Delivery investigation and limits

The server still awards one personal point and relocates the case in the same
simulation step for deliveries one and two. The third closes the round and retains
the winning case in hand, as previously accepted. Tests cover every destination,
theft, persistence, no repeated automatic score, and first-to-three scoring.
An additional integration check passes all three deliveries through compact delta
snapshots into the real case renderer with the accepted RatAnimator and delivery
reaction active; the first two grips disappear on the first rendered authoritative
snapshot, and all three reactions fire once.

The stale prediction is a confirmed defect, but the exact human playthrough was
not captured and its causal connection remains unconfirmed. No evidence establishes
that an animation changed authoritative scoring or that the server granted a win
for one personal point. Tyler should recheck Chain of Custody in the refreshed
preview before production release; the winner identity and displayed personal
delivery count would help distinguish any remaining scoring problem from stale
presentation. No automated browser gameplay/input testing was performed.

## Validation and private preview

Focused collision, scoring, Ironclad, durable restore and carried-case tests pass.
The full suite passes **1,019 tests**: 142 Worker, 850 client and 27 script tests.
Typecheck, application build, visual build and diff whitespace checks pass. The
existing full-burst snapshot budget test caught the initial metadata overhead;
both visual serializers now omit authority-only provenance without changing the
64 KiB limit. That test uses the actual legacy serializer, retains its full capped
burst/24-launch payload and validates decoding. The model, animator, acting,
locomotion, RatEntity and GameSession hashes match the previous approved preview.

[Audible updated gameplay preview](http://127.0.0.1:5197/?room=graybox-benchmark-match-explosion-delivery-r2)
expires **September 12 at 9:49 PM Pacific**. Private Worker
`rat-detective-capacity-test`, version `af403974-92c4-4faf-a276-622407c5da49`,
protocol 15. User service `rat-detective-explosion-preview.service` serves the
frozen matching client on port 5197; the old animation relay is stopped.
Production server bots fill the normal eight-participant lobby and yield to
humans, with the 16-rat cap. Full-lobby and checkpoint-control overrides are off.

A separate private protocol pool verified one human/seven bots, two humans/six
bots, **1,773 decoded frames**, unchanged appearance highlights and junction medkits.
All **56 served assets** and **158 source hashes** match; private fixture identity,
expiry, cap and rejection of unauthenticated access are checked. This probe sent
no gameplay movement/firing input and does not establish performance or human
delivery timing. No production deployment or Git commit was made.

Receipt: `output/hosted-capacity-deployment-2026-09-13T00-49-12-941Z/deployment.json`.
Evidence: `output/explosion-delivery-2026-09-12/` (checks, builds and private parity).
The UTC deployment date is September 13; the user-local date is September 12.
