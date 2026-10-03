# Rat Detective juice plan

Living plan, started **2026-09-27**. This file owns current status and order.
Older plans, handoffs and receipts are **reference only**; Tyler asked to start fresh.
Where an older decision conflicts with this plan, this plan wins (see
[what this supersedes](juice/feel-spec.md#what-this-supersedes)).

## What we mean by juice

Tyler named this work **juice** (2026-09-27): the small, layered responses that
make the game *feel* good. That covers little screen shakes, on-kill effects, tiny
sounds, very subtle animations, and the atmosphere that sells the noir city. Juice
is presentation only; it never changes the rules, authority or tuning.
"More juice" is the ongoing goal. The first batch is below; the next is the
[noir pass](#next-exaggerated-noir).

In code the juice layer lives in `src/feel/`, and its switches keep the names
`?feel=off` and `?feel=dev`. The earlier working name was "polish"; the branch is still `polish/feel`.

## Outcome

Make every action physically felt. Shooting, hitting, being hit, killing, dying,
moving, flying, carrying and scoring each get a layered, immediate response
across camera, impact, character, sound and screen. The noir cartoon tone and the
rat's identity stay as they are. Done means:

- Every cell in the [feel spec](juice/feel-spec.md) is implemented or explicitly cut by Tyler.
- `?feel=off` restores today's presentation for side-by-side comparison.
- Settings expose camera shake and flash strength.
- Frame time stays within the [budget](juice/foundation.md#performance-budget) on desktop and a lighter phone tier.
- Tyler accepts the finished whole at one final review.

## Execution boundary

**Authorized 2026-09-27:** Tyler asked me to implement all of it myself, one item at a time, and leave everything for his review at the end.

- **How:**
  - I build every item myself, one at a time, with no subagents. The one exception is a single independent code reviewer on the finished diff.
  - Work happens on the local branch `polish/feel`, one commit per item, so an item can be reverted alone.
  - `main` and production stay untouched. **No GitHub push or production deploy** without Tyler's explicit OK. Deploying the private capacity-test fixture for the final preview is allowed.
- **Presentation only**, with approved exceptions: Case File awards may add optional per-player stats to snapshots or round results ([feel spec §8](juice/feel-spec.md#8-rewards-and-round-end)); and the third batch's T4 (5 HP, lethal headshots) and T5 (10 s round end, lineup) are gameplay changes Tyler approved, which move the protocol to 19. No other change to authority, damage, hitboxes, ball/launcher/jump tuning or bots.
- **Aim stays exact.** Camera effects never move the aim ray, crosshair target or real muzzle ([invariants](juice/foundation.md#invariants)).
- **Identity is fixed:** fedora, three-button coat, 1,024-colour palette, floating sleeves without hands, the case sleeve rule, and the rat silhouette. Model changes get [render sheets](juice/character.md#render-sheet-gate), reviewed at the end. **Shoes are on by default**, with a switch.
- No new live lights or shadow maps. No cloth simulation. Effects reuse object pools.
- Agent browser work stays muted. No automated pointer-lock/input playtests; fixtures trigger events directly. Gameplay previews use the hosted private fixture ([tooling](tooling.md#required-gameplay-preview-september-11-correction)).

## Current work

- Base: production `360dbcdd…` / commit `3ffdd8b`. Branch `polish/feel`.
- **Tyler's first review (2026-09-27):** "This feels way better." One change: the shot kick was too strong. It's now very subtle (peak about 0.4°, was 1.4°).
- **Noir pass reviewed (2026-09-27):** "It's so good", but a little over the top. Rather than toning it down, it should **scale with health** (see below).
- **Third batch built (2026-09-27):** T2, T3, T1, T4, T5 and the review fixes are committed ([review guide](juice/review.md#third-batch-t1t5)). T4 and T5 needed protocol 19, as agreed.
- **Third batch reviewed (2026-09-27):** "Wow, this is amazing." Released to production on Tyler's OK as a checkpoint.
  - **T2 noir by health:** "brilliant, it works incredibly well." Keep.
  - **T3 enemy readability:** still **way too low**, even with the lab. This is the next thing to solve.
  - **T1 entry:** better. **T4 headshots:** felt better.
  - **T5 round end / lineup:** not tried yet (he didn't reach a round end).
  - He felt a performance hit, possibly from other load on his PC. Not the focus now; see the optimization overhaul below.
- **T3 follow-up, enemy readability (built 2026-09-27):** far enemies were the worst, then enemies in shadow, then everything once hurt. The lab is removed. Opponents now get an opaque cream outline that stays about 2.5 px wide on screen at any distance (the existing shell, widened per frame; no extra pass or draw), hidden behind walls; Hot Pursuit keeps its red. Rats ignore the noir fog, so they keep full contrast at any distance and HP. First playtest: "way more clear" but too much; the thick cream line broke the noir, and he wants to rely on an outline as little as possible. Now a faint cool moonlit edge (slate blue, half opacity, at most 1.5 px) that only fades in between 16 and 45 units; close rats have none. Rats stay out of the fog.
- **Nameplate and health bar, rebuilt (2026-09-27):** the four-year-old Courier name with a green segmented bar is replaced by a noir plate: the name in spaced cream small caps over five slanted pips like case-file tabs. Lost pips flash, jolt and drain to an empty outline; the last pip burns red; regained pips fill in; a dead rat's name dims and is struck through in red. It only redraws while something changes.
- **Softer outline and nameplate reviewed (2026-09-27):** "That is great. Push it live." Released as Worker `80901b67…`.
- **Next action:** Tyler's OK to put [the city map](city-map.md) recorder on production, then he plays and we read the digest; then step 4 (the page's Observe mode). See [Open decisions](#open-decisions).

## Four-human playtest (Tyler, 2026-10-01 evening)

Production protocol 27, PAPER CHASE round `2d72a5ad` (52 minutes; Inspector Vermin, a bot, won). The players were Tyler (Operative Cheddar), Cam (Shamus Crawley), Andrew (Shamus Burrow) and Trey (Operative Gnawcroft). The transcript is `~/Documents/Meetings/202610011537 rat-detective-playthrough/transcript.md`; the case file is `output/reports/round-2d72a5ad.html` (`node scripts/round-report.mjs 2d72a5ad-0755-4161-badd-8b13c15b2295`).

What landed: the detective look, the bots ("so good"), the sewers, the Tommy Gun ("solid"), the stats ("I need to see those stats"), "a lot of good pieces", "I like the direction".

### Quick patch (agreed; protocol 28)

Released 2 October: Worker `ea258468-6c17-4831-9901-6208aaf401b6`, build `production-2026-10-02-6668ade` ([receipt](verification/protocol-28-release-2026-10-02.md)). Built without test runs, as Tyler asked; the CONTINUE flow is unexercised live.

- [x] PAPER CHASE back to 5 deliveries (10 ran 52 minutes).
- [x] Planted Evidence removed ("If I get even within two feet of the case, I get blown up"). Stored rooms run Improper Disposal; Evidence Tampering stays behind the private classic toggle.
- [x] Bobbleheads removed (your own huge head blocked your view). Stored rooms run Crossfire.
- [x] Calmer incidents: a longer quiet stretch between them (62 incidents in 52 minutes; "too chaotic", motion sickness). 40 s, was 21 s; an incident still lasts 25 s.
- [x] Harbour Master and the precinct deliver anywhere in the building, like every other landmark (humans searched Pier 9 and never found the room; bots delivered there 5 times). All of Pier 9 and the whole precinct house; layout 7.
- [x] Laser: fires like the cheese gun (same rate), 1 damage, hitscan, lasts a little longer ("a downgrade": 10 kills from 67 pickups). Its look stays for now. One click a shot under `SHOOT_RATE` (no 1 s spacing, bots too), 1 damage (headshots kill, carrier double applies), 15 s.
- [x] Mousetrap holds a rat in place instead of killing it (Cam's idea). Held 3 s (`trapHoldMs`, `PlayerBuffs.trappedUntil`): turn and shoot, no moving or jumping, no damage, no kill; the trap stays clamped shut, re-arms 0.9 s after letting go and ignores the rat it let go until it steps clear; 8 balls or 3 lasers still break it and free the rat. HELD card and nameplate; death cause `trap` gone; the `trap` fact's `snap` carries `holdMs`.
- [x] Carrier buff in every mode (flat double damage; a kill while carrying heals to full).
- [x] Results: each player leaves the stats screen when they choose; the next round starts without them meanwhile. A download button for the round's stats; more stats; the board scrolls with the mouse and has hover effects. CONTINUE (or any key) on the board; the server holds a reader who has not continued out of the new round (dead, hidden) until their `ready`, a resume or 3 minutes, and bots never wait. The report adds assists, damage dealt, time alive (kills per minute), case takes and longest carry, kills by weapon, supplies by kind, deaths by cause and the incidents rolled; hover files on names, awards and race lines; DOWNLOAD STATS saves a self-contained page with the JSON embedded. Screenshots `~/.cache/rd-shots/qp-results-*.png`.
- [x] New Scattershot sound ("I hate it"). `public/sounds/weapons/scattershot.wav` from `scripts/generate-feedback-sounds.py`: five cheese gun shots stacked a few ms apart over a cartoon whoomph (the mouth pop pitched far down plus a slowed soft impact); the pitched-down pistol and BLAM are gone. Not listened to yet.
- [x] "You've been made" keeps the phrase but says what it means: someone can see you through walls. The card adds SOMEONE CAN SEE YOU THROUGH WALLS (Hunch, Stakeout and Staked Out share it).

### Clarity batch (agreed 2 October; protocol 29)

Tyler: "We finally reached the point where there's too much chaos … we gotta double down on clarity." He approved every idea below ("I love all of it").

- [x] ~~**Case ping**~~ Built, then removed after Tyler's staging playtest (see below).
- [x] **One case colour:** built as a cheese gold (`CASE_GOLD`), then turned red after the playtest (Tyler: "make all the case stuff red"): `CASE_RED` / `--case-red` on the case shells and rim, HOT CASE tag, drop-off arrows, active Jurisdiction zone, case ledger and death recap arrow. The other moves off gold stay (Stakeout lens cyan, Tommy orange, paper cream and the rest).
- [x] **One headline at a time:** one queue for big messages; the most important wins (you got the case, you died, an incident started); the rest shrink to a single line. *Done:* every big message asks `headlines` (`src/ui/Headlines.ts`) first: your take of the case and your own filing credit (PAPERWORK DELIVERED, CASE KILL) rank first, then your death (the death screen holds until you are back), then an incident's roll and title, then everything else (other rats' case news, others' deliveries, the round briefing, WANTED, BOUNTY CLAIMED, YOU'RE BACKUP, YOU'VE BEEN MADE, TRAP IN PAW, RAT DOWN · name, streak callouts). A message that is outranked, or cut short by a bigger one, is told as one compact carbon line at the top for 3 s. Equal ranks never interrupt each other. YOU'RE ON THE CASE no longer doubles the ON THE CASE stamp, a join announces nothing, a delivery's credit carries CASE RELOCATED itself, and the ALL UNITS radio banner is gone (its squawk stays; the incident's title tells it). Screenshot `~/.cache/rd-shots/cl-hud-queue.png`.
- [x] **Incidents told, then out of the way:** a big 2 s title with its picture and a one-line rule, then a small tag with the time left. *Done:* the roll lands on a 2.2 s title (`INCIDENT_TITLE_MS`) with the incident's drawing stamped beside its name and its rule (the catalog's one line, not a joke; the incident quips are gone); the Dispatch ledger shrinks while an incident runs to a tag: drawing, name, seconds left and a thin bar. Screenshots `cl-hud-incident-title.png`, `cl-hud-incident-tag.png`.
- [x] **Death recap:** who killed you, with what (weapon, headshot, meteor, drowning), and an arrow to the case. *Done:* the death screen adds NABBED BY name (YOURSELF, THE CITY) and WITH cheese gun, Tommy Gun, Laser, Big Cheese, Scattershot, red-hot ricochet (Crossfire), Bad Ammunition, an explosion, a cheese meteor, drowned in the harbour or a runaway case, plus HEADSHOT; and a case-gold arrow with THE CASE or CASE LAST SEEN · distance, from what you may know (`caseLastSeen`: a loose case, or the carrier's latest ping). `playerDied` gains `blast` (validated), so an explosion is named. Screenshots `cl-hud-death-recap.png`, `cl-hud-death-recap-960.png`.
- [x] **Calmer by default:** lower default screen shake and camera kick; on first launch point to the shake slider and Reduced Motion. *Done:* new players start at Camera shake 60% (was 100%; the slider scales every camera kick and shake); saved settings keep theirs. A paper note under the title's Settings tag shows once (SHOW ME opens Screen effects) ([player settings](player-settings.md)).
- [x] **Words explained once:** "made", the Hunch, Ironclad and the bad versions get a one-line explanation the first time; afterwards only the word. *Done:* stored per browser (`localStorage` `rat-detective-explained`). The YOU'VE BEEN MADE card, the HELD card and each Code Violation dud card keep their explaining line only the first time; the first rat you make (the Hunch), your first Ironclad (traps still hold you), first Stakeout and first take of the case (hits count double, a kill heals) get a one-line slip above the supply cards. Screenshot `cl-hud-explain.png`.
- [x] **A sound mix that ranks things:** your hits, kills, case pings and case events cut through other fights; fewer voices at once. *Done:* world sounds share a ducking bus (your hit dips it to 75%, a kill or case event to 50%, a case ping to about 78%, back in about 0.6 s) and one budget of 12 world voices that drops the quietest or furthest first (the separate pools allowed about 57) ([sound](juice/sound.md)). Not listened to by an agent.
- [x] **Fewer things competing visually:** other rats' balls slightly dimmer than threats near you; caps on casings, gobs, meteor debris and similar effects. *Done:* another rat's ball draws at 55% (body, rim, trail) unless it is within 4 units of your chest or within 26 units and heading to pass within 2.6 (`THREAT` in `ChaosView.ts`); your own always full. Caps: Tommy casings 64 → 24, crumbs 4 → 3 a round (pool 96 → 48); Laser gobs 9 → 5 a beam (pool 120 → 40), splats 32 → 12 lasting 6 s (was 9), flares 24 → 12; meteor chunks 20 → 10 and dust 8 → 4 a landing, trail smoke 160 → 64; paperwork 10 → 8 (taken), 4 → 3 (shot), 14 → 8 (thrown case) lasting 3 s (was 4.5), launch debris pool 220 → 140; ball impacts crumbs 160 → 96, splats 40 → 24, drips 60 → 32.
- [x] **Default volume 50%** for new players (Cam: loud on first load); saved settings unchanged.
- [x] **Admin controls for Tyler:** a server-held admin key, pasted once into a hidden Settings field on his machine; an F10 panel in live matches (end the round with the leader winning, pick the next mode, roll or end an incident, reset the case); the same commands from `scripts/admin.mjs`; every admin action recorded as a fact; no gameplay advantage. Built: Worker secret `ADMIN_TOKEN` (not yet set on staging or production), `/api/admin/v1/*`, the `admin` socket message and city fact, `/?admin=1` Settings → ADMIN, F10 panel; how to set and use it: [live service](live-service.md#admin-controls).
- [x] **Lag research:** pings spiked to 2.8 s (Tyler) and 2.0 s (Andrew), averaging 80–151 ms; Cheddar Shower raised average ping to 163 ms (119 ms without an incident); Trey averaged 43 fps with 37 ms of CPU on slow frames; other rats are drawn about 0.3 s in the past. Measure the server tick with 4 humans and 6 bots per incident and the bytes sent per tick, profile a busy client, then fix what the numbers show. *Done* ([receipt](verification/lag-2026-10-02.md)): the server tick is 2–3 ms (median), at most 17–27 ms in every incident, so it is not the cause. The wire was heavy: 144–167 KB/s per client and 391 KB/s in Cheddar Shower (meteor bursts fill the 256-ball cap). A lossless chaos wire cuts that to 93–114 KB/s and 234 KB/s (−32% to −40%), with identical bot paths, ball positions and decoded states. It predicts ball motion, reuses ball handles, sends only changed corpses, beams, traps and meteors, and sends impacts as rows. The spikes match no deaths, round reset or slow frames, and no two players spiked together; most likely one player's connection stalled while frames were queued on it. Trey's 43 fps is his machine's rendering in every incident (decoding a frame costs 0.2–0.4 ms); no browser profile was taken. Left for Tyler: movement frames are unquantized (about 36 KB/s); fewer burst balls; a byte limit on frames in flight.

#### Tyler's staging playtest (2 October)

He played `staging-2026-10-02-9f3980b` and asked for three fixes, all agreed ("I love all three … just get it all done"):

- [x] **The case ping goes; the red outline comes back and pulses** ("the most annoying thing I've ever seen … go back to the red glowy outline … make it pulse and add a lot of juice … don't add noise … don't say it's been seen"). Ping, LAST SEEN, its sound, the carrier's pinged flash and ping-only bot knowledge are deleted. The carried case's red rim shows through walls again with a heartbeat (swell to 1.35× about once a second, an echo outline spreading to 2×), a pickup flare (about 2.2× for 0.5 s), and a faster beat within 120 units of the carrier's scoring target; a loose case beats gently; no sound or new text. All case colour red. `mindVersion` 11.
- [x] **Cheddar Shower removed** ("the most laggy thing in the world"). Stored rooms run Big Cheese.
- [x] **Crossfire made a pinball table** ("the most basic, boring incident we have"): each bounce heats the ball (faster, longer-lived, red → orange → white-hot), sparks, scorches the wall and plays a rising ricochet; a banked kill gives the killer BANK SHOT / TRICK SHOT and a short slow-down, and killer and victim see the path; a dotted aim guide shows your first bounce; bots try bank shots; death facts record `bounces`.
- [x] Checked before handing back: full checks at `e368f32` (worker 255/255, client 1,561/1,561, scripts 133/133, build); the staging reconnect check; on staging bots made 4 Crossfire bank kills in the first minutes (death facts `bounces` 6, 3, 1, 1). Screenshots (`~/.cache/rd-shots/pf-*.png`) caught four look bugs, fixed in `7a25bc7`: the path's first leg did not draw, scorches sat behind the drawn facades, heat 3 read pink (it now emits white-hot, with a red-orange rim on another rat's ball) and the guide dots were tiny.
- [x] Built and checked (`3ba9e67` … `dce864d`): full checks at `86e7ce8` (worker 256/256, client 1,562/1,562, scripts 133/133, build); two screenshot passes (`~/.cache/rd-shots/hc-*.png`) fixed a purple coat wash, an unreadable chain, shimmer "stink lines", invisible paw prints, a ping flash that drowned the rat in direct sight (now drawn only where the carrier is hidden), beaded flames, white splash discs, glowing-dot scorches and orange carrier balls; the heartbeat sound is synthesized and nobody has heard it.
- [x] **Tyler, after playing it:** "make the case pulse even more juicy … we need to always know where the case is when it pulses." The ping now lasts 1.3 s (full 0.4 s), lands big and settles, sends two red radar rings out from the carrier over everything, keeps the far sign at least 96 px, and the HOT CASE tag becomes a bold red stamp with an edge arrow toward an off-screen carrier. Still silent and wordless beyond HOT CASE.
- [x] **Dispatch never rolled on staging:** with one incident allowed (`INCIDENTS=crossfire`) the no-repeat draw was empty and threw, so the bell rang and nothing rolled. A one-incident roster now repeats (regression test in `dispatchIncidents.test.ts`).
- [x] **Tyler, after playing it:** the ping "is better, but it's way too big … keep the strength, make it one third the size" (rings now grow from 0.3 to about 0.5 of the far sign's size, a smaller snap and stamp); Crossfire "is actually too fast … don't make it feel like the laser … the player only really sees the first bank off the wall": fired as normal, the first wall doubles its speed (350 u/s, held) and it wears the whole exaggerated fire look and long trail at once.
- [x] **Crossfire no longer one-shot kills** (Tyler: "it just needs to do normal damage"); a headshot still kills, and a banked finishing hit is still a BANK SHOT.
- [x] **Released** on Tyler's word ("perfect. push it live."): Worker `5a23e371-16d2-4792-91dd-f51b51674db5`, build `production-2026-10-02-bef8f9c` ([receipt](verification/protocol-29-release-2026-10-02.md)).
- [ ] **Next action:** Tyler plays production; the still-open playtest items below.

#### The hot case heartbeat and flaming Crossfire (agreed 2 October, second staging playtest)

Tyler: Crossfire should be "flaming balls of cheese" that "really speed up when they hit a wall … almost look like the laser"; the carrier buff "is actually working really well" but "it needs to be much more clear that you are buffed while you're holding the case … double down on the rat detective thing, like you're on a hot case"; the case should not be visible all the time: "every few seconds … a really bright ping of the case, bright red, there's no mistaking it … you can't track the case 24/7 … you just kind of have an idea of where it's going"; the carried case should look different, tied to how the buffed rat looks. Agreed (and this supersedes the earlier "no case ping" call: the rejected ping was a gold flare, column, sonar and LAST SEEN text; this one is the carrier itself flashing red, silent and wordless):

- [x] **Flaming Crossfire:** about 1.6× speed per bounce (175 → 280 → 450 → 720 u/s), a speed-scaled tracer streak (white-hot with a fire-orange edge at heat 3), flames, embers and smoke off bounced balls, a fire splash and a flame "fwoomp" on each bounce.
- [x] **The heartbeat ping (4 s):** between pings others see the carrier only in direct sight; at each ping the carrier and case flash bright red through walls and fade in about 0.75 s. No sound or text for others. Bots know an unseen carrier only from pings and their own sight.
- [x] **The carried case:** handcuffed to the wrist on a short chain, and red-hot metal (seams glowing like coal, heat shimmer, smoke). The loose case stays red leather.
- [x] **The buffed rat:** red-hot coat edges, a red hat band, shimmer and embers, its glow beating on the heartbeat with a flare at each ping, glowing red footprints visible only close up.
- [x] **Feeling the buff:** a HOT CASE card (2× damage, a kill heals you full), a red screen-edge pulse at each ping, a Rat Detective heartbeat only the carrier hears (quickening near the score), heavier red-cored carrier shots with a thump and bigger hit sparks, and a kill while carrying gives a red heal flare, a heartbeat surge and CASE CLOSED · HEALED.
- [x] **No random supply for taking the case;** the buff gets that juice instead.
- [x] **Staging only:** every incident is Crossfire (`INCIDENTS=crossfire npm run deploy:staging`); production keeps the full rotation.

### Three-human playtest (2 October night; protocol 31)

Tyler and two friends on protocol 30. Liked: the laser ("fun, not broken"), the launches, the power-ups, the stronger case ("the case buffs did fix the game length … let it ride"). Tyler: "go" on this batch.

- [x] **Tommy Gun:** held fire 20 balls a second (was 10, no better than a fast clicker under the 12-a-second cap), 12 s (was 8). The server admits the Tommy at its own rate; every other gun keeps the cap.
- [x] **Ironclad Alibi:** 8 s (was 12; "lasts too long").
- [x] **Big Cheese removed** ("I hate the big cheese"; one shot a second for everyone slowed play). Stored rooms run Crossfire.
- [x] **Exhibits:** everyone sees the same Exhibits A–C (the round's best, chosen the same on every client); your own best moment, when it is not among them, is an extra card. "Sent flying" no longer fills the reel.
- [x] **Exhibits from the player's view** (Tyler: "no one likes these unnatural camera angles"): each replay is seen through the game's own shoulder camera on the rat doing the thing, one view for the whole clip.
- [x] **Random supplies** (Tyler, 3 October, protocol 32: "The Tommy gun feels way better … whatever pickup that spawns is always random", the heal excepted): every site but a Quick Fix one holds a random pickup of the other six (`RANDOM_SITE_KINDS`), rolled at the start, at each round and at each claim, so the restock dial shows what comes next. Quick Fix sites stay Quick Fix.
- [ ] **Watch:** the carrier's double damage may be too much (Tyler); keep it a week of data, then 1.5× if needed. A Mousetrap incident (traps everywhere) is an idea, not agreed.

### Still open from the playtest

- [ ] **Bad Ammunition:** Tyler: still not working. Trey and Cam: "make it shoot like garbage", in every direction. Kept for now.
- [x] **Cheddar Shower:** removed (see Tyler's staging playtest above).
- [ ] **A case that resets after a carrier dies on top of the dock containers** looked like a bug ("The case just despawned right in front of me"); make the reset readable.
- [ ] **Ironclad does not stop traps** confused Cam; the hold trap and the one-time explanations should settle it.

### Decided against (Tyler, 2 October)

- Shooting feel changes ("not a common opinion"); the mega laser and a new laser look ("the laser landed in a good spot"); keeping the case after a delivery; new launch pads; new music.
- The gold case ping with a light column, sonar and LAST SEEN tracking (tried on staging; "barely useful", "so busy and annoying"), and any sound or text for others when the case pings.
- Parked for now, to focus on clarity: a cheese web, criminal NPC rats, teams, a 20-kill streak reward, a MOBA.

## Protocol 27: the arsenal and the incident rework (Tyler, 2026-10-01)

Tyler: Big Cheese and Blackout are the best incidents because "they radically change the game … they make you think differently", and they make people laugh; Pressure Surge is next because it changes the map and pushes the game forward. "Those are the kind of things we're trying to double down on." Pickups must be juicy, and must never make anyone want to shoot less: "that's what drives the game forward … it's super fun to just shoot all the time". One big patch, then he playtests.

- [x] **Targets:** Excessive Force 10 case kills, PAPER CHASE 10 deliveries, Jurisdiction 100 points (20 a zone). Tyler: "sometimes the numbers have to feel good."
- [x] **Excessive Force carrier:** hits deal double damage (`carrierDamage`), and every case kill heals it to full (heal cause `case-kill`, the Quick Fix flash).
- [x] **Pickups** (one weapon at a time; claiming another replaces it; weapons replace the incident's shot pattern):
  - **Tommy Gun:** hold to fire, about 10 balls a second, a wide cone that blooms while held, on a timer (never a drum). Screen shake, a big rattle, casings.
  - **Laser:** hitscan, about one shot a second, 3 damage, headshots kill, ricochets off walls (two bounces), on a timer. The server rewinds rats to what the shooter saw (the existing 250 ms history).
  - **Mousetrap:** the gun goes away and the rat carries a big trap; the next click sets it down. Anyone else who walks over it dies (Ironclad does not help); it takes many hits to destroy, so a doorway can be cleared; one trap per rat.
  - New sites for the three (two each, layout 6, 33 sites), the reward draw includes them (Stakeout falls from one in three to about one in six), bots use all three and avoid and shoot traps. Models: a Tommy in a violin case, a pulp ray gun, a brass-and-wood trap (`src/utils/WeaponModel.ts`); the Tommy sound is a CC0 Thompson recording.
  - The Excessive Force carrier's balls look heavier (1.35×).
- [x] **Incidents** (what each now does: [the assignments](dispatch-assignments.md#incidents-changed-in-protocol-27-tyler-1-october)):
  - [x] Rat Race, Delayed Reaction and Clean Bill removed (stored rooms map them to All Units, Crossfire and Most Wanted).
  - [x] All Units told clearly: an ALL UNITS radio banner and squawk, backup rats strobing red and blue with a yelp, and a YOU'RE BACKUP card with an arrow to the action.
  - [x] Most Wanted: the searchlight follows whoever is winning (checked every second, at once when the wanted rat dies), and the rat who kills them gets a random supply (WANTED poster, nameplate stamp, BOUNTY CLAIMED; city facts `bounty` and `reward` `why: 'bounty'`).
  - [x] Scattershot: hits shove rats hard (shared `ChaosSimulation.shove`, city fact `shove`), no more balls.
  - [x] New: **Bobbleheads** (huge heads and head hitboxes).
  - [x] Bad Ammunition: funny paths that still land where you aim. One ball per trigger with a personality named by its shot ID (corkscrew, snake, floater, hiccup, superball), each with its own sound and words; jams, duds, crooked volleys and backfire soot are gone.
  - [x] Malpractice becomes **Code Violation**: every supply hops away, launch machines fill themselves to bursting and shove, alarm pillars clang and shove; sparks, rattles and zaps (city fact `malfunction`). After Tyler's playtest ("no one should die from code violation … but let's give negative effects"): nothing in it kills (the exploding supplies and death cause `malfunction` are gone; every Code Violation throw turns to a line whose landing is dry and inside the city, or does not happen). Every supply but Quick Fix comes out as a short harmless **dud**, told by its own condemned card, a CODE VIOLATION feed line and a stamp on the rat's nameplate: Cold Feet (Hot Pursuit: slowed), Rust Bucket (Ironclad: no jumping), Staked Out (Stakeout: everyone sees you through walls), Backfire (Tommy Gun: blows up in your paws, a safe throw backwards), Short Circuit (Laser: the gun will not fire), Snapped Paw (Mousetrap: stuck in place). Quick Fix still heals but is harder to catch (scares from 10 u, hops 7 u every 0.48 s, leash 16 u). City facts: `malfunction` `what: 'faulty'` with `kind`, `pickup` `faulty: true`.
  - [x] New: **Cheddar Shower** (giant cheese meteors with shadow warnings; Tyler renamed it from Act of God after playing: "nothing about God … something about space or cheese … or rain"; stored rooms holding `act-of-god` run it). Roofs shelter; a direct hit flattens (death cause `meteor`, nobody credited), the blast throws, the burst shares the ball cap. Bots step out of shadows they can see (city fact `meteor`).
- [x] Protocol 27, `mindVersion` 8, era `arsenal`, docs. Independent review: five findings fixed (Tommy balls stayed plain in Big Cheese, no trap set on a rat, no orphan trap restore, the predicted laser traced as thick as the server's, no per-tick meteor reallocation). Full checks at `da7bad3`: worker 248/248, client 1,563/1,563, scripts 133/133, build.
- [x] **Playtest feedback (Tyler, 1 October: "fantastic changes"):** the Laser is a greasy, cheesy yellow-green molten cheese beam (drips, cheese splats, a cheesy ray gun, card and zap); the Tommy is cheesier (cheese-cube casings, a cheese-yellow flash, puff and crumbs, a cheese-wheel drum; its rounds blend the Thompson with the ordinary cheese gun) and shakes about half as much (`FEEL.tommyGun`), still more than Scattershot, whose shooter kick and FOV thump are trimmed about 80% (`FEEL.shotKick` `scattershot` .65, `scatterWiden` .6). The Mousetrap is bigger, taller and brighter (`trapRadius` 1.5, `trapReach` 2.9, `TRAP_SCALE`/`TRAP_TALL` shared by the drawing and the shootable block), and taking one up locks the trigger for `WEAPON_TUNING.trapLockMs` (1 s, `PlayerBuffs.weaponReadyAt`, refused by the room as `trap-arming` for every rat; bots wait it out like anyone) while the gun drops away and the trap heaves up big (RatAnimator), with a TRAP IN PAW stamp, a fuse and SET IT DOWN! beside your rat and a `trap-ready` ka-CHUNK; only a fresh press after it sets the trap down.
- [x] Tyler playtested staging ("fantastic changes"); his notes went in (cheesy laser and Tommy, shake trims, bigger trap, a 1 s Mousetrap pickup lockout, Code Violation never kills and gives bad versions, Cheddar Shower). **Released** to production 1 October: Worker `32902d92-a7c1-40f0-930a-d904573ced86`, build `production-2026-10-01-ed43d51` ([receipt](verification/protocol-27-release-2026-10-01.md)).

## The case (Tyler, 2026-10-01)

Tyler: the case "is pretty out of date now … we need to make it juicy. Update the model, bring it up to par with our rats now. Add some animations … update the sound effects to it across the board … it needs to feel good when you pick up the case … something on your screen that's like, oh wow, you got the case". The old "YOU'RE ON THE CASE" callout was "kinda lame".

- [x] **Model** (`src/prototype/CaseModel.ts`): soft rounded leather, a brass rim, corner caps and studs, two sprung latches and a keyed lock plate, buckled straps, stitching, a curved handle on brass loops, papers bursting from the seam and a red EVIDENCE tag on a string. Same collision size; fixed parts merge per material; the tag is the one moving part.
- [x] **K1 `caseClaim`**: your take of the case slams an ON THE CASE rubber stamp (carbon paper, stamp red) over a burst of paper sheets, with a brass edge flash, a punch-in, a kick and a squash of your rat. Everyone sees the case burst paperwork where it is taken, knocked loose or shot (the L7 paper pool).
- [x] **K2 `caseMotion`**: carried, it swings on its handle against the paw's acceleration (on top of the grip slip); taken, it squashes and springs back; loose and still, it hops now and then; its tag flaps on every jolt.
- [x] **Sounds**, synthesized in `scripts/generate-pickup-sounds.py`: `case-claim`, `case-dropped`, `case-snatched`, `case-loose`, `case-thwack`, `case-knock` (the grip's rising knock). The old case-lost and case-hit samples are gone.
- With it (gameplay): taking the case brings a random supply (once per 20 s per rat); a shot case flies 20% slower. See [the assignments](dispatch-assignments.md).

## Air acting (Tyler, 2026-10-01)

Tyler, watching rats jump, bounce back and forth and fly: they look "stiff and lifeless", like a salt shaker, with "no character" and "no juice". The living body was a rigid cylinder in the air. The rule that kept the weapon-bearing body still covered only the animation pass. A firing rat's arm aims at its target whatever the body does, and walking already sways the body.

- [x] **A1 `airActing`, live in production since 1 October** ([receipt](verification/air-acting-release-2026-10-01.md)). Every rat, local or remote, from its rendered motion (a take-off over 9 u/s or a fall over 7 u/s, until it lands):
  - The walking stride stops in mid-air.
  - **Rising:** the coat stretches tall, arches back a little, and the feet and tail trail.
  - **Apex:** a tuck. The body squashes, the belly curls over the hips with the chest nearly level, and the feet pull up.
  - **Falling:** the body opens up and reaches for the ground. The ears, whiskers and tail stream up, and the hat lifts off the head.
  - **Travel:** a small forward lean into travel. Sideways the coat stays upright and lags only a touch, while the tail swings out behind, the hat tips back and the ears blow over. A spring makes them swing over when the rat reverses mid-air.
  - **Tyler's first look (1 October):** the first build banked the whole body into a strafe jump, and Tyler said it "looks ridiculous, it's like torpedoing to the side". **Do not tilt the body sideways into travel.** The `?feel=dev` panel "doesn't work" for him: it is a 65-item list of raw numbers. Its A1 switch and values do save and apply when tested, but tune from his descriptions instead of sending him to it.
  - **Landing:** a squash that wobbles back.
  - Everything is presentation only and switchable, with its numbers in `FEEL.airActing`.
  - **Evidence:** throwaway contact sheets of one jump arc, side and rear (forward, sideways, and reversing mid-air), with and without the switch, inspected before each deploy. Tyler played the upright-sideways build on staging: "looks pretty great now".

## Kill streak mark (Tyler, 2026-09-30)

Tyler, after playing production with a friend: "i want a visual indicator for rats that are on a 3+ kill streak."

- [x] **Built (not yet deployed).** A kill streak is the kills a rat has made since its last death. Deaths of any kind end it (shot, drowned, own explosion), and so does a new round. Case-holder kills count once, and a kill by a dead rat's ball still in flight starts no streak. Bots and humans are counted the same way, on the server.
  - **Nameplate stamp.** From 3 kills, a small red rubber stamp sits under the pips: **ARMED** (3–4), **DANGEROUS** (5–7) and **PUBLIC ENEMY** (8 or more), with a tally mark per kill (four strokes and a slash per five). It comes down again, big and faint, on each new kill. The nameplate keeps its colour when the city goes black and white at 1 HP, so the red still reads.
  - **Smouldering fedora.** The hat gives off a thin wisp of smoke at 3, thicker at 5 with the odd ember from the hat band, and a heavy column at 8. The smoke is unlit and plain grey: no glow, no outline. It reads over the rat's head from behind and at mid-range, where the stamp is too small to read.
  - **Your own streak.** Your own nameplate carries the same stamp. Your own smoke is fainter, so it never clouds the crosshair.
  - **Not "WANTED".** The first idea was a WANTED stamp, but Most Wanted already means the leader in the searchlight, so the stamp uses police bulletin words instead. The comic words (DOUBLE CHEESE and so on) are a separate, private screen callout for quick kills and are unchanged.
  - **How it works:** `PlayerData.streak` (absent at zero) is sent with every rat in the welcome and join messages, and `playerDied.killerStreak` gives the killer's new count. Both are optional, so protocol 23 clients and servers still work together (no protocol bump). The stamp is drawn on the existing nameplate canvas (`src/ui/RatBillboard.ts`); the smoke is one pooled instanced draw per rat, hidden while idle (`src/entities/RatStreakSmoke.ts`). Situations in the city map already record the streak, so no new facts were needed.

## Third batch (decided 2026-09-27)

Tyler's brain dump, sorted into now and later, with his answers.

**Now, in build order:**
- [x] **T2 Noir scales with health.**
  - At max HP the detective sees clearly and the noir stays in the background. Each lost hit point makes the perception effects heavier (shadows, colour drain, fog, grain and vignette), to the point where they get in the way and push you toward a Quick Fix. City dressing (rain, neon, haze, searchlights) stays constant.
  - **At 1 HP:** the case's outline, locator and destination guidance disappear (the case itself stays visible), and Quick Fix kits get a **green outline through walls**, the only thing you can see through walls.
- [x] **T3 Enemies read clearly in the noir.** Tyler rejected self-lighting, because the noir look depends on light coming only from the real fixtures. He didn't pick from the other options (eyeshine, selective colour, comic ink outline, fixtures following enemies, breath puffs). So they're built as a **comparison lab**: each one switchable in the juice review panel, for him to judge in play before one is chosen. The Hot Pursuit outline stays.
  - Built: review switches T3a–T3e, all off by default. Eyeshine is a view-facing glint on the eyes; selective colour boosts enemy saturation; the ink outline restyles the existing glow shell as a cream line; the four real fixture spotlights may pick nearby enemies; breath puffs are lit (only visible under real light).
- [x] **T1 Instant, smooth entry.** Loading the page, editing your name and entering the game should feel instant and clean. First measure where the time and hitches go (long tasks, shader compiles, city build, first play frame). Then fix the causes: warm shaders and models during the title, spread the heavy work, and make Enter a pure hand-off. Target: no visible hitch while typing, and under 300 ms from Enter to control.
  - Measured (Halla, AMD laptop GPU, private fixture through the relay): Enter to first play frame went from 2.1–2.4 s to 0.7–1.2 s. The worst stall after Enter went from about 1.4 s to about 0.35 s.
  - Causes found: the juice layer's shader patches were added after the title warm-up, so the whole city recompiled on Enter (~1.9 s); the street light bake was one 1.5 s task; the enemy, supply and case programs and the silver reflection map were first built on Enter.
  - Fixes: the session (with its shader patches) now exists before the warm-up; stand-in rats (local and enemy), supplies and a case are warmed and then removed; program links are waited on one at a time between turns; the street light bake is spread across frames; after the welcome, new programs link off-thread while frames skip drawing instead of stalling.
  - Rerolling the name stays responsive: heavy preparation pauses for 350 ms after any title input, unless Enter has been pressed.
  - Not met on Halla: 300 ms. About 250–300 ms of what remains is the network round trip through the relay, then about 250 ms of building the other rats on the welcome. Unmeasured on Tyler's desktop.
  - **Load-time pass (2026-09-28, Tyler: "how are the load times? optimize the title screen and entering the city as best as possible").** Measured in headless Chrome on Veelox (it uses the Intel Arc integrated GPU, not the RTX 3050), private fixture through a local relay, cache off, three runs each. A second visit keeps Chrome's shader cache.
    - Title paint: 0.49–0.58 s → 0.38–0.44 s (second visit 0.19–0.39 → 0.16–0.24 s).
    - City ready behind the title: first visit 7.2–7.4 s → 6.4–7.4 s (the GPU linking shaders is the floor); second visit 3.3–3.6 s → 2.3–2.7 s.
    - Enter to first play frame: 1.4–1.9 s → 0.9–1.5 s first visit; second visit 0.6–1.3 s → 0.7–0.8 s.
    - Worst freeze on the title while the city prepares: about 2 s → under 0.45 s (total blocked time 4.9–5.3 s → about 1 s).
    - Causes: a synchronous query of any program waits for every link queued before it on the GPU, even when the driver reports the link complete, so the warm-up froze the page for 1–2 s at a time; the cameo warm-up drew into an offscreen target, compiling unused untone-mapped programs (0.7 s); the launchers, Dispatch pillars and flying cheese were first compiled after Enter; the street-spill bake allocated per box and scanned every building for every lamp pixel; a render-blocking Google Fonts stylesheet and a 93 KB TTF; the title's blend, mask and blur layers cost about 0.2 s of first paint.
    - Fixes: rats, supplies and case are issued before the city builds (lit by stand-in actor spots and sewer lamps with the city's counts); every variant is queued and the page waits on a non-blocking GPU fence before any program is queried, at warm-up and after the welcome; launchers, pillars and cheese join the stand-ins; the cameo warm-up draws to the hidden canvas; the bake allocates nothing per test and each lamp checks only nearby buildings (identical output, checked on 250,000 random cases); Outfit and Bangers are self-hosted WOFF2 and the CSP drops Google Fonts; the title's effects appear right after its first paint; the siren strobe and moth visits animate opacity only; the Worker serves fingerprinted `/assets/*` as immutable (never the HTML fallback).
    - Still open: first-visit readiness is bound by GPU shader linking (about 145 programs, half of them the sewer-lit variants); fewer distinct city shader patches would be the next lever. The cameo models (870 KB, served uncompressed) still load beside the city build.
- [x] **T4 Five hit points; headshots always kill.**
  - HP 3 → 5, body hits 1 damage (5 to kill), a headshot kills at any HP.
  - Gameplay and protocol change: protocol 19, with matching client and Worker.
  - Headshot juice: a distinct sound, the hat blasting off, a head splat, a crosshair marker, a "headshot" callout and kill-feed mark, and a longer impact freeze.
  - Built: `MAX_HP` 5 and protocol 19; the server damage clamp follows `MAX_HP` (it was a hard-coded 3). `playerDied` carries an optional `headshot`, so every client shows the hat blast (2.6× speed, 1.5× lift), four cheese splats on the head, an oversized cheese burst, and a 0.16 s hold before the fall. The killer gets a brass ringed X on the crosshair, a "HEADSHOT · name" notice, and a "HEADSHOT" callout that ignores the callout cooldown; the kill feed adds "· HEADSHOT". The sound is a wooden knock, a falling whistle and a short bell. Review switch: "T4 Headshot juice".
  - My call on the other damage sources, to keep what used to be instant kills instant: a Crossfire bank shot and a fast case missile (28+ speed) now deal `MAX_HP`; the counterfeit trap was already `MAX_HP`. A fast loose-case hit stays 2 and slower contacts stay 1, so they now take a smaller share of health.
  - Bots skip Quick Fix only at full health (5), and still treat 1 HP as an emergency.
- [x] **T5 A longer, richer round end.**
  - 10 s between rounds (was 6 s).
  - More Case File stats: accuracy, headshots, longest kill, case time, flights, pickups, distance.
  - A **noir police lineup**: the top 5 rats in a dedicated precinct lineup room with a height-chart wall and camera flashbulbs, each stamped with their award and the winner last. The camera leaves the city for about 8 s, then returns for the next round.
  - Built: `WIN_DISPLAY_MS` 10 s. Seven new awards, one winner each with a floor: Sharpshooter (accuracy, at least 8 trigger pulls; a trigger counts one hit at most), Headhunter, Long Shot (kill distance), Case Keeper (seconds carrying the case), Frequent Flier (launcher rides), Supply Run (pickups) and Legwork (distance on foot; a jump over 12 units in one tick is a teleport and doesn't count).
  - `gameWon` carries an optional `lineup` (up to five ids, winner first). The server ranks by the assignment's own progress (deliveries, zone time, case kills, or case time for Closing Time), then kills, case time and fewest deaths.
  - The lineup starts as the slow-motion finish ends (1.4 s) and runs until the reset, about 8.6 s. The room sits 320 units below the city and is lit by the stage's existing spotlight, moved there, so no light is added. Rats stand in rank order with the winner last; a flashbulb (screen flash, spotlight surge and pop) photographs each in turn and stamps their award across the chest; the winner gets a gold "CASE CLOSED" stamp and a hop. The Case File card shrinks to the top-left corner and the play HUD hides. Review switch: "T5 Police lineup".

## Fourth batch: the Hunch, pickups and incidents (agreed 2026-09-27; released 2026-09-28)

**Guiding rules (Tyler):**
- Maximize fun through chaos, not balance: think Mario Kart, not Forza.
- **The game must always move forward.** Nothing may make chasing the case or the assignment goal pointless or stall it. This is why Hot Potato and Line Shuffle were rejected. A teleport is welcome only if it speeds progress.
- **No time limits on game modes, ever (Tyler, 2026-10-01: "a hard rule").** No round clock, deadline, overtime or sudden death. Timers only for short boosts and power-ups, or when a player directly controls them (as Closing Time's holder did). Round length is shaped through gameplay, "not taking shortcuts".

**Agreed:**
- **The Hunch (full-HP bonus):** at max HP you see enemies through walls as a charcoal sketch, with generous range. You lose it on the first hit. The noir word is **"made"**.
  - **Spotter:** shutter click, evidence-photo corners, `MADE: <name>`.
  - **Spotted rat:** violin sting, an eye on the screen edge toward the watcher, **YOU'VE BEEN MADE**.
- **Pickups:** the same three; no new kinds for now, because Tyler has rejected many ideas. Quick Fix stays a full heal.
  - **Noir presentation:** each site sits in a pool of real fixture light and gets a proper claim moment. **Ironclad Alibi must clearly read as iron**; papers or a typewriter don't.
  - **Placement:** every site needs a reason.
    - Ironclad: one hard site per landmark, never stacked. Today there are 10, and Records and Needleworks have a floor and a roof site 2–4 units apart.
    - Hot Pursuit: where chases start.
    - Quick Fix: back alleys just off the fights.
- **Incidents:**
  - **Add:** Blackout; Clean Bill (everyone full HP plus a supercharged Hunch); Malpractice (Quick Fix kits misbehave); Most Wanted (the leader gets a searchlight and a bounty); Rat Race (everyone gets Hot Pursuit, faster cheese).
  - **Remove:** Ricochet Racket and Popcorn Panic.
  - **Keep and improve Bad Ammunition.** It is the calm assignment-focus incident: shots are unreliable, but the game still moves forward.
  - **Rejected:** Hot Potato, Line Shuffle, Mistaken Identity, Tommy Gun, Sewer Flood, Floaters and Frame Job.

**Final calls (2026-09-27):**
- **Ironclad prop:** an iron-plated, riveted trench coat on a tailor's dummy.
- **All Units is in:** during it, dead rats respawn near the objective (the case or its carrier, or the active zone).
- **Bad Ammunition:** add duds that dribble out, sputtering smoke, a coughing gunshot and wobbling balls, plus extra juice. It keeps its calm, focus-on-the-objective role.
- **Build order:** Hunch, then pickups, then incidents. Everything ships together as protocol 20 to a private preview; production only on Tyler's OK.

**Built (2026-09-28, commits `0061f77`..`01ea96b` on `main`, protocol 20, not in production):**
- [x] **The Hunch.** At 5 HP, rats within 40 units show through walls as a boiling pencil sketch (hatching plus a contour; only the hidden parts) with a faint pencil tail. You lose it on the first hit. Spotter: shutter click, photo corners that snap onto the rat, typed `MADE: NAME`. Spotted: YOU'VE BEEN MADE card with a MADE stamp, violin sting, and a hat-brim eye on the screen edge toward the nearest watcher while anyone has a read on you. Tuning: `hunch` (always on) and `made` (switchable) in `feelTuning.ts`.
- [x] **Pickup placement.** 14 sites. Ironclad (5): Records archive second floor, Icebox rear catwalk, Pumping Station roof (launcher), Gate bridge roof, sewer maintenance. Hot Pursuit (4): the Gate and Icebox tunnel mouths, the north end of Seventy Avenue, the west end of the south avenue. Quick Fix (5): alleys west and east of the central crossroads, the south-central blocks, beside the Icebox forecourt, and the Records–Gate service lane. Bot roof launches keep their own landing table.
- [x] **Noir supplies.** An iron-plated riveted trench coat on a tailor's dummy, a doctor's bag with a green-cross roundel, red wingtips; each on a plinth under a work lamp with a cone and a pool of warm light. The prop is lit from its lamp, not self-lit. The lamp stutters out on a claim and stays dark while restocking. Claim cards type their kicker and get a rubber stamp (ALIBI ON FILE, IN PURSUIT, CLEARED FOR DUTY).
- [x] **Bad Ammunition.** Per trigger, 12% jam (no ball, CLICK., dry click), 20% dud (one harmless slow ball that bounces off rats, PFFT., wah-wah), otherwise the existing 1–3 crooked balls (70/20/10, .12–.24 rad) with a coughing shot and muzzle smoke; 18% of those backfire (soot on the lens). Crooked balls wobble in flight (presentation only).
- [x] **Retired:** Ricochet Racket and Popcorn Panic map to Scattershot for stored rooms; their code and wire fields are gone.
- [x] **Blackout.** Pitch black: city surfaces, lamps, windows, neon, haze, searchlights, fog, sky and the stage's own lights go out (lights by intensity and NoirCity glow; exposure stays, so beam-lit surfaces read bright), with no lightning. Every rat carries a real flashlight: in a Blackout it narrows to a hard, intense beam (Tyler, 30 September: "a super bright spotlight, but it doesn't spread"; `FEEL.blackout` beam 320, half-angle .42 rad, penumbra .12, decay .6) and stretches from its everyday 40 units to 60 (`FLASHLIGHT_REACH`), aimed at your crosshair; the four street light pool spots become the four nearest other rats' beams along their facing, lighting city and rats, without shadows. Keep the everyday flashlight at 40: its shadow redraws every frame, and a 60-unit reach covers about 3.4 times the shadow volume. Rats lose their fill glow and far outline; your own rat keeps a thin pale outline; only rats in your beam show their nameplates. Muzzle flashes within 40 units still lift the dark for a blink. The HUD turns black and white. Bots see rats only within flashlight reach. Supply lamps, the case, guidance and the Hunch stay visible. Tyler (1 October): "The blackouts are amazing."
- [x] **Clean Bill.** Everyone alive heals to full as it starts (no Quick Fix card), and every rat has a city-wide, stronger Hunch whatever its health.
- [x] **Malpractice.** Quick Fix kits fidget, hop 5 units away from any rat within 7 (at most every 0.65 s, within 12 units of home, on supported floor) and walk home after. 35% of claims explode into neutral cheese instead of healing.
- [x] **Most Wanted.** The assignment leader (then kills) is wanted: a police searchlight follows them and everyone sees their sketch through walls. The killer gets a full heal and Hot Pursuit (BOUNTY COLLECTED); the next leader becomes wanted. Bots hunt the wanted rat.
- [x] **Rat Race.** Every living rat has Hot Pursuit until the incident ends, and shots fly 1.35× faster (shared pattern, so prediction matches).
- [x] **All Units.** Respawns land among the 12 supported spawns nearest the real case (or its carrier, or the active Jurisdiction zone), at least 10 units away, on the one farthest from living rats.
- **Review fixes:** the independent review caught that clients rejected the new heal causes and the Rat Race/dud launch speeds (which would have disconnected players); fixed with a wire regression test.
- **Tyler's first playtest (2026-09-28):** "amazing, I love this." Touch-ups, done the same day:
  - **The Hunch as a power-up, on your own nameplate** (a first bottom-left vitals plate was wrong: Tyler meant the health bar over your rat). At full health a small plain eye opens beside your pips (no brim, no glow; Tyler found the first version too glowy) and the pips take a subtle gold glow, with an "aha" sting; the first hit shuts the eye, fades it away and plays a snap and a sour slide.
  - **Supplies were hard to find** ("a huge clarity issue"). Props now ignore the fog; each site throws a brighter, breathing lamp cone and pool; from 10 to 40 units a soft beam in the supply's colour rises from it (silver, red, green); and the prop gets an outline in that colour, like the far-rat edge. Hot Pursuit looked like the old shoes, so it is now winged red wingtips on a shoeshine box.
  - **Supply juice** (Tyler: "add juice to the pickups as well"): props turn slowly on the plinth; a claim pops the prop up and away in a coloured flash and dust with a whoosh-and-click, the lamp stutters out; a restock clicks the lamp on with a warm thump and drops the prop back with a bounce. Everyone nearby hears claims and restocks. Your own claims also get the claim juice below; other rats' claims keep only these world effects.
  - **Claim juice (1 October; Tyler approved the claim moment, the stamp fix and a strong Ironclad).** Your own claim of a supply (from a prop, a kill-streak title or a Dispatch call, whatever brings up its card), each part switchable in `FEEL` and under `?feel=off`:
    - **Every supply (C1 `claimMoment`):** a brief screen-edge flash in the supply's colour (silver, red, green, brass; scaled by Flash strength), a 3° punch-in (the kill punch-in; Hot Pursuit widens instead) and a small kick (both scaled by Camera shake), the card's artwork flying from the claimed prop (or your rat) into the card like the U4 points (one pooled chip per supply, 0.56 s), and a squash-and-pop of your rat through the jump squash and stretch. The flight and the squash skip under Reduced interface motion.
    - **Stakeout (C2 `claimStakeout`):** a thin ink ring spreads across the screen from your rat under a brief magnifying-glass lens (0.4 s); the rats the Stakeout newly reads then light up in the Hunch sketch one at a time, nearest first, 75 ms apart, each with its evidence photo and a camera-shutter click (at most six clicks; any more light up together after the last). The ripple and lens skip under Reduced interface motion; the staggered reveal stays.
    - **Ironclad (C3 `claimIronclad`):** a weighty dip of the view, one shine running across the silver coat once it has gone on (a brief emissive and roughness pulse on the existing metal), and two bursts of the Ironclad sparks.
    - **Hot Pursuit (C4 `claimHustle`):** the view widens 7° with the Hot Pursuit speed lines for 0.5 s, and red dust bursts at your feet (the dust system, tinted).
    - **Quick Fix (C5 `claimQuickFix`):** the green flash and upward wave stay; the pips your Quick Fix restored refill one at a time, 70 ms apart, with a small tick each (all at once under Reduced interface motion).
    - **Stamp fix:** the red claim stamp no longer slams across the middle of the card over its title (worst on Stakeout's UNDER SURVEILLANCE). It is small, tilted and half hanging off the card's bottom edge under the artwork, clear of the title, gauge and clock on desktop, narrow and touch layouts; the slam is unchanged. The card's paper and torn edge moved to its `::before` so the stamp can hang off it.
  - **Round end, 15 s and readable.** It felt like five seconds and the stats were tiny in a corner. Now: the full CASE CLOSED card for 2.6 s, then the police lineup with a readable winner banner across the top, then a results board: the full standings (the Tab scoreboard) beside a large Case File with each award, winner and value. Photos run one per second.
- **Released to production (2026-09-28)** on Tyler's OK ("looks good, push it live"): Worker `be7ac8ba-2529-42ba-865a-27aafe11131e`, protocol 20. See [the receipt](verification/juice-batch4-release-2026-09-28.md).

## Fifth batch: launchers, ragdolls and the living model (agreed 2026-09-28)

Tyler: "I love all of this… do all of it." Straight-up launches every time are boring, so the launch itself changes too. Ragdolls are client-only limbs on the server's corpse box (they were "stiff, lifeless blocks"). The current model evolves; no new rig. Branch `juice/launch-ragdoll`, one commit per item, then a private preview. Protocol bump for the launcher changes.

- [x] **L1 Launch profiles.** Each machine throws its own way (the fan straight and tall, the rat trap and freight ram far and flat, the geyser and dumpster wild); a random drift, biased toward the city, carries the rat unless steered against. About one in seven launches is an **overpressure** misfire: higher, with smoke and sparks. Bots drift too.
- [x] **L2 The tell.** A 0.2 s shudder, cap flash and rising whine between the trigger and the launch.
- [x] **L3 Everything on the pad flies:** balls, bodies and counterfeit cases as well as rats and the loose case.
- [x] **L4 Landing shockwave and chains.** A launched rat's landing shoves nearby rats, balls, cases and bodies; landing on someone does 1 damage (the lander's credit); landing on another pad fires it.
- [x] **L5 The launch moment:** each machine's own firing (trap snap, lid slam and trash, steam column, freight clank, fan roar), pad squash and spring, ground ring and dust, a hard camera kick, and hats blown off nearby rats.
- [x] **L6 Flight:** flailing pose, scream, speed lines, a contrail everyone sees, building wind and coat snap; a short hang at the apex with the city below.
- [x] **L7 Landing:** dust crater, cracked pavement, squash, shake by fall and a THUD. The launched case whistles like a falling bomb and spills paperwork.
- [x] **R1 Floppy ragdoll limbs** on every corpse: head, arms, legs and tail on springs driven by the body's motion, resting on the ground.
- [x] **R2 Deaths by cause:** headshot snaps the head back, explosions spin the body spread-eagle, a launcher death flails all the way down.
- [x] **R3 Bodies at rest:** crumple and splay, X eyes and a hanging tongue, the hat lands and rolls away; shots jolt limbs with a squeak; bodies pile on each other.
- [x] **M1 Face:** floppy ears and whiskers, blinking, wide eyes and an open-mouth scream on launches and near misses.
- [x] **M2 Body:** springy tail chain, hat wobble per step, flinch away from hits.
- [x] **M3 Personality extras:** a cigarette, badge or scarf picked from each rat's identity, in the existing materials.
- [x] **B5 Review package:** checks, one independent review, private preview.
- **Status (2026-09-28):** built on `juice/launch-ragdoll` and on the private preview (fixture `a6694db9-8cf9-4006-8bc8-141dbe794e24`, client `index-DaBhjsfX.js`, protocol 21) for Tyler's playtest. One independent review found 8 issues (misfire time key, bot roof routes vs drift, movement envelope widened for everyone, restore inside a tell, counterfeit restored mid-air, rolling hat never resting, ear flap overwritten, instanced buffers not freed); all fixed in `2072d92`. What to look for: [review guide](juice/review.md#fifth-batch-launchers-ragdolls-and-the-living-model-protocol-21).

## Sixth batch: launcher machines, pressure triggers and Pressure Surge (agreed 2026-09-28)

Tyler playtested the fifth batch ("this is looking amazing") and asked for better launcher models, launch animations, a new trigger and a more chaotic Pressure Surge. Tyler said go on 2026-09-28. Branch `juice/launch-machines` (from `juice/launch-ragdoll`), one commit per item.

- **Models:** all six machines rebuilt in code first (richer procedural geometry); Tyler judges, then decide whether to go further.
- **Triggers:** the remote red caps go. Each machine has its own big, bright red trigger on the machine itself, with a bright red outline (fine for triggers, unlike rats): Pressure Works valve wheel, Trash Compactor CRUSH plunger, Freight Ram emergency-stop button, Sewer Geyser hydrant valve cap, Rat Trap red-waxed cheese bait, Wind Tunnel motor housing with knife switch.
- **Pressure (Tyler's measure):** full = 10 seconds of one rat standing on the pad. Each trigger hit adds 1 second's worth. Pressure never leaks; it only resets to zero when the machine fires. So a machine left half-full is a loaded trap.
- **Build-up juice:** four readable stages (building, straining, danger, blow): needle, pulsing trigger, swelling and rattling machine, steam from more seams, groans, red glow, siren, knees wobbling on the pad, plus each machine's own strain (bulging boiler, leaking lid, ram drawing back, hopping manhole cover, creaking trap bar, spinning blades). Steam plume height and loudness show pressure from across the city. No HUD changes.
- **Pressure Surge:** the whole city becomes launchers (manholes, hydrants, grates and vents erupt after a steam warning), suction pulls rats and objects toward pads between pulses, the surge look (street steam, lights flickering with pulses, rising rumble and shake), and a finale blowout where everything fires at once. No pressure HUD; the rolling wave is dropped.
- **Settled:** riders stack (two rats fill it in 5 s); every cheese ball that hits a trigger counts; when full, a machine hangs 0.5 s "about to blow" and any hit then makes an overpressure (the random one-in-seven roll goes); after firing, a 1 s cooldown before it can fill again; every full machine throws with its usual personality; during Pressure Surge machines fill themselves (5 s from empty, speeding up), street launchers erupt after a 1 s steam warning, and the finale sets everything off as overpressure.

- [x] **P1 Pressure triggers:** the pressure model on the server, the trigger moved onto each machine, bots stand and shoot.
- [x] **P2 Machines:** six rebuilt models with their red triggers and outlines, the four build-up stages and each machine's launch animation and sound.
- [x] **P3 Surge chaos:** street launchers across the city, suction toward pads, machines filling themselves, the finale blowout.
- [x] **P4 Surge look:** street steam, lights flickering with the pulses, rising rumble and shake; street-launcher warning and eruption.
- [x] **P5 Review package:** checks, one independent review, private preview.
- **Tyler's first look (2026-09-28):** the glowing, outlined trigger was too much ("I don't wanna see it from across the map"). Now plain lit red with no glow or outline, and much larger (2.2× across, about 5× the face) so stray fire fills it. The launch effect was redone as a layered blast (flash, core, air column, shock ring, streaks, dust burst, haze, doubled debris). Then trigger-hit juice (punch, rock, needle jump, steam, chips, pressure-pitched clank, view thump). On the private preview as fixture `96fff76c-8c5b-4b15-ae97-1d84bffc1a21` (client `index-BaXSTxLx.js`).
- **Released to production (2026-09-28)** with the fifth batch on Tyler's OK ("a good checkpoint… push it live"): Worker `a9947e28-19c3-441f-8acf-dd1695ab25b4`, protocol 21. See [the receipt](verification/juice-launchers-release-2026-09-28.md).
- **Status (2026-09-28, before release):** built on `juice/launch-machines` and on the private preview (fixture `d7af3558-5e9d-43f5-8463-fb8c206077dc`, client `index-Bbe9u7e0.js`, protocol 21) for Tyler to judge the machines. One independent review found 4 issues (finale skipped hanging machines, repeated vent launch ids, surge bookkeeping lost on restore, per-frame vent allocations); all fixed in `3953c02`. What to look for: [review guide](juice/review.md#sixth-batch-launcher-machines-pressure-triggers-and-pressure-surge-protocol-21).

**Later (not now):**
- **UI overhaul (Tyler, 2026-09-28).** Done as the seventh batch (released 2026-09-28).
- **Dispatch overhaul (Tyler, 2026-09-28).** Done as the seventh batch (released 2026-09-28).
- **Ragdolls revisited (Tyler, 2026-09-28).** Done as the seventh batch (R1–R5, released 2026-09-28). Tyler (2026-09-28): ragdolls are fine as they are; legs (R6) dropped. After the fifth batch Tyler is "not really seeing a difference" in ragdolls (R1–R3). Tyler's exact complaint: a dead rat "becomes like a cylinder block", completely stiff, toppling like a salt shaker flicked across a table; it doesn't look like a living thing. The body itself must bend and go limp, not just the limbs.
- **Launcher overhaul.** Done as the fifth and sixth batches (released 2026-09-28). Tyler (2026-09-28) closed the leftover extras and accepted the code-built machine models as done.
- **Bot overhaul.** How bots act, their decision-making and how they work.
- **City and building model overhaul (Tyler, 2026-09-28).** Overhaul the city models and the building models.
  - **Carry in the load-time lessons (Tyler, 2026-09-28: "make note of the city improvements when we do the city overhaul").** From the load-time pass under T1 above:
    - First-visit readiness is bound by the GPU linking about 145 shader programs, about 64 of them heavy lit standard programs. Most come from the city's many separate shader patches (noir, street spill, fixed illumination, room occupancy, supply lamps), each creating its own program. Fold them into a few shared city materials.
    - The eight pooled sewer lamps double every lit city program (a second, sewer-lit variant of each). A sewer lighting design that doesn't change the scene's light count would halve the link work.
    - Build the street-spill atlas, fixed-illumination bake and facade beams offline (or cache them) instead of computing them on every page load; they are about 1–1.4 s of CPU on a desktop and more on phones.
    - Keep new city objects warmable before Enter: anything the welcome creates needs a stand-in in `createGame`, or its programs link after Enter.
    - The cameo models (870 KB) are served uncompressed (Cloudflare doesn't compress `.glb`); quantize or compress them, or load them only when a cameo appears.
  - **The city map is the document (Tyler, 2026-09-28).** Track everything (pickups by kind, routes, cheese balls, when and where things go off), measure all of it and make it readable to an agent at high fidelity, so the redesign rests on evidence. Design and build order: [the city map](city-map.md). Tyler approved it all (2026-09-28), adding rat, case, incident, buff and standing state and running K/D/A for the future AI ("the situation"), and how often humans and bots shoot. Steps 1–3 (places, facts with situations and the R2 archive, agent surfaces) are built and on staging (2026-09-29); production waits for his OK.
  - **Brainstorm, still open (Tyler, 2026-09-28).** No renders and no game changes yet. Lightweight three.js previews built from what we have may come later. The map should be played for years ("this is our last chance"), so the layout gets planned first as a top-down map. The planning map is `output/city-map/city-map.html` (refresh after `city-data.js` is regenerated from source; it reads the live heat itself).
    - **Keep the layout in general, with tweaks for the good of the game.** Fill the empty north and north-west; don't cut anything. The city is not too big: 30–50 rats was a catastrophe (everyone died on spawn to the cheese) and 10 is still very chaotic.
    - **New districts:** Tyler likes both the docks and a police precinct, possibly both. Sketched on the map's proposal layer: a harbour along the north edge with piers, and the precinct in the north-west.
    - **Give every region a job**, so no area is empty in every assignment: where cases spawn, pickups, Jurisdiction zones, Paper Chase destinations and Dispatch pillars.
    - **Routes north:** a sewer branch to the north and more street routes; no launcher.
    - **The precinct is the Panopticon (Tyler, 2026-09-29: "let's do A").** A unique landmark: a round cellblock of two or three floors around a central guard tower, with a brick front house on the −102 street. Curved ring walls let a ball glance round the curve (the only curved walls in a city where every wall runs north–south or east–west); cell bars stop rats but not cheese; the tower looks into every cell (the Hunch and "made" as a building). The front house holds the lobby, bullpen, dispatch radio room (a Dispatch pillar), front desk (a Paper Chase destination), evidence lockup (a case spawn), armoury (Ironclad) and the lineup room, where the round-end lineup could happen. Most Wanted's searchlight sweeps from the tower. The docks are the open fighting ground (Tyler likes open fights there).
    - **Across the rest of the map, all five agreed (2026-09-29):** cut building corners at junctions into 45° faces, so a ball turns from one street down the other (bank shots become a learnable skill everywhere); one angled signature bank wall inside each landmark; link the Gate to the precinct so the quiet west edge becomes a route; a chute from Needleworks' upper floors to the street, as an escape for the case and a ride; move one or two Ironclad sites into fight areas (precinct armoury, beside the Records forecourt). City boxes have no yaw today (`GrayboxBox` has only `rx`/`rz`); cannon and the static broadphase handle turned boxes, so angled walls need a layout-format change, not new physics.
    - **Working method (Tyler, 2026-09-29):** the whole overhaul is built in one run, not in rounds, from [the city overhaul plan](city-overhaul.md). Afterwards the map stays a work in progress for at least a week: gather data, adjust, gather again. Each adjustment bumps `layoutVersion` so the city map compares before and after.
    - **Build from a kit of reusable parts from the ground up**, carry in the load-time lessons above, measure before and after, and run a private preview before production.
    - **Known faults to fix, not preserve:** bot routes are poor (the bot overhaul follows), and rats clip through roof geometry at launcher landings and roof pickups. The Icebox catwalk is fine.
    - **Heat map (released 2026-09-28, [receipt](verification/heat-map-release-2026-09-28.md)):** the room counts where living, connected humans and bots spend each second, where rats die and where killers stand, in 4-unit cells by floor (sewer, street, upper, air). Kept forever, no names or IDs. Tyler ("I want this heat map to be a permanent thing") views it at <https://ratdetective.online/heatmap>, with any date range.
- **Complete optimization overhaul (started 2026-09-28).** Tyler felt a performance hit after the third batch (his PC was also busy). The 37-item assumption audit (numbered in the chat on 2026-09-28) is worked in phases, one item per commit, each with before/after numbers, no change to how the game looks or plays:
  - **Phase 0, baseline:** `?diagnostics` phase means and GPU time, the synthetic render fixture (`capacity-render.html`) with corpses, a CDP CPU/allocation profile of a hosted observation room, and the server bench with `--cpu-prof` (idle and 120-ball burst). Output: `docs/verification/perf-baseline-2026-09-28.md` with the audit re-ranked by measured cost. Tyler reviews before fixes.
  - **Phase 1, server CPU:** sweep and ball-loop allocations, no-socket snapshot, pickup checks, byte counting, checkpoint size. Proof: identical bench trajectory hash, Cloudflare `cpuTime`.
  - **Phase 2, client simulation/network/audio:** camera rays, decode/validation churn, audio listener, small churn.
  - **Phase 3, client rendering:** draw calls (corpse and own-rat batching, empty meshes, instance uploads), then per-frame CPU (static matrices, rain, street lights, tails, HUD writes). Proof: identical fixture pixels; Tyler playtests.
  - **Phase 4:** measured yes/no on sewer lights, shadow redraws, grain/filter, the two physics worlds, navigation, cameo compression. Look changes go to Tyler as choices.
  - **Phase 5:** preview playtest, production on Tyler's OK, before/after receipt.
  - **Status (2026-09-28):** Tyler said to do all of it on a branch, including the physics restructure ("we can fine tune the physics later"). Done on `perf/overhaul`, merged and **released to production** on his OK ("this feels a million times better"), Worker `48fb6913-82c5-443c-8794-6c03c91a7800`: server warm tick −80%, client 30→43 fps hosted on Halla. See [the overhaul receipt](verification/perf-overhaul-2026-09-28.md). Shadow freezing/removal were measured and left for Tyler to choose.
- **3D model and ragdoll overhaul.** Done as the fifth batch (M1–M3, R1–R3); ragdolls reopened and redone in the seventh batch.
- **Omarchy plugin overhaul, replay system first (Tyler, 2026-09-28).** Plugin part done 2 October: the plugin is now only an alert when people play ([Omarchy](omarchy.md)); desktop highlight recording was removed. Highlight replays move into the game itself: [the replay plan](replay-plan.md) owns that work.

## Seventh batch: UI, Dispatch and ragdolls (released 2026-09-28)

Tyler wanted all three worked at the same time. **Released to production (2026-09-28)** with the title and load-time pass on Tyler's OK ("push it live"): Worker `d05432f7-17b9-47f5-9d9b-973548da9e01`, protocol 22. See [the receipt](verification/seventh-batch-release-2026-09-28.md).

- **Ragdolls, confirmed direction:** the corpse must stop reading as a rigid cylinder flicked like a salt shaker. R1 a soft skinned spine in the coat (hips, belly, chest, head) so the body bends; R2 a client-only point-chain ragdoll (hips, chest, head, feet, arm, tail) with ground and wall collision, following the server corpse's position, replacing the rigid spin; R3 go limp first (knees buckle, fold at the waist, limbs trail); R4 land like a sack (belly flattens, head bounces, sprawl, a last twitch); R5 shots ripple and fold the body where hit. Legs (R6) dropped by Tyler after release: ragdolls are fine.
- **UI, confirmed direction:** all of U1–U9 (one noir look and one motion kit that honours Reduced interface motion; title desk and swoop into the city; case-folder settings and pause; rolling numbers, sliding ranks, points flying to the score card, urgent timer; telegram kill feed; reactive crosshair; death camera before RAT DOWN; Case File awards stamping in; paper-slide scoreboard, card exits, springy touch controls). No separate health display. Tyler will judge it by playing.
- **Dispatch, Tyler's direction:** no HUD direction or searchlight; the loud siren is the direction. Needs far more juice, possibly more boxes in better locations, a completely new look, much easier to shoot (today's target is a 0.84 × 0.84 face on one side only), and a reward for the rat who shoots it. Details under discussion.
  - **Agreed (2026-09-28):** (1) a noir street alarm pillar: tall black iron post, big red alarm bell on top (the target), small red beacon; ready = bursts of ringing, blurred hammer, trembling pillar, turning beacon; shot = berserk bell, shudder, sparks, shattered call-box glass, view kick, streetlamps citywide flash red, radio squawk, every pillar rings during the roll, the roll and stamped incident name on the pillar face; during an incident the pillars show its name and countdown, then a last-3-seconds count, finale beat and all-clear whistle. The whole bell and housing count as the target from any side (about 2.5–3 units), mounted 5–6 units up; every hit reacts, even while busy. (2) About nine pillars on street corners seen from two or three streets: one per landmark corner, the central crossroads, two avenue intersections, one in the sewers; only the nearest one or two play the siren while every bell rings. (3) Rewards A and B only: DISPATCHED BY NAME for everyone, a kill-feed line and a Dispatcher Case File award; the caller instantly gets a random supply (Ironclad, Hot Pursuit or Quick Fix) with its claim card. No caller immunity or shoot-to-stop roulette. Bots detour to a nearby ready pillar.
  - **Rejected (2026-09-28):** charging while busy and stacking incidents. Incident timing needs real downtime; Tyler raised LINE BUSY (cooldown) by 5 s, 16 → 21 s.
  - **Tyler's first play (2026-09-28):**
    - Round end: he likes the end screen; the lineup was far too slow and nobody could read the stats. Now the slow-motion finish, CASE CLOSED card (1 s) and a fast lineup share the first 5 s and the results board holds 10 s.
    - UI design direction (via the design-direction skill, ten options on one piece of UI at a time). Constraints: light UI colours distract from play (the trap we keep falling into); try palettes other than purple (he is not in love with it); the title should be a noir detective's office with rat flair (today's pencil barely reads and vanishes on the purple); the hot-case marker should blend in, not shout; the kill feed looks amazing but is too bright — paper with transparency or similar.
  - **HUD direction selected (2026-09-28): Carbon scrawl** (round 2, option 1; prototype `output/design/hud-direction/hud-direction-2.html`, local and disposable). Round 1's ten tidy palettes were rejected as too uniform and not Rat Detective; Tyler wants wild, wacky, cartoony chaos with juice. Protected choices: see-through blue-black carbon-paper panels (about 66% opaque) with an inner ink smudge and a hard offset shadow; faded carbon blue-white typewriter text (Special Elite) with Bangers for headings; every panel and kill-feed line knocked a little crooked (alternating tilts); letters that jitter slightly; small doodles (the coffee ring by the score card was removed on 1 October: Tyler read it as a stray yellow C); stamp-red only for you, headshots and danger; the hot-case marker small, dim and bobbing. In-game UI stays dark and translucent. The title screen is exempt: it may be bright paper on a detective's desk (next: title-screen direction).
  - **Title screen and logo (2026-09-28):** the title may be bright paper on a noir detective's desk with rat flair (ten desk options in `output/design/title-direction/title-direction.html`, using today's badge as a placeholder). Tyler put the logo itself up for change too.
  - **Title selected (2026-09-28): evidence wall at night** (prototype `output/design/title-direction/evidence-wall.html`, option 1). Bright cork board lit by a warm lamp pool, cut by slanting venetian-blind stripes; pinned paper scraps with red pushpins and red string; a yellow sticky note; ENTER CITY as a red paper scrap. **Logo:** RAT DETECTIVE rubber-stamped in red with the R's leg curling into a rat tail (option 1), combined with a brass police badge (option 2) and a magnifying glass (option 3) around the rat. No more prototypes: build it in the game with the Carbon scrawl HUD.
  - **Tyler's second look (2026-09-28):** loves where the game is going. Title is the right direction but far too flat and fake: he wants it **hyper-realistic with cartoon vibes**, richly detailed; decided: a **rendered still** (a real 3D office scene rendered once into a backdrop image; controls as real HTML on top; cheap live touches). The badge/lens logo looked horrible and is gone. **New logo:** Tyler supplied a generated flat mark (black rat detective in profile, fedora with cream band, stern eye, grey trench coat, star): `public/logo-rat.webp` (cut out, cream sticker outline) and `public/favicon.png`. The dice must stand out a lot more. Settings: one fixed window size for every tab; styled checkboxes; styled range sliders (UI scale and others); no browser spinner arrows in the number boxes; styled scrollbars.
  - **Rendered title and settings polish built (2026-09-28):** a path-traced office still (`public/title/office.webp` and `office-wide.webp`, rendered on Veelox's GPU from `test/visual/title-scene.ts`; Halla's iGPU hangs on the path tracer) with live HTML lined up on its papers: Tyler's logo on the centre poster under a red RAT DETECTIVE stamp, the name card, ENTER CITY, a big path-traced red die that tumbles on reroll, and CSS-only rain, headlight sweeps, lamp flicker, dust and smoke. Settings keep one window size and have typed tick boxes, ruler sliders, stamped −/+ number boxes and ink scrollbars. On the preview as fixture `cecdd3b1-6b40-430b-9351-3b252784060f` (client `index-2EmYaFJA.js`).
  - **Title juice without a re-render (2026-09-28, Tyler: "this is awesome"):** the still leans a few pixels toward the mouse; a red neon sign buzzes on the window glass; lightning every ~23 s lights the rainy city through the glass (colour-dodge, so the skyline shows) and flashes the blind stripes; the shadow of a rat in a fedora scurries across the lit wall every ~27 s; each typed key strikes the card and the last one throws the carriage. The name is typed one word per line (rank, then surname), always the same size. Lesson: flat white overlays on the still read as fake; dodge or mask the effect through the render's own light (window, stripe and lamp masks) so it belongs to the room.
  - **More title juice, still no re-render (2026-09-28, Tyler: "love it. can we still do more?"):** the camera breathes in and out over 26 s; a prowl car's red/blue strobe sweeps the glass and blinds every ~41 s; a moth worries the desk lamp while its big soft shadow flaps across the lit wall; steam curls off the coffee; the desk phone rings now and then (and when hovered), and clicking it pops a comic balloon with a noir rat line plus a new `phone-answer` foley (handset clack and squeaky voice down the line) while focus stays on ENTER CITY. Lesson: shadows cast from the lamp need a big blur and a small travel range inside the lamp mask, or they read as clip-art; coloured light through the window must be a small soft patch, not a full-pane wash.
  - **Built (2026-09-28):** the evidence-wall title with the stamp/badge/lens logo (`src/ui/title.css`, `TitleScreen.ts` strings between pins, a swoop through the lens) and the Carbon scrawl palette and styling across every in-game surface (purple removed; Special Elite and Permanent Marker self-hosted; `scrawl` letter jitter switch). On the preview as fixture `4d36bfa7-ee64-4a2d-b155-a0f01603ccdc` (client `index-2N0BOxl9.js`).
  - **Built (2026-09-28):** R1–R5, the Dispatch pillars/rewards/21 s LINE BUSY (protocol 22) and U1–U9, on `juice/ui-dispatch-ragdoll`. What to look for: [review guide](juice/review.md#seventh-batch-ui-dispatch-and-ragdolls-protocol-22). Independent review found 4 client issues (stains floating off bent corpses, scoreboard rows re-fading, headshot launch-contact guard lost, ranking rows re-popping) plus 3 test regressions (bots parked at unrung bells, respawn physics, snapshot pose drift); all fixed. On the private preview as fixture `35af407a-e1d2-4620-abf2-27a05c794742` (client `index-D57cEBSu.js`).
  - **Go (2026-09-28):** Tyler said to implement all three. Branch `juice/ui-dispatch-ragdoll` from `main`. UI style not chosen by Tyler: the kit evolves today's midnight-paperwork palette (Bangers, paper, gold, stamp red) rather than switching it.



Each item gets its own switch in the `?feel=dev` panel, so Tyler can cut it at review.

- [x] **F1 Feel layer:** director, tuning file, `?feel=off`, `?feel=dev` panel with per-item switches. → [foundation](juice/foundation.md)
- [x] **F2 Settings:** Camera shake and Flash strength; Reduced interface motion also zeroes shake.
- [x] **F3 Perf baseline:** fixture numbers with feel off, before any effect ([budget](juice/foundation.md#performance-budget)).
- [x] **1 Shot kick** · **2 Hit jolt** · **3 Damage direction and edge flash** → [spec §1–3](juice/feel-spec.md#1-camera)
- [x] **4 Impact freeze** · **5 Bigger dripping splats** · **6 Cheese stains** · **7 Ironclad sparks** · **8 Kill bloom and punch-in** · **9 Comic words**
- [x] **10 Noir low health** (black-and-white fade with lifted shadows and film grain since 30 September, was a colour drain toward dark; muffle, heartbeat) · **11 Hat knock and pop-off** · **12 Death variety** · **13 Death camera and iris**
- [x] **14 Model:** whiskers, eyebrows, eye tracking, cheeks, brim, hem, shoes, plus render sheets → [character](juice/character.md)
- [x] **15 Animation:** squash and stretch, skid, sneaky carry, launch pose, idle fidgets, kill nod, hit and pickup reactions
- [x] **16 Movement:** landing dip, launch view and wind, Hot Pursuit speed, dust → [spec §5](juice/feel-spec.md#5-movement-and-flight)
- [x] **17 Sound:** footsteps, jostle, squelch, whizz, echo and muffle, kill stab, music stings → [sound](juice/sound.md)
- [x] **18 City:** pigeons, litter, neon and lamps, steam, trash cans → [spec §7](juice/feel-spec.md#7-city-reacts)
- [x] **19 Rewards:** score pop, streak callouts, victory slow-motion, Case File with the new server stats → [spec §8](juice/feel-spec.md#8-rewards-and-round-end)
- [x] **20 Final package:**
  - frame-rate comparison against the budget;
  - full checks;
  - one independent code review, with its findings fixed;
  - a hosted private preview;
  - [review guide](juice/review.md).

## Next: exaggerated noir

Tyler's direction (2026-09-27): push the noir theme harder in the city, meaning its lighting, colour and atmosphere. The bright rats must still stand out against the dark city, because that contrast is what keeps the game readable. Low-health noir is the reference mood. He chose **all eight pieces at Bold strength**, each with its own switch, plus a **Noir strength** slider in the juice review panel.

**Rules for this pass:**
- Rats, cheese, cases, pickups and cameos keep full colour and brightness.
- It's presentation only and switched off under `?feel=off`.
- No new live lights or shadow maps. Pooled or instanced meshes.
- Phones get a lighter version.
- It supersedes the accepted "keep ambient, hemisphere, moon, exposure unchanged" lighting rule for the city only.

- [x] **N0 Noir strength:** one shared strength (Bold ≈ 0.65), shown as a slider in the juice review panel.
- [x] **N1 Deeper shadows:** a contrast curve on city surfaces only. Dark areas go darker; lamp pools stay bright.
- [x] **N2 Colour-drained city:** city surfaces go cold grey-blue. Windows, lamps and neon keep their warmth.
- [x] **N3 Rain and wet streets:** rain streaks around the view (not indoors or in sewers), splashes, lamp reflections on the wet street, and rain sound.
- [x] **N4 Haze:** visible light cones under streetlamps and a little more cold fog.
- [x] **N5 Venetian-blind light:** striped window light on landmark interior floors.
- [x] **N6 Film grain and vignette:** plus letterbox bars during big moments (death camera, victory slow-motion).
- [x] **N7 Neon accents:** red and teal neon signs on landmark facades that buzz and flicker. They're the only saturated colour in the city.
- [x] **N8 Searchlights and lightning:** sweeping rooftop beams, and the occasional lightning flash with distant thunder.
- [x] **N9 Review package:** performance check, focused checks, a fresh preview, and an update to the review guide.

## Open decisions

- **Noir pass and first-review choices:** settled 2026-09-28. Tyler delegated these calls ("make choices on that stuff… if something's wrong, I'll tell you"); every choice in [the review guide](juice/review.md#choices-to-confirm) stays as built.
- **Dropped by Tyler (2026-09-28):** production CPU measurement and further speed work. Shadow freezing/removal is not pursued.
- **Seventh batch closed (2026-09-28):** Tyler played the live release thoroughly and heard every sound; complete. Phones stay a last, low-priority check for later (nobody plays on a phone yet).
- **Next (2026-09-28):** the city and building model overhaul (carries the load-time lessons), starting with [the city map](city-map.md) steps 1–3, then the bot overhaul (scored by the map's bot divergence).

## Evidence

- Current game: [current state](current-state.md), [documentation map](README.md).
- Last release (seventh batch, title and load time): [receipt](verification/seventh-batch-release-2026-09-28.md).
- Air acting contact sheets (local, not in the repo): `~/.cache/rd-shots/air/` on Veelox.
- Reference only: [2026-09-12 animation handoff](handoffs/animation-polish-2026-09-12.md) (rig map and hazards), [foley history](chaos-foley.md), [player settings](player-settings.md).
