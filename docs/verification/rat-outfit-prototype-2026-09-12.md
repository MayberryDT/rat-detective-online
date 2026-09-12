# Rat outfit prototype — September 12, 2026

First implemented prototype of Tyler's accepted image direction. Source and private preview only; no commit or production deployment. Model refinement and human gameplay acceptance remain open.

**Later correction:** the old studio case pose was inaccurate despite the initial
visual inspection below. The [workshop rebuild](rat-outfit-refinement-2026-09-12.md)
fixes it using the shared live carry calculation and supersedes the private
preview links/version in this historical receipt.

## Design and behavior

- One shared fedora geometry; previous hat names remain valid in old player/checkpoint data but render using the shared fedora.
- Preserve the existing coat profile, head, ears, eyes, tail, animation pivots, pistol and muzzle position. Add a closer collar, smaller lapels, tucked tie/shirt insert, three buttons, front overlap, slim welt pockets, finished hem and subtle rear seam/vent.
- Hatband, outer collar, lapels and both cuffs share `rat-highlight`. The case cuff borrows the same material so hit flashes and Ironclad restoration apply to it too. Shirt is a 22% linear-color blend from highlight toward white; tie/buttons use 32% of the coat's linear color.
- Eight independently selected hat and coat colors (blue, green, plum, teal, ochre, orange, brown, slate), four highlights (ivory, tan, pearl gray, pale gold), four furs (golden, taupe, warm gray, ivory): **256 clothing combinations / 1,024 appearances**. No red in the new clothing pool. Named hex values live in `src/shared/ratAppearance.ts`.
- New appearances supply `highlightColor`. The optional validated RGB field survives joins, welcomes, corpse snapshots and existing respawn/reconnect preservation. Old data without it uses the default tan in the renderer. This is an additive protocol-14 field; it is not safe to assume an old server will retain it, hence the matching private deployment.
- Round bot outfits sample the pool without replacement. Human joins sample independently; this prototype does not guarantee room-wide uniqueness across humans and bots. Respawns preserve appearances.
- Existing rat material lift (16%), emissive fill (.28), world lights, controls, camera, launch steering, physics, muzzle origin and animation timings are unchanged.

## Review surfaces

- [Outfit studio](http://127.0.0.1:5196/model-preview.html): real geometry with four color selectors, front/side/rear views, existing walk/fire poses, case grip and remote batching toggle. Studio lighting is intentionally brighter than the city. City/indoor links preserve selected colors and are static art fixtures, not gameplay verification.
- [Audible human playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r1): frozen client, hosted private Worker, production-owned AI and matchmaking, eight participants alone, 16-rat cap. Expires **September 12 at 4:50 PM Pacific (23:50 UTC)**.
- Private Worker version: `a3ccff52-29c1-4884-9eb1-538a75541330`. Receipt: `output/hosted-capacity-deployment-2026-09-12T19-50-22-192Z/deployment.json`. The receipt references a private credential file; do not publish its contents.

## Verification

- Typecheck passed. Full suite: **137 Worker + 774 client + 27 script = 938 tests**. Application and visual builds passed with the existing large-chunk advisory; `git diff --check` clean.
- New focused coverage enumerates all 1,024 combinations, validates new/legacy/malformed appearance data, checks compact corpse transport and respawn preservation, verifies a shared highlight material, three buttons, identical muzzle placement and the <=16-material remote-palette budget.
- Existing fit, animation, carry and armor tests pass. Static browser inspection covered front, side, rear, case attachment, remote batching, tan/pearl highlights, street and Records interior shoulder views. No automated gameplay inputs or performance acceptance claimed.
- Hosted two-client protocol check: both welcomes had eight rats, chosen highlights survived welcome/remote delivery, **1,715 decoded frames**, **151 source files** matched the frozen manifest. This was a bounded protocol check, not a human playtest.
- Evidence, logs and exact protocol-check script: `output/model-prototype-2026-09-12/` (ignored local artifacts). Screenshots: `front-case-batched.png`, `street-shoulder.png`, `indoor-shoulder.png`.

## Next human review

Judge collar/lapel/button proportions in the studio, then brightness and recognition in actual motion. Tiny coat seams are intentionally subordinate at gameplay distance. Generated concepts approximate the model; they are not pixel-exact targets. No new micro-animation was added.

Historical context: GBrain `brain:sessions/2026/09/rat-detective-logo-upgrade-animation-2026-09-07` supports evolving the procedural silhouette. Its three-hat direction is superseded by Tyler's September 12 decisions in this session.
