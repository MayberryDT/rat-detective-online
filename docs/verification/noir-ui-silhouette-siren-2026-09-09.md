# Noir UI, destination silhouette, Dispatch siren and Maintenance workshop

September 9, 2026. Local changes on `codex/dispatch-assignments`; no deployment or commit. This follows the [whole-landmark assignment revision](../dispatch-assignments.md). Earlier measured receipts remain historical.

## Result

- All assignment, Dispatch, title, victory and death cards now use nearly black purple paper with subtle texture and muted lettering. The palette derives from the existing logo background, `#1a0c21`. Excessive Force retains its accepted top-five kill-race layout. The title removes “YOUR EXTREMELY REAL BADGE” and “CHEESE! CRIME! CHAOS!”, reduces decorative rays and uses a quieter arrival.
- Chain highlights now draw only the projected exterior boundary of the current landmark’s architectural envelope. A white union mask is dilated into a thin yellow line and soft halo; mask faces and interior volume edges never enter the gameplay image. The simplified envelope follows the major roof shapes, not every small facade fitting. Through-wall visibility, red case outline and destination/transition labels remain.
- The outline adds a bounded mask target (at most 960×720, four-sample antialiasing) and two draw passes only while a destination is active. Render target, viewport, scissor, clear state, XR flag and diagnostic counter settings are restored. This is a bounded design, not a measured frame-rate claim.
- Each ready Dispatch machine has a small rotating reflector inside a red glass dome. It uses emissive material, not an extra scene light. Busy states stop rotation/glow and darken the glass. The target and its hitbox remain where they were.
- The nearest ready machine gives a restrained .72-second mechanical whoop at most every seven seconds, fading to silence at 40 units. One cached audio buffer and at most one voice are used; busy/out-of-range states and teardown stop/disconnect it. It respects the existing AudioContext and does not force autoplay. Existing gun and incident sound mixing is unchanged.
- Sewer Maintenance now reads as a small municipal workshop: a wall bench with drawers, pegboard tools, vise and parts box; a supply cabinet with tins and a rag; and a wall breaker panel/conduit. Two simple furniture solids share the existing client/server geometry and navigation path. Small decorative fittings join the existing instanced architecture. The center and west entry remain open, and the existing sewer light pool is unchanged.

The three assignment rules, random six-landmark routes, pause/resume, scoring, camera, gunplay, ball tuning and match resolution remain unchanged. Furniture adds ordinary collision surfaces; it does not change damage or projectile tuning.

## Checks actually performed

| Category | Result |
| --- | --- |
| Focused rendering/audio | 21 tests passed across siren audio, silhouette state restoration, Dispatch target and session checks |
| Focused Maintenance/navigation | 21 tests passed across sewer layout, real-city bot entries, neighborhood physics and lighting |
| Full automated suites | 623 passed: 107 Worker, 494 client, 22 script; client suite uses `--maxWorkers=2` |
| Typecheck | Passed for application and tests |
| Application and visual builds | Passed; existing Vite large-chunk warning remains |
| Static camera review | Actual city, rat and unchanged shoulder camera under fixed presentation states; no gameplay-input automation |
| Multiplayer validation | Existing local Durable Object/WebSocket regression tests rerun; no hosted multiplayer session for this pass |
| Human playtesting/audio | Not performed; loudness, moving-camera readability and contested play remain for human review |

The nine new siren/silhouette/beacon tests cover readiness and cooldown, distance/suspended-context silence, bounded voices, buffer reuse and disposal, off-state visuals, unchanged shoot target, destination selection and render-state restoration on success/failure. One new sewer test checks shared solid furniture placement and a clear .6-radius entry/center lane. The existing six server-bot landmark checks still complete without recovery, including Maintenance. These checks are not a full contested traversal playtest.

Logs: `output/noir-ui-2026-09-09/`. Static fixture: `assignment-fixture.html` in `dist-visual`, temporarily served on local port 5188. Its `view=maintenance` shows the workshop from inside; `view=sewer` shows the approach; `view=dispatch` provides an opt-in LISTEN button, and `dispatch=busy` selects the stopped siren. It has no gameplay input, scoring loop or network. The route is fixed for reproducible images; real matches randomize it.

The previous palette decision was retrieved from GBrain `brain:sessions/2026/09/rat-detective-cartoon-hud-incident-distance`. The later Maintenance-specific lookup failed during a brief shared-service restart; implementation used current repository geometry. No historical map proposal was treated as a new instruction.

September 9 access investigation: the `Rat Detective sewer maintenance room interior` search failed at 21:30:06 Pacific (September 10 04:30:06 UTC), while Halla's health watchdog was restarting the HTTP owner. This was a transient transport failure, not a project credential or missing-memory problem. The same task reconnected and saved `brain:sessions/2026/09/rat-detective-dark-noir-silhouette-siren-maintenance-2026-09-09` at 21:37:49 Pacific. The diagnostic task replayed the original search and read the prior interior notes successfully. The watchdog now confirms three failed probes before restarting an active owner, validates the health response, and records transport diagnostics. See `brain:sessions/2026/09/gbrain-rat-detective-access-watchdog-repair-20260909` for the repair and its limits.

## Subsequently requested full-game preview

Requested full-game preview: [play the latest build](http://127.0.0.1:5183/?room=graybox-benchmark-match-noir-v11&diagnostics=quiet). On September 9 at 9:41 PM Pacific, the dedicated private capacity Worker was refreshed to `ac070400-9c4d-41f8-94ac-ae9dba8cc4d2`, protocol **4**, matching immutable client `index-B8KzGliD.js`. The relay expires September 10 at **1:41 AM Pacific**. Automatic rooms backfill to eight total rats. Public production is unchanged. The older port-5182/protocol-2 preview is superseded and incompatible with this refreshed backend. A separate passive private-pool check received eight players and 170 valid snapshots with active Chain of Custody, zero invalid packets; it did not exercise gameplay input. Deployment receipt: `output/hosted-capacity-deployment-2026-09-10T04-41-08-665Z/deployment.json`; check receipt: `output/noir-ui-2026-09-09/full-preview-check.json`. Local service: `rat-detective-noir-full-preview.service`.

This is a bounded hosted connection/readiness check, not a completed multiplayer or human playtest. The preceding no-deployment receipt describes the implementation turn before the user requested this playable preview.
