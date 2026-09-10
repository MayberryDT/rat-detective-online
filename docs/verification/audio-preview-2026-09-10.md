# Merged-audio private preview — September 10, 2026

Tyler requested updating the existing preview after the audio integration was committed. The private client and server now both use application commit **`47338e3a1dc38d709b4c4871cbe5a064f285f8a9`**. No application changes or production deployment were made during this refresh.

[Play the updated full game](http://127.0.0.1:5190/?room=graybox-benchmark-match-scoreboard-v16&diagnostics=quiet&lighting=pools&revision=audio-v17). The address remains port **5190**, with the existing automatic-room pool and dark lighting. The revision query distinguishes this refreshed link.

## Release

- Dedicated private Worker: `rat-detective-capacity-test`.
- Version: `b50a9992-f790-4ef0-b411-53bffecbb1c2`.
- Fixture: `8b014bad7937f9ab5ccedca8d1f3a70300181e6922b45986c19832a119c2e205`.
- Protocol: **5**; current foley annotations included.
- Expiry: **September 10 at 5:16 AM Pacific**.
- Standard preview preparation: `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=11 --cap=24`. The automatic pool uses dynamic backfill; the fixed benchmark AI override is not selected by this room.
- Backend receipt: `output/hosted-capacity-deployment-2026-09-10T08-16-43-534Z/deployment.json`.
- Frozen client: `output/hosted-capacity-deployment-2026-09-10T08-16-43-534Z/runtime-g3frxc/dist`.
- Assets: `index-5zQb88HS.js`, `index-BRaXkHdM.css`.
- Refreshed service: `rat-detective-tab-scoreboard-preview.service`. Its previous client snapshot is retained.

## Readiness checks actually performed

- Deployment dry run, private upload and authenticated exact-fixture health succeeded.
- All **118** recorded source hashes match the integrated checkout. The client bundle matches the previously tested build.
- Local relay reports healthy. Served HTML, JavaScript and CSS equal the frozen client bytes.
- All **13** WAV requests returned HTTP 200 with `audio/wav` and bytes identical to the accepted frozen bank.
- One passive WebSocket client in a separate private automatic pool observed **eight rats**, **161 valid snapshots**, **zero invalid packets**, protocol 5 and an active Excessive Force assignment over six seconds.
- Received three case-bounce/audio-only annotations, confirming the deployed server sends the new physical sound events. Also received 596 ordinary bounce annotations, which the accepted sound selector intentionally ignores. Receipt counts are observed annotations, not audible playback or sound quality measurements.
- Closed the readiness socket afterward. No synthetic movement/shooting, browser gameplay/input automation, human listening or multi-human playtest was performed. Opening the refreshed preview URL was requested through the app; the app reported it queued.

The prior integration passed **695 tests**, typecheck and both builds; those unchanged-source results were reused, not rerun or claimed as a new test execution. See [integration verification](audio-integration-main-2026-09-10.md). New preview evidence is under ignored `output/audio-preview-2026-09-10/` (`preview.json`, `full-preview-check.json`, `check-full-preview.mjs`).

The production Worker, public room and domains are unchanged. Earlier capacity-backed previews may refer to superseded private fixture credentials; this refreshed port-5190 receipt is the current one. Existing private readiness/expiry safeguards remain.

Private deployment workflow history: GBrain `brain:sessions/2026/09/rat-detective-hosted-capacity-ladder`; current application integration: `brain:sessions/2026/09/rat-detective-audio-integration-main-2026-09-10`.
