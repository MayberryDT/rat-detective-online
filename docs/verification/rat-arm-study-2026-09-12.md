# Matching arms and three-way off-hand study — September 12, 2026

Tyler requested new matching arms/hands, three off-hand comparison options, and walking animation in the actual city environment. This continues the uncommitted outfit work. Production remains unchanged.

## Shared arm model

`RatArmModel.ts` supplies both arms: a continuous tapered/bent coat sleeve with closed shoulder, a rolled cuff sharing the existing highlight, and a compact palm with three curled fingers and a thumb. Each arm has three material meshes; palm/finger geometry is merged. Geometry is mirrored for handedness, with the same proportions and detailing. The pistol and case use different poses to reach their existing grips.

`RatModel` places the new pistol arm around its unchanged pistol pivot and muzzle. `CaseGrip` borrows the same coat/highlight/skin materials, places the matching sleeve around the existing carry anchor, and rotates the paw to fit the fore-and-aft case handle. Existing case transform, physical geometry and gameplay animation timings stay intact.

## Workshop options

[Character workshop](http://127.0.0.1:5196/model-preview.html), study 03:

- **Case**: arm and gripping hand carrying the real briefcase.
- **Empty hand**: matching arm with a relaxed empty paw.
- **No arm**: remove that whole off-hand arm. The pistol arm remains.

These options work with all palettes, local/opponent rendering, poses and environments. The selection is preserved in `hand=case|empty|none` URL state. Older `held=0` links open the no-arm option. Empty-hand permanence remains Tyler's decision; gameplay still creates its off-hand arm only while carrying a case.

**Street / Records → Walk cycle** now runs the real walk animation in place under actual city lighting and the shoulder camera. It stays active when switching environments. This uses an optional bounded animation-preview speed; gameplay callers still derive speed from real movement. Rat body/world position, camera location and lights remain at the selected inspection site. This is an art preview, not walking through the city or multiplayer/input testing. Studio still supports its existing walk preview and orbit camera.

## Validation and private preview

Typecheck and both builds passed (existing large-chunk build advisory). The focused carry/fit/appearance/armor checks and actual studio/remote-presentation checks passed. **941 tests passed: 137 Worker + 777 client + 27 scripts.** The hosted two-client check received eight rats in both welcomes, preserved selected highlights, decoded 1,689 frames and matched all 154 frozen source files.

A remote-presentation test assumed the old paw's immediate parent. It now checks the paw against the independent public hand/shoulder constants rather than mesh hierarchy. Studio tests exercise all three off-hand states, borrowed silver materials, disposal, and stationary city walking with a rigid, attached case. The street/Records walk test verifies visible carry swing while both body and root stay at the inspection site, then settles the animation on idle.

Browser art inspection covered all three options, close-up firing grip, front view and walking in Street/Records. No automated gameplay inputs. Evidence and logs: `output/arm-refinement-2026-09-12/`.

[Audible private human playtest](http://127.0.0.1:5193/?room=graybox-benchmark-match-outfit-r3) uses a frozen matching client/private Cloudflare Worker with production-owned bots and normal eight-participant backfill, capped at 16. Expires **September 12, 5:46 PM Pacific** (September 13, 00:46 UTC). Worker `933ef4e9-e07f-42ea-a468-729527d76a88`; receipt `output/hosted-capacity-deployment-2026-09-12T20-46-43-165Z/deployment.json`. Referenced credentials are private. This supersedes r2's frozen preview; the local workshop has no matching expiration.

Prior context: GBrain `brain:sessions/2026/09/rat-detective-workshop-refinement-2026-09-12`. No new palette choices, permanent empty arm decision, production release or Git commit.

**Superseded design:** Tyler rejected the connected/bent arms and real paws. The [floating sleeve correction](rat-floating-sleeves-2026-09-12.md) is the current direction; the tests and r3 preview above describe this historical intermediate study.
