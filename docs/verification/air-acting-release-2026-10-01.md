# A1 air acting: 1 October 2026 (production)

Tyler's OK: "Alright, looks pretty great now. Let's send it live."

## What is live

| Item | Value |
| --- | --- |
| Worker | `rat-detective-preview`, env `production`, version `4ec0fd2e-ae80-4124-a445-14311df7e11b` (deployed 04:26:03 UTC) |
| Build | `production-2026-10-01-4d9e649` |
| Client | `index-Fm0zLxiU.js` |
| Commit | `4d9e649` on `bots/overhaul`, fast-forwarded to `main` and GitHub `master` |
| Protocol | 25, unchanged, so open tabs keep playing |
| Previous | `88171c4c-a93a-40a3-bc5c-3d0769c59c3d`, [protocol 25 and the lighter Jev](protocol-25-release-2026-10-01.md) |

## What changed

[A1 air acting](../juice-plan.md#air-acting-tyler-2026-10-01) changes how every airborne rat looks:

- the walking stride stops in the air;
- the coat stretches as the rat rises, tucks into a hunch at the apex and reaches for the ground as it falls;
- the ears, whiskers, tail and hat stream with the motion, and the landing squashes and wobbles back.

Sideways, the coat stays upright and only the tail, hat and ears trail. The first staging build banked the whole body into a strafe jump, and Tyler said it was "torpedoing to the side".

The change is presentation only, so the era `lighter-jev` continues across this build. An era's `build` may now be a list (`scripts/lib/eras.mjs`).

## Checks

On a clean worktree at `4d9e649` on Halla:

- both typechecks passed;
- the worker suite passed (246 of 246);
- the script tests passed (133 of 133);
- the build passed;
- the client suite passed 1,534 of 1,535. The failure was `harbour.test.ts`, a harbour case test unrelated to animation; it then passed 13 of 13, three times, when run alone.

Before the release:

- throwaway contact sheets of one jump arc were inspected (side, rear, sideways and reversing, with A1 on and off);
- Tyler played staging (`6f8d9b17`).

On production after the deploy:

- `/health` gave the new build;
- the page serves `index-Fm0zLxiU.js`;
- `scripts/reconnect-check.mjs` passed all five checks with no page errors;
- `/status` showed 9 bots playing.

## Limits

- Tuning is only in `FEEL.airActing`; the `?feel=dev` panel is not a tool for Tyler.
- Staging still rolls only Blackout and Big Cheese.
