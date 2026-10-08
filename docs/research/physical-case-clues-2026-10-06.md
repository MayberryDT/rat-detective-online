# Physical case clues: six creative directions

6 October 2026 · research/design only · current owner direction

**Tyler’s decision:** no arrows, directional HUD, compass bearings, projected routes, pointing particles or other direct-to-case cues. A/C/D in the previous report are rejected. Instead, players find physical clues on the map, outlined in the hot case’s bright red, and follow the evidence toward the case. The earlier exact-location guidance recommendation is superseded. This document proposes clue identities and behavior; none is implemented or accepted.

**Recommendation: dropped case files first; wet paw prints second.** Paper visibly belongs to the existing overstuffed briefcase. It can make the shooter’s existing chase feel like a detective pursuit without asking players to solve a separate puzzle. Test one clue language at a time. A stationary-case fallback belongs to the chosen concept, not a second clue system.

## Shared visual and play contract

- Physical props or surface marks in the city, with the **same bright case-red outline**, steady rather than pulsing. Outline communicates “case evidence,” never age, urgency or direction. For this proposal it respects physical occlusion; it is not another through-wall case beacon. No floating labels, map icons, edge indicators, glow pools, beams or inspection overlay. Actual clue silhouettes must differ from the briefcase so players never mistake a clue for the pickup.
- Direction is **inferred from evidence**, never drawn. Do not deliberately rotate paper corners, photos, cigars or crumbs to point toward the next clue. Real footfall orientation may describe actual movement; it must not turn into a giant pointer. No numbered trail, shrinking distance counter or “warmer” meter.
- Read by seeing while moving. No use key, compulsory collection, animation lock, zoom, inventory, journal or reward for visiting a clue. Players may shoot, cut across a block, collect a supply or intercept instead of retracing every step. Witness notes are the optional text-heavy exception, with at most a few words visible on the physical paper.
- Initial **per-view cap: three clue clusters** within a proposed 25-unit local range, on visible surfaces; a cluster has at most two outlined pieces. Paw tracks have a separate four-pair cap described below. These are starting design budgets, not validated sizes/distances. No fourth cluster gets an overlay. Placement spacing and a bounded shared trail should prevent a carpet; any display selection must remain stable while players move. Never compensate for poor readability with more clues or flashing.
- All players encounter the **same world evidence**, not a personalized breadcrumb path. Bots perceive the same local, unoccluded clues and freshness/details, without getting a hidden exact carrier fix, future clue list or direct target coordinate. Bots may retain what they actually saw, as humans can. Existing periodic global case pings/hidden carrier fixes must cease as tracking aids under this information rule; direct sight and ordinary physical case interactions remain.
- Source baseline inspected: exact production `2822d1a` / protocol 33. Existing `CaseModel.ts` supplies cream paper, brass/leather and EVIDENCE styling; `HeatPrints.ts` supplies a historical visual reference, **not this proposed mechanic**: today’s prints are camera-near, client-created, short-lived additive heat marks. Durable shared clues would require later authorized work and cost review. No new network, storage or routing system is authorized by this report.

Each description below is a static mock specification grounded in those existing materials and the current rat-noir city. The proposed clue props do not yet exist as verified game art. No gameplay renderer, live room or fabricated screenshot was used; these descriptions are the deliverable instead of claimed in-game mock images.

## 1. Spilled case files — “Someone’s losing their paperwork”

**What it looks like / mock:** on the dark pavement by an actual doorway, one cream manila folder lies half-open, with one rumpled sheet sticking out. Its large red EVIDENCE stamp echoes the briefcase tag; a crisp red outline encloses the folder and sheet. No flutter, sparkles or arrow-shaped folded corner.

**Placement:** shed a small cluster from the carrier’s *real grounded movement* after meaningful travel, favoring the real crossing of a doorway/junction over constant every-step litter. Proposed spacing 8–12 units. A case shot or airborne carrier leaves no imaginary papers through the air: the last supported cluster and a real landing cluster create an honest break. A loose, never-carried case starts with a small spill nearby and up to two matching pieces on safe adjacent approaches, not a synthetic route from every spawn.

**How to follow:** fresh papers are whole and pale; older ones are crumpled/damp and carry the same coarse docket mark. Look along the surrounding streets for matching, fresher paperwork. At a fork, choose which continuation to investigate; if the next piece is hidden, look around or take an interception route. No prop orientation is a heading, and matching the stamp never requires reading tiny text.

**Clutter cap:** three clusters, at most two outlined pieces each. Long-running trails expire rather than accumulating across the city; prototype a roughly 20–30-second usefulness window, then judge it in play.

**Handoff/drop/respawn:** a handoff does not invent new paper at the catcher’s future destination; subsequent sheds follow the new carrier. A drop makes one fresh spill at the actual case position; old material ages out rather than magically rotating. Objective relocation clears the old trail and seeds the small new spill. Player respawn leaves the shared evidence intact and provides no free clue at that player’s feet.

**Bot parity:** same observed clusters, docket identity and coarse freshness; bots search plausible continuations, not the hidden case. Neither humans nor bots must “claim” a sheet.

**Why it could be fun:** the prize literally leaks evidence while everyone fights over it. You can spot a fresh page during a gunfight and make a quick chase/flank decision. **Risk:** sparse paper must be recognizable at running speed; too much litter or a falsely continuous route would defeat the brief.

## 2. Wet paw prints — “Fresh tracks in a dirty city”

**What it looks like / mock:** at the edge of a sewer entrance, two paired rat paw impressions cross the pavement. Fresh marks have a wet, pale center; older marks are broken dry patches. All use a steady red contour, without the current fiery fill, pulse or heat haze.

**Placement:** actual grounded carrier steps, grouped into short track patches rather than a continuous carpet. The case contains a leaking inky stamp pad: evidence stays attached to possession, not a particular rat’s health or an unrelated weather condition. Stops leave no repeated identical prints. No mid-air stamps; landing resumes on the correct support surface. A never-carried loose case has a small ink spill beside it, without fake footsteps to a nonexistent walker.

**How to follow:** the physical heel/toe shape and the progression from drying tracks to fresh wet tracks describe travel. This is an actual bodily trace, not an authored pointer. At crossings, freshness suggests which track continues; nobody is forced to solve a paw-print puzzle. If “no directional cues” includes even anatomical track orientation, use round blot prints and freshness alone—the rest of this concept still works.

**Clutter cap:** four separated paired patches, maximum eight paw silhouettes in view. Never show the whole walked distance. Replaces the existing glowing prints instead of layering over them.

**Handoff/drop/respawn:** new carrier starts its own actual footprints; old prints dry naturally. A dropped case has its local spill; player respawn preserves existing shared tracks. Objective relocation removes the old episode; no footprint line across a teleport.

**Bot parity:** bots see the same patches and coarse wet/dry state, including actual print orientation if retained. No full step-history download supplying more information than the displayed patches.

**Why it could be fun:** tracks are understood with a glance and naturally tell a story of rushing, doubling back or leaving an alley. **Risk:** dark ground, stairs and mobile scale can turn them into unreadable red specks. The case’s footsteps and the owner’s explicit no-pointer rule need a quick visual judgment before this is selected.

## 3. Cheese crumbs — “A trail of incriminating cheddar”

**What it looks like / mock:** a thumbnail-sized heap of three chunky cheese chips sits beside a street crate; its one shared cluster outline is bright red. A fresh broken piece has a pale exposed face; an older heap has dulled, crushed fragments. It must look like evidence, not a supply pickup or the normal yellow balls fired in combat.

**Placement:** a leaky cheese-stained case sheds heaps along real movement, with a few fresh chips at a drop/landing. **Alternative emphasis:** for a loose case, pre-seed three small heaps on nearby accessible approaches, growing fresher toward the spill. This is a compact scene around the case, not a city-wide radial guide or a carefully shaped crumb arrow. The carrier trail then replaces those seed heaps as it moves.

**How to follow:** compare intact fresh chips with older crushed heaps and look for another matching heap in neighboring space. Placement and condition suggest continuation; no aligned wedge tips or directional density ramp aimed at a hidden carrier. You can choose the likely alley or rush ahead.

**Clutter cap:** three heaps, each rendered as one outlined silhouette. No scattering dozens of individually glowing crumbs. Freshness must be readable without animation or color alone.

**Handoff/drop/respawn:** subsequent heaps follow the new carrier; drop adds a compact spill. Objective respawn clears prior heaps before reseeding; player respawn changes nothing in the world. There is no breadcrumb reward to collect.

**Bot parity:** bots sample only the visible heaps and their coarse condition, never the seed generator’s central position. A pre-seeded ring must not give bots the hidden center mathematically through privileged metadata.

**Why it could be fun:** instant rat/cheese joke, quick chase information and no reading. **Risk:** the arena already has cheese projectiles and cheese weapons. If players mistake these for ammo, danger or pickups, reject it rather than adding explanatory HUD.

## 4. Torn photographs — “The next place is in the picture”

**What it looks like / mock:** a large, battered black-and-white evidence photograph lies on an actual stoop. It shows a bold cropped detail of a recognizable city landmark—a particular doorway or sign—not a miniature busy city screenshot. The paper has one torn edge and the same red outline. No portrait/name of the carrier.

**Placement:** a deliberately pre-seeded **short landmark chain** around a loose case: one photo depicts a recognizable nearby place; that place holds another physical photo or the case spill. Maximum two hops, with multiple places to approach from. The clues exist independently of whether anyone reads them; reading does not unlock or spawn the next clue. Once carried, real sheds can depict the place the carrier just left, **not its secret next destination**.

**How to follow:** recognize the photographed place and decide how to get there. The image describes a place, never contains an arrow or compass cue. This is light visual recognition, with optional inference about an exit; it cannot honestly provide a dependable moving-carrier trail on its own.

**Clutter cap:** two photo props visible locally; no auto-open pictures, chain diagram or collectible album.

**Handoff/drop/respawn:** carried photos retain truthful places already visited; never rewrite a photo to reveal a new carrier’s location. Drop leaves one photo beside the case; objective relocation clears the old seed chain. Player respawn sees whatever photos currently exist, not a reset puzzle.

**Bot parity:** a bot that can see a photo receives the depicted landmark identity, just as a human recognizes it; it gets no future chain or target location. Humans unfamiliar with the map may still be disadvantaged—bot equality in data does not guarantee equal recognition skill.

**Why it could be fun:** a quick “I know that doorway” moment adds detective character and rewards knowing the arena. **Risk:** this is the closest to a clue hunt; textural recognizability and moving-case relevance are weak. Keep optional and low priority; reject if players stop to decode images instead of battling.

## 5. Cigar ends and ash — “The case has bad habits”

**What it looks like / mock:** beside a real doorway threshold, one cartoonishly thick cigar end lies in a small ash smear, with a red EVIDENCE band and bright red silhouette. Fresh ash is intact; older ash is trodden flat. No smoke column, glowing ember beacon or trail of sparks.

**Placement:** contents shed from the case at actual grounded turns/doorway crossings and longer pauses, not an invented smoking mechanic or a new mandatory carrier action. An unopened loose case has a small ash spill by it. Because turns and pauses are intermittent, this creates a sparse record of visited locations rather than a complete walking path.

**How to follow:** identify the unique evidence band and compare intact versus crushed ash at nearby plausible exits. A cigar’s long axis is random, never a heading. Foot scuffs can describe activity at the spot without pointing at a destination. Missing ash at the next corner is a reason to search or intercept, not an arrow failure.

**Clutter cap:** three combined cigar/ash silhouettes; never outline every ash grain.

**Handoff/drop/respawn:** new sheds follow the current carrier; old ash remains briefly as genuine history. Drop adds the local spill. Objective respawn clears old evidence; player respawn does not manufacture cigars along its route.

**Bot parity:** same visible bands and ash condition; bots cannot infer a future pause/turn or use hidden holder identity to track.

**Why it could be fun:** hard-boiled noir humor and memorable hotspots rather than a carpet. **Risk:** cigars are too small without exaggeration, and this gives less useful continuity than files/prints. Best as an alternative visual theme after the evidence loop proves itself, not a second simultaneous trail.

## 6. Witness notes — “Someone saw something”

**What it looks like / mock:** a cream note is pinned low to a doorway/crate, with a cartoon rat paw stamp and four or five large handwritten words: “PAPERWORK AT THE RECORDS DOOR.” Same red outline on the actual paper; no floating speech bubble, NPC actor, portrait or voice line.

**Placement:** a tiny **shared landmark relay** records the carrier’s real passage through witnessed locations. A note can name the *most recent observed place* beyond this one; it cannot predict the next move. For a newly loose case, one or two notes near existing landmarks can refer to its actual nearby spill. No reading-triggered reveal chain and no exact coordinate broadcast. Fictional off-screen witnesses provide the flavor; this does not create another population of gameplay rats.

**How to follow:** read the place name and choose a route there. Notes are descriptions of sightings, not instructions such as “turn left,” bearings or directions to a hidden rat. Limit references to well-established landmarks, not anonymous numbered alleys. Notes can be stale, visibly rain-smeared; certainty about the case itself still comes from finding it.

**Clutter cap:** two readable physical notes locally, maximum one short line on each. No HUD transcript. If readable type requires giant panels or stopping to inspect, reject the concept.

**Handoff/drop/respawn:** notes keep their truthful historical sighting rather than changing to name the new holder. A new sighting replaces old local information; objective relocation clears the old episode’s relay. Player respawn does not grant all notes or automatically read them.

**Bot parity:** bots read a note only when locally visible and close enough for its text to be legible to humans; receive the same landmark/staleness, not hidden coordinates. No access to unwitnessed movement.

**Why it could be fun:** terse noir gossip and choices about whether to trust an old lead. **Risk:** text reading and knowledge of landmarks add friction and can slide toward the slow detective game Tyler excluded. Treat as optional atmosphere first, not the default pursuit mechanic.

## What happens when evidence runs out?

No direct-case fallback is allowed. A missing clue stays missing; players search locally, use sight/combat sounds or intercept likely streets. That preserves agency but creates a genuine **discoverability risk**, especially after spawn, flight or a stationary case. Do not claim always-visible guidance survived this decision.

For the selected concept, a bounded seed spill near a loose case and a small number of nearby safe approaches can start discovery without faking movement history. A piece around an entrance means “evidence is here,” not “this is where you must go next.” Keep seeding spatially local and physically plausible, never teleport clues in front of each player or create a shortest-path chain. Existing gameplay can keep the case moving; no clue gate, mode clock or new ability is needed.

Handoff should not wipe genuine recent history instantly; it still leads to the change-of-possession scene. Objective relocation is different: clear old episode evidence so it cannot lead forever to an obsolete location. Ordinary player death/rejoin must not reset world evidence. Airborne gaps, wrong floors and looping trails are honest limitations to test, not occasions to reintroduce arrows.

## Recommended first design comparison

**Files versus wet prints**, separately, with the exact same underlying movement trace, stationary-case seed rule, freshness window and local budget. Make the clutter comparison honest: outline clusters rather than every scrap; preserve bright steady red and forbid all pulse/locator remnants. No photos/notes layered on to rescue readability.

Use a few static game-scale scenarios before any approved playable work: a street fork; one file/track disappearing behind a wall; a sewer/street transition; carrier handoff; an airborne break; a newly spawned stationary case; a ten-rat cheese-ball fight. Include 844×390 mobile, grayscale, Blackout and low graphics. Ask “What do you think happened here?” and “What would you do next?” **Do not require choosing the developer’s intended route**: a justified intercept is success.

Candidate gates: recognize evidence versus case versus pickup at a glance; notice freshness without color alone; no forced stop/use action; no arrows or deliberate pointing silhouettes; maximum three prop clusters/four paw pairs per view; no ground evidence on unsupported/wrong-floor surfaces. In later authorized human play, measure time spent hunting with no lead, time to re-enter a case contest and missed combat threats—not completion of a clue checklist. Reject a beautiful clue if it delays fighting or makes players stare at the pavement. Numbers from the earlier report remain proposed test budgets, not findings.

**Evidence and limits:** these are original concepts, grounded in the inspected release art and Tyler’s new direction. Earlier fresh public references remain useful for contrast/motion and distinguishing path from bearing, but they do not validate this information rule or these clue types. No human test, mock renderer, art asset, navigation logic, telemetry or shared clue transport was built. No gameplay change/deploy/room/service. Preserve protocol33 weapon/aim/trap ancestry, packed-cost2476135, idle-room behavior, mode targets and no-clock rule in any later implementation. The next owner choice is clue identity, preferably files or prints—not permission to reinstate A/C/D.
