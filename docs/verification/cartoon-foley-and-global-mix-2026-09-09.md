# Mild global audio and cartoon foley — September 9, 2026

Tyler rejected the previous remote-gunshot volume as still much too quiet and the newly added melodic cues as mobile/casino-like. Requested direction: mostly global shots that become just a little quieter farther away, the same treatment for rat hit/death sounds, exaggerated 1990s cartoon foley, and distinct sharp metal briefcase clinks.

## Result

- A shared `worldSoundGain` keeps gain 1 through ten units, then fades linearly to 0.8 at 250 units and remains there at greater finite distances. At 100 units it is 0.925. Gunshots now use the same global `THREE.Audio` playback as the local pistol, removing the remote directional panner. The original gunshot clip/base gain 0.4 and twelve-voice/local-priority protection remain.
- Remote rat hits, ordinary and incident deaths, fatal-hit reactions and ragdoll impacts pass their world positions through that same mild curve. Local player reactions retain their previous full base volumes. Audio remains bounded and session teardown/suspended-context handling is retained.
- All ten new feedback assets were replaced with edits of physical foley samples: metal/tin/wood/soft/punch impacts from Kenney and XenosNS's recorded door-stop spring. There are no synthesized musical note sequences. Pickup uses a weighty grab and emphatic latch; loss uses a slipping latch, sagging spring and clatter. Briefcase hits are two sharp clinks 85 ms apart with short loose-metal chatter. Menu, death/respawn and Dispatch cues use mechanical snaps, springs, stamps and slapstick impacts. [Asset details](../../public/sounds/feedback/README.md) and [licenses/provenance](../../assets/audio/cartoon-foley/README.md).
- Reticle hit confirmation, HUD animations, ownership messages, accepted Popcorn sound/timing, AI, input handling and gameplay tuning are preserved. This is a client/audio revision; no Worker code changed in this pass.

## Validation

Typecheck, **542 tests** (101 Worker, 419 client, 22 scripts) and build passed. Fifteen focused audio tests passed, including a real RatEntity exercising nonlethal, fatal, shared-corpse and ragdoll-contact sound paths for both local and remote rats. Tests cover the 80% floor, listener-relative distance, global shot playback, local-shot priority, voice limits, cleanup and suspended audio.

All ten WAVs contain finite, non-silent PCM with 0.86 peak headroom and attacks within 12 ms; lengths are 0.055–0.76 seconds. Existing bundle-size warning remains. Browser gameplay/input automation was not run; source/sample and mix changes still need the user's auditory acceptance.

## Private preview

http://127.0.0.1:5181/?room=graybox-benchmark-match-feedback-v6&diagnostics=quiet

The relay serves current main `dist`, client `index-b-caViYz.js` / CSS `index-BrepsDeM.css`, with the existing private Worker `f930d9a2-c215-43fe-aac3-0c1fd33125f7`. Its expiry remains September 9 at **19:25 Pacific** (September 10 02:25 UTC). Private fixture health/identity, served HTML and all fourteen shot/rat/feedback audio assets were checked against source/build bytes. A separate protocol smoke verifies normal room admission and AI shots; this is not a listening or capacity benchmark. Reload the game to load the new client/audio.

Public production remains unchanged; no commit or public deployment was performed. The main working tree retains all earlier uncommitted work. Previous receipt: [hit marker and case feedback](hit-marker-case-feedback-2026-09-09.md). Shared-memory context: `brain:sessions/2026/09/rat-detective-hit-marker-case-feedback`.
