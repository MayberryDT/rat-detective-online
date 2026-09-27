# Feel spec: what each action should feel like

Part of the [juice plan](../juice-plan.md), which owns status and order. Read
this when building or reviewing a feel item. It covers the agreed outcomes from the
27 September brainstorm, which Tyler approved in full ("I love it all and want to
do it all").

Every item is **presentation only**. It must run from events the client already
receives, reset cleanly (respawn, round reset, reconnect, network correction),
scale with the relevant Setting, and switch off under `?feel=off`. Starting
values live in the tuning file ([foundation](foundation.md#tuning-and-flags)).
They are guesses to dial in, not accepted values.

## 1. Camera

| Item | Trigger (existing) | Response | Limits |
| --- | --- | --- | --- |
| Shot kick | Local shot sent | Short upward view nudge that settles back in about 120 ms. Stronger for Big Cheese and Scattershot. | View only. Repeated shots don't pile up past a cap. |
| Hit jolt | `playerDamaged` for you | Small shove away from the attacker, scaled by damage | Settles in about 150 ms |
| Landing dip | Local landing (as in `MotionFoley`), scaled by fall speed | Downward dip. Heavy landings add a low rumble. | No dip for small steps |
| Launch view | Local launcher flight start/end | View widens by about 6–10°, easing back on landing | Steering and aim unchanged |
| Hot Pursuit speed | Local Hot Pursuit active | View widens by about 3°, speed streaks at the edges | Off when the buff ends or you die |
| Kill punch-in | `playerDied` where you are the killer | About 150 ms slight zoom | Skipped during the death camera |
| Death camera | Your `playerDied` | Follow your ragdoll for about 0.8 s, then a noir iris-out into the respawn screen | Respawn timing and deadlines unchanged |

## 2. Impacts and hits

| Item | Response | Limits |
| --- | --- | --- |
| Impact freeze | The victim's model and its splat pause for 40–60 ms on hits you deal or take | Other objects and the simulation never pause. No freeze on your own view. |
| Cheese stains | Stains build up on a rat's coat during one life, as a comic read of how battered it is | Capped per rat. Cleared on respawn. Works with outline and batching. |
| Wall splats | Bigger splats that last longer and drip | Uses the existing splat pool and its cap |
| Ironclad reflection | Spark burst with the existing armour clang | Pooled |
| Crosshair | Stronger kill bloom on the existing hit and kill markers | Existing precedence kept (hit never erases kill) |
| Comic words | "SPLAT!", "KER-CHEESE!" in the victory font for big moments: multi-kill, Big Cheese hit, kill during flight | Rate-limited so they stay special |

## 3. Danger and death

| Item | Response | Limits |
| --- | --- | --- |
| Damage direction | Red screen-edge flash plus an arrow toward the attacker. The damage message carries `attackerId`. | Fades in about 1 s. Tracks the attacker's position. |
| Noir low health | Colour drains toward black and white as your health falls; sound muffles and a heartbeat plays. Quick Fix floods the colour back. | Your screen only. Flash strength setting applies. |
| Hat knock | Hits knock the fedora askew, then it settles back | No permanent wobble |
| Hat pop-off | On death the fedora pops off and tumbles as its own object | Cosmetic object. Cleared with the corpse and on respawn. |
| Death variety | Ragdoll flavour chosen by cause: explosion fling, shot spin, trap flop | Physics-driven ragdoll kept. Case/trap death jokes kept. |

## 4. Character

Model touch-ups and animation live in [character](character.md).

## 5. Movement and flight

| Item | Response | Limits |
| --- | --- | --- |
| Dust | Puffs on heavy landings, skids and launches | Pooled, capped |
| Skid | Brief skid pose and dust when you sharply reverse direction | Controls never slowed |
| Launcher flight | Coat flares, tail streams, ears flatten, the hat lags, and wind rushes | Straight sleeves; gun keeps its real aim |
| Hot Pursuit | Speed streaks and a stronger trail on top of the existing red outline | Existing outline kept |

## 6. Sound

Footsteps by surface, coat and case jostle, cheese squelch layers, near-miss whizz,
sewer echo and muffled interiors, a brass stab on kills, and music stings for case
pickup and closing seconds. Bounds, sourcing and mix rules: [sound](sound.md).

## 7. City reacts

| Item | Response | Limits |
| --- | --- | --- |
| Pigeons | Flocks on streets and roofs scatter from nearby shots and explosions | Instanced; capped count |
| Paper and litter | Kicked up by launches, explosions and running rats | Pooled |
| Neon and lamps | Signs flicker and streetlamps sway when hit by cheese | Existing lights only; no new light sources |
| Steam | Manhole puffs | Pooled |
| Trash cans | Tip over when hit | Client-only. Never collide with rats, balls or cases, and never block shots. |

Props differ between players, so they must never affect gameplay or visibility
fairness.

## 8. Rewards and round end

| Item | Response | Limits |
| --- | --- | --- |
| Score pop | Points count up with a punch; the case timer pulses | Existing server totals only |
| Streak callouts | Noir voice lines: "ON THE CASE", "RAT RACKET", "COLD CASE" (killing the carrier) | Rate-limited; kept short |
| Victory slow-motion | The winning moment plays in slow motion on screen | Starts after the server's victory freeze; reset/respawn timing unchanged |
| Case File | Round-end awards: Most Cheesed, Longest Flight, Butterfingers, Sewer Dweller and similar | Tyler approved new per-player stats (2026-09-27): optional server fields, protocol stays 18, older clients ignore them. Counting happens on the server; the client only displays. |

## What this supersedes

Tyler asked to start fresh on 27 September. These older rules are replaced:

- **Camera.** "No camera bob or shake from cosmetic polish" (2026-09-12 animation handoff, [player settings](../player-settings.md)) is replaced. Camera effects are allowed if they are view-only and controlled by a setting.
- **Hat.** "No hat loss" is replaced. The hat pops off on death only; hits knock it askew and it settles back.
- **Sound.** The September 10 pruning to 13 cues removed walking, skids, flybys, echo and kill confirm. Those sounds come back with new, restrained assets and strict bounds. The rejected old clips stay rejected.

Still in force, because this is who the rat is:

- No hands, fingers or elbows. Straight floating sleeves.
- No case sleeve without a case. The case stays rigid, close to its accepted pose, with the grip exact.
- The 1,024-appearance palette, and no red clothing.
- The shoulder camera and the real muzzle as the shot origin.
