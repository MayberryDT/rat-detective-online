# Longer Jurisdiction zones and Ironclad-aware bots — September 13, 2026

Private follow-up to human playtesting. Production remains unchanged.

Jurisdiction zones now last 67.5 active seconds, exactly 50% longer than 45.
The final 10-second warning, 60-point target, scoring, alternating sites and
classic-Tampering suspension remain. Protocol 17 prevents older private clients
from rejecting a timer above their former 45-second validation bound. Stored
shorter remaining durations remain valid and receive the longer timer on rotation.

Shared bot targeting in every assignment excludes protected bodies. Armor
activation cancels an existing body burst immediately; vulnerable opponents
remain targets and armor expiry restores ordinary targeting. Bots continue
objectives and pursue armored carriers, backing away within 10 units when a
supported local step exists. A disarm attempt needs a genuine carried case within
16 units, clear visibility and a position on the exposed case side. Case aiming
keeps existing reaction, tracking and angular error. A bounded sweep against the
authoritative rat silhouette and case shape vetoes direct silver-coat hits before
the case. Opportunistic blind fire pauses around visible protected rats.

The guard does not predict later ricochets or incident shot deflections. Already
fired balls and imperfect case shots may still hit armor. Ironclad's 12-second
reflection, physical case vulnerability, pickups, ordinary combat and navigation
budgets are unchanged.

Validation:

- 117 focused tests passed: all-mode armor avoidance, vulnerable-target selection,
  burst cancellation and expiry, protected carrier spacing, exposed case aiming,
  obstructed case rejection, body/case sweep ordering, timing/rotation, six-zone
  navigation, assignment routes and existing combat behavior.
- Full suite: 1,121 tests (149 Worker, 941 client, 31 script), all passing.
- Typecheck and application build passed; existing large-chunk advisory remains.
- No automated browser input/gameplay test. Human pacing and contested combat
  remain for the requested private playtest.

## Jurisdiction-only hosted preview

- Human URL: `http://127.0.0.1:5198/?room=graybox-benchmark-match-jurisdiction-r5`
- Private Worker: `1716511b-a9b4-40ee-be09-29ca00993e19`, protocol 17.
- Frozen fixture: `d9f7dcca41e69491b313ad0d8b52e4222a63d6ab864e90190f04ece8dfacfcdf`.
- Deployment receipt: `output/hosted-capacity-deployment-2026-09-13T22-55-55-060Z/deployment.json`.
- Temporary authorization expires September 13 at about 7:55 pm Pacific.
- Own relay only: `rat-detective-jurisdiction-preview.service`; normal hosted
  matchmaking/backfill to eight participants, cap 16, Jurisdiction pinned in
  the frozen private copy. Human preview remains audible.
- Passive 12-second observer: all 56 served files exactly match the frozen
  client, protocol 17, Jurisdiction, initial/max population eight, maximum zone
  timer 67,500 ms, 1,826 valid messages, 1,381 movement updates and 196 shots;
  no invalid messages or early closure. The short observation saw no case
  possession/scoring and is not a contested-combat or gameplay-feel test.
- Evidence: `output/zone-ironclad-2026-09-13/hosted-jurisdiction-only.json`,
  with focused/full/typecheck/build logs in the same directory.

No public deployment, Git commit, or unrelated service restart.
