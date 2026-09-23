# Canonical public city stays alive — production deploy, September 14, 2026

Tyler confirmed **games should always be running** and **the city is always
alive**. That supersedes the later empty-room-sleeps policy for
`public-live-v2` only. The parent accepted **local revision 15** after
independent review and repairs. Tyler then authorized the production Worker
deploy and live scoreboard check (`yes just not on github`, then
`continue`). **No GitHub operations**, commits, pushes, tags, releases or
plugin publishing were performed.

Published Omarchy **v1.2.0** was released without authorization; Tyler
objected. The currently installed desktop copy is a local modified
mini-scoreboard on that version. No new plugin publish is authorized. This
receipt does **not** claim the installed native Omarchy panel was verified.

## Required contract

- Canonical room `public-live-v2` keeps **eight named server bots with zero
  humans**. Simulation, assignment clock and companion publication stay on.
- Occupied rooms still fill to **eight** total rats and cap at **ten**. Bots
  yield to humans. Disconnected humans keep a **30-second** reservation.
- Overflow rooms still sleep when empty and leave the admission directory.
  Empty overflow **0 humans / 0 bots** remains healthy.
- `GET /api/companion/v1/status` reads the directory only. It does not wake a
  GameRoom.
- `GET /status` is the one-time activation: it calls
  `enableMatchmaking('public-live-v2')` and starts the eight-bot city if the
  room is still asleep.
- Durable Object alarms stay **15 seconds** and then recover an occupied or
  canonical city. This is recovery, not a soak or outage guarantee.

## Accepted local revision 15

`GameRoom` treats only `matchRoom === public-live-v2` as the persistent city.
With zero humans that room targets eight bots (`MATCH_BACKFILL`). Overflow
still disposes bots, stops physics and retires from the matchmaker. Occupied
backfill, the ten-rat cap and reconnect grace are unchanged.

Recovery: only a **failed canonical persistent alarm** catches the original
error, tries a bounded future wake, logs a reschedule error and rethrows the
original. Success uses the existing `processDueEvents` schedule. Overflow and
private rooms are unchanged. The constructor keeps an existing earlier or due
alarm; an empty overflow deletes an unneeded alarm.

If storage or `setAlarm` itself is unavailable, there is no absolute outage
guarantee.

## Local checks reused for deploy

Independent review was complete locally before this deploy. A service-run
final typecheck, full test suite and build all passed (worker `261f4737`,
run `a0930779-bd30-41a5-9900-6d0cd8750fdf`). Use **full test suite
passed**; do not invent a new total. Eleven focused canonical tests passed.
Relevant persist and companion coverage: **10 passed**. Only docs and
research refs changed after that accepted backend. The reviewed `dist` was
reused; 58 client files still match the preceding combined-production live
hashes. `npx wrangler deploy --env production` uploaded **0** new static
assets.

Known test limit: Workerd does not persist `setAlarm(now-1)` across eviction,
so the due-alarm test exercises the constructor scheduling path live. The
future-deadline actual-eviction test passes.

## Production deploy and live HTTP check

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, environment `production` |
| Version | `0965112e-c50d-4075-86f7-decd93738f19` |
| Predecessor | `2869db51-e214-4c90-a620-c204cfaaf034` |
| Protocol | 18, combined bots |
| Room / world | `public-live-v2`, version 2, seed **341283204** |
| Authorization | User: deploy the server fix and verify the live scoreboard, not GitHub |

Before deploy, production still slept: companion `rooms: []`, `/status`
`players: 0`, `bots: 0`, `phase: playing`. After deploy, one `GET /status`
activated the city: **8 players / 8 bots**, names Captain Gnawley, Chief
Sewerby, Gumshoe Chewett, Inspector Ditchley, Lieutenant Toothmark, Shamus
Mousley, Shamus Squealer, Sleuth Whiskrow.

Companion HTTP then sampled for **105.3 seconds** without further `/status`
or any game tab / WebSocket participant. All eight samples listed
`public-live-v2`, **0 humans / 8 players / 8 roster names**, assignment
**EXCESSIVE FORCE** (`excessive-force`), `observedAt` **1789454157290 →
1789454262128**, revision **3 → 29**. Scores changed: Gumshoe Chewett
reached 2/1 with objective 2; Chief Sewerby 4/2; Shamus Squealer 3/3 with
objective 1. Health 200, 58 live assets matched `dist`, old-host root and
path/query redirected 301 to `https://ratdetective.online`. Compact evidence:
`output/canonical-city-production-2026-09-14/`.

No real humans appeared. Native panel verification was left to the parent
and is not claimed here.

See [current state](../current-state.md), [live service](../live-service.md)
and [server operations](../server-operations.md). Desktop listing context:
[Omarchy live stats](omarchy-live-stats-2026-09-14.md).
