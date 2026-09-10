# HTTP phone firing freeze — September 10, 2026

Tyler reported the game freezing a few seconds into the private Tailscale preview in Brave while bot audio continued and SCORES could still open. The phone OS/model was not specified. No on-device console or GPU trace was captured.

## Reproduced fault and fix

`CheeseGun.shoot()` called `crypto.randomUUID()` unconditionally. That API requires a secure browser context; the explicit HTTP private-IP phone links do not provide one, unlike the desktop localhost preview. Held touch firing calls `shoot()` from `GameSession.animate()`. The exception occurs before the next animation frame is scheduled, stopping rendering and local simulation while socket callbacks can continue updating audio and DOM controls.

The regression test ran the production animation, shooting, prediction, touch-state, rat and physics code with GPU/network stand-ins. With `getRandomValues` available but `randomUUID` absent, the original code failed with `TypeError: crypto.randomUUID is not a function` in `CheeseGun.shoot → GameSession.shoot → TouchInput.tick → GameSession.animate`. The normal crypto case passed. This reproduces a cause consistent with the report; a retry on Tyler's phone is still needed to confirm it resolves his observed freeze.

`createShotId()` now uses native UUID generation when available and generates an equivalent random UUID v4 using `crypto.getRandomValues()` otherwise. IDs retain their format, randomness and uniqueness for shot validation, deduplication and prediction. No protocol/server, cadence, physics, camera, graphics or lighting changes. API behavior: [randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID), [getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

## Checks

- The regression runs 300 production frame callbacks, begins held fire two seconds in, aims while firing, releases it, and verifies continued rendering, paced valid distinct shot messages and eventual prediction cleanup. Both crypto environments pass after the fix.
- Focused firing/projectile/touch checks: 37 passed.
- Full suites: 107 Worker + 588 client + 24 script = **719 tests**; client concurrency limited to four. App/test typecheck and both builds passed. Existing bundle-size warning remains.
- Refreshed routes served exact frozen HTML/JS/CSS and all 13 WAVs. Separate six-second passive sessions each received eight rats with protocol 5 and zero invalid packets: desktop 172 snapshots, Tailscale 161, Wi-Fi 158. These checks verify assets and protocol, not phone firing or rendering.
- No automated browser gameplay/input checks, new visual review, real-phone playtest or phone performance measurement. The unchanged graphics did not need new screenshots.

## Preview

Frozen client `output/mobile-freeze-fix-2026-09-10/client`, assets `index-C2eMX0ZR.js` / `index-Cq4B7JDi.css`. All three existing private relays now serve this client. The private Worker remains `1c91db50-d6d7-44aa-856a-364beca8aa6c`, protocol 5, expiring **September 10 at 12:25 PM Pacific**. No Worker or production deployment and no push. Old frozen clients and receipts are retained.

[Tailscale retry](http://100.79.24.11:5192/?room=graybox-benchmark-match-mobile-v18&lighting=pools&revision=shot-fix-v19). Reload or reopen the page to replace a stopped animation loop. The query marks the revision; the script itself has a new immutable filename.

Local build/test logs, source hashes, preview metadata and passive connection receipts are under `output/mobile-freeze-fix-2026-09-10/`.

Human follow-up: Tyler subsequently reported that the phone build works really well, then requested the compact mobile HUD documented in [the next receipt](mobile-hud-compact-2026-09-10.md).
