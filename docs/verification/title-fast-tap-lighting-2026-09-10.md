# Fast title, tap fire and brighter lights — September 10, 2026

## Changes

- The logo, rat name, name roll and Enter City controls now load before the 3D engine. The entry script is **8,569 bytes**, down from 1,001,511; the displayed logo is **41,686 bytes**, down from 1,122,917. The small local title font is preloaded; optional remote fonts no longer block rendering. Title music streams independently and retries on allowed gestures when autoplay is blocked.
- City generation yields between batches while names remain usable. The persisted public world and world/character shaders prepare behind the title. The prepared backdrop stays static until entry. An early Enter click queues the selected name with immediate button feedback; an accepted matching welcome needs no city rebuild or title fade.
- A title connection opens without sending a join, creating a participant, reserving a player slot or allocating overflow. It expires after 25 seconds locally / 30 seconds server-side, is capped at sixteen pending title sockets, and cannot displace existing reservations. Normal matchmaking remains the fallback for full rooms, private rooms, expired preparation and failed connections.
- Mobile FIRE produces one shot on a valid tap. Holding and dragging cannot repeat; drag-to-aim, independent fingers, immediate pointer-down firing, cancellation and the existing 85 ms rapid-tap bound remain.
- Existing authored lights, baked window/door/sign spill and fixture/window glow use a **1.4 brightness multiplier**. Rat material color lift is **1.16** with **.28 emissive intensity**, previously 1.10 / .22. Ambient, hemisphere, moon, exposure, lamp positions/ranges, live light counts and shadow maps are unchanged.
- The full scoreboard has no AI/PLAYER badges or bot count. Names, the local YOU marker, mode ranking and all actual statistics remain.

## Checks and limits

**781 tests passed:** 129 Worker, 627 client and 25 script tests. Typecheck and production/visual builds pass; production dependency audit reports zero vulnerabilities. Focused coverage includes independent title controls and selected-name handoff, prepared-socket lifecycle/fallback, no reservation or overflow on preparation, reservation protection, incremental city equivalence/abort cleanup, single-tap shooting through the real session frame path, scoreboard labels and light selection.

Passive cold title loads used the production build, gzip, an isolated metadata fixture and a silent socket. No browser inputs or gameplay were automated.

| Passive desktop Chromium profile | Title controls ready | First contentful paint | City/session prepared |
| --- | ---: | ---: | ---: |
| Local connection/normal CPU | 36.5 ms | 48 ms | 1.35 s |
| 4× CPU slowdown, 80 ms latency, 3 Mbps download | 266.9 ms | 360 ms | 4.32 s |

These are synthetic desktop measurements, not real-phone entry timings. Native rendering still produced a roughly 2.9-second post-preparation long task in headless Chromium; the CPU profile attributed the corresponding earlier task to native program work, not a confirmed application function. Cold engine downloads, shader/driver work, overflow and metadata fallback can exceed one second. The changes move preparation ahead of the click; they do **not** establish a universal sub-second entry guarantee.

Five fixed-camera visual reviews cover street lamps, a doorway, upstairs Records, a descending sewer throat and the scoreboard. All retained **1,423 physics bodies, 17 scene lights and two shadow-casting lights**, with no captured runtime exceptions. These are static renders, not human gameplay or phone frame-rate certification.

Local receipts/scripts are in ignored `output/title-fast-tap-lighting-2026-09-10/`. Deployment verification follows.


## Published release

- Application commit **`80fcd642bf66531c0a1db2796e6037255b961a16`**, pushed to `origin/master`.
- Worker **`rat-detective-preview`**, environment **production**, version **`ae032bb2-01f2-4baa-b09f-e9033b41141e`**, replacing **`ebe0f20e-3f68-46a9-b175-1929faf2c436`**. No room/namespace/domain/migration changes.
- All **51** published files match local build bytes. Initial propagation returned the older HTML fallback for a new chunk; a subsequent complete check passed. Canonical health, social image/metadata, credits and old-host path/query redirects pass.
- Main title chunk **`index-C_gej0MS.js`**; deferred engine **`createGame-CmVndpZr.js`**.
- One bounded passive public observation opened its socket in **267 ms**, remained silent without joining, then received its welcome **142 ms after sending the join**. This measures protocol admission after preparation, not browser render or phone tap-to-play latency.
- The existing round had one human and seven AI both before and after title-only preparation. After joining: two humans and six AI, **240 valid snapshots**, **251 movement packets**, zero invalid packets/errors, version 2 / seed **341283204**, Closing Time assignment. After observer cleanup the existing human remained; normal ten-second bot refill grace applies. No round reset was forced.
- Separate named-room combat smoke passed protocol-7 join, movement, shot, damage, death, scoring, respawn and departure. No automated gameplay input or real-phone performance test was run. The temporary static-render server was stopped.
