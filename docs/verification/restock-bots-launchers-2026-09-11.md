# Restock timers, active bots and steerable launchers — September 11, 2026

Tyler accepted the preceding pickup presentation, then requested a visible respawn
countdown, slower restocking, slower Big Cheese growth, more active/challenging
bots without better accuracy, and vertical launchers with continuous steering.
This pass is private and uncommitted. Preserve the entire dirty tree.

## Result

- All 18 supply sites now restock after **45 seconds**, up from 20. Empty trays
  display a small charcoal/ivory circular **RESTOCK** dial and seconds. The dial
  faces the camera, respects walls/depth, fills clockwise, and disappears when
  the item returns. It uses no extra lights, reuses geometry/materials and only
  redraws its text texture when the displayed second changes.
- Protocol **12** includes each site's authoritative `availableAt` deadline.
  Empty sites remain in snapshots; the client and AI distinguish availability.
  Late joins see the same deadline, and room restoration preserves cooldowns.
  Match reset restocks sites. This does not change the existing reset-on-restart
  policy for personal buffs. Ironclad remains 12 s, Hustle 10 s at 1.45×,
  and Quick Fix heals to normal full HP.
- Big Cheese needs **nine world bounces**, previously three, to reach radius 2.4:
  `.15, .24, .36, .52, .72, .96, 1.24, 1.55, 1.9, 2.4`.
  Ordinary ball speed, gravity, restitution, 2.5 s lifetime and pool cap remain.
- Every launcher supplies **zero horizontal impulse** and its authored vertical
  force, including Pressure Surge activations. Player acceleration/braking works
  throughout ascent and descent. Server bots steer immediately too; a 150 ms
  takeoff guard prevents stale ground contacts from replacing the vertical launch
  with a jump. Event deduplication, ordinary jump gravity and city containment remain.

## Bot audit and fixes

The preceding pickup-first policy selected any advertised supply globally. Hidden
roofs and distant supplies continually replaced case, carrier and delivery goals.
Navigation also omitted the physical Dispatch/launcher cabinets. Combat repeatedly
reset its reaction delay when two similarly distant visible opponents traded places.

- Usable pickups have high priority **when visible within 24 units on the bot's
  current floor**. Empty sites and full-health medkits are skipped. A pickup is
  neither detected through walls nor pursued omnisciently across the city.
- Case pursuit, carrier attacks, delivery and interception resume after the local
  pickup detour. Flat routes use the existing 12-unit sprint outside assignment
  matches too; stairs and final approaches retain 6.5-unit movement.
- Control cabinets participate in navigation clearance. Supported roof tops up to
  36.3 units are navigable after landing, including the tops of solid upper masses;
  this enables collecting rooftop rewards without adding stairs or teleport routes.
- Visible combat targets are retained through nearby distance changes; visible
  carriers still take priority. Close carrier attacks use checked strafing and
  defenders patrol supported posts around an intercepted landmark.
- Combat shots are 200–240 ms apart with 120–300 ms burst pauses and more multi-shot
  bursts. Speculative fire has shorter quiet windows. The shared five-shot-per-second
  bound remains. Aim error **2.8–5.6 degrees**, reaction **200–450 ms**, observation
  **160–260 ms**, tracking **200 ms**, correction **250–500 ms**, and brief last-seen
  follow-through are unchanged. Tyler's estimated 20% accuracy is not a measured
  hit-rate target or a new aim setting.
- Preserve shared reverse destination flow fields: six cached fields, 96 expansions
  and 2 ms per update. Pending-route movement, failed-goal suppression and
  progress-based recovery remain bounded.

## Verification

**919 tests pass:** 134 Worker, 759 client, 26 scripts. Typecheck and production
build pass; the existing large-bundle warning remains. Focused coverage includes
late-join/restore deadlines, malformed deadlines, compact/delta round trips,
atomic claims, real city pickup routes (street, tunnel, second floor and roof),
nine physical Big Cheese bounces, immediate ascent/descent steering, launch
history/reset, imperfect aim, target retention and objective patrol movement.

A 120-second render-free comparison used the r5 frozen source and this final source,
seven dispersed bots, real city collision/navigation, a Chain assignment and actual
case/pickup simulation. Rats were kept alive and shot callbacks counted without
ballistic damage. This isolates navigation/selection/cadence; it is not a full match,
FPS benchmark or user playtest. Planner wall-time scheduling is not deterministic.

| Observation | Frozen r5 | This pass |
| --- | ---: | ---: |
| Moving samples (>0.4 units per 0.5 s) | 58.1% | 89.3% |
| Shot callbacks | 1,556 | 2,441 |
| Case-owner changes | 1 | 7 |
| Deliveries | 0 | 3 |
| Pickup claims | 14 | 5 |
| Rescue callbacks | 0 | 0 |

Every r5 goal sample was `pickup`; the new sample includes case, carrier, delivery,
intercept, combat and local pickup goals. Fewer claims are expected with longer
cooldowns and no global pickup obsession. Occasional stalls remain: two bots had
maximum stationary stretches of 7.5–8 seconds. Most had maxima of 0.5–1.5 seconds.
Do not describe this as eliminating every stuck route or proving final difficulty.
Ignored local evidence: `output/pickup-refinement/bots-before.json`,
`bots-final.json`, and `audit-bots.ts`.

A separate muted static art inspection checked the dial at 45/23/5 seconds and
confirmed props return after expiry. It used no gameplay inputs. Human gameplay
remains Tyler's test; his preview stays audible.

## Matching private preview

[Audible preview](http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r6).
Hosted private Worker **f64194f3-4abe-4b16-bd1b-cdfbbf21674c**, protocol **12**,
expires **September 12 at 2:07 AM Pacific**. Frozen deployment receipt:
`output/hosted-capacity-deployment-2026-09-12T05-07-26-599Z/deployment.json`.
Relay PID at start: **545843**. Normal production matchmaking/backfill supplies
one human plus seven server bots, up to 16 total rats; empty rooms sleep.
No local workerd, browser bots, full-lobby fixture or checkpoint-control mode.
Only this pass's old 5193 relay was replaced. Other services were left alone.

A 90-second passive hosted check used a separate normal match pool:
**8 participants**, **2,713 valid snapshots**, **0 decode errors**, **18 sites**,
**1,304 bot shots**, **11 case-owner changes**, and **56 matching frozen/client/served
files**. Prepared join took 157 ms. Five observed cooldown starts were 44,983–45,000 ms
from the snapshot clock; four sites were observed restocking. Bots collected Hot
Pursuit, Ironclad and a healing pickup. Peak balls reached the existing 256 cap.
All seven bots moved 456–858 continuous horizontal units (respawn jumps excluded).
Their moving samples ranged **53–93%**, with maximum observed idle stretches of
**4–8.5 seconds**; this is a bounded observation, not proof all bots remain active.
Snapshot gaps were 76 ms p95 and 302 ms maximum. No delivery was observed in this
unforced assignment window, unlike the controlled Chain comparison above.
The pool had zero players/bots before joining and after disconnecting. Source evidence:
`output/pickup-refinement/restock-hosted-check.json` and `verify-restock.mjs`.
The observer sent no gameplay input and generated no browser audio.

Production remains application `aaa8750`, Worker
`d6d1b1e3-9406-4df6-a3f5-04132652e3c1`, protocol 10. No commit or production release
was performed during this feedback iteration. Preserve agent-only `mute=1` and
never mute the human's browser/system audio.

Prior memory: `sessions/2026/09/rat-detective-pickup-rewards-feedback`,
`sessions/2026/09/rat-detective-bot-navigation-regression`, and
`decisions/rat-detective-evidence-incident-mode`. Historical bot population and
speed values in the September 8 memory are superseded by current project docs.
