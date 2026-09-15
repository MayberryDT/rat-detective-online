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
| Reduced interface motion | Off by default; suppresses title/HUD animation, without changing camera tracking |

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
No preferences or new control permissions are sent to the game server.

The current camera has no added shake or bob layer. Reduced interface motion
therefore applies to the existing presentation effects. FOV, shoulder position,
camera distance, touch layout editing, graphics presets, controller support,
profiles and private-match host controls remain outside this delivery.
