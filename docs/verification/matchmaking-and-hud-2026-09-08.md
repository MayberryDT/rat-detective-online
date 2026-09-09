# Automatic rooms and card HUD — September 8, 2026 (PDT)

## Scope and behavior

Implemented at the user’s request after choosing 24 as the maximum population. Default public entry now routes through a persistent Matchmaker directory in source. Each GameRoom independently enforces 24 human slots, counting pending WebSocket joins under a ten-second lease. Live game traffic bypasses the directory after admission. Overflow creates another independently simulated room; connected players are never moved between rooms.

Occupied automatic rooms use `AI = max(0, 8 - humans)`. Joining replaces surplus AI immediately while preserving remaining bot identities, score and controller/navigation progress. When humans depart, a durable ten-second refill deadline avoids immediate churn. During that grace period the total can temporarily be below eight. No-human rooms remove their AI and stop simulation immediately. Empty overflow rooms retire from the directory; their dormant world storage is retained, and the canonical public room/world is never renamed or deleted.

The directory prefers fuller available rooms, caps candidate probing at sixteen, and rechecks full rooms after five seconds. Disconnects refresh the availability hint. The room’s own admission check remains authoritative, so stale directory hints cannot overfill it. Under very large bursts or stale hints, a new room can be opened while another has spare space; the initial design favors bounded joining work over globally optimal packing. This is not a deployment-scale load certification.

The client carries a validated assigned-room preference on retries. It prefers that room when still available; existing reconnect semantics remain a fresh player identity. There is no score-preserving reconnect token, guaranteed reserved reconnect slot, party lobby or queue in this version. If the preferred room is full, normal allocation applies.

Fixed benchmark AI rooms preserve their distinct roster policy. Private matchmaking pool names are routed only by the authenticated capacity entry point. The production source accepts automatic entry through its canonical public pool. Existing explicit custom rooms retain their previous behavior.

## UI

Top-five rows retain DOM identity and use a 280 ms positional animation when ranking changes. Interrupted animations are cancelled and the next move begins from the currently displayed position. New entries have a small entrance animation; leaving the top five removes the row. Reduced-motion preference disables these animations, and reset/disposal cancels them.

The personal card is outside/below the leaderboard container, displaying only `#rank`, rat name, and `killsK / deathsD`. It uses the complete authoritative score list for rank, including players outside the top five. Names are inserted as text. Leaderboard, personal, incident and case cards share restrained dark document colors, thin borders, side rules and small corner marks. Narrow-screen widths avoid the two side panels overlapping.

## Verification

- Complete suite: 100 Worker + 365 client + 22 script tests = 487, with typecheck/build passing.
- Added coverage: 44 concurrent admissions split 24/20; 24 pending joins reserve a full room; abandoned leases expire; first human receives seven AI; second human removes one AI without replacing the controller; low bot counts survive eviction; refill waits for its deadline; empty simulation/controller stop; directory survives eviction and reconnect preferences work.
- HUD regression covers complete-roster rank outside top five, separate parent structure, retained row identity and move animation, stale-card cleanup, and reduced motion. Network regression preserves the original pool while sending the assigned-room preference.
- Hosted protocol check in a fresh authenticated private pool: 44 humans, two rooms of 24/20, initial eight total; after 43 departures, one human plus seven AI/eight total. These are admission/lifecycle checks, not stress-tested human rendering.
- Desktop 1280×720, compact 780×493 and narrow screenshots reviewed. No pointer-lock or gameplay-input automation was performed.

Initial full-suite failures were outdated assertions expecting eight–eleven AI when only one/two humans joined; updated expectations assert seven/six under the approved policy. The added eviction test initially timed out because the Cloudflare test helper waits for active timer I/O; it now stops only the in-memory timer before eviction, as existing eviction tests do, and verifies restoration. The existing large-bundle build warning remains.

Evidence: `output/hud-matchmaking-review/` contains screenshots, hosted NDJSON and copied check logs. `scripts/verify-matchmaking.mjs` reproduces the bounded hosted lifecycle check using a local relay. `test/visual/hud-preview.html` reproduces the isolated UI.

## Deployment boundary

The new Matchmaker class uses the additive `v2-matchmaking` migration. Main, staging, production and private configs include its binding, but **only the private capacity Worker has been deployed**. Public production remains the previously recorded version in `docs/live-service.md`.

The new population rules deliberately replace the old eleven-slot human reservation when an automatic room is enabled. World identity, ball tuning, damage/scoring, approved human presentation and navigation behavior are preserved.

Final private deployment: `1823e528-1fc3-4b7c-9eec-51888092313d`, fixture `09b9f472e7a6bc0b558d3554edd2fa81ed25646c15099bf2809f07c5df6ff967`. The refreshed relay serves the matching build on port 5180 until September 9 at 09:10 UTC (2:10 AM PDT). Final authenticated matchmaking-route join was checked after deployment.
