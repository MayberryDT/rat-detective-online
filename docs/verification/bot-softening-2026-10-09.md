# Softer bot reactions and tracking — 9 October 2026

Live in production after Tyler asked to push it live. Tyler approved the first reaction/tracking pass after reporting that bots were too effective for him and friends, while asking to retain their human behavior.

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

## Production release

Source `8aafdad`, build `production-2026-10-10-8aafdad`, final Worker `652e3479-4485-4c42-9b3c-f8f809f00ea5`; prior gameplay release `20f9db44-7857-42da-b88c-ccf1bb2eb1f7`. Protocol 43 and layout 7 continue; mindVersion 21, era `softer-bots`. GitHub `master` updated before deploy. Deployed through `npm run deploy:production` from a clean Halla checkout.

Release checks: 288 Worker tests passed, 1519 client tests passed and one skipped; one client test failed its old tight aiming bound (`botIronclad`, every shot within 2 units laterally). It passes with the previous dials; slower tracking produced a 3.01-unit miss. The other armor behavior tests pass. This accuracy assumption conflicts with the approved softer aiming change; no test was rewritten or disabled. All 46 script tests passed.

Live `/health` confirms the exact build. `/status` reports `public-live-v3`, ORD, world 7, 0 players/0 bots. Root and its three referenced assets fetched successfully; entry `index-DRHzezLz.js`. Provider version inspection confirms the build and existing storage/secret bindings. Retained deploy, provider inspection, test logs and HTTP artifacts are beside the simulation artifacts. No human playtest yet.

The initial deployment was `7d42288e-d8fa-4a12-8fd2-baaa1236d35d`. A shell-quoting error while writing this receipt repeated the same clean deployment, producing the final version above at 2026-10-10T00:37:53.259Z. Both deploy the identical source/build. Malformed receipt output was discarded and rewritten; no gameplay or room identity change was introduced by the repeat.
