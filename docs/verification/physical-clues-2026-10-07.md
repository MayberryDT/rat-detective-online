# P4 — physical case files: private experiment

7 October 2026. Tyler: “do it all” after the research sequence. Branch `feature/physical-case-clues`, based on production-ancestry receipt `6af05f2` (gameplay `2822d1a`). Halla checkout `/home/halla/workspaces/rat-detective-physical-clues`. Canonical Veelox checkout and its dirty work are preserved.

## Current staging: natural paper with a red outline

Tyler rejected the oversized, distracting bright folders and requested natural paper with just a red outline. Commit `e862f87` replaces those props with two small, gently creased sheets (0.72×1.02 and 0.60×0.85 world units), muted aged-paper and ink materials that receive normal scene lighting, stable rotation/size variation, and a thin 0.012-unit red perimeter. No red stamp, broad red backing or fullbright paper. Three instanced batches and ordinary world occlusion remain; route generation is unchanged.

Staging build **staging-2026-10-07-e862f87**, Worker **6a508a1a-44cf-4a2b-8748-62a953c9d90b**, client **index-CpqviDK1.js**; protocol35 unchanged. Deployed from the clean source commit with `npm run deploy:staging`. No production deployment.

Build passes. Actual hosted GPU Chrome fresh-spawn/reconnect check passes all five checks, with exact loaded build/assets recorded in `natural-papers-staging/case-visuals.json` under the existing artifact directory. Inspected its first-spawn screenshot: thin red edges, shaded paper beside the rat and along the street. Local browser checks also passed. Independent review caught a rim/surface mismatch in the first revision; paper and rim now share a piecewise-planar crease, with ink following the same surface. Follow-up review found no remaining material issue. This is rendered verification, not Tyler's aesthetic acceptance.

## Earlier route implementation: obvious paper routes at spawn

Tyler's latest direction supersedes the historical-only, three-cluster experiment below: multiple physical clues/paper trails lead to the case at every spawn, without seeing the clues or case through buildings. Existing spawn positions remain. This receipt's older prototype/gallery sections describe prior builds, not the current design.

Staging is **staging-2026-10-07-376c735**, Worker **dc6c6c33-97d3-4bc3-9046-b85b5a9e2e8f**, client **index-B09djU6r.js**, protocol **35**. Implementation commits `ea4bde8` and `376c735`, deployed through `npm run deploy:staging` from a clean tree. Production remains `production-2026-10-06-2822d1a`.

The authority builds shared supported routes from living rats to the current case, prioritizing newly joined humans. A spill starts around each rat and up to twelve paper positions form each nearby route segment, extending as the rat advances and refreshing as the case moves. The shared list caps at 128; up to 48 nearby, in-view, unoccluded papers render within 65 units, roughly four units apart. Larger cream sheets, red folder borders and dark ink remain obvious in the noir lighting. Three pooled instance batches keep rendering bounded. Papers use normal depth testing plus static-world sight checks, never x-ray. Existing case locators remain removed; Hunch/Stakeout and destination guidance retain their separate existing behavior.

Navigation reuses the existing supported walk graph, ramps and authored launcher links. Search work is sliced to 64 expansions per simulation step. The first staging verification caught a real failure: a distant street spawn could exhaust the search above an underground case, leaving no papers. Commit `376c735` steers inter-floor search toward actual sewer entrances. The exact failed coordinates now produce a 123-node path in eight slices, with the reverse route in six slices. Failed routes clear rather than retain obsolete paths.

Verification artifacts under `/home/halla/build/rat-detective/physical-clues-20261007`:

- `trail-integration.json`: ten separated spawns receive nearby papers; compact frames decode within the shared bound; restored evidence matches; a fixture follows supported route positions to an authoritative case pickup; moving-carrier routes update; reset clears old papers; five launcher roof routes and twelve street/sewer routes pass. The fixture moves through route positions, so this is authority/navigation integration, not a human-input traversal test.
- `trails-staging-final/case-visuals.json`: actual hosted GPU-rendered Chrome loads the exact build/assets above. Fresh spawn and reconnect show physical papers, the real case is present, no retired case echo returns, and no runtime exceptions occur. Inspected `first-spawn-papers.png` and `reconnected-papers.png`: a visible paper line and nearby spill during actual Blackout gameplay. Ordinary combat can kill/respawn the stationary agent; this does not prove every possible spawn/camera state.
- `trails-browser-final/case-visuals.json`: local real-browser spawn/reconnect proof before the final sewer heuristic correction. `trails-idle-room.json`: empty and post-grace rooms have zero bots, ticks, alarms or changing storage. The final change only affects route search priority.
- App TypeScript and production build pass (`trails-build.log`). Focused independent reviews found no remaining material defect. Full historical test suites were not rerun or declared green; earlier baseline/obsolete locator assertions remain documented below. Actual human launcher usability and human play acceptance remain unverified.

Repeat the current checks on Halla:

```sh
node scripts/verify-case-trails.mjs
ANGLE=vulkan node scripts/verify-spawn-trails.mjs --url=https://rat-detective-staging.mayberrydt.workers.dev/ --out=/home/halla/build/rat-detective/physical-clues-20261007/trails-recheck
```

## Earlier stuck-case repair

Tyler reported a stationary red case without papers that could not be picked up, surviving reload. Reproduced in the actual hosted browser: the retired `CaseBeacon` added its echo as a separate scene root, default-visible at (0,0,0); the prototype hid only the main root and stopped calling the updater. The real case was elsewhere. The screenshot object was a presentation ghost, not an authoritative pickup.

Removed the unused beacon allocation from `ChaosView` and loading preparation. Actual case, pickup authority and physical clue rules are unchanged. Independent focused review found no material defects.

Staging repair: commit `6475704`, Worker `00bf4c3a-37cf-494f-9f29-b0cb9aea1ca1`, build `staging-2026-10-07-6475704`, client `index-Bw-apdge.js`. Protocol 34 unchanged. Production health still reports `production-2026-10-06-2822d1a`.

Verification: production build and the 13 authority/wire/clue integration checks pass. The new `scripts/verify-case-visuals.mjs` uses the actual hosted client in GPU-rendered Chrome. Before repair it found the visible echo at world origin while the real case was at (-85.112,-6.66,41.269). Final check recorded the repaired build and loaded asset URLs: real case present, no orphan echo on fresh load or socket reconnect, rebuilt real case on reconnect, no runtime exceptions. Inspected world-origin screenshots before/after. The first immediate post-deploy browser run still observed the old echo; the subsequent build-identified check passed. No claim of a fresh human walk-up pickup test or broader clue-search acceptance.

Artifacts under `/home/halla/build/rat-detective/physical-clues-20261007`: `ghost-before/reconnect.json`, `ghost-after/world-origin.png` (ghost), `ghost-after-confirm/case-visuals.json` and `ghost-after-confirm/world-origin.png` (removed), plus `ghost-build.log`, `ghost-integration.log`, `ghost-deploy.log`. Rerun `ANGLE=vulkan node scripts/verify-case-visuals.mjs --url=https://rat-detective-staging.mayberrydt.workers.dev/ --out=<Halla artifact directory>`.

## Review links and staging receipt

- [Playable staging candidate](https://rat-detective-staging.mayberrydt.workers.dev/)
- [Stills, real-browser clip and interactive art fixture](http://100.105.117.93:5186/proof/)

Deployed from clean commit `7a9a8d2` with `npm run deploy:staging`: Worker `cb1d30f0-2b30-4e66-87ea-ab54993549ed`, build `staging-2026-10-07-7a9a8d2`, client `index-DKv9ulT3.js`. The prior staging build was `staging-2026-10-06-2822d1a`, with zero players and zero bots before deployment. Production health remains `production-2026-10-06-2822d1a`; no production deploy was run.

The hosted E2E passes: 244 frames, two clients agreeing on 31 exact authority frames, normal eight-bot roster, late join and same-player reconnect retaining the shared evidence (`hosted-e2e.json`). An ibara browser smoke check on AcePC AK2 entered actual Excessive Force gameplay, rendered city/rat/HUD and combat damage, and showed no old case locator. The agent tab was closed after checking. A hosted `muted=1` query is ineffective; the staging site was muted through Chrome instead. This smoke check does not establish searching, clue readability in live combat, or performance.

The gallery is served by the task's temporary Halla static server on port 5186. Its durable files are under the artifact directory below. No worker/service unit, machine migration or PR was created.

## What changed

The authority sheds a shared folder cluster after each 10 units of supported case travel. Only three nearby, in-view, unoccluded clusters render within 25 units. The list caps at 64. Evidence ages in three material/shape stages and expires after 25 seconds; a stationary endpoint stays, without pretending to be newly made. Possession changes keep truthful history. Relocation clears the episode. No trail is projected across flight, teleports, unsupported ledges or a returning case. Four support probes bound the rotated folder footprint.

The files have a steady red rim, pale paper, a rectangular folder tab and a coarse curled sheet. No text interaction, pickup or directional orientation. Shared evidence survives snapshot delivery, late join and room restoration. It travels as keyed deltas; pooled models/materials are warmed before play. Clue shedding/episode clears enter the existing city recorder, never a new storage write per frame.

Primary/extra case beacons, carrier x-ray ping flashes, the screen locator, death recap arrow and old one-second cosmetic footprints are removed from play. The carrier's ordinary visible red-hot appearance and own cosmetic heartbeat remain. Destination guidance, Hunch/Stakeout, combat buffs, weapons and mode targets remain. The wire still contains full authority state; this is a gameplay-information change, not anti-cheat redaction.

Bots cannot take a goal from a hidden loose case or global carrier ping. Nearby visible papers offer an ordinary investigation destination, using the same three coarse age stages and a three-cluster budget. Inspected papers are remembered until they expire. Existing movement and navigation are reused. Protocol **34**, mindVersion **13**, layout **7**.

## Verification and limits

Artifacts: `/home/halla/build/rat-detective/physical-clues-20261007`.

- App TypeScript and production build pass. Full test-project typecheck still hits the baseline missing `three-gpu-pathtracer` import in the old title fixture.
- `scripts/verify-case-clues.mjs`: 13 deterministic authority/physics/wire/restoration/perception checks pass; two compact receivers, 316 frames, 14 lifecycle events. Receipt `clue-integration.json` includes a source SHA-256.
- `scripts/verify-case-clues-ws.mjs`: real local GameRoom, two clients agree on authority frames; late join and same-identity reconnect retain evidence, with the normal 6–9 server bots. See `room-e2e.json`. Agent clients, not human performance evidence.
- `scripts/verify-idle-room.mjs`: all four phases pass, including zero ticks/writes/alarms after reconnect grace. See `idle-room.json`.
- Worker suite: initial 284 passed / 4 failed. The two timing-sensitive files pass on focused rerun (19 tests). The Evidence Tampering failure reproduces unchanged on the baseline; the rolled-roster timeout remains a full-suite timing limitation.
- Client suite: 1484 passed / 58 failed. Baseline comparison reproduces 20 failures. The other 38 involve removed locator/omniscient case-goal assumptions or resulting bot route behavior. They are retained visibly in `test-comparison.json`, not silently skipped or called green. Navigation fixtures need migration to observed objectives before production promotion; the focused new E2E does not replace that work.
- Script tests: 39/46 initially passed before a built dist existed; all seven failed fixture-preparation checks then passed (10/10 in the affected files).
- Eight static captures cover 1280×720 and 844×390 with 0.7 render scale, street, hidden corner, sewer and Blackout beam settings. These are fixture views, not production gameplay or a physical-phone test. Blackout uses shared beam parameters but is not the full live feel layer. The software-rendered clip was rejected as inadequate. A separate real-browser sewer recording from Dell Optiplex has 135 frames over 7.714 seconds, SHA-256 `c2c17f036171e1af8fb18d0d2950b972404ecbd5ed0676fc4bf1228fc4d8fc12`.

## Human comparison still required

Use baseline production and candidate staging, with the same people/device and Excessive Force first. Never start empty rooms or use a mode clock. Record the build, round and whether admin touched it; leave agent/admin rounds out of ordinary human comparisons. Set the next mode through existing admin controls if necessary, labeling that round.

| Scenario | What to observe | Baseline | Files candidate |
| --- | --- | --- | --- |
| Fresh spawn with no nearby lead | Time until first case contest; unexplained searching | Pending | Pending |
| Stationary carrier / loose case | Is the spill found without a global locator? | Pending | Pending |
| Turn, double-back, handoff | Does wear help, or send people the wrong way? | Pending | Pending |
| Jump / launcher / sewer transition | Can players recover the trail after the truthful gap? | Pending | Pending |
| Delivery / reconnect | Old episode disappears; current shared evidence remains | Pending | Pending |

Use the existing case takes, loose duration and kill/fight facts alongside watched recordings. A clue in view is not proof a person noticed it. Ask what they thought it meant. There is no invented acceptable search-time threshold: choose it against the baseline run. Files remain the first candidate; try wet prints only if players cannot read the paper evidence. No claim of human acceptance or production readiness.

## Reproduce

On Halla, in the branch checkout:

```sh
npm run build
node scripts/verify-case-clues.mjs
node scripts/with-local-worker.mjs -- node scripts/verify-case-clues-ws.mjs
node scripts/verify-idle-room.mjs --output /home/halla/build/rat-detective/physical-clues-20261007/idle-room.json
npx vite build --config vite.visual.config.ts --outDir /home/halla/build/rat-detective/physical-clues-20261007/visual
node scripts/capture-case-clues.mjs
```

The static fixture exposes an eight-second recorder and camera pass at the shared run speed (18 units/s). Software rendering is useful for stills, not frame-rate or gameplay acceptance. Do not overwrite the real-browser clip with the software capture. Production promotion remains separate.
