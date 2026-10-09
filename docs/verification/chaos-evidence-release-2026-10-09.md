# Chaos leaves evidence: production release (9 October 2026)

Tyler, after playing staging: "its great. push it live."

## What shipped

Production Worker `20f9db44-7857-42da-b88c-ccf1bb2eb1f7`, build `production-2026-10-09-45dcd91`, commit `45dcd91` on `main` and GitHub `master` (fast-forward from `7a3a781`), **protocol 43**, layout 7, `mindVersion` 20, era `chaos-evidence` in `design/data/eras.json`. Previous: `e92c8831-e6e3-4f7e-a8cc-c2e23ba6880b` (protocol 39, era `case-papers`). Deployed with `npm run deploy:production` from the clean branch worktree, so the build name has no `-dirty`; the main checkout's other threads' uncommitted docs were left as they were.

Contents: everything in [the plan](../plans/chaos-evidence-2026-10.md) and [the build receipt](chaos-evidence-2026-10-08.md), rounds 1–5.
- **The evidence:** chalk outlines, sewer muck, hot wax, pigeons and the police scanner.
- **Feel and papers:** the lull, and the Evening Edition.
- **Weapons and incidents:** the Persuader is in; Code Violation and Bad Ammunition are out.
- **Fixes:** the lamp-state freeze, and the 17th paw print that made clients refuse frames.
- **New this round:** the Pea Souper fog, the penthouse safes, and the public room move with direct joins.

## The room move (by [the public room steps](../live-service.md#the-public-room))

1. **Snapshot:** before deploying, production was empty (0 humans, 0 bots). I took its `/api/heat/v1?days=all`, `/api/city/v1/places?days=all`, `/api/city/v1/flows?days=all` and first 10,000 events into `/home/halla/build/rat-detective/room-move/production-before/`. The old room `public-live-v2` was at seed 341283204.
2. **First touch:** right after the deploy (07:30:19 UTC), Halla reached `https://ratdetective.online/status` first. The answer was `public-live-v3`, **colo ORD (Chicago)**, new seed 1960118781 (layout 7 does not depend on the seed).
3. **Copy:** `node scripts/copy-city.mjs https://ratdetective.online` from Veelox copied 4,416,262 rows in about 6 minutes.
4. **Compare:** the new room's four reads match the snapshot exactly (heat, places, flows, the first 10,000 events), apart from the `room` label. The comparison is in `/home/halla/build/rat-detective/room-move/production-after/`.

`public-live-v2` keeps its history and sleeps as a backup. Rolling back to `e92c8831` would send players back to it, without what v3 records.

## Checked live

- The agent probe (`probe-city-marks.mjs https://ratdetective.online --room=public-live-v3`, 60 s, `agent=1`):
  - protocol 43, 9 bots, 1,804 chaos frames, **0 errors**, 10 deaths, 3 carriers;
  - ping 17 / 23 / 114 / 148 ms (min / median / p95 / p99), against 56 / 83 / 225 / 1,700 on Seattle's staging room before the fix;
  - 97 late frames in 60 s, all network delay, none server;
  - chalk, wax, a flock and 19 police radio calls seen.
- `/status` after the probe left: 0 humans, 0 bots. The room sleeps without a human, as before.
- Tests at `45dcd91`: typecheck; worker 288, client 1,520, scripts 46 (run on the branch before the release).

## Not checked

- A human session on production.
- The fog and the safes in production play (they were checked on staging).
- Bots reaching the Icebox's safe.
- The remaining late frames: they look like the home connection, since a bot-free room showed the same p95.
