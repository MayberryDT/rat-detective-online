# Incident roster playtest handoff — 2026-09-09

This replaces conflicting earlier incident audio/ammo guesses. Tyler playtested the revised roster and is handing remaining issues to a new coding agent. **Implementation request, not another design pass.**

## Where to work

- Isolated worktree: `/home/tyler/Projects/rat-detective-incident-roster`
- Branch: `codex/incident-roster-update`
- Base commit: `11601a9` (`Checkpoint full game and fifty-rat multiplayer optimizations`)
- The live checkout `/home/tyler/Projects/rat-detective` is a **dirty capacity/multiplayer tree**. Do not edit it. Do not reset, clean, or assume HEAD is production.
- Do **not** deploy. Do **not** commit unless Tyler asks. Public production (`https://ratdetective.online/`, room `public-live-v2`) is unchanged.

Preview after `npm run visual:build`:

`http://127.0.0.1:5180/stage-prototype.html?bots=11`

Esc opens the pause menu. **Play / resume** is the only way back into pointer lock. Pick an incident, then **Start selected incident**. Hard-refresh after rebuilds.

## What already landed (do not redo)

Ten-incident roster is in. Improper Disposal, Pressure Surge, Scattershot, Ricochet Racket are preserved. Return to Sender and Cheesequake are gone; Delayed Reaction and Big Cheese replaced them. Evidence Tampering has **eight** cases (7 extras), pickup blocked, unclaimed missiles can hit everyone. Popcorn is **per-shot**, currently **1 second** after fire, children loft and cannot pop. Crossfire uses a depth-tested red shell (not x-ray). Pointer-lock menu click-through was permanently fixed in `src/session/PointerLockMenu.ts` — keep that helper; do not restore canvas-click auto-lock or a 250ms swallow timer.

Latest checks in this worktree: typecheck plus 484 tests (97 worker + 365 client + 22 scripts) after the eight-case/audio/menu work. Rebuild visual before sending Tyler a URL. User handles gameplay feel.

Original approved design (still authoritative except where Tyler overrode it below): `/home/tyler/Downloads/rat-detective-incident-roster-update/INCIDENT-ROSTER-UPDATE.md`.

## Remaining work — Tyler’s latest playtest

### 1. Bad Ammunition shoots too many balls

**Current bug:** `malfunctionPattern()` in `src/shared/ChaosSimulation.ts` can fire 1–6 balls, and ~45% of pulls also queue late extras. It feels like a missile hose. That is not the point.

**Required:** Most shots are **one crooked ball**. **Occasionally** two or three. **Never go straight.** Do not look like Scattershot’s five-ball fan. No jams, no zero-ball pulls, no 4–6 volleys, no late coughs unless they are rare and still 2–3 total.

Suggested first distribution (tuning, not a new design round):

- ~70% one ball, large aim error (never the exact aim vector)
- ~20% two balls
- ~10% three balls
- drop `pendingMalfunctions` late extras unless a single delayed second ball is obviously better in play

Keep ordinary fire-rate. Preserve no self-damage. Update `test/client/dispatchIncidents.test.ts` which currently expects uneven multi-ball volleys.

### 2. Evidence Tampering shot response is too meek

Tyler: he needs to **shoot a flying case**, make it **bounce**, and have it **go crazy fast and ricochet off buildings**.

**Current code:** a bullet hitting an Evidence case already reflects the ball and sets case velocity to **110** with **y+=18** (`ChaosSimulation` case-hit path). Auto-launch uses `INCIDENT_TUNING.caseMissileSpeed` **64**. `stepCaseMissile` then **caps vertical speed at 18** and, if speed drops below 18, resets to `64 * 0.72`. That cap/reboost is killing the “shot it and it went insane” feel.

**Required:**

- Shooting a case must always redirect it. If hits feel like they pass through, fix the collision path (armed cases are kinematic, `collisionFilterGroup` 4, ray mask `1|2|4|8`). Do not leave cases unshootable.
- A shot case should get a **much stronger** impulse than the idle cruise, stay fast through street/doorway height, and ricochet off world geometry with the existing swept bounce. Raise or remove the **y=18 cap** for shot redirects. Do not convert a hit into an explosion of extra cases.
- Idle auto-launch can stay slower than a player-shot redirect. Shot redirect is the spectacle.
- Preserve: pickup still blocked; unclaimed missiles still damage; claimed shooter still immune; no self-damage. Kill credit still needs a real living shooter (`applyHit`).

Inspect `launchCaseMissile`, `stepCaseMissile`, and the `target?.kind==='case'` branch in `step()`. Tests: `test/client/missileIncidents.test.ts`, `test/client/extraEvidenceCases.test.ts`.

### 3. Incident sounds still fail the playtest

Tyler: **none of it really sounds right.** Bad Ammunition must be a **sharp machine-breaking** crack, not a soft thud. Evidence Tampering needs a **dangerous buzzsaw** while cases fly. Popcorn must sound like an actual **loud popcorn pop**.

**Current:** `src/audio/IncidentAudio.ts` is synthesized Web Audio, no files. Earlier versions were too quiet / too thuddy. The last rewrite added noise bursts and a spinning saw, and `CheeseGun.playFireSound` now resumes the listener context. Tyler still rejected it.

**Do not keep nudging oscillator numbers.** Replace the cues with something that reads as those three things on first listen:

- Prefer short real samples under `public/sounds/` if you can generate/source them without a new audio system.
- If staying synthesized, it has to be obviously metallic/breaking, a grinding saw, and a kernel pop — not sine/triangle thuds.
- Bad Ammo must **replace** the normal gunshot (`CheeseGun.fireCue === 'malfunction'`).
- Evidence buzz should run for the whole incident (`ChaosView` already calls `startCaseBuzz(evidence)`). Make it audible without being a screen-filling drone.
- Popcorn cue is `ChaosImpact.cue === 'pop'` from `popShot()`.
- Click **Play / resume** first so the AudioContext is running. If sounds still fail after that, the synthesizer is the bug, not the menu.

Keep voice caps. Do not add a new audio engine.

### 4. Popcorn timing (already 1s — verify, do not revert)

`INCIDENT_TUNING.popcornPulseMs` is **1000**. Tyler asked for ~1 second. Do not put it back to 3s. Children still cannot pop. Keep the lofted burst.

## Constraints that still apply

- Cheese balls stay balls. Do not retune `src/shared/ballTuning.ts` (175 / -25 / 0.9 / 5s) as an optimization.
- Shared shot cap **256**. No self-damage, no friendly-fire damage, no minimap, no living-rat hit launches.
- No map/camera/Dispatch redesign. No deploy. User handles pointer-lock/gameplay feel testing; do not spend usage on automated pointer-lock marathons. The menu helper tests in `test/client/pointerLockMenu.test.ts` are the regression net for click-through.
- Isolated worktrees start from committed HEAD and miss uncommitted files; this worktree **is** the incident tree and already has the uncommitted roster. Work here.

## Suggested order

1. Retune Bad Ammunition count/spread and tests.
2. Make Evidence shot-hits violently redirect and keep ricocheting; confirm shoot-to-bounce in the stage prototype.
3. Replace incident audio with convincing samples or a real redesign of the synth.
4. `npm run typecheck`, focused incident tests, then `npm test` if those pass. `npm run visual:build` and give Tyler the 5180 URL. Hard-refresh.

## Report back

What changed; what was left alone; tuning numbers; tests actually run vs human playtest; remaining sound/feel issues. Do not claim playtesting passed from unit tests.
