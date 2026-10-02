# Protocol 29 release: clarity, the hot case heartbeat and flaming Crossfire (2 October 2026)

Tyler: "perfect. push it live."

- **Production:** Worker `5a23e371-16d2-4792-91dd-f51b51674db5`, build `production-2026-10-02-bef8f9c`, client `index-Ci311P7p.js`, commit `bef8f9c` on `main` and GitHub `master`, **protocol 29**, layout 7, `mindVersion` 12, all ten incidents. Deployed 2026-10-02T19:58:26.515Z. Previous: `ea258468` (protocol 28). Era `clarity` in `design/data/eras.json`.
- **Admin:** `ADMIN_TOKEN` set on production (the same key as staging, in `~/.config/rat-detective/admin-token`); `node scripts/admin.mjs status` answered from production.

## What shipped

The clarity batch ([the juice plan](../juice-plan.md#clarity-batch-agreed-2-october-protocol-29)) as changed by Tyler's three staging playtests:

- **The hot case heartbeat:** between pings a carried case and its carrier are seen only in direct sight; every 4 s the carrier flashes red through walls (only its hidden parts), two small red radar rings spread from it, and a red HOT CASE stamp shows where it pinged, on the screen edge with an arrow when off screen. Silent for others. Bots know an unseen carrier only from pings and sight.
- **The carrier:** the case turns red-hot metal cuffed to the wrist; the rat glows red-hot (coat edges, hat band, embers, close-up paw prints) on the heartbeat; the carrier gets the HOT CASE card, a red edge pulse at each ping, a heartbeat only it hears, heavier red-cored shots and CASE CLOSED · HEALED on a kill. Taking the case no longer brings a supply.
- **One case red**, one headline at a time, incident title then tag, death recap, words explained once, calmer defaults, a ranked sound mix, dimmer non-threat balls and effect caps.
- **Cheddar Shower removed** (stored rooms run Big Cheese).
- **Crossfire:** fired as normal; at the first wall the ball catches fire, doubles its speed (350 u/s, held after) and wears a long fiery trail; ordinary damage (headshots still kill); BANK SHOT moments, aim guide, bot bank shots, `bounces` on death facts.
- **Dispatch** rolls when a room allows one incident (a staging-only crash).
- **Admin controls** (F10, `/api/admin/v1/*`, `scripts/admin.mjs`) and a smaller lossless chaos wire ([lag receipt](lag-2026-10-02.md)).

## Checked

- Full checks on Halla at `86e7ce8`: typecheck, worker 256/256, client 1,562/1,562, scripts 133/133, build. Later commits (ping juice, one-step Crossfire, ordinary bank damage, the Dispatch fix with its regression test) ran typecheck and the affected test files.
- Production after deploy: `/health` reports `production-2026-10-02-bef8f9c`; admin status shows `public-live-v2` playing with six bots and Big Cheese active (Dispatch rolling); `scripts/reconnect-check.mjs` reconnected the socket with 33 supply sites before and after, the view kept its direction and the rat turned with the camera. Its first step (turning the rat before the drop) did not take in two runs, so the direction check ran on an unturned view.
- Two screenshot passes on a fixture (`~/.cache/rd-shots/hc-*.png`) for the carrier look, ping flash, carrier shots and Crossfire fire. The later ping and Crossfire tunings were not screenshotted.

## Not checked

- The heartbeat, ricochet and flame sounds have not been heard by an agent.
- The CONTINUE results flow and the hot case with real players beyond Tyler's staging sessions.
