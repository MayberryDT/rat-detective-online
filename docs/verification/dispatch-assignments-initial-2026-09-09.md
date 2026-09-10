# Dispatch Assignments — local implementation

Implemented September 9, 2026 on `codex/dispatch-assignments`, starting from the accepted playtest commit `7694ee4`. The initial implementation made no deployment or new commit; the subsequently requested private preview is recorded below. The supplied Dispatch Assignments blueprint informed the implementation after Tyler authorized it; embedded handoff prompts were not separate commands. Tyler explicitly deferred direct loose-case launcher work. The existing eight-case Evidence Tampering implementation supersedes the packet's stale four-case description.

## Playing the assignments

| Assignment | Winning action | Initial configuration |
| --- | --- | --- |
| Closing Time | Hold the primary Hot Case as shared processing reaches zero | 45 seconds of living held time; drop, death, disconnect and Tampering pause it. Theft preserves the remaining time |
| Chain of Custody | Carry through two ordered verification stops, then carry through final intake | Icebox south / Seizure Check → Records west / Archive Check → Records south / Evidence Intake. Stamps belong to the case; the final carrier gets the win |
| Misfiled Evidence | Get the primary case through Records south intake, carried or loose | A living carrier wins a carry-in; a loose case credits its last legitimate holder or actual projectile claimant. Connected dead claimants can win |

One room shares one fixed assignment. A 2.4-second reveal precedes objective advancement. All three modes appear once per shuffled three-round cycle; adjacent cycle boundaries cannot repeat. Forced private selection may repeat deliberately. Returning to automatic selection starts a fresh bag avoiding the last revealed mode. Joining or leaving does not reroll an announced assignment. The current room's bag and progress survive eviction.

Kills and deaths remain secondary statistics. There is no 20-kill finish, carrier multiplier, highest-kills timeout, or contribution requirement in assignment rooms. The existing three-second respawn and six-second victory/reset cadence remain. World-version-1 rooms retain their existing legacy hit/deathmatch path; no fourth playlist entry was added.

## Case contacts and interruptions

The case center must cross a front-facing receiving mouth while its projected width/height fit. The swept segment must reach that opening without an intervening wall. This catches fast entries and rejects stationary occupancy, back entry, side walls and shots that merely hit signage. Physics checks run against the real city geometry. The shared destination catalog also drives signs and bot approach points.

Chain's loose crossings give a carry-required notice and leave the case available for collection. Wrong/inactive doorways award no stored credit. Pickup attachment itself cannot snap-score; a fresh carried crossing is necessary. Misfiled unclaimed entries are rejected and return to the outside approach. Recoveries clear Misfiled flight claims, preserve countdown/stamps, and cannot auto-file the case.

Filing ownership is independent of projectile/corpse damage ownership. Actual projectile contacts use existing attribution, including attributed incident children. Body hits alone and passive physical movement do not transfer a filing claim. A resolved result is immutable; later contacts cannot create a second winner. The room checkpoints it together with one reset deadline before sending gameWon.

Evidence Tampering still produces eight weaponized, uncollectible cases. Activation suspends objective time, verification and filing; it clears the Misfiled claim. Seven extras disappear at expiry. The original case keeps its progress. If restoration leaves it overlapping a relevant mouth, it returns to that doorway's outside approach and needs a fresh entry. No incident crossing is queued for later credit. Other incidents keep their mechanics and can remain active at a valid finish.

Ordinary cheese balls, case kicks/reflections/disarm and pickup safeguards, damage protections, camera, pistol, movement, city geometry, navigation budgets, roster policy and corpse chains retain the accepted baseline. No new launcher-to-loose-case impulse was added.

## Presentation and bots

A compact assignment ledger shows the rule, shared remaining time or stamps/next destination, and Misfiled claimant. A short introduction uses existing audio cues. Doorway fittings display active, inactive, verified and suspended status without adding collision or dynamic lights. Icebox's sign mounts on its existing canopy fascia. The result names the actual assignment winner and identifies posthumous credit.

Server bots pursue and contest cases as before. A carrier routes to the next receiving doorway through the existing shared navigation, approaches from outside, then crosses. Bots keep their combat decisions while delivering. Misfiled bots use a legitimate carry-in strategy; no new bank-shot aiming system is implied.

## Direct selection and builds

With a matching local Worker, use a new `graybox-practice-...` room and a page query such as `?room=graybox-practice-dispatch-one&assignment=chain-of-custody`. Valid values are `closing-time`, `chain-of-custody`, `misfiled-evidence`, and `auto`. The ordinary endpoint permits this only for localhost private practice requests with the existing origin checks. An authenticated, unexpired private capacity fixture also supports direct selection in fixed private rooms; automatic matchmaking pools reject forced selection. Active rooms cannot be changed to another mode by a joining client. Repeating the current forced selection is harmless.

Protocol version is **2**. Client and Worker must be updated together. Existing hosted relay previews still point to their previously deployed backend; rebuilding local `dist` does not update that backend. The requested private preview below now uses a matching hosted fixture. The public game has not been deployed with this update. See [tooling](../tooling.md) for the established preview workflow.

Static visual review is available through `npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 5188 --strictPort` at `/assignment-fixture.html`. Parameters include `assignment`, `view=icebox|archive`, `stamps=0|1|2`, `phase=briefing|suspended|closed`, and `held`. It uses the real city, models, HUD and shoulder camera with a forward-looking orientation. It has no gameplay input, network or scoring loop and is not a playable multiplayer preview.

## Validation

Focused rules/physics tests cover shared timer theft, both resolved disarm orders, real carried entries at all three doors, a stolen completed Chain file, loose Chain rejection, carry-in Misfiled, actual projectile claim theft, a banked case entry, a corpse-shoved entry, a posthumous finish, invalid/disconnected filing, recovery, Tampering activation/expiry, offline restoration and reset cleanup. The bank scenario adds a controlled side wall to the real city simulation; it establishes physical rebound/credit behavior, not the quality of every live map bank angle.

Durable Object WebSocket tests deliver all three real physical finishes across two shuffle cycles to both ordinary and compact clients, compare results and resets, verify one reset event, preserve stamps through eviction/late join, reject absent claimants, retain a closed result without awarding again, and restrict direct selection. Bot integration tests use actual navigation and collision, carry through the full route and complete Misfiled without recovery. These are deterministic integration checks, not human multiplayer footage or load benchmarks.

Visual review checked Records south, Records west and Icebox signs, the held countdown, narrow-screen briefing, compact suspension and posthumous result. The review caught and corrected canopy occlusion. No browser movement, pointer-lock or firing automation was used.

Validation passed: **597 tests** (106 Worker, 469 client, 22 script tests), `npm run typecheck`, `npm run build`, and `npm run visual:build`. After final HUD/sign refinements, the 50 focused assignment/physics/bot/session/HUD tests passed again. The script stage initially caught a changed source anchor in the copied private-capacity builder; the builder was updated and all 22 script checks passed. Both builds retain Vite's existing large-chunk warning. The final client artifact is `dist/assets/index-cfOysAd5.js`.

Human playtesting remains necessary for the 45-second pacing, route length under combat, doorway readability during motion, and whether steals and improbable deliveries produce the intended stories. No equal-duration or capacity claim is made. The temporary visual-review server and browser were closed after review.

## Requested private preview

After implementation, Tyler requested a playable preview link. The dedicated authenticated capacity Worker was refreshed to **88a7b24d-792c-44d4-b24a-bbe19a34e38d** with the existing 24-rat automatic-room configuration. The local relay serves the immutable client copy accompanying that deployment.

[Play Dispatch Assignments](http://127.0.0.1:5182/?room=graybox-benchmark-match-dispatch-v10&diagnostics=quiet) — expires **September 9 at 11:01 PM Pacific** (September 10 06:01 UTC). The playlist rotates all three assignments; playing alone starts with seven server-owned AI.

The authenticated health identity, served HTML/client bytes and protocol version 2 were verified. A separate private room received 74 valid compact snapshots, eight total rats and an active Chain of Custody assignment, with zero invalid packets; the observer then disconnected. This was a bounded connection check, with no browser gameplay/input automation. Production remains unchanged.

Deployment and check receipts: `output/hosted-capacity-deployment-2026-09-10T02-01-06-530Z/deployment.json` and `preview-check.json` in the same directory. Relay PID at launch: 970176; it closes at expiry. This supersedes the older port-5181 private preview.
