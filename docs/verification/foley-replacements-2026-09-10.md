# Jump, growth and sticky release replacements — September 10, 2026

Historical replacement pass. Tyler subsequently accepted jump/corpse sounds, rejected balloon growth and requested [heavier goo and larger cartoon payoffs](foley-payoffs-2026-09-10.md); use that receipt for the current preview.

Tyler requested removal of launcher sounds and new jump/grow/unstick sounds because the spring variants did not communicate their actions. All work remains in `/home/tyler/Projects/rat-detective-chaos-foley` on `codex/chaos-foley`.

Removed all six launcher samples, catalog entries and activation/cooldown hooks. The bank contains **18 clips, 191,592 bytes**. Jump is a short classic platformer hop, growth combines balloon inflation and strained rubber, and unstick uses a reversed slime attack followed by a forward squelch. These replace the door-stop variants with distinct source material. All other 15 retained clips are byte-identical to the preceding pass. Creator links, verified CC0 licensing, hashes and exact edits are in [source provenance](../../assets/audio/cartoon-foley/README.md).

`output/chaos-foley-audition.html` now contains only the 18 current clips, puts the three replacements first, and explains each trigger. No browser input/playtest automation was used; the new sounds still require human listening.

## Trigger explanations

- **Wall bonk:** a living RatEntity has a real sideways contact with impact speed above 8 and a mostly horizontal contact normal (`abs(normal.y) < .5`). This covers walls and vertical obstacles. It is a collision cue for the rat.
- **Charge:** a ball's first world-surface bounce during **Crossfire**. A bounced ball during that incident deals three damage. It is the charged-ricochet transition, not a firing-input charge mechanic.
- **Split:** a ball's first world-surface bounce during **Ricochet Racket**, which creates up to two additional balls within the existing projectile cap.

World-surface bounces include floors as well as walls. Nearby/visible/static-occlusion and sound-rate limits still gate all three cues; no triggers or rules for these effects were changed.

## Checks and private preview

**653 tests passed** (107 Worker, 524 client, 22 script); typecheck and build passed. Focused audio/protocol tests: 22 passed, including all six launcher activations/cooldown expiry staying silent. All 18 WAVs pass mono 24 kHz/16-bit, non-silence, distinct-hash, headroom and zero-edge checks. Logs: `output/foley-replacements-{tests,typecheck,build,asset-qc}` with `.log`/`.json` extensions as appropriate. Vite's existing large-bundle advisory remains.

The existing private preview received a **client-only refresh** with immutable `index-BAM8Gkwn.js` and all 18 sound files. The existing private Worker stays at `e39175b8-0e8d-45e2-aa64-0630ff6ff62e` with unchanged simulation and expiry; no backend deployment was needed. Only `rat-detective-foley-preview.service` was restarted. The original checkout, other previews and production were preserved.

[Play the current audio preview](http://127.0.0.1:5186/?room=graybox-benchmark-match-deliberate-foley&diagnostics=quiet), available until **September 10 at 3:48 AM Pacific / 10:48 UTC**. Reload any open listening/game page to get the new assets. Receipt: `output/foley-client-2026-09-10T07-02-25Z/deployment.json`. Prior server stage is retained in that receipt.

Readiness verified byte-identical HTML, JavaScript and all 18 WAVs, then passively observed **191 valid protocol-4 snapshots**, eight rats and zero invalid packets in a separate private room. Raw server sound annotations still include bounces filtered out by the client; this is transport evidence, not human audio acceptance. Client SHA-256: `15250bf27e24149f1d66d99e0be2263993d4b1998ff6dfd5b4ddc41171cd2ed5`. No commit or merge occurred. The refreshed integration patch still compares against the captured dirty baseline.
