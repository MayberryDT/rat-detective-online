# Dispatch Assignments — personal delivery race and noir UI

Updated September 10, 2026. Tyler’s first-to-three delivery request supersedes the earlier shared six-stamp finish; the latest revision adds a held-Tab full-lobby scoreboard and hides only the local rat’s outline halo. These changes are committed and included in the [September 10 production release](verification/production-release-2026-09-10.md). Private playtest records below retain their dated scope.

## Closing Time removed — protocol 25

Closing Time is no longer an assignment. The playlist shuffles three modes: Excessive Force, Jurisdiction and PAPER CHASE. A room restored with a saved Closing Time round starts a fresh Jurisdiction round instead, and any pending win screen from it is cleared. Assignment state no longer carries `remainingMs`, and the companion status no longer reports `remainingMs` or the `last-holder` unit. Sections below that mention Closing Time are history.

## Incidents changed in protocol 27 (Tyler, 1 October)

Rat Race, Delayed Reaction and Clean Bill are gone. A stored room that still names one runs All Units, Crossfire or Most Wanted instead (`LEGACY_INCIDENTS`); one that names Malpractice runs Code Violation. Their wire fields (a shot's `delayed`/`stuckUntil`), the `unstick` sound and the retired heal causes are removed; a heal cause is now `pickup` or `case-kill`.

- **Most Wanted:** the police searchlight follows whoever is winning the assignment (then kills). The server looks again every second (`INCIDENT_TUNING.wantedEveryMs`); on a tie the light stays where it is, and when the wanted rat dies it moves at once to the next living leader. Whoever takes the wanted rat down gets a random supply through the ordinary reward draw (`rewardSupply(id, 'bounty')`, weapons included, Quick Fix only when hurt); a self-kill or a death to the city pays nothing. Every player sees a WANTED poster slapped on the top of the screen with the target's name (YOU in red if it is you), a red WANTED stamp on the target's nameplate, and on the takedown a BOUNTY CLAIMED stamp with who took down whom and the supply's art, with a bell strike; the next target's poster waits until the stamp is gone. Both stay above the aiming area. Bots hunt the wanted rat as before.
- **All Units:** the fallen respawn among the 12 supported spawns nearest the action (the active Jurisdiction zone, or else the real case or its carrier; `src/shared/allUnits.ts`), at least 10 units away, on the one farthest from living rats. It now opens with an ALL UNITS · ALL UNITS radio banner and a police-radio squawk; each rat that respawns as backup strobes red and blue all over for 2.2 s (emissive colour only, no lights) with a prowl-car yelp; your own respawn shows a YOU'RE BACKUP card whose arrow keeps pointing at the action.
- **Scattershot:** still a five-ball fan. Each ball that hits a rat shoves it 22 u/s along the shot and 9 u/s up (`scatterShove`, `scatterLift`); shoves on one rat in one step add up to at most 60 u/s sideways (`shoveMax`). The shooter's own kick is 3.2× harder, with a deeper gunshot and a BLAM. A held special weapon replaces the pattern, so it does not shove.
- **Bobbleheads:** every head is three times bigger (`BOBBLEHEAD` in `src/shared/rat/ratBody.ts`), grown from the neck, with a spring wobble, a squash and boing on hits, floppier heads on corpses, and the nameplate raised to clear it. The head's hit sphere grows to match on the server's hit bodies and on other rats in client prediction, never on a rat's own moving body, so heads cannot catch on ceilings; the same for humans and bots. A headshot kills, as it always does, so the big target is the whole point. Bots do not aim higher; they land more headshots only because heads are bigger.
- **Bad Ammunition** (Tyler: "funny paths that still land where you aim"): jams, duds and crooked multi-ball volleys are gone. Every trigger fires one ball whose personality is named by its shot ID (`badRound` in `src/shared/shotPattern.ts`), so the shooter's prediction, the server and every watcher agree: a **corkscrew** (95 u/s, a 0.5 u spiral five times a second, drill whine), a **snake** (80 u/s, swaying 0.6 u, slide whistle), a **floater** (34 u/s with a bob, lives 2.6 s, kazoo), a **hiccup** (stops dead in the air for a moment, then lurches on at 230 u/s, the recorded mouth pop pitched into a HIC!) or a **superball** (an ordinary flight that keeps all its speed at every bounce, capped at 175, lives 3 s, boing on each bounce). The four path personalities fly the aim line with no drop until their first contact, then become ordinary balls; they stay within about 0.7 u of the aim line, so shots still hit (`BAD_AMMO`, `steerQuirk` in `src/shared/shotBallistics.ts`). Words float over your own ball (WHEEE!, WIGGLE!, BOING!, PFFFT., HIC!). The backfire soot, cough and womp are gone; a held special weapon fires its own plain ball.
- **Code Violation** replaces Malpractice (stored rooms that name Malpractice run it). Every supply site of every kind hops 5 u away from a rat within 7 u (at most every 0.65 s, within 12 u of home) and walks home afterwards; 35% of claims blow up as neutral cheese instead (death cause `malfunction`). Each launch machine fills itself to bursting every 3.5–7.5 s at random, one in three as an overpressure, and any machine firing during the incident shoves rats within 11 u of its pad. Every 1.8–4.2 s an alarm pillar near a rat clangs and shoves rats within 7 u. On the client, kits fidget, machines and pillars rattle, and they throw sparks with a zap when close (`violation*` in `INCIDENT_TUNING`).
- **Act of God** (new): giant cheese meteors fall near random living rats, every 1.4 s at first and every 0.7 s by the end, at most 8 in the air. Each lands on the first surface under open sky, so a roof shelters. Its shadow grows and darkens for 2.2 s first. On impact rats within 3 u are flattened (nobody is credited; death cause `meteor`), rats within 13 u are thrown 14–36 u/s out and up, bodies and loose cases are kicked, and it bursts into cheese under the shared 256-ball cap. Meteors are saved, restored and sent on the wire as `meteors`. The look (`src/prototype/MeteorVisual.ts`): a lumpy glowing rock on a slanted trail, the shadow with a broken red hazard rim, a shock ring to the blast radius and a 14 s scorch; a whistle, boom, crater dust and shake (no lights). Bots step out of a shadow they can see and walk around one ahead of them with their ordinary controls (`meteorEscape` in `src/shared/bots/motor.ts`), and Jev is told about the shadows in words.

## Jurisdiction production release — September 13

The accepted and released playtest follow-up renames Chain of Custody to **PAPER
CHASE**, with “Deliver the paperwork. First to three wins.” Its stored/network ID
remains `chain-of-custody`, preserving rounds and progress. Bots now favor active
objectives over optional supply excursions, and direction cards remain visible
during roulette. See the [follow-up receipt](verification/objective-focus-paper-chase-2026-09-13.md).

Jurisdiction was added in protocol 16; the latest 75-second timer requires protocol 18. A living genuine-case carrier earns one point per
second inside the active zone; first to 60 personal points wins. Enemies inside
do not pause it. Death, theft and leaving retain points. The zone moves every
75 active seconds with a 10-second warning; the case does not move with it.

The first September 13 pacing follow-up increased duration by 50%; Tyler then
accepted the gameplay and requested 75 seconds total. A large standalone countdown
now sits at top center outside the score card, above roulette, with amber in the
final 10 seconds. See the [timer follow-up](verification/zone-timer-2026-09-13.md). Bots in every
assignment avoid Ironclad-protected bodies, switch to vulnerable enemies, and
cancel body-shot bursts when armor activates. Protected carriers remain objective
targets; bots keep distance nearby and only attempt close, exposed case disarms.
A direct-shot guard vetoes known silver-coat hits before the case. Existing aim
error, reflection rules and physical case vulnerability remain. See the
[follow-up verification](verification/zone-ironclad-2026-09-13.md).

The 11 sites are Records Forecourt, Icebox Loading Yard, Central Crossroads,
The Quay, Precinct Yard, Gate Lane and South Avenue Crossing (outdoor), and
Needleworks Factory Floor, Pump Station Ground Floor, Sewer Junction and Pier 9
Warehouse Floor (enclosed): one or more in each of the nine districts. Every
zone comes once per shuffled bag; the larger category opens each bag and the
smaller is spread through it, never twice running (equal categories strictly
alternate). Only the marked floor
counts, with ordinary jumps allowed. Planted Evidence stays live; private classic
Tampering freezes progress and relocation time. The retained vulnerable rat keeps
its points through the existing 30-second reconnect reservation.

See [Jurisdiction verification and preview](verification/jurisdiction-2026-09-13.md).
The public release now uses protocol 18; see the [release receipt](verification/jurisdiction-production-2026-09-13.md). The sections below include dated
protocol/preview history; their protocol 7 and new-identity reconnect statements
are historical.

## Current rules

| Assignment | Winning action | Progress |
| --- | --- | --- |
| Excessive Force | Reach ten attributed kills while holding the primary case when each kill resolves | Exactly one qualifying point per kill. Personal case kills survive death, disarm and reacquisition independently of total kills. Since protocol 27 (Tyler, 1 October) the carrier's hits deal double damage (`CHAOS_TUNING.carrierDamage`) and every credited case kill heals it to full (heal cause `case-kill`) |
| Jurisdiction | Earn 100 personal zone points (60 before protocol 27) | Hold the genuine case inside the active floor-specific zone; 1 point per second. Since protocol 26 (Tyler, 1 October) a zone has no clock: it holds 20 points (`JURISDICTION_TUNING.zoneMs`) that drain to the carrier only while the case is held in it, then it moves to the next zone. Only the active zone is ever on the map, in the HUD, in the companion feed or known to bots; the next appears when the current one is emptied (Tyler, 1 October: never several zones up at once). The last 5 points tick down |
| PAPER CHASE | Earn ten personal paperwork delivery points (three before protocol 26, five in protocol 26) | Carry the case anywhere inside the currently named whole landmark for one point. Respawn the case at a random clear pickup site and activate the next landmark immediately. Personal scores survive death, disarm, theft and Tampering |

**The case's grip (Tyler, 1 October).** In every assignment, a carried case comes loose after three enemy balls, each within 2 seconds of the last (`CHAOS_TUNING.caseGripHits`, `caseGripMs`); a grip left alone for 2 seconds is whole again, and a new carrier starts with a whole grip. Until then each hit jolts the case and swings it a step further out of the paw, with a rising knock (`case.grip` in the snapshot, 1 or 2). Killing the carrier still drops it at once. Before, one ball knocked it loose, and about half of all carries ended that way (47% over 1,317 carries from 1 to 1 October; median carry 6.5 s). The goal is a 15–20 minute Excessive Force at 10 kills, reached through play; [no mode ever gets a time limit](../AGENTS.md).

**The case batch (Tyler, 1 October, protocol 26).** A shot case flies 20% slower (kick 24, lift 8, cap 38.4: everyone was shooting it away from everyone else). Taking the case brings a random supply through the kill-streak draw (Quick Fix only when hurt), at most once per 20 s per rat (`caseRewardMs`). The recorder now logs every loose spell (time, path, straight-line move, balls that hit it) and each drop's cause and grip hits; the era report reads them.

Chain landmarks rotate in a server-shuffled eight-landmark bag until someone earns three points. Every landmark appears once per bag; if a match needs another bag it reshuffles without repeating the previous destination immediately. There is no fixed first/last building, no full-bag match requirement and no stamp mechanic. Snapshots, theft, late joining and eviction retain the selected order and personal scores. Random shuffling does not promise that an entire permutation can never recur.

| Landmark | Accepted player interior bounds: X / Z / Y | Existing navigation approach |
| --- | --- | --- |
| Icebox | 106..154 / −91..−31 / −0.5..24 | South loading entrance |
| Sewer Maintenance | 60..70 / −42..−30 / −7.5..−1 | Maintenance corridor |
| Pump Station | 100..150 / 99..137 / −0.5..24 | South entrance |
| Needleworks | −143..−67 / 56..108 / −0.5..24 | South entrance |
| West Sluice | −146..−128 / −32..32 / −0.5..24 | Walk strip beside the ramp |
| Records Bureau | −48..16 / −81..−37 / −0.5..24 | South entrance |
| Harbour Master (Pier 9 office) | 122..135.6 / −125..−114.4 / −0.5..5.1 | Pier 9 south door, then the office door |
| Precinct Front Desk (lobby) | −113..−96 / −118.4..−109 / −0.5..7.4 | Precinct front door on the −102 street |

X/Z must be strictly inside; Y includes the lower bound and excludes the upper. This accepts alternate entrances and interior floors while excluding roofs, outside pavement, and the street directly above Maintenance. Approach coordinates guide the existing bots and recovery only; they do not constrain where entry scores. There are no interaction buttons, stationary waits, north/south building subdivisions or new map geometry. Needleworks is the existing name of the user’s Needle landmark. West Sluice is separate from Pump Station, so including the omitted landmark makes six eligible destinations. Historical geography was checked against GBrain `brain:sessions/2026/09/rat-detective-distinct-interiors-playtest-pass-2026-09-07` and current shared layouts.

The assignment playlist uses a shuffle bag of three modes with no immediate repeats across boundaries. A stored bag that still names Closing Time is discarded and reshuffled. One assignment completion ends the match. Version-2 assignment rooms have no normal kill-limit, elapsed-match win or highest-kills fallback. Total kills are actual kills; the old 2× carrier multiplier remains only in the separate legacy version-1 path.

Excessive Force evaluates possession synchronously at attributed kill resolution: fire then collect before the kill scores; fire while carrying then lose the case before the kill does not. Projectile, ricochet and corpse-missile attribution remains. Misfiled Evidence has no active selection/instructions or loose-delivery win. Departed identities are pruned; reconnecting retains the existing new-player identity contract.

Evidence Tampering retains eight weaponized, uncollectible cases and pauses every assignment without banking incident progress. Missiles now launch at 145, redirect at 160 and maintain at least 140 lateral speed, with short hops and vertical cap 10. They keep ricocheting and remain visible throughout the incident; seven extras still disappear at expiry. A primary case overlapping any landmark, including overlap by its physical extent, is placed outside before pickup resumes. Cleanup cannot award a delivery or win. A fresh carried entry is required. Tampering cases and their neutral corpse chains credit no player kill or case point: only victim deaths increase. The feed rotates 24 named paperwork jokes, such as “The case rested. On Captain Crawley.” Ordinary player-attributed kills retain their existing scoring.

## Presentation and bots

- **Excessive Force:** accepted top-five case-kill scoreboard out of ten, personal progress/rank, total kills separately, “KILLS COUNT” versus “GET THE CASE TO SCORE.” Qualifying-kill confirmation sits above the aiming area.
- **Chain:** top five delivery scores out of three, your own score, whole-building destination name and instruction to carry the case inside. Every point confirms “PAPERWORK DELIVERED!” and updates the next destination immediately; non-winning deliveries also announce “CASE RELOCATED” without a lost-case sound. There is no shared-stamp track.
- **Full scoreboard:** hold Tab for every investigator’s mode progress, kills, deaths, K/D, total case time, possession share, identity and health/carrier/death status. Server snapshots supply all round totals, including after late join. Release, blur, hidden tab, pointer unlock or Escape dismisses it; a held view updates through round reset. Wheel scrolls large rosters; horizontal/Shift-wheel handles narrow windows. This translucent table temporarily hides competing HUD overlays without pausing the game or changing pointer lock.
- **Guidance:** the September 13 visual follow-up removes the yellow building silhouette; the red case outline remains. Destination labels/off-screen arrows provide street/sewer transition directions to carriers and interceptors. Projected text avoids the aiming area; no minimap, interaction button or stationary wait.
- **Noir contrast:** dark logo-purple (#1a0c21) textured cards, crooked bold lettering and restrained title animation. Twelve death and twelve victory phrases rotate through local shuffle bags. Sixty-four case jokes rotate by pickup/loss/taken/loose context, staying stable between ownership events. Repeated score-retention/pickup tutorials are removed; essential scoring, destination, countdown and suspension statuses remain. Incident subtext is brief noir flavor. Light cards and the two rejected title slogans remain removed.
- **Dispatch:** alternating red/blue roof beacons plus a 1.6-second whoop every four seconds from the nearest ready machine, fading out at 85 units. Busy state stops both; audio is a single bounded voice. Maintenance retains its wall bench, tool board, supply cabinet and breaker panel with a clear center/entrance.
- **Bots:** flat objective travel 12, final/stair approaches 6.5; Chain carriers deliver and some pursuers intercept, Excessive carriers fight/strafe. Nearby case seekers suppress speculative fire that would knock it away. Combat cadence is about 20% faster, angular error 30% smaller (2.8–5.6°); delayed perception remains. Shared flow fields, bounded planning and progress recovery are preserved.
- **Lighting/readability:** accepted dark overhead lighting, nine-unit lamps on paired curb rows, stronger opponent outlines and small rat-only material brightness lift. Your outline stays hidden through death/respawn. Four reused downward lights, no added shadow maps. `lighting=classic` restores older illumination settings but keeps the new lamp layout. Big Cheese now sweeps its visible radius; ordinary ball tuning is unchanged.

Ordinary cheese balls are yellower; enemy shots have stronger red-orange outlines/trails. Crossfire banked balls turn red: your own have a shaded red core without enemy glow/trail; enemy ricochets have brighter red cores and glowing red outlines/trails. Shaded pores and ball geometry remain.

Controls, shoulder camera, gun/muzzle, case grip, ordinary ball tuning, incident lifecycle, caps and damage protections remain.

## Persistence and preview

Current protocol **7** permits explicit uncredited Tampering damage/deaths and nullable environmental projectile/corpse ownership. Matching client and Worker builds are required; strict decoding rejects missing or mixed attribution. Protocol **5** introduced `deliveries`, `deliverySerial` and `lastDelivery`; matching client/Worker builds are required. Strict decoding validates personal scores and complete unique landmark permutations. Compatible current state restores without rerolling. Storage-only migration starts a fresh Chain when the old state contains shared stamps, because those cannot become personal credit. Compatible Excessive progress remains; earlier doorway/45-second/Misfiled migrations are retained, and a saved Closing Time round becomes a fresh Jurisdiction round. Stale reset deadlines cannot interrupt an assignment. No production room was migrated.

[Full game preview](http://127.0.0.1:5190/?room=graybox-benchmark-match-scoreboard-v16&diagnostics=quiet&lighting=pools): refreshed client against the unchanged private Worker `f49f4645-e716-4b98-a4cd-03eed72d96a4`, protocol 5; expires September 10 at **3:51 AM Pacific**. Production is unchanged. See [current checks and limitations](verification/tab-scoreboard-local-outline-2026-09-10.md).

## Latest verification

670 automated tests pass with bounded client concurrency, plus typecheck and both builds. Full-roster stats tests cover all modes, current state on late join, stable updates, health, joins/leaves, reset/reconnect and the actual Closing winner. Input event tests cover hold/release and focus loss; outline tests cover both death paths and respawn. Static gameplay-camera review covers all three modes and 12/24-player tables. Passive private hosted check: eight rats, 172 snapshots, zero invalid packets, exact served client bytes. Human gameplay/input review remains pending. Previous bot-route results remain in the [delivery receipt](verification/cheese-interior-delivery-2026-09-10.md); those routes were not repeated for this client-only change.
