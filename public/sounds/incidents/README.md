# Incident foley — September 9, 2026

Metal/saw are original procedural audio. The pops use the CC0 **Cartoon Pop (Clean)** mouth recording by unfa: https://freesound.org/people/unfa/sounds/245645/ . Source/provenance are in `assets/audio/README.md`. Regenerate using `scripts/generate-incident-sounds.py` (requires ffmpeg).

- `malfunction.wav`: metallic fracture, spring recoil and loose-part chatter; randomized playback pitch.
- `case-saw.wav`: grinding tooth pulses, squeal and sputtering amplitude; loops throughout Evidence Tampering.
- `pop-0.wav` through `pop-2.wav`: the same recorded cartoon mouth pop in three rotating slots. Since protocol 27 (1 October) it is Bad Ammunition's hiccup: when a hiccuping ball stops dead in the air it plays pitched up (1.35–1.45×) into a HIC! (`playHic` in `src/audio/IncidentAudio.ts`). Before that it was Popcorn Panic's pop, then the Bad Ammunition dud's.

24 kHz mono PCM, Procedural assets are normalized to 0.88 peak; the mouth recording retains its source level. Ten simultaneous one-shot voices plus one saw loop maximum. Human listening in the full game mix remains the acceptance check.
