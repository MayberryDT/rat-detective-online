# Authoritative muzzle delivery — September 10, 2026

Tyler rejected the preceding helper removal as incomplete: balls still first appeared several units ahead of the gun. This follow-up changes the actual shot-delivery and presentation path. It remains private; no Git commit or production deployment was requested or performed.

## Cause and correction

The animated muzzle descriptor was already used by `CheeseGun` and the authority. However, `GameRoom` excluded the firing player from `playerShot`, so that client first saw a later chaos snapshot. At speed 175, a 50 ms simulation advance moves a ball more than eight units before its first visible sample. Removing the guessed helper exposed this gap without fixing it.

`ChaosSimulation.shoot` now returns the actual emitted balls. `GameRoom` broadcasts their birth to the shooter and observers, with the original muzzle, real IDs, resolved velocities and simulation time. Using the simulation clock preserves ordering during bot catch-up steps. Bad Ammunition and Scattershot reuse the authority's actual volley; the client does not randomize another one. Protocol **8** requires matching client and server. Validation bounds each launch to one through five unique ball IDs, checks the original shot ID, finite time/vectors and normal launch speed. Existing connection budgets and pending-pose/shot ordering remain in effect.

`ChaosPresentation` creates one history track per actual ball. Its first **draw**, even when a subsequent snapshot has already arrived, uses the transmitted muzzle sample. That same ball then advances through its history while gradually acquiring the existing interpolation delay. `ChaosView` draws it through the existing ball instances and materials. The local gun still animates and sounds immediately; its server echo creates no second gun effect. No guessed projectile, extra mesh, forward-shifted origin or rewind of an already visible ball was introduced.

Known hit/removal suppresses an undrawn birth; known ricochet replaces the initial flight sample. Duplicate events do not replay the muzzle. Pending births expire after 500 ms, shots remain capped at 256, recent launch IDs at 512, and sample history at six. Reset/disposal clears the state. Camera, projectile physics, damage, ordinary speed, 2.5-second lifetime, diagonal Bad Ammunition tuning and the preceding launcher sound changes remain.

This still waits for the server's acceptance over the network. The correction does not claim zero input-to-ball latency or compensate the muzzle for movement during that round trip. Human visual acceptance remains pending.

## Verification

- Real shoulder-camera, animated-rat, gun, simulation and instanced-renderer regressions cover ordinary, Bad Ammunition and Scattershot. They deliver a snapshot with more than eight units of travel before the first display frame, then verify first-draw positions match the muzzle within `1e-5`, one instance per server ID, and forward travel on the next frame.
- Presentation tests cover delayed first draw, duplicate births, actual volley velocity, authoritative hit/removal and ricochet before drawing, bounded pending state and cleanup. Worker tests verify the shooter receives the actual launch and reject malformed launch payloads, including combined movement delivery.
- Full `npm test`: **822 passed** (130 Worker, 667 client, 25 script). `npm run typecheck`, `npm run build` and `npm run visual:build` pass. Existing large-chunk build warnings remain.
- No automated browser gameplay/input test, screenshot review or real-phone performance claim. Tests establish packet/rendering behavior; the user evaluates shot appearance and feel.

## Refreshed private preview

[Open the preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-launcher-projectiles-v28&diagnostics=quiet&lighting=pools&revision=muzzle-v29). Expires **September 11 at 2:01 AM Pacific** (09:01 UTC). Dedicated private Worker `177cf776-78bc-4c5d-9ade-d23a51d4fc0d`, protocol **8**, same room `graybox-benchmark-ai-launcher-projectiles-v28`, world version 2 / seed **718673434**. The full lobby retains 16 total rats, bot replacement on human join and ten-second refill.

The prior relay was stopped before the private deployment, then recreated with the matching frozen client under `rat-detective-launcher-projectile-preview.service` on loopback port 5190. `Restart=on-failure` and a three-second retry remain; it is a transient service. All **140** recorded source hashes match the workspace; all **51** served files match the frozen client. A six-second passive connection saw 16 rats (15 bots plus probe), **179 valid snapshots**, **165 authoritative launch events / balls**, zero invalid packets and zero errors, then disconnected. The service is active with zero restarts observed.

Deployment receipt: `output/hosted-capacity-deployment-2026-09-11T05-01-46-303Z/deployment.json`. Verification and preview metadata: `output/authoritative-muzzle-2026-09-10/`. Entry asset `index-CwK6_1SQ.js`; deferred game asset `createGame-LsC3BGtP.js`. Production remains protocol 7, Worker `8cacdb60-2ee0-4f63-b8bb-9f02de321719`, at `https://ratdetective.online/`.

Prior GBrain context: `brain:sessions/2026/09/rat-detective-launcher-projectile-cleanup-2026-09-10` records the incomplete first pass; `brain:sessions/2026/09/rat-detective-parked-vehicles-tailor-frontage-leather-case-2026-09-07` records why the old stationary muzzle rewind was rejected. This implementation retains only the actual birth until the first draw, then advances the same shot.

## Subsequent audio/performance feedback

Tyler reported soft audio and whole-game stutter after further testing. The [audio/performance follow-up](audio-performance-2026-09-10.md) narrows birth delivery to the firing player, restores ordinary observer packets/playback, reuses pending-shot lists and removes synchronous history writes during quiet diagnostics. It also restores the earlier stronger gun gain and eases world attenuation. That receipt supersedes the preview above and records what remains unproven about the stutter.
