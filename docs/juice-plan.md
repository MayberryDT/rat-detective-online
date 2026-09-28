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
- **Next action:** the later overhauls, when Tyler picks them.

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
- [x] **Blackout.** City surfaces, lamps, windows, neon, haze, searchlights and wet reflections go dark (NoirCity darkness plus exposure); nameplates dim. A lightning storm (every 2.5–7 s) and muzzle flashes within 40 units light the street for a beat. Supply lamps, the case and guidance stay visible.
- [x] **Clean Bill.** Everyone alive heals to full as it starts (no Quick Fix card), and every rat has a city-wide, stronger Hunch whatever its health.
- [x] **Malpractice.** Quick Fix kits fidget, hop 5 units away from any rat within 7 (at most every 0.65 s, within 12 units of home, on supported floor) and walk home after. 35% of claims explode into neutral cheese instead of healing.
- [x] **Most Wanted.** The assignment leader (then kills) is wanted: a police searchlight follows them and everyone sees their sketch through walls. The killer gets a full heal and Hot Pursuit (BOUNTY COLLECTED); the next leader becomes wanted. Bots hunt the wanted rat.
- [x] **Rat Race.** Every living rat has Hot Pursuit until the incident ends, and shots fly 1.35× faster (shared pattern, so prediction matches).
- [x] **All Units.** Respawns land among the 12 supported spawns nearest the real case (or its carrier, or the active Jurisdiction zone), at least 10 units away, on the one farthest from living rats.
- **Review fixes:** the independent review caught that clients rejected the new heal causes and the Rat Race/dud launch speeds (which would have disconnected players); fixed with a wire regression test.
- **Tyler's first playtest (2026-09-28):** "amazing, I love this." Touch-ups, done the same day:
  - **The Hunch as a power-up, on your own nameplate** (a first bottom-left vitals plate was wrong: Tyler meant the health bar over your rat). At full health a small plain eye opens beside your pips (no brim, no glow; Tyler found the first version too glowy) and the pips take a subtle gold glow, with an "aha" sting; the first hit shuts the eye, fades it away and plays a snap and a sour slide.
  - **Supplies were hard to find** ("a huge clarity issue"). Props now ignore the fog; each site throws a brighter, breathing lamp cone and pool; from 10 to 40 units a soft beam in the supply's colour rises from it (silver, red, green); and the prop gets an outline in that colour, like the far-rat edge. Hot Pursuit looked like the old shoes, so it is now winged red wingtips on a shoeshine box.
  - **Supply juice** (Tyler: "add juice to the pickups as well"): props turn slowly on the plinth; a claim pops the prop up and away in a coloured flash and dust with a whoosh-and-click, the lamp stutters out; a restock clicks the lamp on with a warm thump and drops the prop back with a bounce. Everyone nearby hears claims and restocks.
  - **Round end, 15 s and readable.** It felt like five seconds and the stats were tiny in a corner. Now: the full CASE CLOSED card for 2.6 s, then the police lineup with a readable winner banner across the top, then a results board: the full standings (the Tab scoreboard) beside a large Case File with each award, winner and value. Photos run one per second.
- **Released to production (2026-09-28)** on Tyler's OK ("looks good, push it live"): Worker `be7ac8ba-2529-42ba-865a-27aafe11131e`, protocol 20. See [the receipt](verification/juice-batch4-release-2026-09-28.md).
- **Next action:** the later overhauls (launchers, bots, optimization, 3D model and ragdoll), when Tyler picks them.

**Later (not now):**
- **Launcher overhaul.** Make the launchers far more chaotic and much juicier, including how the case interacts with them.
- **Bot overhaul.** How bots act, their decision-making and how they work.
- **Complete optimization overhaul (started 2026-09-28).** Tyler felt a performance hit after the third batch (his PC was also busy). The 37-item assumption audit (numbered in the chat on 2026-09-28) is worked in phases, one item per commit, each with before/after numbers, no change to how the game looks or plays:
  - **Phase 0, baseline:** `?diagnostics` phase means and GPU time, the synthetic render fixture (`capacity-render.html`) with corpses, a CDP CPU/allocation profile of a hosted observation room, and the server bench with `--cpu-prof` (idle and 120-ball burst). Output: `docs/verification/perf-baseline-2026-09-28.md` with the audit re-ranked by measured cost. Tyler reviews before fixes.
  - **Phase 1, server CPU:** sweep and ball-loop allocations, no-socket snapshot, pickup checks, byte counting, checkpoint size. Proof: identical bench trajectory hash, Cloudflare `cpuTime`.
  - **Phase 2, client simulation/network/audio:** camera rays, decode/validation churn, audio listener, small churn.
  - **Phase 3, client rendering:** draw calls (corpse and own-rat batching, empty meshes, instance uploads), then per-frame CPU (static matrices, rain, street lights, tails, HUD writes). Proof: identical fixture pixels; Tyler playtests.
  - **Phase 4:** measured yes/no on sewer lights, shadow redraws, grain/filter, the two physics worlds, navigation, cameo compression. Look changes go to Tyler as choices.
  - **Phase 5:** preview playtest, production on Tyler's OK, before/after receipt.
  - **Status (2026-09-28):** Tyler said to do all of it on a branch, including the physics restructure ("we can fine tune the physics later"). Done on `perf/overhaul`, merged and **released to production** on his OK ("this feels a million times better"), Worker `48fb6913-82c5-443c-8794-6c03c91a7800`: server warm tick −80%, client 30→43 fps hosted on Halla. See [the overhaul receipt](verification/perf-overhaul-2026-09-28.md). Shadow freezing/removal were measured and left for Tyler to choose.
- **3D model and ragdoll overhaul.**

## Remaining outcomes (in order; one commit each)

Each item gets its own switch in the `?feel=dev` panel, so Tyler can cut it at review.

- [x] **F1 Feel layer:** director, tuning file, `?feel=off`, `?feel=dev` panel with per-item switches. → [foundation](juice/foundation.md)
- [x] **F2 Settings:** Camera shake and Flash strength; Reduced interface motion also zeroes shake.
- [x] **F3 Perf baseline:** fixture numbers with feel off, before any effect ([budget](juice/foundation.md#performance-budget)).
- [x] **1 Shot kick** · **2 Hit jolt** · **3 Damage direction and edge flash** → [spec §1–3](juice/feel-spec.md#1-camera)
- [x] **4 Impact freeze** · **5 Bigger dripping splats** · **6 Cheese stains** · **7 Ironclad sparks** · **8 Kill bloom and punch-in** · **9 Comic words**
- [x] **10 Noir low health** (colour drain, muffle, heartbeat) · **11 Hat knock and pop-off** · **12 Death variety** · **13 Death camera and iris**
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

- **Noir pass:** built to Tyler's pick (all eight, Bold); strength and each piece are dialled at review.
- **Choices from the first review guide** not yet confirmed: the lamp/neon substitute, hem sway, Case File tallies kept in memory, and the victory card delay ([choices](juice/review.md#choices-to-confirm)).
- **Git push** of `dd5aabb`/`3ffdd8b` (and this branch) to GitHub: waiting on Tyler.

## Evidence

- Current game: [current state](current-state.md), [documentation map](README.md).
- Last release (server CPU and delivery gating): [receipt](verification/server-cpu-2026-09-27.md).
- Reference only: [2026-09-12 animation handoff](handoffs/animation-polish-2026-09-12.md) (rig map and hazards), [foley history](chaos-foley.md), [player settings](player-settings.md).
