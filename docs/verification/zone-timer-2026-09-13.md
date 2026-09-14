# Standalone Jurisdiction countdown — September 13, 2026

Tyler accepted the previous playtest and requested 75-second zones and a more
obvious relocation timer outside the score card. Private follow-up only.

Zones now last 75 active seconds. Scoring still targets 60 personal points, and
the warning remains the final 10 seconds. Protocol 18 coordinates the expanded
validation bound; shorter stored remaining times stay valid until rotation.

The countdown is a separate top-center HUD element with large cream lettering,
a small “ZONE MOVES IN” label and amber in the final 10 seconds. It uses 64px
numerals on desktop and 44px in compact layouts. Roulette/briefing panels sit
below it. Guidance includes its visible bounds when finding clear screen space.
Briefing reads “ZONE DURATION”; classic suspension reads “ZONE TIMER PAUSED”.
The timer hides on assignment removal, another mode or a closed round. Location,
next-zone notice and score rankings stay in the card. Ironclad-aware bots remain
as accepted in the preceding playtest.

Static art review (no gameplay, input automation or network): inspected 1280×720
normal and roulette, 900×500 touch/sewer roulette, and 700×370 touch/interior
roulette. All four show the countdown clearly above roulette, with visible score
and destination guidance and no horizontal page overflow. Captures and geometry
are in `output/zone-timer-2026-09-13/screenshots/`.

Validation: 47 focused tests, typecheck, application build and visual build
passed. The full suite passed all 1,121 tests (149 Worker, 941 client, 31 script)
on the final run. The first concurrent run failed the existing real-city
`aiLiveDiagnostic` pursuit-distance assertion; it passed alone and in the complete
rerun after capture/build jobs finished. No navigation code was changed for this
follow-up. The planner uses a wall-clock work budget, so scheduling sensitivity
remains a possible explanation rather than a proven cause. Existing build chunk
size advisory remains. Logs are in `output/zone-timer-2026-09-13/`.

## Jurisdiction-only preview

- Human URL: `http://127.0.0.1:5198/?room=graybox-benchmark-match-jurisdiction-r6`.
- Private Worker `901f7f5d-1b9d-4a14-8554-9db7a387bfef`, protocol 18.
- Fixture `193e4752dbbdddf421f1230a42b3d72cea10043c7e9c486b17acb279b811516b`.
- Deployment receipt `output/hosted-capacity-deployment-2026-09-13T23-21-09-670Z/deployment.json`.
- Expires about September 13 at 8:21 pm Pacific. Own relay service only:
  `rat-detective-jurisdiction-preview.service`.
- Frozen matching client/hosted Worker, normal server-owned bot backfill to eight
  participants, cap 16, Jurisdiction pinned in the private frozen copy.
  Human preview is audible. No public deployment or Git commit.

Passive 12-second hosted check passed: 56 exact matching client files, protocol
18, Jurisdiction, 75,000 ms maximum timer, eight participants, 2,016 valid messages,
1,535 movement updates and 156 shots. A bot took the case; no zone scoring occurred
in the short observation. No invalid messages or early closure. This verifies
hosted configuration and delivery, not human pacing or contested gameplay.
Evidence: `output/zone-timer-2026-09-13/hosted-jurisdiction-only.json`.
