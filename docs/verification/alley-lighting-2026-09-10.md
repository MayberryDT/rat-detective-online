# Alley spill and surface clarity — September 10, 2026

[Updated desktop preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools&revision=alley-v26) · [Previous dark-pools comparison](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools&revision=alley-v26&readability=off). Same private 16-rat room; expires **3:33 PM Pacific**. Production is unchanged.

## Requested appearance

Tyler chose fixed window, doorway and sign spill plus clearer ground/obstacle materials. The earlier player-following fill proposal was not selected. This trial retains ambient, hemisphere, moon, exposure, camera, streetlamp strength/layout, four live overhead spots, two existing shadow maps, rat materials/outline and sewer lighting.

[StreetReadability](../../src/prototype/StreetReadability.ts) adds steady framed workshop windows, doorway transoms and small sign fixtures, including washes at street-facing landmark signs/entrances. Their warm/cool contributions are baked once into a 512×512 RGBA atlas (1 MiB, no mipmaps). Directional footprints fade over 10–12 units. Building footprints and ground-level wall boxes clip the bake; this is an approximation in the street plane, not new shadow mapping or full 3D bounced light. Thin edges can soften through texture filtering. Steady panes are independent of upstairs window occupancy.

The atlas is shared by owned city materials and sampled at world coordinates, including instanced props. Existing baked-interior and window-occupancy shaders are composed with it. A small material lift distinguishes ground, curbs, lower stair treads, parked vehicles and street debris. It applies at street level and fades out between 1.5 and 5.5 units; underground and upper-floor surfaces receive none. Scenery stays camera-independent. Existing rats and projectiles are excluded from material changes.

The new fixtures occupy two instance batches. No collision/aim geometry, live lights, shadows, per-frame light search, player-dependent work or network data were added. Texture, geometry and fixture resources are disposed with the city. `readability=off` disables this trial while preserving the accepted pools lighting; `lighting=classic` also disables it.

## Verification

- **762 tests pass**: 127 Worker, 610 client, 25 script. Typecheck and normal/visual builds pass, as do whitespace and scoped documentation links. Existing bundle-size advisories remain.
- 21 focused tests passed before final strength/fixture-placement tuning; the complete suite passed afterward. New tests cover directional/distance bounds, wall clipping, shader composition/instancing, fixed atlas allocation, disposal and the local comparison switch. Existing neighborhood physics, light-budget, room/floor and session-resource tests pass.
- Six fixed 1280×720 shoulder-camera comparisons: window alley, doorway, corner, beneath a streetlamp, Records upper floor and Maintenance sewer room. Screenshots inspected; no shader/runtime errors. The fixture's unrelated missing favicon is excluded from rendering errors. Door fixtures were moved clear of canopies and the initial surface lift modestly increased after visual review.
- Every paired view retains **1,423 physics bodies, 17 scene lights and 2 shadow-casting lights**, including the fixture's case/light setup. The existing four overhead spots remain part of that budget. Each final view adds **2 main-pass draws, 12,480 fixture triangles and 1 texture**; these are structural counters, not a measured frame-rate improvement or mobile capacity claim.
- Human movement and multiplayer lighting feel remain for Tyler's playtest. No browser gameplay/input automation or audible playback test was performed.

## Private preview receipt

Client `/assets/index-DrJGrWDb.js`, SHA-256 `62ba5cb348d66c485dd2a99ff304a06ad526db3f9af0c5af2540051625e43c90`, frozen in `output/alley-lighting-2026-09-10/client`. Served HTML/JS match the frozen build. Passive readiness received **173 valid snapshots**, zero invalid packets/errors, and 16 total rats (15 bots plus probe). The probe closed afterward; the normal ten-second refill remains.

Desktop service `rat-detective-full-lobby-preview.service` now uses that directory via `--dist`; previous frozen clients are preserved. Temporary visual Vite was stopped. Backend remains `45bc9d1f-689f-45cc-98a7-b5aa768cc8fa`, protocol 7, room `graybox-benchmark-ai-sixteen-v20`, version-2 seed 1092212759. Expiry: September 10 at 22:33 UTC / 3:33 PM Pacific. No Worker or production deployment, phone relay, room rename or commit.

Checks, source hashes, before/after PNGs, rendering counters and readiness are under `output/alley-lighting-2026-09-10/`. Prior baked-lighting context: `brain:sessions/2026/09/rat-detective-steady-landmark-lighting-lowrise-reticle-2026-09-07`; the current lower ambient/four-spot baseline supersedes its dated light settings. The [title music](title-music-2026-09-10.md), [credits](game-credits-2026-09-10.md) and accepted world-audio tuning remain.
