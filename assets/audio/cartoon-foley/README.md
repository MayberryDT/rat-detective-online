# Physical foley sources

Retrieved September 9, 2026 for gameplay sound editing, not model training. These sources produce the ten runtime assets in `public/sounds/feedback/` through `scripts/generate-feedback-sounds.py`. Only the resulting short WAV files ship to browsers.

## Metal, wood, soft and slapstick impacts

**Impact Sounds 1.0**, created/distributed by **Kenney**, December 19, 2019.

- [Creator's source and CC0 license listing](https://kenney.nl/assets/impact-sounds).
- [Downloaded source archive](https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip).
- The archive's original license is retained as `kenney-license.txt`.
- Retained files: `impactMetal_light_001.ogg`, `impactMetal_medium_002.ogg`, `impactPlate_light_002.ogg`, `impactPunch_heavy_001.ogg`, `impactSoft_heavy_000.ogg`, `impactTin_medium_001.ogg`, `impactWood_heavy_000.ogg`, `impactWood_light_001.ogg`.
- These are cropped, filtered, resampled at fixed rates and layered into mechanical/impact cues. No music-jingle or casino audio pack is used.

## Spring recording

**door stopper twang.wav** by **XenosNS**, Freesound sound **344741**, April 30, 2016. The author describes repeatedly flicking a metal spring door stopper attached to a wall.

- [Source and CC0 license listing](https://freesound.org/people/XenosNS/sounds/344741/).
- [Downloaded HQ preview](https://cdn.freesound.org/previews/344/344741_3296183-hq.mp3), retained as `door-stopper-xenosns.mp3`.
- Source SHA-256: `e1883a7575bcdad0d3ecdce602e3d71377020c71a566768709f0b6ea690044ab`.
- Edits use isolated attacks starting at 2.744 and 8.155 seconds, with filtering, short fades and fixed-rate resampling. The natural spring vibration supplies the comic wobble.

Both sources allow reuse and adaptation under [Creative Commons Zero](https://creativecommons.org/publicdomain/zero/1.0/). Their attribution is retained for provenance even though CC0 does not require it.


## Jump, growth and sticky release replacements — September 10, 2026

Tyler rejected using the door-stop spring for all three actions. The replacements use separate sources, each verified as CC0 on its creator's Freesound page when retrieved. Only edited short WAVs ship to the browser. These are game-effect assets, not model-training material.

### Jump_C_08 — cabled_mess

- [Creator and CC0 listing](https://freesound.org/people/cabled_mess/sounds/350898/)
- [Retained HQ preview](https://cdn.freesound.org/previews/350/350898_5450487-hq.mp3): `jump-cabled-mess.mp3`
- SHA-256: `c2ba8f90ccdd6df7881c97652e53c10ebf79745d4b718bd44a8bcb1fe31c780f`
- A designed retro platformer jump, made by its author with ChipTone; not a live acoustic recording. Cropped to 235 ms at 1.04×, gently low-passed, with a faded end; runtime WAV is 240 ms.

### balloon funny sounds.wav — jerry.berumen

- [Creator and CC0 listing](https://freesound.org/people/jerry.berumen/sounds/511673/)
- [Retained HQ preview](https://cdn.freesound.org/previews/511/511673_6753194-hq.mp3): `balloon-jerry-berumen.mp3`
- SHA-256: `ecf2797a360f3d4722104b57ef0b8148e686fb89eefba7630e6a095d784ad78a`
- **Historical rejected growth source, no longer used by the generator.** Recorded balloon inflation and squeaks. The prior growth version combined a quiet 140 ms breath from 5.90 s and a 360 ms rubber gesture from 14.12 s at 0.85×; runtime WAV is 420 ms. No door-stop or synthesized melodic layer.

### Slime 2 — Lukeo135

- [Creator and CC0 listing](https://freesound.org/people/Lukeo135/sounds/530616/)
- [Retained HQ preview](https://cdn.freesound.org/previews/530/530616_9271584-hq.mp3): `slime-lukeo135.mp3`
- SHA-256: `850524e70c9997c3a1270d48f0be4bb69850965b34963eab28209da9ec777db6`
- **Historical source, unused after grow and unstick were removed.** A recorded slime step. Sticky release reverses a short wet attack into a pull, followed by the forward squelch at 0.9×. Runtime WAV is 360 ms; no door-stop layer.

## Heavy goo and cartoon payoffs — September 10, 2026

Tyler accepted the jump and corpse bounce/kick sounds, rejected balloon growth, and requested heavier body impacts, danger for charge, a plain distinct bounce for split, more substantial menu sounds, happy kill feedback, a longer respawn cue and a large long victory sound.

Nine existing cues were revised, using retained sources plus **original offline synthesis**. No new downloaded source was incorporated in this pass. Source retrieval candidates returned HTTP 403; they are not part of the bank or its credits.

- Growth: three increasingly low, overlapping Slime 2 edits, a filtered soft impact and gentle saturation, forming a 680 ms wet expansion. No balloon, spring or brass layer.
- Wall bonk: low-passed punch and soft impact, 240 ms; no wood, metal or spring layer.
- Charge: original rough two-part synthesized klaxon, 600 ms.
- Split: original damped downward rubber bounce, 220 ms.
- Name tick/stamp: fuller recorded wood/impact strokes and a final mechanical stamp, 120/380 ms.
- Kill confirm: original rising major-triad brass-style flourish and bell, 820 ms.
- Respawn tick: original rounded bounce and resonant countdown bell, 720 ms.
- Victory: original 4.8-second major-key brass-style fanfare, recorded wood drum roll, synthetic cymbals and sparkling bell tail. It is not a sampled commercial jingle or recording of live brass.

The generator is deterministic. The nine other clips, including jump, corpse bounce and corpse kick, retain their exact preceding bytes. Loudness/character acceptance of this revision remains for human listening.

## Noir countdown and restrained result — September 10, 2026

This follow-up supersedes the large-payoff direction above. Tyler accepted the name roll and other retained cues, removed grow, charge, split, kill confirm and unstick, and requested darker noir countdown/victory sounds. The earlier source descriptions remain a history of the iterations.

The current 13-clip bank preserves eleven WAVs and their gains exactly. Countdown is now a 550 ms filtered wood/soft impact with original damped low bass and a soft noise tail. Victory is a 2.1-second original muted D-minor jazz phrase, low plucked bass and brush strokes, ending with a small horn fall and quiet recorded wood thock. No bells, cymbal crashes or triumphant major-key fanfare remain in either replacement. No new external source was used. Balloon and slime files are retained for provenance only; the current generator does not decode them.
