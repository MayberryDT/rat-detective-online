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

Install dependencies, build the app, and start the local Worker:

```bash
npm install
npm run dev:worker
```

`npm run dev:worker` runs the production-style path locally by building the Vite
assets and starting `wrangler dev`.

## Controls

- `WASD` / arrow keys: move
- Mouse: look
- Space: jump
- Left mouse button: shoot

## Checks

```bash
npm run test
npm run build
npm run audit
npm run smoke:ws
npm run smoke:browser
```

`npm run build` regenerates Cloudflare Worker types, type-checks the project,
and builds the Vite assets.

Run `npm run smoke:ws` while `npm run dev:worker` is running to verify that two
native WebSocket clients can join the Worker-backed room.

Run `npm run smoke:browser` while `npm run dev:worker` is running to verify that
a real browser click can enter the game at a short desktop viewport.

## Deployment

```bash
npm run deploy
```

Deployment uses Wrangler and the Worker configuration in `wrangler.jsonc`. The
configured Worker serves the static game and routes WebSocket traffic through
`/ws`.

## Contributing

See `CONTRIBUTING.md` and `SECURITY.md` before opening issues or pull requests.
