# Rat Detective Online

Rat Detective Online is a fast-paced 3D browser game built with Three.js,
TypeScript, Vite, and physics-backed interactions. Players join a shared city
arena as detective rats, move through the level, and exchange real-time game
state over a same-origin WebSocket.

## Status

Portfolio prototype. The current city arena, movement, shooting, scoring,
respawn, and round reset flows are playable locally through Cloudflare Workers.

## Runtime

The production app runs on Cloudflare Workers:

- Vite builds the static browser assets into `dist`.
- The Worker serves those static assets.
- `/ws` is handled by the Worker and backed by a Durable Object game room.
- `/health` is handled by the Worker for deployment smoke checks.

## Local Development

```bash
npm install
npm run dev
```

`npm run dev` is the fullstack watch workflow. It rebuilds client assets on
change and serves the Worker-backed game, including `/ws`, at
`http://localhost:5173`.

`npm run preview` builds once and serves the same Worker-backed game at
`http://localhost:5173`. Vite's static preview is not used because it does not
run the game server.

Smoke commands default to that origin:

```bash
npm run smoke:ws
npm run smoke:browser
npm run smoke:webgl-error
```

Override with a URL argument or `SMOKE_WS_URL` / `SMOKE_URL`. Isolated rooms are
used unless `room` is already in the URL.

## Controls

- `WASD` / arrow keys: move
- Mouse: look
- Space: jump
- Left mouse button: shoot

## Checks

```bash
npm run typecheck
npm run test
npm run build
npm run audit
npm run smoke:ci
```

`npm run typecheck` type-checks application sources and tests.
`npm run smoke:ci` builds, starts an isolated local Worker, and runs the
WebSocket smoke against it.

Visual fixture comparison (all hats, turning, damage, death and respawn, fixed seed) is separate
from the game server. See `docs/tooling.md` and `test/visual/README.md`.

## Deployment

Do not run a bare `wrangler deploy`. Production routes live only on the
`production` environment.

```bash
npm run deploy:staging
npm run deploy:production
```

Staging deploys Worker `rat-detective-staging` with no production routes.
Production deploys the existing `rat-detective-preview` Worker and
`rat-detective.animasai.co`.

## Contributing

See `CONTRIBUTING.md`, `SECURITY.md`, and `docs/tooling.md` before opening
issues or pull requests.
