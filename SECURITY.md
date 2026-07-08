# Security

## Reporting

Please report security issues privately to the repository owner instead of
opening a public issue.

## Current Model

Rat Detective Online uses a Cloudflare Worker and Durable Object to coordinate a
shared public game room. The server validates message shape, clamps damage, and
owns scoring, respawn, and round state.

This project is a portfolio prototype, not a hardened competitive multiplayer
server. Do not treat client movement or hit reports as cheat-proof.
