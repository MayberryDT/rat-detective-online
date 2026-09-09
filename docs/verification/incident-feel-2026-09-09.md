# Incident feel follow-up — 2026-09-09

Implemented in the existing dirty `codex/incident-roster-update` worktree. No commit or deployment. The main capacity/multiplayer checkout was not edited.

## Changes

- Bad Ammunition: 70% one ball, 20% two, 10% three, no pending/delayed emissions. Each direction lies 0.12–0.50 radians away from aim with random azimuth. Normal ball speed, gravity, lifetime and fire cadence remain unchanged.
- Evidence Tampering: shot redirects now use the incoming direction at speed 220 versus idle speed 64. Claimed cases preserve vertical aim instead of the fixed lift and height-dependent suppression. Claimed moving cases have a speed floor of 158.4; ordinary swept world bounces still use 0.9 restitution. Existing ownership metadata preserves this behavior on restoration. Eight cases, blocked pickup, shooter immunity and hit attribution remain.
- Audio: replaced the rejected live oscillator cues with five original, pre-rendered procedural PCM effects. Metallic crack/spring/chatter for malfunction, grinding/sputtering saw loop, and three shell-crack popcorn variants. These are synthesized foley, not real recordings. Source generator and provenance are included. Pitch variation, ten one-shot voices, one persistent saw loop, preload/decode caching and lifecycle cleanup use the existing shared AudioContext. Delayed Reaction retains a short thud.
- Popcorn remains one second after firing, lofted children without recursive popping.
- Fixed two existing test TypeScript errors (Three material union and retired incident ID comparisons).

## Validation

- Typecheck passed.
- Full suite: 499 tests passed (97 Worker, 380 client, 22 scripts).
- Production build and visual build passed; existing large-chunk warnings remain.
- Focused tests cover count boundaries, crooked directions, no delayed extras, high-speed thin-wall reflection, moving-case re-shoot and ownership transfer, preserved vertical momentum through restoration, expiry, immunity, one-second Popcorn, bounded audio voices, single loop and suspended context behavior.
- `git diff --check` passed.
- Generated WAV headers/durations checked; roughly 138 KB total PCM assets. Stage and five WAV URLs checked over local HTTP.

## Human preview

`http://127.0.0.1:5180/stage-prototype.html?bots=11`

Hard-refresh, click Play / resume, then select and start an incident. Audio identity, relative loudness and chaotic feel remain unverified by human listening. No automated pointer-lock/gameplay testing was performed. Unit tests do not establish that fast moving targets never miss under every relative trajectory or that the new sound mix is accepted.

## Subsequent Popcorn playtest correction — September 9

Tyler rejected the initial popcorn cue as insufficiently distinct from the gunshot and requested a half-second delay. Popcorn now triggers at 500 ms. The three samples were rebuilt as short hollow cork/mouth pops: falling cavity resonance, a tiny pressure click, and no noisy crackle tail. Playback pitch variation narrowed to 0.97–1.03 to preserve the recognizable pop. Other incident sounds and ordinary ball tuning are unchanged.

Typecheck, all 499 tests, focused Popcorn/audio tests, visual build and diff whitespace check passed. The local server returns the exact updated sample bytes. The new sound still requires human listening acceptance; no deployment or automated gameplay input testing was performed.

## Cartoon recording and 400 ms correction — September 9

Tyler rejected the second synthetic cue as digital/sci-fi. Popcorn now triggers at 400 ms. Replaced all three popcorn playback assets with unfa's CC0 **Cartoon Pop (Clean)** human-mouth recording (Freesound 245645), converted from the publicly available HQ preview to mono 24 kHz PCM. No synthetic layer or frequency sweep; existing ±3% playback variation remains. Source, license, and regeneration instructions are included under `assets/audio/` and the sound README. Other incident assets remain unchanged.

Typecheck, nine focused incident/audio tests, visual build and whitespace check passed. Verified the new recording is served byte-for-byte by the local preview; duration is 0.172 seconds with audible onset about 5 ms. Full suite was not repeated for this narrow timing/asset revision. Human listening remains the acceptance check. Not deployed.

## Human acceptance and integration authorization

Tyler accepted the 400 ms timing and recorded cartoon pop, then authorized committing all work and merging to main. This is human acceptance of the incident playtest, not a production deployment or capacity certification.
