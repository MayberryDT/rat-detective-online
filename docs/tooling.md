# Tooling and preview modes

Reviewed **2026-09-08**. Inspect running services before starting another process. The production game is Cloudflare-hosted; local previews are not its uptime dependency.

## Choose the right environment

| Surface | Purpose / current behavior |
| --- | --- |
| https://ratdetective.online/ | Production, public-live-v2, server-owned 8–11 AI per round |
| http://127.0.0.1:5174/ | Main local client preview through authenticated hosted relay; `rat-detective-game-preview.service` |
| http://127.0.0.1:5175/ | Secondary relay; `rat-detective-hosted-preview.service` |
| Static `dist-visual` on 5180 | Model and solo stage pages; not multiplayer verification |
| `npm run dev` / `npm run preview` on 5173 | Retained local workerd watch / one-shot build tools; not recommended as the normal long-running playtest runtime |
| Isolated CI local Worker | Throwaway runtime for bounded automated tests, separate from a human playtest |

The 5174/5175 services were observed active and `rat-detective-stable-preview.service` inactive during this docs review. Availability and private backend version can change. Do not restart the retired stable workerd service to restore the normal preview; it repeatedly stalled even with zero swap.

## Build and hosted preview

```sh
npm ci
npm run build
```

The relay serves current `dist`; it does not rebuild source. `npm run preview:hosted` starts the relay (default 5175), requiring `RAT_NETWORK_ORIGIN` and `RAT_NETWORK_TOKEN_FILE`; the latter points to a private JSON file containing `NETWORK_TEST_TOKEN`. `PORT` can override the listen port. Use the existing configured service where available. Do not print tokens or invent replacement credentials. The relay's `/health` proves relay health, not upstream simulation availability.

Local practice with eleven browser bots is explicitly gated to localhost and a URL such as `?room=graybox-practice-review&bots=11`. This is a separate harness from public hosted bots. Never combine it with the public room or assume private backend code is automatically the same as production. The test backend has its own namespace and release lifecycle.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run audit
```

Typecheck includes app and tests. Tests run Worker, client and Node relay suites. Last application receipt: 409 passing tests for the sharing/roster release; docs-only maintenance does not rerun gameplay.

CI in `.github/workflows/ci.yml` uses Node 22, dependency install, typecheck/tests/build/audit, an isolated Worker WebSocket smoke, real-input browser smoke and visual comparison. Those existing CI jobs are separate from this user's current preference to handle interactive gameplay testing personally.

`npm run smoke:ws` defaults to port 5173; pass an explicit URL for another target. Smokes choose an isolated room unless the URL already specifies one. `SMOKE_WS_URL` / `SMOKE_URL` are overrides. `npm run smoke:ci` creates a throwaway local Worker. `smoke:browser`, `smoke:gameplay` and `smoke:webgl-error` drive a browser; run them for this user's task only when requested, not as automatic live testing.

`npm run visual:build` creates `dist-visual`. Serve it locally, for example:

```sh
python3 -m http.server 5180 --bind 127.0.0.1 --directory dist-visual
```

Check the port is free first. `/model-preview.html` is the rat model tool, `/stage-prototype.html` the solo stage tool, and `/visual-fixture.html` the fixed regression fixture. See [visual documentation](../test/visual/README.md). Baseline replacement requires visual review; missing baselines are not a pass.

## Environments and deployment

| Config | Worker |
| --- | --- |
| Default `wrangler.jsonc` | rat-detective-local, no production custom domains |
| `staging` | rat-detective-staging, separate namespace, workers.dev |
| `production` | rat-detective-preview, both custom domains; old host redirects |
| `wrangler.network-test.jsonc` | rat-detective-network-test, authenticated private test backend |

Use `npm run deploy:production` or `npm run deploy:staging` only within release authorization. The default deploy script refuses unspecified environments. The historical API-upload workaround is not the standard current workflow. See [live service](live-service.md) for current release receipts and rollback compatibility.

Local dev state directories remain `.wrangler/state/dev` and `.wrangler/state/preview`; CI uses a temporary directory. Do not delete any durable state or service configuration as incidental setup.

## Current 24-rat full-game preview

For the user’s private full-game playtest, build then prepare with `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=23 --cap=24`. Start `scripts/preview-capacity.mjs` with the returned absolute deployment receipt, port 5180 and room `graybox-benchmark-ai-human-twentyfour`. This copied fixture enforces 24 total rats and currently reserves 23 AI slots; dynamic human replacement is not implemented. The relay closes at the receipt expiry. Normal benchmarks retain a default cap of 100; neither setting changes public production.

## Automatic-room preview (supersedes the fixed roster above)

Build and prepare `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=11 --cap=24`, then launch `scripts/preview-capacity.mjs` with the receipt and room `graybox-benchmark-match-playtest`. This authenticated pool uses dynamic backfill, not the fixed benchmark AI override. Use `node scripts/verify-matchmaking.mjs http://127.0.0.1:5180` for a bounded 44-connection admission/backfill check in a separate private pool; it closes its sockets afterward. The live user room stays separate.

`test/visual/hud-preview.html` is a no-input UI fixture under the Vite visual development server. It exercises rank swaps and the personal/incident cards without booting gameplay.

All Worker configs include the additive `v2-matchmaking` migration and `MATCHMAKER` binding. Production remains unchanged until a separately authorized deployment; preserve `public-live-v2` and existing migrations when releasing.
