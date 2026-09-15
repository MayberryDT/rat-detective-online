# Mobile controls

Current entry point: [Rat Detective](https://ratdetective.online/). The private phone links below are historical and inactive. The latest follow-up makes title controls usable before the engine loads, prepares the public connection without reserving a slot, and changes FIRE to one shot per tap. See [load/input/lighting verification](verification/title-fast-tap-lighting-2026-09-10.md).

Implemented September 10, 2026. Landscape touch controls use the existing shoulder camera, animated muzzle, movement physics, assignment rules and server shooting checks. Desktop keyboard/mouse and held-Tab controls remain available.

Mobile HUD refinement: assignment/top-five, incident and roulette/reveal cards are 30% smaller, with translucent dark surfaces and solid lettering. The incident time bar is visible, and the assignment card stays visible during roulette. Desktop presentation, full SCORES table and touch button sizes are unchanged. [Current Tailscale preview](http://100.79.24.11:5192/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools&revision=mobile-aim-v21); [camera/layout verification](verification/mobile-hud-compact-2026-09-10.md).

September 10 firing fix: shot IDs support HTTP private-IP previews through a cryptographic UUID fallback. This fixes a reproduced exception that stopped animation during held FIRE while audio/SCORES continued. The new client is `index-C2eMX0ZR.js`; [retry on Tailscale](http://100.79.24.11:5192/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools&revision=shot-fix-v19). See [investigation and 719-test verification](verification/mobile-firing-freeze-2026-09-10.md). Tyler subsequently confirmed the phone build works well.

## Controls and presentation

- Left floating joystick: camera-relative movement, eight-pixel dead zone, proportional speed up to the normal 18-unit maximum. The joystick stays anchored to the finger's initial contact; diagonals and combined keyboard/touch input cannot increase maximum walking speed.
- Right-side swipe: aim without firing. A drag keeps ownership even outside its original touch area.
- FIRE: one tap fires once; holding never repeats. Dragging the same finger continues aiming. A valid pointer-down fires immediately; taps within the existing 85 ms cadence are consumed without a delayed shot. The unchanged server ceiling is 12 shots per second. Desktop click behavior is unchanged.
- JUMP: the same grounded jump impulse/gravity and launcher behavior as keyboard jumping. Jump can be held alongside movement and firing using an additional finger. Two-thumb play can momentarily move the right thumb from FIRE to JUMP.
- SCORES: tap open/close, swipe the full table in either direction. Opening it releases touch movement/fire; the multiplayer match continues. The desktop Tab behavior is unchanged.
- Local September 14 candidate: the gear opens the shared [Settings menu](player-settings.md), with 0.2–3× touch sensitivity, default **1.5×**, vertical inversion and saved preferences. Existing `rat-touch-sensitivity` values migrate. Opening clears fingers; returning to play requires Resume. The production release still has its earlier AIM panel until this candidate ships. Fullscreen is offered only when the browser exposes it; it is optional. Portrait displays TURN YOUR PHONE and clears held controls.

Controls appear based on coarse-pointer/touch capability, with actual touch enabling the surface on hybrid devices. `controls=touch` forces the layout for review, and `controls=mouse` disables it. Neither choice changes game rules. Controls use dark translucent paper, generous touch areas, and notch/home-indicator insets. Compact objective cards retain top-five progress, destination and essential scoring status. The reticle stays clear. The title/death/result screens fit short landscape viewports.

The incident card uses 24 px plus the right safe-area inset, an internal header, wrapping title and a contained entrance animation. Its timer/bar remain visible. See [mobile aim/card checks](verification/mobile-aim-card-2026-09-10.md).

## Input lifetime

`TouchInput` owns fingers and analog state. `TouchControls` captures/relinquishes pointers and owns the session's DOM/listeners. Movement enters the existing fixed physics step; both input methods call the same `GameSession.shoot()` function. A fresh camera transform is used for the real muzzle-to-reticle convergence.

Release, lost capture, touch cancellation, backgrounding, focus loss, resize/rotation, disconnect, death, respawn, correction, round end/reset and disposal clear the relevant held actions. Settings and scoreboard overlays cannot fire behind themselves. Mobile entry and UI clicks bypass mouse pointer lock; native touch events are not synthesized into mouse/keyboard events. Audio unlock runs in the gesture's capture phase, before a touch surface consumes the event.

The shared `SHOOT_RATE` declaration moved to `shared/shotTiming.ts` and is re-exported from Worker validation with identical values. There is no server rules or protocol change. Existing lighting/shadow settings and rendering resolution are retained until actual device performance is measured.

## Historical private phone preview

- [Tailscale](http://100.79.24.11:5192/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools): phone must have Tailscale connected.
- [Wi-Fi](http://10.129.181.26:5191/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools): phone must reach this computer on the same Wi-Fi network.
- [Desktop](http://127.0.0.1:5190/?room=graybox-benchmark-ai-full-lobby-v19&diagnostics=quiet&lighting=pools).

The three links now join the same full private room: 24 bots before joining, 23 bots plus the first human, with vacancy refill after ten seconds. Protocol **6**, private Worker `ca922117-7fc4-4a97-a603-5a54f44e3787`, frozen client `index-7qTByXE_.js`, expiry **September 10, 2026, 2:57 PM Pacific**. See [full-lobby readiness and replacement checks](verification/full-lobby-preview-2026-09-10.md). The earlier protocol-5 mobile preview was superseded. The original renewal used `2e94e83`; the relays now serve the mobile aim/card follow-up, compact HUD and firing fix described above. Initial renewal receipts are under `output/mobile-preview-renewal-2026-09-10T15-25-11Z/`, with earlier client receipts under `output/mobile-aim-card-2026-09-10/`. See [implementation verification](verification/mobile-controls-2026-09-10.md) for the original checks. These are private preview addresses, not a production release.

Initial renewal checks (before the firing fix): all 122 recorded source hashes and 45 frozen client files matched. Each route served exact HTML/JS/CSS and all 13 WAVs. Separate six-second passive sessions received eight rats, protocol 5 and zero invalid packets: desktop 157 snapshots, Wi-Fi 163, Tailscale 165. Halla independently reached the Tailscale relay. These are asset/protocol checks, not new phone gameplay or performance tests; unchanged application tests were not rerun.

The relay defaults to loopback. Explicit `--listen-address` and `--browser-origin` options permit a matching private IPv4 interface and exact browser origin. Public/wildcard binds, credential-bearing origins and foreign WebSocket origins are rejected. The upstream private token stays outside the repository and browser. An optional HTTPS reverse-proxy origin is supported, but Tailscale Serve could not be configured here without a sudo password. The working phone links use HTTP on the explicit Wi-Fi/Tailscale interfaces; no Tailscale administrator/operator settings were changed.
