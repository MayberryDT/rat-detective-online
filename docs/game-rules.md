# Protected game rules

These are accepted constraints for future changes, consolidated on 9 October 2026. Detailed status belongs in the [owning plans](current-state.md#work-owners-and-next-boundaries); measured history belongs in receipts. Preserve behavior outside the requested change.

## Authority, rounds and lifecycle

- No time limits on game modes, ever: no round deadline, overtime, sudden death or elapsed-time win. Use gameplay targets; Excessive Force stays at 10 case kills. Short power-up timers and results reading deadlines are separate.
- A room runs only with a human seat: joined, admitted and joining, or within the 30 s reconnect grace (`GameRoom.humanSlots()`). No empty-room tick, bots, alarm or continuing storage writes. Status, title preparation and admin calls never start an empty room. Last-seat departure removes bots, checkpoints once and hibernates. Never add an always-on flag.
- Each round rolls 6–9 named server bots; survivors keep names. Humans join on top up to ten total; only a full room kicks a bot for a human. Private full-lobby fixtures are explicitly different.
- Authority owns damage, pickup eligibility and scoring. Keep bounded historical collision, sphere sweeps, sequenced controls, direct action outcomes and reversible client anticipation. Preserve finite-state validation, snapshot budgets, cleanup and killer attribution.
- Reconnect preserves the human’s ID, stats, mode progress, pose and case for 30 s while its body stays vulnerable. Resume credentials are private, limited to join/welcome and tab-local sessionStorage; never log them. Preserve old-socket guards, full-room recovery and respawn deadlines.
- Every welcome rebuilds the local rat and chaos view; root-level supply props are disposed, restored heading is pure yaw, and first state never replays a claim. Retain held-control allowances across delayed batches and corrections.

## Bots and information

- Bots use the same rat body, controls, speed, acceleration, jump, air control, buffs, hitbox and fire limits as humans. Only the mind and skill dials differ; never copy movement constants into bot rules.
- Decisions happen on events and at most every 10 s otherwise. Hold a goal and fight/ignore stance between decisions. Take any visible stocked pickup within 12 units on the same floor, even carrying the case; skip Quick Fix at full health and refresh held buffs. A nearer loose case comes first; a Jurisdiction carrier scoring in its zone takes only supplies inside that zone.
- Nobody sees a case/carrier through walls via the old locator. Case knowledge comes from sight and the shipped papers/scanner clues. Preserve bounded remembered sightings; do not feed a mind live hidden coordinates. Hunch/Stakeout perception is a separately authored ability, not a global case locator.
- Preserve shared flow fields, bounded planning, movement while replanning, progress-based recovery, completed sewer ramps, doorway exits, wall-case approaches, real trigger-shot launcher routes and roof descents. Do not scatter rats that are making progress.
- Preserve controls, aim and shot-target recording for all rats. Compare human/bot hit rates with view delay in mind; do not treat server aim error as human accuracy. No data freeze: use build-stamped eras and before/after evidence. Exclude agents and admin-touched rounds from ordinary human analysis.

## Case, pickups and weapons

- Modes are PAPER CHASE (persisted `chain-of-custody`, 5 deliveries), Jurisdiction (100 points, one active zone of 20 draining only while held), Excessive Force (10 case kills). Deliver anywhere in the destination building. The game always moves forward; mechanics must not stall the case or assignment.
- In every mode the carrier deals double damage and heals fully on a kill. Case grip releases after three enemy balls each within 2 s of the last; death drops it. A carrier’s own shots skip its carried case before closest-hit selection. Loose cases take launcher impulses; carried cases ride the rat. No drop hotkey.
- Five HP; ordinary body hits deal one, headshots kill. Ordinary balls last 1.5 s. Preserve tuned ordinary ball physics and shared muzzle/camera origins; never move an origin to hide a visual problem. Crossfire accelerates at the first wall bounce and deals ordinary damage.
- Non-heal supply sites roll randomly from the seven other kinds at start, reset and claim; 14 Quick Fix sites stay heals. Restock is authoritative at 45 s. Claims are atomic, refresh rather than stack, clear on death/reset, and rebuild the prop after its claim pop if the kind changes.
- Ironclad lasts 8 s and reflects ordinary balls without protecting the carried case. Hot Pursuit changes shared movement. Quick Fix heals fully without overheal and stays stocked at full health. Stakeout gives its authored Hunch reach.
- One weapon at a time. Tommy Gun: 20 balls/s held for 12 s, its own 22/s admission limit; other weapons keep the shared limit. Laser: click-fired, one damage, 15 s, bounded historical trace and two reflections. Mousetrap: short authoritative front throw, holds another rat 3 s without killing; occupied space never vetoes the throw. Preserve landing, release, breakage and cleanup. Older placement-only trap proposals are superseded.
- Do not restore removed incidents or weapons from legacy IDs. Keep stored-ID migration in the catalog. Launcher profiles share normal rat controls, restore walking damping on landing, and clear flight state on death/respawn.

- The Persuader fires one heavy slug every 550 ms for 15 s, dealing 2 damage and knockback; its tuning lives in `WEAPON_TUNING` in `src/shared/pickups.ts`.

## Presentation and results

- Keep the fedora/coat silhouette, shared materials, shorter gun sleeve, longer case sleeve and no empty case sleeve. Preserve the gameplay shoulder camera. Rats never bank their bodies sideways in flight; only accessories trail.
- Noir UI stays dark and transparent, with restrained outlines and one case-red language. Big headlines go through `Headlines`; never bypass its priority. Keep essential mode/status guidance visible through briefing and broadcasts. No player/bot badges on the scoreboard.
- Preserve authored steady lighting and existing live-light budgets; no added player-following fill. Frozen moon shadows and contact discs, sewer visibility, bake cache and GPU warming matter. Never query WebGL programs before `gpuDrained`; things created at welcome require warm stand-ins.
- Mobile uses shared physics/camera, independent touch ownership and one shot per tap except held Tommy Gun. Preserve pointer-lock guards, cancellation, credits and settings behavior.
- Results do not delay the next round. Humans may read until CONTINUE or the existing reading cap; bots do not wait. Exhibits appear only on results, with the same A–C for everyone and personal D when available. Replays use the gameplay shoulder camera and recorded look at real speed: no orbit/cut camera or during-play replay.
- Keep accepted production audio; agent checks mute their browser, human playtests stay audible. Follow the [juice plan](juice-plan.md) for current feel decisions.

## City, recording and operations

- The [city map](city-map.md) owns frames (north is −z), IDs, facts and measures. Gameplay changes emit their facts. Layout changes bump layoutVersion; preserve previous world versions for stored-room compatibility.
- Kit parts import leaf modules, never layout/chaos/city-plan aggregators. Fixed city collision boxes use `addCityBody` in `StaticCityBroadphase`, not `world.addBody`.
- Never prune permanent heat aggregates. Preserve build tags, recorded controls, input/shot targets and the lossless chaos wire; keep trajectory/state checks when touching its encoding. Events use bounded key-range pruning, not a full-table date scan at wake.
- Production room identity and stored history are protected. Do not recreate a namespace to restart a room. Packed `city_packs` storage has a required drain procedure before rollback past the data-cost release; follow [live service](live-service.md#rolling-back-past-packed-aggregates).
- Deploy only through the existing scripts from a clean tree for an exact build stamp and matching client/Worker. Prefer forward fixes over unqualified old-protocol rollbacks.
