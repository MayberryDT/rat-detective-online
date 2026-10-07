# P4 — physical case files: private experiment

7 October 2026. Tyler: “do it all” after the research sequence. Branch `feature/physical-case-clues`, based on production-ancestry receipt `6af05f2` (gameplay `2822d1a`). Halla checkout `/home/halla/workspaces/rat-detective-physical-clues`. Canonical Veelox checkout and its dirty work are preserved.

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
