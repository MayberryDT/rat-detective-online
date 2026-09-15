# Active Jurisdiction bots and player settings — September 14

Release update: Tyler accepted the maneuver variant and authorized its [production release](maneuvers-production-2026-09-14.md), including settings and the ten-rat cap. The pre-release measurements and status below are historical.

The hosted density preview below was superseded by the [independent bot experiments and ten-rat candidate](bot-experiments-2026-09-14.md). Historical measurements below remain unchanged.

Implementation following Tyler's accepted
[handoff](../handoffs/jurisdiction-bots-settings-2026-09-14.md). The private preview below is deployed. No public
deployment, Git commit, or human gameplay acceptance is recorded here.
Protocol remains 18. The existing production release is unchanged.

## Bot behavior

`BotZoneHolding` supplies shared, seeded local activity while the genuine-case
carrier is already inside the active scoring zone. Quiet carriers take short
supported steps, scan approaches, pause briefly and occasionally hop. Nearby
visible threats prompt changing strafes while the existing imperfect combat
system supplies aim and firing. Timing and direction vary by bot.

The existing navigation supplies body sweeps and floor support. Zone checks cover
the full short path with a braking margin, including sewer corners and Pump
Station exclusions. A carrier arriving near a boundary can grow its margin by
moving inward. The final composed movement is checked after Hot Pursuit and
counterfeit avoidance. Holding uses bounded local probes and does not submit
additional city path searches. Case loss, death, assignment phase and relocation
reset or replace the holding activity. Carriers keep scoring through the warning.

Physical testing exposed a stale takeoff-contact issue: the hosted controller
cleared additional jump gravity, pushing a hop above the scoring band. The new
zone-hop intent retains that gravity through takeoff. The established traversal
and recovery jump arc remains unchanged; applying the correction to all bot jumps
broke two existing upper-floor routes. Both existing bot adapters handle the new
hop intent; public play continues to use server-owned bots only.

Rules remain 75 active seconds per zone, a 10-second warning, and 60 personal
points to win. Movement and hops do not alter authority, scoring, projectile
physics, Ironclad targeting, normal assignment priorities or launcher routes.

## Settings

One menu serves title, desktop Escape and touch gear access. A native modal keeps
keyboard focus in the menu. Opening clears gameplay input; explicit Resume is
required, and stale firing clicks after unlock are rejected. The match continues
and the menu explains the rat's vulnerability.

See [player settings](../player-settings.md) for controls, defaults, ranges and
migration. The implementation includes independent mouse/touch sensitivity and
vertical inversion, keyboard remapping, master/effects volume, anchored HUD
scaling, reduced interface motion, saving, malformed/unavailable storage fallback
and reset. The current direct camera has no shake/bob setting to switch off; the
optional reduced-motion setting targets existing title/HUD effects.

All effects converge on one context-owned gain bus after their original mix.
This includes Three audio, launcher layers, incident sounds, sirens and legacy
synthesized cues. Music has a separate output controlled by master volume.
Browser audio permission and the muted-agent-preview policy remain intact.

## Verification

- Six deterministic actual-city scenarios run the production
  `ServerBotController` and `ChaosSimulation` for 25 seconds per zone. Each checks
  more than 20 units of physical travel, no stationary interval of three seconds,
  changing facing, actual hops above two units, positions remaining in the zone,
  at least 24.5 seconds of scoring and no recovery callback.
- An eight-rat sewer scenario checks 12 seconds of crowded movement, continued
  carrier scoring, finite poses, combat intent and no recovery. Shot callbacks
  are observed rather than applied as damage in this controlled movement test.
- Focused tests cover missing sewer corners, Pump exclusions, inward boundary
  entry, varied seeded activity, bounded local probes, overhead jump vetoes,
  final trap-avoidance movement, case loss, death and rotation. Existing real
  roof-launcher and upper-floor pickup route tests pass with the traversal arc
  preserved.
- Settings tests cover independent look scaling, persistence/reload/migration,
  malformed and inaccessible storage, reset, key conflicts, dual held bindings,
  menu input gating, title/touch access, explicit resume, leftover-click gating
  and live audio buses. Audio voice tests retain their original gain, spatial
  fade and cleanup checks; shared context buses outlive individual voices.
- Static UI review uses `test/visual/settings-preview.html`, with no game,
  networking, audio or automated gameplay input. Reviewed desktop 1280×900,
  landscape 844×390, and the compact Jurisdiction HUD at 130% scale. Screenshots
  are in `output/jurisdiction-settings-2026-09-14/`.

Final checks: `npm run typecheck`, `npm test` and `npm run build` all pass.
The suite contains **1,204 passing tests**: 158 Worker, 984 client and 62 script
tests. The build retains the existing large-chunk advisory. Relative links in the
updated documents and `git diff --check` pass. The temporary static review server
was stopped after inspection. The later requested gameplay preview is recorded below.
Human bot feel, menu/input behavior in a real browser session, device sensitivity
and phone performance remain for playtesting. Static screenshots and deterministic
checks do not establish those outcomes.

## Prior context

Read the earlier objective-focus decision in GBrain:
`brain:sessions/2026/09/rat-detective-objective-focus-paper-chase-2026-09-13`.
Its quiet-post behavior explains the reported stationary carrier; this local
change supersedes that part. Historical preview URLs and Worker IDs in that page
are not current deployment evidence.

The new GBrain session closeout write returned a transport error; its persistence
could not be confirmed. This repository receipt is the complete local handoff.

## Private hosted preview

Started at Tyler's request on September 14, 2026. The frozen matching client and
private Worker pin the assignment to Jurisdiction. Normal matchmaking fills a
solo session to eight rats with server-owned bots; the cap remains 16. Human
playtest audio is enabled. Production is unchanged.

- URL: <http://127.0.0.1:5198/?room=graybox-benchmark-match-jurisdiction-settings-r1>
- Expires September 14 at 9:10:57 PM Pacific (September 15, 04:10:57 UTC).
- Private Worker version: `59540aa6-e834-4e65-9c88-7369c6b36282`.
- Local service: `rat-detective-jurisdiction-settings-preview.service`.
- Frozen receipt: `output/hosted-capacity-deployment-2026-09-15T00-10-57-192Z/deployment.json`.
- Upstream authenticated health matched the fixture. Served HTML, entry JS and
  CSS matched the frozen files byte for byte. A bounded passive protocol join
  confirmed protocol 18 and eight total rats (one human connection and seven
  server-owned bots). No browser gameplay or input automation was run.

### Scrollbar and pause-layout correction

Tyler's screenshots exposed an unstyled native scrollbar and a narrow Resume
button above a full-width Settings button. The initial visual review missed both.
The September 14 correction adds a thin plum scrollbar, a reserved scroll gutter,
dark native controls and spacing above the fixed footer. Resume and Settings now
share one row with 44-pixel minimum height; Resume uses the existing paper-gold
accent. The pause note only explains the continuing match and vulnerability.

Five static browser screenshots cover desktop settings at the top and bottom,
desktop pause, and both panels at 844×390. Actual rendered metrics confirmed the
scrollbar palette, aligned pause buttons and no horizontal content overflow.
Evidence: `output/jurisdiction-settings-2026-09-14/polish/`. The five existing menu
tests, typecheck and build pass; the unchanged gameplay suite was not rerun for
this presentation correction. No gameplay input automation was used.

The preview at the same URL now uses private Worker
`3213ba68-1a20-47de-b033-bdeaff76406f` and the frozen receipt
`output/hosted-capacity-deployment-2026-09-15T00-21-33-471Z/deployment.json`.
It supersedes the earlier preview and expires at **9:21:33 PM Pacific** on
September 14. Production is unchanged.

Platform references: [scrollbar color](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-color)
and [reserved scroll gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter).
Native scrolling and forced-color overrides remain available.

### Requested full-capacity hosted playtest

Tyler requested a maximum-capacity session: one human plus 15 server-owned bots.
The preview now uses the existing explicit full-lobby fixture (`--bots=16
--cap=16 --full-lobby`), pinned to Jurisdiction. This is a full-capacity playtest,
not the normal eight-participant backfill policy. The simulation and bots run in
the hosted Cloudflare Worker; the local process only serves the frozen client
and relays authenticated network traffic. No local workerd or browser bots run.

- Current link: <http://127.0.0.1:5198/?room=graybox-benchmark-ai-jurisdiction-settings-full-r1>
- Expires September 14, 2026 at **9:25:11 PM Pacific**.
- Private Worker: `8193d172-1d38-451f-9ca3-d6f2d1c47503`.
- Receipt: `output/hosted-capacity-deployment-2026-09-15T00-25-11-366Z/deployment.json`.
- Service: `rat-detective-jurisdiction-settings-preview.service`.

A separate bounded protocol check verified 16 bots before joining and exactly
15 bots plus one human connection after joining, protocol 18 and Jurisdiction.
That check room was cleaned up. The human room was prewarmed with 16 bots, ready
to replace one on join. Source hashes match the previously checked candidate;
served HTML, entry JS and CSS match the frozen files byte for byte. Evidence is
`full-lobby-check.json` beside the receipt. No new application code or production
deployment was made. This establishes the hosted roster, not sustained capacity
or human gameplay acceptance. Human audio remains enabled.

### Twelve-rat density comparison

Tyler found 16 too crowded and requested 12 total for the next playtest. The
private fixture now caps its room at 12, with 12 server bots before entry and
one replaced by the human on join. Production retains its 16-rat cap. The
fixture generator now permits capacities of 12–100 only for the explicit hosted
full-lobby path; ordinary fixture validation keeps its minimum of 16.

- Current link: <http://127.0.0.1:5198/?room=graybox-benchmark-ai-jurisdiction-settings-twelve-r1>
- Expires September 14, 2026 at **9:31:23 PM Pacific**.
- Private Worker: `1e2bb274-a9f8-43b1-b768-50b8ccc0e404`.
- Receipt: `output/hosted-capacity-deployment-2026-09-15T00-31-23-817Z/deployment.json`.

Jurisdiction stays pinned and human audio remains enabled. Seven focused fixture
tests pass, including generation of both 12- and 16-rat rooms and rejection of
smaller ordinary fixtures. Application source and client build are unchanged
from the settings correction. The previous 16-rat preview was stopped and its
room cleaned up before replacing the hosted Worker.

Authenticated hosted health confirmed a 12-rat cap and the exact fixture. A
separate passive join confirmed **11 bots plus one human**, protocol 18 and
Jurisdiction; that check room was cleaned up. The human room is prewarmed with
12 bots. Served HTML, entry JS and CSS match the frozen files. Evidence is
`twelve-rat-check.json` beside the receipt. No gameplay input automation ran.
