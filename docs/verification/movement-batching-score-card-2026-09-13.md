# Batched movement and permanent score card — September 13

Follow-up to continued human snap-backs after the earlier path-ray removal.
Released to production with the matching client on September 13.

## Reproduced defects

- The remaining movement guard reset its elapsed-time reference after each
  accepted packet. Two ordinary 125 ms walking poses delivered at the same server
  timestamp failed: x=2.25 was accepted, x=4.5 was rejected despite 300 ms of
  available server time. The old test suite only checked one compressed 50 ms
  pose at a time. Low frame rates, queueing and boosted movement exposed the gap.
- A local `playerCorrected` also called `clearInput()`. A held key or touch had no
  new down event, so the correction could leave movement stopped until release
  and re-press.
- CSS still hid Closing Time and Chain of Custody during roulette. Earlier fixes
  only exempted mobile or Excessive Force. Assignment briefing also hid all cards.

## Correction

- Each player now retains separate horizontal/vertical movement allowances.
  Server time refills them at the existing 35/110 units per second; accepted
  displacement consumes them. Capacity remains two seconds plus the existing
  2/6-unit starting slack. Delayed poses can spend the same earned time across
  a batch, and extra same-pose shoot/pickup messages cannot manufacture allowance.
  Rejections do not spend it; backward time cannot refill it.
- Join/resume, respawn, reset and bot rescue reset the allowance. Player removal
  clears it. Restored persisted poses receive only the bounded backlog allowed
  during ordinary delivery. World bounds, sequences, rate checks, local Cannon
  collision, launch physics and objective authority remain.
- Position corrections still apply authoritative coordinates, but retain held
  controls so movement can resume on the next physics step.
- Removed score-card visibility suppression for every mode and briefing. The
  card remains above broadcast overlays; compact desktop broadcasts use a
  separate horizontal area. Touch retains its accepted scale and positions.
  No game rule, pickup tuning, model or protocol change; protocol remains 15.

## Verification

- The real GameRoom regression failed on the old implementation at the second
  ordinary walking pose, then passed with normal and boosted walking.
- Focused Worker/client/CSS checks: 74 passing. Additional cases cover repeated
  four-pose batches, boosted motion and vertical launch speeds, same-pose action
  updates, finite accumulation, sustained excessive motion, rejected moves,
  backward clocks, held controls, and all three HUD modes through briefing,
  roulette, reveal/departure and cooldown.
- Full suite: **1,059 tests** (148 Worker, 882 client, 29 script), typecheck and
  production build pass. The existing large-chunk advisory remains.
- Static browser fixture `test/visual/score-card-fixture.html` executes 15 real
  computed-style checks across mode/phase combinations on each load. Passed at
  desktop 1280×720, compact 1024×768 and touch 844×390. Screenshots reviewed score
  visibility and separation from broadcasts. No gameplay inputs or real-phone
  playtest; these checks do not establish the user's subjective movement feel.

This supersedes the per-packet displacement calculation in the earlier
[movement release](movement-hot-pursuit-lag-2026-09-13.md), whose successful passive
bot observation did not reproduce queued human poses. Historical mobile HUD
context: `brain:sessions/2026/09/rat-detective-compact-mobile-hud-2026-09-10`.

## Production release

- Worker `rat-detective-preview`, environment `production`, version
  **`57934957-c05b-429d-93da-9b3f384cbed3`**. Predecessor:
  `e1ecb3ed-1853-480d-89f0-81817d0c238b`.
- All 159 captured source hashes still match after deployment. All 56 live assets
  exactly match the built client, including HTML. Health is good; status retains
  `public-live-v2`, world version 2 and seed 341283204. Zero rats before the
  observer is the expected sleeping-room state. Both old-host redirect checks pass.
- A five-second passive production observer joined through default matchmaking:
  protocol 15, eight participants, 652 decoded messages and zero correction
  messages. This verifies delivery/backfill, not human movement feel. The initial
  probe omitted required appearance and was correctly rejected; the complete
  join succeeded. No gameplay inputs or public round resets were sent.
- Deployment and verification receipts are under
  `output/movement-batching-2026-09-13/`. Existing tabs should reload.
