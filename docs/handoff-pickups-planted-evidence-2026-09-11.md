# Handoff — Pickups & Planted Evidence (2026-09-11)

**For:** the next agent picking up this work.
**Read with:** [current-state.md](current-state.md), [AGENTS.md](../AGENTS.md),
and the receipt [pickups-planted-evidence-2026-09-11.md](verification/pickups-planted-evidence-2026-09-11.md).

## Continuation status

The September 11 continuation fixed ignored browser incident flags, immediately
replenished traps (including on restore), and missing bot speed effects. Burst
lift is now .2; other durations/count/speed values are retained. **881 tests**,
typecheck, build, audit and a two-client local Worker probe pass. Bounded browser
review checked default/classic behavior; human feel remains unverified.
Use `&mute=1` for all local agent browser tests. Commit/release are authorized;
consult the [receipt](verification/pickups-planted-evidence-2026-09-11.md) for final
release details. The remainder preserves the original implementation handoff.

## Original TL;DR

The pickup and Planted Evidence update is **fully implemented, tested and
buildable**, and it is **running locally as a playable preview**. It is
**not committed, not deployed and not human-playtested**. The next agent's job is
to get it played, tune it, then commit and release.

## Tree state

- Repo `/home/tyler/Projects/rat-detective`, branch `main`, HEAD `ae2fdb3`
  ("Restore responsive shooting and smooth world playback").
- The tree is **dirty on purpose**. This work is 24 modified files plus 6 new
  files (including this handoff), all uncommitted. Do not reset, clean or check
  out over it.
- `AGENTS.md`, `docs/current-state.md`, `docs/README.md` were updated with the new
  invariants. Those bullets are the design constraints for this feature now.
- **Protocol moved 8 → 9** (`src/shared/networkProtocol.ts`). Any hosted preview or
  production worker must be released in coordination with this client.

## What is implemented

Three timed pickups (new subsystem) and a replacement incident. Tunables live in
`src/shared/pickups.ts` (`PICKUP_TUNING`) and `src/shared/chaosState.ts`
(`INCIDENT_TUNING`, `COUNTERFEIT_IDS`).

| Piece | Where it lives |
| --- | --- |
| Pickup kinds, tuning, copy, authored anchors, buff helpers | `src/shared/pickups.ts` (new) |
| Spawn/claim/effect simulation | `src/shared/ChaosSimulation.ts` — `seedPickups` :114, `stepPickups` :215, `drainPickupEvents` :242 |
| Counterfeit placement/detonation/trap | same file — `syncExtraCases` :134, `placeFake` :150, `detonateFake` :178, `stepFakes` :200 |
| Ironclad reflection (authority) | same file, the `target.kind==='rat'` branch of the shot loop |
| Incident ids, roster, `isIncidentId` | `src/shared/incidentCatalog.ts` :17, `incidentRoster` :24 |
| Fake flag / pickup+buff snapshot fields | `src/shared/chaosState.ts` |
| Snapshot validation | `src/shared/messageValidation.ts` (`parseChaos`, `playerHealed` case) |
| Room config + heal broadcast | `src/worker/GameRoom.ts` — `configureIncidents` :231, `configureIncident` :245, `applyPickupEvents` |
| URL params / gating | `src/worker/index.ts` :80-90 |
| Pickup world visuals | `src/prototype/PickupVisual.ts` (new), wired in `ChaosView.syncPickups` :213 |
| Buff HUD + claim toast | `ChaosView.updateBuffs` :233, `noteLocalBuffs` :223, `toast()` |
| Occluded counterfeit outline | `src/prototype/CaseBeacon.ts` (occluded variant), `ExtraCaseVisual.ts` |
| Local prediction reads the coat | `src/weapons/CheeseGun.ts` `setProtectedRats`, `GameSession.applyPickupState` :326 |
| Hot Pursuit speed | `src/player/RatController.ts` `setSpeedScale` :67, applied per frame from the snapshot |
| Bot behaviour | `src/shared/ObjectiveBotBrain.ts` — `wantedPickup` :110, crypto filter in the objective list, trap avoidance before the `return` |
| Incident ledger copy | `src/prototype/DispatchHud.ts`, `src/ui/municipalQuips.ts`, `src/prototype/incidentArtwork.ts` |

### Behaviour summary

- **Ironclad Alibi** 12 s: a ball that hits the protected rat reflects with the
  original shooter and finite budget, and is explicitly *not* marked as a wall
  bounce. The carried case stays independently shootable.
- **Hot Pursuit** 1.45× for 10 s: client-side speed driven by the authoritative
  buff snapshot. No trail, no extra attack.
- **Quick Fix**: instant `MAX_HP`. Leaves the site available at full health. No
  overheal, regeneration, resurrection or immunity.
- Six sites (two per kind) snapped to verified-clear street pavement via
  `resolvePickupPoints` + `worldSpawnPoints`. 20 s respawn. Claims are atomic.
  Effects refresh rather than stack, clear on death and on match reset, and do not
  persist across a room restart.
- **Planted Evidence** (default incident): 10 counterfeits + the genuine case.
  Occluded outline, no HOT CASE label, never equips. Shooting one detonates a
  finite cheese burst attributed to the initiating shot; walking into one is a
  lethal neutral trap (kills through Ironclad; emitted balls still reflect).
  Survivors are removed quietly at expiry. The genuine case, its holder and all
  three assignments stay live.
- **Classic mode** restores the retired Evidence Tampering missile incident and
  its objective suspension.

## Running the playable preview

The local dev server is currently up on **http://127.0.0.1:5190**. It was started
detached so it survives session churn:

```sh
cd /home/tyler/Projects/rat-detective
setsid nohup env PORT=5190 npm run dev > /tmp/rd-dev-5190.log 2>&1 < /dev/null &
```

`npm run dev` runs `vite build --watch` plus `wrangler dev --local`, so it serves
this repo's client and worker with a local Durable Object. It is **not** the 5173
server (that belongs to the separate `rat-detective-optimization` checkout — leave
it alone) and not the 5174 hosted relay.

Room URLs (private practice only; local origin required):

```
http://127.0.0.1:5190/?room=graybox-practice-pickups-3&bots=11&incident=planted-evidence
http://127.0.0.1:5190/?room=graybox-practice-classic-3&bots=11&incidents=classic&incident=evidence-tampering
```

- `room` must match `graybox-practice-[a-z0-9-]+`, `bots=11` enables the
  browser-hosted practice bots (`NormalGameBots`, localhost-only).
- `incident=<id>` pins **every** Dispatch roll to one incident so a reviewer does
  not have to wait for the shuffle. `incident=auto` clears it. Value `auto` or a
  valid id only.
- `incidents=classic` swaps the evidence incident in the room roster.
- Both params require a private practice room **and** a matching local `Origin`,
  and only apply while the room is empty (`configureIncident*` returns false with a
  409 once someone is connected — use a fresh room name).

Known-good probe from the shell: the practice rooms answer the WS handshake with
`101 Switching Protocols` when the `Origin` header matches. Plain `curl` without
the upgrade headers returns `Expected WebSocket upgrade`.

## Verification status

Passing as of this handoff:

- `npx tsc --noEmit` and `npx tsc --noEmit -p test/tsconfig.json` — clean.
- `npx vitest run` — 130 worker tests pass.
- `npx vitest run --config vitest.client.config.ts` — 722 client tests pass.
- `npm run build` — succeeds (the >500 kB chunk warning is pre-existing).
- New focused suites: `test/client/pickupSystem.test.ts` (9),
  `test/client/plantedEvidence.test.ts` (8), plus a forced-incident case in
  `test/client/dispatchIncidents.test.ts`.

**Not done — this is the actual remaining work:** playtesting (pickup feel, coat
readability, trap fairness, speed handling, incident tempo), multiplayer, real
phone, and any FPS measurement. Also not run: `npm test` end-to-end as one command
(the suites were run individually) and `npm run audit`.

## Open decisions and tuning knobs

- Counterfeit count is **10**, confirmed by Tyler, adjustable via
  `COUNTERFEIT_IDS` in `src/shared/chaosState.ts`.
- Durations and the speed multiplier are first-pass values with no approved
  numbers behind them: Ironclad 12 s, Hustle 10 s / 1.45×, respawn 20 s, claim
  radius 1.5 (`PICKUP_TUNING`). Fake burst is 9 balls at 96 u/s, spread .7.
- Whether pickups should exist in public production at all, and whether the default
  incident really ships as Planted Evidence, are product calls. Note that
  deploying this changes production behaviour for everyone by default.

## Gotchas a successor must not break

- **Do not re-suspend objectives in the default incident.** The suspension path
  still exists and is correct, but only `evidence-tampering` (classic) may reach it.
  `AssignmentRules.setPhase(now, tampering)` must keep receiving `false` for
  Planted Evidence.
- **Counterfeits are `STATIC` bodies** parked at their spawn (`createCase(id, true)`).
  Placement validity and the contact trap depend on them not drifting. If you
  change that, re-check `placeFake`'s floor probes and the 12-unit living-rat
  clearance.
- **`enforceIncidentRoster()` must run after `chaos.evidenceMode` is set** — GameRoom
  does this in `startChaos`. It drops a restored incident the room's roster no
  longer runs.
- **Buffs are deliberately not persisted.** `restore()` does not rehydrate them, so
  a room restart clears effects and re-arms claimed pickup sites. That is intended.
- **The carriage geometry quirk:** the rat's own collision sphere can absorb a shot
  aimed at a carried case from some angles, so a coat reflects it before it reaches
  the case. That is pre-existing rat geometry, not the coat creating a shield. Do
  not "fix" it by moving projectile origins or enlarging the case.
- **Local prediction must keep seeing the coat.** `GameSession.applyPickupState`
  feeds `CheeseGun.setProtectedRats`; if that wiring is dropped, the local ball
  will pass through a protected rat and then snap on correction.
- Bot trap avoidance is a **local steering nudge**, not a routed hazard field. A
  surprised bot can still touch a counterfeit. Do not claim otherwise.

## Suggested next steps

1. Play both rooms. Judge the three tunables (Ironclad duration, Hustle
   multiplier/duration, counterfeit count and burst size) and the readability of
   the occluded outline versus the real case.
2. Adjust `PICKUP_TUNING` / `INCIDENT_TUNING` as needed; re-run the two focused
   suites plus full typecheck and build.
3. Update the receipt and `current-state.md` with what was actually accepted.
4. Only then: commit (the tree also contains the previously accepted responsive
   shooting work at HEAD, so commit deliberately) and, with explicit release
   authorization, deploy — remembering the protocol bump to 9 requires a
   coordinated client and Worker release.
