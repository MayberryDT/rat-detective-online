# Combined bot preview — September 14, 2026

Tyler accepted the separate commitment and attention playtests after releasing
maneuvers, then requested one combined hosted preview against maneuver-only bots.
This is a private candidate. Production remains version
`60f63b24-a014-47c9-a3ba-772bea41ef5b`, with maneuvers as its default policy.

## Composition

`BotExperiments.ts` resolves three independent behaviors once per brain. The
explicit `combined` policy enables all three; existing isolated policies retain
their selections. `ObjectiveBotBrain.ts` uses these resolved switches in the
existing decision, movement and aiming stages. No individual tuning changed.
These are the only two gameplay source files changed since the production release.

Assignment and case priorities remain first. Ordinary combat movement retains
its valid goal through small distance changes; case events, invalid targets and
materially better opportunities can interrupt. Supported maneuver movement runs
independently of shooting. Attention charges acquisition time and limits turning,
with shots withheld until aligned. Death/reset clears transient state.
The public default remains `maneuvers`; only the copied private Worker maps a
`bot-combined-*` room name to the combined policy.

## Playtest links

Jurisdiction is pinned in this private Worker so the comparison starts in the
mode that prompted the work. Both links have the same frozen client/server build,
city seed, cap and population policy. Human previews remain audible.
Close older gameplay tabs before switching rooms.

| Population | Combined candidate | Maneuver-only comparison |
| --- | --- | --- |
| 10 total: nine bots plus you | [Combined full room](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-combined-r1) | [Maneuver-only full room](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-maneuvers-r2) |
| 8 total: seven bots plus you | [Combined normal backfill](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-combined-r1) | [Maneuver-only normal backfill](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-maneuvers-r2) |

The address is a local authenticated relay. Gameplay authority and all bots run
on the hosted Cloudflare Worker. Full rooms replace bots with joining humans;
normal pools retain eight-participant backfill and ordinary empty-room sleep.

- Private Worker: `rat-detective-capacity-test`.
- Version: `e02e012e-374a-4522-aa07-e2edb46b4962`.
- Fixture: `e418448c213cb5a1c1e8baa8a4e0ad40da32e04016acbb78ab05d82b6a71c2ef`.
- Expiry: **September 14, 10:31 PM Pacific**, `2026-09-15T05:31:07.604Z`.
- Receipt: `output/hosted-capacity-deployment-2026-09-15T01-31-07-604Z/deployment.json`.
- Relay service: `rat-detective-jurisdiction-settings-preview.service`, port 5198.
- The preceding private deployment was replaced after stopping its relay and
  cleaning the known full-room comparison simulations. Refresh older tabs.

## Interaction checks

- Combined movement-goal switches stayed at **zero** through ten alternating
  30/30.2-unit target decisions in every assignment context. Baseline switched nine
  times. A substantially closer target and a newly available case still interrupt.
- All four assignment contexts preserve carrier acquisition/loss and loose-case
  priority. Delivery, zone holding and Closing Time evasion take their expected
  priority over ordinary combat.
- A combined carrier repositions while turning toward a rear attacker, then fires.
  Ironclad activation cancels body fire; death/reset clears movement and firing.
- Combined front acquisition remains **220 ms**, with **17 shots in five seconds**;
  rear acquisition is **700 ms**, with **16 shots**. Facing changes stay below
  **6.31 degrees per 20 ms step**, matching the isolated attention comparison.
- Combined quiet carriers retain **15,000 ms scoring over 15 seconds** in each of
  the six zones, without recovery requests or speculative gunfire. The default
  maneuver-only controller is checked beside them.

## Crowded physical checks

The same exposed 12-second Records Forecourt harness used for the separate
experiments runs seven/nine bots plus one stationary human-shaped participant,
real city physics, actual projectile hits, damage, case release and local fixed
respawns. It is not a representative live-match sample or a hosted performance
benchmark. Later positions and health diverge, so the totals are outcomes rather
than estimates of isolated accuracy. Shared planning budgets also use runtime time
limits; seeded inputs do not guarantee identical aggregate counts across runs.

| Participants | Policy | Trigger shots | HP damage | Deaths | Zone scoring ms |
| --- | --- | --- | --- | --- | --- |
| 8 | maneuvers | 149 | 49 | 15 | 383 |
| 8 | combined | 135 | 48 | 15 | 383 |
| 10 | maneuvers | 167 | 64 | 21 | 1983 |
| 10 | combined | 158 | 58 | 18 | 1183 |

Combined runs have zero recovery requests and 30/37 peak live projectiles at
8/10 participants, below the existing 256 limit. These checks show that fighting
and scoring continue together; they do not establish equal pressure or better
human feel. In particular, the combined ten-rat fixture scored less than the
maneuver-only fixture. Human comparison is still the acceptance step.

## Verification

- Focused interaction tests: **10 passed**.
- Typecheck and build passed (existing large-chunk advisory only).
- Full suite: **1,239 passed** — 158 Worker, 1,016 client, 65 script.
- Private resolver tests include `combined` and reject public-looking variant names.
- All **56 frozen client assets** match the served relay bytes.
- Passive protocol checks passed for all five policies at eight and ten
  participants: **10 disposable rooms**, matching fixture, protocol 18, expected
  rosters and Jurisdiction snapshots. Full-room probes were cleaned up.
- The production root asset still matches the preceding maneuver release.
- No production deployment, Git commit or browser gameplay/input automation.

Artifacts: `output/bot-combined-2026-09-14/` includes controlled/physical JSON,
full test/typecheck/build logs, the private deployment log and sanitized hosted
checks. Reproduce through `npm test` or `node scripts/run-bot-experiments.mjs`;
the reusable runner writes its current reports to the original experiment output
directory. `scripts/verify-bot-experiments.mjs` now includes the combined policy.

Previous decisions: GBrain
`brain:sessions/2026/09/rat-detective-maneuvers-production-2026-09-14`.
See the [separate experiment report](bot-experiments-2026-09-14.md) and
[production receipt](maneuvers-production-2026-09-14.md) for preceding evidence.
