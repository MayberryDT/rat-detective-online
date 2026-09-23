# Full source release — 22 September 2026

Tyler explicitly requested committing all pending project changes and deploying
the current build after the image-only release left retired branding live.

## Cause and scope

The previous task had removed the title-screen kicker, roulette footer branding
and idle Dispatch label in local source. The image-only deployment preserved
production HTML and JavaScript, so all three old strings stayed live. This was
a release-scope error, not merely a browser cache issue.

The release includes all pending project source, tests, documentation, research,
design assets and the approved sharing image. Python caches, the generated
native-preview archive, existing ignored builds/output and the extension's
private development key remain excluded. A pattern scan of 227 changed/new
project files found no potential secret matches; this is not a security audit.

No gameplay behavior was newly edited in this task. The rebuilt Worker remains
byte-identical to production. The fresh client includes the existing branding
removal and keeps the approved sharing image. Previous uncommitted work includes
the shipped roster/case/highlights/resize changes and companion improvements.

## Validation

- `npm run typecheck` and `npm run build` pass.
- Initial `npm test` stopped at one randomized Worker roster-count assertion
  in matchmaking (expected six bots, observed eight). With no code change,
  the full Worker rerun passes all 174 tests.
- The separately completed client suite passes all 1,182 tests.
- All 123 script tests and 24 plugin tests pass.
- Built HTML, JavaScript and CSS contain no retired department slogan.
- The approved PNG is byte-identical. All 59 built assets have recorded hashes.
- Worker production dry-run passes and its bundle matches the previous live
  Worker exactly: `3d562492c4eb594f5eda6363ce1acc9a0d9fa284d87a9a07762d5fe15ead0dfe`.

Logs and deployment verification live in
`output/full-source-release-2026-09-22/`. `branding-before.json` records the three
live occurrences before release. `verify-live.py` checks every release asset
over HTTP, absence of the phrase throughout built text assets, the new sharing
image, health, room/world identity, population bounds and the old-domain redirect.
Run `python output/full-source-release-2026-09-22/verify-live.py` to repeat it.

No automated gameplay/input test, native desktop install, plugin marketplace
release or GitHub push is part of this release. Existing open game tabs need a
reload to load the new hashed client. Deployment and final live results are recorded below.


## Deployed and verified

Source commit: `217fbb883cb1587277e82af68c68399cf2e48a01` (228 files).
Production Worker: `ed58154d-d1ee-49be-8a49-7bb00729c72f`.
Predecessor: `c638c9c8-e823-4037-9520-9b06719ef58d`.
Client: `index-DWOYPCZx.js` / `createGame-mVhFCH8i.js`; protocol remains 18.

Deployed with `npx wrangler deploy --env production` from the committed working
copy and the checked build. Wrangler uploaded five changed assets. All 59 live
assets match the recorded build hashes. The retired phrase is absent from every
built HTML/JavaScript/CSS asset, including the title and Dispatch code. Sharing
metadata still points to the exact approved PNG. Health, old-domain redirect,
original world version/seed and active eight-bot canonical city passed.

The source commit is local; no GitHub push was requested or performed. The
following documentation-only receipt commit does not change the deployed build.
