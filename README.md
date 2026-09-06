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
npm run dev
```

`npm run dev` builds the Vite assets and starts the complete Worker-backed game
at `http://localhost:5173`, including the WebSocket game room. Restart it after
editing client code to rebuild the assets. Vite alone does not run the game server.

`npm run dev:worker` runs the same game on Wrangler's default port, `8787`.
The smoke commands below target that port by default.

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
npm run smoke:webgl-error
```

`npm run build` regenerates Cloudflare Worker types, type-checks the project,
and builds the Vite assets.

Run `npm run smoke:ws` while `npm run dev:worker` is running to verify two-player
joining, movement, shooting, damage, scoring, automatic respawn, and leaving.
For `npm run dev` on port 5173, use `npm run smoke:ws -- ws://localhost:5173/ws`.

`npm test` covers Worker rules and client projectile trajectories, ricochets,
headshots, resource ownership, and local/remote respawn behavior.

Run `npm run smoke:browser` while `npm run dev:worker` is running to verify that
a real browser click can enter the game at a short desktop viewport.

Run `npm run smoke:webgl-error` while `npm run dev:worker` is running to verify
that browsers with WebGL disabled see a clear error state instead of a dead app.

## Deployment

```bash
npm run deploy
```

Deployment uses Wrangler and the Worker configuration in `wrangler.jsonc`. The
configured Worker serves the static game and routes WebSocket traffic through
`/ws`.

## Contributing

See `CONTRIBUTING.md` and `SECURITY.md` before opening issues or pull requests.
