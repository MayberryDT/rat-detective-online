# Matching case sleeve — September 12, 2026

Tyler accepted the shorter shoulder-pivot gun sleeve, requested a similar longer
case sleeve, and rejected keeping any sleeve on that side when no case is held.
This supersedes the original-case-arm selection in the preceding receipt.

## Implementation

CaseGrip now uses the same straight tapered sleeve and cuff geometry as the gun.
Its longer span reaches from the existing carry shoulder to the unchanged case
handle, about .44 units overall. The cuff borrows the rat's shared highlight
material and the sleeve borrows its coat, preserving lighting, hit flashes and
Ironclad. No anatomical hand, fingers or elbow remain in this candidate.
The accepted gun sleeve, firing pivot, muzzle, case placement and walking motion
are unchanged. Existing carrier loss/death/transfer cleanup removes the sleeve;
no empty-side mesh is created.

Workshop `model=latest` is labelled **Matching sleeves**. Equipment choices are
**Case / No case**. The empty-sleeve implementation was removed from the fixture;
old `hand=empty` links normalize to `hand=none`. Both original reference models
remain available, with their immutable released arm geometry when carrying.

[Workshop](http://127.0.0.1:5196/model-preview.html?model=latest&hand=case&view=three-quarter&mute=1).

## Validation

946 tests passed (137 Worker, 782 client, 27 scripts), typecheck and app/visual
builds pass, with the existing chunk-size advisory. Expanded studio checks
cover the longer reach, stationary sleeve top during walking and turns, shared
cuff material, handle alignment, removal without a case, and re-equipping under
Ironclad in local and batched opponent presentation. Existing live case death,
transfer and cleanup checks pass. Muted browser inspection confirmed the case
cuff/handle fit and bare side under No case. No gameplay input automation.
Evidence: `output/case-sleeve-2026-09-12/`.

## Private preview

[Audible r7 playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r7).
Worker **041ea602-f21b-4670-909b-caf87e314358**, expires **September 12 at
6:43 PM Pacific**. Frozen receipt:
`output/hosted-capacity-deployment-2026-09-12T21-43-58-082Z/deployment.json`.
Normal hosted matchmaking/server bots, eight participants alone and 16-rat cap.
A two-client protocol check observed eight-rat welcomes, retained selected
highlights, decoded 1,756 frames and matched 154 source files to the receipt.
This is a bounded protocol/source check, not performance verification.
The r6 relay is replaced. Production is unchanged and no commit was made.
Human review of the new case sleeve remains pending.

## Final gameplay review handoff

Tyler accepted the workshop model and requested an in-game review before his
final word. No additional model edits or production release were requested.
The same tested frozen build is now served for a fresh match at
[final model playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-model-final-r1),
with sound enabled and normal hosted bot backfill. Worker and **6:43 PM Pacific**
expiry above are unchanged. Port5193 now runs independently of the agent terminal
under transient user service `rat-detective-model-playtest.service`
(Restart=on-failure); the previous terminal relay was stopped. This is not installed
for boot persistence and the relay stops when the private fixture expires.
Service active and HTTP200 verified. Source and hosted protocol verification were
repeated for this handoff; no redundant rebuild or gameplay input testing.
Evidence: `output/model-final-playtest-2026-09-12/`.
