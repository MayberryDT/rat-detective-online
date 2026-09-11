# Optimization qualification — September 10, 2026

Requested by Tyler: establish baselines, implement the reviewed research in an isolated worktree, and iterate against explicit outcomes. This document tracks the active work; it is not a performance success receipt.

## Baseline and scope

Branch `codex/optimization-research` starts at `3254e3d`, a verified snapshot of 528 files from the original dirty checkout. It includes protocol 8, authoritative first-draw muzzle births, no guessed local balls, 2.5-second lifetime, current audio and accepted lighting. Original checkout and production are separate.

Research: `/home/tyler/Downloads/Rat-Detective-Optimization-Research-2026-09-10.md`. Prior assessment: GBrain `sessions/2026/09/rat-detective-optimization-research-assessment-2026-09-10`. Recommendations about predicted-ball reconciliation are superseded by the baseline. Preserve immediate gun feedback and real authoritative muzzle births.

## Required outcomes

1. Owner-filter fixtures hit the closest eligible rat or wall, including returning shots, with no self-damage and unchanged masks, ties and bounce integration.
2. Controlled continuously moving remote rats, balls and cases sample a common time within one 60 Hz physics step. Ideal-delivery human delay must not increase; AI delay must improve from 250 ms. Report birth/ricochet/lifecycle exceptions explicitly. Jitter and pauses must not produce backward motion or unbounded delay, and continuously moving tracks must retain the existing ≤1% hold gate under qualified delivery profiles.
3. Accepted/rejected shots and terminal outcomes are correlated, timestamped, bounded and deduplicated. Shots ending between snapshots have an explicit result; old lives/resets cannot be damaged or resurrected. Local health and action acknowledgement remain immediate upon authority receipt.
4. Case eligibility has explicit diagnostic reasons. Controlled eligible pickup confirmation p95 must stay within RTT + 100 ms; intentional cooldown/speed/incident gates are recorded separately. Pending UI grants no ownership, protection or score.
5. Three matched corpse-lifecycle runs must show at least 20% lower median targeted CPU cost, or repeatably recover an otherwise missed frame deadline, while preserving actual vertices/materials/animation/picking. Report batching, creation, warmed reuse, frame submission and optional GPU work separately. Pool capacity, reset and disposal must remain bounded through repeated reuse.
6. Current sixteen-client local full-feed incident workload: no invalid messages/errors/unexpected disconnects/skipped sends; all ten incidents and 256-ball pressure exercised; all eight Tampering cases retained. Target snapshot interarrival p99 <100 ms, no unexplained ≥1 s gaps, generator p99 ≤25 ms, and existing roster/scoreboard/ACK/playback gates. Distinguish local disk/tmpfs and application-imposed delay from hosted durability or real packet loss.
7. Focused regressions, complete tests, typecheck, production build and visual build pass. Record baseline failures and repair the harness without erasing evidence.

## Sequence and conditional work

- Baseline: existing suite/builds, repeatable timing/collision/corpse CPU fixtures, cold and warmed renderer samples, sixteen-client all-incident delivery.
- Correct collisions; batch and prewarm/pool the real corpse path; expand preparation of actual render variants. Compare each separately.
- Add bounded action traces, authoritative outcomes and eligibility; establish shared presentation clock and lifecycle/event ordering. Keep protocol budgets and durable outcomes.
- Evaluate relative-motion collision and bounded projectile launch catch-up in isolated deterministic fixtures. Ship only behavior-preserving fixes; fairness-changing compensation remains an explicitly reported experimental arm pending human comparison.
- Profile bytes, aim-query/static-query maintenance and checkpoints. Implement lossless reductions where measured, preserving exact hit ordering, state decoding and crash recovery. Backend/transport migration and reduced visual quality are conditional research alternatives, not mandatory changes.

## Measurement boundaries

No automated browser gameplay/pointer-lock/input checks. A synthetic rendering replay has no player input or public-room connection. Browser CPU and GPU results must identify the actual GPU/backend, resolution and DPR; missing GPU timing is unavailable, not zero. No physical-phone, hosted sixteen-human or universal-device promise follows from local tests. No deployment is part of this task.

Benchmarks run serially without concurrent build/test load. Keep source hashes, runtime versions, raw repeated samples and deterministic seeds with each report. Do not claim success by changing physics, removing effects, increasing hidden buffers, reducing resolution or weakening protocol/persistence rules.

## Progress

Qualified and closed on **2026-09-11**. The accepted physics-playback,
responsive-shooting and audio work from the original checkout (commit
`ae2fdb3`) was reconciled with this worktree's protocol-9,
shared-presentation-clock, outcome and pickup work, and every required outcome
was re-measured on that reconciled source. See
[the qualification receipt](verification/optimization-qualification-2026-09-11.md)
for reproducible before/after numbers.

- Outcome 1: owner-eligibility fixtures hit the closest eligible rat or wall;
  no self-damage; masks, ties and bounce integration unchanged.
- Outcome 2: rats, balls and cases share one simulation-time cursor. AI delay
  improves from 250 ms to 100 ms; human delay is unchanged; disagreement is
  1.2e-12 ms. The sixteen-client playback hold gate passes.
- Outcome 3: accepted/rejected shots and terminal outcomes are correlated,
  timestamped, bounded and deduplicated, with Worker/socket coverage.
- Outcome 4: pickup eligibility reports an explicit reason with a real LOS
  query and a throttled diagnostic; ownership stays authoritative.
- Outcome 5: pooled corpse reuse lowers lifecycle CPU **96.2%** (control
  125.90 ms to 4.75 ms), and a bit-exact cached tail-curve projection lowers
  16-corpse pose CPU **57%** (15.46 ms to 6.68 ms), with preserved vertices,
  materials and picking; cold batching alone remains a regression.
- Outcome 6: sixteen-client all-incident run passed with snapshot-gap p99
  **59 ms**, zero invalid/errors/disconnects/skipped, all ten incidents, 256
  balls and eight retained cases.
- Outcome 7: 883 tests, typecheck, production build and visual build pass.

Remaining limitations (see the receipt): no deployment; conditional
relative-motion collision/lag experiment unimplemented; wire/query profile
open; no measured pickup-latency experiment, physical phone or hosted
sixteen-human run; human playtesting not performed.
