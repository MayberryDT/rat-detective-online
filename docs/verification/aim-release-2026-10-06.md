# Accepted aim release — 6 October 2026

Tyler accepted the corrected aiming: “that is a lot better. Let’s move forward with that.” This release changes the **real GameSession firing path**, composing the current input camera with its render presentation before `CheeseGun.shoot`, restoring in `finally`, and applying the new shot impulse afterward. Normal and held-fire share that method. HeavyCheese pistol presentation remains an accepted **private range** treatment; it was not integrated into live gameplay by this release.

| Environment | Worker version | Build |
|---|---|---|
| Staging | `11423d11-fc1a-4e21-b400-8471d898a3e4` | `staging-2026-10-06-748340a` |
| Production | `1bdd31df-e7f3-47bb-bf23-fa1c537828ae` | `production-2026-10-06-748340a` |

Source `748340a` descends from worker6’s `3276fc1`, preserving deployed `2476135` CityStore packed aggregates, rows mode, unpack endpoints/scripts and the complete rollback runbook. Production predecessor was `e99a51a7-dd70-4210-9c91-a59e8718b3d2`; staging predecessor `993e377f-469d-4452-829f-62350e774142`. Client `index-OLrhffSa.js`, game chunk `createGame-Ch-s-Ds_.js`; protocol 32, layout 7, physics/damage/cadence/ricochets and network protocol unchanged. Era random-supplies continues.

## Verification

Both environments passed an actual GPU-headless Chrome consumer using real CDP mouse clicks and W/Space controls, with no production debug overlay or injected hits. Each emitted three real descriptors and received authority `playerShot`, `first-step`, world-bounce and lifetime outcomes for their shot IDs. Staging movement 7.354 units, jump rise 4.770; production 7.354 and 4.761; zero JavaScript exceptions. This bounded smoke exercises live GameSession; it does not establish body/head boundary accuracy, subjective satisfaction or real network adversity. Prior discriminating local before/after correspondence proof is retained in [the production-path receipt](production-aim-alignment-2026-10-06.md).

No private-room test token was available. The bounded consumer therefore used the existing canonical `public-live-v2` agent=1 seat, no admin/reset, no paid Jev. After closure and reconnect grace, `/status` reported zero players and zero bots. No unattended simulation remains.

Public aggregate snapshots: staging no missing/lower counts (five added keys and 2,996 grown counts during the check); production exactly equal, 202,494 keys and total 209,165,842. The first browser attempt checked a nonexistent scoreboard element and timed out; retained as invalid readiness evidence. Corrected consumer checks actual welcome and movement. An initial compare invocation used unsupported flags; corrected positional compare succeeded. No failed attempt is reported as a pass.

Halla artifacts: `/home/halla/build/rat-detective/aim-release-2026-10-06/`: `hosted-consumer.mjs`, deployment logs, `staging-qualified/runtime.json`, `production/runtime.json`, screenshots, browser cleanup, before/after snapshots and continuity JSON. Repeat with `ORIGIN=<origin> PHASE=<new-directory> node <artifact-root>/hosted-consumer.mjs`; aggregate commands in [live service](../live-service.md). Builds ran via `npm run deploy:staging` then `npm run deploy:production` from the clean source tree. Focused 48 checks and main TypeScript passed in prep; old full fixture TypeScript still lacks its existing three-gpu-pathtracer dependency.

**Rollback:** never plain rollback past `2476135`. Follow [packed-aggregate rollback](../live-service.md#rolling-back-past-packed-aggregates): rows-mode deploy, drain every room through unpack, then old version. This release preserves that entire procedure.
