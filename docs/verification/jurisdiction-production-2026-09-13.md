# Jurisdiction, Paper Chase, bots and HUD — production release, September 13

Tyler accepted the final 75-second/standalone-clock preview and explicitly
requested deployment to production.

Live at `https://ratdetective.online/`, Worker `rat-detective-preview`, environment
`production`, version **`506ae57e-fd98-4a9d-b5e3-b51ce6e44779`**, protocol **18**.
Previous version: `57934957-c05b-429d-93da-9b3f384cbed3` (protocol 15).

## Released behavior

- Jurisdiction joins the normal four-assignment shuffle rotation: genuine living
  carrier in the active floor-specific zone earns one personal point/second,
  first to 60. Six outdoor/interior/sewer sites alternate; zones last 75 active
  seconds with a 10-second relocation warning. Existing valid three-mode bags
  finish before the next refill; no public round was forced or reset.
- Chain of Custody is displayed as **PAPER CHASE**, “Deliver the paperwork. First
  to three wins.” Its stored/network identity remains `chain-of-custody`.
- Bots favor mode/case goals, retain short useful supply detours and ordinary
  combat, avoid Ironclad-protected bodies, cancel body bursts on activation and
  can attempt close exposed case disarms. Accepted navigation/physics remain.
- Large standalone top-center zone countdown stays above roulette, outside the
  score card. Guidance stays visible during roulette and avoids HUD rectangles.
- Earlier released movement-batching, score visibility, pickups, model, shooting,
  reconnect and lighting changes remain.

## Validation and evidence

The approved private preview was Worker `901f7f5d-1b9d-4a14-8554-9db7a387bfef`.
All **164 source files** match its pre-fixture source hashes, and all **56 client
assets** match the frozen approved client. Private pinning/capacity harness changes
were confined to that fixture; production uses the normal playlist and config.
No source or asset changes were needed for this release.

The accepted candidate passed 1,121 tests (149 Worker, 941 client, 31 script),
typecheck, application build and visual build. Static desktop and landscape-touch
reviews confirmed the standalone timer and visible roulette guidance. The first
concurrent candidate test run had one navigation diagnostic failure; isolated and
full reruns passed, as documented in the [timer receipt](zone-timer-2026-09-13.md).
Checks were reused after exact source/asset comparison. Production dry-run passed,
then the reviewed build and current Worker source deployed with explicit
`--env production`. No Git commit/reset, namespace replacement or unrelated
service restart occurred.

Post-deployment checks:

- All 56 live files exactly match the approved frozen build.
- Health and canonical room status return HTTP 200; both legacy root and
  path/query URLs redirect correctly to the canonical host.
- Passive 12-second default-matchmaking observer received protocol 18, original
  version-2 world seed 341283204, eight participants, 1,176 valid messages,
  889 movement updates and 97 shots, with no invalid messages or early closure.
- The retained current assignment was `chain-of-custody` (Paper Chase). The short
  public observation did not rotate to Jurisdiction; the approved private
  observation verified its 75,000 ms timer. No public gameplay inputs or forced
  progression were used.

Evidence directory: `output/jurisdiction-production-2026-09-13/`, including
`approved-comparison.json`, `versions-before.log`, `dry-run.log`, `deploy.log`,
`before.json` and `live-verification.json`.

Existing tabs must reload to get the matching protocol-18 client. A rollback to
protocol 15 needs review of any stored Jurisdiction state: the older validator
cannot understand that mode. Human acceptance is recorded; no new real-phone
performance, long soak or load-capacity claim is made.

After the passive observer's reconnect reservation expired, `/status` returned
zero players and zero bots with the same world and round start time. Empty-room
cleanup completed normally; see `after-cleanup.json`.
