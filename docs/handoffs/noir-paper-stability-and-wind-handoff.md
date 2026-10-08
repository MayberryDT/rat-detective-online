# P4 handoff: stable, sparse, living noir evidence

> **Implemented 7–8 October.** Tyler started the work ("move forward"; scripted movement for the review recording and a staging deploy allowed). The repair is on staging (`staging-2026-10-08-f958014`, protocol 36); results, artifacts and limits are in the [repair receipt](../verification/noir-papers-v2-2026-10-08.md). Production is not deployed. The diagnosis below is history. **8 October, later:** Tyler asked for paw prints beside the papers for clarity; they and an eye-catching gust are on staging (protocol 37), see the [paw prints receipt](../verification/paw-prints-2026-10-08.md).

Prepared 7 October 2026 for **[P4] Rat Detective physical clues**. Preserve the thread title/ID.

## Authority and immediate next action

Tyler's latest gameplay instruction was: **“Tell me how you're going to fix this. Don't implement anything yet.”** He then requested this handoff. This authorizes documentation, not execution of the proposed fixes. Earlier “implement it all” produced the existing candidate; it does not override the later hold.

The next agent should read this handoff and applicable project instructions, retain the diagnosis, and wait for Tyler's explicit implementation direction. Do not start builds, tests, services, browser sessions, deployments, PR mutations or replacement workers on the strength of this document. Do not resume Nova. When Tyler starts implementation, carry the work through appropriate verification and a reviewable artifact; do not stop at another plan. Deployment remains a separate boundary.

No renewed choice among the original six clue identities is needed. This is a repair of the paper treatment, continuity and density, with requested wind life.

## Outcome and current feedback

Every spawn must offer an obvious physical lead, with multiple clues leading along a traversable route to the real collectible case. Keep the improved discoverability while making the evidence sparse, varied, stable and natural in the noir city.

Tyler says the latest appearance is better, but papers blink or flip between locations/appearances, look identical, occur in excessive numbers and form an artificial line. He wants paper that feels alive: fluttering, occasional flying sheets and reactions like the city's birds. His dictated “no-war” means noir.

Requirements:

- Preserve an immediate useful lead at every spawn and continued navigation to the case.
- No papers or case visible through buildings; no case arrows, off-screen pointers or camera steering. Preserve unrelated destination guidance and separately established abilities.
- Natural documents with a quiet, thin, steady red outline. No pulsing borders, glowing carpet or paper storm.
- Fewer papers, stronger document/shape variety, coherent wind and believable settling.
- Preserve real pickup authority, the ghost-case repair, bot/human information parity, accepted weapons/aim, no mode time limits, packed storage and human-seat room hibernation.
- Keep existing spawn/layout positions. No new detective mode, inventory puzzle, mandatory reading, cloth simulation, per-paper rigidbodies, lights or general shader framework.

The preceding response proposed the fixes below. Tyler requested a handoff afterward; numeric tuning proposals are not accepted fixed limits.

## Verified source and recorded deployment state

Rechecked while preparing this handoff:

| Location | State |
| --- | --- |
| Halla implementation checkout | `/home/halla/workspaces/rat-detective-physical-clues`, accessed with `ssh halla` |
| Branch / HEAD | `feature/physical-case-clues` / `4b081c4` — clean before adding this handoff |
| Relevant commits | `55489b0` artwork/rendering/routes; `bffa4d6` starter placement; `4b081c4` documentation/receipt |
| Veelox documentation checkout | `/home/tyler/Projects/rat-detective`, HEAD `4041deb`; substantial pre-existing modified/untracked documentation, including AGENTS.md and current plans. Preserve all of it |
| Build/media root | `/home/halla/build/rat-detective/`; no build output under `/home/tyler` |

The candidate is **local only** according to its [implementation receipt](../verification/noir-physical-clues-2026-10-07.md). Last recorded staging is `staging-2026-10-07-e862f87`, Worker `6a508a1a-44cf-4a2b-8748-62a953c9d90b`, protocol 35, at <https://rat-detective-staging.mayberrydt.workers.dev/>. This hosted state was **not rechecked** during diagnosis/handoff. Do not assume the latest feedback identifies a particular build. Production is <https://ratdetective.online/>; no deployment was performed in these passes.

Do not migrate checkouts, reset dirty files, overwrite other work, or restart existing workers. This handoff is saved in both documentation locations; its creation is not a code change or commit.

## Confirmed code mechanisms, not a fresh runtime reproduction

The read-only investigation inspected the Halla candidate. It did not reproduce Tyler's exact live scene or isolate the contribution of each mechanism to his screen.

| Symptom | Evidence at the inspected revision |
| --- | --- |
| A paper changes document, rotation or size in place | `src/shared/caseClues.ts:90–105` deduplicates by coordinate key `paper-*`, but emits either `lead-paper-*` or `paper-*`. Starter contribution ends at a hard eight-unit radius. The first contributing rat can decide which role wins. `src/prototype/CaseFiles.ts:68–74` hashes the full emitted ID for document, yaw and scale. Changing the prefix therefore changes appearance at the same position |
| Papers appear/disappear as rats move | `caseClues.ts:83–110` reconstructs the published set each simulation step, selecting a window around each rat's nearest route sample. Removed IDs disappear immediately. Replans replace the sampled path wholesale (`:62–78`); fixed samples within one path do not preserve shared segments between different plans |
| Too many papers in lines | Every living rat, bots included, contributes up to 12 papers. Ten rats can yield roughly 120 shared sheets; `CLUES.visible` permits 48 nearby rendered sheets. Route sampling frequently places sheets about three units apart and admits every turn. Exact-coordinate deduplication does not merge nearby groups |
| Additional visible-set popping | `CaseFiles.ts:55–77` immediately applies range/frustum admission and a 48-sheet budget. A three-unit preference for previously selected IDs does not preserve sheets removed upstream. Occluded papers still consume budget slots |
| Repetition / lifelessness | `CasePaperArt.ts` has one artwork tile per family, all with the same case number and perimeter treatment. `CaseFiles.ts` has one fixed shape per family, only `.94–1.06` size variation; starter IDs select only the first two families. There is no wind/deformation animation; time only affects validity |

Do not mistake instance-array reordering itself for teleportation: transforms are rewritten for each instance. The established faults concern object identity, membership and admission. The `anchored` flag bypasses age expiration; it does not make an object persist through set replacement.

Previous rendering improvements are still useful: one lit surface for paper/print/red edge, removal of near-coplanar layers, GPU depth instead of whole-cluster center-ray rejection, noir material adoption, supported placement and cached surface normals. Do not undo them or present those removed problems as newly discovered current defects.

## Proposed implementation order — only after Tyler starts it

1. **Persistent sheets and deliberate route updates.** Give each physical sheet an immutable identity and art seed; starter/route roles must not affect appearance. Preserve animation state and papers on unchanged route segments. Ordinary movement/camera changes must not replace them. Reconcile additions/removals deliberately and stabilize render admission. Case relocation/reset must retire invalid guidance explicitly; persistence cannot keep directing players to an obsolete endpoint.
2. **Sparse shared evidence groups.** Keep a small visible starter arrangement; use smaller groups where a turn, entrance or level transition needs explanation. Merge overlapping route contributions rather than displaying a twelve-sheet stream per rat. Favor irregular, supported locations by curbs and thresholds. Initial proposals: two or three starter sheets and roughly six to eight visible sheets in an ordinary street view. Tune through actual discovery; these are not universal caps. Humans and bots still use shared physical evidence.
3. **Continuous, bounded paper motion.** Most sheets rest on a surface with occasional edge flex. One loose sheet may lift, twist, travel a short distance and settle. Nearby sheets share a gust direction/envelope but respond differently by stock, weight and timing. Passing rats or impacts may disturb a sheet. Keep motion inside verified clear/supportable space; do not cross walls, jump floors, teleport home or blow away the only lead. Interior/sewer papers primarily react locally. Respect reduced-motion settings. Use simple pooled presentation state, not new server paper physics.
4. **Visible document variation.** Add a few deliberate shape/art variants within the existing four families: folded statements, narrow curled receipts, differently composed photos, inventories with varied annotations or margins. Avoid repeated neighboring variants. Vary silhouette and handling, provide believable backs when lifted, and allow all families in starter groups. Keep case-file coherence and a quiet red edge that follows the sheet.
5. **Actual continuity and navigation proof.** Verify stable identities and appearances in a populated room, including starter-boundary crossings, bot movement and moving-case replans. Produce a repeatable continuous recording and state evidence, plus scoped performance/route bounds. Update the current plan and append a new receipt; preserve historical results and explain their limits.

The visual target described to Tyler: a damp statement against a curb, a photograph nearby, and a loose receipt catching a gust toward the alley. Rest, movement and variation should make the evidence feel physically present while keeping its next lead readable.

## Useful existing motion patterns

- `src/feel/CityReactions.ts`: pooled instanced newspapers with impact velocity, spin and damping; birds react to nearby rats. Reuse motion ideas, **not** hardcoded ground `y=.02`, missing wall collision or bird teleport-home behavior.
- `src/feel/LaunchJuice.ts`: paper drift, drag, flutter and slow fall. Persistent clues must settle instead of shrinking away like debris.
- `src/prototype/CaseMotion.ts`: damped spring used for the case tag; useful for edge lag and settling.
- `src/feel/NoirRain.ts` / `FeelSound.ts`: atmosphere transitions / coarse street-interior-sewer classification. Rain wraps around the camera; evidence must remain world anchored.
- There is **no existing shared world-wind/gust system** to plug into. The proposed small gust behavior would reuse established integration patterns, not an already implemented wind simulation.

## Existing verification and what it missed

The [receipt](../verification/noir-physical-clues-2026-10-07.md) records successful build/source TypeScript checks, 926 authority/wire frames, geometric starter coverage at 930 spawn locations, two-client/reconnect checks and browser/static rendering evidence. Full repository typecheck was blocked by the pre-existing missing `three-gpu-pathtracer` import in `test/visual/title-scene.ts`. None of these checks were rerun during the diagnosis or handoff.

The reported 119 stable clue IDs compare **surviving IDs only** (`scripts/verify-case-trails.mjs:17–20`). Replacing `lead-paper-*` with `paper-*` escapes that check. The fixed motion fixture (`test/visual/case-clues.ts`) uses fixed IDs and misses server membership changes/replanning. Instance presence, geometric spawn coverage and a fixed art display do not prove human discoverability, natural motion or full visual continuity.

Canonical artifacts: `/home/halla/build/rat-detective/noir-papers-20261007/`. Selected review copies still exist at `/tmp/rat-detective-noir-review/` on Veelox: `desktop-motion.webm`, `reduced-resolution-motion.webm`, `spawn.png`, `reconnected.png`, `documents.png`. They document the previous candidate, not the proposed fixes. The original live-room video had chaotic/black portions; use it only with that limitation. No isolated steady-state performance conclusion or unbriefed human navigation acceptance exists.

After implementation is authorized, completion evidence should cover:

- Stationary observer while other rats/carrier move; walking beyond and back across the eight-unit starter boundary; pan/range/budget crossings. Track additions/removals and complete appearance, not only surviving positions.
- First visible lead through ordinary movement to the real pickup, including corners and street/sewer transitions; no invisible first lead or ghost case.
- Continuous sheet identity through a gust and landing, varied nearby documents, sparse groups, no synchronized bobbing, resets or wall penetration.
- Moving case, drop, reset, two receivers and reconnect; correct current guidance and clean resource lifecycle.
- Native/reduced resolution, lamp/shadow/Blackout; stable red edge and correct occlusion.
- Populated-room route/render/wire bounds, matched baseline/candidate measurement, exact revision/settings/commands with the video.

Use the existing E2E/receipt mechanisms; do not add post-hoc unit or tautological tests. List failure scenarios before any isolated-system test. Project instructions reserve automated pointer-lock/input gameplay tests unless requested: use permitted diagnostics and human playtests, and label static/local synthetic fixtures accurately. A gameplay preview requires the matching hosted Worker/client and normal server bots; local workerd evidence is not a hosted gameplay acceptance claim. These verification goals do not grant browser/deploy authority.

## Read next, without a broad audit

Read applicable `AGENTS.md`, [current state](../current-state.md), [documentation map](../README.md), and the relevant [juice plan](../juice-plan.md) guidance. For gameplay fact recording, follow [the city-map contract](../city-map.md). Keep builds/tests/output on Halla; read `docs/tooling.md` before starting any future process.

The [implementation plan](../plans/noir-physical-clues.md) and [reference study](../research/noir-detective-clues-reference-study-2026-10-07.md) retain useful design detail. Their “no ambient flapping needed” guidance is superseded by Tyler's latest wind request. Their stability/completion language must be read alongside this diagnosis; visual acceptance remains outstanding. The October 6 six-concept handoff is historical and does not reopen the settled paper direction.

No code, tests, builds, browser actions, services, deployment, PR or shared-plan changes were made in the latest diagnosis/handoff passes. Only this handoff was written and mirrored. No runtime block prevents planning the fix; execution is waiting on Tyler's explicit start.

## Takeover check, 7 October (read-only, HEAD `4b081c4`)

The T3 takeover agent re-read the candidate on Halla with five parallel readers and two adversarial re-checks. Code was read only. No builds, tests, services, browsers or deploys were run. Lines refer to `4b081c4`.

**The five mechanisms above hold.** One correction: sheets are not about three units apart. Sheets sit 4 or 6 units apart on straight axis runs and 2.83 or 5.66 on diagonals. Every grid direction change is always papered (`caseClues.ts:74-75`, `BotNavigation.ts:15,359`), so weighted-A* staircase routes put a sheet on every 2-unit node. Routes one cell apart form parallel lines 2 units apart.

**Further causes of blinking, confirmed in code:**

- The window anchor is a pure argmin with no hysteresis (`caseClues.ts:87-88,106`). A rat jittering at a midpoint toggles a sheet behind it and one about 30-55 units ahead. Routes that pass near themselves (U-turns, ramps, sewer portals) jump the whole window.
- The 8-unit starter test has no hysteresis (`:105`), and the lead stays recorded for the whole life (`:49`). A rat moving back and forth at 8 units blinks its starters and the far end of its window.
- A death deletes that rat's sheets at once (`:47,49`). The respawn route waits on one serial search for the whole room, up to about 3 s (`BotNavigation.ts:334-335`; humans pre-empt bots at `caseClues.ts:59`).
- A failed or over-budget replan overwrites a good route with an empty one (`:78`) and leaves no fact.
- `clear()` runs on relocation, return, reset and every step while the case returns or the assignment is closed (`ChaosSimulation.ts:431,1547,1718,1735,1816`). It wipes everything, then re-seeds starters at every rat's current position, mid-map.
- A restore (hibernation wake) keeps items only until the first `guide()` (`caseClues.ts:36-39`). Route sheets then vanish and starters reappear at current positions.
- Each rat's window follows that rat, hidden bots included. Most of the churn a stationary human sees is driven by other rats moving.
- Render range is measured from the orbiting shoulder camera (`CaseFiles.ts:57`), which sweeps about 12 units. Turning on the spot pops sheets at the 65-unit edge, and fog leaves about 45-76% of a sheet visible there.
- Starters are computed once per life with the respawn facing reset to +z (`gameState.ts:161-164`), while the client keeps its camera yaw. A respawned human's starters may be behind them. The 930-spawn coverage check uses fixed +z and omits the live `clear` predicate (`verify-case-trails.mjs:51`).
- Exact-node keys can let two neighbouring sheets overlap at the same `+.012` height and shimmer (`BotNavigation.ts:291-293`, `CaseFiles.ts:69`). This is inferred, not observed.

**The red edge is not steady:**

- It is a 7-texel stroke painted into the map and the emissive map (`CasePaperArt.ts:16-17`). That is about .006-.016 units wide: around one pixel at 10 units, below a pixel beyond, and mipmapping dissolves it into a shimmering rim (inferred from the numbers).
- Surge strobes its emissive with a square wave of about 14 Hz, and Blackout stutters it (`FeelDirector.ts:633-639` through `NoirCity.ts:58`). The red ink in the diffuse map stays.
- Square art tiles are stretched onto non-square sheets: the receipt about 2.2:1 (`CaseFiles.ts:41-42`).

**Other facts:**

- Bots inherit the id churn. Inspected memory and plan keys use the emitted id (`goals.ts:255-264`, `motor.ts:301`), so persistent ids help bots too.
- The human renderer's 48-sheet budget counts occluded sheets, while bots count only sheets they can see. The comment at `caseClues.ts:17` saying the budget is shared is stale.
- Clue facts carry raw player ids (`caseClues.ts:55,79`), against the city-map rule of no ids. The `clue` fact type is undocumented in `docs/city-map.md`.
- `chaosWire.ts:52` falls back to the whole clue list whenever kept items are not in append order. That is about 12 KB a frame at 120 sheets. The cost is inferred and unmeasured.
- Dead tuning: `spacing`, `freshMs`, `wornMs` and `clueAge` are unused, and `lifeMs` is bypassed because every sheet is `anchored`.
- The warm-up stand-in does not warm the noir-patched paper program (`createGame.ts:77`, `NoirCity.ts:63`). Each welcome rebuilds two 1024 canvases.
- While the case is carried, every route targets the carrier's live position (`ChaosSimulation.ts:1736`). This is intended and tested (`plan:139`, `verify-case-trails.mjs:28-34`), but persistence has to reconcile against that moving target.
- Refuted: rat bodies cannot fake or block the client support probe. A ray starting inside a foot sphere only exits it, and cannon drops exit hits under `skipBackfaces` (cannon-es `reportIntersection`, :5199).

**Evidence limits:**

- `room-e2e.json` has 0 `lead-` ids among 275, so it predates the starter commit `bffa4d6`.
- The receipt's room and browser runs used local workerd (`with-local-worker`), which is transport proof only.
- `verify-case-visuals.mjs:53-55` sends a scripted W keypress. That is automated input, which needs Tyler's request.
- The stable-id window in `verify-case-trails.mjs` runs with every rat standing still and no bots.
- The typecheck blocker (`test/visual/title-scene.ts:6`) is still present. It does not block `npm run build` or deploy.
- Production is protocol 33 (`2822d1a`) per `docs/current-state.md`. The candidate is protocol 35, a version first deployed to staging with the current clue shape, so the fix should bump to 36.

**Motion building blocks found:** static-only client queries (`CheeseGun.sceneryClear`/`sceneryHit` on `SpatialRayQuery`), shared `BotNavigation.walkable` and `paperPlacement` for validated short travel, `reducedMotion()` in `src/ui/motion.ts` (none of the debris integrators honour it), server-time `now` (`ChaosView.ts:690`) for client-agreed seeded gusts, impacts (`ChaosView.ts:515-537`, which must be deferred by `presentation.delayMs`) and `FOOTSTEP_SOURCES` for disturbance.
