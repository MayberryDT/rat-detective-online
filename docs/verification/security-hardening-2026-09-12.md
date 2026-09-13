# Security hardening — September 12, 2026

Status: corrected release deployed to https://ratdetective.online/ from security
commit **`3b19a1f`** and hotfix **`bd3ed20`**.
Production Worker: **`fea69807-c936-47cf-98a1-22171a59143a`**.

> Superseded movement note, September 13: the static path ray described below was
> removed in Worker `e1ecb3ed-1853-480d-89f0-81817d0c238b` after continued lag and
> snap-back reports. World bounds, server-time displacement, sequences and rate
> limits remain. See [the correction receipt](movement-hot-pursuit-lag-2026-09-13.md).

## Closed findings

- Public clients can no longer choose arbitrary Durable Object room names. The canonical room continues through matchmaking; exact localhost diagnostics and authenticated network/capacity fixtures retain scoped custom rooms.
- Browser WebSocket upgrades require an exact same-origin `Origin`. Non-browser private relays may omit it and remain protected by their bearer credential.
- Admission uses the Cloudflare Rate Limiting binding at 120 attempts per minute per available connecting address. Existing per-connection message limits remain.
- Human pose updates are bounded by elapsed server time and rejected when their static path crosses city collision. Rejections retain the prior authoritative position and emit a correction.
- Quaternion inputs must have a finite magnitude from 0.5 through 2. Already-unit values preserve exact wire round trips; other accepted values are normalized.
- Resume credentials are single-use: a successful reconnect rotates the token before closing a replaced socket, so replaying the old token cannot displace the new session.
- Private network and capacity bearer credentials use SHA-256 normalization plus the Workers constant-time comparison primitive.
- Remote capacity receipt arguments require an exact 64-character lowercase hexadecimal fixture ID and an absolute validator path before any SSH command is assembled.
- Non-upgrade responses receive CSP, frame, MIME-sniffing, referrer, permissions and HTTPS transport headers. The title's Google Fonts load no longer depends on inline JavaScript.

## Verification

- `npm test`: 19 Worker files / 146 tests, 112 client files / 851 tests, and 29 script tests — **1,026 passing**.
- `npm run typecheck`: passed.
- `npm run build`: passed. Wrangler emitted a sandbox-only warning when it could not write its optional log under the read-only home configuration directory; type generation and the Vite production build completed successfully.
- `npm audit --audit-level=high`: zero known vulnerabilities.
- Focused regression coverage includes room admission, Origin and headers, rate limiting, movement speed and wall crossing, quaternion bounds, resume replay, private receipt validation and copied capacity fixtures.

## Production release verification

- The guarded production script rebuilt the matching client and Worker, uploaded five changed assets while reusing 51, and deployed the existing `rat-detective-preview` service and custom domains.
- Wrangler reported the existing `GAME_ROOM` and `MATCHMAKER` Durable Objects plus `ADMISSION_RATE_LIMITER` at 120 requests per 60 seconds.
- Live `/health` and `/status` returned 200. The status retained `public-live-v2`, world seed 341283204 and world version 2. The corrective check observed the normal eight-rat population with seven server bots.
- Live responses included CSP, HSTS, Permissions Policy, Referrer Policy, MIME-sniffing and frame-denial headers. CSP restricted socket connections to `wss://ratdetective.online`.
- A cross-site WebSocket handshake returned 403 `Forbidden WebSocket origin`; a same-origin direct `graybox-attack` room request returned 404 `Unknown room`.
- The live `index.html` SHA-256 exactly matched the corrected local production build.

## Rollback and correction

The first security deployment, Worker `02bddcbd-cf04-485f-9d06-b74afee55f96`,
was rolled back to accepted Worker `2a470c22-424d-4bbf-823f-2dbb19c7c4cc`
after Tyler reported repeated movement corrections that also left shots outside
the server's origin envelope. A focused production-spawn reproduction showed the
rat-volume sweep rejecting valid landing paths. The correction uses a torso-center
static path ray, permits one complete compressed 50 ms walking/launcher update,
and retains the gross speed and wall-crossing rejection. A regression checks
ordinary first steps and landings across every production spawn. No automated
gameplay input was used.

The same hotfix keeps the Excessive Force objective ledger visible while the
incident roulette is rolling. A source-level selector regression preserves that
exception without changing the other assignment modes.

## Boundaries

Movement remains client-supplied rather than a fully server-simulated character controller. The new checks close direct teleport and static wall-crossing inputs while retaining the broad launcher envelope, but they are not a competitive anti-cheat guarantee. Rate limiting depends on Cloudflare's connecting-address signal and is deliberately generous to avoid penalizing shared networks. No gameplay input automation or production namespace replacement was performed; verification used bounded HTTP and rejected-handshake requests.
