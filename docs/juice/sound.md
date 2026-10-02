# Sound pass

Part of the [juice plan](../juice-plan.md), which owns status and order. Read
this before adding or changing audio.

## Scope

| Cue | Trigger and behaviour |
| --- | --- |
| Footsteps by surface | Your rat, plus nearby visible rats. Pavement, sewer water splash, metal catwalk and wooden roof, chosen by position and floor. Volume and rate scale with speed. Quiet. |
| Coat and case jostle | Soft cloth rustle on starts and turns; a case rattle while carrying and on landings |
| Cheese squelch layers | An extra wet layer on hits and big splats, on top of the existing hit tick |
| Near-miss whizz | A ball passing within about 2 units of your head without hitting |
| Sewer echo and muffled interiors | One shared echo send for the sewers; a low-pass for indoors. Selected by the listener's position. |
| Low-health muffle and heartbeat | From [spec §3](feel-spec.md#3-danger-and-death); lifts on heal or respawn |
| Kill brass stab | Short noir brass hit for your kills; local only |
| Music stings | Case pickup, delivery and the closing seconds of an assignment, over the existing gameplay track |
| Supply claim stings | Your claim: each supply's foley plus a short noir sting and signature (armour clank, engine rev, heartbeat, lens sweep); a shutter click per rat revealed and a tick per health pip. Ironclad sounds are heavy plate, never tin. Local only. |

## Rules

- **Keep the accepted mix.** Leave the existing gunshot, world, launcher and music gains as they are; new cues sit under them. Effects and Master volume apply.
- **Stay within the existing limits.** Reuse `FoleyAudio`'s 8 voices, at most 3 world voices and one world onset per 160 ms; add a separate small pool only if footsteps need one. Use the world distance fade (`worldSoundGain`), camera-frustum and occlusion checks, and per-source cooldowns. Nothing queues for later playback.
- **The ranked mix (clarity batch, protocol 29; `src/audio/PlayerAudioMix.ts`).** World sounds (other rats' gunshots, hits and deaths; placed feedback cues such as armour clangs, other rats' lasers and traps; world foley; launcher machines and pressure beds; pillar sirens, bells and clanks; placed incident cues such as meteors and Bad Ammunition) go through a world bus (`worldOutput` for native graphs, `worldInput(listener)` for Three voices, before the listener gain so the noir muffle still applies). Your own gun, hurt and death sounds, the case's sounds, UI cues and announcements (squawk, countdown, whistle) stay on the plain effects bus.
  - **Ducking:** `duckWorld(context, strength)` dips the world bus to `1 − 0.5 × strength` in 15 ms, holds 0.22 s and lets it back up (time constant 0.12 s, back to full in about 0.6 s). Your hit 0.5 (world at 75%), your kill 1 (50%), case taken by you, case lost, delivery points and verified 1, someone else taking or knocking loose the case 0.8, each case ping 0.45 (`src/audio/CasePingAudio.ts`).
  - **Voice budget:** at most `RANKED_MIX.voices` (12) world one-shots at once across every system, shared through `admitWorldVoice`/`endWorldVoice`; when full, the quietest at your ear (softest or furthest) is cut for a louder newcomer, and a quieter newcomer is refused. Before the batch the separate pools allowed up to about 57 world one-shots (gunshots 12, rat sounds 12, feedback 8, world foley 3, launchers 12, incident cues 10). The per-system pools and limits above still apply inside it.
- **Sourcing (as built).** Every new cue is original Web Audio synthesis at runtime (`src/feel/FeelAudio.ts`, `NoirAudio.ts`): filtered noise, oscillators and one damped echo send. No asset files were added, so there is no download cost or third-party provenance. The workshop renders all cues offline into one WAV cue sheet for listening review. The September 10 rejected clips stay rejected. The exception is the supply claim and armour cues: small WAVs rendered offline by `scripts/generate-pickup-sounds.py` (also original synthesis) and played through `FeedbackAudio`.
- **Local previews.** Agent browser checks stay muted (`&mute=1`). Tyler's review preview is audible.
- **Verification.** File, gain and bounds checks, plus event tests for trigger correctness (for example, no footsteps from a stationary rat or interpolation noise). Tyler judges the character of the sound.

## History (reference only)

[Chaos foley](../chaos-foley.md) explains the September 10 pruning from 75 cues
to 13. Tyler's 27 September decision reopens footsteps, flybys, echo and kill cues
([what this supersedes](feel-spec.md#what-this-supersedes)). The lesson to keep:
too many simultaneous or repetitive accents made the mix noisy, so every new cue
needs a cooldown and a reason to exist.
