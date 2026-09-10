# Mobile controls

Implemented September 10, 2026. Landscape touch controls use the existing shoulder camera, animated muzzle, movement physics, assignment rules and server shooting checks. Desktop keyboard/mouse and held-Tab controls remain available.

## Controls and presentation

- Left floating joystick: camera-relative movement, eight-pixel dead zone, proportional speed up to the normal 18-unit maximum. The joystick stays anchored to the finger's initial contact; diagonals and combined keyboard/touch input cannot increase maximum walking speed.
- Right-side swipe: aim without firing. A drag keeps ownership even outside its original touch area.
- FIRE: hold to repeat; dragging the same finger continues aiming. Repeats are paced at least 85 ms apart, bounded by the unchanged 12-shot-per-second server ceiling and rendered frames. No catch-up bursts; rapidly tapping does not bypass the touch cadence. Desktop click behavior is unchanged.
- JUMP: the same grounded jump impulse/gravity and launcher behavior as keyboard jumping. Jump can be held alongside movement and firing using an additional finger. Two-thumb play can momentarily move the right thumb from FIRE to JUMP.
- SCORES: tap open/close, swipe the full table in either direction. Opening it releases touch movement/fire; the multiplayer match continues. The desktop Tab behavior is unchanged.
- AIM: a persisted .4–2× look-sensitivity slider. Fullscreen is offered only when the browser exposes it; it is optional. Portrait displays TURN YOUR PHONE and clears held controls.

Controls appear based on coarse-pointer/touch capability, with actual touch enabling the surface on hybrid devices. `controls=touch` forces the layout for review, and `controls=mouse` disables it. Neither choice changes game rules. Controls use dark translucent paper, generous touch areas, and notch/home-indicator insets. Compact objective cards retain top-five progress, destination and essential scoring status. The reticle stays clear. The title/death/result screens fit short landscape viewports.

## Input lifetime

`TouchInput` owns fingers and analog state. `TouchControls` captures/relinquishes pointers and owns the session's DOM/listeners. Movement enters the existing fixed physics step; both input methods call the same `GameSession.shoot()` function. A fresh camera transform is used for the real muzzle-to-reticle convergence.

Release, lost capture, touch cancellation, backgrounding, focus loss, resize/rotation, disconnect, death, respawn, correction, round end/reset and disposal clear the relevant held actions. Settings and scoreboard overlays cannot fire behind themselves. Mobile entry and UI clicks bypass mouse pointer lock; native touch events are not synthesized into mouse/keyboard events. Audio unlock runs in the gesture's capture phase, before a touch surface consumes the event.

The shared `SHOOT_RATE` declaration moved to `shared/shotTiming.ts` and is re-exported from Worker validation with identical values. There is no server rules or protocol change. Existing lighting/shadow settings and rendering resolution are retained until actual device performance is measured.

## Private phone preview

- [Tailscale](http://100.79.24.11:5192/?room=graybox-benchmark-match-mobile-v18&lighting=pools): phone must have Tailscale connected.
- [Wi-Fi](http://10.129.181.26:5191/?room=graybox-benchmark-match-mobile-v18&lighting=pools): phone must reach this computer on the same Wi-Fi network.
- [Desktop](http://127.0.0.1:5190/?room=graybox-benchmark-match-mobile-v18&diagnostics=quiet&lighting=pools).

The three links join the same private automatic pool. Backend expiry is **September 10, 2026, 5:16 AM Pacific**. See [verification](verification/mobile-controls-2026-09-10.md). These are private preview addresses, not a production release.

The relay defaults to loopback. Explicit `--listen-address` and `--browser-origin` options permit a matching private IPv4 interface and exact browser origin. Public/wildcard binds, credential-bearing origins and foreign WebSocket origins are rejected. The upstream private token stays outside the repository and browser. An optional HTTPS reverse-proxy origin is supported, but Tailscale Serve could not be configured here without a sudo password. The working phone links use HTTP on the explicit Wi-Fi/Tailscale interfaces; no Tailscale administrator/operator settings were changed.
