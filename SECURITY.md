# Security

Report security issues privately to the repository owner rather than opening a public issue.

## Current trust model

The production version-2 world uses a Cloudflare Worker and Durable Object. The server owns membership, HP, kill credit, respawn positions/deadlines, rounds, AI, projectiles, cases, corpse missiles, Dispatch and launch events. External client `hit` reports are ignored in version 2; the shared simulation produces combat hits. Legacy version-1 rooms retain client-hit reports.

Human movement is still client-supplied, but the Worker now rejects displacement beyond a server-time speed envelope and paths that cross the static city collision world. Rotations must be bounded quaternions. Shot origins/directions receive plausibility, duplicate and rate checks; this is not a fully authoritative movement or competitive anti-cheat system. See [server authority](docs/server-authority.md) and [operations](docs/server-operations.md).

Public admission accepts only the canonical matchmaking room, enforces exact browser Origin on WebSocket upgrades and uses the Cloudflare Rate Limiting binding when an address is available. Non-canonical rooms are restricted to exact localhost diagnostics or authenticated private fixtures. Resume credentials are single-use and rotate before an older transport is replaced.

The private network-test backend requires authentication. Keep credentials out of URLs, logs, source, documentation, screenshots and shared memory. The localhost relay keeps its token server-side and restricts Host/Origin. Do not enable that diagnostic interface publicly as a shortcut. Public server observability does not mean arbitrary public browsers automatically upload local client reports.
