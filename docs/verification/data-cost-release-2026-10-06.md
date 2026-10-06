# Release: data-cost reductions (packed city aggregates), 6 October 2026

Tyler approved getting the data-cost fixes live, including the new `city_packs` schema. The rollout ran staging first, then production once the runtime migration, recovery and drain checks passed on staging. The pre-release verification is in [the data cost verification](data-cost-2026-10-06.md); the design and rollback procedure are in [the plan](../plans/data-cost-2026-10.md) and [the runbook](../live-service.md#rolling-back-past-packed-aggregates). The Jev cap is unchanged (`JEV_DAILY_BUDGET_USD` = 25). None of the deferred reductions are included: dropping `AUTOINCREMENT`, slower checkpoints and a longer flush.

| Item | Value |
| --- | --- |
| Production Worker | `e99a51a7-dd70-4210-9c91-a59e8718b3d2`, deployed 2026-10-06 15:19 UTC (previous: `4fbb94c7`, [idle-room release](idle-room-release-2026-10-06.md)) |
| Production build | `production-2026-10-06-2476135` |
| Staging Worker | `993e377f-469d-4452-829f-62350e774142`, build `staging-2026-10-06-2476135` (previous: `c15dccc8`) |
| Commit | `2476135` on branch `data-cost-20261006`, descending from `4041deb`; `aa5cdd0` is the code, and `04e9880` and `2476135` add the hosted check script |
| Protocol / client | 32, `index-93gja5OR.js`, both unchanged; layout 7; `mindVersion` 12 |
| Era | `random-supplies` continues, with the build added to its list: play is unchanged; only how aggregates are stored changed |

## Staging sequence (all versions are `rat-detective-staging`)

| Step | Version | Evidence |
| --- | --- | --- |
| Before the deploy | `c15dccc8` (bd2e668) | Snapshot at 14:58:09Z: 186,708 keys, total 179,215,442 |
| Deploy, packs mode | `5301de5c` (`staging-2026-10-06-04e9880`, created 14:59:44.5Z) | Totals equal to before. Unpack answered 409 `mode: packs`. |
| Agent seat, 15:00:43–15:03:13 | same | 8 bots, room stopped (0/0). Totals grew: +23 keys, 11,527 counts higher, none missing or lower. Cloudflare showed 731 and 743 rows written in the two full playing minutes. |
| `CITY_AGGREGATES=rows` deploy | `58730609` | Unpack answered 200 `mode: rows`. The first call moved the canonical room's 65 packs (16,545 counts); later calls moved 0. Totals equal to after play. |
| Drain every room | same | `unpack-city-aggregates.mjs --env staging`: 8 objects, `drained: true`. Totals equal. |
| Roll back to the old build | `c15dccc8` (`wrangler rollback`) | Unpack answered 405, so the old code was serving. Its totals were equal to after the drain (186,731 keys, 179,266,040): no count hidden. |
| Roll forward, packs mode | `f832b569` (build `…-04e9880-dirty`) | Deployed by mistake from a tree whose only change was the check script. Live for about 1 minute; no room played under it. Replaced at once. |
| Final | `993e377f` (`staging-2026-10-06-2476135`) | 409 `mode: packs`; totals equal to the rolled-back read. |
| Agent seat, 15:11:57–15:16:57 | same | 9 bots, room stopped (0/0). Totals grew: +7 keys, 4,839 counts higher, none missing or lower. |

**Runtime identity.** One `/health` read straight after the first staging deploy still showed `bd2e668`. That was before the new version reached every edge: version `5301de5c` was created at 14:59:44.5Z, and `/health` sends `no-store`. From the 14:59:57Z snapshot on, every read showed `04e9880`. The unpack endpoint, which the old code does not have, answered with the new code's 409.

## Production

| Step | Evidence |
| --- | --- |
| Before (`4fbb94c7`) | Snapshots at 14:58:45Z and 15:18:35Z were identical: 202,338 keys, total 208,545,108. `/status` read 0/0. |
| Deploy `e99a51a7` | `/health` build `production-2026-10-06-2476135`. Unpack answered 409 `mode: packs`. The 15:19:37Z snapshot was identical to before, in hash and every count: the new code reads every stored count. |
| Agent seat, 15:20:19–15:22:49 | 9 bots in the welcome. At 15:23:30Z the totals had grown: +132 keys, 14,754 counts higher, none missing or lower. |
| Room lifecycle | 40 s after the seat closed, `/status` read 10 players and 9 bots; companion status counted **1 human** at 15:24:11Z. That rat was not identified. It is not counted as this check's seat and was left alone. By 15:25:21Z the room was idle: 0/0, no companion room. The stop that follows the last human leaving was proven twice on staging, where only this check held the room. On production it was observed only after the other occupant left. |
| Cloudflare per minute, production `GameRoom` | 15:21: 5,243 rows written; 15:22: 6,984. These minutes include the other human's play. Their events, at 4 rows each and not reduced by this release, are the likely bulk [INFERENCE]. Without a per-statement breakdown on Cloudflare, these minutes do not measure the change. |

## Not claimed

- **No billing saving is claimed.** The 88.5% drop in rows written is from local comparable runs ([verification](data-cost-2026-10-06.md)). On Cloudflare, staging wrote about 740 rows a minute with one agent seat and 8 bots. Before the idle-room release, staging averaged 5,404 rows per active minute (5 October, bot-only city). The two are different workloads, and neither is a bill. Compare a day of `rowsWritten` per active hour once real play accrues.
- The verification reads cost something: each all-days aggregate snapshot read about 10–22 M rows on staging and about 16 M on production.
- The every-room drain was run on staging only. On production only the endpoint's packs-mode refusal and the read-only listing (16 objects) ran.

## Rollback constraints

A plain rollback past `2476135` to `4041deb` or older hides every count recorded since 15:19 UTC until rolling forward. Instead, follow [the runbook](../live-service.md#rolling-back-past-packed-aggregates):
1. `CITY_AGGREGATES=rows npm run deploy:production`, as an ordinary full deploy;
2. `node scripts/unpack-city-aggregates.mjs --base https://ratdetective.online --env production`, until it reports `drained: true`;
3. roll back.

Later releases must descend from `2476135` and keep `CityStore`'s packs and its rows mode.

Raw receipts (snapshots, comparisons, deploy logs) are in `/home/halla/build/rat-detective/data-cost-2026-10-06/release/` on Halla.
