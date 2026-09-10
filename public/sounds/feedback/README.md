# Cartoon foley feedback — September 9, 2026

Rebuilt after the user rejected the earlier wood-note cues as mobile/casino sounds. Run `python3 scripts/generate-feedback-sounds.py` with ffmpeg installed. All layers come from source foley samples; there are no synthesized notes, chord patterns or oscillator sweeps. Cuts, fixed-rate resampling, filtering and overlapping impacts provide the exaggeration.

Source attribution, licenses and retained files: [cartoon-foley provenance](../../../assets/audio/cartoon-foley/README.md). Source files are not sent to browsers. The accepted Popcorn recording and 0.4-second timing are untouched.

| Cue | Edit | Length |
| --- | --- | --- |
| Case pickup | Weighty grab, wound spring/ratchet, emphatic paired metal latches | 0.70 s |
| Case lost | Slipping latch, low sagging spring and trailing tin clatter | 0.76 s |
| Other carrier | Short snatch and latch pair, quieter in the mix | 0.31 s |
| Case hit | Two sharp clinks 85 ms apart, with loose-metal chatter | 0.34 s |
| Menu open | Short scrape, wooden snap and spring twang | 0.27 s |
| Menu close | Scrape and clack shut | 0.22 s |
| Death | Broad slapstick whack and loose spring under the rat voice | 0.66 s |
| Respawn | Quick spring kick, upright snap and latch | 0.45 s |
| Dispatch | Brief mechanism ratchet, heavy stamp and rattling hardware | 0.50 s |
| Roulette tick | Dry wooden mechanism click | 0.055 s |

24 kHz mono 16-bit PCM, normalized to 0.86 peak before runtime gain. Eight feedback voices maximum; chatter reserves space for important events and per-cue cooldowns suppress repeated snapshots. Case hits share the mild global distance gain of gunshots/rat reactions. Final character and mix require the user's listening playtest.
