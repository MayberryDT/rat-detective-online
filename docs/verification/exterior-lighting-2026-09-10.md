# Grounded exterior lighting fix — September 10, 2026

## Confirmed cause

The preceding 40% authored gain did not fix the actual streetlight failure. `StreetLightPool` required the rat's feet to be at least zero and each pole to be strictly less than nine units above them. At exactly zero, a nine-unit pole failed the second condition; with normal physics contact penetration, the first condition also failed. A small Cannon reproduction settled at **−0.00000628**, disabling the lights. The new regression tests failed at both zero and −.003 before the fix.

The older static lighting fixtures held the rat at .3 above ground and missed this case. Grounded exterior camera reviews now explicitly use **−.003**. Their pre-fix captures confirm all four street spots had zero intensity.

Window glow was also limited to emissive panes and a scenery-only baked atlas. It had no light source that could illuminate a moving rat.

## Changes

- Grounded-foot tolerance keeps street fixtures active at and slightly below pavement height. The underground/rooftop and landmark room/floor restrictions remain.
- Nearby windows, transoms and signs now share the **existing four spotlights** with street poles. Their positions and outward/downward aim belong to the visible fixtures. Exterior selection ranks actual cone/range contribution; wall checks prevent selecting facade spill through blockers toward the local rat. Interior selection stays as before.
- Long alley frontages have spaced workshop panes in the same two fixture batches. Their stronger baked spill stays in the existing **512² / 1 MiB atlas**. The sample peak rises from .05 to .14 before the unchanged 1.4 authored gain; the accumulation clamp rises from .055 to .18. Material lifts remain unchanged.
- Street poles use power **260 × 1.4**, range **24**, angle **.88** and penumbra **.5**. Window/sign spots use power **85 × 1.4**; transoms use **65 × 1.4**, range 18, angle .9, penumbra .5. They produce real directional shading on the rat and nearby surfaces.
- Ambient, hemisphere, moon, exposure, rat materials, sewer lighting, light/shadow counts, physics, camera, network, input and gameplay tuning are unchanged. `readability=off` removes facade spill and its pooled sources; `lighting=classic` retains its existing fallback.

## Verification

**784 tests pass:** 129 Worker, 630 client and 25 script tests. Typecheck and production/visual builds pass. New regression checks cover settled ground height, facade aim, actual live-light selection, wall blocking and underground/roof rejection. Existing four-light limits, interior room/floor selection and resource cleanup remain covered.

Static actual-camera renders compare the same grounded street/alley positions before and after. Street poles now highlight the rat's hat, coat edges and tail; side windows visibly light the coat, case and pavement. The new `windowspill` fixture shows a nearby facade source. Seven final views retain **1,423 bodies, 17 scene lights and two shadow-casting lights**, with zero captured runtime exceptions. Fixture draw calls stay unchanged; the extra batched panes add 10,176 triangles in these renders. Before/after screenshots and scene counts are in ignored `output/exterior-lighting-2026-09-10/`.

These checks do not automate browser gameplay or input. No real-phone frame-rate or human lighting review is claimed. The atlas remains approximate baked scenery lighting; four selected unshadowed spots are a bounded local lighting approximation, not full-city ray-traced illumination.

## Publication

Production release and asset checks are recorded here after deployment.
