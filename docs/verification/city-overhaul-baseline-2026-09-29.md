# W0 baseline: current city (`main` c639a9f), 29 Sep 2026

All runs on **Halla** (AMD Ryzen laptop, Radeon Renoir iGPU, headless Chrome with ANGLE gl-egl, 1280×720, DPR 1, muted). The tools and scenes match `perf-baseline-2026-09-28.md` and `perf-overhaul-2026-09-28.md`. The code came from a throwaway git worktree of `main` at `/tmp/rd-baseline` (commit `c639a9f`, the docs-only commit above the overhaul release). Heavy work ran under `nice`. The worktree was removed afterwards. Raw outputs are in `halla:~/rdb-baseline-2026-09-29-raw/`. No tracked files were changed. Nothing was deployed.

Halla was shared with other work, so treat differences within about ±15% as noise. The two runs of each fixture scene agreed to within 10% on fps.

## Headline

| Metric | Value | Method |
| --- | --- | --- |
| Server tick, idle, warm (3,600–5,400 ticks, 2–3 min) | **1.06 ms/tick** (bots 0.82, chaos 0.16) | `benchmark-server-tick.mjs --scenario=idle --ticks=5400` |
| Server tick, idle, first 10 s | 5.62 ms/tick (bots 4.48, chaos 0.91) | same run, window 0–300 |
| Server tick, 120-ball burst, warm | **1.18 ms/tick** (bots 0.73, chaos 0.31); peak 151 balls | `--scenario=burst --ticks=5400` |
| Trajectory hash | idle `98749b558c0077fa`; burst `1a4be9c00db5f3b7` | same runs |
| Fixture, 9 rats | **47.8 / 48.8 fps**; GPU median 11.5 ms; render CPU p95 18.6 ms; 898 draws; 1.55 M triangles | `profile-client.mjs` on `capacity-render.html?rats=9&balls=0&corpses=0&batch=1&noir=1&mute=1`, warm-up 6 s, 12 s profile; 2 runs |
| Fixture, plus 256 balls | **47.0 / 43.3 fps**; GPU 12.0 ms; render p95 19.0–20.3 ms; 901 draws; 1.91 M triangles | same, `balls=256` |
| Fixture, plus 16 corpses | **34.1 / 31.1 fps**; GPU 12.6 ms; render p95 24.4–26.7 ms; 1,042 draws; 1.97 M triangles | same, `corpses=16` |
| Load, warm: to title / Enter-ready / first gameplay frame | **0.16–0.19 s / 3.06–3.17 s / 4.26–4.38 s** | Local build plus a throwaway local Worker (`with-local-worker.mjs`); performance marks; 3 runs |
| Load, cold (fresh profile): title to Enter-ready / title to first frame | **6.8–7.4 s / 8.2–8.9 s** | same, measured from the title mark (see limits) |
| City prepare (`city-prepare-start` to `city-render-ready`) | cold 6.3–6.7 s; warm 2.66–2.72 s | same |
| Shader programs after warm-up (in-game) | **153–154** linked; **66–68** of them are `#define STANDARD` (MeshStandardMaterial) | `linkProgram` hook injected before load; read 15 s after first frame |
| City only, standard fixture view | **632 draws, 1.20 M triangles** (367 draws / 0.78 M without shadow passes) | Throwaway probe page, fixture camera, `rats=0` |
| In-game spawn view (local Worker, bots present) | 616–752 draws, 1.10–1.19 M triangles; GPU median 10.7–12.1 ms; frame median 33.3 ms | `?diagnostics=quiet` last report |
| Graybox boxes | **1,411** total: 808 hidden, 76 original, 234 rotated, 94 buildings, 105 debris, 603 not hidden | `grayboxBoxes({seed:20260907,version:2})` in Node (esbuild bundle) |
| Client city static bodies | **1,426** fixed bodies in `StaticCityBroadphase` (plus 0 other world bodies with no rats) | probe: `stage.world.broadphase.fixed.length` after `Neighborhood.generate()` |
| Nav graph build | **22.5–25.2 ms** for the first `new BotNavigation` (cold, same process); 9–17 ms for later fresh specs | Node, 3 processes |
| Nav routes | 6 of 8 spawn-to-spawn routes resolve after about 125 unbudgeted `update()` calls, **≈1.06–1.09 s** in total. Two pairs never resolve, even after 5,000 updates. | Node; see below |
| Shadows: freeze both maps (city view, 9 rats) | GPU −2.4 ms (12.7 to 10.3); CPU −8.4 ms/frame; draws 749 to 430 | probe (see below) |
| Shadows: drop both maps | GPU −3.2 ms (12.7 to 9.5); CPU −9.8 ms/frame | probe |

## 1. Server tick

`node scripts/benchmark-server-tick.mjs --scenario=idle|burst --ticks=5400` (9 bots, 1 recipient). Figures are ms/tick. Chaos is the chaos step.

| Window (ticks) | Idle: bots / chaos / total | Burst: bots / chaos / total |
| --- | --- | --- |
| 0–300 (first 10 s) | 4.48 / 0.91 / 5.62 | 4.47 / 1.02 / 5.78 |
| 300–900 | 1.14 / 0.71 / 2.09 | 1.03 / 0.75 / 2.07 |
| 900–1,200 | 1.16 / 0.52 / 1.88 | 1.17 / 0.49 / 1.87 |
| 1,200–1,800 | 1.16 / 0.45 / 1.78 | 1.09 / 0.63 / 1.99 |
| 1,800–3,600 | 0.82 / 0.20 / 1.12 | 0.72 / 0.49 / 1.46 |
| 3,600–5,400 (warm) | **0.82 / 0.16 / 1.06** | **0.73 / 0.31 / 1.18** |

Other results:

- Idle: 4,963 shots, peak 54 balls, average frame 918 B.
- Burst: 4,556 shots, 60 bursts, peak 151 balls, average frame 2,339 B.
- Snapshot, wire and checkpoint together cost 0.06–0.25 ms/tick.

These agree with the overhaul receipt: warm 0.9 ms idle and 1.0 ms burst, and 5.3 ms for the first 10 s.

## 2. Client fixture

`test/visual/capacity-render.html` ran under the visual Vite server on 127.0.0.1:5192. The scene used seed 341283204 v2, the real city, 9 batched remote rats, `ChaosView` and the noir layer. Each scene ran twice.

- fps comes from the profiler's rAF counter.
- GPU times, frame p50, CPU p95 values, draws and triangles come from the fixture's `capacityRenderResult`.
- Draws and triangles cover the whole frame, including shadow passes.

| Scene | fps | GPU median / p95 | Frame p50 | Render CPU p95 | Presentation CPU p95 | Draws | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9 rats | 47.8 / 48.8 | 11.5 / 11.7 ms | 16.7 ms | 18.6–18.7 ms | 2.9–3.2 ms | 898 | 1.55 M |
| plus 256 balls | 47.0 / 43.3 | 12.0 / 12.2 ms | 16.7 ms | 19.0–20.3 ms | 3.7–3.9 ms | 900–901 | 1.91 M |
| plus 16 corpses | 34.1 / 31.1 | 12.6–12.7 / 12.9 ms | 33.3 ms | 24.4–26.7 ms | 6.8–7.4 ms | 1,042–1,045 | 1.97 M |

The profiler found the main thread saturated in every scene: busy ≈12.0 s of the 12 s profile, idle 16–34 ms. The overhaul receipt gave 49 / 48 / 38 fps with 933 / 935 / 1,077 draws. The rat and ball scenes match it. The corpse scene is 4–7 fps lower here; treat that as noise or drift, not a regression claim.

## 3. Load

The client was built with `npm run build` from the worktree. It was served by `scripts/with-local-worker.mjs` (throwaway `wrangler dev --local` with a temporary persist directory) using default matchmaking. The Worker had server bots.

The browser was headless Chrome through CDP at `?mute=1&diagnostics=quiet`. The script clicked `#enter-city-btn` once `city-entry-ready` had fired, polling every 50 ms. Each of the 3 runs was a cold load (fresh profile), then a warm reload in the same profile. Times are ms from navigation start (performance marks).

| Run | `title-controls-ready` | `city-prepare-start` | `city-prepare-end` | `city-render-ready` = `city-entry-ready` | `city-first-play-frame` |
| --- | --- | --- | --- | --- | --- |
| cold 1 | 25,153 | 25,857 | 28,030 | 32,522 | 34,011 |
| cold 2 | 25,214 | 25,698 | 28,208 | 32,152 | 33,573 |
| cold 3 | 25,122 | 25,678 | 28,106 | 31,966 | 33,308 |
| warm 1 | 190 | 454 | 2,276 | 3,170 | 4,378 |
| warm 2 | 192 | 442 | 2,257 | 3,154 | 4,339 |
| warm 3 | 162 | 397 | 2,155 | 3,055 | 4,262 |

The ≈25 s before the title on cold runs is a headless-Chrome fresh-profile artefact. A plain Vite page (`hud-preview.html`) showed `requestStart` at 25,108 ms in a fresh profile. So compare cold runs from `title-controls-ready`:

- Enter-ready: 6.8–7.4 s after the title.
- First gameplay frame: 8.2–8.9 s after the title.

The cold transfer was 2,745 KB; the warm transfer was 16 KB.

The first gameplay frame includes up to 50 ms of polling before the click.

Shader programs were counted by a hook on `WebGL{,2}RenderingContext.linkProgram`, read 15 s after the first frame. There were 153–154 programs; 66–68 contained `#define STANDARD` (MeshStandardMaterial); none were physical. `renderer.info.programs` is not exposed in the game page, so this hook is the proxy.

For comparison, the probe page has `renderer.info.programs.length` = 80 for the city alone (fixture camera) and 100 with 9 rats. three.js does not name these programs, so they cannot be split by material there.

## 4. City data

**Graybox boxes.** `grayboxBoxes({seed:20260907, version:GRAYBOX_VERSION=2})` returns 1,411 boxes in 16–20 ms:

- 808 hidden
- 76 original
- 234 rotated (`rx` or `rz`)
- 94 buildings
- 105 debris

The fixture seed, 341283204, gives 1,426 client fixed bodies. That count includes the city control boxes that `Neighborhood` adds.

**Probe-scene totals** (fixture camera, no rats):

- 2,522 meshes in the scene, 620 visible
- 220 instanced meshes
- 330 materials, 292 of them MeshStandard
- 332 geometries
- 78 textures

With 9 rats there are 3,481 meshes and 483 materials.

**City build time.** `Neighborhood.generate()` took 1.1 s on the probe page with no rats. With 9 rats it took 2.3 s, but the page was busier; this is a single sample.

**Nav graph.** Measured in Node (esbuild bundle of `src/shared/BotNavigation.ts`):

- `new BotNavigation(spec)`: 22.5–25.2 ms for the first cold build in a process (3 processes); 9–17 ms for later fresh specs in the same process (JIT warm). Graphs are cached per spec object.
- `route()` is incremental. Routes were requested between 8 spawn pairs (`GRAYBOX_SPAWNS[i]` to `[i+5]`), calling `update(∞, ∞)` between polls. Six routes resolved (516 waypoints) after about 125 update calls, taking 1.06–1.09 s. The other 2 pairs had still not resolved after 5,000 updates (≈8 s). This is either an unreachable pair or a limit of the field-per-goal design; it is worth noting for the overhaul.

`scripts/benchmark-world-scenery.mjs` was also run. It measures the legacy procedural city generator (144 buildings, 342 scene objects), not the graybox city, so it is not used here.

## 5. Shadows

A throwaway probe page (a copy of the capacity fixture without `ChaosView`, with the noir layer, created in the worktree only) switched shadow modes. Each mode ran for 6 s with 1 s of settle time, after a 6 s warm-up. The two light switches were:

- moon: `castShadow` on the shadowing DirectionalLight
- flashlight: `stage.flashlight.castShadow`

"Frozen" means `shadowMap.autoUpdate=false`, with one final update.

CPU is the mean time per frame for presentation and render.

| Mode | 9 rats: fps / GPU median / CPU mean / draws | City only: fps / GPU median / CPU mean / draws |
| --- | --- | --- |
| normal | 31.3 / 12.72 / 30.1 / 749 | 54.2 / 10.55 / 7.29 / 632 |
| frozen | 42.7 / 10.32 / 21.7 / 430 | 60 / 8.58 / 6.04 / 367 |
| no moon shadow | 28.1 / 9.88 / 24.6 / 496 | 60 / 8.19 / 6.34 / 406 |
| no flashlight shadow | 25.1 / 12.26 / 26.6 / 683 | 55.8 / 10.16 / 6.57 / 593 |
| both off | 33.5 / 9.51 / 20.3 / 430 | 60 / 7.91 / 6.71 / 367 |
| normal (repeat) | 31.2 / 12.73 / 30.2 / 749 | 60 / 10.62 / 7.33 / 632 |

The shadow costs are:

- Moon shadow map (2048², ±150 m): about 2.4–2.8 ms GPU and 136–253 draws.
- Flashlight (512²): about 0.4 ms GPU and 39–66 draws.
- Both maps: about 2.7–3.2 ms GPU. With 9 rats, both cost about 10 ms of CPU per frame (with the city alone, about 0.6–1.2 ms).

These match the overhaul receipt's figures: freezing saves 1–3 ms and dropping saves about 3 ms GPU / 6 ms CPU.

Fps on this probe with 9 rats is lower than in the real fixture (31 against 48), even though both render the same city. The probe differs in its frame loop (no `ChaosView`; rats move every frame) and in how it measures. Use its numbers only as differences between modes. The absolute scene numbers are in section 2.

## Not measured, or limited

- **Hosted observer and idle-player rows** (the private capacity fixture). These were not run, because that requires deploying a private Worker and this assignment forbids deployment.
- **Cold load in absolute terms.** The fresh-profile Chrome adds a startup gap of ≈25 s before the first request on Halla, so cold loads are reported from the title mark.
- **Load view differs from the fixture view.** The in-game draw and triangle counts come from wherever the rat spawned, so they vary by run (616–752 draws).
- **`renderer.info.programs` inside the game.** It is not exposed; the `linkProgram` hook count is the proxy.
- **Production CPU and phones.** These were not measured, as in earlier receipts.
