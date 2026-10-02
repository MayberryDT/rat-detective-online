# Weapon rounds (protocol 27, 1 October 2026)

The Tommy Gun's report blends a real Thompson recording with the game's ordinary cheese gun shot (`public/sounds/gunshot.mp3`), so it sits between the two: Tyler liked the Thompson but found it "just too realistic". The Thompson is **S31-16 Tommy gun busts; machine gun.wav** by **craigsmith** (pack *SSE Vintage Guns - Big*), Freesound sound 675603.

- Source: https://freesound.org/people/craigsmith/sounds/675603/
- Downloaded HQ preview: https://cdn.freesound.org/previews/675/675603_2524442-hq.mp3 (retained as `assets/audio/tommy-gun-craigsmith.mp3`; not sent to browsers)
- License: Creative Commons Zero (CC0), https://creativecommons.org/publicdomain/zero/1.0/
- Retrieved 1 October 2026. Used as a game sound effect, not for model training.

Regenerate with `python3 scripts/generate-feedback-sounds.py` (ffmpeg and the Python standard library).

| File | Thompson cut | Length |
| --- | --- | --- |
| `tommy-0.wav` | Last round of the burst at 1.114 s | 0.195 s |
| `tommy-1.wav` | Last round of the burst at 3.093 s | 0.26 s |
| `tommy-2.wav` | Last round of the burst at 4.243 s | 0.20 s |
| `tommy-3.wav` | Last round of the recording at 5.648 s | 0.26 s |

Each Thompson cut starts 4 ms before the round's transient and keeps the recording's own room decay. A cut is used only where no next round follows within 0.2 s. The cut is low-passed (a 3.5 kHz Butterworth biquad) and laid at half the level of the cheese gun shot, which is resampled 8% higher in pitch (linear interpolation) and aligned so its transient also falls 4 ms in. The cheese shot leads the attack; the Thompson's thump and room tail carry the rattle. Each blend is closed with a 50 ms fade. They are 48 kHz mono 16-bit PCM, each normalized to a 0.86 peak. `GunshotAudio` plays them in rotation, one per trigger at 10 a second, with a ±5% pitch drift, and shares the pistol's voice pool, gain and distance attenuation. Nobody has listened to the blend yet, alone or in the full game mix.

## Scattershot blast (protocol 28, 1 October 2026)

`scattershot.wav` replaces the pistol pitched down under a synthesized BLAM (Tyler, after the four-human playtest: "I hate it"). It is made from recordings already in the repository, nothing synthesized: five copies of the cheese gun shot (`public/sounds/gunshot.mp3`), stacked 0, 6, 13, 20 and 29 ms apart at 0.9, 1.02, 0.84, 1.1 and 0.95 of their pitch and falling in level (the five balls leaving at once, a chunky BRAP), over a cartoon WHOOMPH: the CC0 mouth pop (`assets/audio/cartoon-pop-unfa.mp3`, see `assets/audio/README.md`) resampled to 0.42 of its pitch and low-passed at 1.4 kHz, and the Kenney soft heavy impact (`assets/audio/cartoon-foley/impactSoft_heavy_000.ogg`) at 0.55 low-passed at 900 Hz for body. 0.46 s, 48 kHz mono 16-bit PCM, normalized to a 0.86 peak with an 80 ms close. `GunshotAudio` plays it for every Scattershot trigger (cue `shotgun`) with a ±5% pitch drift through the pistol's voice pool, gain and distance attenuation. Nobody has listened to it yet.
