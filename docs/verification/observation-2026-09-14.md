# Private observation — September 14, 2026

Tyler reported that the combined bot behavior feels better and asked for a
permanent optional observation mode using familiar rat controls. This implements
that mode for private hosted full-bot rooms. It does not release the combined
policy or observation to production.

## Behavior

A server-authorized observer receives a local camera avatar and the normal live
feed, outside the authoritative player roster. Bots cannot perceive or target it.
It cannot fire, take damage, claim pickups or the case, operate shot-triggered
controls, earn points or affect spawning. The ordinary walking controller and
shoulder camera remain; remote rats do not block the local observer body.

The title offers observation or ordinary play. Observation uses `&observe=1` and
survives reload as a URL choice. The assignment card labels observation and shows
leader progress and carrier activity. The pause menu describes observation rather
than falsely saying the rat is vulnerable. Existing key remapping, touch movement,
look, jump, audio settings and scoreboard remain available.

Observer access requires an active expiring private fixture and a fixed
`graybox-benchmark-ai-*` room. The outer Worker still authenticates the request.
Public/ordinary rooms reject it. Up to four observer sockets fit within the
existing connection budget. Observers have no resume token, player row, bot slot
or reconnect reservation. Their socket attachment survives hibernation; a new
connection gets a fresh camera spawn without altering saved human credentials.

The optional `observing: true` welcome requires that its camera ID be absent from
`players` and have no resume token. Ordinary protocol-18 validation remains.
An observer-requesting client refuses an ordinary welcome, avoiding silent entry
as a vulnerable participant on an older server.

## Checks actually run

- Typecheck and production client build passed.
- **1,246 tests passed**: 161 Worker, 1,020 client and 65 scripts.
- Added Worker checks cover full-room admission, no player/session/database row,
  ignored movement/shoot/hit/pickup messages, ordinary scoreboard and ping delivery,
  attachment/delivery reconstruction, disconnect without refill changes, four
  observer connections and denied/expired access.
- Client checks cover strict welcome validation, blocked prediction/actions,
  separation from saved player credentials, retries and refusing role mismatch.
- Passive hosted proof opened an observer, a second observer and a fresh reconnect.
  Each received 30 authoritative Jurisdiction snapshots and movement from all ten
  bots. The roster remained ten bots/zero humans before, during and after these
  connections. Forged observer shots/hits were discarded. All 56 served assets
  matched the frozen deployment client.
- Read-only browser inspection confirmed the observer title, secondary play option
  and explanatory label. No automated browser gameplay/pointer-lock testing was
  performed. Human control feel is for Tyler's playtest.

The first full suite found old session-test DOM/ChaosView stubs lacked the new
class-list and observation methods. Updating those test doubles restored the 19
session tests; the full suite then passed. A hosted-probe movement counter initially
read the wrong nesting level in batched samples; the corrected repeated proof
reports all ten bot IDs. Neither issue required a gameplay tuning change.

## Current hosted preview

- Human observer: <http://127.0.0.1:5198/?room=graybox-benchmark-ai-bot-combined-observe-r1&observe=1>
- Ordinary entry in that room: remove `&observe=1`, or choose **Play as a rat instead**.
- Worker: `rat-detective-capacity-test`
- Version: `b63c3021-b08c-4000-8fd5-44d732391f4b`
- Fixture: `17a2a1e6dbc1a0e44e7d39ff68627264c8ccf66f0671624bd0830054a28f6ef0`
- Expiry: **September 14, 11:06 PM Pacific** (`2026-09-15T06:06:28.858Z`).
- Jurisdiction is pinned. Combined bot behavior remains selected by the private
  room name. Ten bots plus the observer; a human participant replaces a bot.
- Frozen relay: `rat-detective-jurisdiction-settings-preview.service`, port 5198.
  The human link is audible. The inspection tab was muted only during agent work.

Receipt: `output/hosted-capacity-deployment-2026-09-15T02-06-28-858Z/deployment.json`.
Local evidence: `output/observation-2026-09-14/` (checks, build, deployment and
hosted proof). Reusable verification: `scripts/verify-observer.mjs`.
Implementation references: `.research/observation-implementation-references.json`,
with a successful online validation receipt. Existing controller/physics remain
locked; ioquake3 spectator separation informed the boundary without copying code.

Production remains `60f63b24-a014-47c9-a3ba-772bea41ef5b`, maneuver-only. No Git
commit was made. The observation feature remains reusable after the fixture expires;
renew its private deployment to playtest again. See [the guide](../observation-mode.md).

Prior context: `brain:sessions/2026/09/rat-detective-bot-combined-preview-2026-09-14`.
