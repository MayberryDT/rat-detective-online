# Performance cleanup, Bad Ammunition and case bounce — September 9, 2026

Tyler judged the revised global/cartoon audio much better, but reported slower gameplay. Requested optimization, replacing the excessive Bad Ammunition clank with a higher-pitched regular gunshot, and more visible briefcase movement/rebounds when shot.

## Performance evidence and changes

Available pre-change private-v6 relay reports show most visible play windows near 16.7 ms median / 16.8 ms p95 frame time. Loading included a 600 ms frame and a 375.7 ms render-submission peak; occasional snapshot ages reached about 130–146 ms. These bounded diagnostics do not identify every reported slowdown or measure GPU time. No overall FPS improvement is claimed from unit tests.

- The new gun/rat/feedback paths previously constructed a Three Audio object and gain for each sound. `AudioVoicePool` reuses them within the existing limits (12 gun, 12 rat, 8 feedback). Each buffer source is still correctly recreated because Web Audio sources are single-use. The existing active-voice priority and chatter limits remain. Teardown now explicitly disconnects every output gain; Three's `Audio.disconnect()` alone disconnects its source. Playback end-state, evictions, stale loads and suspended contexts retain cleanup.
- A controlled 200-shot sequence now uses one Three Audio object/gain. A separate test uses real Three objects to verify the bounded pool and all output disconnections. This measures allocations, not browser FPS.
- Dispatch and case-marker labels only replace text when the displayed value changes. Evidence Tampering computes the final label before writing, eliminating the normal-text/incident-text double write every frame. Across 600 stable HUD updates, no label text is rewritten; advancing the timer changes only its label. Visible timer bars, roulette and marker movement retain their animations.
- Delayed Reaction renders its unchanged thud PCM once per audio context instead of computing thousands of samples on every hit. Twenty repeated cues share the same buffer. The unused malfunction asset is no longer loaded by either incident or gun audio.

## Sound and physical behavior

Bad Ammunition uses `/sounds/gunshot.mp3` at **1.45× playback rate**, with the same base gain 0.4 and accepted mild global distance curve as normal firing. A recycled voice resets to rate 1 for ordinary shots. There is no extra malfunction/clank layer.

Shooting ordinary loose or carried evidence adds a **30-unit directional kick**, at least **10 units of upward velocity before the total speed cap**, and strong directional tumble. Combined speed is capped at **48**. Pickup waits while an ordinary case travels faster than **18**, preventing an immediate catch from cancelling the launch; slow cases remain collectible and the former carrier's existing delay remains. Substep selection now includes fast ordinary cases. Evidence Tampering retains its separate 220-unit missile redirect, lethal behavior and expiry cleanup. Ordinary death-drop impulses remain 14.3 directional / 5.2 lift. No ordinary ball or AI tuning changed.

The real Cannon fixture verifies more than eight units of travel, a rise above two units, wall and floor rebounds, carrier disarming, no immediate nearby catch, later slow-case pickup and bounded stacked speed. Normal shot cases remain nonlethal. Existing simulated case-hit feedback/wire tests remain in place.

## Validation

Typecheck, build and **549 tests** passed (101 Worker, 426 client, 22 scripts). The first full run found one incident-expiry test still expecting the former 13-unit normal kick; it now verifies the new normal kick while retaining the 220-unit incident assertion. Existing bundle-size warning remains. Git whitespace and documentation links were checked. No browser gameplay/input automation was performed. The user's next playtest is needed to assess the reported slowdown and new case feel.

Prior context: `brain:sessions/2026/09/rat-detective-cartoon-foley-global-mix`. All prior working-tree changes are preserved; this pass does not commit or deploy public production.

## Private preview

http://127.0.0.1:5181/?room=graybox-benchmark-match-optimized-v7&diagnostics=quiet

Private Worker **81f32dbd-c4ef-481c-a1e3-5fab0ddb178f**, client `index-CAXtsxGY.js` / CSS `index-BrepsDeM.css`. The isolated 24-cap automatic-room fixture expires September 9 at **20:07 Pacific** (September 10 03:07 UTC). Its health and fixture identity were verified before the relay started. Served HTML, client JavaScript and all fourteen shot/rat/feedback audio files match the built/source bytes. A separate protocol smoke verifies one human plus seven AI and active AI shooting. Reload to get the paired client and server changes.
