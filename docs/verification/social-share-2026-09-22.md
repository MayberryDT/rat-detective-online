# Social sharing image — 22 September 2026

Tyler approved the v9 card and explicitly requested deployment. Production version
`c638c9c8-e823-4037-9520-9b06719ef58d` replaces
`7b3c4b2a-1a75-48b4-b36c-bda91bcb3248`.

## Scope

- Added `public/share-action-v2.png`: the exact approved 1731×909 PNG, without
  resizing or recompression. SHA-256:
  `fc1e5d8f2453fd563bd83a63f27de625a609974f1f8c4a9f28b49c47860e48c7`.
- Open Graph and Twitter image URLs now reference the versioned asset. Image
  dimensions and alt descriptions match the promotional illustration.
- Updated source `index.html` without disturbing its existing unrelated edits.
  The deployed HTML was instead patched from the live baseline, changing only
  image metadata. Unreleased local build changes were excluded.
- Preserved all 57 other existing production assets and exact Worker code.
  Protocol 18, room `public-live-v2`, migrations, bindings and domains remain.
  Client: `index-BL9xcsnh.js` / `createGame-BSxvfOuu.js`.

## Verification

Downloaded the deployed Worker and compared it with a production dry-run bundle:
identical SHA-256 `3d562492c4eb594f5eda6363ce1acc9a0d9fa284d87a9a07762d5fe15ead0dfe`.
Fetched all 58 old live assets and checked against the September 21 receipt.
The isolated deployment reused those assets and the unbundled identical Worker,
with automatic additional-module discovery disabled. Wrangler uploaded exactly
two changed/new assets: `/index.html` and `/share-action-v2.png`.

After deployment, all 59 assets matched the frozen release byte-for-byte.
Both sharing tags point to the new image; it returns `image/png`. Health passes.
Status retained world version 2, seed 341283204, eight bots and an active match.
The old domain redirects the new image path and query to the canonical domain.

Receipts and repeatable HTTP verification:
`output/social-share-production-2026-09-22/{preflight.json,deploy.log,live-verification.json,verify-live.py}`.
Run `python output/social-share-production-2026-09-22/verify-live.py` from the repo
to repeat exact-asset, metadata, content-type, health/status and redirect checks.

No gameplay source changes, gameplay test rerun, browser input automation, Git
commit or GitHub publish. Social platforms may retain cached previews until
they fetch the page again; third-party refresh was not verified.
