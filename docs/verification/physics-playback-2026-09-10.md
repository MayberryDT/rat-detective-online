# Shared physics playback — September 10, 2026

Tyler accepted the revised sounds, then clarified the remaining symptom: local movement/camera are smooth, while cheese balls, airborne bodies and the briefcase stutter. Shots can appear beside the gun after delayed confirmation. This supersedes the private preview in the [preceding audio/performance receipt](audio-performance-2026-09-10.md). Audio is unchanged in this follow-up; production is unchanged.

Subsequent playtest: Tyler reported that shared motion feels better but rejected the delayed/inconsistent gun response. The [responsive-shooting correction](responsive-shooting-2026-09-10.md) supersedes the local confirmation-only firing path and private preview below, while preserving this shared world playback fix. These measurements remain the original receipt.

## Confirmed playback defects and correction

The preceding ChaosPresentation used a 75 ms reserve, six samples, a clock offset adjusted on every packet and a render cursor that could advance beyond its 80 ms extrapolation edge. Late/batched delivery therefore held objects until snapshots caught up, then moved them forward abruptly. Delivery gaps over 500 ms discarded history. Balls and bodies also discarded their motion history at observed ricochets, even though loose cases already retained it.

The private correction keeps the playback cursor in simulation time and advances toward a 100–350 ms adaptive reserve at 90–110% speed. Its cursor stops at the existing 80 ms prediction edge without accumulating future debt. History is capped at 32 samples per object; a source/receipt gap of at least one second, clock reversal or teleport still resets it. New tracks join by removing at most 25 ms of initial clock correction per 100 ms, avoiding a freeze when the reserve exceeds the former fixed 300 ms joining blend.

Balls and corpses retain history across observed ricochets. Consistent single-bounce endpoint/velocity fits reconstruct the corner; inconsistent fits use observed endpoints. Received bounces block further extrapolation until a subsequent sample. A collision received before a birth's first draw still supersedes that birth. Expiry, hits/removals, case ownership and HUD changes remain authoritative and immediate.

The firing player's one confirmed ball now aligns its first draw with the current animated muzzle when the player moved or turned while awaiting confirmation. This render-only correction is limited to six units and expires over 100 ms; bounces cancel it. Server origin, resolved incident velocity and collisions remain unchanged. No guessed ball or second visual instance is created. Confirmation still incurs network delay.

## Verification

The prior 30-second private-room capture contained an 814.9 ms delivery gap and a 550 ms source-time gap. A deterministic replay applied those source/arrival timestamps to three continuous linear authoritative tracks (ball speed 175, corpse 95, case 145), rendered at 60 Hz and excluded the initial two seconds. Each track contributed 1,620 measured frames:

| Playback result | Preceding preview | Corrected preview |
| --- | ---: | ---: |
| Held moving frames | 372 (22.96%) | 38 (2.35%) |
| Backward steps | 1 | 0 |
| 95th-percentile displacement / nominal step | 2.00× | 1.10× |
| Largest displacement / nominal step | 41.32× | 1.10× |

This isolates playback timing, not actual collision trajectories, browser FPS or GPU performance. Long delivery gaps still cause brief holds; the result does not establish that server/network pauses disappeared. The committed fixture contains only relative arrival/source timings, not player state or credentials.

A separate replay of the actual decoded object states/IDs sampled all presented balls, bodies and the case. It retained identical aggregate visible-ball counts (303,059 across 1,800 frames). Presentation CPU was about .115 ms p95 before / .090 ms after in this run; small standalone timings are not a browser performance claim.

Focused tests: **34 passed**, covering captured delivery bursts for all three object types, frequent ricochets, new tracks joining a 350 ms reserve, starvation limits, immediate removals, reconnects, bounded birth IDs and normalized corpse rotation. Actual RatController, animated gun, ChaosSimulation and instanced ChaosView tests cover ordinary/Bad Ammunition/Scattershot shots with stationary and moving/turning owners. First-draw muzzle error is below 1e-5 units; there is one instance per real ID, and the render correction expires onto the unchanged authoritative trajectory.

Full validation: **834 tests** (130 Worker, 679 client, 25 scripts), typecheck, production build and visual build pass. Existing build chunk-size warnings remain. No automated browser gameplay/input checks were run; human acceptance of this playback correction remains pending. Evidence is in `output/physics-playback-2026-09-10/`.

## Private preview

[Open the refreshed preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-launcher-projectiles-v28&lighting=pools&revision=physics-playback-v31). Private Worker **`05695871-12cd-45e4-9153-f2215dc52f41`**, protocol **8**, expires **September 11 at 2:58 AM Pacific** (09:58 UTC). Same 16-rat full lobby, world version 2 / seed **718673434**. Bots yield to humans; the play link has no diagnostics.

Receipt: `output/hosted-capacity-deployment-2026-09-11T05-58-26-374Z/deployment.json`. All **140 source hashes** and **51 served files** match the frozen build. A six-second protocol check observed **148 valid snapshots**, one accepted owner birth, **118 remote shots without birth payloads**, 16 total rats and zero invalid packets/errors. It fired one upward protocol shot, then disconnected. No browser inputs were driven.

Entry asset `index-BG494RPv.js`; game asset `createGame-Ce0sMUK4.js`. The relay `rat-detective-launcher-projectile-preview.service` is active with restart-on-failure and zero restarts observed. It remains transient across host reboots. No production deployment or Git commit occurred; production remains protocol 7, Worker `8cacdb60-2ee0-4f63-b8bb-9f02de321719`, source `420bee2`.

Prior context consulted: `brain:sessions/2026/09/rat-detective-optimization-research-assessment-2026-09-10` and `brain:sessions/2026/09/rat-detective-remote-playback-fable`. These establish earlier playback investigations, not measurements of this candidate.
