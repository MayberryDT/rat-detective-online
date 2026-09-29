# City overhaul plan

Status (2026-09-29): **approved; building on branch `city/overhaul`.** Tyler answered every open decision and handed over the whole build. This file owns the scope, order and acceptance of the city overhaul. The layout evidence and the measuring tools live in [the city map](city-map.md); the agreed design decisions are recorded under "City and building model overhaul" in [the juice plan](juice-plan.md).

**How it will be delivered (Tyler, 2026-09-29):** the whole plan in one run, not in rounds ("you're gonna one-shot it"), probably overnight. The plan must be complete and exact enough for that run to finish without questions. After it ships, the city map's data drives follow-up changes over the next week or more; each follow-up bumps the layout version.

## Authority and boundaries

- Work on branch `city/overhaul`. `main` stays releasable.
- Staging (`npm run deploy:staging`) and private preview fixtures are allowed during the run. **Production needs Tyler's explicit OK**, after he has played the preview.
- Previews use a frozen matching client and the hosted Worker with production server bots (6–9, humans on top, ten-rat cap). Agent browser checks stay muted (`&mute=1`); Tyler's playtests stay audible.
- The bot overhaul comes later and "will surprise us". This run only keeps today's bots working in the new city (they navigate every region, use launchers, reach supplies); it does not redesign how they play.
- Preserve everything in `AGENTS.md` that the plan does not explicitly change (camera, rat model, ball physics and lifetime, HP, pickups' effects, incidents, assignments' rules, audio mix, reconnect, protocol validation).

## Agreed design (summary; details in the juice plan)

- Keep the existing districts and their look; the city's size is right. Fill the north and north-west.
- **The docks** along the north edge: open fighting ground with long sightlines. Quays, four piers, cranes, container stacks.
- **The Panopticon precinct** in the north-west: a round cellblock of two or three floors around a central guard tower, with a brick front house on the −102 street.
  - Curved ring walls, so balls glance round the curve.
  - Cell bars that stop rats but not cheese.
  - The tower looks into every cell.
  - The front house holds the lobby, the bullpen, a dispatch radio room (Dispatch pillar), the front desk (Paper Chase destination), an evidence lockup (case spawn), an armoury (Ironclad) and the lineup room.
  - Most Wanted's searchlight sweeps from the tower.
- **Across the city:**
  - cut corners (45° faces) at junctions with a building behind them;
  - one angled bank wall inside each existing landmark;
  - a route from the Gate to the precinct;
  - a chute from Needleworks' upper floors to the street;
  - one or two Ironclad sites moved into fight areas.
- **Routes north:** sewer branches under the x −60 avenue (to the precinct yard) and under x 70 (to the docks); new street alleys north. No new launcher for the north.
- **Every region has a job** in every assignment: case spawns, supplies, Jurisdiction zones, Paper Chase destinations, Dispatch pillars.
- **Build from a kit of reusable parts**, and carry in the load-time lessons.
- **Fix:** rats clipping through roofs at launcher landings and roof pickups.

## What the layout touches today (inventory, 2026-09-29)

About 58 source files import the layout modules, and 69 test files import them too (54 client, 11 visual, 4 worker); many pin counts or coordinates.

| Area | Main files | Layout assumption |
| --- | --- | --- |
| Layout data | `src/shared/grayboxLayout.ts` (`GrayboxBox`, `GRAYBOX_VERSION` 2), `cityPlan.ts` (`CITY_STREETS`, `cityStreetBuildings`), `landmarkLayout.ts` (438 lines: interiors, floors, stairs, furnishings), `sewerLayout.ts` (260), `streetLampLayout.ts`, `streetDebris.ts`, `vehicleLayout.ts`, `playerSpawns.ts`, `worldSpec.ts` (`WORLD_LAYOUT_VERSION` 1, seed) | Boxes carry `rx`/`rz` tilt only; **no yaw**. Five named landmarks. |
| Physics | `ChaosSimulation.ts`, `StaticCityBroadphase.ts` (`addCityBody`), `SpatialRayQuery.ts` | Cannon bodies and AABBs handle any rotation; the box-to-body conversion only sets `rx`/`rz`. |
| Rendering | `src/prototype/Neighborhood.ts` (415), `LandmarkArchitecture.ts` (511), `src/world/CityGenerator.ts` (852), `CityGrime.ts`, `FacadeBeams.ts`, `StreetReadability.ts` (street-spill atlas), `InteriorLighting.ts`, `SewerLighting.ts`, `SewerPortals.ts` | Facades, windows, beams and the spill atlas are built per axis-aligned face. |
| Feel | `src/feel/NoirAtmosphere.ts`, `NoirDressing.ts`, `FeelSound.ts`, `CityReactions.ts` | Read `LANDMARK_INTERIORS` and `CITY_STREETS` by name. |
| Gameplay placements | `chaosState.ts` (`CASE_SPAWNS`, `DISPATCH_STATIONS`, `LAUNCH_MACHINES`), `pickups.ts` (`PICKUP_ANCHORS`), `jurisdictionZones.ts`, `assignments.ts` (`ASSIGNMENT_DESTINATIONS`) | Hand-placed coordinates. |
| Bots | `BotNavigation.ts` (2-unit walk grid from boxes; `Solid` stores tilt only), `BotLaunchRoutes.ts` (`ROOF_LANDINGS` per landmark), `BotZoneHolding.ts`, `ServerBotController.ts` | No yaw; roof landings keyed by landmark. |
| City map | `src/shared/city/places.ts`, `frame.ts`, `model.ts` (`layoutVersion` = `GRAYBOX_VERSION`), `src/map/` (was `src/heatmap/main.ts`), `output/city-map/map.ts` | Place names come from streets and landmarks. |

## Workstreams

Each workstream lists what it delivers and how it is proven. The order is the build order; later workstreams depend on earlier ones.

### W0. Baseline and branch
- Record before-numbers on the current production build, and keep them in the final receipt:
  - load time to Enter and to the first frame, cold and warm;
  - linked shader programs (about 145, 64 heavy);
  - draw calls and fps in the capacity render fixture;
  - collision box count (1,411), fixed body count and nav-graph build time;
  - server tick with `scripts/benchmark-server-tick.mjs` (idle and a 120-ball burst);
  - the city digest for the last days: deaths by district, banked-hit share, Ironclad claims, spawn traps, landing clips.
- Create branch `city/overhaul`.

### W1. Layout format: yaw, curves and bars
- Add yaw (`ry`) to `GrayboxBox`. Carry it through every consumer:
  - the box-to-body conversion and the rendered mesh;
  - `BotNavigation`'s `Solid` and its clearance probes;
  - the ramp and stair helpers in `landmarkLayout.ts`;
  - spawn and pickup clearance;
  - the sight checks used by the recorder;
  - facade windows, beams and the spill atlas: angled faces get windows, or are marked plain;
  - `places.ts` and the heat map drawing.
- Curved walls are rings of yawed segments, built by one kit part. Choose the segment count by measurement: enough that a glancing ball rides the curve, few enough to stay cheap.
- Bars: thin posts spaced wider than a ball and narrower than a rat.
- Proof (tests written before the code, failure modes first):
  - a ball bounces off a 45° face at the mirror angle, in the server simulation and the client prediction alike;
  - a rat cannot pass the bars, and a ball can;
  - a ball fired along the ring wall at a shallow angle follows it round;
  - nav cells next to a yawed wall are blocked exactly where the wall is.

### W2. The kit of parts
- `src/shared/city/kit/`: a part is a function from parameters to one bundle containing:
  - collision boxes;
  - render instances (shared materials, instanced where repeated);
  - light fixtures;
  - places;
  - slots for case spawns, supplies, pillars, zones, destinations and spawn points;
  - nav hints;
  - bank faces (angled or curved surfaces worth learning).
- Parts:
  - plain block, and chamfered block;
  - landmark shell: floors, stairs, doors, windows;
  - ring cellblock, cell with bars, guard tower;
  - pier, quay, container stack, crane;
  - warehouse;
  - chute;
  - bank wall;
  - sewer hall, sewer branch and exit.
- The city becomes one declarative plan: districts, then parts with parameters.
- **Open (decision D2):** rebuild the existing districts on the kit with the same look, or add kit parts beside the existing generators.
- Proof: the kit renders the existing city with the same collision (same box set, or a documented difference) and the same look (visual fixture diff), before any new district is added.

### W3. Changes to the existing city
- **Cut corners:** at every junction corner with a building behind it, a 6-unit 45° face (the planning map computes the set). Keep sidewalks, lamps and doors clear.
  - Done: `cityStreetBuildings` marks `chamfers` on tenement footprints (15 cuts in the current layout; skipped where a pillar, launcher or spawn stands in front of the face, the building is under 9 units, or a street does not run on past the corner). `buildingColliders` (skyline.ts) is the one collider set for server and client: the L remainder as axis boxes plus one yawed box on the cut. Each face is a corner shop (door, plate glass, canopy, neon or painted fascia and blade sign, door spill), names in `src/world/cornerShops.ts`.
- **Bank walls:** one angled wall per landmark:
  - Records: a slanted shelf wall;
  - Icebox: an angled loading bay;
  - Needleworks: angled cutting tables;
  - Pumping Station: a slanted pipe wall.
  Placed from each interior's fight lines.
  - Done: kit part `bankWalls` (`BANK_WALLS`), one collider each on the ground floor, yawed 35–43°: Records' oak archive stack under the reading-hall atrium (9 × 3.6), the Icebox's poured loading-bay wall inside the south door (10 × 3, clear of the east cross passage at z −48), Needleworks' pattern screens with a cutting table (9 × 3.2, the table 1.1 high) between the east door and the factory-floor zone, and the Pumping Station's rack of mains across the north-east corner (9 × 3.2). `test/client/bankWalls.test.ts` walks every door to every other door, each floor, and every supply, case spawn and zone post in the landmark.
- **Gate to precinct:** a street from the Gate's north end (x −137) to the −102 street, replacing the buildings in its way.
  - Done: kit part `gateLane`. Wet setts with a gutter and puddles, a brick arch with a lantern and the street name at the north mouth (8 units clear), fire escapes (landings are colliders), washing lines and a power cable, chain-link across the east side alley (a 2.6-unit squeeze gap by the south wall), two dumpsters against the walls, a PAWN neon and a painted laundry sign.
- **Needleworks chute:** from floors 8 and 16 to the street on the north side. Rats and a loose case both ride it. The case must never stay stuck upstairs.
  - Done: kit part `needleworksChutes` (`chute.ts`). Two enclosed 38° canvas slides from hatches on floors 8 and 16 at x −111.4 and −106.8, out through the north wall (openings cut in `landmarkLayout.ts` and the facade) and down the alley to the pavement at z 47 and 36.7, with a striped hood, a canvas mat and heaps of fabric bolts at the foot. Every rideable surface is `slick`: `SLICK_MATERIAL` on the body, a frictionless contact material against the case in the server simulation (rat worlds are already frictionless), and while a rat touches it the client controller, local bots and server bots stop steering, braking and jumping (`touchingSlick`). The 38° bed is too steep for the walk graph, so bots never plan into a chute; `landmarkExitPoint` ignores the mouths. `test/client/needleworksChute.test.ts`: a rat reaches the street from either floor with no key held, a loose case from floor 16, both inside 3.5 s.
- **Ironclad:** one site to the precinct armoury, one beside the Records forecourt. Decide which current sites move.
  - Done: the Gate bridge roof site becomes `alibi-records-forecourt` at (8, −12), on the street east of the Records forecourt, outside every zone and 42 units from the Records upstairs armor. The sewer maintenance site is removed; the precinct armoury site comes with the precinct's job slots. Four Ironclad sites until then.
- **Roof clipping fix:** launcher landings and roof pickups never leave a rat inside roof geometry. Add a test at every landing and roof pickup.
  - Done. Cause: a launcher fall reaches about 100 u/s, 1.7 units per step on the client (60 Hz) and 3.3 on the server bots (30 Hz). Cannon's discrete contacts let the foot sphere sink up to 2.9 units into a thick roof before pushing it out (the recorder counts a clip at 0.75) and carry it straight through thin slabs. Fix: `guardFastFall` (`ratSurfaces.ts`), called by all three rat controllers before each step, looks down the column the body will fall through this step and slows the fall to arrive on the floor. `test/client/roofLandings.test.ts` drops a rat at 40–100 u/s at both step rates onto every launcher landing and roof supply: it never sinks 0.4 and ends on top.

### W4. The docks
- Quays along the north edge, four piers, cranes (climbable?), container stacks forming lanes, one or two warehouses.
- Water beyond the quays.
- **Open (decision D1):** is the water a hazard, or just the edge of the map?
- Long sightlines with enough cover to cross them.
- Jobs: a Paper Chase destination (harbour master?), case spawns, a Jurisdiction zone (the quay), supplies, a Dispatch pillar, spawn points.
- Sewer branch under x 70 ending at the docks.
- **As built (kit part `docks`, `src/shared/city/kit/parts/docks*.ts`):** three timber piers (x −18, 18, 70) to z −193; the freighter *Marlowe* in the berth (gangway, main deck y 4, bridge deck y 9, wheelhouse roof y 13.3); two gantry cranes with a stair tower to the boom walkway (y 18.6); the container yard; the Pier 9 warehouse (mezzanine y 5.6, harbour master's office); the east breakwater and lighthouse; a dressed sea wall on the harbour's outer edges. Every stair climbs at most about 22°: steeper ramps are not walkable for rats or bots. Job slots are exported as `DOCKS_JOBS`; its Hot Pursuit on the quay replaces `pursuit-north-avenue`.
- **Water (D1):** the client draws `kitCity().water` with `HarbourWater` (one standard material, drifting ripple normals, baked glints and foam). The server drowns a living rat whose feet are inside a water rectangle below `DROWN_Y` (`drowned()` in `city.ts`, checked on every movement report, humans and server bots): no credit, a death, cause `drowned` on the wire (`city` in the recorder) and a harbour joke in the feed. Spawns keep 2 units clear of the water; cases and corpses that sink below y −9 are recovered or cleared.

### W5. The Panopticon precinct
- Front house on the −102 street:
  - lobby with the front desk (Paper Chase destination);
  - bullpen;
  - dispatch radio room (Dispatch pillar);
  - evidence lockup (case spawn);
  - armoury (Ironclad);
  - lineup room with the height chart.
- Ring cellblock of two or three floors, with cells with bars, walkways, stairs, the yard, and a central guard tower with a searchlight. The tower sees every cell.
- Sewer exit in the yard (the x −60 branch).
- Jobs: a Jurisdiction zone (the yard or the tower?), case spawns, supplies, a pillar.
- **Open (decision D3):** does the round-end lineup move into the real precinct lineup room? Today it sits in a room 320 units below the city.
- Most Wanted's searchlight comes from the tower.
- **As built (kit part `precinct`, `src/shared/city/kit/parts/precinct.ts`):**
  - The house: brick with stone trim, a portico with the POLICE sign and twin police globes, barred ground-floor windows and a lit POLICE · PRECINCT 13 sign on the roof. Ground floor: lobby and front desk, evidence lockup (a wire cage), the hall to the cellblock gate, and the lineup room with its observation room. Floor 8: dispatch radio room and bullpen. Floor 16: armoury and detective bureau. A switchback stair (flights of 4 over 10, about 22°) climbs to a fenced roof with a stair hut.
  - The ring: 40 wall chords (balls ride the curve in a string of chords, out in the cells), three tiers of 20 cells with bar partitions and fronts (ground-floor cells all open; upper tiers every third), galleries 10 to 15.2 from the centre, three ground-floor gates (east toward the sewer ramp, west to the street, south to the house). Iron flights cross the yard either side of the tower (0→8 and 8→16, 8 over 20); the ring roof is reached by a footbridge from the house roof.
  - The tower: a shaft to a lit lookout at y 19, reached by a bridge from gallery 16 between two cells; a searchlight drum on top. From the lookout every upper-tier cell is in sight; the ground-tier cells are hidden under gallery 8.
  - The lineup (D3): `PoliceLineup` stands the rats on the lineup room's stage (`PRECINCT_LINEUP`) against the height chart; the room is closed (glass stops rats and balls), so no live rat can walk into the shot.
  - Job slots are exported as `PRECINCT_JOBS`. Most Wanted's searchlight still comes from the sky: a beam from the tower would cross the whole city through walls to reach a leader far away.

### W6. Jobs, placements and routes, city-wide
- Rebalance case spawns (20 today), supply sites (14), pillars (9), Jurisdiction zones (6), Paper Chase destinations (6) and spawn points (about 820, generated) across all regions, so none is empty in any assignment.
- Sewer branches, exits and their lamps must stay within the eight pooled sewer lights.
- New street alleys north (x −20 and x 120).
- Street names for guidance and places.
- Proof: a static analysis per region (every job present, every site clear and reachable on foot from a spawn), and a bot-only soak on staging.
- **As built (the registries):**
  - `DOCKS_JOBS` and `PRECINCT_JOBS` are spliced into `CASE_SPAWNS` and `DISPATCH_STATIONS` (`chaosState.ts`), `PICKUP_ANCHORS` (`pickups.ts`), `JURISDICTION_ZONES` (`jurisdictionZones.ts`, ids `the-quay` and `precinct-yard`) and `ASSIGNMENT_DESTINATIONS` / `CHAIN_ROUTE` (`assignments.ts`, ids `harbour-master` and `precinct`). The registries import the part files; the parts import only types from them. Existing ids are unchanged; `pursuit-north-avenue` is gone (the quay's `pursuit-quay-west` replaces it).
  - Gaps filled: a Gate Lane case spawn (−137, −40); three zones, `gate-lane` (the lane round the side-alley crossing, west), `south-crossing` (where the −60 avenue meets the south avenue, south) and `pier9-floor` (Pier 9's open bay under the roof trusses, enclosed, north-east); a `south-avenue` pillar at (28, 126).
  - Moved to pass the simulation's own clearance check (the case's loose size against collider bounds), which had silently dropped them: the geyser-side spawn (−150, 18) to z 17, the Marlowe's deck spawn to x 119, the drunk-tank spawn to 16.6 from the ring's centre. The yard Quick Fix sits in the lane between the south stacks (−14, −117.5), an alley like every street Quick Fix.
  - Totals: 30 case spawns, 16 supply sites (5 Ironclad, 4 Hot Pursuit, 7 Quick Fix), 12 pillars, 11 zones (7 outdoor, 4 enclosed), 8 destinations.
  - Jurisdiction bags: each bag holds every zone once. The larger category opens every bag and the smaller is spread through it, never twice running; equal categories alternate strictly, as before. Stored bags are checked against that pattern and the zone count; a room stored with the old six-zone bag or six-stop route drops that assignment state (protocol 23 already breaks old rooms).
  - Street directions: guidance gives the destination or zone, and the sewer's via labels; there is no street-name table, so nothing to add.
  - Jobs per district (thirds of the city, `districtAt`); case spawns counted, other jobs named:

    | District | Case spawns | Supplies | Pillars | Zones | Destinations | Launchers |
    | --- | --- | --- | --- | --- | --- | --- |
    | north-west | 4 | alibi-precinct-armoury, fix-precinct-infirmary | precinct | precinct-yard | precinct | — |
    | north | 4 | fix-container-yard, pursuit-quay-west | avenue-west | the-quay | — | — |
    | north-east | 2 | alibi-icebox-upper | avenue-east, quay | pier9-floor | harbour-master | — |
    | west | 4 | pursuit-gate-mouth, fix-gate-lane | gate | gate-lane | sluice | geyser |
    | centre | 5 | alibi-records-upper, alibi-records-forecourt, fix-crossroads-west, fix-crossroads-east | records, sewer | records-forecourt, sewer-junction | records | dumpster |
    | east | 4 | pursuit-icebox-mouth, fix-icebox-alley | icebox, crossroads | icebox-yard, central-crossroads | icebox, maintenance | freight, fan |
    | south-west | 2 | pursuit-south-avenue | needleworks | needleworks-floor | needleworks | mousetrap |
    | south | 1 | fix-south-central | south-avenue | south-crossing | — | — |
    | south-east | 4 | alibi-pump-roof | pump | pump-floor | pump | pressure |

  - Every district has a case spawn, a supply site and a pillar (live in every assignment) and a Jurisdiction zone. Still open: no Paper Chase destination in the north or the south (neither has an enterable room), and no launcher in the north-west, north, north-east or south.
  - Proof: `test/client/cityJobs.test.ts` (every district's jobs; every case spawn supported and clear at the loose size; every new slot, zone post and approach walked to by `BotNavigation` from a street spawn; every destination entered from its approach), with the registry, zone, placement, bot-route and assignment suites on Halla.

### W7. Lighting and atmosphere for the new city
- Street lamps, windows, signs, fixtures and facade beams in the docks and the precinct, within today's light budget (the four-spot actor pool, the fixture batches).
- Harbour water surface and fog.
- The tower searchlight.
- Noir dressing and interiors for `NoirAtmosphere`, `NoirDressing`, `FeelSound` (surfaces, rooms) and `CityReactions`.
- **As built (the bake and the fixtures):**
  - One steady bake lights the graybox and the kit alike: `FixedLightField` (`src/prototype/FixedLighting.ts`) holds every baked source (street lamps with the kit's, stair lights, the old fixed lights, landmark and kit room fixtures, outdoor kit fixtures) on a 16-unit grid. A room fixture lights only its room (the innermost room holding the point: a harbour master's office inside a warehouse is its own room, `lightRoomAt`) and floor band, inside its cone; an outdoor kit fixture never lights a room; each channel clamps at 0.12 × the authored gain, as before. `Neighborhood` builds the field once all sources are known and bakes both with it.
  - `KitArchitecture.build(field)` bakes every piece that does not glow, one merged mesh per finish and shadow role. Surfaces (a side of 2 and another of 0.5) and beams of 8 or more get real vertices, cut every 3 units where a pool falls unevenly on them, with light per vertex; small boxes take one light each; small round fittings (bars, posts) stay instanced with one light each. The light takes the finish's hue (`bakeTint`), so a green container stays green under a sodium lamp. Painted signs show the light that falls on them. Kit materials use the graybox patch and its cache key (`applyFixedIllumination`), so they share its programs. Nothing runs per frame.
  - The street-spill atlas also takes pools from outdoor kit fixtures below y 20 (`pool:false` for a fitting inside the part's own shell, such as the chute bulb) and spill from kit openings (`KitBuilder.spill`: Pier 9's four doors, the precinct's front door and every steady lit ground-floor window of a kit facade). Kit spills are also actor-spot candidates and facade-beam sources; the kit draws the openings.
  - Fixtures added: caged bulbs under Pier 9's mezzanine; floods round the tower's foot for the precinct yard; three stage lights over the lineup chart; lamps on the ring's parapet; the Marlowe's house-door lamp, masthead and derrick cargo lamp; a gooseneck in Gate Lane at the side-alley crossing; a bulb halfway down each chute. A kit room fixture less than 1.2 under its ceiling hangs as a compact caged fitting, not a wide shade.
  - `lighting=classic` bakes the kit from the classic source set (no room fixtures, no room filtering), like the graybox.
  - Cost (city view, `test/visual/city-view.ts`, Halla, 8 views): programs never more than +1 (31 in the overview, as before), draws the same or fewer (756 against 760 in the overview, 242 in the docks as before), triangles about +70,000 (6–8%), city build about +0.2 s in Node (CityGenerator stubbed).

### W8. Optimization, folded into the build
- **Load-time lessons:**
  - fold the city's shader patches into a few shared city materials;
  - a sewer lighting design that does not double every lit program;
  - bake the spill atlas, fixed illumination and facade beams offline or cache them, not on every page load (about 1–1.4 s of desktop CPU today);
  - stand-ins in `createGame` for everything the welcome creates, so no program links after Enter;
  - compress or lazy-load the cameo models (870 KB, served uncompressed).
- **Budgets for new geometry:** instanced kit parts, draw calls and collision bodies measured against W0. The new districts must not lower fps or raise load time on the fixture.
- **Server:**
  - the tick with the new collision set;
  - the recorder's cost down to 1% of the tick or less (build frames less often);
  - the nav-graph build time.
- **Tools:** `scripts/city-mirror.mjs` takes about 310 s and failed twice; make it fast and reliable.
- **As built (decision D5, shadows):** `src/session/shadows.ts`.
  - The moon's map covers the whole city, north included. It is drawn once, then again only when a city is built (`StaticMoonShadow.adoptCity`: the title's prepared city, the constructor, a rebuild for a new room). Only the adopted city casts into it: large kit solids, graybox buildings, parked vehicles. `fitMoonShadow` sizes it at about 0.15 m per texel, as before (3,584 × 3,136 for this city, capped at 4,096). It keeps world up, so the texel grid lies at 45° to the streets and shadow edges step one texel at a time; the tightest rectangle turned the grid a few degrees off the streets and drew long stairs.
  - Rats, corpses and the loose case are grounded by `ContactShadows` instead: one instanced draw of soft discs. Each disc sits on the static ground, found by a short ray only when its thing moves, and fades and widens with height. The flashlight's small per-frame map is unchanged.
  - The disc mesh is a scene child from the start, so the warm-up compiles it. The first render after the warm-up, before Enter, draws the moon map with the depth programs the flashlight also uses. `lighting=classic` is unchanged.
  - Cost (Halla, `capacity-render.html`, 9 batched rats plus noir, against HEAD, runs interleaved): GPU median 11.9–12.3 to 10.1–10.2 ms; draws 1,046 to 729; triangles 1.86 M to 1.47 M. With 16 corpses: 12.8–13.2 to 10.8–10.9 ms; draws 1,190 to 825. The main thread stays saturated, and Halla was shared, so CPU is noisy: busy CPU per frame is about the same with rats (22.1 to 22.2 ms in the quietest pair) and 0.4–6 ms lower with corpses. The moon map costs about 90 MB of GPU memory (depth plus the render target's colour), against 34 MB for the old 2,048² map.
- **As built (recorder, mirror, cameos):**
  - `benchmark-server-tick.mjs --city` now builds the recorder as `GameRoom` does: the live layout (`GRAYBOX_VERSION`; version 2 had become the retired procedural city), `GameRoom`'s solids filter, line of sight through the chaos world, and the shot hook's time counted as recorder time. It reports `citySharePct` (ticks 300 on) and hashes of every fact, event and aggregate total, so a change can prove it recorded the same things. `--human` counts rd-ai-0 as a connected human (1 Hz frames).
  - Recorder (`CityRecorder.ts`, `HeatMap.ts`, `SpatialRayQuery.ts`): cells counted by number (`heatCellIndex`), counts tallied without building key strings, `inside` through a grid of the solids, bots' shots and each tick's ball results queued and recorded in one pass when something reads them (a frame, a spawn, a case change, a round change, a hit or pickup that starts a life, a flush). Sight uses `SpatialRayQuery.blocked`: any hit, on a flat tree built by surface area (`closest` keeps its tree, whose order decides ties), and `refresh` no longer rescans every city body when only a rat or ball came or went. Same sampling (1 Hz with a human, 5 s bot-only, 5 Hz windows 3 s before to 2 s after a hit).
  - Measured on Halla, current tree, 9 bots, 5,400 ticks, interleaved with HEAD: bot-only 2.7–2.9% of the tick to 1.5–1.7%; with a human 5.4–5.6% to 2.9–3.0%; burst with a human 5.2% to 3.0%. Trajectory, fact, event and aggregate hashes identical in all three. A sight ray: about 3 µs to 1.3 µs. Not yet at 1%: what is left is spread thin (the per-tick position copy the hit places need, the 5 Hz samples and world watch, frame building), and a recorder that does nothing still measures 0.2%.
  - `scripts/city-mirror.mjs`: the old run spent 807 of its 870 s inserting heat cells one autocommit at a time. The model and aggregates now replace their tables in one transaction; archive objects download six at a time, stream through gunzip into SQL and each commits with its mark, so a failed run keeps what it finished and a rerun fetches only the rest; retries with backoff on network errors, timeouts, 5xx and 429; errors name the request, the status and the cause. Production (100 objects, 56,033 facts, 70,308 aggregate rows): 870 s to 4.8 s from empty; 1.0 s with nothing new. `--out`, `--concurrency`, `--backoff-ms`; test `test/scripts/cityMirror.test.mjs`.
  - Cameos: the game ships `src/assets/cameos/*.glb.gz` (GNU `gzip -9 -n`, written by the exporter), unpacked by the browser's `DecompressionStream` in `readCameoAsset`, no decoder library. Transfer 870,208 to 280,844 bytes (spider 533,188 to 186,485, bat 337,020 to 94,359); the GLBs are byte-identical after unpacking, and `cameo-preview.html` (now in the visual build, loading the game's copies) screenshots byte-identical before and after.

- **As built (load time, 2026-09-29, partial):**
  - **Sewer lamps: two variants kept.** A tried design kept the eight lamps visible and black above ground, with a shader test on uniforms that skipped black point lights. It needed one program per material, but it cost GPU time on Halla (9-rat fixture, interleaved, 2 runs each): street 9.94/10.01 → 10.21/10.30 ms, sewer 18.50/18.52 → 18.89/19.12 ms. It was reverted. The lamps stay hidden above ground and both light variants are warmed, as the September 28 rule says.
  - **Folded key.** `StreetReadability.apply` keys the spill patch without the surface lift, which was already a uniform. Pavement, curbs, stairs and obstacles share one program per base material.
  - **Stand-ins and eager pools.**
    - `createGame` adds these stand-ins: a `CaseBeacon`, a `JurisdictionZones`, a supply restock dial (`PickupRespawnVisual`) and a one-instance `createShotDraws` set. The set holds ChaosView's balls, Crossfire and danger glows and trails, and the missile trail, with instance colours allocated from the start.
    - After the moon-map render, `createGame` renders twice more, with the lamps hidden and then shown. The stand-ins sit behind the camera and are never culled, so the flashlight's shadow pass links their depth programs before Enter.
    - The prepared stand-ins now live until the session ends. Before, they were released at the first frame, and the lineup, powerup and Hunch-sketch programs relinked in play. `GameSession` only marks `city-first-play-frame` there now.
    - These are now built up front, hidden: every zone's draws in `JurisdictionZones`; one Surge vent in `PressureMachine`; the pools, blasts and crater decals in `LaunchJuice` and `LaunchBlast` (`noNoir`; the crater texture is painted on the first landing over a blank texel); and a warm line for the Hunch trails.
    - `RatPowerupEffects` stays in the scene, hidden when idle.
  - **Street lamps.** The four harbour lamps stand on the quay wall's kerb row (z −172.6), like the other quay lamps, instead of 1.4 units into Quay Road. `streetLampLayout.test.ts` checks kit lamps (pier heads, breakwater, precinct grounds) for "outside every street and building, on a deck". Kerb lamps are still checked for "beside a curb".
  - **Measured.**
    - Setup: Halla, headless Chrome with gl-egl, a local frozen build, and the hosted staging Worker (deployed from HEAD) through a throwaway relay. A hook on `linkProgram` counted links; a diagnostic build exposed the renderer and session.
    - Links after Enter in 20 s of play: **5–8 → 1**. The one left is the skinned depth program without the lamps, at the first frame.
    - Forced launch, landing, trigger, surge, kills, lightning, powerups and the lineup now link **0** programs; before these changes they linked 7 or more.
    - Program links for the whole load: **160–170 → 183**, against a baseline of 153–154. The stand-ins that now live all session and the depth warm-up add programs, and the two sewer-lamp variants double every lit one. The program-count target is **not met**.
    - Warm load: title 0.15 s; Enter-ready 3.75–4.17 s → 4.55 s; first gameplay frame 5.25–6.56 s → 5.68 s (one run after the changes).
    - Same-view screenshots from `city-view.html` (10 views) and the capacity fixture with rats are in `~/.cache/rd-shots/w8/`. The mean absolute difference is 0.69–0.94 levels in every view, with at most 0.95% of pixels past the diff threshold (quay, where the lamps moved). The rat scene differs by 1.78, because its rats move.
  - **Not done:**
    - The bake cache. The warm-load profile gives what it would save: spill atlas ≈80 ms, facade beams ≈265 ms, graybox bake 138 ms plus batching 128 ms, kit bake ≈270 ms. The design is an IndexedDB record of those outputs, keyed by layout version, seed, lighting mode, the readability flag and the chunk URL, holding at most two entries.
    - The last link after Enter.
    - The program count.

### W9. City map and data
- `layoutVersion` 3, with the world version and protocol bumped together (protocol 23).
- Place IDs stay stable where places still exist. Ship an old-to-new mapping for the rest, and add the new places (docks, precinct floors and cells, the chute, the new streets).
- Regenerate the planning map data. `/heatmap` draws layout 3.
- Record the new mechanics as facts: chute rides, bar-blocked and bar-passed balls, ring bank hits, tower time.
- **Decision D4:** the city map page's steps 4–6 (Observe, Analyse and Design modes at `/map`) are part of this run.
- **As built (the city map, D4):**
  - **Places** (`src/shared/city/places.ts`, 262 in layout 3): quay stretches split where streets meet the quay, each pier and the breakwater, the freighter's deck and bridge, the harbour water (anything below quay level over it), the container yard and the stack tops, Pier 9's floor, catwalk and roof, the precinct house and the cellblock by floor (0, 8, 16, roof), the cellblock yard and grounds, the tower stairs and lookout, the crane walkways, both sewer exits, Gate Lane and Quay Road stretches, the two Needleworks chutes (a rider on the slope, not the alley under it), and one place per north kit room from `kitCity().rooms` (a room wins over its floor). Layout-2 streets, junctions, landmarks and sewer halls keep their IDs; lots and rooftops keep theirs while their group still holds its layout-2 anchor cell (`legacyPlaces.ts`), and the 17 retired ones map to where that ground now lies (`successor`). A place spanning districts is filed at its centre. The snapshot `design/city/layouts/layout-2.json` (footprints, street colliders, the 196 places) keeps layout 2 drawable and testable.
  - **The page** `/map` (`map.html`, `src/map/`; `/heatmap` and `/heatmap.html` answer a 301 to `/map` with the query kept, `run_worker_first` lists `/heatmap`; `src/heatmap/` and `heatmap.html` are gone): Observe (recorded layers as cells or places, by floor, range, layout and assignment, flows, overlays, place cards), Analyse (static analyses from `src/shared/city/analysis.ts` and per-place measures with 95% intervals, hidden under the minimums, plus the digest) and Design (proposals from `design/city/proposals/`, the footprint diff against the baseline snapshot, both layouts' static analyses, verdicts from `src/shared/city/verdict.ts`). Details in [the city map](city-map.md#the-page).
  - **The first proposal** `proposal:overhaul-v3` states the overhaul's goals and five predictions (north share of human time up, banked-hit share up, the west's share of deaths up, the case's Needleworks-upstairs share down, Ironclad claims per rat-hour up). All wait for play: production is still layout 2 (20 human minutes on the public places counts, 2026-09-29).
  - **What the layout alone says, layout 2 → 3** (street level, 1-unit grid): walkable ground 91,233 → 100,755 u², the north third's share 25% → 32%, cut-off ground 0% → 0.2%, median ground in view 6,096 → 7,127 u², median longest sightline 166 → 158 units, median cover density 7.7% → 5.9%. The new city is more open than the old one; that is a prior for the banked-hit and danger predictions, not a verdict.
  - Proof: `test/client/cityPlaces.test.ts` (the north named piece by piece, every layout-2 ID resolving), `cityAnalysis.test.ts` and `cityVerdict.test.ts` (failure modes first), the `/map` and `/heatmap` routing case in `test/worker/worker.test.ts`; screenshots of all three modes against production's public data.
  - Not built: round timelines on the page (round facts need the token), routes through stairs, sewer and launchers in the travel field, and the vertical-access table.

### W10. Tests, verification and release
- Update the layout-pinned tests. Delete incidental pins (counts, coordinates) and keep the behaviour: reachability, clearance, spawn safety, protocol.
- New failure-first tests from W1, W3 and W6.
- E2E:
  - a bot-only soak of the new city on staging;
  - the city digest after it: no stuck anomalies, landing clips 0, deaths in every district, bots reach every region;
  - muted screenshots of every new area.
- The repeatable artifact is a receipt holding the W0 before-numbers, the after-numbers, the digest comparison and the screenshots.
- Full checks: `npm run typecheck`, the worker, client and script suites, `npm run build`.
- A private preview fixture for Tyler's playtest. Production only on his OK.
- Update the docs:
  - `docs/current-state.md`, `AGENTS.md`, `docs/city-map.md`, `docs/live-service.md` and the juice plan;
  - the Halla copy of `AGENTS.md`;
  - a Chartroom session log.

## Technical design (the contract every slice builds on)

### The kit
- `src/shared/boxFrame.ts`: a city box may be yawed (`ry`). Rotation is Euler order YXZ (yaw first, then the `rx`/`rz` tilt of ramps in the yawed frame); with `ry` 0 it equals the old poses. `boxQuaternion`, `boxBasis`, `boxHalfExtents`, `toBoxLocal`, `fromBoxLocal`. `CITY_BARS_GROUP` (32).
- `GrayboxBox` gains `ry?`, `passBalls?` (cell bars: bodies in group 32, which rats and bots collide with but cheese sweeps, sight and cases ignore) and `slick?` (frictionless: chutes).
- Every static city body is built by `cityBoxBody(box)` in `src/shared/StaticCityBroadphase.ts` (server simulation, server bots, local bots and the client).
- `src/shared/city/kit/kit.ts`: `KitBuilder` with `collide` (collider only), `piece` (look only), `solid` (both), `wall` (between two plan points, any angle), `ring` (curved wall of chords with door gaps), `bars`, `slab`, `stair` (any heading: hidden ramp plus treads and stringers), `facade` (piers, cornices and window rows along any wall line), `fixture` (baked light), `sign` (canvas sign), `room` (lighting room), `lamp` (street lamp site), and `water`. Finishes are a fixed palette (`FINISH_COLORS`); glowing finishes are emissive.
- `src/shared/city/kit/city.ts`: `kitCity({visuals})` runs every registered part once (cached). `visuals:false` skips the look for the server and bots. Parts are listed in `PARTS`.
- Consumers: `grayboxBoxes` appends the kit colliders; `STREET_LAMPS` appends kit lamps; `LIGHT_ROOMS` appends kit rooms; interior fixtures in a kit room become interior fixtures; outdoor kit fixtures become baked lights and actor-spot candidates; `src/prototype/KitArchitecture.ts` draws every piece (one instanced mesh per finish, shape and shadow role) and the signs.
- `src/shared/city/kit/northPlan.ts`: the north's fixed numbers (quay edge z −172, water surface y −2.2, drown below y −1.6, sea floor y −12; the docks lot, the quay, the precinct lot, house and ring). Leaf module.
- **Rules for parts:**
  - A part file imports only leaf modules (`kit.ts`, `northPlan.ts`, `boxFrame.ts`, `networkProtocol` types), never `grayboxLayout`, `chaosState` or `cityPlan`, which import the kit and would make a cycle.
  - A part is deterministic and seed-independent.
  - A part's gameplay slots (case spawns, supply sites, pillars, zones, destinations) are exported as plain data from its own file, typed like the registries. The integration owner adds them to the registries.

### Layout 3 streets
- `CITY_STREETS` changes:
  - avenues that ran north end at the quay (z −172);
  - Quay Road (the apron, x −40…166, z −172…−150) and Gate Lane (x −137, z −102…−35) are new.
- Tenements are still cut from the layout-2 street list, so surviving buildings keep their footprint and height. Buildings in the harbour, docks or precinct lots go; buildings crossed by a new lane are trimmed to the parts beside it (slivers under 9 units go).
- There is no pavement north of the quay edge. The harbour part adds the sea floor, the quay's stone face and the water rectangle.

### Style and budgets
- Noir, Rat Detective: dark masonry and iron, wet concrete, sparse warm windows, a few neon and police-blue accents, fog. Signs are short and period (1940s).
- No new live lights: light comes from baked fixtures, emissive panes and signs, the street-spill atlas and the four pooled actor spots.
- Build from the instanced pieces and the shared finish materials; no new shader programs per part; no per-frame allocation.
- Large solids cast shadows; fittings do not.
- Every walkable surface has a collider. Every collider the player can see has a look. Nothing a rat can reach clips through a roof.

## Decisions (Tyler, 2026-09-29, final: "no more questions")

- **D1 Water kills.** A rat that falls into the harbour dies and respawns normally. The death credits nobody (cause `city`, a drowning joke in the feed).
- **D2 Rebuild everything on the kit.** Every district, including the existing ones, is built from kit parts ("we have to do it right").
- **D3 The lineup moves** into the precinct's real lineup room.
- **D4 The city map page modes** (Observe, Analyse, Design at `/map`) are part of this run.
- **D5 Shadows stay, highly optimized:** very light, whatever technique achieves that.
- **D6 Agent's choice:** the Panopticon has three floors; the Jurisdiction zone is the yard.
- **D7 Docks:** climbable cranes and a warehouse you can enter. **Plus boats:** one big boat moored at the docks, boardable.
- **D8 No separate previews.** Build the whole map; Tyler looks at it afterwards.
- **Bar for done (Tyler):** "a perfect map when you're done… highly optimized, built from the ground up, looking sexy, very noir, very Rat Detective. I want banking shots, I want a good time."
