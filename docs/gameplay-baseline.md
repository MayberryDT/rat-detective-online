# Current gameplay preservation baseline

Reviewed **2026-09-10**, including the local [Dispatch Assignments](dispatch-assignments.md) update. The [08e8005 reference](verification/gameplay-baseline-08e8005.md) and dated shipped loop in current-state.md are historical. Do not restore their older muzzle, camera, models or map wholesale.

| Behavior | Current source / value |
| --- | --- |
| Human movement | 18; acceleration/braking 0.28 / 0.12 at fixed 60 Hz (`RatController.ts`) |
| AI movement | 12 on flat active-objective routes; 6.5 near goals/stairs, 8 for supported combat strafes (`ObjectiveBotBrain.ts`), independent of human speed |
| Keyboard jump | Base 16 × sqrt(1.28), extra jump-only gravity factor 1.28; world/ball gravity unchanged |
| Camera | Radius 6, pivot 3.5, shoulder 1.25, mouse sensitivity 0.002, obstruction checks |
| Ordinary ball | Speed 175, gravity −25, restitution 0.9, lifetime 5 seconds (`ballTuning.ts`) |
| Damage / round | 3 HP; body 1, head 3; assignment completion wins in version 2; 3-second respawn, 6-second victory |
| Case objective | 120-second shared held countdown, ten personal case kills at attributed kill time, or three personal paperwork deliveries. Whole landmarks rotate in shuffled cycles; carry the case at every delivery. Non-winning deliveries respawn the case at a random clear pickup site. Actual kills, no carrier multiplier. Legacy version 1 retains its existing deathmatch scoring |
| Evidence Tampering | Eight uncollectible ricocheting cases: lateral launch 145, shot redirect 160, lateral floor 140; floor hop 7, upward cap 10. Objective progress pauses; original progress resumes after expiry; cleanup/overlap cannot award progress |
| Assignment UI | Dark logo-purple textured cards; top-five case-kill/delivery races, top-left shared clock; notifications clear the reticle. Exterior-only yellow through-wall landmark silhouette; red case outline |
| Full scoreboard | Hold Tab for all lobby rows: mode score, kills, deaths, K/D, server case time, possession share, identity and live status. Translucent dark table; release/focus loss closes, wheel scrolls, held view updates through reset. Closing stats never determine its winner |
| Rat readability | Local outline hidden through death/respawn; opponents retain .025 thickness / .22 opacity. All rats retain 10% material color lift and .22 emissive fill; city ambient remains dark |
| Bot combat | 200–316.7 ms shot intervals, 2.8–5.6° held aim error; delayed reaction/observations/tracking retained |
| Ball readability | Yellow ordinary cheese with shaded pores; stronger red-orange enemy rims/trails. Crossfire bank shots turn red for every owner: yours stay shaded without an enemy glow/trail, enemy ricochets have brighter cores and glowing red rims/trails. Local prediction uses the same ordinary cheese material |
| Case/incident copy | Essential objective and suspension statuses remain. Sixty-four case jokes rotate by pickup/loss/taken/loose event; no repeated score-retention tutorials. Incident subtext is brief noir flavor |
| Big Cheese | Actual-radius sphere sweep against world and rat shapes; ordinary balls unchanged |
| Player collision | Spheres 0.6 at y0.6, 0.45 at y1.3, 0.28 at y1.9 |
| Shot origin | Animated barrel/muzzle pose via `muzzlePose.ts`; send resolved descriptor |
| Case | Opaque leather/document model, red outline, loose scale 2, normal scale carried at side |
| Main map | Version 2 shared city geometry, landmarks/interiors/sewers; Maintenance wall bench and supply cabinet share collision geometry. Old 12×12 source counts are not current scene counts |
| Dispatch readiness | Alternating red/blue roof beacons; nearest ready machine emits a 1.6-second whoop at most every four seconds within 85 units. Stops when busy |
| Accepted lighting | Nine-unit lamps on paired curb rows; lower ambient fill and four nearby overhead lights aligned with street/interior fixtures; no extra shadows. Interior fixtures have explicit power and rat-based landmark/floor selection, with bounded static pools. Existing sewer pool retained. `lighting=classic` restores previous illumination settings locally, keeping the new lamp layout |

The [September 9 ricochet/lighting receipt](verification/tampering-ricochets-lighting-2026-09-09.md) records case smoothing, rigid detail batching and the quieter Evidence Tampering buzz. Tyler subsequently said the cheese/interior/delivery build was feeling good and requested stronger shot color distinctions and case banter. See [the color/copy receipt](verification/crossfire-case-banter-2026-09-10.md) and the latest [Tab scoreboard/outline receipt](verification/tab-scoreboard-local-outline-2026-09-10.md). Human review of the new scoreboard and local outline change remains pending.

Incidents intentionally modify ordinary behavior; their current catalog is in [current state](current-state.md). Keep balls spherical and preserve the ordinary tuning when optimizing. No self-damage, no friendly-fire damage, no current minimap. A free-for-all game should not be documented as having teams.

The rat model is an evolution of the logo-inspired detective: coat/hat/face integration, clean ears, animated cheese pistol and side-held briefcase, flexible dragging tail, stronger walk, jump feedback, hit flash and exaggerated physical defeat. Keep those accepted directions rather than reviving rejected concepts.

Fixed-step controls, remote collision synchronization and visual interpolation are separate phases. Compare aim, visible muzzle origin, free flight, ricochets, head/body hits, case pickup/carry/disarm and death/respawn when touching those boundaries. Inspect visuals from the actual gameplay camera when requested; an overhead model shot cannot certify playability. The user currently handles gameplay input tests.

Performance claims need comparable seed, camera, population and workload. Distinguish draw calls, triangles, CPU submission, GPU time, authoritative tick gaps and network latency. Historical screenshots and a passing unit suite cannot prove that a later build feels identical.
