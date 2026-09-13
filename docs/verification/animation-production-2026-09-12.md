# Accepted animations and gameplay follow-ups released — September 12, 2026

Tyler accepted the corrected private gameplay preview and explicitly requested
everything committed and pushed live. Application commit **`32bcf72`** includes
all pending animation source, studio studies, tests, linked research, handoffs and
explosion/case fixes. The previously committed **`69f3e70`** coat seam, pickup
feedback and Quick Fix junction changes are also included. Both were pushed from
local `main` to the established `origin/master` upstream, without force or reset.

## Production

- Canonical game: https://ratdetective.online/.
- Worker `rat-detective-preview`, environment `production`.
- Version **`2a470c22-424d-4bbf-823f-2dbb19c7c4cc`**, application **`32bcf72`**.
- Predecessor **`21f6b8c1-4770-4691-92fa-71b5096f8a7b`**, confirmed from live
  deployment history before release.
- Protocol **15**, matching client and Worker published together. Reload existing
  game tabs for the new client.
- Preserved `public-live-v2`, Durable Object namespaces/migrations, persisted
  world seed341283204/version2, eight-participant backfill and the16-rat cap.

The accepted animation set adds exaggerated secondary character reactions while
preserving the accepted model and immediate controls. Planted Evidence and
Improper Disposal explosive cheese can hurt its initiator without self-kill or
assignment credit; ordinary shots remain self-safe and Ironclad still reflects.
Obsolete pickup predictions clear at ownership/delivery/reset/round/epoch changes
and cannot reattach on cancelled late acknowledgements. See the
[implementation and investigation](explosion-delivery-2026-09-12.md),
[character studies](character-reactions-studio-2026-09-12.md) and
[junction refinements](quick-fix-junctions-2026-09-12.md).

## Validation

All **158 application source hashes** matched the tested private preview approved
by Tyler before committing and deploying. The unchanged application retains its
**1,019 passing tests** (142 Worker,850 client,27 scripts), typecheck and visual
build. A fresh production application build passed through the normal deployment
script; a fresh dependency audit found **zero vulnerabilities**. The existing
client chunk-size advisory remains. Documentation links and diff whitespace pass.

Live verification matched **all56 client assets byte-for-byte** against both the
local release build and frozen approved preview. Health, static sharing metadata
and canonical redirects passed, including a path/query on the old domain.
A bounded passive public observer received protocol15, eight participants,
18 pickup sites, the correct four junction medkits and the selected palette
highlight. Same-ID reconnect completed in **828ms**. **99 compact snapshots**
decoded with **zero invalid messages**. The initially empty public room returned
to zero players/bots after the30-second reconnect reservation, with the world
identity unchanged. No public movement, shot, objective manipulation, forced
round reset or browser gameplay automation was used.

The original report of a one-delivery win was not reproduced. Tests verify
relocation after scores one/two and a win at three through the real compact
decoder and accepted animation renderer. Tyler accepted the corrected preview
and authorized release after that uncertainty was reported; acceptance does not
provide a trace of the original incident or establish its exact cause.

Build/deployment and sanitized live evidence:
`output/animation-production-2026-09-12/`. The existing private preview remains
available until its recorded expiry; it is independent of production uptime.
