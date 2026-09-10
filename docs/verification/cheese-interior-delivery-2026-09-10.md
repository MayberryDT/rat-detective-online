# Cheese readability, interior lighting and delivery respawns

Implemented September 9 Pacific / September 10 UTC, 2026. This follows Tyler’s approval of player-relative cheese cues and interior lighting, plus the new request to respawn the case after a Chain delivery. Existing uncommitted work is preserved. No Git commit or production deployment.

## Behavior

- Every cheese ball retains its golden material, spherical silhouette and shaded pores. Your own rounds have no danger rim/trail. Other rats’ rounds have a thin orange rim and short trail; lethal enemy Crossfire bank shots get a red rim and longer trail. Owned Crossfire/Popcorn rounds remain visually harmless. Local predictions use the same golden material. Speed 175, gravity −25, restitution .9, radius .15 and ordinary lifetime five seconds are unchanged.
- Danger rims and trails use bounded instanced batches, depth testing and lifecycle cleanup. There are no per-ball lights or added shadow maps; the authoritative 256-ball cap is unchanged. This is presentation, not a damage-rule change.
- Records uses warm pendants; Icebox uses cold strips; Needleworks uses industrial pendants; Pump, Sluice and Maintenance use utility fixtures. Placement follows existing floors, counters, aisles and galleries. Fixture stems reach existing ceilings; Sluice lamps occupy the passage between its solid pylons. No playable geometry or colliders changed.
- Four existing overhead spots are reused. Each source supplies explicit power, range and cone angle; upstairs lights no longer acquire streetlamp power from their absolute height. Room/floor selection follows the rat instead of the offset shoulder camera. Static interior pools are limited to their landmark/floor, with lower room fill. Sewer light pooling and the rat brightness/outline remain. Live spots still have no wall shadows; room selection is not full per-wall occlusion. `lighting=classic` restores the prior illumination and interior fixture arrangement while retaining the newer streetlamp layout.
- Each non-winning Chain delivery awards one personal point, chooses the next shuffled landmark and releases/respawns the primary case at a randomized authored pickup site. Sites are checked for floor support and physical clearance, avoid landmark volumes with a margin, and are at least 30 horizontal units from the delivering rat. Available sites away from other living rats are preferred. The existing previous-spawn exclusion is retained. The third personal point closes the match and leaves the winning case carried.
- Respawn clears case motion and missile/pickup state. Scores and destination order persist; the normal red case cue points to the new location. Delivery shows “CASE RELOCATED” with its point confirmation, without the lost-case penalty sound. Confirmation temporarily hides the competing case broadcast. Tampering suspension, fresh entry after cleanup and single-winner resolution remain intact.

## Verification

**657 automated tests passed:** 107 Worker, 528 client, 22 Node script tests. `npm run typecheck`, `npm run build`, `npm run visual:build`, and `git diff --check` pass. The default `npm test` was attempted twice: the unchanged launcher trajectory stress test hit its five-second deadline under unrestricted client concurrency. It passes alone (three launcher tests, 2.18 seconds of test execution). All 528 client tests then pass with `--maxWorkers=4`; no launcher behavior, assertions or timeout was changed.

Focused checks cover viewer-relative ownership/Crossfire/Popcorn cues, golden pore geometry, bounded render counts and shot cleanup; explicit lamp strength, room/floor selection, underground transitions, four-light budget and classic lighting; all six landmark deliveries, safe respawn, retained points, physical reacquisition, suspension, third-point winner, and feedback without a false loss cue.

**Controlled local multiplayer:** the Worker tests use ordinary and compact WebSocket clients, physical assignment finishes, single win/reset resolution, and late joining after eviction. The relocated loose case and delivery progress survive restoration. These are automated protocol/state checks, not human multiplayer playtesting.

**Headless bot routes:** two solo runs on actual city geometry complete three deliveries with random case relocation and reacquisition, including street/sewer travel, in 78.50 and 111.80 simulated seconds. Both have zero recovery callbacks. The first case is given to the bot; subsequent cases are collected normally. There is no incoming fire, and shots are counted rather than simulated. Report: `output/cheese-interior-2026-09-10/navigation-probe.json`.

**Static gameplay-camera review:** Records ground floor and gallery, Icebox, Needleworks, Pump, Maintenance, Sluice, plus owned/enemy/lethal cheese at ordinary and enlarged sizes. These use the real city, rat and shoulder camera in `assignment-fixture.html`, without gameplay input. Human movement, contested delivery pacing, danger-cue readability in fast motion, lighting feel and audio remain for Tyler to playtest. No frame-rate improvement is claimed.

## Private playtest

[Full game](http://127.0.0.1:5187/?room=graybox-benchmark-match-cheese-delivery-v14&diagnostics=quiet&lighting=pools) · [Classic lighting comparison](http://127.0.0.1:5187/?room=graybox-benchmark-match-cheese-delivery-v14&diagnostics=quiet&lighting=classic).

Private Worker `f49f4645-e716-4b98-a4cd-03eed72d96a4`, immutable client `index-Bjwkja3V.js`, protocol **5**. Expires September 10 at **3:51 AM Pacific**. Service: `rat-detective-cheese-interior-preview.service`; receipt: `output/hosted-capacity-deployment-2026-09-10T06-51-30-456Z/deployment.json`. This refresh supersedes older private preview links; public production is unchanged.

Six-second passive hosted check in a separate automatic pool: eight rats, 160 valid snapshots, zero invalid packets; exact served client bytes match the immutable build. This does not test gameplay input or networked delivery feel. Report: `output/cheese-interior-2026-09-10/full-preview-check.json`. Build/test logs and reproducible probes are in the same output directory.

[Static cheese comparison](http://127.0.0.1:5188/assignment-fixture.html?assignment=closing-time&view=recordsinside&cheese&held) uses the actual gameplay camera. Left: yours; center: enemy; right: lethal enemy ricochet. This fixture is a posed rendering, not a live incident simulation.
