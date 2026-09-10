# Cartoon HUD and incident sound distance — September 9, 2026

Tyler accepted the preceding optimization, pitched Bad Ammunition and case-bounce pass as feeling much better. Requested distance fading for the remaining world sounds (especially Popcorn), plus a more chaotic cartoon leaderboard and emergency incident card that stays restrained against the dark city.

## Implemented

- Popcorn impacts and Delayed Reaction thuds now receive their world positions and use camera distance in all three dimensions. They share the accepted gun/rat/case-hit curve: full through ten units, 92.5% at 100, and an 80% floor at 250 and beyond. This deliberately retains audible citywide chaos. The accepted recorded Popcorn clips, tiny pitch variation and **400 ms** gameplay timing are unchanged.
- The Evidence Tampering buzz follows the nearest flying case through the same curve, using one loop regardless of the number of cases. Gain changes are smoothed and thresholded, so stationary frames do not accumulate automation events. Deferred sound loading preserves the latest distance. Existing launcher sounds already have distance reduction and directional panning; their mix is preserved. Pickup/loss, death/respawn notices, Dispatch broadcasts and menu cues remain personal/global notifications.
- Delayed Reaction retains its cached PCM buffer. Both incident one-shots explicitly disconnect their output gains on completion and disposal. The ten-voice incident limit and existing gun/rat/feedback pools remain.
- Top-five score slips have crooked ink borders, comic rank badges and a separate larger local record. Rank/name/K-D information and the existing reorder animation remain.
- The incident panel now has an angled emergency tab, ten distinct inline SVG drawings, a short explanation and a prominent countdown. Ready/rolling/active/cooldown states have distinct copy and colors. The roulette/reveal is a dark warning placard with muted hazard stripes and a stamped emergency announcement. Ink outlines, comic lettering and brief arrival/reveal motion supply emphasis instead of bright paper, glow or repeated flashes.
- New incident artwork changes only when the displayed incident changes. Stable labels retain the previous no-rewrite behavior. New arrival animations respect reduced motion. At compact widths, the brief roulette temporarily hides the two corner panels to prevent overlap.
- Bangers is bundled locally under SIL OFL 1.1 with its license and source attribution in `public/fonts/bangers/`. The preview and asset-upload helpers now serve TrueType fonts as `font/ttf`.

## Validation

- Focused audio/HUD tests passed. The full application run passed **553 tests**: 101 Worker, 430 client, 22 script tests. A subsequently added deferred-loading regression passed with the complete eight-test IncidentAudio file; the three relay tests also passed after the font MIME addition.
- Final typecheck and production build passed. The existing large-bundle warning remains.
- Static, input-free HUD screenshots were inspected over the actual dark city at 1280×720, 680×760 and 420×740, covering active Popcorn/Evidence Tampering, ready, rolling and reveal states. No browser gameplay or pointer-lock automation was performed. These visual inspections are not an FPS benchmark or human audio acceptance.
- Served HTML, JavaScript, CSS, font and all four incident clips match the local build byte-for-byte. The font has the correct content type. A separate private protocol connection verified eight total rats and active server AI shooting.
- Existing working-tree changes are preserved. This pass adds no gameplay/server rule changes, Git commit or public deployment.

## Private playtest

http://127.0.0.1:5181/?room=graybox-benchmark-match-cartoon-hud-v8&diagnostics=quiet

Client `index-BsGBWi3T.js` / CSS `index-CGZekSlW.css`, served from the current `dist` by the local relay. The existing private Worker remains **81f32dbd-c4ef-481c-a1e3-5fab0ddb178f**. The fixture expires September 9 at **20:07 Pacific** (September 10 03:07 UTC). Reload to receive the new client. Public production is unchanged.

Source context: `brain:sessions/2026/09/rat-detective-audio-pooling-case-bounce`. This pass is recorded in `brain:sessions/2026/09/rat-detective-cartoon-hud-incident-distance`.

## Human acceptance and Bad Ammunition follow-up

Later September 9, Tyler judged the new UI/audio to feel great. The remaining report was a misleading straight-flying effect during Bad Ammunition, before the real ball travels crookedly.

Cause: the normal client prediction created a ball along the requested aim direction while the server independently selected Bad Ammunition's random launch direction. The first authoritative snapshot removed the guessed ball, making it appear to veer or show two paths. `CheeseGun.setIncident` now suppresses trajectory prediction only during active Bad Ammunition and removes pending predictions on activation. Immediate muzzle animation and pitched shot audio remain; real balls continue to render from server snapshots. Expiry, other incidents and a fresh welcome restore the normal presentation state. No trajectory, RNG, damage, ball physics or networking protocol changes.

Focused projectile/presentation/session checks passed, followed by typecheck, **557 tests** (101 Worker, 434 client, 22 scripts), and build. Regression checks cover no fake ball, immediate muzzle animation, activation cleanup, restoration after expiry and session incident mapping. Existing large-bundle warning remains. No browser gameplay automation. The same private preview URL now serves client **index-CNhacNuC.js**, with unchanged CSS **index-CGZekSlW.css** and private Worker. Served HTML and client bytes match the build; no relay restart or public deployment was needed. Reload the page to test.

Additional prior context: `brain:sessions/2026/09/rat-detective-parked-vehicles-tailor-frontage-leather-case-2026-09-07` records why muzzle-position rewinds were removed; this fix retains current authoritative positions.

## Three-second respawn follow-up

On September 9 Tyler requested a three-second death timer. `RESPAWN_DELAY_MS` is now 3,000 ms, shared by ordinary human and server-bot deaths. The HUD already counts down to the authoritative `respawnAt`, and its initial HTML fallback is now 3. The existing winning-round reset remains six seconds; the separate solo practice harness is unchanged.

The existing Worker combat test now verifies the emitted death deadline is exactly three seconds after a fixed kill time and still checks alarm-driven restoration. Focused combat/persistent-bot checks passed (31 tests), followed by typecheck, the full **557 tests** (101 Worker, 434 client, 22 scripts), and build. Existing bundle-size warning remains. The copied server source hash and three-second constant were checked before refreshing the private fixture. No gameplay/input automation or public deployment.

Updated private preview: http://127.0.0.1:5181/?room=graybox-benchmark-match-three-second-respawn-v9&diagnostics=quiet

Private Worker **0d638447-e7b3-4108-a6e4-8cef2023313b**, client **index-CNhacNuC.js** / CSS **index-CGZekSlW.css**. Fixture expiry is September 9 at **21:01 Pacific** (September 10 04:01 UTC). The exact new fixture health identity was verified before the relay started. This refresh includes all accepted UI/audio and the Bad Ammunition prediction fix. Earlier preview receipts above are historical.
