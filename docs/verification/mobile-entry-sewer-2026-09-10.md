# Mobile entry and sewer lighting — September 10, 2026

Tyler requested faster entry after tapping Enter City and usable lighting around sewer mouths and inside their descending tunnels, with a production deployment.

## Entry

The old title used a 1.2-second opacity transition and stayed mounted over play for 1.5 seconds. It now hides synchronously when a validated welcome has been fully applied. Transport admission and input readiness remain authoritative.

The default title also constructed a version-1 city, then disposed and rebuilt it as the public version-2 city on welcome. `GET /status` now includes the persisted `{seed, version}`. Before constructing the title's session, the client requests that metadata and generates the correct city once. Enter City then reuses it when the welcome matches. This preparation neither opens a socket nor adds a human or reserves a slot. Explicit private rooms skip canonical preparation; old/unavailable metadata has a bounded 1.5-second fallback and cancellation on page departure. A different assigned overflow world still rebuilds safely from its welcome.

This removes intentional post-join delay and the normal public-city rebuild. It does not promise zero network admission time, and no physical-phone entry timing was measured.

## Sewer illumination

Each of the four entrances has two warm mouth sources and three green utility sources down its descending throat. Existing visible tunnel fixtures now glow clearly. Two small fixtures illuminate the open manhole shaft. These fixed sources join the existing nearest-eight sewer light pool; they are not additional scene lights or shadows.

Selection follows the rat's position and includes the street approach, instead of disabling all sewer lights whenever the shoulder camera is above ground. Upper floors and ordinary streets keep their preceding lighting. The main sewer lamps remain. Portal geometry, collision bodies, ambient fill, street/interior pools, baked alley spill and gameplay tuning are unchanged.

## Validation

- **769 tests pass**: 127 Worker, 617 client, 25 script. Typecheck, production and visual builds pass; dependency audit reports zero vulnerabilities. Existing bundle-size advisories remain.
- Focused coverage verifies public metadata and empty-room behavior, no title join, matching-world reuse, authoritative fallback on a changed world, timeout/cancellation and immediate title dismissal.
- Sewer checks cover every entrance from street approach through the full descent, the manhole, upper-floor exclusion, and the unchanged eight-light/no-new-shadow budget.
- Eight fixed 844×390 shoulder-camera renders cover three mouths, both horizontal throats, the deep south tunnel, manhole approach and Maintenance. Screenshots were inspected with no rendering errors; all retain **1,423 bodies, 17 scene lights and two shadow-casting lights**. These are scene counts, not a phone frame-rate benchmark.
- Browser gameplay input and physical-phone performance remain for human playtests. The requested production deployment is recorded below after release verification.

Evidence is retained under `output/mobile-entry-sewer-2026-09-10/`. The preceding release is [the full accepted game](production-release-2026-09-10.md). Historical sewer-pool context: `brain:sessions/2026/09/rat-detective-steady-landmark-lighting-lowrise-reticle-2026-09-07`; its older ambient/street settings remain superseded by the accepted current baseline.
