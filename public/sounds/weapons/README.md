# Weapon rounds (protocol 27, 1 October 2026)

The Tommy Gun's report is a real Thompson recording, not synthesis: **S31-16 Tommy gun busts; machine gun.wav** by **craigsmith** (pack *SSE Vintage Guns - Big*), Freesound sound 675603.

- Source: https://freesound.org/people/craigsmith/sounds/675603/
- Downloaded HQ preview: https://cdn.freesound.org/previews/675/675603_2524442-hq.mp3 (retained as `assets/audio/tommy-gun-craigsmith.mp3`; not sent to browsers)
- License: Creative Commons Zero (CC0), https://creativecommons.org/publicdomain/zero/1.0/
- Retrieved 1 October 2026. Used as a game sound effect, not for model training.

Regenerate with `python3 scripts/generate-feedback-sounds.py` (ffmpeg and the Python standard library).

| File | Cut | Length |
| --- | --- | --- |
| `tommy-0.wav` | Last round of the burst at 1.114 s | 0.195 s |
| `tommy-1.wav` | Last round of the burst at 3.093 s | 0.26 s |
| `tommy-2.wav` | Last round of the burst at 4.243 s | 0.20 s |
| `tommy-3.wav` | Last round of the recording at 5.648 s | 0.26 s |

Each cut starts 4 ms before the round's transient and keeps the recording's own room decay. A cut is used only where no next round follows within 0.2 s, closed with a 50 ms fade. They are 48 kHz mono 16-bit PCM, each normalized to a 0.86 peak. `GunshotAudio` plays them in rotation, one per trigger at 10 a second, with a ±5% pitch drift, and shares the pistol's voice pool, gain and distance attenuation. Listening in the full game mix has not been checked.
