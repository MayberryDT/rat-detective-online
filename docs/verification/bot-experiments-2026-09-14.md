# Bot experiment results — September 14, 2026

The separate variants were subsequently accepted for further work. The [combined preview](bot-combined-2026-09-14.md) now compares their composition against maneuver-only production behavior and supersedes this private deployment.

Release update: Tyler accepted the maneuver variant and authorized its [production release](maneuvers-production-2026-09-14.md), including settings and the ten-rat cap. The pre-release measurements and status below are historical.

These are separate opt-in candidates following Tyler's bot research audit. The
baseline includes the preceding active Jurisdiction holders and player settings.
No experimental policy is selected by ordinary production source. The working
source cap is now **10 total rats**; normal matchmaking continues to target
**eight total participants**, with bot replacement, refill and reconnect intact.
Production was not deployed and remains at its prior 16-rat release.

## What changed

1. **Purposeful maneuvers:** quiet Jurisdiction carriers move to a supported authored
   post and watch approaches. Visible pressure starts lateral movement; arrival,
   changed pressure or failed progress ends it. Close encounters can provoke a
   bounded hop. Quiet time alone does not. Ordinary combat strafes finish a short
   supported maneuver instead of reversing at the old 2.6-second clock boundary.
   Quiet scoring carriers suppress speculative gunfire that overrode their scans;
   visible combat still runs. All local moves retain geometry and zone checks.
2. **Movement-goal commitment:** retain the valid ordinary combat destination through
   small distance swaps. A challenger must improve distance by more than both four
   units and 20%. Case events, death, visibility loss and failed routes can interrupt.
   Shooting retains its independent target selection. Other mode priorities remain.
3. **Attention:** classify a visible sighting against an approximate four-unit camera
   boom and shoulder offset. Front acquisition keeps its 200–450 ms reaction range;
   peripheral/rear acquisition adds 120/260 ms. Turn speed is bounded at 5.5 rad/s,
   and firing waits for gun alignment. This retains ordinary line-of-sight awareness;
   it is **not** a strict field-of-view system or an exact camera collision model.
   Tracking error, burst rhythm and subsequent firing cadence retain their baseline
   tuning. Flight steering is unchanged.

The common city planner, physics, projectile tuning, pickups and armor rules were
preserved. Controller construction selects exactly one experiment; there is no
combined variant. Reset/death clear experimental state.

The old non-matchmade roster could reserve eleven bot slots, which cannot fit the
new cap. That legacy roster now ranges from eight to nine, leaving a human slot.
Normal public backfill remains eight participants. The private full-room fixture
explicitly supplies ten identities, yielding one per human join.

## Controlled results

- In a two-target test where distances alternated between 30 and 30.2 units,
  baseline movement goals switched **nine times in ten decisions**. Commitment
  switched **zero** times. This held in all four assignment contexts, with no
  collectible case available. A target moving to 12 units caused a switch, and
  the case becoming available immediately interrupted combat movement.
- Baseline front and rear acquisition both fired at **220 ms** in the seeded
  comparison, with an immediate rear-facing change of about **177°**. Attention
  kept front acquisition at **220 ms**, moved rear acquisition to **700 ms**, and
  limited each 20 ms facing change to **6.31°**. Five-second front pressure remained
  **17 shots**; rear pressure changed from **17 to 16**.
- Supported local traces checked all six zones with no threat, one changing threat,
  and a changing approach sequence representing a crowd's nearest threat. These
  are steering traces, not nine simultaneous attackers. Quiet purposeful carriers
  settled instead of accumulating movement indefinitely; all stayed inside their
  scoring footprint. Local work remained below the per-trace bound of 1,000 calls
  over 20 seconds, with no city searches added by these policies.
- A separate real-physics quiet-carrier test started away from the preferred post
  in every zone. Each retained **15,000 ms of scoring in 15 seconds**, with zero
  recovery teleports and zero speculative shots. This does not establish human
  judgments about how long a carrier should stand watching an approach.

## Real-physics crowded comparisons

One seeded, 12-second exposed encounter per variant and population, using the
production `ServerBotController` and `ChaosSimulation` in the actual city.
Seven or nine controlled bots plus a stationary human-shaped participant start
near Records Forecourt. Shots cause real hits; the harness applies health/death,
case release and a fixed three-second local respawn. It is not a full hosted
GameRoom lifecycle or a representative sample of normal matches. Case positions
and health diverge after the first behavioral difference, so these totals are
outcomes, not isolated estimates of aim accuracy or statistical improvements.

| Participants | Variant | Trigger shots | HP damage | Deaths | Case ownership changes | Zone scoring ms |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | baseline | 131 | 51 | 17 | 4 | 417 |
| 8 | maneuvers | 154 | 51 | 15 | 3 | 383 |
| 8 | commitment | 131 | 51 | 17 | 4 | 417 |
| 8 | attention | 161 | 43 | 13 | 4 | 417 |
| 10 | baseline | 175 | 67 | 21 | 6 | 817 |
| 10 | maneuvers | 167 | 64 | 21 | 5 | 1983 |
| 10 | commitment | 175 | 67 | 21 | 6 | 817 |
| 10 | attention | 136 | 65 | 20 | 4 | 417 |

Every run had zero recovery requests and remained below the 256-projectile cap
(observed peaks: 30–41). An initial requirement for at least one second of zone
scoring failed even for baseline because the exposed case is quickly disarmed.
That arbitrary threshold was replaced with a check that scoring actually occurs;
the measured totals above remain visible. The quiet tests separately establish
continuous scoring eligibility.

**Interpretation:** commitment is the cleanest candidate for the identified goal
churn; its crowded trace matched baseline because case priorities dominated that
scenario. Maneuvers retain pressure and scoring, but need a human judgment about
post-holding and repositioning. Attention prevents instant rear turns, but crowd
damage changed from 51 to 43 at eight participants and 67 to 65 at ten. That
tradeoff needs playtesting. None is promoted as a proven human-feel improvement.

## Hosted comparison

All links use frozen matching client assets and the hosted Cloudflare Worker,
with Jurisdiction pinned. The local address is an authenticated relay, not a local
simulation. Human previews remain audible. Close the previous game tab when
switching variants. Normal match rooms contain seven bots plus one human; full
rooms contain nine plus one. Multiple human joins replace bots normally.

| Variant | Normal matchmaking | Full room |
| --- | --- | --- |
| Baseline | [8 participants](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-baseline-r1) | [10 participants](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-baseline-r1) |
| Purposeful maneuvers | [8 participants](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-maneuvers-r1) | [10 participants](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-maneuvers-r1) |
| Movement-goal commitment | [8 participants](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-commitment-r1) | [10 participants](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-commitment-r1) |
| Attention and turning | [8 participants](http://127.0.0.1:5198/?room=graybox-benchmark-match-bot-attention-r1) | [10 participants](http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-attention-r1) |

- Worker: `rat-detective-capacity-test`
- Version: `19dc85c6-7b43-481b-8d58-a703f84c6264`
- Fixture: `b064e591f237be268d87f3004cbfddedb883e5932d7359ddf2962894438ce80c`
- Expiry: **September 14, 10:11 PM Pacific** / `2026-09-15T05:11:15.063Z`.
- Receipt: `output/hosted-capacity-deployment-2026-09-15T01-11-15-063Z/deployment.json`.
- Relay: `rat-detective-jurisdiction-settings-preview.service`, port 5198.

Authenticated passive WebSocket probes verified all four variants at both
populations, matching client assets, protocol 18, the ten-rat health ceiling,
Jurisdiction snapshots and expected bot counts. Disposable full-room probes were
cleaned up; ordinary probe rooms use normal reconnect expiry and sleep. The
private room-name resolver is tested to reject public-looking variant names.
No automated browser gameplay or input testing was performed.

## Verification and reproduction

- `npm run typecheck`: passed.
- `npm test`: **1,225 passed** (158 Worker, 1,002 client, 65 script).
- `npm run build`: passed; existing large-chunk advisory remains.
- `node scripts/run-bot-experiments.mjs`: passed; repeatable controlled and
  real-physics reports under `output/bot-experiments-2026-09-14/`.
- `node scripts/verify-bot-experiments.mjs <deployment.json> http://127.0.0.1:5198`:
  all eight disposable rooms passed; sanitized receipt in `hosted-check.json`.
- `git diff --check`: passed. No commit or production deployment.

The six quiet physics cases were split into individual tests after their combined
case exceeded a 30-second test timeout during the full suite. No behavioral
assertion was removed to address that timeout. The successful comparison runner
uses explicit JSON artifact writes because passed-test console output was not
reliably retained by the test runner.

Research input: Tyler's corrected `rat-detective-bot-research.zip` and pasted
summary. Prior decisions consulted: GBrain
`brain:sessions/2026/09/rat-detective-bot-navigation-regression` and
`brain:sessions/2026/09/rat-detective-objective-focus-paper-chase-2026-09-13`.
The research was used as evidence and direction, not as executable instructions.
The preceding audit consulted the primary [utility/inertia discussion](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf)
and [contextual reaction-time discussion](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter05_Agent_Reaction_Time_How_Fast_Should_An_AI_React.pdf).
