# Rat Detective: deeper codebase ergonomics review

9 October 2026. Read-only source investigation on Halla’s `agent-ergonomics` worktree, based on `47047fcd`, with the first navigation pass staged. Tyler asked to investigate and report, not perform another refactor. No application source, current guidance, tests, deployment or service configuration changed during this review. This report is the only added repository document.

## Assessment

A deeper pass is worthwhile. The game already has useful architectural boundaries: shared rat controls/body, authoritative simulation, transport codecs, city recording, external bot mind, replay recording and presentation. Preserve these. The problem is concentrated ownership: everyday feature work repeatedly enters broad coordinators whose details mix several responsibilities, and some names/comments describe obsolete behavior.

The strongest finding is a reproducible bot case-sight discrepancy. It illustrates why this is more than folder tidiness: duplicated perception rules disagree. The rest of the findings concern maintainability and navigation; they are not evidence of live failures.

## Evidence and scope

Traced pickups, bot sight/knowledge, reconnect/lifecycle and replay/results through their producers, state and consumers. Inspected source boundaries and existing checks. A static relative-import scan covered 342 TypeScript files; it is a lightweight scan, not a compiler AST or proof of all dynamic dependencies. Its two runtime cycles were then confirmed in source. Type-only cycles were not treated as runtime defects.

| Routine edit junction | Lines | Relative source imports, including types | Commits touching it among the last 100 source-changing commits |
| --- | ---: | ---: | ---: |
| `worker/GameRoom.ts` | 2,281 | 41 | 27 |
| `shared/ChaosSimulation.ts` | 1,883 | 30 | 24 |
| `session/GameSession.ts` | 1,199 | 64 | 27 |
| `presentation/ChaosView.ts` | 969 | 59 | 30, under its former `prototype/` path |

Size alone does not justify splitting a file. The task traces below identify actual seams. History counts measure edit concentration, not bugs or complexity by themselves. Source has not changed during this audit, so the earlier path-equivalence/build receipts remain applicable to the first pass; no new full test run was performed.

## 1. Bot case knowledge has competing sight policies

**Confirmed decision-boundary discrepancy; highest priority to investigate/fix separately from a behavior-preserving refactor.**

`shared/bots/motor.ts:487` computes loose-case sight from ordinary range, Blackout and Pea Souper: fog caps it at `FOG_REACH` (24). But `shared/bots/goals.ts:169`, inside `BotGoals.takeable`, registers a new loose-case sighting with its own fixed 60-unit distance and a clear ray. `RatBot.decide` calls `takeable` before `motor.perceive` (`ratBot.ts:107–109`). A goal can therefore receive the case’s exact fresh position before the motor’s shorter fog policy applies.

A bounded probe ran the real RatBot decision path with fresh bots, an active Excessive Force assignment, no pickups, straight-route navigation and explicit ray outcomes. Failure scenarios/confounders were recorded before writing the probe.

| Scenario | Expected new case knowledge | Observed |
| --- | --- | --- |
| Ordinary sight, clear ray, 40 units | Yes | Yes; case goal |
| Pea Souper, clear ray, 40 units | No, beyond 24 | **Yes; exact position exposed and case goal selected** |
| Pea Souper, clear ray, 10 units | Yes | Yes; case goal |
| Ordinary sight, blocked ray, 40 units | No | No; explore goal |

This establishes a discrepancy in the actual decision code, not its prevalence in production. The probe uses controlled geometry and a mind that selects an offered case goal; it is not a human/hosted E2E playtest. Fresh bots rule out legitimate remembered sightings. No fix was made.

The ownership trace is:

```text
ServerBotController.visible: collision ray result
  → RatBot.decide
      → BotGoals.takeable: loose-case fresh sight and memory
      → BotMotor.perceive: rat sight, carrier sight, evidence and target selection
      → BotGoals.survey: available goals and paper clues
      → worker/bots/perception.perceive: Jev wording and additional sensed/heard information
```

The worker file called `perception.ts` is largely a textual description adapter, while physical sight lives elsewhere. A fresh agent can reasonably start in the wrong module. `CarrierSight` is already a useful explicit memory boundary; build on it.

**Recommendation:** give loose-case sight/memory a clear owner and shared incident-dependent sight policy. Make goals consume known observations rather than independently registering sightings from authoritative state. Keep Hunch, paper clues, radio leads, remembered positions and physical line-of-sight distinct. Rename the Jev adapter to reflect situation description. Preserve no-hidden-live-coordinate rules and decision timing. Fix the fog discrepancy as an explicitly identified behavior change, with facts/era comparison, rather than hiding it in a structural commit.

## 2. Pickup work is spread through broad owners

**High value, moderate risk.**

Changing a pickup’s rules starts in `shared/pickups.ts`, but a claim’s full route is:

```text
GameSession.checkInteractions (845)
  → ChaosView.interaction / anticipateInteraction (439 / 464)
  → pickupIntent
  → GameRoom.handlePickupIntent (1365)
  → ChaosSimulation.claimInteraction / collectPickup (410 / 377)
  → GameRoom.applyPickupEvents (1378): recording, awards, durable heal and broadcast
  → pickupResult
  → GameSession.receive
  → ChaosView.resolveInteraction / syncPickups / updateBuffs (469 / 577 / 617)
```

Crossing client, authority and recording is appropriate. The navigation burden comes from unrelated responsibilities inside the files at those boundaries.

`ChaosView` owns scene-root pickup props, availability, optimistic claims, accepted generations/ticks, local claim feedback, DOM buff cards and weapon display, alongside bullets, corpses, case motion, machines, clues and replay behavior. Its disposal method must remember cleanup for all these groups. `syncPickups` deliberately waits for a claim animation to settle before rebuilding a changed kind; an extraction must keep that ordering.

The simulation has both automatic proximity claims (`stepPickups`) and explicit human intents (`claimInteraction`). Both converge on `collectPickup`, which is a good existing seam. Do not create a second authority implementation or replace automatic claims casually.

**Recommendation:** first extract a cohesive pickup presentation owner containing props, claim anticipation/reconciliation, claim feedback and cleanup. Keep authoritative collection centralized. Separate scene presentation from buff-card DOM where doing so makes the ownership clearer. Expose a small lifecycle API, not a generic event bus. Add symbol-level routes to the code map so “pickup not collected” and “pickup card wrong” lead to different starting methods.

## 3. Session results and reconnect assembly are buried together

**High value, moderate risk; a narrower first extraction than all of GameSession.**

`GameSession.receive` spans approximately 236 lines (552–787) of transport events, damage/kill presentation, pickup outcomes, respawn, round reset and results. The class also owns input, frame stepping, camera/light adaptation, music, replay dev hooks and welcome reconstruction.

Results have an identifiable collection of state (`pendingVictory`, `pendingLineup`, `pendingResults`, `resultsShown`, `awaitingContinue`, `continued`, `held`, deadlines) and methods: `showResultsBoard`, `continueFromResults`, `endResults`, `lineupEntries`. Replay recording/player/Exhibits are already separate; the remaining results orchestration is embedded in the live session.

Reconnect is a different concern. `welcome` (398–520) clears inputs and results, resets feel/audio, disposes local/remote views, may regenerate the city, restores yaw, constructs the rat/ChaosView, wires trap/machine/feel callbacks, applies state and preserves warm-loading behavior. Its ordering is meaningful, not arbitrary boilerplate.

**Recommendation:** extract the round-results coordination first, with explicit callbacks for input/pointer lock and transport readiness. Keep live simulation separate from results viewing. Later isolate welcome assembly/cleanup as one named operation. Do not convert all events to a registry or rewrite every message branch at once. Preserve CONTINUE, held readers, recorder freeze/release, reconnect reset and the next round’s independent progress.

## 4. Warm-up resources and live resources have parallel construction paths

**Medium-to-high value; needs visual/loading verification.**

`session/createGame.ts:46–127` manually builds and retains warm stand-ins for rats, pickups, restock icons, case materials, traps, safes and papers. `GameSession.welcome` and `ChaosView` construct live counterparts later. Evidence materials also receive noir patching in separate warm/live wiring.

An agent adding a visual feature must discover both paths and shader/material variants. Updating just the visibly relevant class may cause a loading stall or first-use compilation. The first-pass guide warns about this, but a warning leaves the coupling as memory work.

There is already a good example: `createShotDraws` is a shared construction function used for warm and live shots. Extend that pattern selectively.

**Recommendation:** move actual material/prop construction to small shared factories used by warm and live paths, with named warm variants where unavoidable. Keep stand-ins retained for the whole session, GPU fencing and existing material/light variants. Do not create a universal resource registry or change the loading sequence while moving construction. A production build alone is insufficient; verify program warming and a matching hosted cold entry when authorized.

## 5. Two runtime import cycles have small, concrete seams

**Good early structural work; relatively low risk with equivalence checks.**

- `shared/worldSpec.ts` imports `grayboxLayout.ts`; `grayboxLayout.ts` imports `generateBuildingLayout` back. The function dispatches to production graybox boxes or seeded version-1 geometry, and a comment explicitly warns callers to use version 1 to avoid recursion (`worldSpec.ts:85–88`; `grayboxLayout.ts:70`). World description, legacy generation and production assembly are entangled.
- `presentation/StreetReadability.ts` imports `FacadeBeams` and `windowBrightness`; `FacadeBeams.ts` imports `sampleStreetSpill` and spill types back. The pure sampling/brightness helpers can live below the renderer/bake owners.

These are functioning cycles, not demonstrated runtime errors. Breaking them would make direction and ownership easier to follow.

**Recommendation:** extract the seeded building generator/types into a leaf module and keep a thin version dispatcher; extract spill sampling/types/brightness into a lighting leaf. Preserve random-number order, returned geometry, source ordering and baked output. Avoid broad barrel files that recreate the cycles. Do not spend time eliminating type-only cycles just to lower a graph count.

## 6. Historical remnants remain in active source and guidance

**Low-risk clarity work after checking compatibility and consumers.**

- `RatBot`’s class comment still says humans know a globally advertised loose-case position or a last-seen/pinged carrier (`shared/bots/ratBot.ts`, comment before the class). Jev perception comments still describe 4-second carrier pings (`worker/bots/perception.ts:164`). Actual carrier memory says pings provide no knowledge and accepts wax, flocks and scanner evidence.
- `ChaosView` constructs `CarrierPingFlash` (298), then unconditionally hides it in its current physical-evidence update (728); no current `.update` invocation was found. Its shaders/geometry and old names still suggest a supported feature. `caseLocator` remains useful for other guidance, so it must not be deleted based solely on the old name.
- `worker/bots/perception.ts:85` says another rat’s trap kills, while the current trap holds. Other current wording correctly describes holding.
- Rat model/animation files live in `utils/`, while bodies/entities/controllers live elsewhere. This is navigable with the new map but less obvious than a named rat-view/model home.
- `ServerBotController` imports `FEEL` from `feel/feelTuning.ts` for physical launch hang/lift (200). That file is data-only, so this is not a browser-code leak, but its cosmetic name hides authoritative tuning. Hunch ranges are also repeated between client feel tuning and Jev wording. No current numeric mismatch was established.

**Recommendation:** correct stale comments; explicitly label compatibility and fixture-only paths. Remove the unused carrier-ping construction only after checking old replay/fixture/resource consumers. Clarify the home of shared physical tuning without copying constants. Move rat art into a named home only if it improves the actual art-task route; do not shuffle every folder.

## 7. The first-pass map needs semantic corrections before merge

**My first pass checked link existence and source equivalence more thoroughly than semantic completeness.**

Three corrections are needed:

1. `docs/game-rules.md` says non-heal sites choose from six kinds. Current `PICKUP_KINDS` has eight total, including the Persuader; non-heal sites choose from seven. The current rules page also omits the Persuader’s weapon behavior.
2. The pickup-reflex summary omits two accepted exceptions in bot-learning L2 (line 87): a nearer loose case comes first; a carrier scoring in a Jurisdiction zone only takes supplies inside it. Current source implements these. This is a guide omission, not a newly discovered behavior violation.
3. The replay guide assigns selection/playback to ReplayDirector too broadly. `ReplayRecorder` selects/retains shared exhibits; `ReplayStage` plays the reconstruction; `ReplayDirector` owns the POV camera. Correct names matter to an unfamiliar agent.

The new `check:repository` cannot detect these semantic mistakes; 317 valid links do not prove guidance is accurate. Task-based source review remains necessary. Keep detailed numeric rules with their owner and avoid turning the short entrance into another duplicated catalog.

## 8. Verification routes require qualification before risky extractions

The existing legacy `smoke-ws.mjs` opens a private room without current admission, expects three HP and client-reported hits; it remains in CI. The first pass preserved the failed log and documented it rather than repairing it. The latest softer-bot release also records an existing aiming-bound failure. A full green-suite claim would be false.

There are useful current boundaries: idle-room and connection-recovery E2E passed in the first pass; seeded bot-sim exercises actual controls, navigation and simulation; clue/replay scripts provide further bounded checks. Pickup system tests use actual simulation; card tests stub DOM/other views, so they do not prove browser cleanup or shader warming.

**Recommendation:** establish a current, repeatable E2E receipt for the specific extraction before changing high-risk ownership. For pickups: competing claims, denial/rollback, heal at full HP, restock/random-next kind, late join, reconnect and scene cleanup. For bot sight: fresh observations, fog/blackout, lost sight/memory, carrier changes and evidence leads. For results: reset while reading, reconnect while reading, CONTINUE and replay freeze/release. Keep failure cases explicit first, use existing harnesses, and do not respond by adding many post-implementation unit tests.

## What I would do next

1. Correct the first-pass semantic omissions and misleading active comments before merging that branch.
2. Treat the reproduced fog case-knowledge mismatch as a small, separate behavioral fix, preserving ordinary sight and valid memory; qualify its recorded behavior and human/bot parity.
3. Break the two leaf-helper cycles and clarify sight/description ownership. These are useful, bounded structural changes with concrete equivalence checks.
4. Extract pickup presentation, then session results orchestration. Use the real task traces and cleanup invariants to judge whether each extraction reduces the number of responsibilities an agent must understand.
5. Leave GameRoom’s lifecycle/checkpoint machinery until those smaller passes succeed. Its tick currently sends frames before checkpointing (1740–1762), and `checkpointGame` atomically persists room, rotation and due poses (1860). Extracting it carelessly could restore storage costs or output-gate lag. Keep GameRoom as the lifecycle coordinator even if helpers move out.

No generic plugin architecture, dependency-injection container, universal event bus, barrel-file maze, repository-wide feature-folder rewrite or arbitrary file-size target is justified by this investigation.

## Artifacts and repeatability

Halla: `/home/halla/build/rat-detective/agent-ergonomics/`.

- `deep-import-map.json`: relative-import scan and measured large modules; cycles manually confirmed above.
- `bot-sight-diagnostic-cases.md`: scenarios/confounders written before the probe.
- `diagnose-bot-sight.ts`, `run-bot-sight-diagnostic.mjs`, `bot-sight-diagnostic.json`: repeat the bounded decision-boundary discrepancy with `node /home/halla/build/rat-detective/agent-ergonomics/run-bot-sight-diagnostic.mjs`.
- Earlier `navigation.json`, `source-equivalence.json`, build logs and lifecycle/recovery receipts describe the first navigation pass, not acceptance of any proposed deeper change.

This audit did not deploy, invoke external Jev, run a human/browser gameplay session, change the fog behavior or refactor code. Findings distinguish observed source/diagnostic behavior from proposed organization and verification still needed.
