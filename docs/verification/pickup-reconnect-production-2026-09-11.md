# Pickup refinements and reconnect recovery — production release, September 11

Tyler accepted the r8 human preview and explicitly authorized pushing everything
live. All accumulated pickup, bot, launcher, case and reconnect work is committed
and released together.

| Item | Released value |
| --- | --- |
| Canonical game | https://ratdetective.online/ |
| Application commit | `8cd0ec2` — 84 files, pushed from local `main` to established `origin/master` |
| Worker | `rat-detective-preview`, environment `production` |
| Version | `3398a69c-146b-4d99-aa47-e3734664c086` |
| Previous version | `d6d1b1e3-9406-4df6-a3f5-04132652e3c1`, protocol 10 |
| Protocol | **14**, matching client and Worker in one deployment |
| World and room | Version 2, seed **341283204**, `public-live-v2` unchanged |

## Accepted changes

- Clear route-based power-ups: ten Ironclad sites across upper floors, landmark
  roofs and sewer maintenance; four Hot Pursuit sites six units outside sewer
  mouths; four white/green street medkits. Icebox armor is reachable on the rear
  catwalk. Supplies restock after 45 seconds with a filling cheese/fedora symbol.
- Metallic Ironclad body and carry arm, red Hot Pursuit outline/trail, green healing
  wave, distinctive claim sounds and powerful armor clangs. Large illustrated
  effect cards have prominent duration gauges and slapping arrival feedback.
  Ironclad remains 12 seconds, Hot Pursuit 1.45× for 10 seconds, Quick Fix full HP.
- All six launchers fire vertically at 90 units/s with continuous steering and
  matching flight damping: approximately 129 units of clear-flight height. Big
  Cheese reaches maximum size after nine bounces. Ordinary ball tuning remains.
- Bots use visible, nearby, usable pickups without abandoning objectives for
  distant supplies; improved routes, sprinting, interception and shooting activity.
  Existing aim inaccuracy is retained. This does not promise obstruction-free AI.
- Easier genuine-case collection, halved Delayed Reaction delay, 120-ball Planted
  Evidence eruptions matching Improper Disposal within the existing 256-ball cap,
  and prepared entry through hosted production-style matchmaking.
- Thirty-second reconnect reservations retain identity, stats, objective progress,
  authoritative pose and pending respawn state. The case stays held unless lost
  during continuing play. Disconnected rats remain vulnerable. Private tab-local
  credentials support same-tab reload recovery; full-room recovery, expiry and
  old-socket replacement are bounded. Own shots cannot disarm the carried case;
  enemy shots and loose-case impacts still work.

Detailed design and pre-release measurements remain in the
[refinement](pickup-playtest-refinement-2026-09-11.md),
[rewards](pickup-rewards-feedback-2026-09-11.md),
[restock/bots/launchers](restock-bots-launchers-2026-09-11.md),
[comic art/high launches](comic-pickups-high-launch-2026-09-11.md) and
[reconnect](reconnect-case-protection-2026-09-11.md) receipts.

## Release validation

Before release, all **151 source files** and **56 built client files** exactly
matched the approved r8 snapshot. No gameplay source changed after that validation:
**935 tests passed** (137 Worker, 771 client, 27 scripts), typecheck was clean and
build succeeded. The strengthened enlarged-shot fixture also passed its focused
rerun. A fresh dependency audit found **zero vulnerabilities**. The production
deploy command rebuilt successfully; the only build warning is the existing
large JavaScript chunk warning.

The approved hosted reconnect probe retained an earned kill, exact pose and held
case after forced transport termination, returning in 953 ms. Worker tests cover
full 16-human recovery, room eviction, progress/stat preservation, outage death,
respawn deadlines, expiry and old-controller replacement. Human preview acceptance
is recorded; no additional automated browser inputs, phone tests, stress test or
public round reset were performed for release. Agent browser checks remain muted;
human gameplay stays audible and the production sound mix is preserved.

Deployment log: `/tmp/rd-pickup-production-deploy.log`.
Live verification script: `output/production-pickup-release/verify.mjs`.
Sanitized verification result: `output/production-pickup-release/result.json`.
No credentials or raw welcome frames are included in these documentation artifacts.

## Verified production result

All **56 live files** match both the newly built release and Tyler's approved r8
client byte-for-byte. Health returns 200; root sharing metadata remains present.
The old domain returns 301 to the canonical host for both root and an audio asset
path with query parameters preserved.

A bounded passive public observer joined `public-live-v2`: **protocol 14**, **eight
participants**, **18 pickup sites**, and unchanged version-2 world seed **341283204**.
The Icebox upper-floor site matches the reviewed clear-catwalk coordinate. Across
initial and resumed connections, **104 compact snapshots** decoded with **zero
invalid messages**. A forced transport close resumed the same player identity in
**685 ms**. No movement, shooting, objective manipulation or reset was sent to the
public game. After the observer closed and its 30-second reservation expired, the
previously empty room returned to **zero players and zero bots**.

The public check verifies deployment/routing/delivery and same-ID recovery. The
nonzero-stat/case recovery and outage-death scenarios remain covered by the approved
private hosted probe and automated Worker tests, without manipulating public play.
