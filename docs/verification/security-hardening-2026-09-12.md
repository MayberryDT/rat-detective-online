# Security hardening — September 12, 2026

Status: implemented and verified in the local working tree; **not deployed**.

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

- `npm test`: 19 Worker files / 146 tests, 111 client files / 850 tests, and 28 script tests — **1,024 passing**.
- `npm run typecheck`: passed.
- `npm run build`: passed. Wrangler emitted a sandbox-only warning when it could not write its optional log under the read-only home configuration directory; type generation and the Vite production build completed successfully.
- `npm audit --audit-level=high`: zero known vulnerabilities.
- Focused regression coverage includes room admission, Origin and headers, rate limiting, movement speed and wall crossing, quaternion bounds, resume replay, private receipt validation and copied capacity fixtures.

## Boundaries

Movement remains client-supplied rather than a fully server-simulated character controller. The new checks close direct teleport and static wall-crossing inputs while retaining the broad launcher envelope, but they are not a competitive anti-cheat guarantee. Rate limiting depends on Cloudflare's connecting-address signal and is deliberately generous to avoid penalizing shared networks. No live endpoint, deployment, gameplay input automation or production namespace was changed during this work.
