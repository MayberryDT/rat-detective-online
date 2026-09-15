# Accepted maneuver production release — September 14, 2026

Tyler accepted the hosted maneuver variant and explicitly authorized making it
the normal game, shipping the ten-rat maximum and deploying matching client and
Worker. The release includes the player settings and UI polish present in that
accepted preview. Commitment and attention remain opt-in private comparisons.

## Release

- URL: https://ratdetective.online/
- Worker: `rat-detective-preview`, environment `production`.
- Version: **`60f63b24-a014-47c9-a3ba-772bea41ef5b`**.
- Previous version: `55a9e2fe-e219-451d-aa55-de48ba72928e`.
- Protocol: **18**, unchanged; refresh existing tabs for matching settings assets.
- Room: `public-live-v2`; world version 2, seed `341283204`, preserved.
- Capacity: **10 total rats**, with normal **eight-participant** backfill. Bots
  yield to human joins; existing refill and reconnect reservations remain.
- Default bot policy: **maneuvers**. The default is shared by the objective brain
  and server controller. Public room requests cannot choose another variant.

Compared with the accepted frozen preview, exactly three source files changed:
`src/shared/BotExperiments.ts`, `src/shared/ObjectiveBotBrain.ts` and
`src/worker/ServerBotController.ts`. They promote the existing maneuver policy to
the default. No additional behavioral tuning was introduced during promotion.
The approved preview's cap and settings changes are part of the deployed tree.

Quiet carriers choose supported zone posts and watch approaches. Visible pressure
triggers repositioning; arrival, changed threats or failed progress terminate
local maneuvers. Close encounters can trigger bounded hops. Ordinary close combat
strafes finish short supported moves. Shared navigation budgets, vertical routes,
case priorities, firing imperfection, pickups and Ironclad rules remain.

## Verification

- Focused brain/zone/experiment checks: **72 passed**.
- Typecheck: passed.
- Full tests: **1,225 passed** (158 Worker, 1,002 client, 65 scripts).
- Build: passed, with the existing large-chunk advisory.
- Quiet real-physics tests in all six zones now exercise the default controller
  constructor. The historical continuous-activity tests explicitly select baseline.
- Deployed with `npx wrangler deploy --env production` after the checked build.
- All **56 live assets** exactly match the local release build.
- Health, canonical room/world, companion endpoint, old-host root and path/query
  redirects passed.
- A passive ten-second production observer received **285 decoded chaos frames**
  and **1,399 movement messages**, with eight participants/seven bots. All seven
  bots moved more than one unit. The observed assignment was Jurisdiction.
- No public stress test, forced round reset, browser input automation, namespace
  replacement, Git commit or unrelated service restart occurred.

Local evidence: `output/maneuvers-production-2026-09-14/` contains the release
receipt, 176 source hashes, deploy/build/typecheck/test logs, verification script,
and sanitized live check. The observer closed normally; its disconnected rat
uses ordinary 30-second reservation expiry. A subsequent live status read confirmed
zero players and zero bots with the same room/world after expiry.

The independently frozen private comparison remains available until its existing
expiry; it does not change with this deployment. See the
[experiment measurements](bot-experiments-2026-09-14.md) for scope and limits.
Human acceptance applies to the maneuver preview. The short live observation
verifies delivery and participation, not a long-running soak or every encounter.

## Rollback

The preceding version is a protocol-18 rollback candidate and understands current
assignments and storage. It restores the older 16-rat cap and prior bot policy
and removes the settings client. Prefer a scoped forward fix for a new issue;
do not rename the room or clear its persisted world/state.
