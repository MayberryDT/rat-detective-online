# Character: model touch-ups and animation

Part of the [juice plan](../juice-plan.md), which owns status and order. Read
this before changing `RatModel`, `RatAnimator`, `RatActing` or rat materials.

**Goal:** a more expressive rat without changing who or what he is. He's a
composed noir detective whose dignity keeps getting knocked about: a brief,
readable reaction, then a quick return to composure. The comedy comes from the
hat, ears, whiskers, brows and tail, not from panic or swagger.

## Identity (fixed)

- **Outfit:** shared fedora, three-button coat, collar, shirt and tie, and the 1,024-appearance palette (hat × coat × highlight × fur).
- **Arms:** straight floating sleeves and cuffs, with no hands, fingers or elbows. The short gun sleeve pivots at the shoulder. The longer case sleeve appears only while carrying.
- **Case:** rigid, close to its accepted pose, with the grip exact.
- **Head and silhouette:** half-lidded eyes, round separated ears and the dragging tail. The shoulder-camera rear view stays recognisable.

## Model touch-ups

| Item | Intent |
| --- | --- |
| Whiskers | Thin, tapered, 2–3 per side on the muzzle. They bounce with movement, twitch when sniffing and droop when hit. |
| Eyebrows | Small fur-dark wedges above the half-lidded eyes. They squint while aiming, jump up when hit, give a restrained one-brow lift after a kill and a worried tilt at low health. |
| Eye tracking | Pupils shift toward the aim point or a nearby threat, plus a quick blink on impact (the existing blink cycle stays) |
| Muzzle and cheeks | Slightly rounder cheek volume; the nose catches a small highlight |
| Fedora brim | A little more edge definition (bevel or rim shading), not a new colour channel |
| Coat hem | Refined hem sway on top of the existing hem-to-hem motion |
| Cheese stains | A per-rat stain build-up surface for the [spec §2](feel-spec.md#2-impacts-and-hits) stains, capped and cleared on respawn |
| Shoes | Two small dark shoes peeking under the hem, with no legs. On by default, with a switch (Tyler, 2026-09-27). |

## Render-sheet gate

No model change reaches gameplay before Tyler approves its sheet. Build it from the
existing workshop ([model preview](../../test/visual/model-preview.ts),
`npm run visual:build`):

- Before and after, side by side, from front, three-quarter, side, rear and the actual shoulder-camera city view.
- Four palette samples; with and without the case; Ironclad metal; close-up and gameplay distance.
- Expression strip: neutral, aiming, hit, kill, low health.

Tyler marks each item keep, tweak or cut. Save the sheet under
`output/polish/character/` and record approved items in the drop's
`docs/verification/` receipt.

## Animation pass

The accepted September 12 set already covers starts, stops, turns, head/hat/ear/tail
follow-through, firing focus, jumps and landings, case weight, hits, reflections,
pickups, observant idle and deliveries (`RatAnimator` and `RatActing`). This pass
**builds on** that set and does not replace it:

| Item | Change |
| --- | --- |
| Squash and stretch | Head lifts on the jump and drops on a hard landing, with the ears following, on the same frame as the input |
| Skid | Head and hat lean back, with dust, on hard braking |
| Sneaky carry | Head ducked with over-the-shoulder glances while carrying. The case pose is unchanged. |
| Launcher flight | Tail streaming, ears flattened and the hat lagging. The gun arm keeps its real aim. |
| Idle fidgets | Sniff with a whisker twitch, ear flick, tail flick, head tilt and glances, on varied, per-rat seeded timing. Nothing needs hands. |
| Kill nod | A brief composed nod that tips the brim; no hand, no swagger |
| Hit reactions | Brows, hat knock ([spec §3](feel-spec.md#3-danger-and-death)) and a whisker droop layered on the existing hit reaction |
| Pickup reactions | Ironclad chest puff, Hot Pursuit bounce and Quick Fix relieved breath, on top of the existing reactions |
| Death variety | Cause-based ragdoll flavour with the hat pop-off |

**As built:** this pass moves only secondary parts (head, hat, ears, tail, whiskers, brows, shoes, pupils). The body carries the pistol and case, so their accepted trajectories stay exact; the frozen-trajectory tests (`locomotionPolish`, `ratActing`, `outfitStudio`) prove it. The accepted (non-polish) workshop mode is unchanged.

## Rules

- **Never slow or lock controls.** No movement lock, aim delay or finish-the-animation requirement. Reactions play while the player keeps moving and shooting.
- **Keep the muzzle true.** The weapon hangs under the body rig, so whole-body transforms move the muzzle. Keep projectile origin and barrel truth. Check with the `muzzlePose` and `gunSleeve` tests before and after, and prefer secondary parts (hat, ears, whiskers, brows, tail) for flourish.
- **Everywhere the rat appears.** Local and remote rats, outline shells, `RigidMeshBatch`, Ironclad materials and corpses must all show the change. Materials borrowed by sleeves are not disposed with them.
- **Clean resets.** Remote corrections, reconnect, death, respawn and launcher transitions reset cosmetic state without a wobble.
- **Performance.** No per-frame allocation. New parts join existing batches; draw calls per rat stay within the [performance budget](foundation.md#performance-budget).
