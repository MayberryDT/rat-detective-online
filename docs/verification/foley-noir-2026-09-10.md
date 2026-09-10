# Noir countdown and restrained victory — September 10, 2026

Tyler accepted the name roll and other retained cues, removed grow, charge, split, kill confirm and unstick, and requested a darker non-chimey countdown and a less extravagant noir victory with a little comic character. This supersedes [the preceding large-payoff revision](foley-payoffs-2026-09-10.md). Work remains in `/home/tyler/Projects/rat-detective-chaos-foley`, branch `codex/chaos-foley`.

## Result

- Removed all five cues from the runtime catalog, generator, built assets and client playback hooks. Shared gameplay annotations remain compatible; the client ignores those four incident accents. Kills still retain their feed, stats and attribution. No incident or projectile mechanics changed.
- Countdown: **550 ms**, filtered dry wooden clock tock, low damped bass pulse and soft mechanical tail. No chimes. Runtime gain **.30**; same once-per-positive-digit trigger.
- Victory: **2.1 seconds**, original muted D-minor jazz phrase, low plucked bass and soft brush strokes, a small falling horn bend and quiet case-closed thock. Runtime gain **.43**, down from .78. The old 4.8-second bright fanfare is removed.
- Eleven retained WAVs **and gains** match the preceding version exactly, including approved name tick/stamp, jump, wall thud and corpse bounce/kick. Launcher sounds stay removed.

Bank: **13 mono 24 kHz/16-bit WAVs, 239,372 bytes**. Retained CC0 recordings plus original offline synthesis; no new external samples. Unused balloon/slime sources are historical provenance, not runtime assets. The final name stamp still stops rolling ticks; victory retains exclusive playback on the new bus and normal reset/disposal cleanup. The old long-danger duplicate guard and its now-inapplicable test were removed with charge/grow. Existing gun/rat/music systems are unchanged.

The standalone `output/chaos-foley-audition.html` now shows the two revised cues first, labels eleven unchanged cues and omits the five removed clips. Name-roll and countdown sequence demos retain the real UI timing. Human listening remains for these two replacements; file checks do not establish subjective sound quality.

## Validation

- **655 tests passed on the first full run:** 107 Worker, 526 client, 22 script. Focused audio/world/HUD checks: 25 passed.
- Typecheck and build passed. The existing Vite large-chunk advisory remains.
- Asset checks passed: exactly 13 files, correct format, unique hashes, non-silence, headroom and zero edges; only the two intended WAVs changed and all five removals are absent from the build. Listening-page JavaScript syntax passed.
- World regression checks cover silence for removed incident annotations as well as nearby/visible/unobstructed retained impacts, bounded rays, deduplication and stale suppression. Mixer checks cover name stamp cleanup and the shorter victory's exclusive playback.
- Selected gameplay/AI/original audio owners still match the captured pre-audio baseline. No gameplay input automation was performed.

Logs and measurements: `output/foley-noir-typecheck.log`, `output/foley-noir-tests.log`, `output/foley-noir-build.log`, `output/foley-noir-asset-qc.json`. The existing audio integration patch was refreshed and checked against the captured dirty baseline. Subsequent original-checkout changes still require review at integration.

## Private preview

[Play the revised audio preview](http://127.0.0.1:5186/?room=graybox-benchmark-match-deliberate-foley&diagnostics=quiet). Reload open listening/game tabs. Expires **September 10 at 3:48 AM Pacific / 10:48 UTC**.

Only `rat-detective-foley-preview.service` received a client refresh. Backend Worker `e39175b8-0e8d-45e2-aa64-0630ff6ff62e`, simulation and expiry are unchanged. Immutable client `index-fjFYSmAr.js`, SHA-256 `574a63acb80237ae86c6d830decf95a17acf27ee6fc3617f43beccf27dcce55b`. Receipt: `output/foley-client-2026-09-10T07-40-37Z/deployment.json`.

HTTP checks matched HTML, JavaScript and all **13 WAVs** to the immutable fixture. A separate 6.5-second passive observer received **179 valid protocol-4 snapshots**, eight rats and zero invalid packets. Raw server annotations include removed/filtered events; their delivery does not imply client playback. The observer sent no gameplay input and closed afterward. No original-checkout edit, other-preview change, production deployment, commit or merge.
