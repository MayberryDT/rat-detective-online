# Rat Detective polish plan (the last 10%)

Living plan, started **2026-09-27**. This file owns current status and order.
Older plans, handoffs and receipts are **reference only**; Tyler asked to start fresh.
Where an older decision conflicts with this plan, this plan wins (see
[what this supersedes](polish/feel-spec.md#what-this-supersedes)).

## Outcome

Make every action physically felt. Shooting, hitting, being hit, killing, dying,
moving, flying, carrying and scoring each get a layered, immediate response
across camera, impact, character, sound and screen. The noir cartoon tone and the
rat's identity stay as they are. Done means:

- Every cell in the [feel spec](polish/feel-spec.md) is implemented or explicitly cut by Tyler.
- `?feel=off` restores today's presentation for side-by-side comparison.
- Settings expose camera shake and flash strength.
- Frame time stays within the [budget](polish/foundation.md#performance-budget) on desktop and a lighter phone tier.
- Tyler accepts the finished whole at one final review.

## Execution boundary

**Authorized 2026-09-27:** Tyler asked me to implement all of it myself, one item at a time, and leave everything for his review at the end.

- **How:**
  - I build every item myself, one at a time, with no subagents. The one exception is a single independent code reviewer on the finished diff.
  - Work happens on the local branch `polish/feel`, one commit per item, so an item can be reverted alone.
  - `main` and production stay untouched. **No GitHub push or production deploy** without Tyler's explicit OK. Deploying the private capacity-test fixture for the final preview is allowed.
- **Presentation only**, with one approved exception: Case File awards may add optional per-player stats to snapshots or round results. Protocol stays 18; older clients ignore the fields ([feel spec §8](polish/feel-spec.md#8-rewards-and-round-end)). No other change to authority, damage, hitboxes, ball/launcher/jump tuning or bots.
- **Aim stays exact.** Camera effects never move the aim ray, crosshair target or real muzzle ([invariants](polish/foundation.md#invariants)).
- **Identity is fixed:** fedora, three-button coat, 1,024-colour palette, floating sleeves without hands, the case sleeve rule, and the rat silhouette. Model changes get [render sheets](polish/character.md#render-sheet-gate), reviewed at the end. **Shoes are on by default**, with a switch.
- No new live lights or shadow maps. No cloth simulation. Effects reuse object pools.
- Agent browser work stays muted. No automated pointer-lock/input playtests; fixtures trigger events directly. Gameplay previews use the hosted private fixture ([tooling](tooling.md#required-gameplay-preview-september-11-correction)).

## Current work

- Base: production `360dbcdd…` / commit `3ffdd8b`. Branch `polish/feel`.
- Position: see the first unchecked item below. After each item, tick it here and commit.

## Remaining outcomes (in order; one commit each)

Each item gets its own switch in the `?feel=dev` panel, so Tyler can cut it at review.

- [x] **F1 Feel layer:** director, tuning file, `?feel=off`, `?feel=dev` panel with per-item switches. → [foundation](polish/foundation.md)
- [x] **F2 Settings:** Camera shake and Flash strength; Reduced interface motion also zeroes shake.
- [x] **F3 Perf baseline:** fixture numbers with feel off, before any effect ([budget](polish/foundation.md#performance-budget)).
- [x] **1 Shot kick** · **2 Hit jolt** · **3 Damage direction and edge flash** → [spec §1–3](polish/feel-spec.md#1-camera)
- [x] **4 Impact freeze** · **5 Bigger dripping splats** · **6 Cheese stains** · **7 Ironclad sparks** · **8 Kill bloom and punch-in** · **9 Comic words**
- [x] **10 Noir low health** (colour drain, muffle, heartbeat) · **11 Hat knock and pop-off** · **12 Death variety** · **13 Death camera and iris**
- [ ] **14 Model:** whiskers, eyebrows, eye tracking, cheeks, brim, hem, shoes, plus render sheets → [character](polish/character.md)
- [ ] **15 Animation:** squash and stretch, skid, sneaky carry, launch pose, idle fidgets, kill nod, hit and pickup reactions
- [ ] **16 Movement:** landing dip, launch view and wind, Hot Pursuit speed, dust → [spec §5](polish/feel-spec.md#5-movement-and-flight)
- [ ] **17 Sound:** footsteps, jostle, squelch, whizz, echo and muffle, kill stab, music stings → [sound](polish/sound.md)
- [ ] **18 City:** pigeons, litter, neon and lamps, steam, trash cans → [spec §7](polish/feel-spec.md#7-city-reacts)
- [ ] **19 Rewards:** score pop, streak callouts, victory slow-motion, Case File with the new server stats → [spec §8](polish/feel-spec.md#8-rewards-and-round-end)
- [ ] **20 Final package:**
  - frame-rate comparison against the budget;
  - full checks;
  - one independent code review, with its findings fixed;
  - a hosted private preview;
  - `docs/polish/review.md`: how to see and switch each item.

## Open decisions

- **Git push** of `dd5aabb`/`3ffdd8b` (and later this branch) to GitHub: waiting on Tyler.

## Evidence

- Current game: [current state](current-state.md), [documentation map](README.md).
- Last release (server CPU and delivery gating): [receipt](verification/server-cpu-2026-09-27.md).
- Reference only: [2026-09-12 animation handoff](handoffs/animation-polish-2026-09-12.md) (rig map and hazards), [foley history](chaos-foley.md), [player settings](player-settings.md).
