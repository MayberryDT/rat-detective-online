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

## Rules

- **Keep the accepted mix.** Leave the existing gunshot, world, launcher and music gains as they are; new cues sit under them. Effects and Master volume apply.
- **Stay within the existing limits.** Reuse `FoleyAudio`'s 8 voices, at most 3 world voices and one world onset per 160 ms; add a separate small pool only if footsteps need one. Use the world distance fade (`worldSoundGain`), camera-frustum and occlusion checks, and per-source cooldowns. Nothing queues for later playback.
- **Sourcing (as built).** Every new cue is original Web Audio synthesis at runtime (`src/feel/FeelAudio.ts`, `NoirAudio.ts`): filtered noise, oscillators and one damped echo send. No asset files were added, so there is no download cost or third-party provenance. The workshop renders all cues offline into one WAV cue sheet for listening review. The September 10 rejected clips stay rejected.
- **Local previews.** Agent browser checks stay muted (`&mute=1`). Tyler's review preview is audible.
- **Verification.** File, gain and bounds checks, plus event tests for trigger correctness (for example, no footsteps from a stationary rat or interpolation noise). Tyler judges the character of the sound.

## History (reference only)

[Chaos foley](../chaos-foley.md) explains the September 10 pruning from 75 cues
to 13. Tyler's 27 September decision reopens footsteps, flybys, echo and kill cues
([what this supersedes](feel-spec.md#what-this-supersedes)). The lesson to keep:
too many simultaneous or repetitive accents made the mix noisy, so every new cue
needs a cooldown and a reason to exist.
