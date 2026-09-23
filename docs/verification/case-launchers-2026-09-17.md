# Launchable cases — production, September 17, 2026

Tyler requested that cases be launchable: "if a case is sitting on a launcher
and the launcher goes off, I want that thing flying in the air." Implemented in
the shared simulation, accepted on a private zero-bot playtest, then authorized
**get rid of the drop G key and push it live**. No GitHub operations, commits,
pushes, tags, releases or Omarchy plugin publishing were performed.
`public-live-v2` was not renamed or recreated.

## What changed

Loose, unowned evidence within a launcher pad radius now receives that machine's
own pad impulse, exactly like an occupant rat. No protocol change: the case
snapshot already carries position, velocity and quaternion, and clients already
interpolate it. `pressure.launches` events were **not** reused, because they
address players and drive client-side rat prediction.

Rules preserved:

- **Counterfeits stay planted.** They are static, massless hazards by
  construction and are never thrown.
- **A carried case is untouched.** `carry()` pins it to its rat every tick, so it
  already rides a launched carrier's hand.
- **Case weight reads correctly.** The case keeps its existing `linearDamping`
  of .2 against the rat's .1, so it flies lower and shorter than a rat launched
  from the same pad.

## The three traps this had to clear

1. **The apex would have eaten the case.** `stepLooseCase` treats a slow, high,
   unsupported case as lost after 4 s loose. A case on a pad has already been
   loose for longer than that, and a 90 u/s launch passes below 0.4 u/s for about
   33 ms at apex. Launched flight is now exempt from that watchdog until the case
   settles, and `looseSince` resets on launch.
2. **The missile flight path is not reusable as-is.** `stepCaseMissile` clamps
   vertical speed to the weaponized `caseMaxLift` (10) and replenishes lateral
   speed to `caseRicochetMinSpeed` (140). Launched flight gets its own lift cap
   and skips the ricochet replenish, so it can settle and be collected.
3. **Swept integration skipped damping and reused the ball bounce.** Routing the
   launch through the corner-swept path (needed, because a 90 u/s dynamic body
   tunnels thin walls between 1/60 substeps) bypasses Cannon's damping, and that
   path scaled restitution by `BALL_RESTITUTION` (0.9). The first implementation
   produced a case that reached y=162 and rebounded off the ground at 85 u/s
   forever. Launched flight now mirrors Cannon's damping formula and uses a
   separate **0.35** restitution, so the case lands and settles.

Measured flight on a flat test ground: apex about **108 units** near t=2.5 s,
ground contact near t=6 s, then handed back to ordinary Cannon physics to settle.

## Checks run

- `test/client/caseLauncher.test.ts` — new, 7 cases: impulse matches the pad,
  near-pad exclusion, carried-case exclusion, apex survival, settle-and-collect,
  city containment, and all six machines.
- Full client suite: **133 files, 1165 tests** pass.
- Worker suite: **24 files, 174 tests** pass.
- `npx tsc --noEmit` clean. Follow-up `npm run typecheck` and `npm run build`
  also passed.
- Full suite before production: **174 Worker**, **1165 client**, **77 script**
  tests.

## Private preview (superseded)

Zero-bot hosted playtest used a temporary localhost **G** drop hotkey. That
hotkey and its `dropCase` message were removed before production. The private
relay may still be running; it is not the live game.

## Production deploy

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, environment `production` |
| Version | `a18fbc4a-7a6b-4dde-924e-f0c3e90af5c5` |
| Predecessor | `25c973c4-7dd9-4c52-bc35-9eac87d1979f` |
| Protocol | 18 |
| Client | `index-CtA1HGSO.js` / `createGame-cln8fxn5.js` |
| Room / world | `public-live-v2`, version 2, seed **341283204** |
| Authorization | User: get rid of the drop G key and push it live |

Wrangler reported no new static assets (client hashes already matched the
roster release). The Worker script was published as version
`a18fbc4a-7a6b-4dde-924e-f0c3e90af5c5`. Evidence:
`output/case-launchers-production-2026-09-17/`.

## Live HTTP check

After deploy, `/health` was healthy. `/status` kept `public-live-v2`, world
version 2, seed 341283204, **8 players / 8 bots**, phase playing. Companion
`GET /api/companion/v1/status` showed **0 humans / 8 players**, assignment
**EXCESSIVE FORCE**, revision **178477 → 178496** over about 18 seconds, with
changing K/D. Root HTML referenced `index-CtA1HGSO.js`. 58 hashed `dist` files
matched live bytes; `/index.html` returns 307 to `/`. Old host redirected root
and path/query to https://ratdetective.online/. No public-room join, forced
reset, browser gameplay input, Git commit or plugin publish. Existing tabs
should reload.

## Known limits

- The launch is purely authoritative, so it begins one snapshot later than the
  locally predicted rat launch. For a multi-second flight this reads fine, but it
  will feel slightly less immediate than the rat. A `caseLaunched` event would
  fix that at the cost of a protocol bump; deliberately not done here.
- If a launched case lands anywhere other than a reachable landmark roof or
  vehicle roof, the ordinary 4-second loose-case watchdog still recovers it to a
  spawn. Making every landing spot retrievable is a separate design decision.
