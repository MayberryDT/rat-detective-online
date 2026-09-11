# Audio and performance follow-up — September 10, 2026

Tyler reported soft audio, especially the gun, and whole-game stutter including local movement/camera. Production felt smooth in the same browser. The dirty launcher/projectile work was preserved; no public deployment or commit was authorized.

Subsequent playtest: Tyler accepted the sounds and clarified that local movement/camera are smooth while shared balls, bodies and cases stutter. The resulting [shared physics playback fix](physics-playback-2026-09-10.md) supersedes this private preview; the measurements below remain the original receipt.

## Findings and changes

The launcher and muzzle edits did not change the other audio gains, common fade or assets relative to production commit `420bee2`. All **32** sound assets were fetched from production and matched local files byte for byte. Earlier project tuning had reduced gun gain from .4 to .3; this follow-up deliberately restores **.4**, a one-third gain increase from the preceding preview. The common world-fade scale widens from 24 to **32**: roughly 55.3% at 50 units, 16.5% at 100 and 2.87% at 250, before each cue's base volume and any stricter range. Nearby ceilings remain capped; music and personal UI gain are unchanged. Launchers retain their **.595 ceiling and 120-unit cutoff**; their shared gentler fade is about 2.94% of the nearby ceiling at 100 units.

The muzzle fix had broadcast actual birth payloads to every observer, creating unnecessary work and changing remote projectile presentation. Birth details now go **only to the firing player's connection**. Observers keep production shot packets and snapshot presentation; the server still resolves all real incident balls. `GameSession` never replays its own gun animation/audio on the echo. The local accepted shot still starts at the transmitted animated muzzle, with one ID, authoritative collision/removal precedence and the existing 500 ms pending bound. `ChaosPresentation` reuses its merged shot list instead of allocating several arrays on every render frame.

Quiet preview diagnostics also called synchronous localStorage with the complete growing history and logged report objects every five seconds. These operations occurred after the recorded render phases. Quiet mode now keeps bounded in-memory reports and the small numeric relay publication, saving history on page exit/disposal/pointer-lock release instead. F8 and the explicitly requested visible diagnostic panel remain. The main preview URL omits diagnostics entirely, matching ordinary production playback.

No camera, input, lighting, physics, rat count, ordinary projectile speed/gravity/bounce or AI tuning changed. Ball lifetime stays 2.5 seconds and Bad Ammunition stays diagonal .12–.24 radians.

## Evidence and limits

- Existing human-playtest logs for the preceding muzzle build contained 18 five-second reports: startup included a 2,366.9 ms frame; the following 17 reports had frame p95 near 16.8 ms, with occasional 33–34 ms frames. This coarse record does not refute the user's whole-game stutter or establish its cause.
- A 30-second passive private-room capture received 2,425 frames / 9,223,108 bytes with zero invalid messages. Snapshot arrival gaps were p95 **113.6 ms**, maximum **656.6 ms**; simulation timestamp gaps peaked at **466.7 ms**. RTT was median **80 ms**, p95 **389 ms**, maximum **615 ms**. These are transport/timestamp measurements, not an isolated CPU diagnosis.
- The refreshed private build's 30-second capture still had delivery outliers: arrival p95 **96.5 ms**, maximum **814.9 ms**, simulation timestamp maximum **550 ms**, RTT median **61 ms** / p95 **174 ms**. Zero invalid messages. Workload and incidents differed, so these separate captures do not prove a network performance improvement; intermittent upstream/delivery pauses remain observable.
- Replaying that identical feed through production and preceding presentation code at 60 Hz gave approximately **.054 ms versus .059 ms p95** CPU per frame. The owner-only candidate was about **.061 ms**. These small timings do **not** establish a major renderer slowdown or a measured FPS improvement. The cleanup structurally avoids 580 remote birth payloads/tracks and approximately 99 KB of launch data in the captured workload, and eliminates periodic synchronous quiet-mode history writes; the latter's browser blocking time was not measured.
- Focused checks passed: 52 client tests and 46 Worker tests, followed by the added owner-echo/session regression. Final full `npm test`: **824 passed** (130 Worker, 669 client, 25 script). Typecheck, production build and visual build pass. The first full run caught an obsolete siren attenuation bound, updated for the deliberately gentler mix. Existing build chunk warnings remain.
- Tests retain actual camera/muzzle/instanced-ball regressions, verify observer packets contain no birth payload, keep the owner's birth, ensure no local audio/animation replay, reuse lists and preserve bounded diagnostic reports without gameplay storage/console writes.

No automated browser gameplay/input test was run. The severe whole-game stutter's root cause remains incompletely established, and this receipt does not claim it is fully eliminated. Human playtesting is needed to accept the cleanup and sound mix. Supporting evidence is under `output/audio-performance-2026-09-10/`.

## Current private preview

[Open the normal playtest](http://127.0.0.1:5190/?room=graybox-benchmark-ai-launcher-projectiles-v28&lighting=pools&revision=audio-perf-v30). Private Worker **`39b92f6a-758b-4db6-b2c2-8b0bd8627d00`**, protocol **8**, expires **September 11 at 2:22 AM Pacific** (09:22 UTC). Same room, version-2 world and 16-rat full lobby. The relay remains `rat-detective-launcher-projectile-preview.service` with restart-on-failure, served from the deployment's frozen client. It remains transient across host reboots.

Deployment receipt: `output/hosted-capacity-deployment-2026-09-11T05-22-57-400Z/deployment.json`. Readiness evidence: `output/audio-performance-2026-09-10/readiness.json`. Production remains protocol 7 / Worker `8cacdb60-2ee0-4f63-b8bb-9f02de321719` at `https://ratdetective.online/`.

Verified all **140 source hashes** and **51 served files** against the frozen client. A six-second protocol check saw 16 rats, **130 valid snapshots**, one accepted owner birth and **106 remote shots without birth payloads**, zero invalid packets/errors, then disconnected. The check fired one upward protocol shot; it did not drive browser inputs. World seed **718673434** remains. Entry asset: `index-DdwSJmgY.js`; game asset `createGame-ByloSHki.js`. The relay is active with zero restarts observed.

Prior GBrain context: `brain:sessions/2026/09/rat-detective-audio-pooling-case-bounce` records the earlier .4 gun level and accepted bounded audio pooling; `brain:sessions/2026/09/rat-detective-authoritative-muzzle-birth-2026-09-10` records the preceding broader birth delivery.
