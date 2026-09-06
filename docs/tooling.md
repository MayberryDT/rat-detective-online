# Tooling

Local commands, CI, and release environments for the Worker-backed game.

## Origins

| Command | What it runs | URL |
|---|---|---|
| `npm run dev` | Vite asset watch + local Worker | `http://127.0.0.1:5173` |
| `npm run preview` | Production build + local Worker | `http://127.0.0.1:5173` |
| `npm run smoke:ws` | Two-client protocol smoke | `ws://127.0.0.1:5173/ws` |
| `npm run smoke:browser` | Headless Chrome entry smoke | `http://127.0.0.1:5173/` |

Both smokes pick an isolated `room` query unless one is already present.
`SMOKE_WS_URL` / `SMOKE_URL` / a CLI URL override the defaults.

`npm run dev` writes Durable Object state to `.wrangler/state/dev`. Preview uses
`.wrangler/state/preview`. CI uses a throwaway directory.

## Typecheck and tests

`npm run typecheck` runs `tsc --noEmit` for `src` and again with
`test/tsconfig.json` so test sources are checked.

`npm test` runs Worker tests, then client tests.

## Isolated CI smoke

`npm run smoke:ci` builds, then `scripts/with-local-worker.mjs` starts
`wrangler dev --local` on a free port with a unique `--persist-to` directory,
waits for `/health`, and runs `npm run smoke:ws`. The helper also exports
`SMOKE_URL` and `SMOKE_WS_URL` for that port.

The WebSocket smoke joins with `protocolVersion: 1` and sends shots as
`{ shotId, origin, direction }`.

## Visual fixture

Not part of production assets. Build with `npm run visual:build` into
`dist-visual/`.

Entry: `/visual-fixture.html?seed=20260905&state=alive`

- Viewport 780x493
- Fixed world seed (default `20260905`)
- Fedora, trilby, and porkpie in one frame
- Clickable **Alive** / **Turned** / **Damaged** / **Dead** / **Respawn**
- Visible `output#fixture-status` reports `ready`, `seed`, `state`, and renderer stats

`npm run smoke:visual` captures those five states. Missing files in
`test/visual/baselines/` are incomplete, not a pass. Record baselines only after
a reviewed capture:

```bash
UPDATE_VISUAL_BASELINES=1 npm run smoke:visual
```

Root/browser verification can use the fixture URL and the status output; this
harness does not drive the in-app browser.

## Cloudflare environments

| Env | Worker name | Routes |
|---|---|---|
| default / local `wrangler dev` | `rat-detective-local` | none |
| `staging` | `rat-detective-staging` | none (`workers.dev` only) |
| `production` | `rat-detective-preview` | `rat-detective.animasai.co` |

`npm run deploy` refuses a default deploy.

```bash
npm run deploy:staging
npm run deploy:production
```

Do not deploy production from this tooling pass without explicit coordination.

## Real-input gameplay smoke

`npm run smoke:gameplay` runs the browser entry smoke, requires pointer lock, presses W and Space, and clicks to shoot. It checks outgoing normal gameplay messages for movement, a jump and a finite normalized shot. It does not alter game state or replace collision/trajectory unit tests. CI runs it against an isolated local Worker after installing Chrome.
