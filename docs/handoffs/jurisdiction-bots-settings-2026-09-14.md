# Handoff: active Jurisdiction bots and player settings

## Implementation follow-up

The accepted first delivery is now implemented locally. See the
[verification receipt](../verification/jurisdiction-bots-settings-2026-09-14.md)
and [settings guide](../player-settings.md). The original discussion below is
retained as background; it is not a request to implement the catalogue again.

## Request and next step

Tyler discussed this in a session accidentally opened in `/home/tyler/Projects/personal-app`. The intended project is **Rat Detective**, `/home/tyler/Projects/rat-detective`. He will start a fresh session here. Read this handoff, catch up from the relevant source, and ask any remaining material clarifying questions. Do not ask him to repeat the background or reconfirm the agreed direction.

Tyler's playtest findings:

- A bot carrying the genuine case stood still inside the Jurisdiction zone. He wants believable human activity: moving around, looking around and jumping.
- On another setup the camera was far too sensitive, with no discoverable way to adjust it.
- He wants a settings menu and a broad view of possible settings that give players control.

Tyler agreed with the proposal below, then requested this handoff. No gameplay changes, tests, preview, commit or deployment were performed in this session. Only this handoff and its documentation-map entry were written. Agreement establishes the direction; the full candidate catalogue is not a demand to implement every item immediately. Earlier deployment approvals described in historical receipts do not authorize a new release.

## Agreed direction: active zone holding

Replace arrive-and-stop behavior with contextual movement:

- Quiet zone: short loops or movement between nearby safe positions, look toward approaches, occasional pauses and hops.
- Visible opponent: strafe, vary direction and keep looking/firing toward the threat.
- Under pressure: reposition around cover and occasionally jump while trying to retain scoring.
- At boundaries: steer inward smoothly; validate paths and landing support, especially around the T-shaped sewer junction.
- Case loss or zone change: transition promptly back to the correct objective.

Vary timing, direction preference and jump frequency per bot so the whole lobby does not move identically. Brief intentional pauses are fine; eliminate prolonged unresponsive standing. Constant mandatory jumping was not recommended. Preserve imperfect aim/perception, existing Ironclad handling, physical movement, objective priority and bounded shared navigation work.

### Source findings, inspected September 14

`src/shared/ObjectiveBotBrain.ts` has the relevant shared behavior:

- Around lines 272–284, the carrier chooses zone posts. Post rotation requires a nearby visible opponent (within 22 units) and proximity to the current post. Quiet carriers therefore keep the same post.
- Around line 374, route planning excludes a zone-holding bot already near its destination.
- Around line 450, arrival within .8 units explicitly zeros horizontal movement.
- Around lines 454–455, jumping is for recovery, obstacles and elevated waypoints, with a cooldown; it is not quiet-zone or evasive activity.
- Around lines 503–506, a predicted out-of-zone step zeros movement. Later counterfeit avoidance can alter velocity, so consider the final composed movement when checking zone safety.

This is a code-supported explanation matching the report, not a reproduction of Tyler's exact playtest. Recheck line numbers after intervening changes.

Use `src/shared/jurisdictionZones.ts` for floor-specific zone geometry, posts and approaches; `src/shared/jurisdiction.ts` and `src/shared/AssignmentRules.ts` for scoring/timing. Investigate the existing server bot controller and tests before extending behavior. Share behavior across existing bot adapters rather than introducing another planner.

Preserve current rules: only the living genuine-case carrier inside the active zone scores; one point per second, first to 60; zones last 75 active seconds with a 10-second warning. Enemy presence does not contest. Carriers already scoring stay through the relocation warning. Verify ordinary jumps remain eligible within the intended scoring floor band.

## Agreed direction: one settings menu

Add Settings on the title screen and existing Escape menu, plus a gear entry on touch. Opening it releases pointer lock and clears held gameplay input. Resume requires an explicit action. The online match continues while the menu is open; do not imply a world pause or grant protection.

Sensitivity needs a slider plus editable numeric value, immediate application and reset. Keep mouse/touch preferences separate. Save per device/browser because different setups need different tuning. Optional export/import profiles can come later. Avoid applying sensitivity twice through the common look path.

Existing integration points:

- `src/ui/TouchControls.ts`: small AIM panel; saved `rat-touch-sensitivity`, range .4–2, default 1.5; screen-size normalization in `lookScale()`. Migrate this preference rather than discarding it.
- `src/session/GameSession.ts`: touch and mouse both reach `rat.onMouseMove`; desktop passes `movementX`/`movementY`.
- `src/player/RatController.ts`: final look handling; inspect camera mapping here before deciding slider units/range.
- `src/session/PointerLockMenu.ts`: existing Escape/pointer-lock menu and leftover-click protection. Preserve it so menu interaction neither fires nor accidentally resumes play.
- `src/session/GamePointerLock.ts`, `src/session/InputState.ts`, `src/session/ScoreboardHold.ts`: input and lifecycle integration.
- `src/audio/FeedbackAudio.ts` and other audio modules: inspect all audio paths before implementing category/master gain.

### Proposed first delivery, accepted in principle

Bot behavior fix; shared settings menu; mouse/touch sensitivity; inversion; remapping; master/effects volume; reduced camera motion; UI scale; saving and reset support.

The ordering, precise defaults/ranges and first-delivery boundaries remain implementation choices or concise clarification topics. Preserve the accepted camera/model/lighting/gameplay feel by default. Use one validated preferences model with safe fallback when browser storage is unavailable, and immediate updates where feasible.

### Broader candidate catalogue

These are possible later settings, not claims of existing features or commitments to build prerequisite systems.

| Area | Candidates |
| --- | --- |
| Mouse/keyboard | Sensitivity; optional separate X/Y; inversion; remapping and alternate bindings; hold/toggle for applicable actions; raw input where supported |
| Camera | FOV; shake; bob/sway; smoothing; recentering; shoulder side and bounded distance if compatible with aiming/collision |
| Touch | Sensitivity; joystick size/position/dead zone; fixed/floating joystick; button placement/size/opacity; left-handed layout; supported vibration |
| Controller, if added | Sensitivity; dead zones; response curves; acceleration; inversion; remapping; vibration; supported gyro |
| Audio | Master/effects/music/ambience/UI volumes; mute; background mute; quieter dynamic-range preset; mono; captions or visual equivalents for important cues |
| Graphics/performance | Quality presets; render scale/pixel-density cap; shadows; lighting/effects; decorative particles; anti-aliasing; fullscreen; frame cap; battery-saving preset |
| HUD/readability | UI/text scale; crosshair size/color/opacity; safe margins; objective-marker size; notification duration; tutorial reminders; FPS/ping |
| Accessibility/comfort | Reduced motion/flashes; nonessential effects; semantic custom colors; shape/icon alternatives to color; contrast; keyboard-accessible menus |
| Preferences | Language when translations exist; profiles; import/export; reset one setting, category or all |

Keep projectiles, hazards and objectives legible at every graphics level. Validate FOV/shoulder/distance changes against aiming and camera collision. Browser support limits which display/input controls can actually work; show meaningful supported controls only.

Bot difficulty/count, assignment selection, zone duration and score target belong to possible **private-match host controls**, not per-player preferences in a shared public match. Controller support, translations, host controls and new audio-accessibility systems are separate work if absent.

Reference consulted for the catalogue: [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/full-list/), especially remapping, sensitivity, readable text and saved preferences.

## Completion evidence for implementation

- Deterministic bot scenarios in all six zones: quiet movement and varied facing, retained scoring while moving/jumping, valid support/paths, no persistent boundary oscillation, and transitions on threat, case loss, death and zone rotation.
- Preserve bounded navigation cost and check crowded-zone behavior. Motion intent alone does not prove actual physical movement or successful scoring.
- Settings: correct mouse/touch scaling, persistence/reload, malformed/unavailable storage fallback, reset, remapping conflicts, keyboard/touch menu access, UI scaling and no stuck inputs/click-through after opening or resuming.
- Follow repository checks: focused tests then applicable typecheck, full tests and build. Use human playtesting to evaluate bot feel and sensitivity on different setups; distinguish automated evidence from human acceptance.
- Read current `AGENTS.md` and `docs/tooling.md` before preview/testing. Preserve its audible human-preview versus muted agent-inspection policy and restrictions on automated browser gameplay. No preview service was started here.

## Context and useful references

Start with `AGENTS.md`, `docs/current-state.md` and `docs/README.md`. Current source/status overrides stale prose in README or older release receipts. The working tree was clean before this handoff; recheck when resuming and preserve any later work.

Read `docs/dispatch-assignments.md`, `docs/gameplay-baseline.md`, `docs/mobile-controls.md` and the relevant input/audio implementation for this task. Read `docs/live-service.md` only when release work is in scope. The personal-app project and its phone workflows are unrelated.

GBrain page read: `brain:sessions/2026/09/rat-detective-jurisdiction-production-2026-09-13`. Search results also located the Jurisdiction implementation, objective-focus and Ironclad follow-ups. The September 14 `docs/current-state.md` records subsequent companion work; the September 13 Worker ID in the GBrain release page is historical, not a freshly verified live version. No live game inspection was performed in this session.

Ask Tyler any remaining questions that materially affect the work, preferably together and after inspecting what source already answers. Likely topics are the desired first-delivery breadth or a strong preference about movement/jump frequency. Do not treat this list as mandatory questions; avoid asking him to choose routine technical details or repeating already accepted decisions.
