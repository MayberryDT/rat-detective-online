# Paper Chase, bot priorities and persistent guidance — September 13, 2026

Tyler requested the delivery-mode rename, stronger bot objective focus in every
mode, and direction guidance that remains visible during roulette. This follow-up
builds on the [private Jurisdiction implementation](jurisdiction-2026-09-13.md).

## Changes

The displayed title is **PAPER CHASE** and its rule is “Deliver the paperwork.
First to three wins.” The `chain-of-custody` identifier and three-delivery scoring
remain unchanged for snapshots, stored rounds and existing clients' mode selectors.

During active assignments, bots pursue the loose case or carrier, deliver
paperwork, defend Jurisdiction, or survive/fight according to the current mode.
Supplies remain part of play, with these priority changes:

- Useful visible, current-floor pickups can interrupt for up to 2.2 seconds when
  within 12 units and adding at most five units to the route. Fresh detours are
  spaced eight seconds apart. Failure suppression still applies.
- A case within eight units takes priority. A rat at one health may take a visible
  medkit within six units as an emergency exception.
- Buffs with over two seconds remaining do not cause optional refresh detours.
  Ordinary pickup effects, refresh semantics and restock deadlines are unchanged.
- Longer mapped armor routes remain available between objectives. They yield when
  a living carrier or an available case gives the bot assignment work.
- Failed assignment routes retry after four seconds instead of spending twelve
  seconds on other activities. Shared planner budgets, geometry checks and
  progress-based recovery remain unchanged.

Jurisdiction carriers inside the active footprint keep scoring throughout the
warning. Outside carriers can still rotate early when travel time warrants it.
Quiet defenders hold supported posts; nearby threats can prompt a post change.
Pursuers favor the current scoring carrier over camping the next zone. Flanking
approaches must be short and use the existing sewer travel legs. Closing Time
carriers can take a checked local escape when no mapped patrol post is nearby.
Bots continue firing while following objectives, with the same aim and shot rules.

This supersedes the older unconditional pickup-first rule. It does not remove
combat, incidental Dispatch activation, pickups, exploration or vertical routes.

Direction guidance no longer has roulette/briefing/case-broadcast hiding rules.
Its placement avoids the aim area and live HUD rectangles, staying on screen and
showing a directional arrow when displaced from the projected destination. DOM
bounds are sampled at most once per 150 milliseconds. The held-Tab scoreboard can
still intentionally hide the gameplay HUD.

## Verification and limits

Focused tests cover objective pursuit with opportunistic firing in all four
modes, useful pickups and return deadlines, emergency healing, armor-trip priority,
quiet Jurisdiction defence through warnings, carrier pursuit, and Closing Time
escape behavior. Existing real-physics delivery and all-six-zone route tests now
leave supplies enabled. The crowded central-street-to-sewer test remains enabled.

All **1,111 tests passed**: 149 Worker, 931 client and 31 script checks. Typecheck,
application build and visual build passed; the existing large-chunk advisory
remains. The first full run exposed five older DOM mocks missing the new layout
measurement method; the mocks were updated and the complete suite passed again.
Whitespace and edited documentation links were checked.

Five muted static screenshots cover Paper Chase and Jurisdiction during roulette
at 1280×720 and 900×500, plus Jurisdiction at 700×370. Guidance stayed visible,
inside the viewport and clear of roulette in all five. The smallest screenshot
also contains fixture-only bottom buttons, which are not part of gameplay.
These are not gameplay-input tests or claims about phone performance. Artifacts
are under `output/objective-focus-2026-09-13/`.

## Private preview

**Latest preview, at Tyler's request:**
[Jurisdiction only, with all objective-focus and guidance fixes](http://127.0.0.1:5198/?room=graybox-benchmark-match-jurisdiction-focus-r4).
Worker `2ba12e2a-d2e9-46c4-bfc7-05a97853b1af`, fixture
`4d458ee481886a891cfa78911b9644a7f1336d2f2e6e402ae6d39f2cf830ce86`, receipt
`output/hosted-capacity-deployment-2026-09-13T22-39-49-580Z/deployment.json`.
This replaces the four-mode relay below and expires about **7:39 p.m. Pacific**
on September 13. Application source hashes match the tested version below;
only the copied private Worker's assignment is pinned. Normal hosted backfill
and the 16-rat cap remain. No application change or public deployment.
The 12-second hosted check passed: 56 matching assets, eight rats, Jurisdiction
selected, 2,024 valid messages and no early close. A bot earned seven zone points.

[Preceding four-mode playtest, now superseded](http://127.0.0.1:5198/?room=graybox-benchmark-match-objective-focus-r3).
This replaces the preceding Jurisdiction-only preview with the normal shuffled
four-assignment playlist. It uses frozen matching client/Worker code, production
server-owned bots, normal eight-participant backfill and the 16-rat cap.

Worker version: `edd6e4dd-40b7-46c7-81c3-fdf5f64fd5b4`.
Fixture: `69fe57b64d6143a341d6cfe3c18e77934e664d18e9df88bb618035488ab033f9`.
Receipt: `output/hosted-capacity-deployment-2026-09-13T22-30-35-798Z/deployment.json`.
The dedicated relay remains `rat-detective-jurisdiction-preview.service` on port
5198 and expires about **7:30 p.m. Pacific on September 13**.

The first passive probe acknowledged every delivery separately and closed early.
The production NetworkManager instead coalesces cumulative acknowledgements for
33 ms. The probe was corrected to use that client behavior before repeating the
hosted check; no application transport limit was weakened. This mismatch can
exceed the existing 240-message ingress budget during bursts and is a possible
explanation for the earlier passive-probe interruptions in the Jurisdiction
receipt. Human bot pressure, round duration and feel remain for playtesting.

The corrected 35-second hosted check passed: all 56 served assets matched the
frozen copy; eight rats, 6,189 decoded messages, 4,658 movement messages, 508 shots
and 574 acknowledgements. Jurisdiction was selected by the ordinary playlist.
There were no decode failures or early socket closures. The sample had two
carriers and zero zone points; it verifies transport and active simulation, while
objective behavior is covered by the focused and real-physics tests above.

No public deployment or Git commit is part of this follow-up. Existing uncommitted
work is preserved. Prior implementation memory:
`brain:sessions/2026/09/rat-detective-jurisdiction-implementation-2026-09-13`.
