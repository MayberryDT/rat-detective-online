# Evidence Tampering ricochets and reversible lighting trial

Implemented September 9, 2026 after Tyler reported choppy, excessively airborne cases, loud incident audio, and requested overhead light on moving rats with lower ambient illumination. This is a private preview change; production is unchanged.

## Changes

- Eight weaponized, uncollectible cases now launch at 46 lateral units/sec and redirect at 72 when shot. A 32-unit lateral speed floor keeps rebounds going. Floor impacts give a 7-unit hop, upward speed is capped at 10, and spin is restrained enough to read at snapshot cadence. The old claimed-case total-speed boost (158.4, often driving upward flight) is removed. The continuous center/eight-corner sweep and up to four reflections per tick remain.
- Weaponized cases no longer force extra Cannon substeps for translation that their own sweep already handles. Ordinary cases and corpse substeps keep their existing behavior. Ordinary cheese-ball tuning is unchanged.
- Case presentation retains its interpolation clock across rebounds. Where two received samples support a single impact, a fitted corner preserves the turn; inconsistent fits fall back to interpolation. Ownership, returning lifecycle and teleport changes still reset immediately. Projectile and corpse bounce behavior is unchanged. Case trails follow the rendered case pose instead of raw snapshots.
- Rigid case details are merged by material: **36 → 9 meshes per case**, **3,888 triangles unchanged**. Glow shells and the handle geometry are retained. A named grip anchor preserves the existing hand-alignment checks. This is a draw-submission reduction, not a measured frame-rate claim.
- The single Evidence Tampering buzz loop uses gain **0.055 instead of 0.19**, about 71% less amplitude (roughly −10.8 dB). Other incident and gun sounds retain their previous settings.
- The default local lighting trial lowers ambient from .38 to .20, hemisphere .65 to .40, moon .85 to .70, and aboveground fill 1.25 to .32. Four reused downward spotlights illuminate moving rats beneath actual authored/supplemental street lamps and matching-floor interior fixtures. They add no shadow maps. Fixed lamp visuals and baked building illumination remain steady; the existing eight-light sewer pool remains.
- `lighting=classic` restores the exact previous ambient values and sewer-only moving lights. This is local presentation and can be changed without changing rooms or protocol.

No changes to assignment scoring, incident progress suspension, cleanup protection, ordinary ball tuning, controls, camera, map collision, player caps or damage protections. The six-landmark route and its random order remain.

## Automated validation

**630 passing tests**: 107 Worker, 501 client, 22 script. `npm run typecheck`, production build, visual build and `git diff --check` passed. The suites were run separately with two client workers. The production build retains its existing large-bundle warning.

New focused checks cover sustained wall/floor rebounds over ten simulated seconds, high-speed thin-wall sweeps, one Cannon step for independently swept cases, exact sampled rebound playback, bounded overhead lights, authored pole inclusion, underground shutoff, reversibility and the preserved case detail/handle budget. Existing assignment, attribution, incident expiry, carry/grip, death/reset and damage-protection tests passed. Initial full client validation caught two missing named-handle-reference failures after batching; restoring the anchor resolved both.

The saved before/after diagnostic used identical seeded real-city geometry and 1,200 ticks (20 simulated seconds) with eight unclaimed cases and no rats, bullets or bots. It recorded **1,308 → 1,200 Cannon steps** and **102,420 → 90,873 ray queries**. Local median tick-plus-snapshot CPU time was .530 → .516 ms and p95 1.293 → 1.252 ms; this single short sample is too small to establish a general performance gain.

A separate idealized 40-unit/sec repeated-wall-bounce replay at 40 Hz packet cadence and 60 Hz render sampling reduced maximum frame travel **2 → .667 units** and RMS position error against the 75 ms delayed reference **1.823 → approximately zero**. It does not measure hosted jitter or packet loss. Symmetric frames straddling a reversal can have equal endpoints; the diagnostic's stationary-frame count is therefore not a stall metric.

Evidence is under `output/tampering-lighting-2026-09-09/`: test/build logs, `comparison.json`, and the reproducible comparison script plus pre-change source snapshots. No human gameplay, browser-input test, audio audition, full multiplayer combat validation or GPU/frame-rate benchmark was performed.

## Visual review and preview

Static views were reviewed from the actual shoulder camera beneath an authored street pole in both lighting modes, plus the sewer approach to Maintenance. The new view visibly catches the hat's top/brim and shoulder while darkening the surrounding fill. Sewer lights and landmark guidance remain readable. This is visual review, not human playtest acceptance.

Full-game preview: [new lighting](http://127.0.0.1:5184/?room=graybox-benchmark-match-bounce-light-v12&diagnostics=quiet&lighting=pools) / [classic lighting](http://127.0.0.1:5184/?room=graybox-benchmark-match-bounce-light-v12&diagnostics=quiet&lighting=classic). Both include the same case fixes and use the same private room pool.

The isolated authenticated capacity Worker is `0e545734-e5c7-4f7c-bdce-ad3f603ccce4`, protocol 4, immutable client `index-B3XezcUI.js`. It expires September 10 at **2:03 AM Pacific**. Receipt: `output/hosted-capacity-deployment-2026-09-10T05-03-50-102Z/deployment.json`; local service: `rat-detective-ricochet-lighting-preview.service`. The previous port-5183 preview is superseded by this matching private client/server pair. No production deployment or Git commit.

A six-second passive WebSocket observation in a separate private automatic pool received **eight rats, 142 valid compact snapshots and zero invalid packets**. It verified protocol 4 and byte-for-byte equality of the served HTML/JavaScript with the immutable deployment copy. The final assignment was Excessive Force, suspended. This was a readiness check, not a multiplayer combat test. The first attempt ran before the local relay was listening and received connection refused; the retry after its ready message passed. Report: `output/tampering-lighting-2026-09-09/full-preview-check.json`.

Human review remains: how the cases feel amid live shots/rat collisions, whether the reduced buzz is comfortable, street-to-sewer transitions, and light coverage/performance while moving through the full city. The four-light pool deliberately has no extra shadows, so some local light spill through nearby walls is possible. Use the classic link to compare or reject the lighting trial independently of the case fixes.
