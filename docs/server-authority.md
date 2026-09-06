# Multiplayer authority and recovery

## Current authority boundary

The room server owns membership, player HP, kill/death totals, spawn positions, round transitions and their deadlines. Every participant uses the room's versioned world specification. Local movement and projectile collision remain client-predicted to preserve responsiveness; transmitted shots carry the resolved origin and direction rather than an independently reconstructed camera target.

Boundary validation, finite/bounded state, capacity limits and rate limits protect server state and resource use. They do not establish that a client-reported hit was physically valid. The game should not claim competitive anti-cheat guarantees from these checks.

## Stronger hit-validation design

A future authoritative combat path should retain immediate local firing and visual feedback while the server confirms damage:

1. Record a shot ID, owner, validated origin/direction and server acceptance time. Expire this record after the existing five-second projectile lifetime.
2. Associate hit claims with that shot ID and consume each shot's damage result at most once.
3. Maintain a bounded history of player collision transforms with explicit server timestamps. Cosmetic ragdoll geometry and outlines must not enter combat collision queries.
4. Validate against the shared collision layout using exactly the current speed, gravity, ricochet and head/body shape rules. Ricochets make a simple line-of-sight check insufficient.
5. Bound any latency compensation window using measured connection timing. Keep score/HP confirmation server-owned; reconcile speculative feedback without moving the camera or delaying input.

This is a protocol-versioned change. Old client damage claims cannot safely coexist indefinitely with stronger validation in the same public room. A staged release must isolate protocol versions or require a reload.

## Evaluation gate

Before enabling server collision authority, compare identical seeded scenarios at low latency and under controlled 50/100/200 ms latency and jitter. Record server-confirmation delay, rejected legitimate shots, duplicate-result prevention, shot/HP convergence, and room CPU cost. Include headshots, moving targets, single/multiple ricochets, death/respawn and round boundaries. Do not trade immediate firing responsiveness for a blocking round trip.

The current implementation establishes the shared world, shot descriptor, strict protocol and recovery foundation. Full server physics authority is an explicitly evaluated design decision, not a silent replacement of the current gameplay model.

## Recovery invariants

A connection's lifetime is separate from whether its player has moved. Room reconstruction must reconcile persisted player records with attached sockets and restore pending respawn/reset deadlines. A reconnect applies an atomic snapshot before input resumes, clears obsolete entities/projectiles, and receives a new authoritative identity if the previous connection has ended. Position-checkpoint optimizations must document their recovery source and allowable staleness; scores and round transitions remain durable.
