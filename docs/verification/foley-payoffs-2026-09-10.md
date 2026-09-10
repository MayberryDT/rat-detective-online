# Heavy goo and cartoon payoffs — September 10, 2026

**Historical revision, superseded by [the noir revision](foley-noir-2026-09-10.md).** The five subsequently rejected sounds were removed and countdown/victory were replaced. Measurements below describe this earlier 18-cue version.

Tyler accepted jump and corpse bounce/kick. He requested wet heavy growth instead of balloon inflation, a rat-body thud for wall bonk, a dangerous emergency charge cue, a simple unique bounce for split, substantial menu sounds, happy kill feedback, a longer respawn sound and an extravagant long victory sound. This revision stays in the existing isolated audio worktree `/home/tyler/Projects/rat-detective-chaos-foley`, branch `codex/chaos-foley`.

## Result

| Cue | Revised sound |
|---|---|
| Grow | 680 ms swelling layers of increasingly low wet squelches with soft body weight; no balloon |
| Wall bonk | 240 ms filtered body thud; no spring, wood or metal |
| Charge | 600 ms rough two-part danger klaxon |
| Split | 220 ms single rounded rubber bounce |
| Name tick / stamp | 120 ms substantial clack / 380 ms weighty mechanical stamp, louder in the title menu |
| Kill confirm | 820 ms happy rising brass-style flourish and bright bell |
| Respawn tick | 720 ms bouncing resonant countdown bell |
| Victory | 4.8-second original major-key brass-style fanfare with drum roll, cymbals and sparkling finish |

Nine other WAVs are byte-identical, including accepted jump/corpse bounce/corpse kick. Launcher sounds remain removed. Bank: **18 mono 24 kHz/16-bit WAVs, 505,992 bytes**. Retained recorded components and original offline synthesis are documented in [source notes](../../assets/audio/cartoon-foley/README.md). No newly downloaded material was incorporated; attempted source candidates returned HTTP 403.

Long world cues cannot overlap another copy. The final name stamp stops any active rolling clacks. Victory clears the new bus and excludes other/duplicate new cues until its fanfare ends, preserving the existing eight-voice cap and reset/disable/disposal behavior. Existing gun/rat/music systems and gameplay tuning are unchanged. Original server trigger definitions are unchanged.

The refreshed `output/chaos-foley-audition.html` puts the nine revisions first, labels unchanged clips and adds name-roll/countdown sequence buttons at actual UI timing. No browser gameplay/input automation was performed. Human acceptance of these nine revised sounds remains pending.

## Verification and preview

- **656 tests passed**: 107 Worker, 527 client, 22 script. Focused audio/world/HUD checks: 26 passed. Typecheck/build passed; existing Vite large-chunk advisory remains.
- The initial full run hit the known intermittent `aiLiveDiagnostic` pursuit assertion. That test, objective brain and controller match the captured pre-audio baseline. Its focused rerun and subsequent full suite passed. No AI changes were made.
- All 18 files passed format, non-silence, headroom, zero-edge and distinct-hash checks; nine retained files were verified byte-identical. Listening-page JavaScript syntax check passed. Logs/receipts use `output/foley-payoffs-*`.

[Play the audio preview](http://127.0.0.1:5186/?room=graybox-benchmark-match-deliberate-foley&diagnostics=quiet). Expires **September 10 at 3:48 AM Pacific / 10:48 UTC**. Reload open listening/game tabs. Only the existing audio relay was restarted with an immutable client refresh; Worker `e39175b8-0e8d-45e2-aa64-0630ff6ff62e`, backend simulation and expiry are unchanged. The active original checkout, other previews and production were preserved. No commit or merge.

Current client: `index-CnPJTOPW.js`, SHA-256 `20346f2e6c001139faed6df1fa01a7799217d37af280af8adcdd8ffc0a83c283`. Receipt: `output/foley-client-2026-09-10T07-25-22Z/deployment.json`. HTTP checks matched HTML/JavaScript/all 18 WAVs against the immutable fixture. A separate 6.5-second passive observer saw **190 valid protocol-4 snapshots**, eight rats and zero invalid packets. Raw server annotations include bounces filtered out by the client; delivery evidence does not establish perceived sound quality. Integration remains an audio-only patch against the captured dirty baseline, requiring review against subsequent source work.
