# Sewer ramp crossings — September 14, 2026

Private follow-up to the [wall-case and directional-jump playtest](wall-case-jumps-2026-09-14.md).
Tyler observed repeated jumping inside sewer entrances and requested a different
assignment for the next observation round.

## Reproduction and cause

A lone carrier using the real ServerBotController, city colliders and cold shared
navigation reproduced a 40-second loop at Gate, Alley and Needleworks when
starting near the ramp bottom. Removing opponents did not remove the failure;
disabling jump intent also failed to resolve it.

Jurisdiction guidance selected the near endpoint whenever the rat was more than
16 horizontal units from it. While ascending, that distance naturally increased,
so the guidance switched from the mouth back to the bottom. Crossing the threshold
again reversed the target again. Generic blocked/uphill recovery then added jumps
under the arch. The physical ramp itself was traversable.

## Change

The authored ramp geometry now identifies an ongoing crossing and selects its far
endpoint until the rat leaves the ramp. Jurisdiction guidance and ordinary bot
navigation share this rule, so Paper Chase and other objectives receive the same
protection. A case physically on the same ramp remains a direct objective. Street
and rooftop positions above the tunnel are excluded. Tunnel ramps use walking;
generic recovery hops are suppressed there. Ordinary obstacle jumps, launchers,
physics, combat and shared planner budgets remain as before.

The private fixture can select a first assignment independently of a pinned
assignment. `--first-assignment=chain-of-custody` starts Paper Chase, consumes the
remaining three assignments, then uses the usual shuffled cycles. It cannot be
combined with `--assignment`. This only changes the copied private fixture.

## Validation

- 48 real-physics crossings: four entrances × three starting depths × ascent and
  descent × Jurisdiction and Paper Chase. Every rat completes the crossing with
  no recovery teleport, no tunnel jump and no horizontal pause of two seconds.
- Four additional checks preserve same-ramp goals and reject street/roof positions
  above the tunnel.
- The generated fixture initializer is exercised through eight assignments to
  verify first-mode selection, both complete cycles and no consecutive repeat.
- Reference contract: [source-verified mechanism](../../.research/sewer-exits-implementation-references.json).
  Evidence: `output/sewer-exits-2026-09-14/`, including the failing reproduction,
  no-jump countercheck and successful crossing tests.

All **1,384 tests pass**: 161 Worker, 1,157 client and 66 script tests. Typecheck
and production build pass. The existing large-chunk build advisory remains.
No browser gameplay input was automated; subjective movement and longer mixed
matches remain for Tyler's playtest.

## Frozen hosted observation

[Observe the rotating playtest](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-combined-sewers-r1&observe=1).
Starts with Paper Chase, ten server bots plus the walking observer, combined bot
policy and audible human play. Ordinary human joins still replace bots.

- Worker: `rat-detective-capacity-test`.
- Version: **`8faa6efb-232f-4a1b-b781-404d3fd000dc`**, protocol 18.
- Fixture: `9e7838fabeb79f0cdccf2d444299e61899bd95d2c8ac88c409e0b0c992566d54`.
- Receipt: `output/hosted-capacity-deployment-2026-09-15T04-23-12-950Z/deployment.json`.
- Expiry: **September 15 at 1:23 AM Pacific** (08:23 UTC).

All 58 served assets match the frozen client. Two simultaneous observers and a
reconnect received 30/31/30 snapshots with all ten bots moving. Paper Chase was
confirmed in each feed. Rosters remained ten bots and zero humans throughout;
observer actions remained rejected. The disposable verification room was cleaned.
The frozen source includes the latest reachable Gate-tower Spider-rat placement.

Renewing this shared private backend also required refreshing the cameo relay on
port 5197. It now serves the same matching frozen client and retains its existing
maneuver-policy room URL and normal eight-participant backfill. Its previous
Jurisdiction room retains its stored assignment choice. All 58 assets and an
independent disposable seven-bot/one-player join were verified there as well.

No production deployment or Git commit.
