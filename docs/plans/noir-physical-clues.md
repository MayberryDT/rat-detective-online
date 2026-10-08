# P4 implementation plan: natural noir case evidence

Updated 7 October 2026. Thread: **[P4] Rat Detective physical clues**.

**Status: implemented locally on Halla; visual review pending.** Tyler subsequently said “implement it all.” Game-code commits `55489b0` and `bffa4d6` implement the document artwork, rendering, grounded stable routes and immediate anchored starter papers. See the [implementation receipt](../verification/noir-physical-clues-2026-10-07.md) for completed checks, actual artifacts and remaining limits. Staging and production have not been deployed.

## Outcome and authority

Every spawn provides an obvious physical lead. Multiple natural-looking paper clues continue along a traversable route to the real case. The documents feel like contents of one noir case file, stay grounded and visually stable during movement, and carry only a restrained red outline. Buildings and other opaque geometry hide them normally.

This plan owns the P4 replacement's implementation order and acceptance. Its evidence and rationale are in the [game-reference study](../research/noir-detective-clues-reference-study-2026-10-07.md). The [earlier rendering proposal](../research/natural-paper-plan-2026-10-07.md) is supporting history. The broader detective-mechanics follow-up in [implementation-plan.md](../implementation-plan.md) is separate: this slice does not select or implement a new game mode, hypothesis system or investigation interface.

### Settled requirements

- Multiple clues lead to the case every time, with a useful first lead on spawn. Preserve existing spawns; begin by fixing evidence placement and continuity.
- No seeing the case or papers through buildings. No arrows, off-screen case pointers or camera steering. Preserve unrelated destination guidance and separate existing abilities unless specifically directed otherwise.
- Natural paper with a thin red outline; preserve the established case-red language.
- A coherent case file with varied documents. Tyler endorsed this research direction; final artwork has not been produced or visually accepted.
- Fast multiplayer action continues. No mandatory reading, collection button, inventory puzzle, corkboard or inspection lock.
- Historical-travel-only trails and the old three-cluster limit are superseded by Tyler's later spawn-to-case requirement. Do not restore them from October 6 research.
- Preserve real case pickup authority, prior ghost-case repair, bot/human information parity, weapon rules, no mode timers, packed storage and human-seat room hibernation.

## Recorded baseline and unresolved findings

Last recorded staging candidate: source `e862f87`, receipt commit `6d5701d`, build `staging-2026-10-07-e862f87`, Worker `6a508a1a-44cf-4a2b-8748-62a953c9d90b`, client `index-CpqviDK1.js`, protocol 35. See [physical-clues receipt](../verification/physical-clues-2026-10-07.md). These are recorded identifiers, not a fresh runtime check.

The staged treatment repeats two paper shapes, five ink strips and a symmetric V bend. Papers occur at regular route intervals with cardinal placements near rats. Earlier browser checks established presence, reconnect behavior and removal of the orphan case echo; Tyler rejected the appearance and reported flicker. Presence is not visual acceptance.

The inspected rendering separates ink, paper and red rim by tiny depth offsets. Whole clusters are culled from a center point and sight ray. Nearby route lists and selection budgets can also change the visible set. These are candidate causes of shimmer or popping, not an isolated root cause.

Before future execution, inspect only relevant worktree changes and confirm this source baseline. Do not reset dirty files, resume Nova sessions, create replacement workers or migrate the checkout.

## Art specification

Author four related document families. Keep artwork original and consistent with the existing simplified city and rats; external games are references, not assets to copy.

| Family | Playing-distance identity | Optional close detail | Shape |
| --- | --- | --- | --- |
| Witness statement | Full page, heading and uneven text block | Typed statement, signature line | Mostly flat, occasional dog-ear |
| Evidence inventory | Ruled columns and numbered entries | Precinct mark and shared case reference | Shallow fold or crease |
| Harbour receipt | Narrow strip with short entries | City business, date and amount | Slight end curl |
| Photograph with note | Dark image inside a pale border | Original city image and annotation | Stiffer, flatter stock |

All share a small file mark that relates to the case's evidence tag. Recognition must work without reading that mark. Text is flavor; the route is understandable at running speed. Exact wording and image choices remain implementation details to review with the art sample.

Use grey-white, off-white and subdued cream stock, matte surfaces and charcoal ink. A few specific creases or handling marks provide character. Avoid universal sepia staining, noisy distress, identical tears and repeated tent-like folds. Most placements are single sheets; occasional authored pairs and a small case spill provide variation. Overlapping sheets must not intersect.

The outline follows the visible sheet perimeter. It is steady, quiet and depth-tested, without bloom, pulsing, expanding rings or scene illumination. The paper itself receives existing scene lighting. A minimal red-only visibility floor is an implementation option, not permission to make the whole sheet emissive. No ambient flapping or floating-paper effect is needed for the first sample.

### Readability hierarchy

- Normal play distance: visible paper silhouette and recognizable red edge establish the next lead.
- Medium distance: document proportions and print layout distinguish families.
- Close distance: restrained content, fold and ink details reward looking.

Approve size against the rat, pavement and real shoulder camera. A close-up beauty image alone is insufficient. Thin print may blend at distance; the sheet must not shimmer or disappear because its fine details are undersampled.

## Trail behavior and placement

### Spawn and route continuity

Place the first small asymmetric arrangement on visible, supported ground in or near the initial view. Verify the actual camera, floor and occlusion; distance alone is insufficient. Continue along the existing valid route. Do not surround each player with identical piles in four directions.

Vary spacing and lateral placement within a bounded, verified walkable corridor. At corners and junctions, place the last visible clue so advancing toward it reveals the next. Do not manufacture arrow shapes with pointed pages or perfectly aligned orientations. At stairs/sewers, use the actual ramp or landing, with evidence before and after the visible transition. Reject wall, water, unsupported and wrong-storey placements.

Keep existing spawns. If a spawn cannot supply a visible valid lead under these constraints, record the precise location and failure; do not silently relax occlusion or claim an invisible nearby clue satisfies the requirement. Fix local placement first. A spawn-layout change would be a separately reviewed scope change.

### Stability and a moving case

Keep deterministic art selection, orientation and transforms tied to stable clue identity. Unchanged route segments retain their papers. Walking across a route-window boundary must not reseed the local scene. Use a stable render selection policy so small distance changes do not repeatedly swap equally eligible clues.

When the case moves, preserve useful shared segments and replace only guidance that needs to change. Invalid routes must stop misleading the player; cosmetic persistence cannot override current authority. Case relocation, round reset and reconnect must remove obsolete guidance and restore the correct current route without replaying old visual events.

A generated route to a moving target is not literal historical evidence. Keep that distinction explicit. A real case drop/knock can create a truthful local spill; no new forensic-history simulator is required. Do not add directional age/order information to bots beyond the shared visible information available to players.

At the case, use matching documents sparingly to connect the trail to the real pickup. Preserve the ghost-case fix; no separate case-looking marker may survive a reset or reconnect.

## Native implementation and file responsibilities

| Area | Expected work | Limit |
| --- | --- | --- |
| `src/prototype/CaseFiles.ts` | Shared artwork/materials, varied sheet meshes, stable instances and visibility | No per-paper lights, physics, texture allocation or whole-frame outline pass |
| `src/shared/caseClues.ts` | Supported irregular placement, stable route identity, valid current-case continuation | Bounded route work and shared authoritative information |
| `GameSession.ts` clue visibility integration | Separate visual occlusion from center-point whole-cluster rejection | Preserve bot sight rules; GPU depth stays enabled |
| `NoirCity.ts` integration | Explicit adoption of later-created clue materials | Reuse existing dynamic-object support |
| Game creation/disposal path | Warm required resources and release scene-root objects on rebuild | No reconnect leaks or new long-lived services |
| Existing recording and E2E paths | Minimal necessary clue facts and reproducible motion evidence | No raw credentials, per-frame database logging or parallel telemetry system |

Use a shared authored atlas and simple low-poly meshes. Static original artwork or one-time Canvas2D composition are both valid; pick the simplest way to achieve the approved visual. The renderer already supports CanvasTexture. Native implementation does not mean generating all artwork from primitive rectangles at runtime.

Put paper, ink and perimeter on the same surface. Use a rough lit material and, only if needed, a red-only emissive mask. Share resources across a small number of instanced shape batches. Avoid separate near-coplanar ink/rim geometry. Prefer opaque modeled edges; consider alpha-tested cutouts with MSAA alpha-to-coverage only where needed. Avoid noisy alpha hashing and overlapping alpha-blended pages.

Use padded atlas tiles, mipmaps, correct color space and capped anisotropy appropriate to the hardware. Judge at the game's reduced render scale as well as native resolution. Decals remain an optional technique for truly flat litter, not a dependency of this slice.

Probe support and surface orientation for the sheet footprint. Keep folds small and contacts believable. Use depth testing for partial occlusion and bounds-aware visual selection. Do not substitute `renderOrder` or disabled depth testing for correct geometry.

Do not change global camera clipping, antialiasing or lighting speculatively to repair paper. First isolate the responsible mechanism locally.

## Implementation sequence and review artifacts

P4.1 source findings and baseline/candidate captures are recorded; the exact cause of every previously reported flicker is not claimed. P4.2 artwork/materials and P4.3 route/placement changes are implemented. P4.4 automated integration, browser and lifecycle evidence is recorded. Human visual/navigation acceptance and an isolated steady-state performance comparison remain unclaimed. The phase descriptions below retain the intended verification contract; the receipt distinguishes what was actually observed.

### P4.1 — Establish the motion failure

Use the existing implementation in a bounded local/private diagnostic scene on Halla. Capture standing still, slow pan, walking past a wall corner and a moving case. Compare a fixed clue list with the live list; separately bypass center-ray visual culling while retaining GPU depth. Record clue IDs, transforms and visibility reasons with the clip, without persistent per-frame service writes.

Deliver a short diagnosis table linking observed symptom to evidence. Distinguish subpixel shimmer, depth competition, whole-object culling, route replacement and budget churn. Do not declare a single root cause from a still image.

### P4.2 — Produce the art and material sample

Implement the four document families and restrained shape variants on stationary placements in the actual city/material path. Use the shoulder camera plus a close inspection view. Compare lamp-lit street, shadow and Blackout; capture native and reduced render scale. Warm and dispose resources through the existing lifecycle.

Deliver labeled normal-distance stills and a repeatable 20–30 second movement clip. Include the old treatment for a fair comparison. Record draw calls, texture memory and frame timing against the baseline, with hardware, viewport, settings and scene held constant. Do not invent a performance budget before measuring the baseline.

### P4.3 — Integrate stable routes and grounded placement

Replace repeated/cardinal arrangements while preserving valid route generation and the guaranteed first lead. Preserve stable identities and unchanged segments; validate transitions and moving endpoints. Keep art selection deterministic between receivers and reconnects.

Deliver a spawn-to-case traversal through a corner and sewer transition, with current case state matched to the recorded route. Exercise all ten participants for route/wire/render bounds without expanding runtime indefinitely.

### P4.4 — Complete E2E verification and present for review

Use existing real-browser E2E mechanisms. Agent joins use the established agent marker and must not become human analytics or activate Jev. Keep runs bounded and ensure the room returns to its expected idle behavior afterward. No new unit-test suite; any isolated system experiment first lists failure scenarios.

Produce one receipt that records exact source/build identifiers, scene setup, repeatable commands, clips/stills, measured results and remaining limits. Clearly separate automated outcomes from human visual/navigation judgment. An unbriefed viewer should find and follow the lead; if no such observation occurred, mark it pending.

The next visual deliverable is the small motion sample, before another staging replacement. Tyler reviews the actual appearance; this plan does not authorize a new deployment or claim the existing art is accepted. Production promotion remains subject to its existing release boundary.

## E2E acceptance matrix

| Scenario | Required result | Evidence |
| --- | --- | --- |
| Fresh spawn, stationary distant case | Immediate visible first lead; continuous useful route | Initial shoulder view and uninterrupted traversal |
| Corner/junction | Next clue becomes visible by normal movement; no whole-cluster blink | Moving-camera clip with fixed state comparison |
| Street-to-sewer and reverse | Supported papers on correct route/floor | Both transition traversals; include prior sewer regression location |
| Slope, curb and overlapping pair | Grounded sheets; no intersections or depth sparkle | Oblique moving-camera close and play views |
| Native and reduced resolution | Stable edge and plausible paper; distinct families | Matched camera clips/settings |
| Lamp, shadow, Blackout | Consistent world lighting and usable clue treatment | Matched views without exposure tricks |
| Moving carrier, drop, relocation, reset | Current useful guidance; stable unchanged segments; no old endpoint retained | Authority/ID trace beside video |
| Two receivers and reconnect | Consistent identity/art; correct reconstruction; no orphan scene-root objects | Paired observations and reconnect recording |
| Real loose case | Trail reaches the actual collectible case; no ghost echo | Walk-to-pickup through normal gameplay |
| Full participant count | Bounded route cost, packet size, render budget and memory | Baseline/candidate measurements under same conditions |
| Opaque wall | Covered paper/case stays hidden; visible portions remain correctly drawn | Partial and full occlusion clip |
| Unbriefed observation | Player notices first lead and follows it without location coaching | Observation notes; otherwise explicitly pending |

Reuse the prior failure inventory where present, including spawn near `(90, 0, -150)` and sewer case near `(-4, -7, -4)`. Record valid coordinates against the actual source before execution; do not assume layout facts remain unchanged.

Gameplay changes must emit the facts required by [the city-map contract](../city-map.md). Reuse existing records where sufficient; add only facts needed to distinguish route availability, first usable lead and relevant case transitions. Any new schema/transport requirement must be documented with its compatibility handling. Do not bump protocol for artwork alone. Bump `layoutVersion` only if an actual layout adjustment occurs, rather than calling rendering placement a city overhaul.

## Host, artifacts and scope boundaries

Implementation checkout: `/home/halla/workspaces/rat-detective-physical-clues`, via `ssh halla`. Existing Veelox canonical documentation remains at `/home/tyler/Projects/rat-detective`. Keep both copies of this plan aligned without overwriting unrelated host-specific changes.

Future build/test/media output belongs under `/home/halla/build/rat-detective/`, in a dated run directory. Store source, settings, camera/room fixture, commands and outcomes in the receipt so the result can be repeated. Link selected review artifacts from local docs when available; none are fabricated in this plan.

Do not restart workers, migrate checkouts, publish, deploy or modify unrelated project plans as part of this documentation task. No new lights, paper physics, shader framework, paid assets, new game mode, ambient paper storm or global visibility rewrite is needed.

## Questions to resolve during implementation, not a new design questionnaire

- Which flicker mechanisms reproduce in the controlled motion capture?
- What sheet scale, filtered edge coverage and atlas resolution remain convincing at normal and reduced render scale?
- How much route identity can the existing planner preserve without growing its cost or keeping invalid guidance?
- Which spawn/transition sites need a placement exception, if any?
- Does the minimal red-only visibility floor help in Blackout without making the object feel luminous?

These are bounded experiments within Tyler's endorsed direction. No further choice between six clue identities is needed. The implementation is now available for review through the receipt and actual art/motion artifacts. The next experiential decision is acceptance of this candidate's appearance and navigation clarity.

## Reference lessons retained in the plan

The [full study](../research/noir-detective-clues-reference-study-2026-10-07.md) contains dated primary-source links and evidence limits. L.A. Noire informs meaningful documents; Shadows of Doubt informs city-specific evidence; Alan Wake II informs clear small deductions; Obra Dinn informs temporal visual checks; Ghost of Tsushima informs environmental integration and contact; Pentiment and Papers, Please inform authored document variation and presentation scale; Alien: Isolation informs coherent physical source art; Chicken Police informs animal-noir tone; Golden Idol informs unbriefed observation. These lessons support design choices, not claims that another game's exact renderer or gameplay should be copied.
