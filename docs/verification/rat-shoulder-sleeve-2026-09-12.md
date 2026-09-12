# Shoulder-pivot sleeve and original case arm — September 12, 2026

Tyler explicitly selected the new gun sleeve, made shorter and rotating from its
shoulder when firing, with the original equipped case arm. This supersedes the
open selection in the preceding original-reference comparison.

## Change

- The straight floating gun sleeve has a fixed pivot in coat space. Its cuff
  follows the existing pistol grip through aim, recoil, walking, death and reset.
  The cloth span adjusts slightly to fit the existing weapon motion; the idle
  sleeve is between .25 and .34 units long versus the preceding .39 units.
  No elbow or new anatomical hand was added to the gun side.
- The carried-case arm restores the accepted release8cd0ec2 geometry, including
  the small original paw and borrowed coat/skin materials. A non-rendering grip
  alias preserves the existing handle alignment. The separate empty straight
  sleeve and no-sleeve studio choices remain.
- Workshop `model=latest` now defaults to **New gun sleeve · original case arm**.
  Original rat and new outfit/original arms remain as references. Highlight UI
  explains that the equipped case arm retains its original material roles.

[Workshop](http://127.0.0.1:5196/model-preview.html?model=latest&hand=case&view=three-quarter&mute=1).
Use **Pistol side**, then **Fire pistol** to inspect the shoulder motion.
Port5196 uses the existing transient `rat-detective-outfit-studio.service`.

## Verification

946 tests passed: 137 Worker, 782 client, 27 scripts. Typecheck and app/visual
builds passed; the existing large-chunk advisory remains. Focused regression
checks compare original and new muzzle positions throughout several aim angles,
walking, firing recovery, death and reset, while asserting a stationary shoulder
and exact cuff-to-grip placement for the visible model and outline. Existing
local/opponent case alignment, borrowed armor materials and cleanup checks pass.
Muted workshop screenshots confirm idle and raised firing poses. Evidence lives
in `output/shoulder-sleeve-2026-09-12/`. No automated gameplay inputs were used.

## Private playtest

[Audible r6 playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r6).
Frozen matching private Worker `7baab4c3-672f-4baf-bcf4-e64cde6c3185`, expiry
**September 12, 6:37 PM Pacific**. Receipt:
`output/hosted-capacity-deployment-2026-09-12T21-37-19-896Z/deployment.json`.
Uses normal hosted matchmaking and server bots (eight participants alone,
16-rat cap), with separate private namespace and no browser bots.
A bounded two-client protocol check decoded 1,782 frames, retained both selected
highlights, observed eight participants on both welcomes and verified 154 source
file hashes against the frozen receipt. This is not a performance playtest.
The r5 relay was replaced; production remains unchanged and no commit was made.
Human evaluation of the proportions and motion remains pending.

## Subsequent accepted direction

Tyler accepted the gun sleeve, then requested that the case sleeve share its
shape with more length, and decided to omit the sleeve entirely without a case.
This supersedes the original-case-arm and empty-sleeve choices above. See the
[case-sleeve follow-up](rat-case-sleeve-2026-09-12.md).
