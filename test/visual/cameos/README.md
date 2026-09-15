# Superhero rat model study — September 14, 2026

**Game integration follow-up:** the accepted models and animations now live in
`src/assets/cameos` and `src/cameos` for the private game candidate. This page
retains the art-study history. See
[the integration receipt](../../../docs/verification/superhero-cameos-2026-09-14.md)
for current world placement, triggers and verification. The art viewer remains
standalone; the exporter updates both asset copies.

Tyler requested two 3D cameo models to inspect: Spider-rat for the tallest roof,
Bat-rat for a hidden sewer spot. This is a standalone, silent art study. It does
not place characters in the city, run gameplay, join a room, or change production.

Open `http://127.0.0.1:5196/cameo-preview.html?mute=1` on the existing visual Vite
server. Drag either view to orbit; scroll to zoom. Camera presets, turntable and
a noir lighting comparison are available. Idle starts automatically unless the
browser requests reduced motion. Choose Idle, Someone walks by or Shot at, then
replay, pause, scrub or use half speed. GLB downloads include all three clips.

`CameoRatModel.ts` authors both models in Three.js 0.182.0. It clones the actual
game rat's continuous cheek/muzzle geometry from `src/utils/RatModel.ts`; other
costume geometry is independent. Named head, ear, eye, cape and tail groups remain
editable. Shoulder, elbow and wrist joints preserve the accepted resting
geometry; static details are merged within each joint. GLBs include portable
node-transform animation clips, baked at 30 samples per second from exactly the
same poses used by the viewer. They do not require skeletal skinning.

- Spider-rat: grounded crouch, red/blue suit, white lenses, geometry webbing,
  spider emblem, exposed round ear interiors and pink tail. 22,580 triangles,
  25 meshes, 533,188-byte animated GLB.
- Bat-rat: gray/black suit, cowl points alongside round ears, exposed rat muzzle,
  bat emblem, utility belt, gauntlet fins and scalloped cape. 12,504 triangles,
  25 meshes, 337,020-byte animated GLB.

## Animation follow-up — September 14

Tyler accepted both model designs and requested idle, passerby and shot-at
animations. `CameoAnimator.ts` adds these deliberately different performances:

| Trigger | Spider-rat | Bat-rat |
| --- | --- | --- |
| Idle, 8 s loop | Breathing, two-sided rooftop scans, blinks, ear twitch and impatient paw fidget | Slow brooding scan, breathing, blinks, ear twitch and restrained cape/tail movement |
| Passerby, 4.8 s | Tracks the passing rat, waves eagerly, wobbles and catches his balance | Tracks the passing rat, narrows his eyes, gives a small nod and adjusts his cape |
| Shot at, 5.4 s | Startles, tries the web shooters, shakes the jammed wrist and shrugs indignantly | Flinches, ducks, checks the threat, dusts himself off and puffs up; cape stays open behind him |

Tyler accepted the animations except the Bat-rat cape spinning forward, then
rejected a closing-cape replacement. The corrected shot reaction keeps the
original open cape behind him. Idle and passerby cape movement remain unchanged.

`sample(reaction, seconds, direction)` uses absolute time, so seeking, repeated
sampling and interruptions do not accumulate transforms. Direction is mirrored
for passerby tracking. The named motion group keeps the placed model root
unchanged. One-shots return to their exact resting pose. In the viewer they stop
at the end for inspection; Idle loops. Background tabs suspend advancement.
Reduced-motion changes pause playback; an explicit Play still allows inspection.

These are authored reaction clips with simulated preview triggers. City
placement, nearby-player detection and incoming-shot detection are not connected
yet. No damage, projectile, networking or production behavior changed.

These are review prototypes; they have not been measured in the full game.
Lighting in this viewer is for art inspection and does not alter the game's
lighting configuration.

## Loading optimization — September 14

Tyler accepted the corrected cape and the proposed tallest-tower / sewer
Maintenance placements, then requested optimization before world integration.

Exact vertex indexing removes duplicated data and unused UVs. Triangle positions,
normals, material colors, roughness, silhouettes and joint boundaries are unchanged.
AnimationClip.optimize removes only redundant keys during constant holds; no
frames are dropped from moving segments. All three clips remain in each GLB.

| Resource | Spider-rat before → after | Bat-rat before → after |
| --- | --- | --- |
| GLB bytes | 1,592,708 → 533,188 | 785,172 → 337,020 |
| Stored vertices | 58,307 → 13,121 | 25,002 → 7,667 |
| Geometry buffer bytes | 1,445,824 → 450,384 | 651,792 → 259,032 |
| Animation keys | 5,805 → 2,413 | 5,225 → 2,256 |

Together: 63.4% smaller files, 66.2% less geometry buffer memory and 57.7%
fewer animation keys. Triangle counts and 25 meshes per model stay unchanged;
this is data compaction, not a reduction in draw calls or silhouette quality.

The viewer preloads the GLBs and loads them asynchronously through the existing
GLTFLoader. It no longer imports procedural model construction or creates and
discards a full game rat to extract its muzzle at startup. Each model prepares
shaders with compileAsync and completes its first render before revealing its
canvas. Loading is marked aria-busy; failures use the existing alert. Controls,
reduced motion, early disposal and disposal during shader preparation are handled.
Built URLs carry Vite content hashes. No texture files or decoder dependency.

`node test/visual/cameos/verify-optimization.mjs [baseline-directory]` compares the
previous GLBs in `output/cameo-before-optimization` with the current exports.
It checks every expanded triangle position/normal and material, and 1,443 animation
poses per model across the three clips. Numeric positions/normals match exactly
(positive and negative zero are equivalent); poses match within 0.000001.
The report is `output/cameo-model-review/optimization-report.json`.

Nine measured Node decode runs after warmup gave median times of 3.58 → 1.31 ms
for Spider-rat and 1.25 → 1.02 ms for Bat-rat on this machine. These are local CPU
decode measurements, not cold network loading, browser GPU time or game FPS.
The final pass passed ten focused tests, typecheck, GLB reload/pose verification,
the standalone build and browser art inspection. Full-game frame rate and real
phone performance remain unmeasured until integration.

## Rebuild and verification

Run `node test/visual/cameos/export-models.mjs`. It exports both GLBs to `exports/`,
checks finite geometry and bounds, verifies GLB headers/content, reloads them
with GLTFLoader and compares bounds. It checks all six exported clips and samples
four times in each reloaded clip against the original animation's pose bounds.
It also builds the standalone viewer into
`output/cameo-model-review/` and copies the model exports there.

The built viewer emits the ordinary Vite >500 kB bundle warning (Three.js).
The development viewer additionally links back to the existing model workshop;
that workshop is not included in the isolated build.

The animation follow-up passed all eight focused tests in
`test/client/cameoAnimations.test.ts`, typecheck and the standalone viewer build.
Tests cover resting dimensions, finite bounded poses throughout every clip,
restoration, placement preservation, interruption/seeking, resource disposal,
both tracking directions and baked-clip fidelity. Browser inspection covered the
wave, web-shooter pose and timeline/pause controls. The cape correction was
inspected at the flinch and duck poses. A regression samples the entire shot clip
and verifies the cape keeps its resting local transforms, has no closing morph
and has no cape animation tracks in the exported shot clip.

The initial static-model review covered front, three-quarter and rear views plus
noir lighting. In that preceding run, `npm test` passed all 161 Worker
tests and 1,020 client tests, but the separate existing
`test/client/carrierCorners.test.ts` failed (reported 5.333 seconds versus a
less-than-2-second condition). The Node script suite was consequently skipped by
the npm command's `&&` chain. No live application modules import this art study.
The broader suite was not repeated for this isolated animation follow-up.
The generated manifest records file sizes, bounds, clips and export checks.
No gameplay input automation or deployment was performed.

Local baseline: `src/utils/RatModel.ts`, `test/visual/model-preview.ts` and
`test/visual/OutfitStudioSubject.ts`. Previous workshop context:
GBrain `sessions/2026/09/rat-detective-workshop-refinement-2026-09-12`.
Export/controls references: installed `three/examples/jsm/exporters/GLTFExporter.js`,
`three/examples/jsm/loaders/GLTFLoader.js`, `three/examples/jsm/controls/OrbitControls.js`
and the [Three.js documentation](https://threejs.org/docs/).
