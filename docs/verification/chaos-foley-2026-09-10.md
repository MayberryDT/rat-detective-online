# Chaos foley verification — September 10, 2026

**Historical first pass, subsequently rejected by Tyler for random-sounding noise with unclear sources.** Its counts, checks and preview version describe that iteration. See the [deliberate revision](foley-deliberate-2026-09-10.md) for the current result.

## Scope and isolation

User requested a new worktree implementing all sound opportunities from the preceding read-only audit. Implementation lives at `/home/tyler/Projects/rat-detective-chaos-foley`, branch `codex/chaos-foley`. No commit, merge, deployment or existing preview/service change was performed.

The worktree copied 413 tracked/nonignored paths from a stable snapshot of the original dirty checkout at `/home/tyler/Projects/rat-detective`, starting from HEAD `7694ee4c9016334a8f8842a13848b456f2b740cd`. The branch name alone therefore does not represent the full baseline. Its source hashes and original dirty patch are in `output/audio-baseline/manifest.json` and `source.patch`. A reconstructed baseline was hash-verified against all 413 paths for comparison.

Other work continued changing the original checkout during this task. This task's edits were confined to the audio worktree; it did not restore or overwrite those concurrent edits. `output/chaos-foley-only.patch` contains this task's binary-capable delta against the captured baseline. Review overlaps when integrating with newer assignment, HUD, simulation or scenery work.

## Result

- 75 distinct mono 24 kHz/16-bit WAVs: **1,958,580 bytes** total. All are non-silent, have zero-valued edges, have distinct SHA-256 hashes, and remain below full scale. Measured peaks range from 0.6913 to 0.8200. Receipt: `output/foley-asset-qc.json`.
- All 65 audit opportunities have event wiring; [the trigger map](../chaos-foley.md) distinguishes shared physical contacts, rendered motion, prop regions and UI transitions.
- 16 reusable new voices with priority reservations, four concurrent asset loads, bounded event/source tracking, scene cleanup and no delayed playback backlog.
- Original gun, rat, recorded mouth-pop, feedback and music assets remain intact. No ball/launcher tuning, controls, map collision, assignment rule or damage-attribution changes are part of the audio delta.
- Standalone local listening sheet: `output/chaos-foley-audition.html`. It embeds all clips, uses catalog volumes with adjustable listening gain, and never connects to the game.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `VITEST_MAX_WORKERS=2 npm test` | **654 passed: 107 Worker, 525 client, 22 script** |
| `npm run build` | Passed, including Wrangler type generation; client `index-BGBSMYS9.js` |
| Focused audio/protocol/physics checks | Real case/corpse contacts; incident annotations; full/compact parsing and malformed rejection; impact/payload budgets; voice/loading bounds; teardown; snapshot/flyby lifecycle; movement at 30/60/120 Hz; HUD milestone deduplication |
| Asset integrity | All 75 format/duration/peak/edge/hash checks passed |

Logs: `output/foley-full-tests-final.log`, `foley-typecheck.log`, `foley-build.log`. The build retains Vite's large-chunk advisory (965.27 kB minified / 275.62 kB gzip); this pass does not claim a frame-rate or load-time improvement.

The first full run exposed a presentation fixture that bypassed the GameSession constructor and lacked its new foley observer; the fixture now includes real MotionFoley tracking. That run also had one intermittent AI pursuit diagnostic failure. Its unchanged pre-audio snapshot and the audio tree both passed focused reruns, followed by the complete passing suite. This does not establish that the existing diagnostic can never flake.

## Human acceptance remaining

No browser gameplay/input automation was performed. Actual sound character and crowded live balance remain unreviewed by a human. Listen especially to ordinary ricochets with many bots, nearby footsteps, repeated case impacts, machine layers over their existing sounds, horns and the distinction between personal hit/kill/victory cues. The file checks establish valid assets and the tests establish event behavior; they do not establish subjective audio quality.

Shared impact fields are additive to protocol 4. Matching client/server builds should be used for a preview: older clients will ignore `foley` but do not understand `audioOnly` particle suppression. Public production remains unchanged.

## Subsequently requested playable preview

Tyler requested an in-game preview. Deployed the frozen audio worktree to a **new independent private Worker**, `rat-detective-chaos-foley`, version `d35f6a3e-a21c-4b50-93f4-23cf80f8e29b`. The shared capacity Worker and its other active previews were preserved. This new namespace uses the existing authenticated, expiring fixture with a 24-player cap, eight-frame acknowledgement window and automatic rooms that backfill to eight total rats.

Play: [audio preview](http://127.0.0.1:5186/?room=graybox-benchmark-match-chaos-foley&diagnostics=quiet). It expires **September 10 at 3:18 AM Pacific** (10:18 UTC). Local relay service: `rat-detective-foley-preview.service`, serving the immutable copied client `index-BGBSMYS9.js` and all 75 new sound files. The hosted endpoint remains authenticated; use the local link.

The readiness check verified byte-identical HTML, JavaScript and all 75 WAVs. A 6.5-second passive observation in a separate room received protocol 4, eight rats, **169 valid snapshots, zero invalid packets and 560 foley events** (`case-bounce`, `bounce`, `trigger`). It sent no gameplay input and closed afterward. One initial check reached the relay before it started listening and got connection refused; the retry after its ready message passed. Build passed again before the frozen fixture was prepared.

Receipt: `output/foley-preview-2026-09-10T06-18-42-559Z/deployment.json`; readiness: `output/foley-preview-readiness.json`. The local relay and copied simulation stop at fixture expiry. No production deployment, original-checkout edit or merge occurred. This is the sound worktree's captured game baseline, not the later municipal-race changes being developed separately.
