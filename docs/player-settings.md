# Player settings

Released September 14, 2026 with the accepted maneuver behavior and ten-rat cap. See the
[production receipt](verification/maneuvers-production-2026-09-14.md).

Open **Settings** on the title screen. During desktop play, Escape releases the
mouse and opens the menu; choose Settings. Touch players use the gear button.
The match continues and the rat remains vulnerable. Opening the menu clears held
keys and fingers. Back returns to the match menu; Resume explicitly returns to
play. Escape alone does not resume the match.

| Setting | Range and default |
| --- | --- |
| Mouse sensitivity | 0.1–3×, default 1× of the existing 0.002 look mapping |
| Touch sensitivity | 0.2–3×, default 1.5×; existing 0.4–2× saved values migrate |
| Vertical look inversion | Separate mouse and touch switches, both off by default |
| Keyboard bindings | Movement, jump, alternate fire and held scoreboard; two slots per action |
| Master volume | 0–100%, default 100%; controls music and all effects |
| Effects volume | 0–100%, default 100%; preserves existing relative and spatial gains |
| UI scale | 80–130%, default 100%; scales anchored HUD cards and countdown |
| Reduced interface motion | Off by default; suppresses title/HUD animation and zeroes camera shake |
| Camera shake | 0–100%, default 100%; scales every view-only camera effect from the [juice plan](juice-plan.md) |
| Flash strength | 0–100%, default 100%; scales screen flashes and the low-health colour drain |
| Graphics | Auto (default), High, Medium or Low; see [Graphics](#graphics) |

Sensitivity has a slider, editable numeric value and individual reset. Changes
apply immediately. Touch retains its existing screen-size normalization, with
sensitivity applied once. Left mouse remains the primary fire button; keyboard
fire can be assigned as an alternate. Choose a binding and press a key. Delete
clears a slot if another binding remains; Escape cancels capture. Conflicts and
reserved browser/debug/menu keys are rejected. The desktop control hints update
to match the selected bindings. Scoreboard bindings remain hold-to-show.

Preferences save under `rat-player-settings-v1` in browser local storage.
Defaults preserve the accepted camera, sound mix and touch sensitivity. Reset all
restores defaults, including bindings, and persists them so an old touch value
cannot reappear after reload. Malformed settings fall back safely. If storage is
unavailable, settings work for the visit and the menu says they cannot be saved.
No preferences or new control permissions are sent to the game server, except that
the periodic performance report carries the current graphics mode, render scale and tier.

Camera effects (shot kick, hit jolt, landing dip, view widening) are view-only. The
camera is offset just before rendering and restored straight afterwards, so aim,
shots and raycasts always use the steady view. `?feel=off` removes every polish
effect for comparison. `?feel=dev` adds a Juice review section with per-item
switches and live values, saved under `rat-feel-review-v1` and ignored outside
`feel=dev`. FOV, shoulder position, camera distance, touch layout editing,
controller support, profiles and private-match host controls
remain outside this delivery.

## Graphics

`src/session/graphicsQuality.ts` owns the render resolution (the drawing buffer's
pixels per CSS pixel) and a tier of costly extras. Nothing it changes compiles a
shader, and the renderer is never recreated (antialiasing stays on).

| Mode | Render scale | Extras |
| --- | --- | --- |
| High | min(device pixel ratio, 2), the accepted look | all |
| Medium | about ¾ of High's width, never below native (1.0) | half the rain |
| Low | 0.7 of native | 30% of the rain, no film grain overlay, no haze cones under streetlamps (the fog stays) |
| Auto | moves between High and Low | as the level it is at |

The flashlight's shadow redraws every frame at every level. An earlier staging build
redrew it every second or third frame on Medium and Low; because the flashlight rides
with the rat, the rat's own shadow lagged and snapped, and Tyler found movement jumpy
and unusable (30 September).

Auto measures the frame interval during live play in 1.5 s windows, leaving out each
window's slowest 5% of frames so one hitch cannot move it (the title, loading, a hidden
tab and the first 4 s after any gap or respawn are not measured). Two windows running
under 55 fps take one step down: the resolution to native in steps of about 28% fewer
pixels, then medium extras, 0.85, low extras, 0.7. A step whose next two windows are
not at least 8% faster than the two before it is undone, and that kind of step waits a
minute (doubling each time) — so a machine limited by its processor, or a browser capped at 30 fps,
keeps the full look instead of blurring for nothing. After 8 s of steady 58.5 fps — or
of slow frames with nothing left worth lowering — Auto tries one step back up; if the
next two windows are under 55 fps and 10% slower than before, it returns (about 4 s) and
waits twice as long before trying again (up to 2 minutes). Both margins sit above ordinary
frame-to-frame noise; a resolution step changes 28–38% of the pixels. The target is 60 fps on any
display; faster screens are not chased. Auto stores where it settled
(`rat-graphics-auto-v1`) and starts there next visit; a start that turns out too low
climbs back (a processor-bound machine returns to High in about a minute).

The Settings **GRAPHICS** tab shows the four modes as stamps and what is being drawn
now (for example "Now drawing 2880 × 1620, all effects").
