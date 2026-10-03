# Protocol 31 release: the three-human playtest batch, 3 October 2026

Tyler: "send it live."

| Item | Value |
| --- | --- |
| Worker | `f2fc905a-47da-4b11-af0b-84c95317c9da`, deployed 2026-10-03T07:57:57Z (previous: `583fa765`, [protocol 30](exhibits-release-2026-10-02.md)) |
| Build | `production-2026-10-03-2cac486` |
| Client | `index-B6gbUF69.js` |
| Commit | `2cac486` (`playtest-3` fast-forwarded to `main` and GitHub `master`) |
| Protocol | 31; layout 7; `mindVersion` 12 |
| Era | `playtest-three` in `design/data/eras.json` |

## What shipped

From Tyler's playtest with two friends on protocol 30 ([the juice plan](../juice-plan.md#three-human-playtest-2-october-night-protocol-31)):

- **Tommy Gun:** held fire 20 balls a second (`tommyIntervalMs` 50), 12 s. The server admits a rat holding it at `TOMMY_SHOOT_RATE` (22 a second, `shootRate` in `src/shared/shotTiming.ts`) under its own rate key, so Tommy shots never use up the plain gun's 12 a second. Bots fire it at 20 a second through the same check. Per-shot kick and push halved; casings live 1.2 s so one Tommy fits the 24-casing pool.
- **Ironclad Alibi:** 8 s.
- **Big Cheese removed.** Stored ids `big-cheese`, `cheesequake`, `act-of-god` and `cheddar-shower` run Crossfire. Shots no longer carry a radius; ordinary balls are unchanged. Nine incidents in the standard roster.
- **Exhibits:** the same Exhibits A–C on every client, picked from the server's `highlight` markers (`sharedExhibits`); your own best moment, when not among them, is Exhibit D marked YOURS. Sent flying needs 40 units or 8 up (was 22 or 5).
- **Replays from the player's view** (Tyler: "no one likes these unnatural camera angles"): the gameplay shoulder camera (`src/player/ShoulderCamera.ts`) on the moment's doer for the whole clip, the death camera if it dies; that rat is drawn as your own rat is in play ([playback](../replay/playback.md#x3-the-camera-players-view-since-protocol-31)).

## Checked

- At `2cac486`: both typechecks (the test project's only error, the missing `three-gpu-pathtracer` module in `test/visual/title-scene.ts`, is also on `f7e4ea2`); worker 282/282, client 1,541/1,541, scripts 46/46.
- Staging (`c5091adc-4bb2-415e-97bb-b9e622d23a20`, build `staging-2026-10-03-2cac486`, full rotation): `scripts/reconnect-check.mjs` 5/5; `scripts/exhibits-check.mjs` 7/7, including a saved WebM with video and sound. Artifacts on Veelox in `output/p31-staging/`; `exhibits-2-recording.png` shows Exhibit A behind the killer's shoulder.
- Production after deploy: `/health` reports the build above; the page serves `index-B6gbUF69.js`; `scripts/admin.mjs status` shows `public-live-v2` playing Excessive Force with 9 bots and the nine incidents; `scripts/reconnect-check.mjs` 5/5 (33 supply sites before and after).
- `scripts/benchmark-server-tick.mjs --room --bots=10 --recipients=4` changes its trajectory hash, as expected: the Tommy fires twice as often (shots 1,727 to 2,430, peak balls 57 to 112).

## Not checked

- No human has played it: the 20-a-second Tommy feel, the YOURS card and the shoulder replays.
- A player who joins mid-round misses earlier markers and can see a different A–C.
- A local `wrangler dev` build could not save a clip in headless Chrome (also on `f7e4ea2`); hosted staging saved.
- The carrier's double damage is unchanged; Tyler may cut it to 1.5× after a week of data.
