# Responsive single-ball shooting — September 10, 2026

Tyler reported that shared movement feels better after the playback correction, but shooting feels delayed, inconsistent and sometimes invisible. The [preceding correction](physics-playback-2026-09-10.md) waited for server confirmation before drawing the local ball. A short flight could end before that confirmation's first render frame. The accepted audio mix and shared world playback are unchanged in this follow-up.

Subsequent human playtest: Tyler accepted this final preview and requested a commit. This accepts the launcher/projectile follow-up and the final responsive shooting path; production publication was not requested.

## Firing and authority

After a successful shot send, ChaosView starts one local entry per real ball ID in its existing instanced pool. First draw is at the animated muzzle; flight begins on the next frame without waiting for the network. There is no separate helper mesh. Confirmation consumes the same entry and does not replay the muzzle, gun animation or audio. Stale snapshots from before confirmation cannot erase it; a confirmed removal retires its ID so a late echo cannot resurrect it.

`shotPattern.ts` resolves volley IDs and velocities identically on client and server, seeded from the trigger's random UUID. Bad Ammunition retains 70/20/10 percent one/two/three-ball odds and diagonal .12–.24 rad deflections; Scattershot retains its five-ball fan. The authority still chooses its current incident and validates the input. Confirmation corrects membership/direction if an incident changes during transit. No guessed straight Bad Ammunition shot is drawn first.

Local sweeps affect presentation only. Damage, hit markers, impact cues, score, case/corpse impulses, incident outcomes and final removal remain server-owned. Reconciliation replays an authoritative sample for at most 500 ms / 30 steps to the local flight age. Small corrections blend over 100 ms; larger corrections take authority directly. Local sweeps can hide an estimated rat contact but never damage it or publish a hit. Unconfirmed shots expire after 750 ms; active entries share the 256-ball cap, retired IDs are bounded to 512, and round reset/disposal clears both. Network delays can still delay confirmed hits or require visible corrections, particularly around moving targets or incident boundaries.

The existing spatial ray index now supports caller-selected collision groups and filtering before closest-hit selection. The local owner cannot mask a wall behind it. Ordinary server queries retain their original defaults and exact-hit behavior. Gun disposal detaches the query's world listeners. No extra physics world, extra live light, new mesh per shot or changed input cadence was introduced. Shared speed175, gravity−25, restitution.9, lifetime2.5 seconds remain.

## Checks and measured limits

- Initial focused application checks: **133 passed**. Final spatial/query subset: **65 passed**, including owner exclusion under SAP and naive broadphases, collision masks and disposal.
- Simulated **50/150/400 ms confirmation delays**: one ball appears immediately, moves before confirmation, remains the same ID and does not rewind at handoff. A close-range ball is visible before the server reports its hit. Stale snapshots, duplicate confirmations, authority removal, rejected/unacknowledged expiry, incident boundaries, local bounces and Delayed Reaction release are covered.
- Actual RatController, animated CheeseGun, ChaosSimulation and instanced ChaosView tests cover ordinary, Bad Ammunition and Scattershot. First draw at 8 ms is within **1e-5 units** of the real muzzle; by 24 ms each ball has travelled over **2.7 units**, before the 150 ms confirmation. One instance per server ID remains after confirmation and subsequent snapshots. Session wiring predicts only after successful send; tap-only mobile tests still pass.
- A 10-second code replay used **50 Scattershot triggers**, 150 ms round trip and a **1,435-body real city collision world**, reaching **65 visible own balls**. The initial all-body ray approach cost **10.90 ms p95** per apply/confirm/render call and was not published. Indexed sweeps reduced that to **.622 ms p95**, maximum **5.94 ms** including index preparation, with identical **174,970 rays** and peak visible count. These are individual code-call timings, not complete browser frames or a human FPS claim.
- Full validation: **856 tests** (130 Worker, 701 client, 25 scripts), typecheck, production build and visual build pass. Existing build chunk warnings remain. No browser gameplay/input automation was performed. Tyler subsequently accepted the firing feel in the human playtest noted above.

Evidence: `output/responsive-shooting-2026-09-10/`. The preceding frozen build's gun/launcher/common audio files, ordinary ball tuning and ChaosPresentation are byte-identical to this candidate. New client modules are `LocalShotPresentation.ts` and `shotPattern.ts`; the shared world smoothing fix is retained.

## Refreshed private preview

[Open the updated shooting preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-launcher-projectiles-v28&lighting=pools&revision=responsive-shooting-v32). Worker **`6fe9fa40-3f32-4329-914f-1b3aa79a4a27`**, protocol **8**, expires **September 11 at 3:27 AM Pacific** (10:27 UTC). Same room and world version2 / seed **718673434**, 16 total rats with bot replacement on human join. Diagnostics are absent from the normal play link.

Receipt: `output/hosted-capacity-deployment-2026-09-11T06-27-45-809Z/deployment.json`. Verified all **142 source hashes** and **51 served files** against the frozen build. A six-second protocol check received **184 valid snapshots**, one accepted owner birth and **165 observer shots without birth payloads**, with zero invalid packets/errors. The check fired one upward protocol shot and disconnected; no browser input was driven. Entry asset `index-BHIrxd5v.js`, game asset `createGame-B9sgfWo5.js`.

The relay `rat-detective-launcher-projectile-preview.service` is active with restart-on-failure and zero restarts observed; it remains transient across host reboots. At preview preparation, no Git commit or production deployment had occurred. The subsequent acceptance authorizes the commit; production remains unchanged. Production remains source420bee2, protocol7, Worker `8cacdb60-2ee0-4f63-b8bb-9f02de321719`.

Prior GBrain context: `brain:sessions/2026/09/rat-detective-bad-ammo-prediction-fix` records why the old independent straight helper was misleading. The new shared seeded pattern and one instanced entry address that mismatch while restoring immediate local flight.
