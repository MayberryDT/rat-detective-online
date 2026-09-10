# Deliberate cartoon foley

Integrated September 10, 2026 into the current game on **`main`**, from the final accepted audio commit **`29620ba`** on **`codex/chaos-foley`**. The source worktree remains at `/home/tyler/Projects/rat-detective-chaos-foley`. The direction is deliberate cartoon physical accents with dark noir menu/result character. Tyler accepted the final 13-cue revision, including the dry countdown and restrained noir victory. Earlier 75-, 20- and 18-cue passes are historical.

Only the final audio delta was applied. The older game snapshot in the audio branch was not imported. The current scoreboard, assignment rules, case respawns, cheese danger colors, rotating jokes, local outline treatment and lighting remain. Original gunshots, rat reactions, feedback and music retain their implementation; the new victory phrase replaces the result cue at the HUD call site. No gameplay tuning changes are part of this integration. See [integration checks](verification/audio-integration-main-2026-09-10.md).

## Retained moments

| Visible action or personal feedback | Accent and trigger |
|---|---|
| Your jump | Short classic platformer hop after successful grounded input in RatController |
| Your heavy landing | Compact thump; actual airborne-to-ground transition with incoming fall faster than 17 units/second |
| Rat hits a wall | Filtered soft body thud with no spring/metal; real side contact above the existing 8-unit threshold |
| Corpse hits the world, is kicked by a shot, or hits a rat | Short impact; world rebounds require speed of at least 16 |
| Loose or weaponized case hits a surface | Two sharp metal clinks; requires speed of at least 12, with distinct floor/wall timbre |
| You reroll your name | Substantial 120 ms clacks and a final 380 ms mechanical stamp |
| Your confirmed hit | Retained dry hit tick; authoritative damage confirmation |
| Your respawn countdown | 550 ms dry wooden clock tock and damped low pulse for each changed positive digit; no bells |
| Match result | 2.1-second muted D-minor jazz sign-off, a small comic horn fall and soft case-closed thock |

The bank now contains **13 clips**, including floor/wall variants. [MotionFoley](../src/audio/MotionFoley.ts) watches only the local heavy landing; [FoleyWorld](../src/audio/FoleyWorld.ts) selects eligible world accents. [The catalog](../src/audio/foleyCatalog.ts) owns volumes and cooldowns.

## What was removed

Grow, charge, split, unstick and kill confirm have no asset, catalog entry or playback hook in this new sound bank. Big Cheese, Crossfire, Ricochet Racket, Delayed Reaction and kill attribution still work as before. Their shared cosmetic annotations remain protocol-compatible and are ignored by the sound selector.

Walking, starting, skidding, turning, ordinary landings, coat flutter, ball/case flybys, ordinary ricochets, extra material layers, flying-corpse beds, case scraping/flutter, autonomous machinery, sewer drips, steam, horns, scenery rattles, reactive dials, machine reset/busy ticks and additional assignment milestone sounds no longer add audio. The new Scattershot layer and all six launcher accents are removed; launcher activation and cooldown tracking no longer emit foley. There are no new ambience loops, enclosure echoes, random playback pitch variations or queued sounds.

## Source clarity and limits

New world cues require a source within the camera frustum and within 16–22 units, depending on the cue. Up to three rays against the authored shoulder-camera blockers reject hidden sources every 160 ms. This is bounded static occlusion, not a complete acoustic simulation. A snapshot selects at most one nearby visible accent; no candidate is retained for later playback. Quiet impacts are ignored, and per-cue/per-source cooldowns limit repeated contacts.

[FoleyAudio](../src/audio/FoleyAudio.ts) positions each world sound left/right relative to the camera and attenuates it quadratically after six units to silence at its radius. Personal feedback stays centered. Eight reusable voices and stereo panners are available, with at most three simultaneous world voices and one world onset every 160 ms. Personal cues can use the remaining capacity. The bank ranges from 75 ms to the 2.1-second noir victory phrase. The approved final name stamp stops rolling ticks. Victory stops other new voices and excludes duplicate/new cues until its phrase ends. Its runtime gain is .43, reduced from .78 in the rejected fanfare; countdown gain is .30. None are queued. At most four assets decode concurrently. Hidden/disconnected sessions stop this bus, and reset/disposal clears its history and outputs.

The cosmetic simulation annotations are additive optional fields in the current protocol **5** and inside the existing 64-impact budget (at most 16 extra audio-only events use spare space). Most ordinary annotations are now ignored by this client. Original visual events retain priority, and audio-only events produce no particles. Use matching client/server builds for preview: an older client does not understand the audio-only particle suppression field.

## Assets and verification

[The generator](../scripts/generate-chaos-foley.py) edits retained CC0 impact, spring and classic jump sources plus original offline muted horn, damped bass and soft brush synthesis. It creates 239,372 bytes of mono 24 kHz/16-bit WAVs. [Provenance](../public/sounds/chaos/README.md) and [measurements](../public/sounds/chaos/manifest.json) accompany the bank. Removed clips are kept only in ignored `output/rejected-foley-assets/`; they are not built or downloaded.

Checks cover silence for incidental/distant/hidden/weak events, bounded visibility work, stereo direction, voice/loading bounds, cleanup, snapshot deduplication, real simulation contacts, protocol validation, local heavy landings at 30/60/120 Hz, and HUD transitions. All 13 WAVs and the catalog are byte-identical to the accepted source commit. The audio worktree received human acceptance; this integration has not had new multiplayer gameplay or listening review. No browser gameplay/input automation was used. See the [latest noir revision](verification/foley-noir-2026-09-10.md), [historical payoff revision](verification/foley-payoffs-2026-09-10.md), [prior replacement receipt](verification/foley-replacements-2026-09-10.md), [prior deliberate-mix receipt](verification/foley-deliberate-2026-09-10.md) and [historical first pass](verification/chaos-foley-2026-09-10.md).
