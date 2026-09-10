# Current gameplay preservation baseline

Reviewed **2026-09-09**, including the local [Dispatch Assignments](dispatch-assignments.md) update. The [08e8005 reference](verification/gameplay-baseline-08e8005.md) and dated shipped loop in current-state.md are historical. Do not restore their older muzzle, camera, models or map wholesale.

| Behavior | Current source / value |
| --- | --- |
| Human movement | 18; acceleration/braking 0.28 / 0.12 at fixed 60 Hz (`RatController.ts`) |
| AI movement | 6.5 (`ObjectiveBotBrain.ts`), independent of human speed |
| Keyboard jump | Base 16 × sqrt(1.28), extra jump-only gravity factor 1.28; world/ball gravity unchanged |
| Camera | Radius 6, pivot 3.5, shoulder 1.25, mouse sensitivity 0.002, obstruction checks |
| Ordinary ball | Speed 175, gravity −25, restitution 0.9, lifetime 5 seconds (`ballTuning.ts`) |
| Damage / round | 3 HP; body 1, head 3; assignment completion wins in version 2; 3-second respawn, 6-second victory |
| Case objective | 120-second shared held countdown, ten personal case kills at attributed kill time, or six whole-landmark visits in a shuffled order, carrying the case at every stop. Actual kills, no carrier multiplier. Legacy version 1 retains its existing deathmatch scoring |
| Evidence Tampering | Eight uncollectible ricocheting cases: lateral launch 46, shot redirect 72, lateral floor 32; floor hop 7, upward cap 10. Objective progress pauses; original progress resumes after expiry; cleanup/overlap cannot award progress |
| Assignment UI | Dark logo-purple textured cards; top-five case-kill race, shared clock, or six-stop destination card. Exterior-only yellow through-wall landmark silhouette; red case outline |
| Player collision | Spheres 0.6 at y0.6, 0.45 at y1.3, 0.28 at y1.9 |
| Shot origin | Animated barrel/muzzle pose via `muzzlePose.ts`; send resolved descriptor |
| Case | Opaque leather/document model, red outline, loose scale 2, normal scale carried at side |
| Main map | Version 2 shared city geometry, landmarks/interiors/sewers; Maintenance wall bench and supply cabinet share collision geometry. Old 12×12 source counts are not current scene counts |
| Dispatch readiness | Small rotating red roof beacon; nearest ready machine emits a .72-second siren at most every seven seconds within 40 units. Stops when busy |
| Lighting trial | Lower ambient fill and four nearby overhead lights aligned with street/interior fixtures; no extra shadows. Existing sewer pool retained. `lighting=classic` restores previous lighting locally |

The [September 9 ricochet/lighting receipt](verification/tampering-ricochets-lighting-2026-09-09.md) records case smoothing, rigid detail batching and the quieter Evidence Tampering buzz. Human feel validation remains pending.

Incidents intentionally modify ordinary behavior; their current catalog is in [current state](current-state.md). Keep balls spherical and preserve the ordinary tuning when optimizing. No self-damage, no friendly-fire damage, no current minimap. A free-for-all game should not be documented as having teams.

The rat model is an evolution of the logo-inspired detective: coat/hat/face integration, clean ears, animated cheese pistol and side-held briefcase, flexible dragging tail, stronger walk, jump feedback, hit flash and exaggerated physical defeat. Keep those accepted directions rather than reviving rejected concepts.

Fixed-step controls, remote collision synchronization and visual interpolation are separate phases. Compare aim, visible muzzle origin, free flight, ricochets, head/body hits, case pickup/carry/disarm and death/respawn when touching those boundaries. Inspect visuals from the actual gameplay camera when requested; an overhead model shot cannot certify playability. The user currently handles gameplay input tests.

Performance claims need comparable seed, camera, population and workload. Distinguish draw calls, triangles, CPU submission, GPU time, authoritative tick gaps and network latency. Historical screenshots and a passing unit suite cannot prove that a later build feels identical.
