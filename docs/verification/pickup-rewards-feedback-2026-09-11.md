# Pickup rewards and feedback — September 11, 2026

**Later release status:** Tyler accepted r8 and authorized production release.
Application `8cd0ec2`, Worker `3398a69c-146b-4d99-aa47-e3734664c086`, protocol 14.
See the [production receipt](pickup-reconnect-production-2026-09-11.md).
The private/review-pending statements below describe the original verification pass.

## Scope and status

Tyler accepted Hot Pursuit's visual/movement feel and improved genuine-case
collection, then requested the changes below. Those accepted mechanics are
preserved. Working tree and private hosted preview only; no commit or production
release. Human acceptance of the new art, sound and route usefulness is pending.
The preceding measurements remain in [the earlier receipt](pickup-playtest-refinement-2026-09-11.md).

## Changes

- Quick Fix is a bright white medical box with dark edging and a green plus on
  both faces. No red, and no crossed-bandage symbol. Healing retains its green
  flash and rising wave.
- Claim notifications are large charcoal comic cards in the bottom center, above
  the persistent buff timers. The card lands with a brief exaggerated slap, stays
  3.2 seconds, and respects reduced-motion preferences. Mobile uses smaller cards.
- Five original, deterministic foley files: armor fitting, speed rush, medkit
  click/snap, card slap, and a separate heavy armor clang. Reproduce them with
  `python3 scripts/generate-pickup-sounds.py`; no third-party samples/dependencies.
  All are 48 kHz mono WAV, 0.22–0.62 s, normalized to about -1.3 dB peak. Existing
  bounded feedback voices and world attenuation remain; personal claims stay local.
  Armor contact has a 75 ms sound cooldown and never uses suitcase clanks.
- Ironclad gains a 280 ms transition into metallic silver and a 420 ms rising
  application wave. Hot Pursuit gets a red application wave while its accepted
  outline and trail remain. These effects are depth-tested, bounded and cleaned
  on death/reset/disposal.
- The case-holding arm previously created its own mismatched coat and skin. It
  now borrows the original rig materials, sharing their color, emissive lighting,
  hit flashes and Ironclad. Removing the grip disposes its owned geometry only.
- Server bot priorities now put available, usable supplies before loose cases,
  carriers, combat and delivery. Carriers can detour; active buffs can refresh.
  Full-health bots leave medkits alone. Existing shared navigation, bounded work
  and failed-target suppression remain. No movement/physics tuning changed.

## Authored sites

Eighteen sites total. Ironclad's larger count follows Tyler's final explicit rule
for every second floor and rooftop, plus Maintenance; it is removed from open
streets. Gate has no second-floor interior, but its bridge roof gets a reward.

| Kind | Site | Position x / feet y / z |
| --- | --- | --- |
| Ironclad | Records Hall second floor | -16 / 8 / -47 |
| Ironclad | Icebox second-floor balcony | 117 / 8 / -73 |
| Ironclad | Needleworks second floor | -105 / 8 / 96 |
| Ironclad | Pumping Station second-floor catwalk | 144 / 8 / 118 |
| Ironclad | Records Hall roof | -16 / 36 / -43 |
| Ironclad | Icebox roof | 130 / 36 / -42 |
| Ironclad | Needleworks roof | -105 / 36 / 98 |
| Ironclad | Pumping Station roof | 125 / 36 / 130 |
| Ironclad | Gate bridge roof | -137 / 29 / 0 |
| Ironclad | Sewer maintenance | 64 / -7 / -37 |
| Hot Pursuit | Gate tunnel mouth | -139 / 0 / 0 |
| Hot Pursuit | Icebox tunnel mouth | 139 / 0 / 0 |
| Hot Pursuit | Alley tunnel mouth | 0 / 0 / 139 |
| Hot Pursuit | Needleworks tunnel mouth | -54 / 0 / 67 |
| Quick Fix | Records west street | -52 / 0 / -68 |
| Quick Fix | Needleworks east street | -60 / 0 / 100 |
| Quick Fix | East cross street | 84 / 0 / 60 |
| Quick Fix | Gate approach street | -100 / 0 / -28 |

Street coordinates are the resolved positions in seed 341283204/version 2;
medkits still snap to each seeded city's clear pavement. Elevated/sewer sites
stay on their authored floor, searching at most a two-unit patch for support and
body clearance. They never fall back to a street below. Site support, clearance,
unique IDs, height-sensitive collection and the 10/4/4 distribution are tested.
The normal 20-second respawn, 12-second Ironclad, 10-second/1.45× Hot Pursuit,
full normal health, atomic claims and refresh-not-stack behavior are unchanged.

## Compatibility and verification

Protocol **11** is required for the expanded site IDs and `armor-clang` impact cue.
Validation and compact delivery retain their finite bounds; client and Worker must
be refreshed together. The previous production application remains protocol 10.

Focused tests verify real server bots physically collecting an upper-floor coat,
a tunnel-mouth speed pickup and a street medkit through actual city geometry.
Assignment navigation tests isolate delivery with supplies unavailable, matching
the new explicit priority rule. Armor reflection retains neutral/no-self-damage
rules; a test verifies its distinct impact cue round-trips validation.

A muted static art inspection showed the white/green medkit, large card and matching
silver carry arm. This is not a gameplay or audio-listening acceptance claim.
The audio assets were checked for format, finite duration and nonzero bounded peaks;
subjective sound quality remains for Tyler's audible playtest.

Final verification: **911 tests** (134 Worker, 751 client, 26 scripts), typecheck
and build pass. The existing >500 kB bundle warning remains. `git diff --check`
and modified documentation links pass. No new dependencies or game audio mix
retuning were introduced.

## Current audible hosted preview

<http://127.0.0.1:5193/?room=graybox-benchmark-match-pickups-r5>

- Frozen matching client, hosted Cloudflare authority, normal server-owned bot
  backfill: one human plus seven bots, 16-rat cap, empty rooms sleep. No browser
  bots, local workerd, full-lobby override or checkpoint changes.
- Private Worker `fa2709c3-dbb1-40c2-aad7-9b5db5475246`, protocol **11**.
- Expires **September 12, 2026 at 1:10 AM Pacific** (08:10:55 UTC).
- Deployment receipt:
  `output/hosted-capacity-deployment-2026-09-12T04-10-55-908Z/deployment.json`.
- Relay process at launch: 332188. Human URL has no mute flag. Agent browser
  testing must remain separately muted; no user/browser/system audio was changed.

A 35-second protocol check in a separate normal private pool observed eight
participants, all seven server bots moving, 18 sites, and 1,012 valid compact
snapshots with zero decoder errors. Two bots acquired Hot Pursuit, including
refreshed/new deadlines; no healing was observed in that short hosted sample.
Ironclad/health physical collection is covered by the real-city controller tests.
All 56 served files matched the frozen client and current build. The room was
empty before entry and slept with zero bots after the observer left. Prepared
join-to-welcome was 166 ms; this is not browser click-to-control or cold-load time.
Snapshot gap p95 was 103 ms, maximum 780 ms. No frame-rate or smoothness guarantee.
Evidence: `output/pickup-refinement/rewards-hosted-check.json`.

Production remains untouched. Tyler should evaluate pickup sound character,
application/card impact and the usefulness of the new routes in this preview.
