# Contributing

Rat Detective Online is a portfolio game and open-source learning project.

## Local Setup

```bash
npm install
npm run dev
```

`npm run dev` watches client assets and serves the Worker, static assets, and
`/ws` route at `http://localhost:5173`. Use `npm run preview` for a one-shot
build of that same stack.

## Checks

Before opening a pull request, run:

```bash
npm run typecheck
npm run test
npm run build
npm run audit
```

For multiplayer smoke testing, start `npm run dev` in one terminal and run this
in another (defaults to port 5173):

```bash
npm run smoke:ws
npm run smoke:browser
npm run smoke:webgl-error
```

CI also runs an isolated local Worker WebSocket smoke. Visual fixture captures
need recorded baselines under `test/visual/baselines/` before they can pass.

## Scope

Keep gameplay changes small and explain how they were smoke-tested in the
browser. The current multiplayer model validates basic message shape and scoring
rules, but it is not designed as a competitive anti-cheat server.

See `docs/tooling.md` for watch, preview, staging, and visual harness details.
