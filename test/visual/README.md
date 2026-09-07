# Visual verification

`npm run visual:build` builds separate test pages, excluded from production assets. `npm run smoke:visual` captures five states and compares them against checked-in images. Missing Chrome or baselines fails the command. Record updates only after reviewing the changes: `UPDATE_VISUAL_BASELINES=1 npm run smoke:visual`.

Serve `dist-visual` locally to inspect `/visual-fixture.html?seed=20260905&state=alive`. States: alive, turned, damaged, dead, respawn. Every state starts with fresh entities and seeded randomness; death advances the actual animation and Cannon simulation for 600 ticks. The dead-state camera follows the corpses. Respawn exercises the complete death transition first. Visible status reports readiness, seed, state, and renderer resources.

`/performance-fixture.html` compares the same seeded city, camera, lighting and three rats with instanced scenery and equivalent separate meshes. Each mode has 60 warm-up and 300 measured frames. It reports draw calls, triangles, frame intervals and CPU render-submission time. These timings are not GPU timings; batching can increase submitted triangles because culling works per batch.

## Historical rat comparison

To render the original rat implementation inside the same fixture/world:

```bash
mkdir -p .wrangler/visual-reference
git archive 08e8005 src | tar -x -C .wrangler/visual-reference
VISUAL_REFERENCE=1 npm run visual:build
VISUAL_DIST=dist-visual-reference VISUAL_OUTPUT=test-results/visual-reference npm run smoke:visual
```

On 2026-09-06, alive/turned/damaged/dead were pixel-identical to the original. Respawn differed by 0.6985% of pixels, consistent with restoring the missing outline. A tolerance-based image comparison alone does not protect outline opacity: presentation unit tests explicitly assert it. See `docs/verification/rat-reference-comparison.json`. Normal current-fixture repeat captures were pixel-identical for all five states.

## Cheese-pistol model and animation preview

Build with `npm run visual:build`, then serve `dist-visual` (for example,
`python -m http.server 5180 --bind 127.0.0.1 --directory dist-visual`). Open
`/model-preview.html` for a close-up hero with Carry / idle, Walk, Fire pistol,
Take hit, Defeat, Reset, Rotate view, and Hat controls. Wide panels include the approved reference image.
The preview uses the actual entity and animator with studio lighting; the existing
city fixture checks gameplay lighting. The reference image is included only in
this separate visual build, not the production game assets.

The model follows `assets/concepts/rat/cheese-guns/01-cheese-pistol.png`: continuous
coat and muzzle geometry, a wider shaped fedora with cream band, round ears,
half-lidded eyes, solid raised collar and fitted lapels, small cuff/paw, and a
beveled cheese pistol with actual cutout holes. All three hats and configurable
coat/fur/hat colors remain supported. The outline is now 1.2cm at 10% opacity,
with 0.12 emissive intensity; lapel and ear outlines are hidden to avoid overlapping edges.
The face sits deeper inside the raised collar under a lower, forward-tilted brim.
Smaller ears share the hat pivot, with their bases above the side brim and outside
the crown so secondary motion preserves their clearance. Geometry regression tests
check brim and crown clearance across all three hats during walking and recoil.

Named visual pivots support breathing, blinking, ear twitch, the strengthened
walking bounce/lean, tail follow-through, and pistol carry/aim/recoil. Local and
replayed shots raise the paw. The arm holds aim briefly then eases back to carry.
Projectiles now launch at the visible muzzle, retaining speed, gravity, damage,
ricochet, and resolved network replay behavior. Respawn resets the pose.
Alive animation does not move the physics body or entity root. Hits blend a brief
cream highlight into a warm tint while retaining dark facial details and the
original material colors, with a small compression/rebound and hat follow-through.
Defeat is a physical launch, tumble, contact bounce, and roll to rest. Its torso
center of mass applies only while dead; respawn restores all alive collision
shape offsets and settings. Spring motion responds to angular velocity, gravity,
and collisions in the head, hat, arm, and flexible tail. There is no timed snap
to a flat pose. Contact sounds track actual impacts. The preview follows the
ragdoll's center and Reset restores the character.


Five visual baselines were reviewed and refreshed on 2026-09-07. The three-rat
turned fixture at the initial pistol rebuild reported 386 draw calls and 42,332 triangles (scene totals), compared
with 344 / 17,256 for the first model upgrade and 302 / 13,800 for the original.
These are rendering workload counts, not GPU timings. Physics collision shapes
and movement speed remain unchanged. Client tests cover barrel-based aiming,
projectile physics/replay, animated outline alignment, and resource disposal.


## City art preview

`/city-preview.html` shows the actual seeded city with Street, Corner, Skyline,
and Orbit controls, plus the finished rat for scale. The building footprints,
heights, road layout and physics bodies still come from the same WorldSpec.

The city upgrade adds framed window textures with separate emission, stone
cornices and corner trim, double doors and canopies, tiled sidewalks and curbs,
crosswalks, drains, textured asphalt, stepped lantern poles and soft warm pavement
light pools. Repeated details share instanced batches. Pools are decorative glow
meshes; they do not add a point light for every lamp. Moonlight and ambient fill stay deliberately low: near-black purple silhouettes
with sparse gold, cream, icy blue and occasional coral windows. Warm lantern pools
provide local contrast. The earlier bright facade/paving treatment was rejected
as off-theme; retain geometry details without broadly illuminating the city.

The turned gameplay fixture reports 394 draw calls and 130,536 triangles after
this pass (scene totals, not GPU timings). Collider agreement, repeatable seeded
scenery and complete texture/material/geometry disposal are covered by tests.


## Cheese balls, impacts, and city add-ons

`/cheese-preview.html` offers Fire, Slow motion, and a rotating Cheese close-up.
Projectiles remain spherical cheese balls with the original 0.15 radius and shallow
visual dimples. Spin and a small uniform compression are cosmetic. Preserve the
fine-tuned 175 speed, -25 gravity, 0.9 restitution, five-second lifetime, raycast
collision handling, damage, and resolved network trajectories.

Impact effects use bounded shared resources: up to 160 small round crumbs and 40
temporary surface splats. Crumbs expire within 0.8 seconds and splats within three
seconds. They add no collision bodies or aim targets and clear on projectile reset.

City add-ons include dumpsters, bins, crates and occasional fire escapes, all
batched decorations. Their independent decoration RNG preserves established window
and lamp placement. CityGenerator.update drives occasional lantern flicker,
individual window changes and faint drain steam; gameplay and the city preview
call it without touching the collision layout. Street props provides a close-up.
