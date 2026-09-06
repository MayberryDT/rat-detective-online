# Rat Detective Cloudflare Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rat Detective playable and portfolio-presentable again by restoring the simple city level, moving the multiplayer backend from Railway/Socket.IO to Cloudflare Workers plus Durable Objects, and preparing the repo for an open-source release.

**Architecture:** Serve the Vite static build from Cloudflare Workers Static Assets and route `/ws` to a Worker-backed Durable Object. The Durable Object owns the public game room, accepts native JSON WebSocket messages, persists active player state in SQLite-backed Durable Object storage, and uses alarms for respawn/reset timing so the room survives hibernation. The client keeps the existing `NetworkManager` surface where possible, but replaces `socket.io-client` with same-origin native WebSocket traffic.

**Tech Stack:** Vite, TypeScript, Three.js, Cannon-es, Cloudflare Workers Static Assets, Cloudflare Durable Objects, Wrangler, Vitest, `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Treat the old `CityGenerator` random-height building/street layout as the level source of truth.
- Scrap the bad `LevelMap` level from the cleanup branch after backing up the dirty worktree.
- Do not revert unrelated local changes blindly. Preserve gameplay fixes unrelated to the bad level after reading the diff.
- The final runtime must not depend on Railway, Netlify, Socket.IO, `VITE_SERVER_URL`, or cross-origin WebSocket CORS.
- Use a same-origin WebSocket endpoint at `/ws`.
- Use one Durable Object room named `public` for this cleanup release. Multiple rooms are deferred.
- Use hibernatable Durable Object WebSockets, not the standard always-awake WebSocket API.
- Store active player/game state in Durable Object SQLite before relying on in-memory caches.
- Use Durable Object alarms instead of `setTimeout` for respawns and round reset.
- Generate Worker binding/runtime types with `wrangler types`; do not hand-write a drifting `Env` interface.
- Keep the current deploy domain `https://rat-detective.animasai.co/` as the canonical target unless Tyler explicitly changes domains.
- Use `compatibility_date` `2026-07-08` for the new Worker config.
- Verification must include `npm run build`, `npm run test`, `npm audit --audit-level=high`, local Wrangler smoke, and production browser smoke.

## Sources Used

- GBrain project memory: `sessions/2026/07/rat-detective-deploy-connection-diagnosis-2026-07-08`.
- Cloudflare Durable Object WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Cloudflare Durable Object rules: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- Cloudflare Workers TypeScript types: https://developers.cloudflare.com/workers/languages/typescript/
- Cloudflare Durable Object testing: https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/
- Cloudflare Worker rollback: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/

## Current Findings To Preserve

- Public Cloudflare and Netlify static builds load, but both connect to dead Railway host `rat-detective-online-production.up.railway.app`.
- Railway returns edge `404 Application not found`; the connection bug is a dead backend URL, not the Three.js client.
- The deployed builds and committed `HEAD` use `CityGenerator`, not `LevelMap`.
- The local dirty worktree has `src/main.ts` changed to import `LevelMap`, and `src/world/LevelMap.ts` is untracked. That is the bad level attempt.
- `server/index.js` in the dirty worktree has spawn logic tied to the bad `LevelMap`; committed `HEAD` uses simple random city spawns.
- Root `npm run build` passes today, but `npm audit --audit-level=high` fails in root and `server/`.
- There is no repo-level test script, lint script, license, security policy, CI workflow, or open-source contribution guide.

## Definition Of Done

- `https://rat-detective.animasai.co/` serves the game and opens `wss://rat-detective.animasai.co/ws` on join.
- The title screen stays usable if the backend connection fails; the player is not dropped into an empty disconnected city.
- Two browser tabs can join the same room, see each other in the scoreboard, move remote rats, and clean up on disconnect.
- Production console and Network panel show no Railway, Netlify runtime, Socket.IO polling, or dead backend requests.
- `CityGenerator` is the only active level generator; the bad `LevelMap` is removed from the cleanup branch.
- `npm run audit`, `npm run test`, and `npm run build` pass before deployment.
- The old Railway server and Socket.IO dependencies are removed only after Worker/WebSocket parity is verified locally.
- README, contribution docs, security policy, CI, and license are ready before making the repository public.

## Execution Safety

- Implement from a clean git worktree based on `origin/master`; do not work directly in the dirty portfolio checkout.
- Preserve the dirty checkout by writing a patch and untracked backup before creating the clean worktree.
- Import only reviewed useful dirty changes into the clean worktree. The known bad level changes are not imported.
- Use `git add -p` for files that had pre-existing local edits. Use broad `git add` only in the clean worktree after confirming `git status --short` contains only current-task changes.
- Stop any local `vite`, `wrangler`, or browser automation processes before ending an implementation turn.

## Risk Register

| Risk | Trigger | Mitigation | Verification |
| --- | --- | --- | --- |
| Dirty worktree changes are accidentally committed | `git status --short` shows old local edits in the implementation checkout | Use a separate clean worktree and `git add -p` for any imported hunks | Task 1 clean worktree check |
| Durable Object hibernation loses player state | Players disappear after idle period or object eviction | Persist player data and pending events to SQLite before updating caches | Worker tests plus local two-tab smoke |
| Respawn/reset timers disappear on eviction | Dead players never respawn or victory screen never resets | Store pending events in SQLite and drive them from Durable Object alarms | Alarm-focused tests and manual kill/respawn smoke |
| Client enters game without backend | Title fades but scoreboard never receives local player | Hide title and create player only after `welcome` | Browser smoke with server stopped and running |
| WebSocket route is bypassed by static assets | `/ws` returns static HTML or 404 | Configure `assets.run_worker_first` for `/ws` and `/health` | `curl /health`, WebSocket smoke |
| Production deploy regresses live site | Join fails after deploy | Record current deployment, verify immediately, rollback with Wrangler if smoke fails | Task 11 rollback gate |
| Open-source release exposes stale infra or secrets | README/env files mention Railway URLs or private tokens | Static search and docs review before public release | Final release verification |

## Rollback Strategy

- Before deploying, record the active Cloudflare deployment with `npx wrangler deployments status --json`.
- If production smoke fails after deploy, immediately run `npx wrangler rollback --message "Rollback Rat Detective Cloudflare migration"` from the implementation worktree, then rerun the production health and browser smoke.
- Do not delete or modify Cloudflare resources outside the Worker deployment during this cleanup. Rollbacks cannot undo removed bindings or changed external resources.
- Keep Netlify/Railway cleanup as a post-verification manual follow-up. The source cleanup removes repo dependencies, but external site shutdown should wait until the Cloudflare domain is confirmed stable.

## File Structure

Create:

- `src/shared/networkProtocol.ts`: shared message types, constants, and small serializable data shapes used by client and Worker.
- `src/worker/index.ts`: Worker fetch entrypoint, `/health`, `/ws`, Durable Object routing, static asset fallback.
- `src/worker/GameRoom.ts`: Durable Object class that owns connections, player state, broadcast, persistence, and alarms.
- `src/worker/gameState.ts`: pure game-state helpers for player creation, scoreboard sorting, hit handling, spawn generation, and reset.
- `src/worker/validation.ts`: JSON parse and message validation for bounded client WebSocket payloads.
- `src/worker/logging.ts`: structured JSON logging helpers.
- `test/worker/gameState.test.ts`: pure unit tests for scoring, hit handling, respawn scheduling, and reset.
- `test/worker/worker.test.ts`: Worker/Durable Object integration tests using Cloudflare Vitest pool where stable.
- `test/env.d.ts`: Cloudflare test environment typing.
- `test/tsconfig.json`: test TypeScript config.
- `vitest.config.ts`: Workers-aware Vitest config.
- `worker-configuration.d.ts`: generated by `npx wrangler types`.
- `scripts/smoke-ws.mjs`: local WebSocket smoke script for joining two clients through Wrangler.
- `.github/workflows/ci.yml`: build/test/audit workflow for open-source readiness.
- `CONTRIBUTING.md`: minimal local-dev and contribution guide.
- `SECURITY.md`: vulnerability reporting policy.
- `.editorconfig`: stable formatting defaults.

Modify:

- `src/main.ts`: restore `CityGenerator`, remove `LevelMap`, spawn local player from server welcome data after WebSocket join, and add connection failure UI behavior.
- `src/network/NetworkManager.ts`: replace Socket.IO client with native WebSocket while preserving public callbacks.
- `src/player/RatController.ts`: keep the current optional `spawnPos` constructor if present; it is useful for server-assigned spawns.
- `server/index.js`: reference only during migration; do not keep in final runtime.
- `package.json`: add Wrangler/Vitest scripts and remove `socket.io-client` after migration.
- `package-lock.json`: update from dependency changes.
- `tsconfig.json`: include generated Worker types and tests safely.
- `wrangler.jsonc`: add Worker entrypoint, assets binding/routing, Durable Object binding, migrations, observability.
- `.gitignore`: add `.wrangler`, `.dev.vars*`, coverage and test output.
- `README.md`: update architecture, local development, deployment, controls, status, and source-of-truth notes.

Delete after Cloudflare parity is verified:

- `src/world/LevelMap.ts`
- `server/`
- `railway.json`

Keep ignored/local only:

- `.netlify/` stays ignored and should not be part of the canonical deploy path.

---

### Task 1: Baseline, Backup, And Branch Hygiene

**Files:**
- Read: repository root
- Create: sibling clean worktree

**Interfaces:**
- Consumes: existing dirty worktree.
- Produces: a safe local backup and a clean implementation worktree.

- [ ] **Step 1: Record the current dirty checkout state**

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin
git status --short --branch
git diff --ignore-cr-at-eol --stat
```

Expected:
- Working tree is dirty.
- `master` is behind `origin/master` by one README-only commit unless this has already been reconciled.
- `src/world/LevelMap.ts` and `wrangler.jsonc` are untracked.
- `git diff --ignore-cr-at-eol --stat` separates meaningful changes from CRLF churn.

- [ ] **Step 2: Back up the dirty worktree outside the repo**

```bash
mkdir -p /tmp/rat-detective-cleanup-backup
git status --short > /tmp/rat-detective-cleanup-backup/status.txt
git diff > /tmp/rat-detective-cleanup-backup/tracked.diff
git diff --ignore-cr-at-eol > /tmp/rat-detective-cleanup-backup/tracked-ignore-cr.diff
tar -cf /tmp/rat-detective-cleanup-backup/untracked.tar src/world/LevelMap.ts wrangler.jsonc
ls -lh /tmp/rat-detective-cleanup-backup
```

Expected:
- `tracked.diff`, `tracked-ignore-cr.diff`, `status.txt`, and `untracked.tar` exist.
- No repo files are changed by this step.

- [ ] **Step 3: Create a clean implementation worktree**

```bash
cd /home/tyler/Antigravity/rat-detective
git worktree add ../rat-detective-cloudflare-cleanup -b chore/cloudflare-worker-cleanup origin/master
cd ../rat-detective-cloudflare-cleanup
git status --short --branch
```

Expected:
- Current branch is `chore/cloudflare-worker-cleanup`.
- Working tree is clean.

- [ ] **Step 4: Bring the plan into the clean worktree**

```bash
mkdir -p docs/superpowers/plans
cp /home/tyler/Antigravity/rat-detective/docs/superpowers/plans/2026-07-08-rat-detective-cloudflare-cleanup.md docs/superpowers/plans/
git add docs/superpowers/plans/2026-07-08-rat-detective-cloudflare-cleanup.md
git commit -m "docs: add cloudflare cleanup plan"
```

Expected:
- The clean worktree now contains this plan.
- The original dirty checkout remains untouched.

- [ ] **Step 5: Review dirty changes for selective import**

From the original checkout, inspect:

```bash
cd /home/tyler/Antigravity/rat-detective
git diff --ignore-cr-at-eol src/entities/RatEntity.ts src/player/RatController.ts src/weapons/CheeseGun.ts src/network/NetworkManager.ts src/main.ts
```

Expected:
- Useful non-level fixes are identified before coding.
- Bad `LevelMap` wiring in `src/main.ts`, `server/index.js`, and `src/world/LevelMap.ts` is explicitly excluded.

If a useful dirty hunk is needed, copy it into the clean worktree manually or apply only that hunk with `git apply --3way --reject` from a minimal patch file. Do not apply the full dirty diff.

- [ ] **Step 6: Commit cadence**

Commit after each task below with the message shown in that task. Do not wait until the end to make one large commit.

---

### Task 2: Restore The Simple City Level

**Files:**
- Modify: `src/main.ts`
- Modify: `server/index.js` only if the legacy server is still needed for a pre-migration smoke test
- Delete later: `src/world/LevelMap.ts`

**Interfaces:**
- Consumes: `CityGenerator(scene, world, options).generate()`
- Produces: gameplay code no longer imports or calls `LevelMap`

- [ ] **Step 1: Replace the `LevelMap` import**

In `src/main.ts`, replace:

```ts
import { LevelMap } from './world/LevelMap';
```

with:

```ts
import { CityGenerator } from './world/CityGenerator';
```

- [ ] **Step 2: Restore the ground mesh and city generator**

Replace the `// LEVEL MAP` block in `src/main.ts` with:

```ts
// GROUND MESH
const groundGeo = new THREE.PlaneGeometry(800, 800);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x555555,
  roughness: 0.9,
  metalness: 0.05,
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// CITY
const city = new CityGenerator(scene, world, {
  gridSize: 12,
  blockSpacing: 30,
  streetWidth: 14,
  minHeight: 18,
  maxHeight: 85,
  buildingWidthMin: 8,
  buildingWidthMax: 14,
});
city.generate();
```

- [ ] **Step 3: Remove direct `LevelMap` spawn usage**

Replace:

```ts
const spawn = LevelMap.getRandomSpawnPoint();
rat = new RatController(scene, world, camera, playerName, localAppearance, spawn);
```

with this temporary city-spawn form until Task 7 moves spawning behind the server welcome:

```ts
rat = new RatController(scene, world, camera, playerName, localAppearance);
```

- [ ] **Step 4: Restore legacy random spawns if running the old server during migration**

If `server/index.js` is kept temporarily for smoke testing before Worker migration, remove the `mapLayout`, `spawnPoints`, and `getRandomSpawn()` code, then use this helper:

```js
function getRandomSpawn() {
    return {
        x: (Math.random() - 0.5) * 100,
        y: 2,
        z: (Math.random() - 0.5) * 100
    };
}
```

Use it in join, respawn, and reset.

- [ ] **Step 5: Verify no `LevelMap` references remain in runtime code**

```bash
rg -n "LevelMap" src server package.json
```

Expected:
- No matches in runtime files after `src/world/LevelMap.ts` is deleted.
- If the file has not been deleted yet, the only match may be inside `src/world/LevelMap.ts`.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected:
- TypeScript and Vite build pass.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts server/index.js
git commit -m "fix: restore city generator level"
```

---

### Task 3: Define The Native WebSocket Protocol

**Files:**
- Create: `src/shared/networkProtocol.ts`
- Modify: `src/network/NetworkManager.ts` in later tasks
- Modify: `src/worker/GameRoom.ts` in later tasks

**Interfaces:**
- Produces: `ClientMessage`, `ServerMessage`, `PlayerData`, `ScoreEntry`, `RatAppearance`, `MAX_HP`, `KILLS_TO_WIN`, `RESPAWN_DELAY_MS`, `WIN_DISPLAY_MS`.

- [ ] **Step 1: Create shared protocol types**

Create `src/shared/networkProtocol.ts`:

```ts
export const MAX_HP = 3;
export const KILLS_TO_WIN = 20;
export const RESPAWN_DELAY_MS = 5_000;
export const WIN_DISPLAY_MS = 6_000;
export const DEFAULT_ROOM_NAME = 'public';

export type HatTypeName = 'fedora' | 'trilby' | 'porkpie';

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface QuatData {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RatAppearance {
  hatType: HatTypeName;
  hatColor: number;
  furColor: number;
  coatColor: number;
}

export interface PlayerData extends RatAppearance {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  meshQx: number;
  meshQy: number;
  meshQz: number;
  meshQw: number;
  hp: number;
  kills: number;
  deaths: number;
}

export interface ScoreEntry {
  id: string;
  name: string;
  kills: number;
  deaths: number;
}

export type ClientMessage =
  | { type: 'join'; name: string; appearance: RatAppearance }
  | { type: 'updateMovement'; position: Vec3Data; rotation: QuatData; meshRotation: QuatData }
  | { type: 'shoot'; origin: Vec3Data; target: Vec3Data }
  | { type: 'hit'; victimId: string; damage: number }
  | { type: 'ping'; sentAt: number };

export type ServerMessage =
  | { type: 'welcome'; id: string; player: PlayerData }
  | { type: 'currentPlayers'; players: Record<string, PlayerData> }
  | { type: 'playerJoined'; player: PlayerData }
  | { type: 'playerMoved'; player: Pick<PlayerData, 'id' | 'x' | 'y' | 'z' | 'qx' | 'qy' | 'qz' | 'qw' | 'meshQx' | 'meshQy' | 'meshQz' | 'meshQw'> }
  | { type: 'playerShot'; shooterId: string; origin: Vec3Data; target: Vec3Data }
  | { type: 'playerDamaged'; id: string; hp: number; attackerId: string }
  | { type: 'playerDied'; victimId: string; killerId: string; killerName: string; victimName: string }
  | { type: 'scoreboardUpdate'; scores: ScoreEntry[] }
  | { type: 'playerRespawn'; id: string; x: number; y: number; z: number; hp: number }
  | { type: 'playerLeft'; id: string }
  | { type: 'gameWon'; winnerId: string; winnerName: string; kills: number }
  | { type: 'gameReset' }
  | { type: 'pong'; sentAt: number; receivedAt: number }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected:
- Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/shared/networkProtocol.ts
git commit -m "feat: define websocket protocol"
```

---

### Task 4: Add Worker Tooling And Wrangler Configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Modify: `wrangler.jsonc`
- Create: `worker-configuration.d.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run cf:types`, `npm run typecheck`, `npm run test`, `npm run dev:worker`, `npm run deploy`.

- [ ] **Step 1: Install Worker test and deploy tools**

```bash
npm install -D wrangler vitest @cloudflare/vitest-pool-workers @types/node
```

Expected:
- `package.json` and `package-lock.json` update.

- [ ] **Step 2: Update scripts in `package.json`**

Use these scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "cf:types": "wrangler types",
    "typecheck": "tsc --noEmit",
    "build": "npm run cf:types && tsc && vite build",
    "preview": "vite preview",
    "dev:worker": "npm run build && wrangler dev",
    "deploy": "npm run build && wrangler deploy",
    "test": "vitest run",
    "audit": "npm audit --audit-level=high"
  }
}
```

- [ ] **Step 3: Update `wrangler.jsonc`**

Replace the file with:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "rat-detective-preview",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-07-08",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/ws", "/health"]
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "GAME_ROOM",
        "class_name": "GameRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["GameRoom"]
    }
  ],
  "routes": [
    {
      "pattern": "rat-detective.animasai.co",
      "custom_domain": true
    }
  ],
  "observability": {
    "enabled": true,
    "logs": {
      "head_sampling_rate": 1
    }
  }
}
```

- [ ] **Step 4: Update TypeScript config**

In `tsconfig.json`, add generated Worker and Node types:

```json
{
  "compilerOptions": {
    "types": ["./worker-configuration.d.ts", "node"]
  }
}
```

Keep all existing compiler options unless they conflict.

- [ ] **Step 5: Update `.gitignore`**

Add:

```gitignore
.wrangler
.dev.vars*
coverage
test-results
playwright-report
```

- [ ] **Step 6: Create temporary Worker entrypoint so type generation can run**

Create `src/worker/index.ts`:

```ts
export { GameRoom } from './GameRoom';

export default {
  async fetch(): Promise<Response> {
    return Response.json({ ok: true, service: 'rat-detective' });
  },
} satisfies ExportedHandler<Env>;
```

Create `src/worker/GameRoom.ts`:

```ts
import { DurableObject } from 'cloudflare:workers';

export class GameRoom extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    return new Response('GameRoom not implemented yet', { status: 501 });
  }
}
```

- [ ] **Step 7: Generate types**

```bash
npm run cf:types
```

Expected:
- `worker-configuration.d.ts` is generated.
- `Env` includes `ASSETS` and `GAME_ROOM`.

- [ ] **Step 8: Verify build still works**

```bash
npm run build
```

Expected:
- Build passes with Worker source included.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json wrangler.jsonc .gitignore src/worker worker-configuration.d.ts
git commit -m "chore: configure cloudflare worker tooling"
```

---

### Task 5: Build And Test Pure Game-State Logic

**Files:**
- Create: `src/worker/gameState.ts`
- Create: `test/worker/gameState.test.ts`
- Create: `vitest.config.ts`
- Create: `test/tsconfig.json`
- Create: `test/env.d.ts`

**Interfaces:**
- Consumes: protocol constants and data types from `src/shared/networkProtocol.ts`.
- Produces: pure helpers used by `GameRoom`.

- [ ] **Step 1: Add pure game-state helpers**

Create `src/worker/gameState.ts`:

```ts
import {
  KILLS_TO_WIN,
  MAX_HP,
  type PlayerData,
  type RatAppearance,
  type ScoreEntry,
  type Vec3Data,
} from '../shared/networkProtocol';

export function createRandomCitySpawn(random = Math.random): Vec3Data {
  return {
    x: (random() - 0.5) * 100,
    y: 2,
    z: (random() - 0.5) * 100,
  };
}

export function createPlayer(
  id: string,
  name: string,
  appearance: RatAppearance,
  spawn: Vec3Data,
): PlayerData {
  return {
    id,
    name: name.trim() || 'Anonymous Rat',
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    meshQx: 0,
    meshQy: 0,
    meshQz: 0,
    meshQw: 1,
    hp: MAX_HP,
    kills: 0,
    deaths: 0,
    ...appearance,
  };
}

export function buildScoreboard(players: Iterable<PlayerData>): ScoreEntry[] {
  return Array.from(players)
    .map((player) => ({
      id: player.id,
      name: player.name,
      kills: player.kills,
      deaths: player.deaths,
    }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
}

export function clampDamage(damage: number): number {
  if (!Number.isFinite(damage)) return 0;
  return Math.max(0, Math.min(3, Math.trunc(damage)));
}

export interface HitResult {
  applied: boolean;
  killed: boolean;
  roundWon: boolean;
  damage: number;
}

export function applyHit(
  players: Map<string, PlayerData>,
  shooterId: string,
  victimId: string,
  requestedDamage: number,
): HitResult {
  const shooter = players.get(shooterId);
  const victim = players.get(victimId);
  const damage = clampDamage(requestedDamage);

  if (!shooter || !victim || shooterId === victimId || damage <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }
  if (shooter.hp <= 0 || victim.hp <= 0) {
    return { applied: false, killed: false, roundWon: false, damage: 0 };
  }

  victim.hp = Math.max(0, victim.hp - damage);

  if (victim.hp > 0) {
    return { applied: true, killed: false, roundWon: false, damage };
  }

  shooter.kills += 1;
  victim.deaths += 1;

  return {
    applied: true,
    killed: true,
    roundWon: shooter.kills >= KILLS_TO_WIN,
    damage,
  };
}

export function respawnPlayer(player: PlayerData, spawn: Vec3Data): PlayerData {
  player.hp = MAX_HP;
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.qx = 0;
  player.qy = 0;
  player.qz = 0;
  player.qw = 1;
  player.meshQx = 0;
  player.meshQy = 0;
  player.meshQz = 0;
  player.meshQw = 1;
  return player;
}

export function resetRound(players: Iterable<PlayerData>, spawnFor: (id: string) => Vec3Data): PlayerData[] {
  const resetPlayers: PlayerData[] = [];
  for (const player of players) {
    player.kills = 0;
    player.deaths = 0;
    resetPlayers.push(respawnPlayer(player, spawnFor(player.id)));
  }
  return resetPlayers;
}
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

Create `test/tsconfig.json`:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-pool-workers/types"]
  },
  "include": ["./**/*.ts", "../worker-configuration.d.ts", "../src/**/*.ts"]
}
```

Create `test/env.d.ts`:

```ts
declare module 'cloudflare:workers' {
  interface ProvidedEnv extends Env {}
}
```

- [ ] **Step 3: Add tests**

Create `test/worker/gameState.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RatAppearance } from '../../src/shared/networkProtocol';
import {
  applyHit,
  buildScoreboard,
  createPlayer,
  createRandomCitySpawn,
  resetRound,
} from '../../src/worker/gameState';

const appearance: RatAppearance = {
  hatType: 'fedora',
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

describe('game state', () => {
  it('creates deterministic city spawns when a random source is injected', () => {
    const values = [0, 1];
    const spawn = createRandomCitySpawn(() => values.shift() ?? 0.5);
    expect(spawn).toEqual({ x: -50, y: 2, z: 50 });
  });

  it('sorts the scoreboard by kills, deaths, then name', () => {
    const players = [
      createPlayer('b', 'Beta', appearance, { x: 0, y: 2, z: 0 }),
      createPlayer('a', 'Alpha', appearance, { x: 0, y: 2, z: 0 }),
      createPlayer('c', 'Charlie', appearance, { x: 0, y: 2, z: 0 }),
    ];
    players[0].kills = 2;
    players[0].deaths = 3;
    players[1].kills = 2;
    players[1].deaths = 1;
    players[2].kills = 1;

    expect(buildScoreboard(players).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies bounded damage and records kills/deaths', () => {
    const players = new Map([
      ['shooter', createPlayer('shooter', 'Shooter', appearance, { x: 0, y: 2, z: 0 })],
      ['victim', createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 })],
    ]);

    const result = applyHit(players, 'shooter', 'victim', 99);

    expect(result).toEqual({ applied: true, killed: true, roundWon: false, damage: 3 });
    expect(players.get('shooter')?.kills).toBe(1);
    expect(players.get('victim')?.deaths).toBe(1);
    expect(players.get('victim')?.hp).toBe(0);
  });

  it('ignores self hits and dead shooters', () => {
    const shooter = createPlayer('shooter', 'Shooter', appearance, { x: 0, y: 2, z: 0 });
    const victim = createPlayer('victim', 'Victim', appearance, { x: 0, y: 2, z: 0 });
    const players = new Map([
      ['shooter', shooter],
      ['victim', victim],
    ]);

    expect(applyHit(players, 'shooter', 'shooter', 1).applied).toBe(false);

    shooter.hp = 0;
    expect(applyHit(players, 'shooter', 'victim', 1).applied).toBe(false);
    expect(victim.hp).toBe(3);
  });

  it('resets round stats and respawns players', () => {
    const first = createPlayer('first', 'First', appearance, { x: 0, y: 2, z: 0 });
    first.kills = 4;
    first.deaths = 2;
    first.hp = 0;

    const resetPlayers = resetRound([first], () => ({ x: 9, y: 2, z: -9 }));

    expect(resetPlayers[0]).toMatchObject({ kills: 0, deaths: 0, hp: 3, x: 9, y: 2, z: -9 });
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```

Expected:
- All `gameState` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/worker/gameState.ts test vitest.config.ts package.json package-lock.json
git commit -m "test: cover game state rules"
```

---

### Task 6: Implement Worker And Durable Object Backend

**Files:**
- Modify: `src/worker/index.ts`
- Modify: `src/worker/GameRoom.ts`
- Create: `src/worker/validation.ts`
- Create: `src/worker/logging.ts`
- Modify: `test/worker/worker.test.ts`

**Interfaces:**
- Consumes: shared protocol and game-state helpers.
- Produces: `GET /health`, `GET /ws` WebSocket upgrade, broadcast behavior compatible with current client gameplay.

- [ ] **Step 1: Add structured logging helper**

Create `src/worker/logging.ts`:

```ts
type LogLevel = 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, data: Record<string, unknown> = {}): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}
```

- [ ] **Step 2: Add client message validation**

Create `src/worker/validation.ts` with bounded parsing. Keep it dependency-free:

```ts
import type { ClientMessage, HatTypeName, RatAppearance, Vec3Data, QuatData } from '../shared/networkProtocol';

const HAT_TYPES = new Set<HatTypeName>(['fedora', 'trilby', 'porkpie']);
const MAX_MESSAGE_BYTES = 8_192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorOr(value: unknown, fallback: number): number {
  const number = numberOr(value, fallback);
  return Math.max(0x000000, Math.min(0xffffff, Math.trunc(number)));
}

function vec3(value: unknown): Vec3Data | null {
  if (!isRecord(value)) return null;
  return {
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    z: numberOr(value.z, 0),
  };
}

function quat(value: unknown): QuatData | null {
  if (!isRecord(value)) return null;
  return {
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    z: numberOr(value.z, 0),
    w: numberOr(value.w, 1),
  };
}

function appearance(value: unknown): RatAppearance | null {
  if (!isRecord(value)) return null;
  const hatType = HAT_TYPES.has(value.hatType as HatTypeName) ? (value.hatType as HatTypeName) : 'fedora';
  return {
    hatType,
    hatColor: colorOr(value.hatColor, 0xdc4a3c),
    furColor: colorOr(value.furColor, 0xe8b84d),
    coatColor: colorOr(value.coatColor, 0xbe4545),
  };
}

export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (raw instanceof ArrayBuffer) return null;
  if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') return null;

  if (parsed.type === 'join') {
    const parsedAppearance = appearance(parsed.appearance);
    if (!parsedAppearance) return null;
    return {
      type: 'join',
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 32) : 'Anonymous Rat',
      appearance: parsedAppearance,
    };
  }

  if (parsed.type === 'updateMovement') {
    const position = vec3(parsed.position);
    const rotation = quat(parsed.rotation);
    const meshRotation = quat(parsed.meshRotation);
    if (!position || !rotation || !meshRotation) return null;
    return { type: 'updateMovement', position, rotation, meshRotation };
  }

  if (parsed.type === 'shoot') {
    const origin = vec3(parsed.origin);
    const target = vec3(parsed.target);
    if (!origin || !target) return null;
    return { type: 'shoot', origin, target };
  }

  if (parsed.type === 'hit') {
    return {
      type: 'hit',
      victimId: typeof parsed.victimId === 'string' ? parsed.victimId : '',
      damage: numberOr(parsed.damage, 0),
    };
  }

  if (parsed.type === 'ping') {
    return { type: 'ping', sentAt: numberOr(parsed.sentAt, Date.now()) };
  }

  return null;
}
```

- [ ] **Step 3: Implement Worker routing**

Replace `src/worker/index.ts` with:

```ts
import { DEFAULT_ROOM_NAME } from '../shared/networkProtocol';
import { log } from './logging';

export { GameRoom } from './GameRoom';

function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'rat-detective', runtime: 'cloudflare-workers' });
      }

      if (url.pathname === '/ws') {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return json({ error: 'Expected WebSocket upgrade' }, { status: 400 });
        }

        const roomName = url.searchParams.get('room') || DEFAULT_ROOM_NAME;
        const room = env.GAME_ROOM.getByName(roomName);
        return room.fetch(request);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      log('error', 'worker request failed', {
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      return json({ error: 'Internal server error' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Implement Durable Object schema and connection lifecycle**

Do not implement the Durable Object as one unreviewable paste. Build it in this order inside `src/worker/GameRoom.ts`:

1. Storage schema and hydration.
2. WebSocket accept/attachment lifecycle.
3. Join/current players/scoreboard.
4. Movement and visual shot broadcast.
5. Hit/death/scoring.
6. Pending respawn/reset events and alarms.
7. Close/error cleanup.

Replace `src/worker/GameRoom.ts` with a Durable Object that ultimately has this behavior:

- Creates tables in `ctx.blockConcurrencyWhile()`:
  - `players(id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`
  - `room_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)`
  - `pending_events(id TEXT PRIMARY KEY, type TEXT NOT NULL, player_id TEXT, due_at INTEGER NOT NULL)`
- Creates `CREATE INDEX IF NOT EXISTS idx_pending_events_due_at ON pending_events(due_at)`.
- Hydrates `this.players: Map<string, PlayerData>` from SQLite in the constructor.
- Accepts WebSocket upgrades with `this.ctx.acceptWebSocket(server)`.
- Assigns a `connectionId` with `crypto.randomUUID()`.
- Stores socket attachment with `server.serializeAttachment({ connectionId })`.
- On `join`, creates a `PlayerData`, persists it, updates socket attachment to `{ playerId }`, sends `welcome` and `currentPlayers`, broadcasts `playerJoined`, then broadcasts `scoreboardUpdate`.
- On `updateMovement`, updates only that player's position/quaternions, persists player, and broadcasts `playerMoved`.
- On `shoot`, broadcasts `playerShot` if shooter exists and is alive.
- On `hit`, calls `applyHit()`, persists shooter/victim, broadcasts damage/death/scoreboard, schedules respawn or round reset with `ctx.storage.setAlarm()`.
- On close/error, deletes the attached player, broadcasts `playerLeft`, and broadcasts scoreboard.
- In `alarm()`, processes due respawn/reset events from SQLite, broadcasts corresponding messages, deletes processed events, and schedules the next due event.
- Exposes small private methods rather than one large `webSocketMessage`: `handleJoin`, `handleMovement`, `handleShoot`, `handleHit`, `schedulePendingEvent`, `scheduleNextAlarm`, `processDueEvents`, `removePlayer`.

The WebSocket send helper should be:

```ts
private send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
```

Schedule pending events with:

```ts
private async schedulePendingEvent(type: 'respawn' | 'reset', playerId: string | null, dueAt: number): Promise<void> {
  const id = crypto.randomUUID();
  this.ctx.storage.sql.exec(
    'INSERT INTO pending_events (id, type, player_id, due_at) VALUES (?, ?, ?, ?)',
    id,
    type,
    playerId,
    dueAt,
  );
  await this.scheduleNextAlarm();
}
```

Schedule the next alarm from storage, not from in-memory state:

```ts
private async scheduleNextAlarm(): Promise<void> {
  const row = this.ctx.storage.sql
    .exec<{ due_at: number | null }>('SELECT MIN(due_at) AS due_at FROM pending_events')
    .one();

  if (typeof row?.due_at === 'number') {
    await this.ctx.storage.setAlarm(row.due_at);
  } else {
    await this.ctx.storage.deleteAlarm();
  }
}
```

Expected review checkpoints before moving to the client rewrite:

- `GET /health` passes.
- Non-WebSocket `/ws` returns 400.
- One WebSocket can join and receives `welcome`.
- A second WebSocket can join and both clients see the correct player messages.
- Movement sent by one client is broadcast to the other.
- Closing one socket removes only that player.
- A hit that kills a player schedules a respawn event in SQLite.
- A round-winning hit schedules reset through SQLite/alarm state, not `setTimeout`.

The broadcast helper should be:

```ts
private broadcast(message: ServerMessage, exceptPlayerId?: string): void {
  for (const ws of this.ctx.getWebSockets()) {
    const attachment = ws.deserializeAttachment() as { playerId?: string } | undefined;
    if (exceptPlayerId && attachment?.playerId === exceptPlayerId) continue;
    this.send(ws, message);
  }
}
```

Persist players with:

```ts
private persistPlayer(player: PlayerData): void {
  this.ctx.storage.sql.exec(
    `INSERT INTO players (id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    player.id,
    JSON.stringify(player),
    Date.now(),
  );
}
```

- [ ] **Step 5: Add a Worker integration smoke test**

Create `test/worker/worker.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker', () => {
  it('returns health', async () => {
    const response = await SELF.fetch('https://rat-detective.test/health');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'rat-detective',
      runtime: 'cloudflare-workers',
    });
  });

  it('rejects non-websocket /ws requests', async () => {
    const response = await SELF.fetch('https://rat-detective.test/ws');
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Expected WebSocket upgrade',
    });
  });
});
```

- [ ] **Step 6: Run tests and build**

```bash
npm run test
npm run build
```

Expected:
- Tests pass.
- Build passes.

- [ ] **Step 7: Commit**

```bash
git add src/worker test/worker package.json package-lock.json
git commit -m "feat: add durable object game room"
```

---

### Task 7: Replace Socket.IO Client With Native WebSocket

**Files:**
- Modify: `src/network/NetworkManager.ts`
- Modify: `package.json` in Task 9 after server parity is verified

**Interfaces:**
- Consumes: `ClientMessage` and `ServerMessage`.
- Produces: same public callbacks used by `src/main.ts`, plus `onWelcome`, `onConnectError`, `isConnected`.

- [ ] **Step 1: Remove Socket.IO imports**

Replace:

```ts
import { io, Socket } from 'socket.io-client';
```

with:

```ts
import type { ClientMessage, PlayerData, RatAppearance, ScoreEntry, ServerMessage } from '../shared/networkProtocol';
```

- [ ] **Step 2: Replace socket field and constructor URL logic**

Use these fields:

```ts
private socket: WebSocket | null = null;
private serverUrl?: string;
private pendingJoin: { name: string; appearance: RatAppearance } | null = null;
```

Add:

```ts
private getWebSocketUrl(): string {
  if (this.serverUrl) return this.serverUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
```

In the constructor, store `serverUrl` but do not open until `connect()`:

```ts
this.serverUrl = serverUrl;
```

- [ ] **Step 3: Add send and dispatch helpers**

```ts
private send(message: ClientMessage): void {
  if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
  this.socket.send(JSON.stringify(message));
}

private handleMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'welcome':
      this.myId = message.id;
      this.onWelcome?.(message.player);
      break;
    case 'currentPlayers':
      for (const [id, data] of Object.entries(message.players)) {
        if (id === this.myId) continue;
        this.spawnRemoteRat(id, data);
      }
      break;
    case 'playerJoined':
      if (message.player.id !== this.myId) this.spawnRemoteRat(message.player.id, message.player);
      break;
    case 'playerMoved':
      this.applyRemoteMovement(message.player);
      break;
    case 'playerShot':
      this.applyRemoteShot(message);
      break;
    case 'playerDamaged':
      this.applyDamage(message);
      break;
    case 'playerDied':
      this.applyDeath(message);
      break;
    case 'scoreboardUpdate':
      this.onScoreboardUpdate?.(message.scores);
      break;
    case 'playerRespawn':
      this.applyRespawn(message);
      break;
    case 'playerLeft':
      this.removeRemoteRat(message.id);
      break;
    case 'gameWon':
      this.onGameWon?.(message);
      break;
    case 'gameReset':
      this.onGameReset?.();
      break;
    case 'pong':
      break;
    case 'error':
      console.warn('[Network]', message.message);
      break;
  }
}
```

Move existing Socket.IO listener bodies into `applyRemoteMovement`, `applyRemoteShot`, `applyDamage`, `applyDeath`, and `applyRespawn` private methods. This keeps the behavioral logic readable and limits the WebSocket rewrite.

- [ ] **Step 4: Implement `connect()`**

```ts
public onWelcome: ((player: PlayerData) => void) | null = null;
public onConnectError: ((message: string) => void) | null = null;

connect(name: string, options: RatAppearance): void {
  this.pendingJoin = { name, appearance: options };
  this.socket = new WebSocket(this.getWebSocketUrl());

  this.socket.addEventListener('open', () => {
    if (!this.pendingJoin) return;
    this.send({
      type: 'join',
      name: this.pendingJoin.name,
      appearance: this.pendingJoin.appearance,
    });
  });

  this.socket.addEventListener('message', (event) => {
    try {
      this.handleMessage(JSON.parse(event.data) as ServerMessage);
    } catch (error) {
      console.warn('[Network] Ignored malformed server message', error);
    }
  });

  this.socket.addEventListener('close', () => {
    console.log('[Network] Disconnected from server');
  });

  this.socket.addEventListener('error', () => {
    this.onConnectError?.('Could not connect to the game server.');
  });
}
```

- [ ] **Step 5: Update outbound methods**

Replace `.emit()` calls with:

```ts
sendMovement(entity: RatEntity): void {
  const now = performance.now();
  if (now - this.lastSendTime < SEND_INTERVAL) return;
  this.lastSendTime = now;

  const p = entity.body.position;
  const q = entity.body.quaternion;

  this.send({
    type: 'updateMovement',
    position: { x: p.x, y: p.y, z: p.z },
    rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
    meshRotation: {
      x: entity.mesh.quaternion.x,
      y: entity.mesh.quaternion.y,
      z: entity.mesh.quaternion.z,
      w: entity.mesh.quaternion.w,
    },
  });
}

sendShoot(origin: THREE.Vector3, target: THREE.Vector3): void {
  this.send({
    type: 'shoot',
    origin: { x: origin.x, y: origin.y, z: origin.z },
    target: { x: target.x, y: target.y, z: target.z },
  });
}

sendHit(victimId: string, damage: number): void {
  this.send({ type: 'hit', victimId, damage });
}
```

- [ ] **Step 6: Update cleanup**

```ts
destroy(): void {
  for (const [id] of this.remoteRats) {
    this.removeRemoteRat(id);
  }
  this.socket?.close(1000, 'client destroyed');
  this.socket = null;
}
```

- [ ] **Step 7: Build**

```bash
npm run build
```

Expected:
- Build passes.

- [ ] **Step 8: Commit**

```bash
git add src/network/NetworkManager.ts
git commit -m "feat: use native websocket client"
```

---

### Task 8: Spawn Local Player From Server Welcome

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `NetworkManager.onWelcome(player: PlayerData)`.
- Produces: local rat spawn matches server-owned player state.

- [ ] **Step 1: Move player creation into a helper**

In `src/main.ts`, create:

```ts
function spawnLocalPlayer(playerName: string, appearance: RatOptions, spawn: THREE.Vector3): void {
  rat = new RatController(scene, world, camera, playerName, appearance, spawn);
  cheeseGun.setPlayer(camera, rat.entity);
  rat.entity.isPlayer = true;
  networkManager?.setLocalPlayer(rat.entity);
}
```

- [ ] **Step 2: Create the network manager before spawning**

In the enter button handler:

```ts
const localAppearance = generateRandomAppearance();
networkManager = new NetworkManager(scene, world, cheeseGun);
wireNetworkCallbacks();
networkManager.connect(playerName, localAppearance);
```

Then in `wireNetworkCallbacks()`:

```ts
networkManager!.onWelcome = (player) => {
  spawnLocalPlayer(
    player.name,
    {
      hatType: player.hatType,
      hatColor: player.hatColor,
      furColor: player.furColor,
      coatColor: player.coatColor,
    },
    new THREE.Vector3(player.x, player.y, player.z),
  );
};
```

Move the existing scoreboard, damage, respawn, kill feed, game won, and game reset callback assignments into `wireNetworkCallbacks()` so the click handler stays short.

- [ ] **Step 3: Handle connection failure**

Add:

```ts
networkManager.onConnectError = (message) => {
  hasJoined = false;
  enterBtn.removeAttribute('disabled');
  console.warn(message);
};
```

Do not hide the title screen permanently until `onWelcome` fires. This avoids the current failure mode where the player enters a disconnected game.

- [ ] **Step 4: Keep pointer lock and audio user-gesture based**

Call `renderer.domElement.requestPointerLock().catch(() => undefined)` from the click handler, not from a later async callback, because browsers require the user gesture.

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected:
- Build passes.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "fix: spawn player from server welcome"
```

---

### Task 9: Remove Legacy Server And Socket.IO Dependencies

**Files:**
- Delete: `server/`
- Delete: `railway.json`
- Delete: `src/world/LevelMap.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md` later

**Interfaces:**
- Consumes: verified Worker and native WebSocket client.
- Produces: no Railway/Socket.IO runtime dependencies.

- [ ] **Step 1: Remove Socket.IO client dependency**

```bash
npm uninstall socket.io-client
```

Expected:
- `package.json` no longer includes `socket.io-client`.
- `package-lock.json` no longer includes Socket.IO client packages unless pulled by another dependency.

- [ ] **Step 2: Delete legacy backend files**

```bash
rm -rf server railway.json src/world/LevelMap.ts
```

- [ ] **Step 3: Search for stale runtime references**

```bash
rg -n "socket\\.io|socket.io|Railway|railway|VITE_SERVER_URL|LevelMap|rat-detective-online-production.up.railway.app" .
```

Expected:
- No matches in runtime source.
- Matches in this plan document are acceptable.

- [ ] **Step 4: Audit and build**

```bash
npm run audit
npm run test
npm run build
```

Expected:
- No high-severity audit failures.
- Tests pass.
- Build passes.

- [ ] **Step 5: Commit**

```bash
git add -A package.json package-lock.json server railway.json src/world
git commit -m "chore: remove legacy socket server"
```

---

### Task 10: Local Cloudflare Smoke Test

**Files:**
- Create: `scripts/smoke-ws.mjs`
- Modify: no source files unless verification finds a bug.

**Interfaces:**
- Consumes: `npm run dev:worker`.
- Produces: local same-origin game at Wrangler URL.

- [ ] **Step 1: Add a two-client WebSocket smoke script**

Create `scripts/smoke-ws.mjs`:

```js
const url = process.argv[2] ?? 'ws://127.0.0.1:8787/ws';

const appearance = {
  hatType: 'fedora',
  hatColor: 0xdc4a3c,
  furColor: 0xe8b84d,
  coatColor: 0xbe4545,
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectClient(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`${name} did not receive welcome in time`));
    }, 5_000);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'join', name, appearance }));
    });

    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      messages.push(message);
      if (message.type === 'welcome') {
        clearTimeout(timeout);
        resolve({ ws, id: message.id, messages });
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`${name} websocket error`));
    });
  });
}

const first = await connectClient('Smoke One');
const second = await connectClient('Smoke Two');
await wait(500);

const firstSawSecond = first.messages.some(
  (message) => message.type === 'playerJoined' && message.player.name === 'Smoke Two',
);

if (!firstSawSecond) {
  first.ws.close();
  second.ws.close();
  throw new Error('First client did not receive playerJoined for second client');
}

first.ws.send(JSON.stringify({
  type: 'updateMovement',
  position: { x: 1, y: 2, z: 3 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  meshRotation: { x: 0, y: 0, z: 0, w: 1 },
}));

await wait(500);

const secondSawMovement = second.messages.some(
  (message) => message.type === 'playerMoved' && message.player.id === first.id,
);

first.ws.close(1000, 'smoke complete');
second.ws.close(1000, 'smoke complete');

if (!secondSawMovement) {
  throw new Error('Second client did not receive movement from first client');
}

console.log('WebSocket smoke passed');
```

- [ ] **Step 2: Start local Worker**

```bash
npm run dev:worker
```

Expected:
- Wrangler starts a local URL, usually `http://127.0.0.1:8787`.
- Static assets are served from `dist`.

- [ ] **Step 3: Verify health endpoint**

```bash
curl -i http://127.0.0.1:8787/health
```

Expected:
- HTTP 200.
- JSON includes `"ok":true`.

- [ ] **Step 4: Run WebSocket smoke**

```bash
node scripts/smoke-ws.mjs ws://127.0.0.1:8787/ws
```

Expected:
- Output includes `WebSocket smoke passed`.
- Wrangler logs show two joins, one movement update, and clean closes.

- [ ] **Step 5: Browser smoke**

Open `http://127.0.0.1:8787/` in Chrome with WebGL enabled. Verify:

- Title screen appears.
- Clicking enter does not produce a Railway or Socket.IO request.
- DevTools console shows no WebSocket 404.
- Network tab shows `ws://127.0.0.1:8787/ws`.
- Scoreboard contains the local player after `welcome`.
- In a second browser tab, a second player joins and both scoreboards show both players.

- [ ] **Step 6: Fix issues found by the smoke**

If the smoke fails, make the smallest source change that fixes the observed failure, then rerun:

```bash
npm run test
npm run build
node scripts/smoke-ws.mjs ws://127.0.0.1:8787/ws
```

- [ ] **Step 7: Stop the local Worker**

Stop the `npm run dev:worker` process with `Ctrl-C`.

Expected:
- No local Wrangler/Vite process is left running.

- [ ] **Step 8: Commit smoke script and fixes if any**

```bash
git add scripts/smoke-ws.mjs src test wrangler.jsonc package.json package-lock.json
git commit -m "fix: pass local worker smoke test"
```

Commit `scripts/smoke-ws.mjs` even if no source fixes were needed.

---

### Task 11: Deploy To Cloudflare And Verify Production

**Files:**
- Create: no committed files
- Modify: no source files unless deployment reveals a config issue.

**Interfaces:**
- Consumes: Cloudflare account/auth already configured on the machine.
- Produces: playable production game at `https://rat-detective.animasai.co/` with a recorded rollback point.

- [ ] **Step 1: Run full local gate**

```bash
npm run audit
npm run test
npm run build
```

Expected:
- Audit has no high-severity failures.
- Tests pass.
- Build passes.

- [ ] **Step 2: Record the active deployment before deploying**

```bash
npx wrangler deployments status --json > /tmp/rat-detective-predeploy-deployments.json
cat /tmp/rat-detective-predeploy-deployments.json
```

Expected:
- The current active Worker deployment is recorded outside the repo.
- If `deployments status` fails because no Worker deployment exists yet, record that output in `/tmp/rat-detective-predeploy-deployments.json` and continue.

- [ ] **Step 3: Deploy**

```bash
npm run deploy
```

Expected:
- Wrangler deploy succeeds.
- Output references `rat-detective-preview` or the configured Worker service name.

- [ ] **Step 4: Verify production health**

```bash
curl -i https://rat-detective.animasai.co/health
```

Expected:
- HTTP 200.
- JSON includes `"ok":true`.

- [ ] **Step 5: Verify production WebSocket smoke**

```bash
node scripts/smoke-ws.mjs wss://rat-detective.animasai.co/ws
```

Expected:
- Output includes `WebSocket smoke passed`.

- [ ] **Step 6: Verify production browser behavior**

Open `https://rat-detective.animasai.co/` in Chrome and verify:

- Static app loads from Cloudflare.
- Clicking enter opens `wss://rat-detective.animasai.co/ws`.
- No request goes to Railway.
- No request goes to Netlify for runtime.
- Scoreboard shows the local player.
- Two-tab join works.
- Refresh removes the previous player and rejoins cleanly.

- [ ] **Step 7: Tail logs if needed**

```bash
npx wrangler tail
```

Expected:
- Structured JSON logs are readable.
- No repeated unhandled exceptions during join, movement, shoot, hit, disconnect.

- [ ] **Step 8: Roll back immediately if production smoke fails**

If health, WebSocket smoke, or browser smoke fails and the fix is not obvious within a few minutes:

```bash
npx wrangler rollback --message "Rollback Rat Detective Cloudflare migration"
curl -i https://rat-detective.animasai.co/health
```

Expected:
- The previous Worker version becomes active.
- The production site returns to the prior known behavior while the fix is made on the branch.

Do not use rollback as a substitute for fixing the branch. After rollback, fix locally, rerun Task 10, and repeat Task 11 from Step 1.

- [ ] **Step 9: Commit deployment config fixes if any**

```bash
git add wrangler.jsonc src package.json package-lock.json worker-configuration.d.ts
git commit -m "fix: verify cloudflare deployment"
```

Skip this commit if no fixes were needed.

---

### Task 12: Open-Source And Portfolio Polish

**Files:**
- Modify: `README.md`
- Create: `LICENSE` after Tyler confirms the exact copyright holder
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.editorconfig`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Cloudflare deployment URL and final scripts.
- Produces: repo that a reviewer can install, run, test, and understand.

- [ ] **Step 1: Update README**

Rewrite `README.md` to include:

````md
# Rat Detective Online

Rat Detective Online is a browser-based multiplayer noir game built with Three.js, Cannon-es, Vite, and Cloudflare Durable Objects.

## Play

Production: https://rat-detective.animasai.co/

## Local Development

```bash
npm install
npm run dev
```

For the Cloudflare Worker and multiplayer backend:

```bash
npm run dev:worker
```

## Checks

```bash
npm run test
npm run build
npm run audit
```

## Architecture

- Vite builds the static Three.js client into `dist`.
- Cloudflare Workers serves the static assets.
- `/ws` routes to a Durable Object room.
- The Durable Object coordinates players, scoring, respawns, and round reset.

## Controls

- WASD or arrow keys to move
- Space to jump
- Mouse to look
- Left click to fire

## Project Status

This is a portfolio game and open-source learning project. The current multiplayer model validates basic message shape and scoring rules, but it is not a competitive anti-cheat server.
````

Keep the README concise and remove stale Railway/Netlify instructions.

- [ ] **Step 2: Add contribution guide**

Create `CONTRIBUTING.md`:

````md
# Contributing

## Setup

```bash
npm install
npm run dev
```

Use `npm run dev:worker` when working on multiplayer behavior.

## Before Opening A Pull Request

```bash
npm run test
npm run build
npm run audit
```

Keep gameplay changes small and explain how they were smoke-tested in the browser.
````

- [ ] **Step 3: Add security policy**

Create `SECURITY.md`:

```md
# Security

Please report security issues privately to the repository owner instead of opening a public issue.

This project is a browser game and portfolio project. Do not send secrets, account tokens, or private infrastructure details in bug reports.
```

- [ ] **Step 4: Add editor config**

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.{ts,tsx,js,json,jsonc,md,yml,yaml}]
indent_size = 2
```

- [ ] **Step 5: Add CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run test
      - run: npm run build
      - run: npm run audit
```

- [ ] **Step 6: Add license after owner confirmation**

Recommended license for this portfolio project: MIT.

Before creating `LICENSE`, Tyler should provide the exact copyright holder string. If Tyler approves `MayberryDT`, create the MIT license with:

```txt
MIT License

Copyright (c) 2026 MayberryDT

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 7: Verify docs and CI config**

```bash
npm run test
npm run build
npm run audit
```

Expected:
- All checks pass.

- [ ] **Step 8: Commit**

```bash
git add README.md CONTRIBUTING.md SECURITY.md .editorconfig .github/workflows/ci.yml LICENSE
git commit -m "docs: prepare project for open source"
```

If `LICENSE` is not created yet because Tyler has not confirmed the holder string, omit it from `git add`.

---

### Task 13: Final Release Verification

**Files:**
- No required source changes unless verification finds a bug.

**Interfaces:**
- Consumes: completed cleanup branch.
- Produces: final release confidence before PR/open-sourcing.

- [ ] **Step 1: Static search gate**

```bash
rg -n "Railway|railway|Netlify|netlify|socket.io|Socket.IO|VITE_SERVER_URL|LevelMap|rat-detective-online-production.up.railway.app" src package.json README.md wrangler.jsonc server railway.json 2>/dev/null
```

Expected:
- No stale runtime references.
- README may mention Netlify/Railway only in a historical note if that note is intentionally kept.

- [ ] **Step 2: Full check gate**

```bash
npm run audit
npm run test
npm run build
```

Expected:
- No high-severity audit failures.
- Tests pass.
- Build passes.

- [ ] **Step 3: Production smoke gate**

Verify `https://rat-detective.animasai.co/` in Chrome:

- First viewport shows the game title screen and logo.
- Join succeeds.
- Scoreboard shows the player.
- A second tab joins and appears on both scoreboards.
- Closing the second tab removes that player within a few seconds.
- Console has no repeated Worker errors, WebSocket 404s, Railway URLs, or Socket.IO polling requests.

- [ ] **Step 4: Code review gate**

Run a review focused on:

- Durable Object hibernation state restoration.
- Alarm scheduling for respawn/reset.
- WebSocket close cleanup.
- Message validation and damage clamping.
- No stale Socket.IO/Railway code.
- No accidental deletion of useful non-level local gameplay fixes.

- [ ] **Step 5: Final commit if verification fixes were needed**

```bash
git add src test README.md package.json package-lock.json wrangler.jsonc worker-configuration.d.ts
git commit -m "fix: address release verification"
```

Skip this commit if no fixes were needed.

---

## Deferred Work

- Server-authoritative projectile physics and anti-cheat. The cleanup release should clamp and validate client hit messages, but full authoritative physics is a separate design.
- Multiple rooms/private lobbies. The cleanup release should use the `public` room only.
- Cloudflare Vite plugin migration. The cleanup release can use `npm run build && wrangler dev`; tighter Vite/Worker dev integration can come later.
- Cloudflare GitHub auto-deploy. Manual `wrangler deploy` is enough for the first consolidated Cloudflare release.
- Netlify site shutdown and domain cleanup. Do this after Cloudflare production is verified, not during the backend migration.

## Self-Review

- Spec coverage: The plan covers the bad level rollback, Cloudflare Worker plus Durable Object migration, dead Railway root cause, Netlify/Railway consolidation, tests, audit fixes, deployment verification, and open-source polish.
- Placeholder scan: The only explicit decision left is the license holder string, because that must come from Tyler before public release. All executable implementation tasks have concrete files and commands.
- Type consistency: Protocol names in `ClientMessage` and `ServerMessage` match the planned `NetworkManager`, `GameRoom`, and test usage.
