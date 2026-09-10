# Held-Tab scoreboard and local outline — September 10, 2026

Tyler requested removing the outline halo from the local rat while preserving it on opponents, plus a centered translucent full-lobby scoreboard visible while Tab is held. This is a client-only change on the existing dirty working tree. No physics, objective rules, lighting values, server schema or protocol version changed. No commit, Worker upload or production deployment was made.

## Implemented behavior

The `RatEntity.isPlayer` flag now hides its outline immediately. Normal death, shared-corpse death and respawn do not restore a local halo. Opponents retain the existing outline geometry, opacity, animation and death fade. All rats retain their accepted material brightness and overhead illumination; the case's separate red outline is unchanged.

`MatchScoreboard` displays every connected investigator in a dark, translucent central table. The local row is highlighted; AI and player labels distinguish the roster. The small always-visible assignment cards return as soon as the full table closes.

| Stat/detail | Source and meaning |
| --- | --- |
| Kills / deaths | Authoritative round scoreboard totals |
| K/D | Kills divided by deaths; infinity for positive kills with no deaths, dash for zero/zero |
| Case time | Existing `ChaosState.possession` cumulative seconds, displayed as minutes:seconds. Uses server totals; no browser-observed or extrapolated clock |
| Case share | Personal held time divided by held time for the connected roster |
| Case kills | Excessive Force's separate objective total out of ten, already judged at kill resolution |
| Deliveries | Chain of Custody's personal paperwork total out of three |
| Status | Current health, on the case, rat down or actual assignment winner |
| Lobby context | Investigator/AI count, total kills, current mode and objective context; personal rank and total held time |

Case time is a descriptive possession statistic, separate from Closing Time's shared objective clock. Excessive Force sorts by case kills, Chain by deliveries, Closing by held time; ties use name/ID consistently with the small race board. A recorded winner goes first even if another rat held the case longer. No highest-time or highest-kills fallback is introduced.

Rows update from the existing welcome, score, health, ownership and assignment messages. Late join uses the server's already accumulated totals. Join/leave, respawn, round reset and reconnect reconcile the roster. Repeated snapshots do not rebuild unchanged table rows; hidden tables store state without rendering. Large rosters scroll without truncation. The existing wire ceiling of 100 entries is tested as a rendering bound, not a new player-capacity claim.

Tab down shows the table; key repeat does not toggle it; Tab up hides it immediately. Escape, blur, hidden document, pointer unlock or leaving the playing connection state also close it. Holding Tab through a round reset keeps it open with refreshed totals. Title keyboard navigation and modified Tab shortcuts remain available. The view does not pause gameplay, capture focus or change pointer lock. Mouse wheel scrolls while held; horizontal/Shift-wheel supports narrow windows. The bottom-left controls now include “Tab — Hold for scoreboard.”

## Validation

- **670 automated tests passed:** 107 Worker tests in 18 files, 541 client tests in 82 files, 22 script tests. Used `npx vitest run`, `npx vitest run --config vitest.client.config.ts --maxWorkers=4`, and `node --test test/scripts/*.test.mjs`. Logs are under `output/tab-scoreboard-2026-09-10/`.
- New focused tests cover mode ranking and actual totals, late join, pause display, winner precedence, health updates, join/leave, reset/reconnect, safe name rendering, a 100-row roster, stable DOM updates, hold/release/repeat, focus/lock loss, scroll, listener cleanup and local/opponent outline lifetimes. An authoritative case test confirms possession totals survive theft/restore and clear on reset.
- Initial validation found missing DOM support in the existing resource-test fake and incomplete typed fixture data. The harness/fixture were corrected; the final full client suite passes. Real session resource teardown is still exercised rather than mocked away.
- `npm run typecheck`, `npm run build`, `npm run visual:build` passed. Existing large-bundle warnings remain. `git diff --check` and relative links in the touched documentation passed.
- **Actual gameplay-camera static review:** Excessive Force, Chain and Closing tables; 12- and 24-player fixture rosters; local rat without the halo alongside outlined opponents. Images were reviewed through the in-app browser, without gameplay input. The fixture poses sample statistics and does not test the held key in a live match.
- **Passive private protocol check:** one client for six seconds in a separate automatic pool, eight rats, **172 decoded snapshots, zero invalid packets**, protocol 5. Served HTML, JavaScript and CSS exactly match the immutable client.
- **Human playtesting:** pending. No automated browser pointer-lock/input test, human gameplay test or multi-human match was performed. The key behavior is covered by DOM-event unit tests. No new performance or capacity claim, bot-route run or audio test was needed for this client-only change.

## Private full-game preview

[Play the updated build](http://127.0.0.1:5190/?room=graybox-benchmark-match-scoreboard-v16&diagnostics=quiet&lighting=pools).

The existing private Worker is `f49f4645-e716-4b98-a4cd-03eed72d96a4`, protocol **5**, expiring September 10 at **3:51 AM Pacific**. The preview uses the same backend without uploading or restarting it. Production and earlier preview clients remain untouched.

Final immutable client: `output/tab-scoreboard-2026-09-10/client`; assets `index-ByWTvHsX.js` and `index-BRaXkHdM.css`. Local service: `rat-detective-tab-scoreboard-preview.service`. `preview.json` records source/asset hashes and the existing backend receipt; `full-preview-check.json` records the bounded protocol observation.

Prior context was retrieved from GBrain `brain:sessions/2026/09/rat-detective-paperwork-race-city-lamps-2026-09-09`; its all-rat outline behavior is superseded only for the local rat by this request. The latest cheese colors and case jokes remain as described in the [previous receipt](crossfire-case-banter-2026-09-10.md).
