# P4 natural noir papers: implementation and review receipt

7 October 2026 (US/Central; verification timestamps cross into 8 October UTC). Implementation on Halla, branch `feature/physical-case-clues`. Game-code commits: `55489b0` and `bffa4d6`. **Local candidate only; staging and production were not deployed.**

## What changed

- Four original document families: witness statement, evidence inventory, harbour receipt and an illustrated evidence photograph. Related precinct/file marks replace identical generic ink strips. Pages have different proportions and restrained asymmetric folds; the repeated two-sheet V shape is gone.
- Paper, print and thin red perimeter share a single lit surface. Two shared atlas textures and four instanced geometry batches replace separate paper/ink/rim layers. The edge has a modest red-only emissive contribution; the sheet itself is lit normally. No new lights, paper physics, postprocessing framework or through-wall rendering.
- Existing dynamic noir material adoption now includes the papers. Disposed materials are released from NoirCity's tracking set when welcomes rebuild the view.
- GPU depth handles partial building occlusion. The single camera-to-center ray no longer removes an entire partly visible cluster. Frustum selection uses a sheet-sized bound, with modest budget hysteresis. Ground support and slope are cached per clue.
- Routes use fixed sampling for the lifetime of each planned path, deterministic grounded offsets and stable IDs. Moving a rat changes the local window's boundaries without reseeding the retained sheets. Server-side footprint probes reject unsupported, discontinuous or obstructed placements; client support normals orient sheets to their surface.
- A small starter spill is anchored once near each spawn's initial facing direction, with a side placement when a wall blocks the front. It appears before the longer route search finishes. Starter pages use the wider statement/inventory artwork. It does not travel with the rat. The continuing trail retains all four document families. A shared placement is deduplicated rather than stacking a starter and route page.
- Existing traversable routes, current-case refresh, case pickup authority, ghost-case repair, protocol 35, layout and bot sight rules remain. A reset can legitimately recreate the same local starter location; old cached routes must still be discarded.

## Verification and artifacts

Canonical artifact directory on Halla:

`/home/halla/build/rat-detective/noir-papers-20261007/`

| Check | Result / artifact |
| --- | --- |
| Game build and source TypeScript | Passed; `build.log`, source `tsc --noEmit` |
| Script syntax and whitespace | Passed; changed verification/capture scripts parse; `git diff --check` |
| Full repository typecheck | Blocked solely by existing `test/visual/title-scene.ts` importing absent `three-gpu-pathtracer`; same import exists in pre-change HEAD. `typecheck-final.log`. No suppression or unrelated dependency change |
| Authority → graph → clues → compact wire → restore | Passed, `trail-integration.json`: 926 frames; ten simultaneous separated spawns; first-step starter checks; authoritative pickup; moving-carrier route refresh; reset; street/sewer routes both ways; explicit launcher links |
| Complete current spawn inventory | 930 spawn locations have supported starter placements in the initial facing/side sector. Included in the repeatable route verifier; this is geometric coverage, not 930 human camera playtests |
| Stationary clue stability | 119 IDs retained identical positions across the checked refresh in the final authority run |
| Payload/work diagnostics | Final authority run maximum compact frame 14,909 bytes, with clue cap preserved. Maximum single step about 40.7 ms in the synthetic ten-spawn burst under concurrent local load; this is not a production latency benchmark |
| Two-client and reconnect transport | `room-e2e.json`: independent clients agree on shared frames, late join gets bounded clues, same identity resumes, normal bot roster |
| Real game browser | `browser/case-visuals.json`, initial/reconnect images and live-room clip. Checks nearby projected paper at initial spawn, paper instances returning after reconnect, real case, no orphan echo and runtime exceptions. Reconnect observation allows normal knockback/camera movement to take papers out of view afterward |
| Fixed-scene art and motion | `candidate/visual/proof/`: street, corner, sewer and Blackout stills; `desktop-motion.webm`, `mobile-low-motion.webm`, `paper-close.png`, `paper-atlas.png`, `capture.json` |
| Baseline reference | `baseline/visual/proof/`: pre-change implementation images/clips, plus GPU capture diagnostics |
| Empty-room lifecycle | `idle-room.json`: no bots/tick/storage writes before a seat; play with a seat; stop after reconnect grace; unchanged storage afterward. Run before the final starter-placement refinement, which does not change room lifecycle code |

Review copies of selected media are available on Veelox in `/tmp/rat-detective-noir-review/`. Canonical media stays on Halla; these temporary copies are conveniences, not the only record.

## What the evidence does and does not establish

The old geometry contained near-coplanar surfaces and very fine independent ink/rim geometry. The old visual cull could also hide an entire cluster from its center ray. Both mechanisms are removed. Route resampling around the current rat position was another source of replacement and is now fixed to the planned path. Baseline/candidate motion artifacts allow direct review; no single cause is claimed for every flicker Tyler previously saw.

The first real-browser presence check was insufficient: a random spawn could face away from its route. That finding caused the anchored starter refinement and stronger first-step/geometric camera checks. The receipt does not treat an instance count as proof of human discoverability.

The representative city fixture uses four paper draws rather than three, two additional textures and one additional geometry. The two 1024-square RGBA textures with mipmaps are approximately 10.7 MiB uncompressed. Total fixture triangles dropped from 989,173 to 988,661, though the old fixture has three repeated clusters and the new one has four single documents, so this is a scene measurement rather than a per-sheet benchmark.

Raw renderer CPU samples are saved in the capture report. Early-frame compilation, different fixture presentation and concurrent browser work make them unsuitable for claiming a frame-rate improvement or a clean performance regression. No GPU-time or isolated steady-state performance conclusion is claimed.

No unbriefed human navigation session has been completed. Visual taste, the strength of the first lead in normal play and readability during arbitrary combat remain Tyler's review. The motion fixture is a repeatable rendering sample, not a claim that a human followed the entire route. The authority traversal verifies pickup using the real simulation, not a human playthrough.

## Repeatable commands on Halla

Run from `/home/halla/workspaces/rat-detective-physical-clues`. These commands start bounded verification processes; they were not used to deploy anything. Keep GPU captures sequential when comparing timing.

```sh
npm run build
P4_OUT=/home/halla/build/rat-detective/noir-papers-20261007 node scripts/verify-case-trails.mjs
P4_RECEIPT=/home/halla/build/rat-detective/noir-papers-20261007/room-e2e.json node scripts/with-local-worker.mjs -- node scripts/verify-case-clues-ws.mjs
ANGLE=vulkan node scripts/with-local-worker.mjs -- node scripts/verify-case-visuals.mjs --out=/home/halla/build/rat-detective/noir-papers-20261007/browser
npx vite build --config vite.visual.config.ts --outDir /home/halla/build/rat-detective/noir-papers-20261007/candidate/visual
P4_OUT=/home/halla/build/rat-detective/noir-papers-20261007/candidate node scripts/capture-case-clues.mjs
node scripts/verify-idle-room.mjs --output /home/halla/build/rat-detective/noir-papers-20261007/idle-room.json
```

The existing `dist` symlink places application build output under `/home/halla/build/rat-detective/physical-clues-20261007/dist`. No build output was created in `/home/tyler`. Verification wrappers shut down their own local Worker and browser processes.

## Next review

Use the [implementation plan](../plans/noir-physical-clues.md) and the actual normal-camera/motion artifacts to judge the treatment. The outstanding decision is aesthetic/gameplay acceptance of this candidate, not a renewed choice among the old six clue identities. Staging remains the previously deployed treatment until the agreed visual review step is complete.
