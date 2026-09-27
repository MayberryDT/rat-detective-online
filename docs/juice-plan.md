# Rat Detective juice plan

Living plan, started **2026-09-27**. This file owns current status and order.
Older plans, handoffs and receipts are **reference only**; Tyler asked to start fresh.
Where an older decision conflicts with this plan, this plan wins (see
[what this supersedes](juice/feel-spec.md#what-this-supersedes)).

## What we mean by juice

Tyler named this work **juice** (2026-09-27): the small, layered responses that
make the game *feel* good. That covers little screen shakes, on-kill effects, tiny
sounds, very subtle animations, and the atmosphere that sells the noir city. Juice
is presentation only; it never changes the rules, authority or tuning.
"More juice" is the ongoing goal. The first batch is below; the next is the
[noir pass](#next-exaggerated-noir).

In code the juice layer lives in `src/feel/`, and its switches keep the names
`?feel=off` and `?feel=dev`. The earlier working name was "polish"; the branch is still `polish/feel`.

## Outcome

Make every action physically felt. Shooting, hitting, being hit, killing, dying,
moving, flying, carrying and scoring each get a layered, immediate response
across camera, impact, character, sound and screen. The noir cartoon tone and the
rat's identity stay as they are. Done means:

- Every cell in the [feel spec](juice/feel-spec.md) is implemented or explicitly cut by Tyler.
- `?feel=off` restores today's presentation for side-by-side comparison.
- Settings expose camera shake and flash strength.
- Frame time stays within the [budget](juice/foundation.md#performance-budget) on desktop and a lighter phone tier.
- Tyler accepts the finished whole at one final review.

## Execution boundary

**Authorized 2026-09-27:** Tyler asked me to implement all of it myself, one item at a time, and leave everything for his review at the end.

- **How:**
  - I build every item myself, one at a time, with no subagents. The one exception is a single independent code reviewer on the finished diff.
  - Work happens on the local branch `polish/feel`, one commit per item, so an item can be reverted alone.
  - `main` and production stay untouched. **No GitHub push or production deploy** without Tyler's explicit OK. Deploying the private capacity-test fixture for the final preview is allowed.
- **Presentation only**, with one approved exception: Case File awards may add optional per-player stats to snapshots or round results. Protocol stays 18; older clients ignore the fields ([feel spec §8](juice/feel-spec.md#8-rewards-and-round-end)). No other change to authority, damage, hitboxes, ball/launcher/jump tuning or bots.
- **Aim stays exact.** Camera effects never move the aim ray, crosshair target or real muzzle ([invariants](juice/foundation.md#invariants)).
- **Identity is fixed:** fedora, three-button coat, 1,024-colour palette, floating sleeves without hands, the case sleeve rule, and the rat silhouette. Model changes get [render sheets](juice/character.md#render-sheet-gate), reviewed at the end. **Shoes are on by default**, with a switch.
- No new live lights or shadow maps. No cloth simulation. Effects reuse object pools.
- Agent browser work stays muted. No automated pointer-lock/input playtests; fixtures trigger events directly. Gameplay previews use the hosted private fixture ([tooling](tooling.md#required-gameplay-preview-september-11-correction)).

## Current work

- Base: production `360dbcdd…` / commit `3ffdd8b`. Branch `polish/feel`.
- **Tyler's first review (2026-09-27):** "This feels way better." One change: the shot kick was too strong. It's now very subtle (peak about 0.4°, was 1.4°).
- Next action: build the noir pass (N0–N9 below), one commit each, then a fresh review preview. Merge to `main` and deploy to production only on Tyler's explicit OK.

## Remaining outcomes (in order; one commit each)

Each item gets its own switch in the `?feel=dev` panel, so Tyler can cut it at review.

- [x] **F1 Feel layer:** director, tuning file, `?feel=off`, `?feel=dev` panel with per-item switches. → [foundation](juice/foundation.md)
- [x] **F2 Settings:** Camera shake and Flash strength; Reduced interface motion also zeroes shake.
- [x] **F3 Perf baseline:** fixture numbers with feel off, before any effect ([budget](juice/foundation.md#performance-budget)).
- [x] **1 Shot kick** · **2 Hit jolt** · **3 Damage direction and edge flash** → [spec §1–3](juice/feel-spec.md#1-camera)
- [x] **4 Impact freeze** · **5 Bigger dripping splats** · **6 Cheese stains** · **7 Ironclad sparks** · **8 Kill bloom and punch-in** · **9 Comic words**
- [x] **10 Noir low health** (colour drain, muffle, heartbeat) · **11 Hat knock and pop-off** · **12 Death variety** · **13 Death camera and iris**
- [x] **14 Model:** whiskers, eyebrows, eye tracking, cheeks, brim, hem, shoes, plus render sheets → [character](juice/character.md)
- [x] **15 Animation:** squash and stretch, skid, sneaky carry, launch pose, idle fidgets, kill nod, hit and pickup reactions
- [x] **16 Movement:** landing dip, launch view and wind, Hot Pursuit speed, dust → [spec §5](juice/feel-spec.md#5-movement-and-flight)
- [x] **17 Sound:** footsteps, jostle, squelch, whizz, echo and muffle, kill stab, music stings → [sound](juice/sound.md)
- [x] **18 City:** pigeons, litter, neon and lamps, steam, trash cans → [spec §7](juice/feel-spec.md#7-city-reacts)
- [x] **19 Rewards:** score pop, streak callouts, victory slow-motion, Case File with the new server stats → [spec §8](juice/feel-spec.md#8-rewards-and-round-end)
- [x] **20 Final package:**
  - frame-rate comparison against the budget;
  - full checks;
  - one independent code review, with its findings fixed;
  - a hosted private preview;
  - [review guide](juice/review.md).

## Next: exaggerated noir

Tyler's direction (2026-09-27): push the noir theme harder in the city, meaning its lighting, colour and atmosphere. The bright rats must still stand out against the dark city, because that contrast is what keeps the game readable. Low-health noir is the reference mood. He chose **all eight pieces at Bold strength**, each with its own switch, plus a **Noir strength** slider in the juice review panel.

**Rules for this pass:**
- Rats, cheese, cases, pickups and cameos keep full colour and brightness.
- It's presentation only and switched off under `?feel=off`.
- No new live lights or shadow maps. Pooled or instanced meshes.
- Phones get a lighter version.
- It supersedes the accepted "keep ambient, hemisphere, moon, exposure unchanged" lighting rule for the city only.

- [ ] **N0 Noir strength:** one shared strength (Bold ≈ 0.65), shown as a slider in the juice review panel.
- [ ] **N1 Deeper shadows:** a contrast curve on city surfaces only. Dark areas go darker; lamp pools stay bright.
- [ ] **N2 Colour-drained city:** city surfaces go cold grey-blue. Windows, lamps and neon keep their warmth.
- [ ] **N3 Rain and wet streets:** rain streaks around the view (not indoors or in sewers), splashes, lamp reflections on the wet street, and rain sound.
- [ ] **N4 Haze:** visible light cones under streetlamps and a little more cold fog.
- [ ] **N5 Venetian-blind light:** striped window light on landmark interior floors.
- [ ] **N6 Film grain and vignette:** plus letterbox bars during big moments (death camera, victory slow-motion).
- [ ] **N7 Neon accents:** red and teal neon signs on landmark facades that buzz and flicker. They're the only saturated colour in the city.
- [ ] **N8 Searchlights and lightning:** sweeping rooftop beams, and the occasional lightning flash with distant thunder.
- [ ] **N9 Review package:** performance check, focused checks, a fresh preview, and an update to the review guide.

## Open decisions

- **Noir pass:** built to Tyler's pick (all eight, Bold); strength and each piece are dialled at review.
- **Choices from the first review guide** not yet confirmed: the lamp/neon substitute, hem sway, Case File tallies kept in memory, and the victory card delay ([choices](juice/review.md#choices-to-confirm)).
- **Git push** of `dd5aabb`/`3ffdd8b` (and this branch) to GitHub: waiting on Tyler.

## Evidence

- Current game: [current state](current-state.md), [documentation map](README.md).
- Last release (server CPU and delivery gating): [receipt](verification/server-cpu-2026-09-27.md).
- Reference only: [2026-09-12 animation handoff](handoffs/animation-polish-2026-09-12.md) (rig map and hazards), [foley history](chaos-foley.md), [player settings](player-settings.md).
