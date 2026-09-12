# Quick reconnect and carried-case protection — September 11, 2026

Private feedback continuation of [comic pickups and high launches](comic-pickups-high-launch-2026-09-11.md).
The existing dirty tree is preserved. Production is unchanged; this is not a release receipt.

## Behavior

A disconnect reserves the same rat for **30 seconds**. Rejoining with its private
server-issued credential restores the existing ID, name/appearance, authoritative
pose and HP, kills/deaths, scoreboard identity, possession totals, assignment
progress and any pending death/respawn deadline. The carried case remains attached
unless something in the match takes it away. The rat remains present and vulnerable,
with bots and the match continuing normally; disconnecting grants no protection.
A normal round reset still resets round statistics.

The browser retains the credential in memory for retries and in **tab-local
sessionStorage** for same-tab reloads, scoped to the server and matchmaking pool.
Blocked storage still permits in-memory recovery. Recovery is not an account login,
a cross-device save, or a guarantee after the 30-second window or a deployment.
The server persists credentials/deadlines separately from public player data. Tokens
travel only in private join/welcome frames, never URLs, status, scoreboards or logs.

Matchmaking routes a bounded, unreserved recovery socket to the prior room before
checking the token. A valid recovery consumes the existing slot even at 16 humans.
Invalid/expired credentials cannot create a player; the client clears them and
retries normal matchmaking. At expiry the old rat is removed, its case is dropped,
and an empty room returns to sleep. An already-open old socket loses control before
replacement; its late messages and close callbacks cannot affect the resumed rat.
Close code 4001 also stops old clients retrying against each other, including through
the hosted preview relay.

A carrier's own balls now skip both their rat and their carried case **before**
selecting the closest collision. This includes ricochets and enlarged Big Cheese
balls. Walls behind them still collide, enemies still disarm the case, and loose
cases remain shootable. The existing client presentation sweeps contain scenery
and rat bodies, not case physics; no extra guessed case collision was added.

**Protocol 14** coordinates the private resume credential, expired-resume response
and matched behavior. All r7 pickup art, placement, durations, launches and bot work
remain in this build. Human audio is unchanged and audible; agent browser checks
must continue to use `mute=1`.

## Checks

- Typecheck and build pass; only the existing large-chunk build warning remains.
- **935 tests pass**: 137 Worker, 771 client, 27 script tests.
- Worker tests cover full 16-human recovery, nonzero kills/deaths and assignment
  progress, case/pose recovery after a socket close and Durable Object eviction,
  open-socket takeover, enemy killing during an outage, preserved respawn deadlines,
  expiry, unknown tokens, bounded admission and eventual empty-room sleep.
- Client tests cover automatic retry, same-tab reload storage, server/pool isolation,
  denied storage, clearing an expired identity, stopping displaced clients, strict
  credential validation, and direct/banked ordinary/enlarged own-case protection.
- Existing enemy-disarm and loose-case collision tests still pass. The enlarged
  own-case test explicitly activates Big Cheese so the radius is not reset by the
  ordinary-shot path; that focused suite was rerun after strengthening the fixture.
- No automated pointer-lock or browser gameplay input test was run. Hosted protocol
  verification is recorded below; human feel testing remains pending.

## Matching human preview

[Audible r8 preview](http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r8)
expires **September 12 at 3:31 AM Pacific**. Worker
`33ed3c6e-ad57-4b35-b677-abd857f3f538`, protocol 14. Frozen deployment receipt:
`output/hosted-capacity-deployment-2026-09-12T06-31-53-537Z/deployment.json`.
Relay log `/tmp/rd-pickup-preview-r8.log`; only the task's 5193 relay was replaced.
The client is served from that receipt's frozen `stage/dist`. Hosted Cloudflare
simulation uses normal eight-participant backfill and the 16-rat cap.

Production remains application `aaa8750`, Worker
`d6d1b1e3-9406-4df6-a3f5-04132652e3c1`, protocol 10. No commit or production release
was performed during this feedback iteration.

## Hosted transport verification

A separate private normal-matchmaking room exercised the real hosted Worker through
5193, with production server bots and the standard cap/backfill. A controlled
protocol probe collected the genuine case, placed two test rats away from combat,
and earned a kill with ordinary authoritative shots. These explicit position
messages are test setup, not evidence of player navigation or gameplay feel.

After terminating the carrier's transport, recovery completed in **953 ms**,
retaining its original ID/name, **one earned kill**, exact test position and the
case. A second recovery while the first socket was still open preserved identity
and case and delivered replacement close code **4001** through the relay. After
closing both test players and waiting 32 seconds, status showed **zero players and
zero bots**. The initial join had eight participants. All **326 decoded messages**
were valid, and all **56 frozen client files** matched both the relay and source build.
The public status endpoint counts attached humans, so its transient population
count excludes a disconnected reserved rat; the authoritative scoreboard retains it.

Reproduction: `output/pickup-refinement/verify-reconnect.mjs`.
Sanitized result: `output/pickup-refinement/reconnect-hosted-check.json`.
Credentials and raw socket messages are not retained in the result. Browser reload
recovery is covered by client transport/storage tests; no human browser reload or
real-phone claim is made here.
