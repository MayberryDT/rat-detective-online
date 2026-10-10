# Softer bot reactions and tracking — 9 October 2026

Implemented, not deployed. Tyler approved the first reaction/tracking pass after reporting that bots were too effective for him and friends, while asking to retain their human behavior.

`src/shared/bots/intent.ts`: base reaction 240–480 → 288–576 ms; gremlin reaction 260–500 → 312–600 ms; all archetypes' tracking lag 130–210 → 156–252 ms. `MIND_VERSION` 20 → 21 stamps the existing facts. No new mechanics or tests.

Verification ran on Halla in an isolated checkout at `/home/halla/build/rat-detective/bot-softening-2026-10-09/worktree`, based on `8446fc6589da`. Typecheck, production build and diff whitespace checks passed. Build emitted its existing large-chunk warning.

The real bot controller, shared physics, code mind and chaos simulation played six seeded two-minute rooms per version, two seeds for each of the three starting assignments. Repeat from the checkout:

```sh
node scripts/bot-sim.mjs --ref=8446fc6589da --seeds=2 --minutes=2 --jobs=3 --json > ../before.json
node scripts/bot-sim.mjs --seeds=2 --minutes=2 --jobs=3 --json > ../after.json
npm run typecheck > ../typecheck.log 2>&1
npm run build > ../build.log 2>&1
```

Artifacts are retained in `/home/halla/build/rat-detective/bot-softening-2026-10-09/`.

| Measure | Before | After |
| --- | ---: | ---: |
| Stuck rescues per bot-hour | 0 | 0 |
| Pickups per bot-hour | 85.56 | 86.11 |
| Case changes per room-hour | 105 | 145 |
| Paper Chase deliveries per room-hour | 60 | 75 |
| Shots | 15,520 | 13,741 |
| Hit rate | 2.5% | 3% |
| Kills per bot-hour | 53.33 | 57.78 |

Combat, pickups and objective movement continued without stuck rescues. This short chaotic bot-versus-bot sample does not demonstrate reduced difficulty: both sides changed, hit rate and kills rose despite fewer shots. There were no humans, network or Jev in the simulation. Do not claim 20% less effectiveness from it.

Next: a human playtest and comparison of damage against humans per encounter in builds/mindVersions 20 and 21, excluding agents and admin-touched rounds, plus Tyler/friends' judgment about breathing room. Burst pauses and limited attention remain deferred.
