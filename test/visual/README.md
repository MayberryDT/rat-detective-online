# Visual verification and model tools

Reviewed **2026-09-08**. Current gameplay/design constraints are in [current state](../../docs/current-state.md); preview setup is in [tooling](../../docs/tooling.md). The model/city sections below are a chronological art-development record. Early tiny-graybox, fixed-count, camera and layout descriptions are superseded by the shipped version-2 city and later approved changes.

The user currently handles interactive gameplay testing. Run browser-input automation only when requested; static/model screenshots and existing CI checks are separate. The title-screen share image is [share-title-v1.png](../../public/share-title-v1.png), a real 1200×630 capture. It is not a regenerated concept image.

Normal multiplayer playtesting uses the hosted relay on port 5174, subject to its private backend version. Port 5180 is a separately served static visual build. Do not use the old 5173 workerd instructions below as the normal long-running playtest service. Static solo stage success does not establish network authority, bot roster persistence or multiplayer smoothness.

`npm run visual:build` builds separate test pages, excluded from production assets. `npm run smoke:visual` captures five states and compares them against checked-in images. Missing Chrome or baselines fails the command. Record updates only after reviewing the changes: `UPDATE_VISUAL_BASELINES=1 npm run smoke:visual`.

Serve `dist-visual` locally to inspect `/visual-fixture.html?seed=20260905&state=alive`. States: alive, turned, damaged, dead, respawn. Every state starts with fresh entities and seeded randomness; death advances the actual animation and Cannon simulation for 600 ticks. The dead-state camera follows the corpses. Respawn exercises the complete death transition first. Visible status reports readiness, seed, state, and renderer resources.

`/performance-fixture.html` compares the same seeded city, camera, lighting and three rats with instanced scenery and equivalent separate meshes. Each mode has 60 warm-up and 300 measured frames. It reports draw calls, triangles, frame intervals and CPU render-submission time. These timings are not GPU timings; batching can increase submitted triangles because culling works per batch.

## Current character workshop (September 12)

September 14 standalone superhero model study: `/cameo-preview.html` shows
Spider-rat and Bat-rat with idle, passerby and shot-at animations, scrub/replay
controls, orbit/preset views and animated GLB downloads. This is a silent
art prototype, separate from live characters and gameplay. See
[model study and export checks](cameos/README.md).

`/model-preview.html` is now the rebuilt character workshop: four color swatch
pools, orbit/view presets, coat detail, existing walk/fire poses, case/empty-sleeve/no-sleeve, opponent
rendering and Ironclad. Street and Records support the walking cycle in place in city-lighting
views using the actual shoulder camera. All three views use the real entity and
shared live case transform. This art tool stays muted and does not run gameplay
inputs. The older model-tool controls described below are historical.
See [the floating sleeve receipt](../../docs/verification/rat-floating-sleeves-2026-09-12.md).

## Stationary target practice

The separate `/hitbox-practice.html` page is a manual stationary-target range using the real city, gun, camera and shared hit simulation. H toggles authoritative collision wires, R resets targets/counters, T returns to the start. Targets never move or shoot and refill after each kill. [Setup, current link and checks](../../docs/hitbox-practice.md). This fixture does not connect to multiplayer.

## Static cartoon HUD review

Run `npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 5192` and open `/hud-preview.html`. It draws the actual city once behind the real HUD without network, simulation or gameplay input. Query parameters select `phase=ready|rolling|active|reveal|cooldown` and any current `incident` ID; defaults are active Popcorn Panic. Resizing redraws the static scene. This page is a development fixture, not a normal game or performance benchmark.

## Historical rat comparison

To render the original rat implementation inside the same fixture/world:

```bash
mkdir -p .wrangler/visual-reference
git archive 08e8005 src | tar -x -C .wrangler/visual-reference
VISUAL_REFERENCE=1 npm run visual:build
VISUAL_DIST=dist-visual-reference VISUAL_OUTPUT=test-results/visual-reference npm run smoke:visual
```

On 2026-09-06, alive/turned/damaged/dead were pixel-identical to the original. Respawn differed by 0.6985% of pixels, consistent with restoring the missing outline. A tolerance-based image comparison alone does not protect outline opacity: presentation unit tests explicitly assert it. See `docs/verification/rat-reference-comparison.json`. Normal current-fixture repeat captures were pixel-identical for all five states.

## Cheese-pistol model and animation preview

Build with `npm run visual:build`, then serve `dist-visual` (for example,
`python -m http.server 5180 --bind 127.0.0.1 --directory dist-visual`). Open
`/model-preview.html` for a close-up hero with Carry / idle, Walk, Fire pistol,
Take hit, Defeat, Reset, Rotate view, and Hat controls. Wide panels include the approved reference image.
The preview uses the actual entity and animator with studio lighting; the existing
city fixture checks gameplay lighting. The reference image is included only in
this separate visual build, not the production game assets.

The model follows `assets/concepts/rat/cheese-guns/01-cheese-pistol.png`: continuous
coat and muzzle geometry, a wider shaped fedora with cream band, round ears,
half-lidded eyes, solid raised collar and fitted lapels, small cuff/paw, and a
beveled cheese pistol with actual cutout holes. All three hats and configurable
coat/fur/hat colors remain supported. The outline is now 1.2cm at 10% opacity,
with 0.12 emissive intensity; lapel and ear outlines are hidden to avoid overlapping edges.
The face sits deeper inside the raised collar under a lower, forward-tilted brim.
Smaller ears share the hat pivot, with their bases above the side brim and outside
the crown so secondary motion preserves their clearance. Geometry regression tests
check brim and crown clearance across all three hats during walking and recoil.

Named visual pivots support breathing, blinking, ear twitch, the strengthened
walking bounce/lean, tail follow-through, and pistol carry/aim/recoil. Local and
replayed shots raise the paw. The arm holds aim briefly then eases back to carry.
Projectiles now launch at the visible muzzle, retaining speed, gravity, damage,
ricochet, and resolved network replay behavior. Respawn resets the pose.
Alive animation does not move the physics body or entity root. Hits blend a brief
cream highlight into a warm tint while retaining dark facial details and the
original material colors, with a small compression/rebound and hat follow-through.
Defeat is a physical launch, tumble, contact bounce, and roll to rest. Its torso
center of mass applies only while dead; respawn restores all alive collision
shape offsets and settings. Spring motion responds to angular velocity, gravity,
and collisions in the head, hat, arm, and flexible tail. There is no timed snap
to a flat pose. Contact sounds track actual impacts. The preview follows the
ragdoll's center and Reset restores the character.


Five visual baselines were reviewed and refreshed on 2026-09-07. The three-rat
turned fixture at the initial pistol rebuild reported 386 draw calls and 42,332 triangles (scene totals), compared
with 344 / 17,256 for the first model upgrade and 302 / 13,800 for the original.
These are rendering workload counts, not GPU timings. Physics collision shapes
and movement speed remain unchanged. Client tests cover barrel-based aiming,
projectile physics/replay, animated outline alignment, and resource disposal.


## City art preview

`/city-preview.html` shows the actual seeded city with Street, Corner, Skyline,
and Orbit controls, plus the finished rat for scale. The building footprints,
heights, road layout and physics bodies still come from the same WorldSpec.

The city upgrade adds framed window textures with separate emission, stone
cornices and corner trim, double doors and canopies, tiled sidewalks and curbs,
crosswalks, drains, textured asphalt, stepped lantern poles and soft warm pavement
light pools. Repeated details share instanced batches. Pools are decorative glow
meshes; they do not add a point light for every lamp. Moonlight and ambient fill stay deliberately low: near-black purple silhouettes
with sparse gold, cream, icy blue and occasional coral windows. Warm lantern pools
provide local contrast. The earlier bright facade/paving treatment was rejected
as off-theme; retain geometry details without broadly illuminating the city.

The turned gameplay fixture reports 394 draw calls and 130,536 triangles after
this pass (scene totals, not GPU timings). Collider agreement, repeatable seeded
scenery and complete texture/material/geometry disposal are covered by tests.


## Cheese balls, impacts, and city add-ons

`/cheese-preview.html` offers Fire, Slow motion, and a rotating Cheese close-up.
Projectiles remain spherical cheese balls with the original 0.15 radius and shallow
visual dimples. Spin and a small uniform compression are cosmetic. Preserve the
fine-tuned 175 speed, -25 gravity, 0.9 restitution, five-second lifetime, raycast
collision handling, damage, and resolved network trajectories.

Impact effects use bounded shared resources: up to 160 small round crumbs and 40
temporary surface splats. Crumbs expire within 0.8 seconds and splats within three
seconds. They add no collision bodies or aim targets and clear on projectile reset.

City add-ons include dumpsters, bins, crates and occasional fire escapes, all
batched decorations. Their independent decoration RNG preserves established window
and lamp placement. CityGenerator.update drives occasional lantern flicker,
individual window changes and faint drain steam; gameplay and the city preview
call it without touching the collision layout. Street props provides a close-up.

## Neighborhood graybox

Full multiplayer: `http://127.0.0.1:5174/?room=graybox-first` through the configured hosted relay; see the current tooling guide.
Room names beginning `graybox-` select shared world version 2; ordinary rooms
keep version 1. Use the same room URL in two browsers for a local match.

Solo tour: `http://127.0.0.1:5180/stage-prototype.html` after `npm run visual:build`.
WASD, mouse, Space, click to shoot; Esc opens the menu, M shows the overview.
Tour buttons visit Records, Gate, Icebox and the sewer junction.

The prototype now fills the original 12×12 city footprint (362 units across,
roughly nine times the old graybox area). Most original seeded building positions
and sizes remain, using the existing detailed noir renderer. Reservations replace
central blocks with Records and varied streets, place Gate to the west and Icebox
to the east, and open a southern drain approach. Additional service wings create
longer alleys and blind receiving pockets among the original blocks.

Three continuous ramps connect to a longer T-shaped sewer seven units below the
streets. Gate is at (-138,0), Icebox service at (138,0), south exit at (0,138).
The old ±60 boundary and fake surrounding towers are removed. The visible city
edge is now -196 to166 on each axis. Pipes, repeated lights and exit signs support
navigation. Records, case and Dispatch remain central. This is an integrated
layout for human feedback, not a finished city-wide art pass.

Shared geometry lives in src/shared/grayboxLayout.ts. Neighborhood creates both
visible solids and Cannon bodies from it, updating transformed AABBs for immediate
projectile raycasts. RatController uses the prototype camera framing and wall
avoidance throughout. Movement and cheese-ball tuning remain unchanged.

Existing test fixtures cover ramps, sewer branches, spawns and raycasts, but have
not been rerun for this expansion. Earlier multiplayer results do not validate it.
Art is deliberately preliminary. The next test is whether human chases and
crossfire make these three places memorable and fun.

## Records / Hot Case integrated slice

Solo: http://127.0.0.1:5180/stage-prototype.html?view=approach
Multiplayer: http://127.0.0.1:5174/?room=graybox-records-v1

The solo page runs the same ChaosSimulation used by the graybox room, with a
stationary practice rat that respawns after five seconds. Walk to the red case;
shoot the Dispatch box beside the Records door, wait for the roll, then shoot
the practice rat. A case hit reflects and releases; a rat hit consumes the shot.
The through-wall outline belongs only to the case. The preview minimap is removed.

Gameplay-camera review positions are ?view=approach, ?view=side, ?view=rear,
?view=gate and ?view=icebox.
The existing mouse controls and shoulder camera are used for all three.

Confirmed slice behavior implemented:
- one room-owned case and one Dispatch lifecycle, included for late joiners;
- off-hand carry, nearby unobstructed pickup, disarm, death/disconnect release;
- case recovery from out-of-bounds, inaccessible high resting places or embedding;
- final incoming shot direction drives separate incident corpses;
- corpses hit architecture and shove the case without colliding with living rats;
- existing kill scoring; possession time is informational, not a new win condition.

Proposed defaults in src/shared/chaosState.ts:
pickup radius 1.6; previous-carrier restriction 900ms; roll 2.4s;
incident 25s; cooldown 16s; corpse speed 38 and lifetime 10s.
Limits: 16 active incident corpses and 256 active shots.
Own case hits disarm; self damage is excluded. Current FFA has no team system.
Future teams must preserve friendly health immunity without silently changing
the chosen genuine-case-hit disarm policy.

Version-2 graybox rooms now resolve bullets in the room's simulation. They retain
175 speed, -25 gravity, .9 ricochet retention, five-second lifetime, and existing
body/head hit shapes. Version-1 ordinary rooms retain their original hit flow.
Clients render snapshots with short extrapolation. Network latency feel and
high-player-count performance need human/network playtesting.

The room checkpoints shared state and transitions; a recovered loose case may
briefly return to Records after a prolonged process interruption. Corpses have
independent identities/lifetimes and do not delay player respawning.

Validation for this slice: TypeScript and build checks plus a gameplay-camera
visual review. No new automated gameplay or multiplayer tests were run, at the
user's request. Earlier multiplayer smoke results do NOT validate this slice.

## Four-landmark scale pass

The surrounding masonry now uses much darker facade albedo, while window emission
remains independently high contrast. Street fill is reduced moderately; sewer
lighting is retained. Records gains a 110-unit stepped tower, broad civic wings,
a taller entry frame and larger statues. Gate has 64-unit twin towers and a high
connecting arch. Icebox gains a 48-unit-wide warehouse and an 86-unit refrigeration
tower. Needleworks is the fourth playable destination in the southwest, with a
factory court, arcades, scissors sign and 108-unit clock-tower silhouette.

The shared box layout includes new structural collision, and clears surrounding
building reservations for each enlarged landmark. Case/Dispatch positions,
sewers, movement and ball tuning remain unchanged. Visit Needleworks or use
?view=needleworks for its gameplay-camera approach. These dimensions and the
fourth landmark are a feedback iteration, not a final map commitment.

## Enterable landmarks and authored streets

This pass follows the supplied multiplayer research's local-loop, threshold,
vertical-connection and sewer-destination guidance, with the V1 addendum's
chaotic-comedy priority taking precedence over competitive parity.

Records, Icebox, Needleworks and the new pumping hall each have a ground-floor
hall and two stair-connected galleries (0/8/16). Tall skyline masses begin above
those occupied floors; this does not open every floor of each skyscraper.
Doorways connect different street approaches, and the interior atriums keep
upper/lower relationships visible. Cosmetic stair treads sit over shared smooth
collision inclines; movement and cheese-ball tuning are unchanged.

The street network is now authored in cityPlan.ts: a main avenue, staggered
junctions, service approaches and loading courts. Original building frontages
are relocated/filtered against those streets. Freestanding alley walls are
removed. The new sewer loop serves a fourth entrance by Needleworks, and a
maintenance spur creates another underground choice. This remains a playable
layout iteration for human feedback, not a finished balance or art pass.

Case recovery distinguishes reachable gallery/stair surfaces from inaccessible
roofs. New structural geometry is shared by the solo preview and room simulation.
# Dispatch Assignment review

`assignment-fixture.html` is a static review of the distinct assignment HUDs and whole-landmark destinations in the real city/shoulder camera. It accepts `assignment=closing-time|chain-of-custody|excessive-force`, `view=city|icebox|archive|offscreen|sewer|maintenance|dispatch`, `stop=0..5` (destination cursor, not score), `phase=title|briefing|suspended|closed|death`, `held`, `remaining` (milliseconds), and `confirm`. It contains no gameplay input or network and does not demonstrate multiplayer scoring. See [the implementation receipt](../../docs/dispatch-assignments.md).

The assignment fixture now includes navigation links for all three distinct HUDs, the three-delivery Chain scoreboard, Maintenance, the title, victory and death screens. It pins the route for reproducible visual states; live matches rotate all six eligible landmarks until a rat scores three deliveries. The death visual replays its three-second countdown every 4.5 seconds for inspection. The latest palette is deep logo-purple and dark textured paper. Whole-building outlines show only the exterior silhouette through walls. `view=maintenance` places the actual shoulder camera inside the furnished workshop; `view=sewer` shows its approach. `view=dispatch` exposes an opt-in LISTEN button for the actual ready siren. Add `dispatch=busy` to inspect its off state. There is no automatic sound playback.

`view=streetlight` places the rat beneath an authored pole using the real shoulder camera. Compare `lighting=pools` (the new lower ambient/downlight trial) with `lighting=classic` (the exact previous lighting values). Both options also work in the full game and change only local presentation. Static screenshots are visual review, not input, multiplayer, sound or frame-rate validation.

Latest camera follow-up: `view=streetlight&rats` places three additional dark-coated rats at different distances along the curb. It is a visibility fixture only. Current evidence: [paperwork race and city lights](../../docs/verification/paperwork-race-city-lights-2026-09-09.md).

## Cheese and interior lighting review (September 9 night / September 10 UTC)

`assignment-fixture.html?assignment=closing-time&view=streetlight&cheese&held&remaining=95000` poses the actual shoulder camera with four shot columns, left to right: own yellow, own red Crossfire, enemy yellow with red-orange rim, enemy glowing red Crossfire. Each has ordinary and enlarged sizes. The street view leaves all four columns unobstructed. These are static presentation states, not gameplay inputs. Interior views also include `recordsinside`, `recordsupstairs`, `iceinside`, `needleinside`, `pumpinside`, `sluiceinside` and `maintenance`; `lighting=classic` provides the earlier lighting comparison. A Chain fixture with `confirm` shows its delivery score, relocated loose case and next landmark. `caseEvent=pickup|lost|taken|loose` triggers a contextual announcement after 500 ms; capture within its 2.8-second animation. See the [current implementation receipt](../../docs/verification/crossfire-case-banter-2026-09-10.md) and [earlier lighting/respawn checks](../../docs/verification/cheese-interior-delivery-2026-09-10.md).


### September 10 full scoreboard and local outline

Add `scoreboard` to an assignment fixture for a static full table over the actual camera. `roster=12` is the default; `roster=24` reviews a larger lobby and the compact rows. Use any of the three assignment IDs to check its mode column. Example: `assignment-fixture.html?assignment=chain-of-custody&view=recordsinside&held&scoreboard`. The fixture supplies posed sample stats; it does not simulate Tab or gameplay. Without `scoreboard`, `view=streetlight&rats&held` shows the local rat without an outline and three opponents with their existing outlines. See [the receipt](../../docs/verification/tab-scoreboard-local-outline-2026-09-10.md).

## September 12 shoulder-sleeve review

The workshop on port5196 defaults to `model=latest`: **New gun sleeve · original
case arm**. `model=original-arms` keeps the new outfit with both original arms;
`model=original` is the frozen release reference. The latest gun sleeve pivots at
its shoulder, with the original weapon aim/muzzle. Case, empty sleeve and no
sleeve remain separate options. See the [receipt](../../docs/verification/rat-shoulder-sleeve-2026-09-12.md).

## September 12 case-sleeve finish

The latest workshop mode is now **Matching sleeves**: accepted shoulder-pivot
pistol sleeve and a longer case sleeve with the same taper and linked cuff.
Use **Case / No case**. The empty sleeve option is removed; old `hand=empty`
links normalize to `hand=none`. The original comparison models remain.
See the [case-sleeve receipt](../../docs/verification/rat-case-sleeve-2026-09-12.md).

### Pickup restock art review

`/restock-fixture.html?mute=1` on the Vite visual development server renders the
production respawn dials at zero, half and 94% progress. Buttons switch between
flat street/interior palette backdrops and demonstrate opaque-wall occlusion.
This is a static art sheet, not a city or multiplayer gameplay fixture.
`/pickup-fixture.html?restock=1&mute=1` shows the dials at pickup scale beside rats.

### Permanent score card regression

`/score-card-fixture.html?assignment=chain-of-custody&mute=1` checks the production
HUD's computed visibility across all three assignments and five broadcast states.
Use `phase=briefing` for the new-case reveal, or `touch=1` for the touch stylesheet.
It reports PASS in the page and has no gameplay, networking or audio.


## Jurisdiction placement fixture — September 13

The static `assignment-fixture.html` accepts `assignment=jurisdiction` and a shared
zone ID in `zone`, for example `zone=pump-floor` or `zone=sewer-junction`.
`zoneMs=9000` shows the next-zone warning; `controls=touch&dispatch=rolling` checks
the compact permanent score card with a roulette card. `held` shows the carrier
pose. These are fixed camera/layout states, not gameplay or performance evidence.
Use `mute=1` for agent inspections. The geometry, renderer, guidance and HUD are
the implementation used by the matching private game. See the
[Jurisdiction receipt](../../docs/verification/jurisdiction-2026-09-13.md).


### Cameo placement inspection

`cameo-placement.html?mute=1` renders the two approved locations in the actual
city with production lighting. Rooftop/Maintenance select fixed cameras. This is
a static art inspection, with no gameplay socket, players or physics stepping.
See [game integration](../../docs/verification/superhero-cameos-2026-09-14.md) for
the separately frozen hosted human playtest.
