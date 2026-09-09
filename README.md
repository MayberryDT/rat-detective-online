# Rat Detective Online

**[Play Rat Detective](https://ratdetective.online/)** — a free multiplayer browser shooter about detective rats, ricocheting cheese balls and spectacular physical chaos in a dark, run-down city.

Grab the Hot Case for double kill credit, shoot Dispatch to trigger a citywide incident, and turn launchers, flying bodies and loose evidence into trouble. The public game runs continuously on Cloudflare, with **8–11 server-owned AI rats and fresh names each round**. Up to thirteen humans can join. No player browser or local machine hosts the public AI.

## Start here

- [Agent instructions](AGENTS.md)
- [Current game, architecture and known limits](docs/current-state.md)
- [Documentation index](docs/README.md)
- [Live deployment and recovery](docs/live-service.md)
- [Development and testing](docs/tooling.md)

The current release uses a shared version-2 city: landmarks with interiors, streets and alleys, sewers, vehicles, debris, animated rats and interactive machines. “Graybox” in source filenames is historical naming; those modules also power production.

## Controls

WASD / arrow keys move, mouse looks, Space jumps, and left mouse shoots. Pointer lock owns gameplay input; menus must not intercept clicks while playing.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run build
```

For normal local playtesting, the configured hosted relay serves the built client at `http://127.0.0.1:5174/`. See [tooling](docs/tooling.md) for its service, private backend requirements and the distinction between hosted, legacy local and static model previews. `npm run dev` and `npm run preview` still start local workerd on 5173; they are retained tools, not the recommended long-running playtest runtime after repeated local stalls.

## Publishing

```sh
npm run deploy:staging
npm run deploy:production
```

Use the intended environment; a bare default deploy is not a production release. Production Worker `rat-detective-preview` serves [ratdetective.online](https://ratdetective.online/). The previous `rat-detective.animasai.co` redirects there, preserving path and query. Sharing the canonical URL includes the title-screen screenshot and game description.

[CONTRIBUTING.md](CONTRIBUTING.md) describes checks and change expectations. [SECURITY.md](SECURITY.md) describes the trust boundary. The optional [Omarchy companion](docs/omarchy.md) launches the web game and shows the public scoreboard; it does not run the game server.
