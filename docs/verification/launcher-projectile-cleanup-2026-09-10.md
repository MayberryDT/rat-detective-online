# Launcher sound and projectile cleanup — September 10, 2026

Local changes requested by Tyler after the accepted production lighting release. Starting workspace was clean. Implementation initially made no commit, service restart or deployment. The subsequently requested private preview is recorded below; production remains the version recorded in [current state](../current-state.md).

## Changes

- **Pressure Surge and ordinary launcher activation:** the original `PressureMachine` synth used `.85 / (1 + distance / 260)`, horizontal-only distance, and a gain fixed at activation. It now delegates to `LauncherAudio`. Both mechanical impact and air tail share a `.85 × .7 = .595` ceiling, the common 3D world fade, and a linear source-range factor from eight units to silence at 120. At 100 units the resulting gain is about 1.75% of the nearby ceiling. Playing tails update as the camera moves, with smooth gain changes, stereo direction and no repeat scheduling of unchanged gains. Noise is reused, simultaneous voices are capped at 12, and ended/disposed voices disconnect every node. The sound itself and launcher physics/timing remain unchanged.
- **Cheese lifetime:** shared `BALL_LIFETIME` drops from five seconds to **2.5 seconds**, covering authority, legacy local balls, incident children and restoration of saved shots. Speed 175, gravity −25, restitution .9, ball geometry, colors, damage and owner immunity remain.
- **Duplicate ball:** removed `CheeseGun`'s guessed projectile creation, half-second pending pool, reconciliation and prediction diagnostics. `GameSession` still sends the actual animated muzzle origin and camera-resolved direction immediately. Gun animation, attached muzzle flash and audio remain immediate; the authoritative view renders actual server balls. No projectile origin shift, artificial muzzle rewind or replacement ghost was added. The first visible authoritative ball still depends on snapshot arrival.
- **Bad Ammunition:** direction changes narrow from .12–.50 radians to **.12–.24 radians** (roughly 7–14°). Each random quadrant allows 30–60° azimuth within that quadrant, so both the horizontal and vertical offsets around the aim direction are present. All four diagonal directions remain possible. One/two/three-ball odds remain 70/20/10, with normal speed and no delayed extras. These additional incident balls are real projectiles.

## Verification

- Focused audio/projectile/session checks: **104 tests passed**.
- Full `npm test`: **814 tests passed** (129 Worker, 660 client, 25 script).
- After correcting test fixture types and using the authored pad height, the focused launcher/session rerun passed **18 tests**.
- `npm run typecheck`, `npm run build`, `npm run visual:build`, `git diff --check` and relative links in all six changed documents passed. Both builds retain the existing large-chunk warning.
- Checks cover all six simultaneous launcher activations, near ceiling, distant/vertical cutoff, moving/parented listeners, sound-layer routing, deduplication, bounded voices and disposal; all incident modes without guessed balls; actual muzzle origins and reticle convergence; 2.5-second expiry and saved older shots; diagonal bounds across horizontal, oblique and vertical aim; incident expiry, shot counts, speed, damage and existing projectile presentation.

Human listening and gameplay review are pending. No browser gameplay/input automation, screenshot review, real-phone performance measurement or live multiplayer test was performed. These tests establish behavior and bounds, not subjective sound/shot readability.

Prior context: GBrain `brain:sessions/2026/09/rat-detective-bad-ammo-prediction-fix` documented the earlier Bad-Ammunition-only prediction suppression. This follow-up removes those guessed balls for every authoritative firing mode.


## Requested full-game preview

Tyler subsequently requested a playable preview. [Open the full-game preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-launcher-projectiles-v28&diagnostics=quiet&lighting=pools). It expires **September 11, 2026 at 1:29 AM Pacific** (08:29 UTC).

Only the dedicated authenticated `rat-detective-capacity-test` Worker was deployed, using the current dirty source and matching frozen client. Private version `ba03d6a9-06a0-4ff5-9175-a316e6e93051`, protocol 7, room `graybox-benchmark-ai-launcher-projectiles-v28`, world version 2 / seed 718673434. The lobby fills all 16 slots with bots, yields one per human join and refills vacancies after ten seconds. Loopback port 5190 is served by `rat-detective-launcher-projectile-preview.service`, which closes at fixture expiry. The previous full-game relay had expired; stationary target practice on 5193 remains active. Production is unchanged.

Verified all 140 recorded source hashes against the workspace and all 51 served files against the frozen build. A six-second passive connection received 164 valid snapshots, with 16 rats (15 bots plus probe), zero invalid packets and zero errors; the probe disconnected afterward. This checks asset/protocol readiness, not input or human audiovisual acceptance. Earlier application tests/builds apply to the unchanged source.

Deployment receipt: `output/hosted-capacity-deployment-2026-09-11T04-29-58-059Z/deployment.json`. Preview/readiness evidence: `output/launcher-projectile-preview-2026-09-10/`. Entry asset `index-Cd5S8Qm2.js`; deferred game asset `createGame-B5xARwbJ.js`. No Git commit or production deployment.


## Preview recovery after host reboot

At 9:47 PM Pacific on September 10, Tyler reported the preview unavailable. The host had rebooted at 9:36:54 PM; the temporary user service and port-5190 listener were absent. Authenticated private upstream health still matched the unexpired fixture, so no Worker redeployment or application change was needed. This establishes the preview interruption's cause, not the reason for the host reboot.

Recreated `rat-detective-launcher-projectile-preview.service` for the same frozen client, receipt, room and 1:29 AM expiry. Added `Restart=on-failure` with a three-second delay for process failures; the service remains transient and does not survive reboot. All 51 served files still match. A six-second passive connection saw 16 rats and 172 valid snapshots, with zero invalid packets/errors, then disconnected. Relay health is good, service active, zero restarts observed. Recovery evidence: `output/launcher-projectile-preview-2026-09-10/reboot-recovery-readiness.json`. Production unchanged; no gameplay/input test or commit.

## Muzzle appearance correction after human feedback

Tyler reported that removing the guessed ball left the real ball appearing several units ahead of the muzzle. The first pass above did not resolve that presentation gap. The subsequent [authoritative muzzle delivery correction](authoritative-muzzle-2026-09-10.md) sends actual server births to the shooter and preserves the muzzle sample through the first draw of the same real ball. It supersedes this receipt's snapshot-only presentation and private protocol-7 preview; the other gameplay/audio changes remain. The linked receipt records the refreshed protocol-8 preview and checks.
