# Steady streetlamps and aligned facade light — September 10, 2026

Local correction following Tyler's two gameplay screenshots. **Not committed or deployed to production.** A subsequently requested private full-game preview is recorded below. Production remains Worker `d5fc60bf-78a8-44e2-821b-f7c794233e68`, application `cd7af57`, protocol 7, `public-live-v2`.

## Confirmed problems and changes

- The four nearby fixture spots also illuminated static scenery. Reassigning them as the rat moved changed pavement and building shading. Owned scenery materials now exclude selected exterior spots by their view-space source positions, preserving the flashlight and interior lights. All street poles have steady baked pavement contribution in the existing atlas; their decorative pools and shafts remain. Lantern emission no longer has the old timed flicker.
- `sewerLightingActive` treated any negative foot height as underground. Settled feet at −.003 consequently enabled all eight nearest sewer lights even on unrelated streets, creating stray green light on walls. The underground threshold is now −.5; authored entrance/manhole approaches still activate the pool, including at ground-contact height.
- The old two-dimensional spill atlas was projected up walls and obstacles. It now contributes only to upward pavement surfaces near ground height. Its footprint lands down and outward from each fixture, instead of peaking at the wall's base. Existing restrained surface-material lifts remain.
- Actual apartment window emission now supplies facade apertures from the same texture UVs and skyline masses as the visible panes. Apertures account for lowered blinds, occupancy boundaries, door surrounds and facade trim. Dark rooms cast no beam. The shared occupancy uniforms also drive a small texture used by fixed beam geometry and window pavement footprints; no full-city atlas is regenerated each frame.
- Rectangular shafts aim outward/downward, fade softly and stop before authored three-dimensional blockers. Doorway transoms sit against the entrance beneath its canopy. The two existing fixture instance batches remain. Beam geometry is batched by city cell. Splitting a pane around trim divides its actor-light power rather than multiplying it.

The four actor spots, eight sewer points and shadow counts are unchanged. Street pole power 260/range 24/angle .88, shared authored gain 1.4, rat materials, ambient, hemisphere, moon, exposure, collision geometry, camera, controls, physics and networking remain. `readability=off` disables the facade additions; `lighting=classic` retains the previous illumination mode. Ground-contact classification and steady lantern emission remain corrected in either mode.

## Validation

**792 tests pass**: 129 Worker, 638 client and 25 script tests. Typecheck, production build and visual build pass. The expanded 35-second lantern-emission regression also passes in a final focused nine-test city run. Existing bundle-size notices remain.

Regression coverage includes room occupancy and dark windows, UV-to-wall mapping on all four faces, setback floors, opaque trim, conserved split-pane power, downward clipping, ground-foot tolerance, material composition, light limits and resource disposal. An initial unbounded clipping implementation caused test timeouts; the final version clips during existing per-building preparation, uses local blocker sets and skips unused aperture work in the legacy city.

Nine final 1280×720 fixed shoulder-camera renders cover streetlight, window alley, doorway, corner, closer window spill, Records upper floor, sewer throat, and two distant-light-selection comparisons. All retain **1,423 bodies, 17 scene lights and two shadow casters**, with zero captured rendering exceptions. Ordinary grounded street views have zero active sewer lights; the sewer throat retains eight.

The streetlight and window-alley comparisons hold the camera, world and rat pose fixed while changing only the selection anchor to a remote street location. Excluding the visible rat and case rectangles, **zero scenery pixels change by more than one channel value** in either pair. This checks the reported switching effect independently from moving-camera differences. The rat and case shading changes as expected. Earlier comparisons exposed the sewer-height bug, which was fixed before the final captures.

Relative to the preceding release's seven camera fixtures, the shafts/footprints add approximately 35,500–69,900 submitted triangles and 16–30 main-pass draw calls, plus one occupancy texture. The atlas remains 512² / 1 MiB. These are rendering counters, not a real-phone performance measurement. Static shaft clipping and street-plane footprints remain an approximation; human movement/appearance review is pending. No automated gameplay/input, network load test or production join was performed.

Ignored screenshots, scene counters and pixel-comparison results are under `output/steady-fixture-lighting-2026-09-10/`. The fixture supports `still` for one rendered frame and `farLights` for the fixed-camera selection comparison. Temporary capture processes are stopped at closeout.

Prior evidence: [grounded exterior lighting receipt](exterior-lighting-2026-09-10.md) and GBrain `brain:sessions/2026/09/rat-detective-grounded-exterior-lighting-2026-09-10`. That receipt's static rat shading did not test scenery invariance as lights were reassigned or reject sewer activation at slightly negative grounded height.

## Requested full-game preview

[Play the lighting preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-steady-lighting-v27&diagnostics=quiet&lighting=pools). Requested after implementation closeout. Expires **September 10, 2026 at 9:27 PM Pacific** (September 11 at 04:27 UTC).

The existing dedicated private capacity Worker was renewed for four hours with 16 total rats, full-lobby bot replacement and the latest frozen client. Private version `93c21ddf-9ff5-4e07-8e5b-ef32ccabe1b2`, protocol 7, room `graybox-benchmark-ai-steady-lighting-v27`, world 2 / seed 699489731. Desktop relay `rat-detective-steady-lighting-preview.service` listens only on loopback port 5190 and closes at expiry. Production and phone relays remain unchanged.

All **51 served files** match the frozen build. One six-second passive connection saw 16 rats (15 bots plus probe) and **162 valid snapshots, zero invalid packets or errors**; it disconnected afterward. This confirms full-game asset/protocol readiness, not human input or appearance acceptance. Earlier application test/build results apply to this unchanged source.

Deployment receipt: `output/hosted-capacity-deployment-2026-09-11T00-27-06-277Z/deployment.json`. Preview and readiness records: `output/steady-fixture-lighting-2026-09-10/preview.json` and `readiness.json`. Entry asset `index-ClzQcK4D.js`; deferred game asset `createGame-Ci5pt2sL.js`.
