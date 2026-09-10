# Crossfire colors and case banter — September 10, 2026

Tyler said the preceding cheese/interior/delivery build was feeling good, then requested red owned Crossfire ricochets, brighter enemy warnings, yellower ordinary cheese and case jokes in place of repeated tutorials. This client presentation revision supersedes the earlier all-golden Crossfire core treatment. Rules, physics, lighting and the private Worker are unchanged. The dirty working tree was preserved; no commit or production deployment was made.

## Visible changes

| Shot | Core | Enemy warning |
| --- | --- | --- |
| Your ordinary shot | More saturated yellow cheese | None |
| Your banked shot during Crossfire | Shaded red cheese | None |
| Enemy ordinary shot | Yellow cheese | Stronger red-orange rim and existing short trail |
| Enemy banked shot during Crossfire | Brighter red cheese | Wider glowing red rim and brighter red trail |

All four retain the spherical silhouette and shaded cheese pores. Crossfire color depends on the active incident and the shot's banked state; warning rims/trails remain viewer-relative. Changing the viewer or instance order cannot retain the previous owner's core tint. Expiring Crossfire returns the normal yellow material. Local predicted shots share the ordinary cheese material. No speed, gravity, bounce, lifetime, radius, cap, damage, attribution or self/friendly-damage rules changed. The brighter red core uses instance color in the existing batch; no new lights were added.

`municipalQuips.ts` adds sixteen phrases for each of four case events: pickup, loss, another carrier and loose case. Each local shuffle bag exhausts before repeating and avoids immediate repeats across bag boundaries. A phrase is selected on an event, not every render/snapshot. Examples include “MY ALIBI HAS A CARRY HANDLE,” “THE PAPER TRAIL GREW LEGS,” and “THE FLOOR IS NOW A SUSPECT.” Existing death/victory banks remain.

The case ownership headline remains, followed by a contextual joke. Repeated instructions about retaining points, picking up the case, or scoring are removed from the case subline and broadcasts. Ordinary redundant case sublines are hidden. Incident HUD/reveal subtext uses brief noir flavor, including “THE WALLS ARE ACCOMPLICES” for Crossfire. Essential objective, destination, score, clock, incident timer and suspension statuses remain, including Excessive Force's “KILLS COUNT” / “GET THE CASE TO SCORE.” The initial assignment briefing remains. Delivery confirmation still takes precedence over competing case text.

Static review caught the scoreboard clipping case headlines in a narrow, tall desktop window. A scoped responsive rule moves the broadcast into the open area to its right while preserving clearance above the reticle. The accepted scoreboard layout is unchanged.

## Checks performed

- Full automated suites: **658 passing tests** — 107 Worker, 529 client and 22 script tests. Commands: `npx vitest run`, `npx vitest run --config vitest.client.config.ts --maxWorkers=4`, `node --test test/scripts/*.test.mjs`. Bounded client concurrency avoids the previously recorded launcher stress-test deadline under unrestricted concurrency.
- After the final enemy-core brightness adjustment: focused projectile/HUD/quip rerun, **22 tests in three files passed**. These cover ownership/viewer swaps, Crossfire expiry, retained ordinary behavior, phrase-bag rotation, stable event text and essential scoring status. Typecheck passed. The subsequent spacing-only CSS change was reviewed visually and both builds were rerun.
- `npm run build` and `npm run visual:build` passed. Existing large-chunk warnings remain. `git diff --check` and local links in the touched documentation passed.
- **Actual gameplay-camera static review:** four shot treatments at ordinary and enlarged sizes in the street fixture; pickup announcement in Records Bureau. The final narrow-window capture shows the headline and joke clear of the scoreboard and reticle. This fixture has no gameplay input, network or scoring loop.
- **Private hosted protocol check:** one passive client for six seconds in a separate automatic pool, eight rats, **161 decoded snapshots and zero invalid packets**, protocol 5. Served HTML, JavaScript and CSS exactly match the final immutable client. An initial attempt immediately after local service startup reached the port before it listened; the completed readiness check above passed.
- **Human gameplay/multiplayer feel:** not tested by the agent. No automated pointer-lock, aiming or input tests were performed. The previous delivery-respawn headless bot routes were not repeated for this presentation-only change; their results remain in the [prior receipt](cheese-interior-delivery-2026-09-10.md). The passive check does not establish combat readability or multiplayer feel.

Local evidence is under `output/crossfire-banter-2026-09-10/`: focused/typecheck/build logs, `full-preview-check.json`, and `preview.json` with source hashes. Camera images were reviewed through the in-app browser; no screenshot files were exported.

## Full-game preview

[Play the updated build](http://127.0.0.1:5189/?room=graybox-benchmark-match-crossfire-banter-v15&diagnostics=quiet&lighting=pools).

- Existing private Worker: `f49f4645-e716-4b98-a4cd-03eed72d96a4`, protocol **5**; expires September 10 at **3:51 AM Pacific**. No Worker upload, production deployment or production room reset occurred.
- Final immutable client: `output/crossfire-banter-2026-09-10/client-final`, JavaScript `index-DJKTBbA-.js`, CSS `index-emXHRNaP.css`.
- JavaScript SHA-256: `5a4d052fca67a1341a32e920d2a48d86e471b85148a528f2e768cb9a3b0ad434`; CSS SHA-256: `476fca0842cd8a2059e115c847575da2f0eeefda661deae6bddc1f5d3221bf0c`.
- Local preview service: `rat-detective-crossfire-banter-preview.service`. Backend receipt: `output/hosted-capacity-deployment-2026-09-10T06-51-30-456Z/deployment.json`. Earlier preview clients remain intact.

Prior context was retrieved from GBrain `brain:sessions/2026/09/rat-detective-cheese-interiors-delivery-respawn-2026-09-10`; the current user request supersedes that page's earlier shot-color treatment.
