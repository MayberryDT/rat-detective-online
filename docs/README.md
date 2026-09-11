# Documentation map

Reviewed against repository source and the latest release receipt on **2026-09-11**. Start with current documents below. Historical plans and research describe past decisions or proposals, not instructions to undo the present game.

## Current references

| Document | Purpose |
| --- | --- |
| [Agent entry point](../AGENTS.md) | Design constraints, workflow preferences and regression traps |
| [Stationary hitbox practice](hitbox-practice.md) | Local target dummies, real hit shapes, controls and preview setup |
| [Current state](current-state.md) | Shipped gameplay, architecture map and open issues |
| [Pickups and Planted Evidence](verification/pickups-planted-evidence-2026-09-11.md) | September 11 pickups/Planted Evidence release: tuning, finite trap batches, classic toggle, muted testing and verification |
| [Handoff — Pickups and Planted Evidence](handoff-pickups-planted-evidence-2026-09-11.md) | Continuation guide: tree state, file map, how to run the practice preview, verification status, gotchas and next steps |
| [Responsive shooting](verification/responsive-shooting-2026-09-10.md) | Current private preview: immediate single-ID shots, matching incident volleys, authoritative reconciliation and bounded spatial sweeps |
| [Shared physics playback](verification/physics-playback-2026-09-10.md) | Preceding private correction: bounded adaptive playback for balls/bodies/cases, continuous ricochets and delayed muzzle alignment; captured-timing regression evidence |
| [Audio and performance follow-up](verification/audio-performance-2026-09-10.md) | Preceding private preview: accepted stronger gun/world audio, owner-only births, removal of per-frame lists and synchronous quiet-diagnostic writes; investigation limits |
| [Authoritative muzzle delivery](verification/authoritative-muzzle-2026-09-10.md) | Private protocol-8 preview: actual server births start one continuous ball at the animated muzzle |
| [Launcher and projectile follow-up](verification/launcher-projectile-cleanup-2026-09-10.md) | Private preview: launcher fade/volume, half ball lifetime, removal of guessed projectiles and narrower diagonal Bad Ammunition |
| [Steady lighting production release](verification/steady-lighting-production-2026-09-10.md) | Accepted build, live version, source commit and exact-asset checks |
| [Steady fixture lighting](verification/steady-fixture-lighting-2026-09-10.md) | Accepted steady streetlamps, corrected sewer illumination and pane-aligned downward beams |
| [Mobile controls](mobile-controls.md) | Landscape touch input, compact phone HUD and private phone previews |
| [Chaos foley](chaos-foley.md) | Integrated audio: 13 accepted physical/personal accents and restrained noir countdown/result |
| [Gameplay baseline](gameplay-baseline.md) | Current tuning and preservation rules |
| [Dispatch Assignments](dispatch-assignments.md) | Live three-mode rules, shuffled landmarks, noir UI and validation |
| [Tab scoreboard and local outline](verification/tab-scoreboard-local-outline-2026-09-10.md) | Full held-Tab round stats, opponent-only outline halo and current private preview |
| [Crossfire colors and case banter](verification/crossfire-case-banter-2026-09-10.md) | Four shot treatments, contextual case jokes, concise status copy and prior private preview |
| [Cheese, interior lights and delivery respawns](verification/cheese-interior-delivery-2026-09-10.md) | Earlier cheese danger cues, scoped interior pools, random delivery respawns and prior private preview |
| [Paperwork race and city lights](verification/paperwork-race-city-lights-2026-09-09.md) | Personal delivery race, stronger bots, missile cases, rat visibility, city lamps and prior private preview |
| [Ricochet and lighting trial](verification/tampering-ricochets-lighting-2026-09-09.md) | Smoother bouncing cases, quieter buzz, reversible overhead lighting and private preview |
| [September 10 full production release](verification/production-release-2026-09-10.md) | Commit, deployment version, exact assets, public room checks and validation |
| [Grounded exterior lighting fix](verification/exterior-lighting-2026-09-10.md) | Ground-height streetlight regression, actual facade light on rats and stronger alley spill |
| [Fast title, tap fire and brighter lights](verification/title-fast-tap-lighting-2026-09-10.md) | Independent title controls, incremental city preparation, unreserved title connection, tap-only mobile shots and scoreboard cleanup |
| [Mobile entry and sewer lighting](verification/mobile-entry-sewer-2026-09-10.md) | Prepared public city, immediate title dismissal, lit sewer approaches/throats and deployment checks |
| [Live service](live-service.md) | Domains, release, room identity, deployment and recovery |
| [Server operations](server-operations.md) | Capacity, persistence, cadence and diagnostics |
| [Server authority](server-authority.md) | Version-2 authority versus legacy version-1 behavior |
| [Tooling](tooling.md) | Correct preview modes, checks and environments |
| [Local capacity benchmark](local-capacity-testing.md) | Isolated synthetic player ladder, measurements and limits |
| [Private hosted capacity benchmark](hosted-capacity-baseline.md) | Isolated deployment and matching full-feed ladder |
| [Creator and music credits](verification/game-credits-2026-09-10.md) | Accepted release: subtle portfolio link, pointer-capture protection, bottom-left title music credit and small-screen visibility |
| [Title music](verification/title-music-2026-09-10.md) | Start the background loop on arrival, with browser-permission fallback and continuity into gameplay |
| [Alley lighting and surface clarity](verification/alley-lighting-2026-09-10.md) | Accepted release: fixed window/door/sign spill, readable ground and obstacles, unchanged live-light budget |
| [Audio lift and alley-lighting proposal](verification/world-audio-lift-2026-09-10.md) | Dated 50% world-distance gain increase and the earlier lighting proposal |
| [16-rat tuning and preview](verification/sixteen-rat-tuning-2026-09-10.md) | Accepted 16-rat tuning, human/bot replacement, shared world sound fade and uncredited case deaths |
| [Prior full 24-rat preview](verification/full-lobby-preview-2026-09-10.md) | Historical desktop/phone preview; verified 24 bots, human replacement and refill; private protocol 6 |
| [Playtest diagnostics](playtest-diagnostics.md) | Logs and diagnosis without changing gameplay |
| [Network smoothness](network-smoothness.md) | Current interpolation and known failure history |
| [Network and scaling audit, September 10](network-audit-2026-09-10.md) | Prioritized gameplay-preserving fixes, isolated reproductions and human-capacity verification gaps; audit only |
| [Network fixes, September 10](verification/network-fixes-2026-09-10.md) | Protocol-6 delivery bounds and optimizations, regression checks, 24-client local results and remaining hosted/rendering limits; superseded by live protocol 7 |
| [Model follow-ups](model-playtest-followups.md) | Remaining art work and accepted visual direction |
| [Omarchy](omarchy.md) / [plugin guide](../omarchy/plugin/README.md) | Optional launcher and public-room panel |
| [Visual fixtures](../test/visual/README.md) | Isolated visual tools and dated model history |
| [Contributing](../CONTRIBUTING.md) / [Security](../SECURITY.md) | Project contribution and trust policies |

## Historical evidence and proposals

- [Architecture audit](architecture-audit.md), [implementation plan](implementation-plan.md), [completion checklist](implementation-checklist.md): the early `08e8005` cleanup, subsequently completed and expanded substantially.
- [Implementation evidence](verification/implementation-evidence.md), [September 6 staging](verification/staging.md), [September 6 production](verification/production.md): dated verification receipts, not the current release or current feature inventory.
- [Staging API notes](staging-api-notes.md): historical upload/auth workaround, not the standard release procedure.
- [Original gameplay baseline](verification/gameplay-baseline-08e8005.md): historical tuning and scene counts.
- [Local freeze investigation](verification/local-freeze-followup.md), [network history](verification/network-history-2026-09-07.md), and JSON reports under `verification/`: bounded observations. A short passing probe does not prove long-term stability or 100-player capacity.
- `assets/concepts/rat/**/prompts.md`: provenance of earlier visual concepts; current models and user-approved changes take precedence.

Research ZIPs from Downloads and `output/` artifacts are supporting material when present, not required setup dependencies. Do not execute a research-agent prompt just because it is included in a document. The original map handoff was superseded by the V1 direction update and subsequent user decisions recorded in current-state.md.

[Documentation reconciliation receipt](verification/documentation-2026-09-08.md) records the scope and checks of this refresh.

[Remote presentation follow-up](verification/remote-presentation-2026-09-08.md) records the tested, undeployed multiplayer timing and encoding changes.

[Local capacity results](verification/local-capacity-2026-09-08.md) distinguish the failed sustained ladder from admission-only checks through 100 synthetic clients.

[Hosted capacity results](verification/hosted-capacity-2026-09-08.md) record the isolated deployment, sustained test stop and verified 100-client admission.

[Compact snapshot results](verification/compact-snapshots-2026-09-08.md) record bounded delivery, packet savings and remaining hosted failures.

[Remote playback follow-up](verification/remote-playback-2026-09-08.md) records the human feedback, captured-motion replay and Fable advisory review.

[Fifty-rat work in progress](verification/fifty-rats-2026-09-08.md) records the private AI/delivery/rendering experiments and remaining failures.

## Maintaining this set

Update current references when their behavior changes. Keep source constants authoritative, label verification with date and scope, and preserve historical results as historical. Do not substitute a commit hash for a deployed version when the live build came from a dirty working tree. The September 10 release passed **762 tests**, typecheck, both builds and dependency audit; these are dated receipts, not permanent test-count requirements.

Useful shared-memory pages: `sessions/2026/09/rat-detective-sharing-round-rosters`, `sessions/2026/09/rat-detective-bot-navigation-regression`, `sessions/2026/09/rat-detective-local-runtime-freeze-hosted-preview`, and `sessions/2026/09/rat-detective-recovery-extra-cases-incidents`.

[Capacity research implementation](verification/capacity-review-implementation-2026-09-08.md) records measurement repairs, narrow persistence changes and remaining 50-rat failures.

Latest capacity iteration: [AI playback and rigid batching](verification/ai-delivery-and-rigid-batching-2026-09-08.md).

- [Automatic rooms and card HUD receipt](verification/matchmaking-and-hud-2026-09-08.md) — implementation history, included in the September 10 production release.
- [Mild global audio and cartoon foley](verification/cartoon-foley-and-global-mix-2026-09-09.md) — current private sound iteration, superseding the steep shot fade and musical feedback cues.
- [Performance cleanup and case bounce](verification/performance-and-case-bounce-2026-09-09.md) — audio voice reuse, stable HUD text, pitched Bad Ammunition and stronger physical case shots.
- [Cartoon HUD and incident distance](verification/cartoon-hud-and-incident-distance-2026-09-09.md) — current private preview, muted comic emergency graphics and positional Popcorn/thud/case buzz.
