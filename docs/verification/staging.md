# Staging verification


> **Historical record — September 6 staging deployment.** Classified on 2026-09-08. Statements below describe that pass, including its then-current code, deployment, authorization and test counts. They are not present-day instructions or a current feature inventory. Use [the current reference](../live-service.md) before acting. Preserve the measurements; do not restore obsolete behavior from this report.

Separate Worker `rat-detective-staging` only. Production `rat-detective-preview` and custom domain `rat-detective.animasai.co` were not mutated.

URL: https://rat-detective-staging.mayberrydt.workers.dev

## Deployed Worker

- Account: `e0f9e82703380afb5e7022ade62b906c` (workers.dev subdomain `mayberrydt`)
- Worker id: `2c307c198dd34eeca82d901760cf2dd1`
- Script name: `rat-detective-staging`
- First version PUT: 2026-09-06T07:47:06.562149Z HTTP 200
- Deployment id: `a5c46cca7a7f480389467b2e471b4aa7`
- ETag: `9a67b23e62ef9df34486a08d1dcb22a2570e203a9b2b5aeba8f739c5fe81b35d`
- Migration tag: `v1` (`new_sqlite_classes: GameRoom`)
- Compatibility: `2026-07-08` + `nodejs_compat`
- workers.dev: enabled, `previews_enabled: false`, no custom domains
- GAME_ROOM namespace: `d84682955f0d45fdbedc108a11a600c3` (`rat-detective-staging_GameRoom`)

Production remains:

- `rat-detective-preview` id `674cb75a0e9d494194a8893538402c7a`, deployed 2026-07-08T05:43:20Z
- workers.dev disabled
- custom domain `rat-detective.animasai.co`
- GAME_ROOM namespace `70ceefe8318a4177ae08f5d0b6f3f00d`

## Assets

Direct-upload session hashed 9 files / 5,136,263 bytes from `dist/`. Last bucket HTTP 201. Live exact-byte check vs local `dist` (root, Buffer.equals true):

| path | bytes | sha256 |
| --- | ---: | --- |
| `/assets/index-CZgtWzYx.js` | 676514 | `3baf67cd8ae146cf04ea8241080373526d7c91241ea1293b856fb01307337d5e` |
| `/assets/index-DqzIn-gE.css` | 6938 | `97cf8b30ecb5b2398256781fd9da336d1d542c328e6a973c76a1f7cf2d645f9b` |

`GET /` HTML references those hashed filenames, not the previous `index-cruiaUhD.js` bundle.

Worker PUT multipart (local, not uploaded as an asset): 33785 bytes, sha256 `64e094f17f96d5aedf6f8cc9d812205e1276a81ccb1ae559d0dc1d00c0623843`.

JWT / multipart temp files were deleted after the successful PUT (`/tmp/rat-detective-staging-{session,completion}.jwt`, `put.multipart`, `put.b64`, `put.gz.b64`).

Follow-up cleanup also deleted leftover session artifacts: `put.b64.0`–`7`, `put.multipart.headers.json`, `metadata.json`, `session.json`, and `buckets.json`. JWT files are gone. Remaining `/tmp` items are Worker dry-run bundles only (no tokens).

## Runtime checks

`GET /health` HTTP 200:

```json
{"ok":true,"service":"rat-detective","runtime":"cloudflare-workers"}
```

`GET /ws` without Upgrade is HTTP 400 `Expected WebSocket upgrade` (worker-first routing).

Isolated-room WebSocket smoke:

```text
npm run smoke:ws -- wss://rat-detective-staging.mayberrydt.workers.dev/ws?room=staging-verify-1d7bb1e8-59e7-4d37-a358-dd5c36e154d7
WebSocket smoke passed ... join v1, movement, shot, damage, death, scoring, respawn, leave
```

That command exited 0.

Real-input gameplay smoke (`SMOKE_GAMEPLAY=1`) against isolated room `staging-gameplay-19ef836f-d911-4198-8b28-4556a403d971`:

- title dismissed, scoreboard visible, canvas present
- pointer lock true
- movementDistance 6.3935
- jumpRise 2.4470
- resolvedShot true, directionLength 1

That command exited 0.

Screenshot: [staging-gameplay.png](staging-gameplay.png)

Root CUA review PASS in a new background tab, isolated room `final-render-review-20260906`: entered as Stage Review, scoreboard `0K / 0D`, rendered rat / city / health / outline correct. Tab closed after review.

Root independently re-ran staging smokes as exec 44996, exit 0:

- WS isolated room `smoke-5fab6906...`: join v1, movement, shot, damage, death, scoring, timed respawn, leave
- Browser real-input: pointerLock true, movementDistance 5.797528489954923, jumpRise 2.960927660066724, resolvedShot true, directionLength 1, title hidden, scoreboard visible

Remote recheck after those smokes: staging still uses GAME_ROOM `d84682955f0d45fdbedc108a11a600c3`. Production `rat-detective-preview` is unchanged (deployed 2026-07-08T05:43:20Z, workers.dev off, domain `rat-detective.animasai.co`, GAME_ROOM `70ceefe8318a4177ae08f5d0b6f3f00d`).

Connector limitation: `cloudflare.execute` has no filesystem. Asset buckets uploaded locally with JWT on stdin. Worker PUT body was gzip+base64 carried in the execute `code` argument after a SHA-256 match; Wrangler stayed unauthenticated.
