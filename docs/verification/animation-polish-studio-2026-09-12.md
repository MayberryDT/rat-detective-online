# Movement animation candidate — September 12, 2026

Tyler selected four related animations: starts, stops, sharp turns and reactive
ears, then authorized implementation for **studio review first**. This is an
uncommitted candidate. No private Worker, gameplay relay or production deployment
was made; existing hosted previews do not include this animation candidate.

**Subsequent studio acceptance:** Tyler reviewed the sequence, said it looked
good, and asked to apply this pass and decide what comes next. The polished
animation is already the default in the working game source. Studio labels now
distinguish **Approved movement polish** from **Previous animation**; the existing
query values remain compatible. Tyler clarified the destination is a private
gameplay preview, **but not yet**: finish the animation passes in the studio first.
Do not prepare or deploy a new preview now. Production remains unchanged.
Studio acceptance does not establish gameplay feel.

## Changes

- Retained the accepted body lean and walk rhythm, while countering more of their
  motion in the head. The head stays calmer during starts, stops and turns.
- Reduced the hat's recurring walk wobble. Fast/slow velocity followers give it
  a bounded pitch accent at starts/stops and restrained turn lag. Each isolated
  start/stop accent returns without spring oscillation.
- Added unequal left/right ear responses to those same movement changes. No new
  firing, landing, idle or case-weight performance was added.
- Retained the existing tail wave and deformation machinery. Its movement/turn
  envelope follows motion directly and settles more slowly than the hat/ears.
  Corrections, motion rebases, death and reset clear the new follow-through state.

The weapon-bearing body, pistol, gun sleeve and carry anchor retain the accepted
transforms. Geometry, palette, centered seam, exact case grip, camera, controls,
shot timing and authority remain intact. No additional mesh, light, gameplay RNG
or per-frame allocation was introduced by the production follow-through helper.
The preceding uncommitted seam/pickup/hit-feedback/junction changes were preserved;
all pre-existing dirty file hashes matched before appending this documentation.

## Studio review

[Open candidate with movement sequence](http://127.0.0.1:5196/model-preview.html?model=latest&animation=candidate&motion=sequence&hand=case&view=three-quarter&mute=1).
The existing `rat-detective-outfit-studio.service` serves the source on port 5196;
no service restart was needed. This is a muted art fixture, not a gameplay test.

The **Animation** selector compares the accepted animation and candidate on the
same model. Switching restarts the sequence. **Movement sequence** loops ready,
start, left turn, stop, start, right turn and stop in place. Pause and Fire pistol
remain available, as do manual Idle/Walk, the camera presets, Case/No case,
Local/Opponent, Ironclad, and Street/Records environments. The sequence changes
only presented art poses; it sends no input or network action. `model=original`
continues to mean the older geometry, not the accepted animation baseline.

## Evidence

Before edits, the complete animator was frozen as
`test/visual/reference/AcceptedRatAnimator.ts` (only class name/import path adapted).
Original source SHA-256:
`823e455551fd41bfe148196fbe3eb0b2343a202a4d4377bfd4d9567c2ce5e026`.
It is a test reference, not an application import.

- **54 focused tests pass**, including frozen accepted affine transforms for the
  body, weapon, muzzle, shoulder, sleeve grip and carry anchor under varied frame
  durations, turns, vertical changes, repeated immediate shots and reset. The
  disabled candidate also matches the frozen head/hat/ear/tail transforms.
- New tests check a single signed settling accent, slower tail recovery, identical
  follower values at equal elapsed time at 30/60/120 Hz, finite bounded transforms
  under irregular/invalid dt, visible/outline agreement and correction/rebase/death
  cleanup. Existing rigid-batch vertex, grip, power-up, seam, resource ownership,
  remote/launcher and case-anticipation rollback regressions pass.
- `npm run typecheck`, `npm test`, `npm run build` and `npm run visual:build` pass.
  **972 tests**: 140 Worker, 805 client and 27 script. Both builds retain their
  existing large-chunk advisory. Logs are in `output/animation-polish-2026-09-12/`.
- Muted browser art inspection covered the studio front, three-quarter, side and
  rear; accepted/candidate selection; carrying and empty silhouettes; local and
  batched opponent rendering; Ironclad; and Street/Records shoulder-camera views.
  No browser gameplay/input test was run.

The equal-time check establishes the new follower math, not identical complete
legacy animation at every frame rate. Tyler accepted the studio appearance;
gameplay feel remains a separate human judgment. Do not widen the animation set
without his direction.
