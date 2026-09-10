# Mobile controls verification — September 10, 2026

Tyler approved the landscape two-thumb proposal and requested implementation, then confirmed that either Wi-Fi or Tailscale could be used for phone access. Changes are scoped to touch input, responsive HUD presentation, and private preview access. See [current behavior](../mobile-controls.md).

## Automated checks

- **717 tests pass:** 107 Worker tests in 18 files, 586 client tests in 87 files, 24 Node script tests. The client suite used the established `--maxWorkers=4` bound.
- Touch tests cover independent finger ownership, combined movement/aim/fire/jump, dead zone and proportional speed, capped diagonals, invalid inputs, drag continuation, repeat cadence and retap limits, cancellation, background/focus loss, settings/scoreboard toggling, portrait changes, death/respawn/reconnect, listener disposal and mouse-lock bypass.
- Real controller tests verify ordinary acceleration/max speed and grounded jump behavior with analog inputs. Existing assignment, missile, projectile, audio, session-resource and desktop-control regressions passed in the full suite.
- Relay tests cover exact origins and host checks, private-interface constraints, rejection of wildcard/public binds, path isolation, authenticated upstream forwarding, bounded buffers and cleanup. Initial LAN test exposed an unrecognized bound loopback alias; host validation was corrected to use the actual configured listen address, then all 24 script tests passed.
- Typecheck covers application and tests. Production and visual builds passed. Existing bundle-size advisories remain. Final client assets are `index-XaFJo2gm.js` and `index-Cq4B7JDi.css`.
- After the full application suite passed, only preview scripts/tests/docs changed; the affected full script suite was rerun. No redundant application suite execution is claimed.

## Static visual review

Seven screenshots use the actual city/rat/shoulder-camera fixture: Chain, Excessive Force, Closing Time, full 24-row scoreboard, title, death and portrait guidance. Landscape sizes were 844×390 and 667×375; portrait was 390×844. Chain's card was tightened after the first screenshot to separate it from the joystick, rebuilt and reviewed again. Fixture navigation was hidden for the screenshots.

These are desktop Chromium renders with phone viewport/touch capability emulation and fixed game states. **No automated gameplay inputs, real-phone rendering, human listening/playtest or phone frame-rate measurement were performed.** Real iPhone/Android thumb comfort, browser gestures, fullscreen availability, frame rate and heat remain for human review. No mobile graphics reduction was introduced without that evidence.

## Preview readiness

All three relays serve the same frozen client under `output/mobile-controls-2026-09-10/client`, against unchanged private Worker `b50a9992-f790-4ef0-b411-53bffecbb1c2`, protocol **5**, expiring September 10 at **5:16 AM Pacific**. The application source hashes are recorded in `preview.json` because the client was frozen before the local commit. No Worker upload or production deployment was needed for this client/input revision.

| Route | Observation |
|---|---|
| Desktop `127.0.0.1:5190` | Eight rats, 179 decoded snapshots, zero invalid packets |
| Wi-Fi `10.129.181.26:5191` | Eight rats, 170 decoded snapshots, zero invalid packets |
| Tailscale `100.79.24.11:5192` | Eight rats, 159 decoded snapshots, zero invalid packets |

Each was one passive six-second WebSocket observation in its own automatic pool, without movement/shooting input. Served HTML/JS/CSS and all 13 audio clips matched the frozen bytes. Halla independently reached the Tailscale relay's health endpoint using the existing verified SSH connection. This verifies a second-host network path, not a phone playtest or a multi-human match.

Services: existing `rat-detective-tab-scoreboard-preview.service`, plus `rat-detective-mobile-wifi.service` and `rat-detective-mobile-tailnet.service`. The phone relays bind only their explicit private interfaces and close at backend expiry. HTTPS via Tailscale Serve was attempted but requires administrator authentication; unprivileged access and non-interactive sudo both refused it. No operator policy was changed. The user-authorized Wi-Fi/Tailscale interface relays provide working phone access without that setup.

Logs, source hashes, screenshots and readiness reports are in ignored `output/mobile-controls-2026-09-10/`. The prior frozen audio and scoreboard builds remain intact. Production, gun/rat/incident audio, ball physics, bot AI, objective rules and server limits remain unchanged.
