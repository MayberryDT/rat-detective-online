# Contributing

Rat Detective Online is a portfolio game and open-source learning project.

## Local Setup

```bash
npm install
npm run dev:worker
```

Use `npm run dev:worker` for gameplay checks because it runs the same Worker,
static assets, and `/ws` route used in production.

## Checks

Before opening a pull request, run:

```bash
npm run test
npm run build
npm run audit
```

For multiplayer smoke testing, start `npm run dev:worker` in one terminal and
run this in another:

```bash
npm run smoke:ws
npm run smoke:browser
npm run smoke:webgl-error
```

## Scope

Keep gameplay changes small and explain how they were smoke-tested in the
browser. The current multiplayer model validates basic message shape and scoring
rules, but it is not designed as a competitive anti-cheat server.
