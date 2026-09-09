# Remote playback follow-up — September 8, 2026

The human playtest reported improved local response but persistently choppy remote rats. Earlier compact transport and once-per-frame animation changes did not resolve that observation. This follow-up changes only remote pose playback and the private preview tooling; it does not certify the visual result or 100-player gameplay.

## Evidence and implementation

A passive 15-second capture from the six-bot private room recorded 1,074 movement messages. One continuously moving rat had 229 updates (about 15 Hz effective), arrival-gap p95 100.45 ms, maximum 148.11 ms, median displacement 0.428 units and no equal server timestamps. Other tracks included long gaps consistent with deaths/respawns or stationary motion. Since the capture did not record lifecycle events, those tracks' large jumps must not be interpreted as interpolation faults.

Replaying that continuously moving track at 60 Hz through the original buffer held position on 24.40% of frames. Its p95 root step was 0.411 units. The final candidate held 0.45% of frames, with p95 step 0.125 and maximum step 0.282 units (previous maximum 0.431). These are offline root-motion measurements, not browser animation/FPS measurements. The passive observer adds one temporary client and leaves afterward.

`SnapshotBuffer` now:

- Advances a playback clock at 90–110% speed to approach the target delay instead of abruptly freezing or jumping when the delay changes.
- Stops that clock at the newest known pose when data runs out, preventing accumulated catch-up time.
- Includes recent transit lateness above the best clock mapping in its delay budget, bounded to 100–350 ms. The measured moving track ended near 222 ms; healthy 20 Hz delivery approaches 100 ms.
- Shifts the playback cursor with buffered timestamps when a better clock mapping arrives, preserving displayed position.
- Preserves bounded history, no extrapolation, shortest-arc rotation, legacy fallback, respawn barriers and teleport/gap resets. Initial playback is clamped to available history.

Animation still derives motion from the rendered root once per display frame. No extra animation flags, physics tuning, local movement delay or projectile changes were introduced. Increased remote presentation delay can affect aiming/interaction feel, even though the version-2 Worker owns damage. That tradeoff needs human evaluation.

## Fable consultation

The user explicitly requested advice. One consultation used the installed shell advisor with the existing parent task and stable blocker `remote-rat-playback-jitter`, model `claude-fable-5-1[thinking=true,context=300k,effort=medium]`. Advisor worker `a8b00539-4de3-49dd-8c23-f9cd870d4c13` completed successfully, was independently reviewed/accepted as advice, and its process was released. No paid connectivity test or alternate model was used.

Accepted advice: the playback-clock diagnosis is plausible; preserve the rendered cursor when the clock mapping shifts; test starvation, changing lateness and lifecycle behavior; do not equate replay improvements with the human result. The clock-refinement regression passes. Fable's suggestion that this capture used clean bot simulation timestamps was incorrect: these six headless network clients use server receipt timestamps, as human network clients do. Production server-owned bots differ.

Deferred advice: a fixed 300 ms human A/B control and longer browser-side counters may distinguish remaining rendering or delivery issues. A failed fixed-delay trial would not by itself categorically exclude all buffer bugs. The all-time minimum mapping can accumulate error under sustained drift/backlog; this bounded change does not add sliding-window remapping without longer evidence. The earlier 1.59-second load-test stall remains unresolved.

Artifacts: `output/remote-playtest-motion.json`, `output/analyze-remote-motion.mjs`, `output/SnapshotBuffer-before.ts`, `output/remote-playtest-replay-results.txt`. The baseline source copy is retained for comparison; the repository already had extensive unrelated pending edits.

## Validation and private handoff

**447 tests passed** (89 Worker, 348 client, 10 script), typecheck and build passed. The existing bundle-size warning remains. Regression checks cover sustained 120 ms extra transit delay, starvation/resume without catch-up bursts, clock-refinement continuity, steady gait at 30/60 Hz, 120/144 Hz presentation, collision alignment, respawns and cleanup. Existing tests sample within the newly budgeted interpolation window instead of assuming the old delay ceiling. No assertions were deleted to hide failed behavior.

The private relay on **http://127.0.0.1:5190/?room=graybox-benchmark-human-playtest** now serves `output/remote-playback-preview/dist`, explicitly overriding the original frozen fixture client. The frozen deployment assets remain intact. The server version is still `d6c123de-4c43-4b22-8caf-b5f81e91c933`; no Worker deployment occurred in this follow-up. Page content matched the new build and its referenced script returned HTTP 200. Six bots rejoined successfully and emitted 744 movement updates in the initial eight-second activity check. No human visual result is claimed. Refresh the page to load this client. The private fixture/relay still expires at **4:23:58 PM PDT on September 8**.
