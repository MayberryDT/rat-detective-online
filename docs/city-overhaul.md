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
| City map | `src/shared/city/places.ts`, `frame.ts`, `model.ts` (`layoutVersion` = `GRAYBOX_VERSION`), `src/heatmap/main.ts`, `output/city-map/map.ts` | Place names come from streets and landmarks. |

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
- **Bank walls:** one angled wall per landmark:
  - Records: a slanted shelf wall;
  - Icebox: an angled loading bay;
  - Needleworks: angled cutting tables;
  - Pumping Station: a slanted pipe wall.
  Placed from each interior's fight lines.
- **Gate to precinct:** a street from the Gate's north end (x −137) to the −102 street, replacing the buildings in its way.
- **Needleworks chute:** from floors 8 and 16 to the street on the north side. Rats and a loose case both ride it. The case must never stay stuck upstairs.
- **Ironclad:** one site to the precinct armoury, one beside the Records forecourt. Decide which current sites move.
- **Roof clipping fix:** launcher landings and roof pickups never leave a rat inside roof geometry. Add a test at every landing and roof pickup.

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

### W6. Jobs, placements and routes, city-wide
- Rebalance case spawns (20 today), supply sites (14), pillars (9), Jurisdiction zones (6), Paper Chase destinations (6) and spawn points (about 820, generated) across all regions, so none is empty in any assignment.
- Sewer branches, exits and their lamps must stay within the eight pooled sewer lights.
- New street alleys north (x −20 and x 120).
- Street names for guidance and places.
- Proof: a static analysis per region (every job present, every site clear and reachable on foot from a spawn), and a bot-only soak on staging.

### W7. Lighting and atmosphere for the new city
- Street lamps, windows, signs, fixtures and facade beams in the docks and the precinct, within today's light budget (the four-spot actor pool, the fixture batches).
- Harbour water surface and fog.
- The tower searchlight.
- Noir dressing and interiors for `NoirAtmosphere`, `NoirDressing`, `FeelSound` (surfaces, rooms) and `CityReactions`.

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
- **Open (decision D5):** shadow freezing or removal was measured in the performance overhaul and left for Tyler to choose.

### W9. City map and data
- `layoutVersion` 3, with the world version and protocol bumped together (protocol 23).
- Place IDs stay stable where places still exist. Ship an old-to-new mapping for the rest, and add the new places (docks, precinct floors and cells, the chute, the new streets).
- Regenerate the planning map data. `/heatmap` draws layout 3.
- Record the new mechanics as facts: chute rides, bar-blocked and bar-passed balls, ring bank hits, tower time.
- **Open (decision D4):** do the city map page's steps 4–6 (Observe, Analyse and Design modes at `/map`) happen in this run, or after it?

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
