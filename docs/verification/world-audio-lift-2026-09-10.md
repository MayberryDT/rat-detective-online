# World audio lift and alley-lighting proposal — September 10, 2026

[Refresh the desktop preview](http://127.0.0.1:5190/?room=graybox-benchmark-ai-sixteen-v20&diagnostics=quiet&lighting=pools&revision=audio-lift-v21). Same 16-rat room, protocol 7 and **September 10, 3:33 PM Pacific** expiry. No phone links or production deployment.

## Audio adjustment

The user found the new distance mix too quiet and asked to bring it up about 50% across the board. The complete world-distance gain is now multiplied by **1.5**, capped at each sound's existing nearby level. For close foley and Dispatch sirens, their extra range attenuation is included before the boost, so those effects also receive the intended increase. The hard range limits remain. Approximate unrestricted gains: full nearby, 37.15% at 50 units, 9.84% at 100, 1.76% at 250 and .66% at 500. This is an audio-gain adjustment, not a measured claim of perceived loudness.

All previously routed world events receive it: guns, rat squeals/deaths, corpse and case impacts, remote case ownership sounds, Popcorn, delayed thuds, case buzz and sirens. Gun base level .30, personal UI/music, voice limits, cadence and physics stay unchanged. The 16-rat cap, neutral case-death scoring and joke bank remain.

## Lighting proposal — not implemented

The user likes the dark city and exaggerated illumination under streetlights, but cannot clearly navigate the darkest alleys. Keep the current low ambient settings, steady authored lamps and four overhead lights.

The game already has a player spotlight in `createStage.ts`, followed and aimed in `GameSession.ts`. Reuse that light as a soft, wide, dim **6–8-metre patch of ground light** immediately around and ahead of the rat, with a subtle cool tone. Fade its contribution down under an existing lamp and back up gradually in darkness. The aim is to reveal the next stretch of ground, wall bases, corners and obstacles while streetlights remain much brighter. Reusing the existing light avoids another light or shadow pass; actual appearance/performance would still need checking. Avoid global exposure compensation or raising city-wide ambient fill, which would reduce the contrast the user likes.

This turn implements only the requested audio change. The lighting approach is a recommendation awaiting the user's direction, not a verified visual improvement. Relevant source: `src/session/createStage.ts`, `src/session/GameSession.ts`, `src/prototype/StreetLightPool.ts`, `src/prototype/Neighborhood.ts`. Prior lighting decision: `brain:sessions/2026/09/rat-detective-tampering-ricochets-reversible-lighting-2026-09-09`.

## Verification and preview receipt

- Focused audio: 37 tests pass. Complete suite: **752 tests** (127 Worker, 600 client, 25 script). Typecheck and both builds pass; existing bundle-size advisory remains. No browser input or automated listening tests.
- Six-second passive check of the updated relay: **190 valid snapshots, zero invalid packets/errors**, 16 total rats. The roster had 14 bots plus the probe and an existing human. Probe disconnected afterward; normal refill remains.
- Served HTML and JS exactly match the frozen client. Asset `/assets/index-B40_XgiR.js`, SHA-256 `78d56400ac29246a8b7720ce91cd927d164fdf0e857eaabad7ca3c0244dc1c36`.
- Backend unchanged: private Worker `45bc9d1f-689f-45cc-98a7-b5aa768cc8fa`, room `graybox-benchmark-ai-sixteen-v20`, actual version-2 world seed `1092212759`. No backend publication or room renaming.
- Frozen client, source hashes, full checks and readiness: `output/world-audio-lift-2026-09-10/`. The desktop relay now uses that directory through `--dist`; the earlier deployment's frozen client is preserved.
- Same desktop service `rat-detective-full-lobby-preview.service`, port 5190. Reload to obtain the updated client. Expiry remains 22:33 UTC / 3:33 PM Pacific.

Prior [16-rat implementation and hosted checks](sixteen-rat-tuning-2026-09-10.md) remain dated evidence. No commit was made; existing working-tree changes were preserved.
