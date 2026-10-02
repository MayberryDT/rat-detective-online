# Foundation: the feel layer

Part of the [juice plan](../juice-plan.md), which owns status and order. Read
this before writing any feel code or reviewing its integration. It covers
architecture, rules, performance budget and verification for every track.

## Shape

One small client-side layer, so dozens of effects don't scatter through game code:

| Piece | Job |
| --- | --- |
| `src/feel/feelTuning.ts` | Every feel constant in one `Record`, grouped by item. Starting values are guesses to dial in. |
| `src/feel/FeelDirector.ts` | Takes game events and fans them out to the channels below. It reads the `feel` mode and Settings multipliers. |
| `src/feel/CameraFeel.ts` | Spring-damped view offsets (kick, jolt, dip, view widening, punch-in) layered on top of the controller's camera |
| `src/feel/ScreenFeel.ts` | DOM overlays (edge flash, damage arrow, iris, speed streaks, comic words) and the low-health colour drain (a CSS `saturate` filter on the canvas; the game has no post-processing pass) |
| Track modules | Character, sound, world props and rewards own their own files and receive calls from the director |

Event sources already exist:
- **`GameSession` message handlers:** `playerDamaged`, `playerDied`, `playerHealed`, `pickupResult`, case, dispatch and victory messages.
- **Local input:** shot sent, jump.
- **Local motion:** landing, as detected in `MotionFoley`; launcher flight start and end.

Add one director call at each source. Don't duplicate event parsing.

## Tuning and flags

| Control | Behaviour |
| --- | --- |
| `?feel=off` | Every feel effect disabled; today's presentation. Read like `lightingMode.ts`. |
| `?feel=dev` | Adds a live dials panel (sliders per tuning group, copy-as-JSON). For choosing values in review; not linked from the UI. |
| Settings → Camera shake | 0–100%, default 60% for new players since the protocol 29 clarity batch (100% before; saved values kept). Scales all camera offsets, shake and kick alike. |
| Settings → Flash strength | 0–100%, default 100%. Scales edge flashes, colour drain and comic-word flashes. |
| Reduced interface motion (existing) | Also zeroes camera shake, punch-in and slow-motion |

Settings extend the existing `rat-player-settings-v1` preferences with safe
defaults. Old saved settings must keep loading. Update
[player settings](../player-settings.md) when they ship.

## Invariants

1. **Aim stays exact.** Aim direction, crosshair target and projectile origin come from the controller's un-offset view and the real animated muzzle. Camera offsets are applied only to the rendered camera, after aim is computed. No shot, even one fired mid-kick, may read the offset camera.
2. **Frame-rate independent.** Every effect decays over the same elapsed time at 30, 60 and 120 Hz and stays finite and bounded under large frame gaps.
3. **Clean resets.** Respawn, round reset, reconnect, observation, title return and teardown clear all feel state. No leftover flash, offset, freeze, hat or slow-motion.
4. **Authoritative triggers only.** Effects come from server events or local input, never from snapshot interpolation or network corrections, so a correction can't replay a landing or hit.
5. **Separate randomness.** Cosmetic variation uses its own seeded random numbers, never the gameplay or shot-pattern random numbers.
6. **No allocation in hot paths.** Reuse vectors, pools and DOM nodes.
7. **Nothing changes gameplay.** No change to protocol, authority, tuning, collision, respawn deadlines or bots. Cosmetic props never collide with gameplay bodies.

## Performance budget

**How it's measured.** The full-lobby render fixture (`capacity-render.html?rats=12&balls=256&batch=1`) runs the real city, remote rat presentation and chaos view. It's served by the visual dev server (`npx vite --config vite.visual.config.ts --port 5192`) and driven by headless Chromium on the Veelox integrated GPU (`--use-angle=gl`, Intel Arc MTL), once with `feel=off` and once on. Throwaway runner: `output/polish/perf/run.mjs <label>`. Default headless Chromium falls back to SwiftShader, which is unusable for timing (2 s frames).

**Baseline** (F3, 2026-09-27, before any effect; `output/polish/perf/baseline-F3.json`):

- Frames: 60 Hz vsync-locked, p50 16.7 ms and p95 16.8 ms.
- Scene: 972 draw calls and 1,880,513 triangles, identical with feel off and on.
- Render-submission CPU p95: 12.4 ms (off) against 13.2 ms (on) for identical scenes, so run-to-run noise is about ±7%.

**Budget:**

- Frame p95 stays at vsync (≤ 16.9 ms) with feel on.
- At most 40 extra draw calls in total.
- Render CPU p95 no more than 10% above `feel=off` (beyond noise).
- No new live lights or shadow maps. New visuals use instanced or pooled meshes with fixed caps.
- Phone tier (touch devices): half the particle and prop counts, no colour-drain filter if it measures expensive, and the same gameplay.

## Verification

Tyler prefers end-to-end evidence over unit tests. Each drop produces a repeatable
artifact plus a hosted preview:

- **Visual artifact:** feel-off vs feel-on screenshot or clip sheets from the existing fixtures (`hud-preview`, `cheese-preview`, `model-preview`, `performance-fixture`), saved under `output/polish/<drop>/` and summarised in a dated `docs/verification/` receipt. Keep agent browsers muted.
- **Focused tests** only for the invariants above: aim unchanged during an active kick, the same settling at 30/60/120 Hz, reset cleanup, pool caps. List the failure modes before writing the code.
- **Perf:** a fixture comparison against the budget.
- **Tyler review:** a hosted private fixture preview ([tooling](../tooling.md#required-gameplay-preview-september-11-correction)), audible, with a `feel=off` link for comparison.
- **Every drop:** `npm run typecheck`, `npm test`, `npm run build` and `npm run visual:build`.

## Integration hazards

- **Model changes:** must work with `RigidMeshBatch`, outline shells, Ironclad metal materials, corpse rigs, and local and remote rats. The [2026-09-12 animation handoff](../handoffs/animation-polish-2026-09-12.md#code-map-and-integration-hazards) has the file map; treat it as reference.
- **Automatic highlights:** these capture the app window, so slow-motion and flashes appear in clips. Keep marker timing tied to real game events, not presentation time.
- **Touch HUD:** overlays must respect the touch HUD, UI scale and the top-centre countdown's reserved space.
- **Observation mode:** has no local rat. Its camera gets no death camera or damage effects.
