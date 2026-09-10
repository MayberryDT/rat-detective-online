# Creator and music credits — September 10, 2026

[Refresh the desktop preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools&revision=credits-v24). Same private 16-rat room and **3:33 PM Pacific** expiry. Production is unchanged.

## Placement and behavior

A small, muted bottom-right note says **Made by Tyler Mayberry**. Only the name links to [tylermayberry.dev](https://tylermayberry.dev), in a new tab with `noopener noreferrer`. It appears on desktop gameplay and both desktop/mobile title screens. Mobile gameplay and smaller desktop windows (900px wide or less, or 500px tall or less) hide it, including the title fade transition. Both credits remain on all title screens, with wrapping on narrow screens. The event guard checks the same live size query, so resizing cannot activate a hidden gameplay credit. Responsive HUD spacing prevents the desktop control legend from overlapping it. Safe-area insets keep it inside the viewport.

The music credit sits in the bottom-left corner of the title screen: “Music: Rat Detective Boogie by Stellar Cruise.” The song title links to the [supplied original video](https://www.youtube.com/watch?v=k4hjX6ZsplU), also in a new tab. It disappears with the title screen and does not add another persistent gameplay label. YouTube's oEmbed response verified the title `Rat Detective Boogie`, author `stellar cruise`, and channel `https://www.youtube.com/@stellarcruisemusic`. Only metadata was retrieved; no audio/video was downloaded or changed.

## Cursor-capture protection

[GameCredits](../../src/ui/GameCredits.ts) removes link destinations and tab stops during any pointer capture, marks the links disabled, and blurs a focused credit. CSS disables pointer hit targets. Capture-phase event guards also check the live `pointerLockElement`, covering the interval before a lock-change notification. Click, middle-click, context menu, keyboard and pointer activation are blocked while captured. A click that began as a locked shot cannot become navigation after Escape; pointer activation requires a fresh unlocked press. Native keyboard activation remains available while unlocked.

The existing [pointer-lock handler](../../src/session/GamePointerLock.ts) previously swallowed every click during desktop play even when unlocked. It now permits only the registered, currently available credit links; canvas re-entry and suppression of unrelated/trailing clicks remain. The title-screen Enter shortcut excludes credit links, so opening a focused credit does not enter the game. The fading title is inert immediately, preventing invisible controls or music links from receiving focus. All event guards use the session's abort signal for cleanup.

## Verification

- **759 tests pass**: 127 Worker, 607 client, 25 script. Typecheck, production and visual builds, and whitespace checks pass. Existing bundle-size advisories remain.
- Seven new tests exercise the credits with the actual pointer-lock handler: title/native keyboard links, live capture guards, removed href/tab stops, stale lock notifications/other captured elements, fresh Escape clicks, middle-click, mobile/small-screen title/game transitions and resizing, hidden music and listener cleanup. Existing session, input, HUD and gameplay tests remain passing.
- Nine static copies of the real title/HUD markup and styles checked at desktop 1440×900, mobile landscape 844×390 and 568×320, portrait 390×844 and 320×568, desktop game 1280×720, 800×600 and 1200×480, and mobile game 844×390. Visibility, bounds, footer/control overlap and unlocked hit targets pass. Screenshots were inspected. These pages do not load the game, simulate input or request pointer lock. An initial blank-origin capture blocked the custom font and produced an invalid small-screen result; repeating from the same-origin static fixture loaded the actual font and passed.
- Passive hosted readiness: **176 valid snapshots**, zero invalid packets/errors, 16 total rats (15 bots plus the probe). Probe closed afterward. The first check ran before the existing ten-second refill grace finished following relay cleanup; the final check explicitly waits for the full roster before its six-second observation.
- Served HTML and JS match the frozen client and contain both exact destination URLs.

## Private preview receipt

Client `/assets/index-HBk5xp14.js`, SHA-256 `af08c7574165c60acf6a3d77c28fa93e9c9df17715778d36069791709e9581c8`. Frozen assets, source hashes, oEmbed metadata, screenshots, layout bounds, checks and readiness are under `output/game-credits-2026-09-10/`.

Backend remains private Worker `45bc9d1f-689f-45cc-98a7-b5aa768cc8fa`, protocol **7**, room `graybox-benchmark-ai-sixteen-v20`, version-2 world seed `1092212759`. Expiry remains **September 10 at 22:33 UTC / 3:33 PM Pacific**. The existing desktop service `rat-detective-full-lobby-preview.service` now uses `output/game-credits-2026-09-10/client-responsive` via `--dist`; earlier frozen clients are preserved. Temporary static-review Vite was stopped. No Worker or production deployment, room rename, gameplay-input automation or commit.

The previous [50% world-audio lift](world-audio-lift-2026-09-10.md) received human acceptance. Lighting remains unchanged; its alley-visibility proposal is still only a proposal. Prior visual context: `brain:sessions/2026/09/rat-detective-dark-noir-silhouette-siren-maintenance-2026-09-09`.
