# Accepted shooting and short-trap release — 6 October 2026

**LIVE and verified.** Tyler accepted corrected V3 origin and all changes, then authorized this release. Production Worker `9d2c12a6-a89f-485c-9ca8-87d76b02e661`, build `production-2026-10-06-2822d1a`, **protocol 33**, client `index-In17n5ua.js`; layout 7 / mindVersion 12. [Play](https://ratdetective.online/).

| Environment | Worker version | Build | Predecessor |
| --- | --- | --- | --- |
| Staging | `51f8b718-4095-4c4e-a26b-e5aeccf15135` | `staging-2026-10-06-2822d1a` | aiming build `748340a`; historical intermediate `6643102` / `15406626-92c5-4f93-8bcd-c7e19adb122b` was repaired and never promoted |
| Production | `9d2c12a6-a89f-485c-9ca8-87d76b02e661` | `production-2026-10-06-2822d1a` | `1bdd31df-e7f3-47bb-bf23-fa1c537828ae`, `production-2026-10-06-748340a` |

The ordinary clean `npm run deploy:staging` → qualifying play/continuity → `npm run deploy:production` path was used after worker6's explicit serialized slot handoff. Production deploy log opened 20:03:43 UTC and completed 20:04:06 UTC; first bundle/health verification 20:04:47.801 UTC. These are recorded operation/observation times, not invented provider timestamps. The source commit was pushed first; the following receipt commit publishes documentation/era metadata without another deployment.

Tyler accepted corrected V3 origin and all V3 changes, then explicitly authorized the complete live release. This release integrates the accepted range treatment into actual GameSession/ChaosView consumers, rather than publishing a range-only change. The protected pistol pressure/body smack, corrected composed-camera aim, Tommy receiver casings/cycling mechanism, physical Laser discharge and confirmed victim response, and immediate heavy short front trap flight are retained.

Source: clean isolated `release/task74-20261006` at `2822d1a5459810ea953fc747f69b6a6e998f0ce3`, descending from accepted `dcfbb2f`, published `173c09c`/aim `748340a`, and packed-storage `2476135`. `6643102` integrated consumers; `2822d1a` resolved root's independent caller review. Root reviewed the repaired diff and found no remaining material source issue, conditional on runtime/continuity proof. Canonical gameplay source and the accepted private range remain intact.

Protocol **33** requires matching client and Worker through existing join/welcome reload gates. New optional trap flight/land/held fields and damage weapon metadata must not be silently consumed by protocol-32 clients. World/layout **7** and storage schema are unchanged. Older persisted stationary traps remain valid; new flight/snap/held states survive compact transport and restore. No layout bump or new storage migration is needed. A restored delivered socket receives a fresh welcome (`GameRoom.deliveryFor`), and NetworkManager rejects a mismatched welcome; fresh protocol-32 joins were actually rejected on staging and production with “Reload to continue.” Rolling back to protocol 32 after new flight/held checkpoints is **not qualified**: its trap handling predates these fields. Prefer a protocol-33 corrective build; an older gameplay rollback needs explicit compatible trap-state handling in addition to the existing packed-aggregate precautions. Packed CityStore, rows/unpack endpoints and rollback scripts remain byte-identical to accepted ancestry. Never roll back past `2476135` plainly: deploy rows mode, drain all rooms with the existing unpack runbook, then roll back.

## Verification and limits

- Main TS/build pass. Existing focused client checks: 31, wire/validation: 41; repaired caller audio/reaction checks: 22. No new repository unit tests or full-suite claim.
- Evidence-only real NetworkManager → local Worker/GameRoom process check passes: immediate launch and inventory consumption, real flight/landing, compact-state roundtrip/restore, actual catch without HP loss, restored release, in-flight Laser break 8→5→2→0, and finite wall/edge/air/vertical landings. Local fixture positions/inventory are setup; positive outcomes come from real shared simulation/inputs. It is not hosted-world proof.
- Hosted public agent uses actual synthetic CDP mouse/key firing, movement/jump and normal random supply claims. No admin changes, injected health/pickups/successes, paid Jev or new access grant. Initial hosted rooms were observed empty. Named private hosted graybox attempts are unauthorized and excluded; no bearer scope was broadened.
- Historical failed/incomplete driver attempts are retained and excluded as described in `driver-exclusions.txt`: unauthorized private room, vertical mouse sign, nearby shoulder waypoint circling, stale pre-respawn pose. They do not establish directed aim or affected-weapon capability.
- Captures are real normal-scale GameSession HUD/scene frames. Video sorts CDP paint timestamps, not arrival order; no audio synchronization is claimed. The model cannot receive audio input and has not auditioned the preserved actual recordings. Tyler's acceptance is separate from numerical/automated proof.
- Live catch/release, exact cardinal/near-wall/air throws and natural round reset were not all deliberately reached; range R is not a live reset. Prior local authority checks cover named rare cases without pretending they happened hosted.

## Repeatable evidence

All artifacts/builds live on Halla at `/home/halla/build/rat-detective/task74-release-2026-10-06`. Commands use `/home/halla/workspaces/rat-detective-task74-release-20261006` and its exact-lock dependencies.

```sh
BASE=https://rat-detective-staging.mayberrydt.workers.dev MODE=staging-restocks node /home/halla/build/rat-detective/task74-release-2026-10-06/consumer.mjs
node scripts/check-hosted-aggregates.mjs snapshot --base <origin> --out <after.json>
node scripts/check-hosted-aggregates.mjs compare <before.json> <after.json>
node /home/halla/build/rat-detective/task74-release-2026-10-06/verify-hosted.mjs <origin> <label>
npm run deploy:staging
npm run deploy:production
```

`SOURCE-MANIFEST.json` records protected hashes and built assets. `network-evidence.json`, `network-tests.txt`, `root-review-followup.txt`, served-bundle hashes, deploy logs, aggregate before/after/compare receipts and per-browser frame/evidence/cleanup files preserve provenance. The review service at port5197 stays available; temporary verification processes/seats are cleaned up.

## Actual hosted results

**Staging:** `staging-restocks/evidence.json` records real supply acquisition, 12 Tommy rounds during a 600 ms hold and shot `ad3f389b-e603-4d75-a863-efcd54ae317f` → `rat-body`, 1 damage on `rd-ai-07`. This real hit survives the earlier targeting-driver limitation; it does not prove precise directed aim. Trap `trap-2`, shot `a3cc433b-d662-476a-bb82-760e9626864f`, has actual flight at age 0.033 s, travels 4.7804 horizontal units and lands after 450 ms. No catch was forced or claimed.

For a discriminating Laser body-response check, two ordinary browser players joined the public staging room and moved with real keyboard/mouse controls. The target stood near a real ready Laser supply, without a privileged spawn or pose/health injection. `staging-contact-shooter` and `staging-contact-target` record shots `2776c422-9cd9-4c3c-9c49-1492b6de2985` and `9dbe6728-7684-41d6-823f-6bb8926e25e6` → `rat-body`, 1 damage each, target HP 5→4→3 with authoritative `weapon: laser`. Normal-scale gun/beam/victim captures were inspected. Target and shooter are both owned test browsers, not human preference evidence. Their consumers and public poses/IDs are saved; no resume credentials are recorded.

`staging-feeloff-verified` fires twice through the ordinary client: nine Web Audio source starts near each press, no runtime errors. Combined with the reviewed handled=false fallback and existing audio checks, this establishes a running fallback graph, not a listening judgment. Historical incomplete/invalid attempts and their exclusions are retained; they are not described as passes.

**Production:** `production-public/evidence.json` records actual movement/jump, ordinary pistol firing and genuine acquisition/firing of Tommy, Mousetrap and Laser. Twelve Tommy descriptors followed a real held press; casing/mechanism captures were inspected. Trap `trap-2`, shot `bc310ac8-428d-4cb5-9983-5101b29eb591`, flies from the shared front launch and lands after about 433 ms; a subsequent real hit reduces its HP 8→5. Laser shot `5b3f0230-c5b9-45de-8dff-a36da9e7ff4d` produces `rat-body` on bot `rd-ai-03`, damage 1 / HP 4, with `weapon: laser`; actual gun/beam/contact scene captures were inspected. The moving-target result used existing compensation (250 ms, targetDelta 3.8621 units). A screenshot 200 ms after firing is not an exact press-frame aim qualification or proof that visible and historical target poses coincide. The accepted composed-camera aiming block and ballistics remain preserved; no production diagnostic overlay exists.

All qualified hosted consumers report zero uncaught runtime errors and no socket closes during their successful bounded runs. This is synthetic GPU-headless Chrome real input, not native or human play. No new audio audition or subjective-quality claim is made. Tyler already accepted V3 and origin before release.

## Continuity and cleanup

| Environment | Before keys / total | Final after keys / total | Missing / lower |
| --- | --- | --- | --- |
| Staging | 186762 / 179330103 | 187527 / 179756727 | 0 / 0 |
| Production | 202500 / 209175352 | 202614 / 209248746 | 0 / 0 |

`staging-final-continuity.json` covers the staged integration/repair sequence through the final qualified build; it is not a fabricated per-intermediate-version snapshot. `production-continuity.json` checks immediately after promotion, and `production-final-continuity.json` checks after actual play. Growth is not attributed exclusively to our seats. Both public rooms return **0 players / 0 bots** after own browser cleanup/reconnect grace (`*-status-after-play.json`); `/status` does not wake a room. Production was observed empty before deployment. No claim is made that nobody could join between observations.

The index SHA256 is `1c0614b6551cc3a407110ad839cb4a6e8c56d1f222d77d309ebaa336e2cea48c`; GameSession-containing `createGame-ePOwQSqE.js` is `35a8125184456094a0a8ac18a4744aeccbaa84e8da21583005b64865789447c3`. Staging and production served both exact hashes plus the matching network bundle. `SOURCE-MANIFEST.json` preserves the accepted pistol/feel/animator/weapon/trap constants, gun ballistics/cadence and CityStore/rows-unpack scripts. Original canonical gameplay source, accepted private worktree/review site, research, unrelated cost proposal and storage44 outputs are untouched. Temporary local Worker/collector and own verification browsers are stopped; authorized review service5197 remains available.

The offline era metadata separates this functional trap/accepted-feel release from random-supplies; every recorded fact retains its exact BUILD. Detective work remains deferred. Later travel/surface/kill-aftermath/crowded-fight proposals are not declared implemented by this release.
