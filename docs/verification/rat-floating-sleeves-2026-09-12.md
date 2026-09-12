# Floating straight sleeves — September 12, 2026

Tyler rejected the preceding study's connected, bent arms and anatomical paws as too realistic. **The intended Rat Detective style is matching floating straight sleeves and cuffs, with no shoulders, elbows, palms, fingers or thumbs.** The word “hand” in prior requests did not request hand anatomy. This supersedes the connected-arm design in the [previous study](rat-arm-study-2026-09-12.md).

## Implementation

- `RatArmModel` now creates two simple closed lathed shapes: a short, straight coat-colored sleeve and a matching highlight cuff, with small edge bevels. Both sides use identical geometry. No bend or body connection geometry remains.
- Pistol sleeve receives a small outward visual offset for clearance; the pistol, animated muzzle and its pivots stay put. The case sleeve keeps the existing carry pose and logical grip anchor.
- Real hand geometry is removed. Named invisible sleeve-grip anchors support existing carry alignment checks. The carry sleeve borrows only the coat/highlight materials, including silver and hit restoration.
- Workshop study 04 offers **Case / Empty sleeve / No sleeve**. Existing selection URLs and the Street/Records walk-in-place preview remain supported. Keeping the empty sleeve permanently in gameplay remains undecided.

## Validation

941 tests passed (137 Worker, 777 client, 27 script); typecheck and application/visual builds passed, with the existing large-chunk build advisory. Existing carry/remote/studio checks now inspect sleeve anchors instead of removed paw meshes, and armor checks cover the two remaining sleeve materials. Static browser review covered empty and equipped sleeves and the firing pose. No automated gameplay inputs or FPS claim. `git diff --check` passed.

[Workshop](http://127.0.0.1:5196/model-preview.html?hand=empty&view=front). Local evidence/logs: `output/floating-sleeves-2026-09-12/`. Source remains uncommitted; production is unchanged. The previous arm study's source and private preview describe a rejected intermediate design, not the current direction.

## Refreshed private preview

[Audible human playtest r4](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r4): frozen matching client and private hosted Worker with normal production-owned bots (eight participants alone, 16 cap). Worker `74a5f4d4-88c5-48a1-b819-9fa45be74691`; receipt `output/hosted-capacity-deployment-2026-09-12T20-54-25-742Z/deployment.json`. Expires September 12 **5:54 PM Pacific** (September 13, 00:54 UTC). This supersedes r3. Referenced credentials remain private.

Bounded hosted two-client check: both welcomes had eight rats; highlights survived remote delivery; 1,702 decoded frames; all 154 source files matched the frozen manifest. Protocol/source check only, not gameplay acceptance.

## Study 05 — restore original proportions and a resting pose

Tyler found study 04 too tiny/simple and too far from the body. The original
released case arm was checked as a dimensional reference: approximately .417
units from shoulder to grip, tapering from radius .12 to .09. The current straight
sleeve/cuff now spans .390 units rather than .241, with a .108 upper radius,
a tapered coat section and a small raised cuff rim. The case grip stays fixed;
the increased length brings the upper sleeve back close to the coat. Both sides
still share the same geometry and have no anatomical hands or bent joints.

The empty sleeve has its own resting pose: its grip origin is (.595,.79,.02) in
coat coordinates, with its axis pointing straight down. It sits beside the body
rather than remaining at the outward case grip. It follows the existing animated
carry anchor, so the city walk preview continues to work. All three options remain.

941 tests, typecheck and both builds passed again (existing chunk advisory).
Browser review covered the longer case sleeve and the empty vertical side pose.
Evidence: `output/sleeve-proportions-2026-09-12/`. This supersedes the short study
04 geometry described above. Production remains unchanged and no commit was made.

Study 05 private preview: [audible r5 playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r5), frozen matching client/hosted Worker `3e8cf975-cfe1-4094-93a8-da5f305da1b7`, expires September 12 **6:02 PM Pacific** (September 13, 01:02 UTC). Normal production-owned bots/backfill and 16 cap. Receipt: `output/hosted-capacity-deployment-2026-09-12T21-02-14-538Z/deployment.json`; referenced credentials are private. This supersedes r4. Two-client protocol/source check: eight rats in each welcome, retained highlights, 1,753 decoded frames and all 154 frozen source hashes matched. No gameplay/input acceptance implied.
