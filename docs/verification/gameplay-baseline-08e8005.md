# Historical baseline: commit 08e8005

These values and scene counts describe the early game. They are not all current tuning. See [current baseline](../gameplay-baseline.md).

# Gameplay preservation baseline

Reference source commit: `08e8005`. Baseline values are taken directly from that revision; they are not performance measurements.

| Behavior | Reference |
|---|---|
| Move speed | 18 |
| Acceleration / braking | 0.28 / 0.12 per frame at the selected 60 Hz baseline |
| Turn smoothing | 0.35 per frame at 60 Hz |
| Jump velocity | 16 |
| Camera | radius 6, pivot height 3.5, mouse sensitivity 0.002; direct spherical positioning |
| Projectile | speed 175, gravity -25, restitution 0.9, lifetime 5 seconds |
| Shot origin | rat position + 1.45 Y, then 0.6 forward along resolved aim |
| Damage | body 1, head 3; max HP 3 |
| Collision shapes | body sphere 0.6 at Y0.6; chest 0.45 at Y1.3; head 0.28 at Y1.9 |
| Outline | normal expansion 0.025, opacity 0.25, additive backfaces, coat-tinted white |
| Renderer | ACES, exposure 1.1, sRGB, antialias; pixel ratio capped at 2 |
| City | 12x12; spacing 30; road width14; building width/depth8–14, height18–85 |

Keep materials, lighting, model geometry, projectile calculations, camera positioning and collider shapes while changing ownership. Explicit correctness changes: shared seeded collision layout, safe spawns, exclude cosmetics from aim targets, synchronize transmitted trajectories, restore respawn visuals, normalize timing to 60 Hz. These require regression comparisons rather than a claim of byte-identical behavior.

## Comparison scenarios

Use one room seed and matching camera/viewport. Capture all three hats alive, turned, damaged, dead and respawned. Verify local/remote rat consistency. Compare shot origin and direction, free flight, wall ricochet, head/body hits, and repeat death/respawn. Compare input at 30/60/144 Hz with the 60 Hz baseline preserved.

Record scene object counts separately from visible draw calls. Measure frame-time percentiles and renderer.info in identical camera/viewport/seed conditions before claiming FPS gains. The source baseline contains 1008 separate dash meshes, 144 buildings, 24 roads, and an expected 432 lamp-part meshes. Actual visible draw calls depend on the camera and shadows.

## Simulation timing contract

Controls, remote interpolation, Cannon physics, and projectiles advance at fixed 1/60-second ticks. A frame contributes at most 50 ms (three ticks); reconnect clears accumulated time. Controls precede physics, then local presentation is synchronized before projectile queries. Render-only frames update the camera without advancing gameplay. Acceleration, braking and turning retain their 60 Hz factors. Ground contact grants 80 ms of edge-jump grace, cleared by jumping, respawning and authoritative position correction. This replaces the original unlimited permission to jump after walking off a ledge.
