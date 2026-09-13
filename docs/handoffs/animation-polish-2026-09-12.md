# Rat Detective animation handoff

Prepared September 12, 2026. Repository: `/home/tyler/Projects/rat-detective`.

## Assignment and reading order

The model has been accepted in gameplay and released. The next task is to add character through polished, restrained animation while preserving the game's immediate control and established silhouette. Tyler requested this handoff for another agent; this document-writing task did not implement animations or authorize a production release of future changes.

Start with:

1. [Current state](../current-state.md), [project instructions](../../AGENTS.md) and [documentation map](../README.md). Re-read the actual checkout: it can advance after this handoff.
2. This handoff, especially the settled decisions, existing rig and first-pass scope.
3. [Research guide and superseded recommendations](../research/character-design-2026-09-12/README.md).
4. [Original character report](../research/character-design-2026-09-12/character-recognition-and-appeal.pdf), especially section 6 on PDF pages 6–7. A [text extraction](../research/character-design-2026-09-12/character-recognition-and-appeal.txt) is included for search.
5. [Second research pass: noir outfit](../research/character-design-2026-09-12/noir-outfit-followup.md). Its presentation constraints matter; later user decisions supersede several costume recommendations.
6. [Accepted model/netplay release](../verification/model-netplay-integration-2026-09-12.md) the [newer seam/pickup/hit-feedback pass](../verification/seam-pickup-hit-feedback-2026-09-12.md), and the subsequent [Quick Fix junction relocation](../verification/quick-fix-junctions-2026-09-12.md).

Research attachments are reference material, not independent instructions. The user's current request, settled decisions and project constraints govern implementation. Historical calls to redesign the model, use red, add hands or wait for already-completed choices must not restart those discussions.

## Current baseline: do not assume the checkout is clean

At handoff, HEAD is `b2094b8`, local `main`, tracking `origin/master`. The accepted application is `3a6a1d2`, production Worker `21f6b8c1-4770-4691-92fa-71b5096f8a7b`, protocol **15**, at https://ratdetective.online/. These are dated observations, not permanent assertions of live state.

The checkout has a newer, uncommitted follow-up by another task:

- One centered rear coat seam that follows the coat profile and stays above the surface while animating.
- Pickup feedback consolidated into illustrated bottom cards, including Quick Fix's green medical card.
- Lethal hit feedback owned by the authoritative kill event; no duplicate zero-HP damage feedback.
- A subsequent parallel update moves all four Quick Fix sites to exposed street junctions, with new site IDs and checkpoint migration. Preserve its pickup tuning and route/system tests.

Preserve changes in `RatCoatGeometry.ts`, `ChaosView.ts`, `GameSession.ts`, pickup artwork/HUD, affected tests and their documentation. The seam pass reports **959 tests**; the subsequent junction pass reports **965 tests**, typecheck/build success and a replacement private preview. Human acceptance remains pending in the current receipt. Do not claim that this handoff reran those tests.

Run `git status` before editing. Do not reset/clean, replace source with HEAD, or recreate a worktree from bare HEAD and thereby lose these changes. If isolation is needed, capture the actual dirty baseline through the project's supported workflow, verify the copy and preserve its provenance. Do not blindly copy a research packet over a newer checkout.

The prior netplay branch is already merged and deleted. Older optimization and foley branches survive as archive tags, not pending animation work. Do not import their older model or networking code.

## Character direction distilled from both studies

The rat is observant, capable and determined, trying to maintain professional composure during ridiculous physical combat. His dignity is easily disturbed; his competence is not. The useful contrast is a composed baseline, a brief readable response to an event, then a quick return to composure.

The first report separates recognition, affection and desire to play. Better animation may help communicate intent, but a charming portrait or one successful preview does not prove all three outcomes. Its proposed vocabulary is suspicion, decisive action, brief elastic reaction and economical recovery. It explicitly protects player agency.

The second report emphasizes rear and shoulder-camera readability. Hat, band, ears, back of head, collar, broad coat and tail are the recurring gameplay view. Shirt and tie enrich close views; they are not strong distant identifiers. Its noir references support restraint and orderly clothing. They do not require a human suit or slow clothing-adjustment performance.

Applied to animation: calm head, purposeful movement, subtle hat/ear response and controlled tail follow-through. An occasional look of indignation is more appropriate than constant panic, helplessness, babyish behavior, swagger, dances or a permanent smile. The proposed tone is not a claim of proven audience preference.

## Settled user decisions: preserve these

### Pace and control

Tyler deliberately designed virtually continuous action. After a launcher fires, the player can steer, aim, shoot, land on a pickup or enter a group of rats. Animation must never take over that sequence.

- No movement lock, aiming delay, input buffering added for acting, recovery stun, forced stand-up or requirement to finish an animation.
- A landing reaction can occur while the player is already moving and firing again.
- No camera bob, aim sway or root motion introduced by cosmetic polish.
- Do not retune projectile physics, launcher impulse, jump gravity, hitboxes, collisions or the shoulder camera to make an animation convenient.
- Preserve immediate shots at the real animated muzzle. No speculative second ball, changed shot cadence or hidden muzzle offset.

### Model and equipment

- One shared fedora; small wedge-shaped head, half-lidded eyes and separated round ears.
- Long gently tapered coat; three buttons, restrained collar/lapels, recessed shirt and short tucked tie. No legs or conventional human torso.
- Straight floating sleeves and cuffs. No elbows, realistic wrists, fingers, new anatomical hands or bendy arms.
- The accepted gun sleeve is short and rotates at a fixed shoulder as the existing pistol rig aims/fires.
- The final case sleeve matches it but is longer to reach the established handle. **No case means no sleeve on that side.** The earlier request to retain the original case arm was superseded by the accepted matching sleeve.
- The case stays rigid and close to its existing pose. Keep the cuff/handle attachment exact. Preserve rejection/timeout rollback for anticipated pickups.
- No hat tipping with a newly invented hand or sleeve, no loose tie added just to animate it, and no realistic cloth simulation as the default solution.
- Keep the new centered rear seam intact. Deforming the coat must not leave buttons, seam strips or pockets floating above or buried inside it.

### Colors and recognition

Independent variables remain **hat × coat × shared highlight × fur**, yielding **8 × 8 × 4 × 4 = 1,024** assignments. Do not replace them with a few fixed outfit presets. Color identity supports rivalries and recognition during play.

| Pool | Accepted colors |
| --- | --- |
| Hat and coat, selected independently | Blue `386CAA`, green `43825E`, plum `885B89`, teal `398D92`, ochre `C5A044`, orange `CD873F`, brown `97765F`, slate `7C899C` |
| Shared highlight | Ivory `E9DFC9`, tan `CBB596`, pearl gray `B8B9C8`, pale gold `D9BF80` |
| Fur | Golden `E8B84D`, taupe `B79D83`, warm gray `B4B0AB`, ivory `E8DAC0` |

Hatband, collar/lapels and both cuffs share the highlight. Shirt/tie/button treatments are derived, not new random color channels. No red clothing. Preserve the brighter accepted game materials and existing lighting; don't change colors or exposure to make an animation test look better. Color combinations are not a promise of unique assignments across every human in a room.

## Proposed animation program

These are the recommendations Tyler liked before requesting the handoff. They are not six already-implemented new features. Most refine existing motion. Start with the first two as one small, reviewable candidate; reserve the others for later comparison.

| Order | Work | Intended result and limits |
| --- | --- | --- |
| 1 | Starts, stops and turns | A slight lean responds to actual movement; the head feels steady, the hat follows and the tail settles last. One restrained stop response, never elastic oscillation that suggests delayed control. Preserve the current walk rhythm and avoid exaggerating the coat into a different vulnerable body. |
| 2 | Hat and ear reaction | A sharp turn, shot or landing briefly disturbs composure. Small hat lag and ear response settle naturally while the player continues. No hand adjustment, hat loss, free-floating orbit or permanent wobble. First pass can focus on turn/start/stop triggers and reuse existing shot/landing triggers without rewriting those systems. |
| 3 | Firing posture and recoil | A more intent expression and quieter decorative head motion while firing. Keep immediate shot/shoulder motion, then refine crisp recoil and recovery. Rapid shots must stay bounded rather than accumulate rotation or delay the next shot. |
| 4 | Airborne transitions | Tail/hat respond through ascent, apex and descent. A tiny landing compression resolves during ongoing movement and shooting. Normal jumps and high launchers both need review; no canned trajectory, control lock or new airborne physics. |
| 5 | Carried-case weight | Refine the existing start/turn/stop swing. Sleeve remains straight, case rigid, grip exact. Preserve visual proximity to the authoritative case collider and the no-case silhouette. |
| 6 | Observant idle | Sparse glances, one-ear response or a tiny head tilt with varied timing. Activity takes priority immediately. Seed cosmetic phase per rat; don't synchronize every blink or make idle motion constant. Avoid implying awareness of enemies through walls. |

The roughly **100–200 ms** combat accent suggested in discussion is an initial visual recovery range to experiment with, not a mandated timing curve or an evidence-backed universal optimum. Tail settling and sparse idle acting can differ. Actual firing and movement begin immediately regardless of the cosmetic recovery.

Quality should come from purposeful timing and unequal response between parts, rather than more motions running simultaneously. A composed baseline leaves room for events to register. Keep the tie/collar mostly orderly and let the hat, ears and tail carry much of the comedy.

## Existing animation: inspect before replacing

The character is a procedural Three.js rig, not a Blender animation clip pipeline. [RatAnimator](../../src/utils/RatAnimator.ts) already handles:

- Breathing, alternating hem-to-hem walking sway/lift/compression, acceleration lean and turn lag.
- Head counter-sway, hat follow-through and hit/recoil reactions.
- Periodic blink (4.7-second cycle) and ear twitch (6.1-second cycle).
- Aim hold and immediate `shoot()` pose, muzzle flash and decaying recoil.
- Jump lift, vertical-motion-based air pose, apex/descent response and landing compression.
- Animated carry anchor, continuous tail deformation and tip motion.
- Respawn entrance and physics-driven death/tumble secondary motion.

`update(dt, previewSpeed?)` derives movement from presented root positions, clamps visual dt and treats large displacements as corrections. `previewSpeed` exists for stationary workshop walking, not normal gameplay. `applyPose()` restores rest transforms and composes offsets. `poseDeath()` uses bounded spring substeps; reset paths clear animation state. Reuse that lifecycle instead of stacking independent transform writers.

Some current motion is a shared periodic function. The opportunity is better response to movement/events, calmer composition and controlled asymmetry. Do not describe existing hat lag, tail waves or landing squash as newly invented features.

## Code map and integration hazards

| File | Read for |
| --- | --- |
| [RatAnimator.ts](../../src/utils/RatAnimator.ts) | Main animation state, update/composition, hit/shoot/death/reset, carry anchor, tail deformation |
| [RatModel.ts](../../src/utils/RatModel.ts) | Named rig hierarchy, materials, face, fedora and actual pistol/muzzle |
| [RatArmModel.ts](../../src/utils/RatArmModel.ts) | Shared sleeve geometry and `updateGunSleeve` fixed-shoulder/grip follower |
| [RatCoatGeometry.ts](../../src/utils/RatCoatGeometry.ts) | Coat profile/tailoring and newer centered rear seam |
| [RatEntity.ts](../../src/entities/RatEntity.ts) | Animation entry points, outline, rigid batching, power-ups, death/reset and muzzle lookup |
| [RigidMeshBatch.ts](../../src/utils/RigidMeshBatch.ts) | Source hierarchy to batched rigid-bone rendering; visible and outline consistency |
| [RatController.ts](../../src/player/RatController.ts) | Real controls, view and weapon target; preserve gameplay responsiveness |
| [CaseGrip.ts](../../src/prototype/CaseGrip.ts) | Equipped sleeve creation and borrowed material/disposal ownership |
| [CaseCarryPose.ts](../../src/prototype/CaseCarryPose.ts) | Shared rigid world-space case placement at animated handle |
| [ChaosView.ts](../../src/prototype/ChaosView.ts) | Carried-case lifecycle, anticipation/rejection, corpses and current pickup feedback |
| [ExtraCaseVisual.ts](../../src/prototype/ExtraCaseVisual.ts) | Extra cases using the same grip/pose |
| [RemotePlayers.ts](../../src/session/RemotePlayers.ts) | Interpolated opponent motion and reset/rebase behavior |
| [GameSession.ts](../../src/session/GameSession.ts) | Real shot/event flow and newer authoritative hit/kill feedback |
| [OutfitStudioSubject.ts](../../test/visual/OutfitStudioSubject.ts) | Actual entity/controller in studio, case attachment, presentation modes and disposal |
| [model-preview.ts](../../test/visual/model-preview.ts) | Existing studio/city views, walking/fire/pause and palette controls |

Important details:

1. `RAT_GUN_SHOULDER = (-.49, 1.20, -.12)`. The cosmetic sleeve follows the existing pistol grip via `updateGunSleeve`, including recoil. Do not introduce an elbow or move the weapon to fit a cosmetic pose.
2. `RAT_CARRY_SHOULDER = (.43, 1.23, .02)` and the handle is based on `CASE_HAND + (0,.43,0)`. The case is a scene child, not a child of the stretching coat. A prior studio regression omitted the carry rotation and stretched the case; the shared pose helper fixed it.
3. The weapon is under the body rig. Editing whole-body transforms can alter the muzzle even if the pistol's local transform is unchanged. Capture accepted muzzle behavior before changing motion; keep actual projectile spawn and aimed barrel truthful. Do not hide drift with an offset or weaken the regression test. If necessary, concentrate initial polish on secondary/cosmetic parts rather than moving the entire weapon-bearing hierarchy.
4. The existing gun-sleeve test compares two model geometries driven by the same current animator. It protects alignment, but alone is not a frozen record of the pre-edit animator's trajectory. Use an explicit accepted-pose baseline when checking unintended changes.
5. Local and remote rendering, outline shells, Ironclad materials and corpse rigs share this machinery. New motion must work with batching, not only the unbatched studio. Borrowed coat/highlight materials belong to the rat; sleeve disposal must not destroy them.
6. Remote corrections, reconnect, death/respawn and launcher transitions must clear/rebase cosmetic state. Do not create a large wobble from a network correction or repeatedly replay a landing event from interpolation noise.
7. Appearance/random cosmetic timing must not consume the gameplay RNG used by shot patterns or authority. Use deterministic cosmetic seeds if needed.
8. Avoid per-frame allocations, extra live lights, cloth physics or new draw-call-heavy rigs. This game has up to16 rats, projectiles and corpses. Preserve current tail resource/bounds/normal handling unless a measured change justifies altering it.

## First implementation pass

1. Inspect the actual source/dirty state and record a small accepted animation baseline. Keep geometry, palette, camera and lighting constant.
2. Implement movement follow-through and restrained hat/ear responses as additive visual changes using the existing rig. Keep reaction amplitude bounded and ensure transitions are continuous at different frame rates. Do not slow control to make easing look smooth.
3. Add a small workshop comparison control for accepted baseline versus candidate if useful. The frozen **original model** is not the animation baseline: it is old geometry. Do not silently make `model=original` stand for the current accepted animation.
4. Expose start/stop/turn poses in the art fixture if needed; its current walk-in-place control alone cannot demonstrate every movement transition. These controls must remain isolated from gameplay authority.
5. Inspect front, rear, side and actual shoulder-camera city views, carrying and not carrying, local and opponent presentation. Keep the head/hat/ears clear and coat colors recognizable in motion.
6. Run focused regressions, typecheck/full suite/build, then prepare a matching private gameplay preview for Tyler. Report exactly what changed, what was verified, and what remains a human judgment. Wait for feedback before widening the animation set or releasing it publicly.

Recommended focus for the first visual comparison: a rat starts moving, turns sharply, stops, fires immediately and then moves again. The viewer should read purposeful action with restrained follow-through; the controller should feel unchanged. The test must not require the player to stop moving to watch a flourish.

## Verification

Existing relevant tests:

- [ratAnimation](../../test/client/ratAnimation.test.ts), [gunSleeve](../../test/client/gunSleeve.test.ts), [muzzlePose](../../test/client/muzzlePose.test.ts).
- [caseCarry](../../test/client/caseCarry.test.ts), [outfitStudio](../../test/client/outfitStudio.test.ts), [ratPowerups](../../test/client/ratPowerups.test.ts).
- [remotePresentation](../../test/client/remotePresentation.test.ts), [launcherPresentation](../../test/client/launcherPresentation.test.ts), [ratModelFit](../../test/client/ratModelFit.test.ts), [resources](../../test/client/resources.test.ts).

Add meaningful checks for introduced behavior: finite/bounded transforms under varied dt, same elapsed-time settling at30/60/120Hz, immediate repeated-shot response, grip alignment, reset/correction cleanup and outline/batched agreement. Do not just assert that a new constant appears in the output. Preserve the seam clearance and case anticipation rollback checks.

```sh
npm run typecheck
npm test
npm run build
npm run visual:build
```

Run focused tests before the broader suite. No need to rerun expensive checks without new changes or a failure. Visual quality and subjective input feel still require human judgment; do not claim automated tests prove them.

## Preview and access

[Tooling](../tooling.md) is authoritative. Inspect running services before starting another server. As observed at handoff:

- Workshop: `http://127.0.0.1:5196/model-preview.html?model=latest&hand=case&view=three-quarter&mute=1`, transient service `rat-detective-outfit-studio.service`. Studio, Street and Records views; Case/No case; Walk cycle/Fire pistol; local/opponent; Ironclad.
- Latest documented private preview: port5195, `rat-detective-junction-preview.service`, room `graybox-benchmark-match-quick-fix-junctions-r2`, dated expiry Sept12 7:29PM Pacific. The junction receipt says this replaces the prior seam/pickup relay; verify its current state before use.
- Port5193 previously served the merged model/netplay preview. It is not automatically the newest private backend.

Private fixtures can expire or replace one another on the shared test Worker. A listening local port or healthy relay does not establish client/server fixture parity. Check the receipt and remote fixture identity; coordinate instead of replacing another task's active preview by accident. Never expose the fixture credential.

Every **gameplay** preview must use a frozen matching client and hosted Cloudflare Worker, production server-owned bots, normal backfill (eight participants when alone) and a 16-rat cap. No localhost workerd or browser bots. Static model inspections must be labelled as such. Follow the existing prepare/relay commands in tooling; a new port does not by itself provide an isolated backend.

Agent browser work stays muted. Human playtest links stay audible. Tyler handles gameplay/input testing: do not run automated pointer-lock or movement/firing browser tests unless requested. Workshop art controls and requested screenshots are separate. Do not change the production sound mix. Do not deploy animation changes to production until Tyler accepts the candidate.

## Research and historical receipts

Both complete reports are included locally under [research](../research/character-design-2026-09-12/README.md). For implementation history, read selectively:

- [Outfit prototype](../verification/rat-outfit-prototype-2026-09-12.md): palette, shared fedora, initial study.
- [Workshop refinement](../verification/rat-outfit-refinement-2026-09-12.md): shared case pose and actual city-camera review.
- [Arm study](../verification/rat-arm-study-2026-09-12.md), [floating sleeves](../verification/rat-floating-sleeves-2026-09-12.md), [original reference](../verification/rat-original-reference-2026-09-12.md): rejected/intermediate versions, not specifications to restore.
- [Shoulder pivot](../verification/rat-shoulder-sleeve-2026-09-12.md), [final case sleeve](../verification/rat-case-sleeve-2026-09-12.md): how the accepted final equipment emerged.
- [Current integration](../verification/model-netplay-integration-2026-09-12.md), [netplay details](../verification/netplay-crispness-2026-09-12.md): live model and authority boundaries.

Shared GBrain can retrieve more context; search then get_page, using canonical `brain`. Relevant page slugs:

- `brain:sessions/2026/09/rat-detective-outfit-prototype-2026-09-12`
- `brain:sessions/2026/09/rat-detective-workshop-refinement-2026-09-12`
- `brain:sessions/2026/09/rat-detective-shoulder-sleeve-2026-09-12`
- `brain:sessions/2026/09/rat-detective-case-sleeve-2026-09-12`
- `brain:sessions/2026/09/rat-detective-model-netplay-production-2026-09-12`
- `brain:sessions/2026/09/rat-detective-seam-pickup-hit-feedback-2026-09-12`

The later source receipt includes a hosted preview that the seam GBrain page's initial local closeout does not yet describe. Prefer the dated later evidence; missing memory text is not proof an action did not happen.

For general animation principles, [Disney's animation process](https://www.disneyanimation.com/process/animation/) describes timing, follow-through and secondary action. This supports the vocabulary, not a specific game amplitude or duration. The original research also cites noir/costume references; their recommendations remain subordinate to Tyler's accepted model.

## Expected next-agent deliverable

A small, reversible first animation candidate with movement and hat/ear polish, clear baseline comparison, focused evidence and an audible hosted gameplay preview. Explain what was improved versus what already existed. Preserve other tasks' changes and keep the scope visual. Do not reopen anatomy, outfit colors or empty-sleeve decisions, and do not treat this handoff as permission for an unrelated networking, rendering or model rewrite.
