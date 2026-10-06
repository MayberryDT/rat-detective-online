# Release: rooms play only with a human, 6 October 2026

Tyler approved deploying the 3 October change: the always-on city cost about 16 USD a day. The change is described in [the idle-room receipt](idle-room-2026-10-03.md) and [the live service runbook](../live-service.md#room-lifecycle-human-seats-only).

| Item | Value |
| --- | --- |
| Production Worker | `4fbb94c7-1b0d-4140-965c-a70dc455e47c`, deployed 2026-10-06T03:29:44Z (previous: `02bf9e68`, [protocol 32](random-supplies-release-2026-10-03.md)) |
| Production build | `production-2026-10-06-bd2e668` |
| Staging Worker | `c15dccc8-2d50-47cd-aaf8-81907d60acb5`, deployed 2026-10-06T03:28:07Z (previous: `f055f4ee`), build `staging-2026-10-06-bd2e668`, every incident |
| Client | `index-93gja5OR.js` (unchanged) |
| Commit | `bd2e668` on `main` and GitHub `master` |
| Protocol | 32 (unchanged); layout 7; `mindVersion` 12 |
| Era | `random-supplies` continues (build added to its list): play with a human is unchanged |

## Checked

- Tests before commit: Worker 33 files / 283, client 173 / 1,542, scripts 46 / 0 failures.
- `node scripts/verify-idle-room.mjs` on commit `bd2e668`, at 2026-10-06T03:29Z ([artifact](idle-room-release-2026-10-06.json)). The script runs a local `wrangler dev`; it cannot read hosted storage.

  | Phase | Result |
  | --- | --- |
  | Empty (20.0 s) | 0 bots, 0 tick logs, storage unchanged, no alarm row |
  | Human joins (`agent=1`, 15 s) | welcome held 8 bots; `/status` 9 players / 8 bots; 396 chaos frames; 2 tick logs; storage written |
  | Human leaves (35.0 s) | `/status` 0 / 0; last tick log 25.1 s after the close (inside the 30 s grace) |
  | Idle (20.0 s) | 0 bots, 0 tick logs, storage unchanged, no alarm row |

- Hosted check: `/health`, `/status` and 60 s of `wrangler tail --format json` on each Worker, counting alarm invocations (`scheduledTime`), `room diagnostics` lines (a running tick logs one every 5 s) and `GameRoom` invocations.

  | Worker | Build on `/health` | `/status` `public-live-v2` | 60 s tail |
  | --- | --- | --- | --- |
  | Staging before deploy (`f055f4ee`, 20 s) | `staging-2026-10-03-6b47caf` | (not read) | 1 alarm, 2 tick logs |
  | Staging `c15dccc8` | `staging-2026-10-06-bd2e668` | 0 humans / 0 bots, before and after | 0 events: 0 alarms, 0 tick logs, 0 `GameRoom` |
  | Production `4fbb94c7` | `production-2026-10-06-bd2e668` | 0 humans / 0 bots, before and after (03:30:58Z) | 4 events, all `GET /api/companion/v1/status?limit=16`: 0 alarms, 0 tick logs, 0 `GameRoom` |

- Production serves `index-93gja5OR.js`.

Staging passed before production was deployed. Both stored rooms had run 6–9 bots with no human; the first `/status` after each deploy already read 0 bots, and no alarm fired in the following minute, so the wake after deploy removed the stored bots and left no wake set.

## Not checked

- No human joined either hosted Worker after the deploy; the join → bots → stop cycle was proven only locally.
- The Cloudflare bill and Durable Object analytics were not read; the drop in active time and rows written should show in the dashboard from 03:30 UTC on 6 October.
