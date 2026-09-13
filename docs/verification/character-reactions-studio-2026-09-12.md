# Character reactions — September 12, 2026

**Subsequently released:** Tyler accepted the corrected gameplay preview and
requested everything committed and published. See the
[production receipt](animation-production-2026-09-12.md). The preview-stage
measurements and scope below are historical.

**Later gameplay acceptance:** Tyler approved the animations in gameplay and
requested explosion self damage plus investigation of a delayed Chain of Custody
delivery before release. The animation preview below is superseded by the
[explosion/delivery follow-up](explosion-delivery-2026-09-12.md) on the same port.
Production remains unchanged; the earlier receipt below remains historical.

## Subsequent acceptance and hosted gameplay preview

Tyler loved the exaggerated revision and requested applying all animations and
starting a preview game. This supersedes the earlier pending studio acceptance and
instruction to defer a gameplay preview. All reactions were already enabled in
working game source; the studio now labels them **Full reactions · accepted**.
Production remains unchanged and no commit was requested or made.

[Audible gameplay preview](http://127.0.0.1:5197/?room=graybox-benchmark-match-animations-r1),
expires **September 12 at 9:24 PM Pacific**. Private Worker
`rat-detective-capacity-test`, version `3a85be2f-5dc5-43c8-bca0-46fbc1d24581`,
protocol 15, serves the hosted authority. Local user service
`rat-detective-animation-preview.service` serves its frozen matching client on
port 5197. Production matchmaking/backfill remains eight total rats when playing
alone, with bots yielding as humans join and a 16-rat cap. Full-lobby stress and
checkpoint-control overrides are off. No browser bots or local workerd are used.
The replaced model/junction relays on 5193/5195 were stopped after verification;
the studio on 5196 remains available.

Validation for handoff: fresh application build and private deployment dry run
passed. The unchanged application retains the preceding **1,006 passing tests**,
typecheck and visual build evidence; those tests were not needlessly rerun for
acceptance/deployment. A separate private protocol pool verified eight-rat welcomes,
seven server bots with one human and six with two, 1,398 decoded frames, preserved
palette highlights and all four junction medkits. All **56 served assets** and
**158 original source hashes** match the frozen receipt. Private health matched
fixture/expiry/cap and rejected unauthenticated access. No movement/firing/browser
gameplay automation or new performance benchmark was run. Human playtest is audible;
subjective gameplay feel and event timing await Tyler's feedback.

Receipt: `output/hosted-capacity-deployment-2026-09-13T00-24-01-914Z/deployment.json`.
Verification: `output/animation-gameplay-2026-09-12/private-verification.json`.
The UTC receipt date is September 13; the user-local date is September 12.
The earlier reports below retain their historical scope and measurements.

Tyler authorized all 15 proposed reactions after accepting the preceding movement
pass. This is an **uncommitted studio candidate**, enabled in working game source.
The new reactions await his review. His instruction remains: finish animations
before preparing a private gameplay preview. No gameplay preview, hosted Worker,
service restart, production deployment or commit was made for this pass.

## Readability revision — subsequent September 12 feedback

Tyler could not see a meaningful difference in the first full pass and explicitly
requested significant exaggeration of every animation. That subtle candidate is
superseded. The current studio mode is **Full reactions · exaggerated** (the same
`animation=full` URL); the approved movement-only comparison keeps its old gains.

- Main event angles are roughly four to six times larger, with bounded overlap:
  pronounced head nods/tilts, folded or spread ears, hat pitch and larger eye changes.
  Firing focus and Hot Pursuit now change head posture as well as face/ears.
- Event durations increased from .16–.55 seconds to .36–1.05 seconds, with a brief
  peak hold and smooth recovery. Repeated armor accents have a longer cooldown.
  No action waits for these cosmetic times.
- Airborne tail lift, idle/case/heal/delivery tail gestures, and stronger start/stop/
  turn follow-through make the changes more readable from behind. Idle glances
  last 1.6 seconds and begin earlier, while remaining sparse and interruptible.
- Equipped case start/stop/turn accents increased about seven to nine times; the
  existing periodic swing stays unchanged. The handle remains exact and rigid.
- **1,006 tests pass** (140 Worker, 839 client, 27 scripts), plus typecheck and both
  builds. Frozen `SubtleRatActing.ts` comparisons require at least three times the
  previous angular excursion for each event and sustained air/hustle/idle behavior;
  every event keeps a >.12-radian gesture for over .18 seconds. All original
  muzzle, grip, model, outline, batching, lifecycle and resource checks still pass.
  Updated bounds permit the requested larger poses; frozen weapon checks were
  not loosened. Logs: `output/animation-exaggeration-2026-09-12/`.

This revision changes presentation only, preserves the other working-tree edits,
and remains studio-only for human feedback. No gameplay preview or production
deployment was made. The sections below record the initial implementation and its
validation; their smaller timing/amplitude descriptions are historical.

## Implemented acting

| Study | Added behavior |
| --- | --- |
| Focused firing | Eyes narrow and decorative head sway quiets during a burst. Existing immediate weapon recoil stays intact. |
| Single shot | Small hat pitch and unequal ear recoil, bounded during repeated shots. |
| Jump takeoff | Brief swept-ear and hat accent as ascent starts. |
| Launcher surprise | Larger, short ear response, widened eyes and a tiny hat lift on a confirmed launch. |
| Ascent / apex / descent | Hat and ears follow presented vertical speed; tail lift releases through the apex. |
| Landing recovery | Brief head/ear/hat response scaled by preceding descent, during continued movement and firing. |
| Carried-case weight | Small start/stop/turn changes at the existing carry anchor, only while equipped. Sleeve and rigid case move together. |
| Case pickup | Small ear/eye acknowledgment after confirmed ownership changes. |
| Case knocked away | Brief head tilt and annoyed eyes/ears on confirmed loss. |
| Nonlethal hit | Restrained directional head/hat flinch alongside existing hit presentation. |
| Ironclad reflection | Small impact accent, rate limited during repeated reflections. |
| Hot Pursuit | Swept ears and quieter tail wave while moving with the actual buff. Existing red effects remain. |
| Quick Fix relief | Short head/ear relaxation on an authoritative health increase, alongside the existing green wave/card. |
| Observant idle | Sparse asymmetric glances and ear movement, canceled by activity; independently phased blinks. |
| Assignment delivery | Short nod on confirmed delivery, suppressing the simultaneous case-loss reaction. |

These extend existing procedural motion. `RatActing.ts` owns bounded scalar outputs
with no per-frame allocations or gameplay RNG calls. Events replace pulses rather
than queue or accumulate them. Combat suppresses small acknowledgments. The
existing animator remains the sole rig transform writer, including outlines and
batched opponents. `RatReactionEvents.ts` bridges confirmed outcomes. Duplicate,
stale and initial/rebased snapshots do not replay ownership or launch performances.
Reflection shot results use bounded deduplication. Motion rebases clear flight;
death, respawn and round reset clear acting. Explicit local corrections now call
the existing motion-history reset.

## Preserved boundaries and limitations

- Model, palette, centered seam, camera, weapon-bearing body, muzzle trajectory,
  shot cadence, authority, collisions and controls remain intact. The carry anchor
  is the deliberate equipment-motion change; the case stays rigid with an exact
  handle grip, and an empty hand has no sleeve.
- No root motion, control lock, camera bob, new mesh, live light, cloth simulation,
  projectile or protocol change was introduced.
- Nonlethal damage messages provide attacker ID, not impact normal. The cosmetic
  flinch uses the attacker's presented position when available. This approximates
  direction, especially for ricochets; absent attackers give a neutral flinch.
- Direct reflected-shot results identify the protected rat exactly. Broadcast
  armor impacts only provide a point, so their cue requires exactly one nearby
  living protected rat; ambiguous contacts are skipped. This can miss an observer
  reaction and does not change authoritative collision attribution.
- The preceding dirty seam, pickup-card, hit-feedback and junction changes remain.
  A starting-file hash inventory is retained in the local output directory.
  Unrelated starting files matched exactly; edits to shared files retain earlier
  changes. The approved movement animator was frozen separately in
  `test/visual/reference/MovementRatAnimator.ts` before this pass.

## Studio review

[Open full character reactions](http://127.0.0.1:5196/model-preview.html?model=latest&animation=full&motion=reactions&reaction=burst&hand=none&view=three-quarter&environment=studio&presentation=local&mute=1).

The existing workshop service serves source on port 5196. Select **Full character
reactions · candidate**, then choose a reaction and **Play reaction**, or use
**Review all** to cycle through all 15. **Half speed**, Pause and camera presets
help inspect accents. Outfit or presentation changes restart the current study;
case labels follow its actual carry state. **Approved movement polish** remains
`animation=candidate`; **Previous animation** remains `animation=accepted`.
Original-model selection still changes geometry only.

Studio trajectories are illustrative, explicitly labeled art stimuli. They use
actual entity/rig/carry presentation without physics stepping or gameplay inputs.
Street and Records remain art views with actual city lighting and shoulder camera.
The workshop stays muted.

## Validation

- **993 tests pass:** 140 Worker, 826 client and 27 scripts. Typecheck, application
  build and visual build pass. Both builds retain the existing large-chunk advisory.
- Focused regressions exercise all 15 studies on local and batched opponents,
  finite transforms, unchanged physics position, exact case grip, unit case scale,
  absent empty sleeve and resource disposal.
- Frozen accepted and approved-movement comparisons preserve complete
  body/weapon/muzzle transforms and immediate repeated shots. Existing varied-dt,
  seam, power-up, remote/launcher and anticipation-rollback checks pass.
- New checks cover equal-time decay at 30/60/120 Hz; burst/impact bounds; cosmetic
  RNG isolation and idle interruption; high launches at 30 Hz; interpolation-noise
  landing rejection; rebase/death/reset cleanup; confirmed-event/reconnect handling;
  and visible/outline agreement for all new events. The rigid-batch vertex
  regression now exercises every event as well.
- Muted browser art inspection exercised the review sequence, local/opponent
  switching, front/rear/three-quarter views, carrying and empty silhouettes,
  Hot Pursuit and Ironclad, plus Street/Records shoulder-camera presentation.
  No automated gameplay input test, hosted playtest or new performance benchmark
  was run. Logs: `output/character-reactions-2026-09-12/`.

Tests establish these invariants, not equal complete legacy poses at every frame
rate or subjective animation quality. Tyler's studio feedback is next; gameplay
feel and observer event timing remain for the later human playtest.

Prior context: `brain:sessions/2026/09/rat-detective-animation-polish-studio-2026-09-12`.
See the [movement receipt](animation-polish-studio-2026-09-12.md) and
[animation handoff](../handoffs/animation-polish-2026-09-12.md) for boundaries and
linked research. The later user authorization expands the handoff's initial scope
and defers its gameplay-preview step.
