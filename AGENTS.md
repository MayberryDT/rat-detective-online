# Rat Detective: agent entry point

Read [docs/current-state.md](docs/current-state.md) first, then [docs/README.md](docs/README.md) for the documentation map. These describe the shipped game as verified on **2026-09-08**, not a new implementation request.

## Preserve the game

- Rat Detective is wild physical comedy in a dark noir metropolis. Favor chaotic, interacting systems and spectacular consequences over competitive balance. Preserve usable controls, camera, navigation and continued participation.
- Cheese projectiles remain **balls** with shaded pores. Ordinary rounds are yellow; enemy rounds have strong red-orange rims/trails. During Crossfire, banked shots have red cores: your own stay shaded without an enemy glow, enemy ricochets glow bright red. Keep no-self-damage protections. Ordinary speed, gravity, bounce and lifetime are deliberately tuned; do not change them as an optimization or map workaround. Read `src/shared/ballTuning.ts` and the current gameplay baseline.
- Keep essential objective/status labels concise. Case pickup/loss/taken/loose announcements use rotating noir rat jokes, not repeated explanations of retained scores or how to score. Preserve the accepted “KILLS COUNT” / “GET THE CASE TO SCORE” status.
- Keep dark buildings with varied high-contrast windows and lights. Authored lamps and baked illumination stay steady. The accepted September 9 lighting lowers ambient fill and adds four nearby downward lights on moving rats. Interior fixtures have explicit power and use the rat’s landmark/floor to select lights; keep the four-spot budget and reversible classic mode. Streetlamps are nine units tall on paired curb rows; opponents retain the stronger outline while the local rat’s outline is hidden; all rats retain the small material brightness lift. `lighting=classic` restores older illumination settings, not the new lamp layout. Preserve approved landmark scale, distinct interiors, dense streets, alleys and sewer connections.
- Preserve the current shoulder camera, animated pistol muzzle, case grip and rat silhouette. Cosmetic upgrades should evolve them. Do not restore an old camera or move projectile origins forward to conceal a problem.
- No self-damage, no friendly-fire damage, and no current minimap. The current game is free-for-all; this does not imply an implemented team system.
- The local version-2 playlist uses **Dispatch Assignments** to win; kills are actual secondary statistics, with no carrier multiplier or kill-limit finish. The dated shipped/legacy deathmatch rules differ. Chain now wins at three personal paperwork deliveries; whole landmarks keep rotating in shuffled cycles. Non-winning deliveries respawn the case at a randomized clear pickup site; personal points persist. Read [the assignment implementation](docs/dispatch-assignments.md).
- Evidence Tampering makes **eight uncollectible weaponized cases** that ricochet with short hops: launch 145, redirect 160, sustained lateral floor 140. Keep all eight visible throughout the incident. Replenish lateral speed only; do not restore the old 220-speed upward rockets. All assignment progress pauses and is retained; the seven extras disappear at expiry. Restore the primary case with its existing progress and require a fresh valid entry.

- Hold Tab for the translucent full-lobby scoreboard; release or focus loss dismisses it. Use server totals for case time and mode scores, preserve the compact always-visible assignment HUD, and never infer a Closing Time victory from the longest-held statistic.

## Work safely in this project

- Inspect `git status` before editing. Much of the live game has been deployed from an uncommitted working tree. Do not reset, clean, replace it with HEAD, or assume a release is represented by a Git commit. Isolated worktrees exclude uncommitted changes.
- The latest project-specific delegation preference is **Astra agents, no Cursor agents**. Follow later explicit user or harness instructions. This preference does not itself request delegation; when delegation is authorized, give bounded ownership and preserve other edits.
- The user leaves browser gameplay/input testing to human playtests. Do not spend usage on automated pointer-lock/input checks unless requested. A requested screenshot is separate from gameplay testing. Use focused code/protocol tests where appropriate.
- Keep code changes and documentation changes scoped. A documentation refresh does not authorize a deployment, service restart, new gameplay change or Git commit.
- Shared GBrain is useful for prior decisions; follow the supplied host-level GBrain instructions. Read promising pages after search; cite slugs in handoffs. Do not store secrets, raw journals or browser state in project docs or memory.

## Avoid known regressions

- Production is `rat-detective-preview`, environment `production`, canonical `https://ratdetective.online/`, room `public-live-v2`. The old animasai domain redirects. Do not rename the room or recreate its namespace to restart it.
- Public AI is server-owned: **8–11 per round**, fresh names each round, durable roster through reconnect/eviction. Eleven slots stay reserved, leaving thirteen humans. Do not add browser-hosted bots to the public room.
- Preserve shared destination flow fields, bounded search work, movement while replanning, and progress-based recovery. Per-bot stalled A* queues and recovery that scatters progressing rats caused the slow/choppy AI regression.
- Local port 5174 is the hosted relay, not the retired workerd server. Read [tooling](docs/tooling.md) before starting anything; do not restore `rat-detective-stable-preview.service` as the normal preview.
- Keep protocol validation, serialized snapshot budgets, finite state, lifecycle cleanup and killer attribution intact. More moving objects do not establish a supported player count.

## Validation and handoff

For application changes: focused tests, then `npm run typecheck`, `npm test`, and `npm run build` as appropriate. For docs-only changes, check facts, relative links and stale instructions; no gameplay or load test is needed. Report what changed, what was actually checked, remaining uncertainty and any deployed version. Update current docs when behavior changes; keep historical reports dated rather than rewriting their measured results.
