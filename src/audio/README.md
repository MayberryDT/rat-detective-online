# Game audio

[Juice plan](../../docs/juice-plan.md) · [Code map](../../docs/code-map.md)

Audio modules consume gameplay and movement events; they do not authorize actions. [WorldSoundEvents.ts](WorldSoundEvents.ts) and [FoleyWorld.ts](FoleyWorld.ts) handle world cues, [PlayerAudioMix.ts](PlayerAudioMix.ts) handles the player mix, and [AudioVoicePool.ts](AudioVoicePool.ts) bounds voices. Dedicated modules handle gunshots, incidents, launchers, motion and feedback. [worldSoundGain.ts](worldSoundGain.ts) owns shared distance gain.

Sound assets are in `public/sounds/`; provenance and regeneration live in its READMEs and `scripts/generate-*-sounds.py`. Keep accepted production loudness and the existing voice budget. Agent browser checks use [previewMuted.ts](previewMuted.ts) or browser mute; human playtests remain audible. Feel-layer audio also lives in `feel/`; check the juice owner before adding another response to the same event.
