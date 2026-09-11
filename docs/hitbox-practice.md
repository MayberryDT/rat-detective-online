# Stationary hitbox practice

Created September 10, 2026 for the user's manual hitbox playtest.

**[Open the practice range](http://127.0.0.1:5193/hitbox-practice.html)** and click **Enter target practice**. Four stationary rats face front, side and back, at roughly 10, 20, 35 and 50 units from the start. Walk around them freely. They never walk, turn, fire, flinch or ragdoll. Each has the normal three health; a kill refills health immediately without changing its pose or position.

| Control | Action |
| --- | --- |
| WASD / mouse / Space / click | Normal movement, camera, jump and one shot per click |
| H | Show/hide collision shapes: cyan body/chest, gold head |
| R | Refill targets and clear counters/projectiles |
| T | Return the human to the firing line |
| Esc | Release the mouse and open the menu |

The HUD reports shots, confirmed hits, head hits, kills and the most recent target/damage. The real `CheeseGun` determines camera convergence and muzzle origin. The real `ChaosSimulation` determines ball travel, gravity, wall bounces, collision shapes and head/body damage; normal `applyHit` resolves health. Wireframes are built directly from the simulation's actual bodies and shape offsets. They are diagnostic overlays and are excluded from aim picking. Rats remain kinematic and their animation is frozen. Only local fixture health resets and objective suppression differ from the live match.

This is a local simulation for testing geometry and aim. It does not reproduce hosted latency, interpolation or multiplayer hit registration. Neither production code nor the existing full-game private preview was changed by this fixture.

## Preview lifecycle

The loopback server is the transient user service `rat-detective-hitbox-practice-preview.service` on port 5193. It serves a frozen visual build at `output/hitbox-practice-2026-09-10/site`, so later ordinary builds do not change it. It has no hosted Worker expiry, but stops on a machine/service shutdown. It does not connect to a multiplayer room or require credentials.

Rebuild with `npm run visual:build`. The entry `/hitbox-practice.html` is in the visual Vite configuration, excluded from the production build. Inspect running services and ports before starting another server. To reproduce the local static environment on a free port:

```sh
python3 -m http.server 5193 --bind 127.0.0.1 --directory dist-visual
```

## Verification

- Five focused tests pass: actual body/head hits, just-inside/outside head boundaries, stationary silent targets, disabled objectives, supported ground/clear sightlines, reset cleanup and self-damage protection.
- Typecheck and the visual build pass. The full test suite passes **797 tests**: 129 Worker, 643 client and 25 scripts.
- The static menu and initial range render without browser errors. No gameplay input or pointer-lock automation was run; human playtesting is left to the user.
- No production hitbox dimensions or projectile tuning changed.

Source: [simulation harness](../test/visual/HitboxPractice.ts), [page](../test/visual/hitbox-practice.ts), [tests](../test/client/hitboxPractice.test.ts).
