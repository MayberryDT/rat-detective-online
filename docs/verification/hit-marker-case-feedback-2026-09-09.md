# Hit marker, audible city fire and case feedback — September 9, 2026

Tyler found the previous remote-gunshot cutoff too quiet and requested faint fire across the map, equal nearby/local gunshot volume, a brief X for hitting another rat, cartoon case pickup/loss/impact cues, and restrained sounds/animations for pop-up messages.

## Changes

- Gunshot gain is full through ten units, then `0.025 + 0.975 / (1 + ((distance - 10) / 22)^2)`: about 0.69 at 25 units, 0.25 at 50, 0.08 at 100 and 0.027 at 500. There is no finite-distance mute cutoff. Local shots retain gain 1 and priority; the twelve-voice limit remains. This supersedes the near-six/far-forty-eight tuning in the prior receipt. The confirmed cause of the missing distant fire was the old attenuation/culling curve; no separate local-gunshot failure was reproduced.
- `playerDamaged.attackerId` drives a 180 ms reticle X for damage credited to the local player against another rat. It is not predicted from a shot or visual impact. Repeated hits extend/restart the marker; death/disposal clear it. Reduced motion keeps a static brief X.
- Ten short PCM assets supply separate pickup, loss, other-carrier, case-hit, paper open/close, death, respawn, Dispatch and roulette-tick cues. Own pickup is a weighty rising wood motif with recorded cartoon mouth pop/paper/latch layers. Loss descends and is accompanied by `YOU LOST THE CASE / DOUBLE KILL CREDIT LOST · GET IT BACK`. Another carrier gets a quieter cue. Unchanged ownership and phase snapshots do not repeat those cues; initial state hydration is quiet for case ownership.
- `FeedbackAudio` bounds overlap at eight voices and rate-limits chatter, reserving headroom for important cues. Case-hit volume follows distance. Voices/loads are session-owned and disposed; suspended audio does not accumulate a backlog. The accepted Popcorn recording/timing is untouched.
- The authoritative simulation tags existing bullet–case impacts with optional `cue: 'case-hit'`, including carried/weaponized cases. The existing impact cap and compact encoding remain. Validation explicitly accepts the new cue. New server and client must be used together; old private clients should reload.
- Case broadcasts retain their entrance/exit animation and gain explicit pickup/loss coloring. Dispatch gets a short departure, connection/death/victory overlays fade in/out, death text enters briefly, kill-feed text exits subtly. An old exit cannot hide a newly reopened overlay. Reduced-motion settings skip animated movement. Menus, death/respawn, victory and kill-feed entries get quiet contextual cues; persistent ledger/score updates are not treated as pop-ups.

## Verification

Typecheck and full **539-test** suite passed (101 Worker, 416 client, 22 scripts). A final connection-overlay fade adjustment then passed typecheck, 21 focused HUD/session/resource tests and build. Existing >500 kB bundle warning remains. The first full attempt caught a wrong decoder-method name in the new test, corrected to `read`; the pre-existing randomized actual-city AI diagnostic also failed once and passed on rerun without navigation/AI edits.

Coverage includes local-versus-other hit attribution, repeated-hit marker timing, one-time ownership/death cues, interrupted overlay exits, audio overlap/priority/debounce/cleanup, and a real simulated case hit round-tripped through compact encoding. All ten generated assets have finite non-silent PCM, durations 0.055–0.75 seconds and peaks below 0.9. No browser gameplay/input automation or human listening acceptance is claimed. Prior AI behavior and mouse-lock corrections remain unchanged.

Assets/provenance and regeneration: `public/sounds/feedback/README.md`, `scripts/generate-feedback-sounds.py`, `assets/audio/README.md`. Prior shared memory: `brain:sessions/2026/09/rat-detective-ai-audio-input-followup`.

## Private preview

http://127.0.0.1:5181/?room=graybox-benchmark-match-feedback-v5&diagnostics=quiet

Private Worker `f930d9a2-c215-43fe-aac3-0c1fd33125f7`, expiry September 9 at 19:25 Pacific (September 10 02:25 UTC). Client `index-WhydouVg.js` / `index-BrepsDeM.css`. Fixture health and identity verified; served client HTML, gunshot and all ten new audio files match the built/source assets. Main remains dirty/uncommitted, preserving earlier work. No public deployment or commit was performed.
