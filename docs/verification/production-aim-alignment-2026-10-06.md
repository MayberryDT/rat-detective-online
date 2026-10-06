# Production-path aim correction — 6 October 2026

Tyler authorized live release of an evidenced aiming correction. **Not deployed:** release serialization from the coordinator is required after the concurrent data-cost release. Heavy Cheese remains accepted and isolated; it is not included in this aim-only candidate pending the separate scope answer. Human aiming acceptance is still open.

Candidate: `/home/halla/workspaces/rat-detective-production-aim-20261006`, branch `review/production-aim-20261006`, based on `aa5cdd0` (descends from canonical `4041deb`). It preserves the data-cost implementation. Neither canonical main nor the accepted Heavy Cheese worktree was changed by this correction.

## Cause and correction

GameSession refreshed the controller camera and passed that restored view to CheeseGun, while its ordinary render composed FeelDirector offsets. Thus the stationary center crosshair showed a different target during camera kick. Normal press, touch and Tommy repeat all converge on the same `shoot` method.

The candidate composes the existing offset around actual CheeseGun target selection and muzzle descriptor generation, restores in `finally`, then adds the new shot impulse and sends unchanged movement/shot messages. Fresh input still updates the controller before composition. Arming/shorted/dead/results/observer gates remain before firing. No trajectory, damage, collision, gravity, bounce, cadence, sensitivity, aim assist, protocol or Worker gameplay changes. CameraFeel changes only its obsolete comment; foundation wording records the corrected invariant.

## Measured result

Six actual GameSession shots in each final run have unique IDs, matching authoritative launch descriptors, `first-step`, one or more `world-bounce` contacts with points/normals, and `lifetime`. No rejection or synthetic positive damage was used. Both browser error arrays are empty. The ordinary trigger held for 350 ms emitted one shot, not repeats. Real lateral/jump input changed position by (2.648, 3.242, 0.170) units before and (3.618, 4.078, 0.232) after at the sampled shot; these are pose differences, not a maximum jump-height measurement.

| Scenario | Before rendered-target / initial muzzle-line offset (CSS px) | After (CSS px) |
| --- | ---: | ---: |
| Rest | < 4e-12 | < 4e-12 |
| Sampled residual kick | 0.0256380941 | < 5e-12 |
| Settled recovery | < 4e-12 | < 4e-12 |
| Fresh mouse input | 0.0225993761 | < 6e-12 |
| Movement/jump | < 2e-11 | < 5e-12 |
| Normal trigger held | 0.0038401075 | < 2e-12 |

The before error is small at these sampled timings and stock 60% camera setting; this is not a peak-kick measurement and does not explain the full severity of Tyler's complaint. Correction is established by the independently rendered trigger view and the real emitted/authority-accepted descriptor, not two calls to an aim helper. World contacts verify actual simulation, **not body/head hit qualification**. Different private rooms/spawns, timing and world geometry mean this is not an identical trajectory replay or a required change in contact region.

Open Halla's `review.html` in the evidence directory for ordinary versus diagnostic rendered frames and full HUD screenshots. `measurements.json` includes exact shot IDs and authority contact data; `validation.json` asserts each launch descriptor matches the emitted one and all IDs reach contacts/lifetime. The candidate [GameSession source](/home/halla/workspaces/rat-detective-production-aim-20261006/src/session/GameSession.ts:344) is separate from canonical source pending integration.

## Evidence method and limitations

Evidence scripts and output are Halla-only under `/home/halla/build/rat-detective/production-aim-2026-10-06`. `build-evidence.mjs` uses Vite transforms to add read-only diagnostics to separate before/after bundles. The release source and `clean-site` contain no hooks. Both use actual GameSession, NetworkManager and CheeseGun, connected to local Wrangler's actual GameRoom/ChaosSimulation at loopback ports 5201/5202. A named `graybox-practice-*` room selects the current city without bots/Jev or production access. Browser input uses the corrected one-global-coordinate CDP mouse state; each label is assigned only after a real new descriptor is observed.

`scenarios.md` and the driver were prepared before the correction. Original attempts are retained: `legacy-world-capture` used an arbitrary named room (legacy world, no current chaos outcomes); `initial-current-city-capture` has real authority outcomes but previous-frame movement/spawn differences and non-acknowledged click labels are not exact targeting qualification. The initial short first-frame timeout is retained too. These are not the release proof.

The final driver retains the ordinary last framebuffer and adds an explicitly **evidence-only trigger-time render** after fresh input, with the existing composed camera, before actual firing. This extra draw isolates current-input alignment from legitimate movement since the previous frame. It renders actual scene geometry; it does not inject a hit, change state/weapon, or replace authority. Calculation projects the emitted initial muzzle line against the target in this real trigger-time image. The actual later `playerShot` and `shotResult` messages are correlated by shot ID, including world contact points. A ballistic world contact need not coincide with the initial line because gravity and swept radius remain physical.

Initial SwiftShader attempts stalled shader warm-up, delayed delivery acknowledgments and reconnected/lost pointer lock; their failed/partial artifacts remain retained. The final runs use already-accessible Halla AMD hardware through headless ANGLE/Vulkan (probe in `gpu-probe.html`), with a playable-state/pointer-lock check. No desktop lease, access broadening, native input, subjective audition or production rollout occurred. Synthetic-input/readback timing is not latency evidence. Decorative geometry differs from legal spheres. The final fullstack captures use the ordinary gun and world surfaces, not a rat target or Tommy inventory. The existing `touchFiring` test exercises held Tommy repeats and expiry through GameSession; existing arsenal tests cover laser reflections/headshots and trap placement. Those passing tests are not a fullstack Tommy/laser/trap playtest. Body/head contact, live Tommy inventory, network-delay injection and native aim acceptance remain unqualified here.

## Checks

Main source TypeScript passes; clean Vite build passes. Existing session/muzzle tests: 21 pass after replacing their incomplete fake camera with a real PerspectiveCamera (fixture only, no added test/assertions). Existing CameraFeel tests: 6 pass. Existing touch firing, controls telemetry, remote presentation and arsenal tests: 21 pass. Full test-project TypeScript is blocked by its existing `test/visual/title-scene.ts` import of absent `three-gpu-pathtracer`; no dependency was installed just for this check.

The coordinator must review this isolated candidate and send the explicit release serialization event before shared branch mutation or any deployment. No completion/live IDs are claimed.

## Reproduction and cleanup

From the Halla evidence directory, the recorded commands are `MODE=before node build-evidence.mjs`, `MODE=after node build-evidence.mjs`, then each `MODE=before|after node consumer.mjs`, followed by `node analyze.mjs`. For another run, copy the evidence scripts to a fresh build root and adjust their explicit output paths to preserve these artifacts. Start the generated local configs with the existing Wrangler CLI:

```sh
node /home/halla/build/rat-detective/research-2026-10-06/deps/node_modules/wrangler/bin/wrangler.js dev \
  --config <fresh-root>/before/wrangler.json --port 5201 --ip 127.0.0.1 \
  --inspector-port 9301 --persist-to <fresh-root>/before/state --local --show-interactive-dev-session false
# After uses after/wrangler.json, port 5202, inspector 9302 and after/state.
```

Both own browsers exited; local evidence Worker services `rat-production-aim-before` and `rat-production-aim-after` were stopped. Accepted range service `rat-detective-shooting-review` on 5197 remains active and untouched. No unattended local room, paid Jev, production/admin interaction, new agent, shared-branch mutation or deployment occurred. Chartroom tools were unavailable. The original research, accepted Heavy Cheese source and unrelated data-cost work are preserved. The scoped commit candidate includes GameSession, CameraFeel comment, the existing test-camera fixture, foundation wording and this receipt; the coordinator owns independent review, integration and serialized release.
