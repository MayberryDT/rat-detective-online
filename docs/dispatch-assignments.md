# Dispatch Assignments — personal delivery race and noir UI

Updated September 10, 2026. Tyler’s first-to-three delivery request supersedes the earlier shared six-stamp finish; the latest revision adds a held-Tab full-lobby scoreboard and hides only the local rat’s outline halo. Preserve the existing dirty working tree. No Git commit or production deployment was made; the private playtest build is described below.

## Current rules

| Assignment | Winning action | Progress |
| --- | --- | --- |
| Closing Time | Hold the legitimate primary case at zero | 120 seconds of cumulative shared living possession. Loose, briefing and Tampering time pause the clock; theft preserves it |
| Excessive Force | Reach ten attributed kills while holding the primary case when each kill resolves | Exactly one qualifying point per kill. Personal case kills survive death, disarm and reacquisition independently of total kills |
| Chain of Custody | Earn three personal paperwork delivery points | Carry the case anywhere inside the currently highlighted whole landmark for one point. Respawn the case at a random clear pickup site and activate the next landmark immediately. Personal scores survive death, disarm, theft and Tampering |

Chain landmarks rotate in a server-shuffled six-landmark bag until someone earns three points. Every landmark appears once per bag; if a match needs another bag it reshuffles without repeating the previous destination immediately. There is no fixed first/last building, no six-delivery match requirement and no stamp mechanic. Snapshots, theft, late joining and eviction retain the selected order and personal scores. Random shuffling does not promise that an entire permutation can never recur.

| Landmark | Accepted player interior bounds: X / Z / Y | Existing navigation approach |
| --- | --- | --- |
| Icebox | 106..154 / −91..−31 / −0.5..24 | South loading entrance |
| Sewer Maintenance | 60..70 / −42..−30 / −7.5..−1 | Maintenance corridor |
| Pump Station | 100..150 / 99..137 / −0.5..24 | South entrance |
| Needleworks | −143..−67 / 56..108 / −0.5..24 | South entrance |
| West Sluice | −146..−128 / −32..32 / −0.5..24 | Walk strip beside the ramp |
| Records Bureau | −48..16 / −81..−37 / −0.5..24 | South entrance |

X/Z must be strictly inside; Y includes the lower bound and excludes the upper. This accepts alternate entrances and interior floors while excluding roofs, outside pavement, and the street directly above Maintenance. Approach coordinates guide the existing bots and recovery only; they do not constrain where entry scores. There are no interaction buttons, stationary waits, north/south building subdivisions or new map geometry. Needleworks is the existing name of the user’s Needle landmark. West Sluice is separate from Pump Station, so including the omitted landmark makes six eligible destinations. Historical geography was checked against GBrain `brain:sessions/2026/09/rat-detective-distinct-interiors-playtest-pass-2026-09-07` and current shared layouts.

The three-assignment playlist itself also uses a shuffle bag with no immediate repeats across boundaries. One assignment completion ends the match. Version-2 assignment rooms have no normal kill-limit, elapsed-match win or highest-kills fallback. Total kills are actual kills; the old 2× carrier multiplier remains only in the separate legacy version-1 path.

Excessive Force evaluates possession synchronously at attributed kill resolution: fire then collect before the kill scores; fire while carrying then lose the case before the kill does not. Projectile, ricochet and corpse-missile attribution remains. Misfiled Evidence has no active selection/instructions or loose-delivery win. Departed identities are pruned; reconnecting retains the existing new-player identity contract.

Evidence Tampering retains eight weaponized, uncollectible cases and pauses every assignment without banking incident progress. Missiles now launch at 145, redirect at 160 and maintain at least 140 lateral speed, with short hops and vertical cap 10. They keep ricocheting and remain visible throughout the incident; seven extras still disappear at expiry. A primary case overlapping any landmark, including overlap by its physical extent, is placed outside before pickup resumes. Cleanup cannot award a delivery or win. A fresh carried entry is required. Tampering cases and their neutral corpse chains credit no player kill or case point: only victim deaths increase. The feed rotates 24 named paperwork jokes, such as “The case rested. On Captain Crawley.” Ordinary player-attributed kills retain their existing scoring.

## Presentation and bots

- **Excessive Force:** accepted top-five case-kill scoreboard out of ten, personal progress/rank, total kills separately, “KILLS COUNT” versus “GET THE CASE TO SCORE.” Qualifying-kill confirmation sits above the aiming area.
- **Closing Time:** compact torn-paper clock at top left with holder/running or loose/paused status. Final 20 seconds pulse/tick; final five tick twice per second. Pauses silence the escalation.
- **Chain:** top five delivery scores out of three, your own score, whole-building destination name and instruction to carry the case inside. Every point confirms “PAPERWORK DELIVERED!” and updates the next destination immediately; non-winning deliveries also announce “CASE RELOCATED” without a lost-case sound. There is no shared-stamp track.
- **Full scoreboard:** hold Tab for every investigator’s mode progress, kills, deaths, K/D, total case time, possession share, identity and health/carrier/death status. Server snapshots supply all round totals, including after late join. Release, blur, hidden tab, pointer unlock or Escape dismisses it; a held view updates through round reset. Wheel scrolls large rosters; horizontal/Shift-wheel handles narrow windows. This translucent table temporarily hides competing HUD overlays without pausing the game or changing pointer lock.
- **Guidance:** active whole-landmark yellow exterior silhouette and red case outline remain visible through obstruction. Destination labels/off-screen arrows provide street/sewer transition directions to carriers and interceptors. Projected text avoids the aiming area; no minimap, interaction button or stationary wait.
- **Noir contrast:** dark logo-purple (#1a0c21) textured cards, crooked bold lettering and restrained title animation. Twelve death and twelve victory phrases rotate through local shuffle bags. Sixty-four case jokes rotate by pickup/loss/taken/loose context, staying stable between ownership events. Repeated score-retention/pickup tutorials are removed; essential scoring, destination, countdown and suspension statuses remain. Incident subtext is brief noir flavor. Light cards and the two rejected title slogans remain removed.
- **Dispatch:** alternating red/blue roof beacons plus a 1.6-second whoop every four seconds from the nearest ready machine, fading out at 85 units. Busy state stops both; audio is a single bounded voice. Maintenance retains its wall bench, tool board, supply cabinet and breaker panel with a clear center/entrance.
- **Bots:** flat objective travel 12, final/stair approaches 6.5; Closing carriers evade visible threats, Chain carriers deliver and some pursuers intercept, Excessive carriers fight/strafe. Nearby case seekers suppress speculative fire that would knock it away. Combat cadence is about 20% faster, angular error 30% smaller (2.8–5.6°); delayed perception remains. Shared flow fields, bounded planning and progress recovery are preserved.
- **Lighting/readability:** accepted dark overhead lighting, nine-unit lamps on paired curb rows, stronger opponent outlines and small rat-only material brightness lift. Your outline stays hidden through death/respawn. Four reused downward lights, no added shadow maps. `lighting=classic` restores older illumination settings but keeps the new lamp layout. Big Cheese now sweeps its visible radius; ordinary ball tuning is unchanged.

Ordinary cheese balls are yellower; enemy shots have stronger red-orange outlines/trails. Crossfire banked balls turn red: your own have a shaded red core without enemy glow/trail; enemy ricochets have brighter red cores and glowing red outlines/trails. Shaded pores and ball geometry remain.

Controls, shoulder camera, gun/muzzle, case grip, ordinary ball tuning, incident lifecycle, caps and damage protections remain.

## Persistence and preview

Current protocol **7** permits explicit uncredited Tampering damage/deaths and nullable environmental projectile/corpse ownership. Matching client and Worker builds are required; strict decoding rejects missing or mixed attribution. Protocol **5** introduced `deliveries`, `deliverySerial` and `lastDelivery`; matching client/Worker builds are required. Strict decoding validates personal scores and complete unique landmark permutations. Compatible current state restores without rerolling. Storage-only migration starts a fresh Chain when the old state contains shared stamps, because those cannot become personal credit. Compatible Closing/Excessive progress remains; earlier doorway/45-second/Misfiled migrations are retained. Stale reset deadlines cannot interrupt an assignment. No production room was migrated.

[Full game preview](http://127.0.0.1:5190/?room=graybox-benchmark-match-scoreboard-v16&diagnostics=quiet&lighting=pools): refreshed client against the unchanged private Worker `f49f4645-e716-4b98-a4cd-03eed72d96a4`, protocol 5; expires September 10 at **3:51 AM Pacific**. Production is unchanged. See [current checks and limitations](verification/tab-scoreboard-local-outline-2026-09-10.md).

## Latest verification

670 automated tests pass with bounded client concurrency, plus typecheck and both builds. Full-roster stats tests cover all modes, current state on late join, stable updates, health, joins/leaves, reset/reconnect and the actual Closing winner. Input event tests cover hold/release and focus loss; outline tests cover both death paths and respawn. Static gameplay-camera review covers all three modes and 12/24-player tables. Passive private hosted check: eight rats, 172 snapshots, zero invalid packets, exact served client bytes. Human gameplay/input review remains pending. Previous bot-route results remain in the [delivery receipt](verification/cheese-interior-delivery-2026-09-10.md); those routes were not repeated for this client-only change.
