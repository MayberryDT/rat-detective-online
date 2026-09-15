# Tooling and preview modes

Reviewed **2026-09-11**. Inspect running services before starting another process. The production game is Cloudflare-hosted; local previews are not its uptime dependency.

## Choose the right environment

| Surface | Purpose / current behavior |
| --- | --- |
| https://ratdetective.online/ | Production, public-live-v2, server-owned bots fill occupied rooms to eight total rats; 10-rat cap |
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

**Legacy harness, not a gameplay preview:** local practice with eleven browser bots is explicitly gated to localhost and a URL such as `?room=graybox-practice-review&bots=11`. This is a separate harness from public hosted bots. Never combine it with the public room or assume private backend code is automatically the same as production. The test backend has its own namespace and release lifecycle.

## Observation in private full-bot fixtures

Append `&observe=1` to a frozen hosted `graybox-benchmark-ai-*` preview, or use
its title-screen observation button. The camera does not occupy a rat slot; ten
bots remain active. Public and normal matchmaking routes reject observation.
See [observation mode](observation-mode.md) for controls, reconnect behavior and
the current deployment receipt. Human observation remains audible.

## Checks

Agent browser playtests must stay muted (Tyler, September 11). Append `&mute=1`
to localhost practice URLs before opening them. This mutes title music and keeps
the shared gameplay AudioContext suspended even after input gestures. It applies
only on loopback hosts; the accepted public audio mix is unchanged. **Human playtests omit this flag and stay audible.** Do not mute the user’s site, browser or system audio.

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

## Required gameplay preview (September 11 correction)

Use production matchmaking and server-owned bots in the hosted Cloudflare runtime
for **every** gameplay playtest. No `bots=11`, no browser bots, no local workerd.
The accepted full-lobby setup below is a separate stress fixture, not the default
population policy. Never enable checkpoint-control or altered capacities for feel testing.

After building and checking the app, deploy a frozen private copy:

```sh
node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=9 --cap=10
node scripts/preview-capacity.mjs --deployment=/absolute/path/to/deployment.json --port=5193 --room=graybox-benchmark-match-pickups-r8
```

`--bots=11` here is the fixture generator’s legacy roster setting, **not** a browser
URL flag. A `graybox-benchmark-match-*` pool uses the actual production backfill:
one human plus seven server bots, bots yield as humans join, empty rooms sleep.
The copied fixture has isolated credentials/namespace, seed 341283204, diagnostic
incident controls and expiry; ordinary player delivery, simulation, timings and
navigation remain the application’s production paths. The client is served from
the receipt’s frozen `stage/dist`, never a separately changing `dist` directory.

The relay now forwards narrowly validated, authenticated `/status?room=...`
metadata. The title prepares that exact room’s city and unreserved connection,
using the same path as public title preparation. Credentials never reach browser URLs.
[Current preview, expiry and verification](verification/reconnect-case-protection-2026-09-11.md).
Disconnected rats now reserve their slot for 30 seconds before empty-room sleep.
Human reload tests should re-enter within that window; the same tab retains its
private reconnect credential. Do not expose the credential in diagnostic artifacts.

## Current bot experiment preview

Build the client, then prepare the private Worker with
`node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=10 --cap=10 --full-lobby --bot-experiments --assignment=jurisdiction`.
Use the returned frozen receipt with `scripts/preview-capacity.mjs`.
For a rotating playtest, replace `--assignment=jurisdiction` with
`--first-assignment=chain-of-custody`: Paper Chase starts the first cycle, followed
by the other three assignments and then normal shuffled cycles. Omit both options
for the ordinary playlist. First-assignment and pinned-assignment options are
mutually exclusive.
Only explicit `graybox-benchmark-ai-bot-{baseline,maneuvers,commitment,attention,combined}-*`
rooms fill all ten slots (nine bots after a human joins).
`graybox-benchmark-match-bot-{baseline,maneuvers,commitment,attention,combined}-*` pools
retain normal eight-participant matchmaking, human replacement and empty-room sleep.
The private Worker alone resolves these experiment names; public source defaults
to maneuvers. The ten-rat cap is released; the independently frozen experiment
rooms retain their explicit baseline and variant selections.
See [results and current links](verification/bot-experiments-2026-09-14.md).

## Historical 16-rat full-game preview

For an explicitly requested smaller density comparison, the hosted full-lobby
fixture also accepts `--bots=12 --cap=12 --full-lobby`. It fills 12 slots and
replaces one bot per human join. This changes only the private copy; keep the
production cap unchanged. Use a fresh `graybox-benchmark-ai-*` room and the
matching frozen receipt, as with the 16-rat fixture.

September 10 current setup: `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=16 --cap=16 --full-lobby`, then start the relay with the resulting receipt and `--room=graybox-benchmark-ai-sixteen-v20`. This explicit private option starts all 16 bots before humans arrive, uses existing bot replacement on human join, refills after ten seconds and stays active until expiry. It changes only the copied Worker. [Current desktop link and verified roster transitions](verification/sixteen-rat-tuning-2026-09-10.md). The fixed-23 and eight-rat automatic-room instructions below are alternative/historical configurations.

Historical fixed-bot alternative: build then prepare with `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=23 --cap=24`. Start `scripts/preview-capacity.mjs` with the returned absolute deployment receipt, port 5180 and room `graybox-benchmark-ai-human-twentyfour`. This copied fixture enforces 24 total rats and currently reserves 23 AI slots; dynamic human replacement is not implemented. The relay closes at the receipt expiry. Normal benchmarks retain a default cap of 100; neither setting changes public production.

## Automatic-room preview (supersedes the fixed roster above)

Build and prepare `node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=11 --cap=24`, then launch `scripts/preview-capacity.mjs` with the receipt and room `graybox-benchmark-match-playtest`. This authenticated pool uses dynamic backfill, not the fixed benchmark AI override. Use `node scripts/verify-matchmaking.mjs http://127.0.0.1:5180` for a bounded 44-connection admission/backfill check in a separate private pool; it closes its sockets afterward. The live user room stays separate.

`test/visual/hud-preview.html` is a no-input UI fixture under the Vite visual development server. It exercises rank swaps and the personal/incident cards without booting gameplay.

All Worker configs include the additive `v2-matchmaking` migration and `MATCHMAKER` binding. Production remains unchanged until a separately authorized deployment; preserve `public-live-v2` and existing migrations when releasing.

## Phone preview (September 10 follow-up)

The user currently tests on desktop only; the latest relay stays loopback on 5190 and the old phone relays are stopped. Earlier phone previews used explicit private-interface relays on Wi-Fi port 5191 and Tailscale port 5192 with the same frozen build, private Worker and expiry. [Mobile controls](mobile-controls.md) records current links and checks. `scripts/preview-capacity.mjs` accepts `--listen-address` and `--browser-origin`; non-loopback binding requires an exact matching private IPv4 origin. Default binding remains loopback. Public/wildcard interfaces and unrelated WebSocket origins are rejected. HTTPS reverse-proxy origins are optional; they do not configure Tailscale or grant administrator access. No token value is placed in a browser URL.
