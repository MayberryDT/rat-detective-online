# Gunshot distance and repeated pointer-lock loss — September 9, 2026

Tyler accepted the latest AI rhythm, then reported that every gunshot sounded adjacent and that Brave intermittently lost mouse lock during normal gameplay. Once triggered, the loss seemed to repeat. A later attempt did not reproduce it; no F8 capture was available.

## Gunshot correction

`CheeseGun` previously played one shared `THREE.Audio` voice at volume 0.4 for every local/remote shot, stopping the prior voice each time. This was a confirmed global-audio path, with no distance input.

`GunshotAudio` now uses independent bounded voices. Local shots preserve their original volume; remote shots use the descriptor's origin and listener world position, with positional direction and deliberately steep attenuation. Within six units the gain is 1; at fifteen it is about 0.099, at twenty-five about 0.017, and by forty it falls below the 0.001 voice-allocation threshold. The mathematical cutoff is forty-eight. Bad Ammunition's firing cue uses the same distance curve while retaining its recorded sound and pitch variety.

At most twelve firing voices overlap. A quieter incoming shot cannot evict a louder one; local shots have priority over remote shots. Completed/disposed voices disconnect; suspended contexts do not queue shots. Ball tuning, AI behavior and the other incident sounds are unchanged.

## Input investigation and correction

The merge diff added incident cue selection to normal `GameSession`; the HUD changes did not add a lock-release call. The separate stage-preview `PointerLockMenu` helper is not used by the normal game. No application call to `exitPointerLock` was found in the current source. These findings do not rule out a browser/OS issue or an indirect UI regression.

The normal game's broad document-click handler could request lock after any loss, including a trailing click from the previous locked gesture, and did not track a pending request. The new `GamePointerLock` owner requires a fresh primary-button press and click on the canvas after loss, ignores same-instant/trailing clicks, and permits only one pending request. It suppresses locked click/default UI actions while preserving primary-button firing, Space input and the browser's Escape behavior. It does not re-lock on timers or focus events. Audio resumes from pointer-down gestures; F8 downloads remain usable.

This is a fix for a demonstrated weakness in the event handling, **not confirmation of the original intermittent unlock cause**. The browser API requires a fresh engagement gesture after its default unlock and can reject immediate re-entry: [W3C Pointer Lock](https://www.w3.org/TR/pointerlock-2/).

Quiet diagnostics now persist a lock loss immediately and publish bounded numeric counts of losses, recent-Escape losses, focused/visible losses, window blurs, rejected requests and ignored clicks through the existing sanitized local relay. Detailed events remain in the local report. No raw key history, text or credentials are collected. No browser gameplay/input automation was run.

## Verification and preview

Full suite: **531 passed** (101 Worker, 408 client, 22 scripts), then a final audio-unlock gesture adjustment passed typecheck, sixteen focused tests and build. That adjustment adds one regression test (532 tests now defined). Existing bundle-size warning remains.

The private relay on port 5181 serves the new client build `index-Bh-vJYzT.js` from main's `dist`, with the same already-verified private Worker `2757e4bb-d461-4471-b168-9fc677dd9b28`. URL: http://127.0.0.1:5181/?room=graybox-benchmark-match-ai-feel-v4&diagnostics=quiet . Backend expiry remains September 9 at 18:18 Pacific. Public production is unchanged. Changes remain uncommitted.
