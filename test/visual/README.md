# Visual verification

`npm run visual:build` builds separate test pages, excluded from production assets. `npm run smoke:visual` captures five states and compares them against checked-in images. Missing Chrome or baselines fails the command. Record updates only after reviewing the changes: `UPDATE_VISUAL_BASELINES=1 npm run smoke:visual`.

Serve `dist-visual` locally to inspect `/visual-fixture.html?seed=20260905&state=alive`. States: alive, turned, damaged, dead, respawn. Every state starts with fresh entities and seeded randomness; death advances the actual animation and Cannon simulation for 180 ticks. The dead-state camera follows the corpses. Respawn exercises the complete death transition first. Visible status reports readiness, seed, state, and renderer resources.

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
