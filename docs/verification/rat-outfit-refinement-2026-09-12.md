# Character workshop and model refinement — September 12, 2026

Tyler requested a complete outfit-studio rebuild and further cartoon model refinement after the first prototype. Implemented in the existing uncommitted tree and a refreshed private preview. Production remains the September 11 release.

## Correcting the review surface

The previous studio's case was wrong: it omitted the live carry's 90-degree rotation and parented the case under the stretching coat. Its earlier screenshot inspection did not establish correct studio carry. The gameplay case already had the intended transform.

`CaseCarryPose.ts` now holds that existing live calculation. `ChaosView`, `ExtraCaseVisual` and the new `OutfitStudioSubject` use it. The studio creates the real `RatController`/`RatEntity`, real briefcase and borrowed-material carry arm; the case remains a rigid scene child with its handle at the animated paw. This refactor preserves the live pose.

The workshop is rebuilt with direct palette swatches, shuffle/reset, orbit and zoom, front/pistol-side/case-side/rear presets, coat close-up, turntable, existing walk and fire animations, pause, carry, local/opponent rendering and Ironclad inspection. Walking advances steadily with a following camera rather than oscillating the root. Street and Records views load the real city and use `RatController.updateView()` with actual city lighting. These are static art inspections, not multiplayer or input tests. Studio illumination is separate and intentionally neutral/brighter. Audio stays muted on this art surface.

## Model refinement

- Preserve the rat's head/ears/eyes, body dimensions, weapon/muzzle, tail, animation pivots and timings.
- Beveled notched lapels, shorter tucked tie, rounded recessed buttons, shallow pocket openings, flatter overlap/rear seams and a cleaner hem.
- Rounded fedora brim and pistol cuff edges within the existing silhouette.
- Merge stationary coat folds, pocket lips and hem into one material mesh, and pocket openings into another. The existing opponent palette batching remains.
- Same four independent variables and all **1,024** assignments. One highlight still controls band, collar, lapels and both cuffs. No new clothing colors or micro-animation.

Raw single-model geometry count, including its existing muzzle mesh: **39 → 36 mesh parts; 7,774 → 7,370 triangles** (404 fewer, about 5.2%). This is source geometry accounting, not a GPU/FPS benchmark or an entire-scene draw count. Rendered shadow/outline passes and carried equipment add work.

## Review links and frozen private preview

- [Character workshop](http://127.0.0.1:5196/model-preview.html): local visual development server, independent of the private multiplayer deadline.
- [Audible human playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r2): frozen client and matching private Cloudflare Worker, production server-owned bots/backfill, eight participants alone, 16-rat cap. Expires **September 12, 5:26 PM Pacific** (September 13, 00:26 UTC).
- Private Worker: `93c10f84-4906-4350-a778-b8974ebff3cf`.
- Receipt: `output/hosted-capacity-deployment-2026-09-12T20-26-34-063Z/deployment.json`. Do not disclose referenced credentials.
- This replaces the first prototype's private Worker/relay. Its old r1 link and version are historical.

## Validation and limits

- Typecheck passed. Full suite: **137 Worker + 776 client + 27 script = 940 tests**. Application and visual builds passed with the existing large-chunk advisory.
- New tests instantiate the actual studio subject in local and opponent modes, move/turn it through the existing walk animation, verify the paw/handle intersection and rigid case scale, check sideways orientation after settling, and exercise carry toggling/disposal.
- Existing live case/authority alignment, model fit/muzzle, appearance transport, palette batching and armor restoration checks pass.
- Browser art inspection covered coat close-up, studio, street, Records, a plum opponent walking, and silver carry materials. No automated gameplay inputs or performance acceptance.
- Two-client hosted check: both welcomes contained eight rats; selected highlights survived remote delivery; **1,291 decoded frames**; **153 source files** matched the frozen source manifest.
- Local evidence: `output/model-refinement-2026-09-12/` contains screenshots, logs, geometry measurement and protocol-check scripts/results. `git diff --check` passed.

Human review still decides the final proportions and recognition during fast gameplay. Color assignments remain as documented in the first prototype: bots sample without replacement, human joins independently; room-wide appearance uniqueness is not guaranteed.
