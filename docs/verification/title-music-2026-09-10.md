# Title-screen music — September 10, 2026

[Updated desktop preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools&revision=title-music-v25). The existing private 16-rat room expires at **3:33 PM Pacific**; production is unchanged.

## Behavior

The session requests background music immediately on title creation, before a room connection. Playback begins as soon as the existing MP3 buffer and browser audio permission are ready. The same loop continues into gameplay without a new start; its asset, 0.4 volume and disposal remain unchanged.

Autoplay may be blocked by the browser. Session-owned capture listeners retry permission on pointer down, pointer up, click and keydown, covering mouse, completed taps and keyboard interaction without requiring ENTER CITY. They use the existing session abort signal. This follows the [browser's Web Audio restrictions](https://developer.chrome.com/blog/autoplay/#web-audio); immediate audible playback cannot be guaranteed for a fresh visitor without interaction.

## Verification and receipt

- 13 focused session/resource tests pass. The existing session test now checks start before any connection, gesture retries without joining and a single start across entry. Resource cleanup remains covered by the real EventTarget lifecycle fixture. An initial teardown assertion used the simpler mock document that ignores AbortSignal; that invalid assertion was removed, retaining the real lifecycle check.
- **759 tests pass**: 127 Worker, 607 client, 25 script. App/test typecheck and production/visual builds pass. Existing bundle-size advisories remain. No browser gameplay/input automation or human listening claim.
- Served HTML and JS exactly match the frozen client. Passive readiness received **434 valid snapshots**, zero invalid packets/errors, and a full 16-rat roster with 14 bots and two client slots including the probe. The probe closed afterward; normal bot refill remains.
- Client `/assets/index-BJ3bdTxP.js`, SHA-256 `f25e86275bfeb5f947b78310ab1e61419c83165a6e7ab39ca30b1a098b66e17b`, frozen under `output/title-music-2026-09-10/client`. Checks, source hashes and readiness are alongside it.

The desktop service `rat-detective-full-lobby-preview.service` uses that frozen directory. Backend remains `45bc9d1f-689f-45cc-98a7-b5aa768cc8fa`, protocol 7, room `graybox-benchmark-ai-sixteen-v20`, world seed 1092212759/version 2, expiry September 10 at 22:33 UTC / 3:33 PM Pacific. No Worker or production deployment, phone relay, room rename or commit.

[Creator/music credit placement and cursor protection](game-credits-2026-09-10.md) remain as verified. Prior accepted audio integration context: `brain:sessions/2026/09/rat-detective-audio-integration-main-2026-09-10`.
