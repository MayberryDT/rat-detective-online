# Incident foley — September 9, 2026

Metal/saw are original procedural audio. Popcorn uses the CC0 **Cartoon Pop (Clean)** mouth recording by unfa: https://freesound.org/people/unfa/sounds/245645/ . Source/provenance are in `assets/audio/README.md`. Regenerate using `scripts/generate-incident-sounds.py` (requires ffmpeg).

- `malfunction.wav`: metallic fracture, spring recoil and loose-part chatter; randomized playback pitch.
- `case-saw.wav`: grinding tooth pulses, squeal and sputtering amplitude; loops throughout Evidence Tampering.
- `pop-0.wav` through `pop-2.wav`: the same recorded cartoon mouth pop in the existing three playback slots, with slight runtime pitch variation and no added synthesis.

24 kHz mono PCM, Procedural assets are normalized to 0.88 peak; the mouth recording retains its source level. Ten simultaneous one-shot voices plus one saw loop maximum. Human listening in the full game mix remains the acceptance check.
