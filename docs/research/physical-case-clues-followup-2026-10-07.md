# Physical case clues: research follow-up and recommended next actions

7 October 2026 · P4 T3 thread · research only, not an accepted implementation plan

## Recommendation

Start with **spilled case files**, with wet paw prints as a comparison if paper fails to communicate movement. Do not develop all six concepts. First prove that a player can find evidence and use it to rejoin a case contest at running speed. Attractive clue art alone would not establish that.

Tyler has already chosen physical clues, bright case-red outlines, and no arrows or direct-to-case guidance. That decision is not reopened here. This report recommends how to investigate the consequences without smuggling the rejected locator back in. Clue identity remains Tyler's choice.

## Evidence and limits

Read the project instructions, current-state/document map, relevant juice/city/bot/data guidance, task74 release receipt, current physical-clue report and task note, and the superseded report's source ledger. The latter is historical evidence, not active design guidance.

Veelox source HEAD is `4041deb`, with pre-existing dirty documentation. The latest documented release is `2822d1a` / protocol 33. Inspected its existing archive at `/home/halla/build/rat-detective/case-guidance-20261006/source`. Compared seven inspected files byte-for-byte with `git show 2822d1a:<path>` in `/home/halla/workspaces/rat-detective-task74-release-20261006`; all matched: HeatPrints, CarrierSight, bot goals/perception, rat movement, chaos wire and ChaosView. This is exact-release source evidence, not a live production check.

Freshly read the primary public sources below. No game/browser session, human playtest, build, service, deployment or implementation was run. No new screenshots or art exist. Only this separate research note was added; existing plans and dirty files were preserved. A project-scoped Chartroom fact lookup returned no additional clue decisions.

## What the comparisons actually establish

| Primary source | Observed design | Implication for Rat Detective |
| --- | --- | --- |
| [EA's current Apex Legends guide](https://help.ea.com/en/articles/apex-legends/abilities/), read 7 October 2026 | Bloodhound has enemy tracks, white ravens that track locations, and a separate scan. | Tracks can coexist with fast shooting, but this is not evidence that tracks alone solve finding an unseen objective. Do not copy ravens or scans under the no-direct-guidance rule. |
| [Crytek: Devil's Trail](https://www.huntshowdown.com/news/devil-s-trail-live-now), 18 March 2026 | Hiding locations is paired with scouting maps, discovery by proximity, distant smoke for convoys, and cards that expose directions or used clues. | Removing information changes the entire search loop. Hunt provides explicit ways to acquire leads; its success would not validate a few isolated paper props as Rat Detective's only acquisition mechanism. |
| [Behaviour developer explanation of scratch-mark visibility](https://forums.bhvr.com/dead-by-daylight/discussion/comment/3775530#Comment_3775530), August 2024, freshly reread | Developer Peanits explains that recoloring the whole scene can leave marks and surfaces equally hard to distinguish; a white component improves contrast. | A steady red outline needs a contrasting physical silhouette. Cream paper is promising, but red alone and a colorblind filter do not prove readability. This is a specific historical developer explanation, not a claim about the current DBD renderer. |
| [Microsoft XAG 103](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/103), read 7 October 2026 | Critical color information needs another signifier, such as shape or pattern. | Identify evidence by folder/page shape, and age by material/shape changes; do not encode freshness only as shades of red. This does not establish that subsecond age differences are visually readable. |

These are useful precedents and constraints. None measures whether this proposal works in Rat Detective.

## Findings that change the next step

### Finding the first clue is separate from following it

A nearby trail can help recover a carrier who just rounded a corner. It cannot tell a newly spawned rat which side of the city to search. A little spill beside a hidden stationary case is local discoverability, not city-wide convergence. A grounded trail also honestly breaks after launch flight.

The modes expose different risks:

- **Paper Chase:** delivery locations give contextual places to investigate, but each delivered case relocates and requires acquisition again.
- **Jurisdiction:** the active zone is a natural meeting point; easy convergence here would not prove clues work elsewhere.
- **Excessive Force:** there is no delivery destination or scoring zone. A quiet carrier or an undiscovered loose case is the strongest test of prolonged searching. The mode must still reach its ten case kills through play, without a clock.

Test Excessive Force first, including an empty-handed spawn away from all evidence. Do not let omniscient bots create a fight that conceals human discoverability failure. If this fails, revisit local spill placement, clue legibility and legitimate search opportunities before adding more clue types. If the only apparent remedy is changing the map, case spawn rules or allowed information, bring that specific choice back to Tyler.

### The proposed numbers do not yet form a readable language

`RAT_MOVEMENT.run` is **18 units/second**. At the proposed 8–12-unit spacing, successive clues are only **0.44–0.67 seconds apart** on a sustained ordinary run. Twenty to thirty seconds of travel is **360–540 units of path** before stops and obstacles. These are calculations from source, not measured play results.

This has two consequences:

1. Adjacent papers may both look equally fresh. Whole versus crumpled paper is plausible for distinguishing a recent scene from an old one; it is not yet proved to tell a player which direction a runner took. An isolated un-oriented paper cannot encode that direction by itself.
2. The **three-cluster visible budget and the stored world history are different limits**. Do not implement only three shared clues for the whole city, or send/render an unbounded history. Suppressing an important visible fork clue merely to keep the nearest three could also make the trail misleading.

Keep spacing, history duration and age appearance as test variables. Avoid exact timestamp labels, serial numbers or pointing folds to rescue a failed art treatment. Interception or a sensible local search is a valid response; retracing a prescribed route is not the goal.

### Existing prints are inexpensive effects, not existing clue infrastructure

`src/prototype/HeatPrints.ts` uses 24 instanced quads, a 0.5-unit stride, a **one-second lifetime**, and generation near each viewer's camera. The marks use additive glow and heartbeat strength. Extending their lifetime would not make every player see the same historical evidence, restore it on reconnect, or give bots the same observations.

The cheap bounded rendering pattern is reusable. Shared clue creation, lifetime and knowledge need deliberate gameplay work. Files have an existing visual basis in `CaseModel.ts`: cream paper and an EVIDENCE tag. They are still new clue art, not a completed reusable prop.

### Removing pings alone would leave bots privileged

At the inspected release:

- `CarrierSight` remembers sight and global pings, and returns a loose case's exact position directly.
- `GoalPlanner.takeable` selects loose cases without a visibility test; `BotMotor.followCase` follows their current positions.
- Jev perception describes a loose case's location directly, and names the current carrier even when its position is unknown. Its Hunch/Stakeout list also exposes rat aliases and positions; that combination needs review for carrier identification that a human could not make.
- `chaosWire.ts` includes the case in the shared state. Hiding markers does not redact the network state.

The first playable experiment therefore needs equal **gameplay knowledge** for client presentation, code bots and Jev. Bots must not use hidden coordinates, exact clue timestamps or ordering metadata to solve an ambiguity humans cannot read. Reuse their current roam/navigation abilities when evidence ends. Do not add a learning project or increase Jev request frequency.

A complete anti-cheat transport redesign is a separate scope. Do not claim network secrecy from a presentation/perception change.

## Clue identity assessment

| Concept | Recommendation | Reason |
| --- | --- | --- |
| Spilled files | First candidate | Directly belongs to the existing briefcase; broad pale surfaces and a distinct folder silhouette; no text reading needed. Freshness/direction remains the main uncertainty. |
| Wet paw prints | One comparison, if needed | Familiar evidence of movement. Flat marks risk poor shoulder-camera visibility; natural toe orientation needs Tyler's judgment against the no-pointer rule. Existing heat prints are only a rendering reference. |
| Cheese crumbs | Defer | Competes with existing cheese projectiles, weapon debris and pickups; its joke adds little navigational clarity. |
| Cigar ends/ash | Defer | Strong noir identity, weaker continuity and a difficult small silhouette at speed. |
| Torn photographs | Defer | Landmark recognition adds map-learning and inspection demands; moving-carrier information is weak. |
| Witness notes | Defer | Reading and stale place names interrupt the chase; a relay is a second information system to design. |

For files, begin with one oversized, low-relief folder cluster and at most one visible sheet. Steady red contour, pale material, dark shape details, no flutter, beacon, floating label or required interaction. Match evidence shape across stages of wear. An EVIDENCE stamp is flavor, not text the player must read. Judge size from the actual shoulder camera at mobile resolution, not an attractive close-up.

Keep a compact spill discoverable while a loose case remains there; do not let all evidence of a stationary objective evaporate. Preserve honest recent history across possession changes. Case relocation clears the old episode; player death does not. An airborne case leaves no imaginary ground route. The exact persistence of an endpoint left by a stationary carrier belongs in the small experiment, not an untested promise of continuous guidance.

## Recommended sequence

1. **A small visual-and-information proof.** Use the real camera and game-scale scene for a street fork, occluded corner, sewer transition and stationary case. Include aged/fresh papers at the actual proposed spacing, viewed while moving; 844×390, low graphics and Blackout must be represented. Compare wet prints only if files cannot communicate enough. Deliver labeled stills plus a short repeatable camera clip; distinguish rendered prototype material from production screenshots.
2. **One private end-to-end gameplay slice, after Tyler starts implementation.** Server-created bounded shared evidence; cheap pooled rendering; matching join/reconnect state; real support surfaces; remove superseded case pings, locator/edge cues and death-recap pointers together with bot hidden fixes. Preserve mode destination information, combat, carrier buffs, ordinary Hunch/Stakeout abilities and accepted weapon behavior. Review their information interactions explicitly. No new service, navigation engine, per-frame storage or AI system. Build/output on Halla.
3. **Test acquisition before polishing.** Exercise a fresh spawn with no nearby clues, a quiet stationary carrier, loose-case rediscovery, doubling back, handoff, flight/landing, delivery relocation and reconnect. Compare actual humans in matched baseline/candidate sessions; bots must use the same information rule. Automated E2E verifies shared lifecycle and parity, not whether players understand the art.
4. **Make the result reviewable.** Produce a repeatable E2E script, seeded scenario description, source/build identity, video and a short before/after table. Measure spawn-to-case-contest time and long periods without a usable lead, alongside case takes, loose duration, kills and combat interruptions. A visible clue is not proof someone noticed it; a watched recording/player explanation supplies that evidence. Reuse existing case/fight facts and add only missing clue lifecycle/perception facts through the existing recorder. Keep admin-touched and agent sessions labeled and out of ordinary human comparisons.

Candidate acceptance: evidence is recognized while moving; old versus recent evidence is understandable without red alone; clues do not demand ground-staring or reading; no hidden bot shortcut; no wrong-floor/through-wall trail; no persistent dead-end search after objective relocation. Gameplay should still move toward case contests. Numerical tolerance for extra search time should be chosen from the baseline human run, not invented as a researched fact.

**Next action I recommend:** select spilled files for the small visual-and-information proof. The major remaining product question is how much searching between fights is enjoyable. Test that early—especially in Excessive Force—before committing to the full shared clue system. This research does not select a concept on Tyler's behalf or authorize implementation/deployment.
