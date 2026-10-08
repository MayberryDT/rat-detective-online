# Rat Detective: believable noir evidence and paper trails

> **Subsequent direction, 7 October 2026:** Tyler endorsed this research direction and requested thorough planning documentation. See the [P4 implementation plan](../plans/noir-physical-clues.md) for pending phases, ownership, acceptance and review artifacts. Endorsement of the direction does not imply acceptance of artwork that has not yet been made.

Research completed 7 October 2026. Proposal only; no gameplay changes, tests, services or deployments in this research pass. This expands and refines `natural-paper-plan-2026-10-07.md`. It does not record Tyler accepting a replacement design.

## Recommendation

Build a scattered case file: several recognizable, related documents lying naturally in the city, with the thin red outline Tyler requested. Use the papers to provide an immediately visible lead at every spawn and a continuous, traversable route toward the case. Give them a common visual identity so players recognize evidence belonging to the same file, while varying document purpose, silhouette and handling.

The previous proposal concentrated too much on six texture variants. That would improve repetition but leave three larger problems: papers arranged like navigation markers, unstable presentation during movement, and documents with no identity beyond generic horizontal lines. The next sample must address all four together: art, placement, stability and meaning.

The appropriate detective action here is quick observation: recognize the same file, notice the continuation around a corner, follow it downstairs, discover the case. Rat Detective remains a fast multiplayer game. Mandatory reading, inventory inspection and a corkboard would interrupt that game. Those are unnecessary to give this particular feature a stronger detective character.

## What the current implementation actually does

The inspected source repeats two sheet shapes and five ink strips at every clue. Both sheets have a shallow symmetric V bend; rotation and scale change, but document type does not. The shared route places papers at regular navigation intervals and adds cardinal neighbors near players. That combination creates a repeated marker pattern.

`src/prototype/CaseFiles.ts` separates paper, ink and outline into geometry layers with very small vertical separation. It selects whole clusters using a center point, a sight ray and a nearest-item budget. `src/shared/caseClues.ts` rebuilds nearby route windows as players and the case move. The visible effect can therefore change for several independent reasons. Reduced rendering resolution further challenges very fine lines.

These are code-grounded risks, not a completed diagnosis of Tyler's exact flicker. Earlier presence checks and screenshots established that clues were rendered; they did not establish that they looked natural or stayed stable in motion. Staging's last recorded build remains `staging-2026-10-07-e862f87` in this research pass; it was not redeployed or freshly runtime-audited.

## Real game precedents

Each entry separates documented behavior or developer explanation from my recommendation for Rat Detective. Sources are original developer accounts, official material or interviews with the people responsible. Historical prototypes are identified as such. These are references for principles, not claims that we can transplant another engine's implementation.

### L.A. Noire: a document changes what you can investigate

Rockstar's official case guide gives a concrete example: finding a receipt adds a clue and identifies Coombs Automotive as a new location. In the separate VR edition, the official manual describes grasping and rotating outlined objects to examine them. These are different versions and should not be conflated. [Official case guide](https://media.rockstargames.com/lanoire/files/pdf/LANoireGuide-TheNakedCity-ASlipOfTheTongue.pdf); [VR manual](https://www.rockstargames.com/img/manuals/en_us/LAN_VR_OR_DIGITAL_MANUAL_ENG.pdf).

**Application:** a receipt, statement or photograph should look like an identifiable piece of evidence. Its presence should help the player decide what to do next. A generic cream rectangle with five bars communicates neither its origin nor its significance. We can borrow the relationship between object and next action without requiring a player to stop and rotate every sheet while being shot at.

### Shadows of Doubt: clues belong to a functioning city

In his August 2024 account, director Cole Jefferies describes gathering fingerprints, checking CCTV and call logs, and finding sales slips in rubbish. These are records associated with people and places, with multiple ways to pursue a case. An earlier July 2018 prototype diary explored physical case folders and a corkboard; its experimental inference rules are not evidence of the shipped system. [Director's gameplay explanation](https://blog.playstation.com/?p=394742); [2018 prototype diary](https://colepowered.com/shadows-of-doubt-devblog-4-case-folders-cork-boards/).

**Application:** use the institutions already in Rat Detective: precinct paperwork, a harbour receipt, a witness statement. Related documents should share a case reference and printing conventions. This gives the city ownership of its clues. Building citizen schedules, fingerprint databases or a general investigation simulator would be far beyond the feature's needs.

### Alan Wake II: readable evidence and manageable deductions

Remedy's designers describe simplifying an initially complicated investigation-board design into smaller, clearer questions. New clues were easier to notice when presented as a hand of cards. The interview also discusses managing overlapping paper UI and synchronizing its camera to avoid jitter. Those details concern the Mind Place interface, not a documented ground-paper renderer. [Interview with Simon Wasselin, Alexander Balakshin and Riho Kroll, December 2023](https://www.gamedeveloper.com/design/true-detective-meets-hearthstone-unlocking-the-metaphysical-mind-place-of-alan-wake-ii).

**Application:** keep the next useful observation obvious and small. At a junction the player needs to see which passage continues the evidence, rather than solve an elaborate deduction. Stable paper presentation matters even when the art itself is strong. A floating investigation board would be an unnecessary change of game here.

### Return of the Obra Dinn: motion is part of the visual design

Lucas Pope's November 2017 development log explains how dithering that worked in still images swam or flickered with camera movement, and documents experiments to stabilize it. This is a direct account of a distinctive visual treatment failing temporally despite looking convincing in a still. It is not proof that our flicker has the same technical cause. [Pope's rendering development log](https://dukope.com/devlogs/obra-dinn/tig-32/).

**Application:** approve the papers while walking, turning and crossing occlusion boundaries. A screenshot cannot establish the absence of shimmer or popping. Borrow that discipline, not the game's one-bit rendering or dithering: those would introduce a different aesthetic and additional risks.

### The Case of the Golden Idol: the designer knowing the answer is a testing trap

Andrejs Klavins describes the difficulty of judging a mystery when its creator already knows the answer. The team used outside playtesting and introduced intermediate deductions and feedback rather than relying entirely on a large final answer. [Developer interview, November 2022](https://www.gamedeveloper.com/design/case-of-the-golden-idol).

**Application:** someone who has not been told where the papers are must find the first lead and follow a short route. The implementation author's ability to locate an instance is weak evidence. Our small deduction is recognizing related evidence and its continuation; we do not need word-slot puzzles or a separate mystery layer.

### Ghost of Tsushima: guidance belongs to the environment, but contact still matters

Lead VFX artist Matt Vainio explains how the existing wind language became navigation guidance. He also describes problems with terrain-following movement looking unnatural, clipping at obstacles, and getting leaves to settle convincingly. Its guiding wind points toward the destination; it does not supply an obstacle-avoiding route. [Sucker Punch's technical account, January 2021](https://blog.playstation.com/?p=345372).

**Application:** our evidence should use the city's existing material and lighting language. Contact and placement deserve as much care as the paper artwork. Rat Detective still needs its own traversable route through walls, stairs and sewers. Copying directional wind, huge leaf simulations or airborne paper clouds would conflict with the requested quiet physical trail.

### Pentiment: variation can describe an author

Lettermatic made five font families for Pentiment, with more than 2,700 glyphs drawn using authentic tools. Typography helps distinguish speakers and their social or educational context. The project demonstrates deliberate, meaningful variation rather than a random distressed filter. [Lettermatic's production case study](https://lettermatic.com/custom/pentiment).

**Application:** distinguish a typed police statement, a ruled carbon form and a handwritten note by their layout and marks. The differences should reflect who produced them. We need a small authored toolkit, not thousands of custom glyphs, medieval calligraphy or illegible microscopic writing.

### Papers, Please: document handling is a designed visual system

Pope's mobile development account explains the tradeoffs of fitting physical-looking documents onto a smaller screen while preserving inspection and comparison. The document rack, layout and image preparation were deliberate parts of the interaction. [Pope's mobile development log, August 2022](https://dukope.com/devlogs/papers-please/mobile/).

**Application:** document proportions and hierarchy must survive the actual presentation size. A full-page statement and a narrow receipt should have visibly different silhouettes. We should assess the normal shoulder camera first, because that is where players need to recognize the clue. Detailed reading is optional flavor, not a condition for navigation.

### Alien: Isolation: make a consistent world of manufactured objects

UI designer Jon McKellan describes using the original film as a reference and processing interface imagery through physical analogue equipment. He distinguishes information representing the player's awareness from interfaces existing in the world. [Art of the Title's developer interview](https://www.artofthetitle.com/title/alien-isolation/).

**Application:** design original documents as things the precinct or harbour would actually print. Physical reference can inform believable ink, folds and paper without copying another game's assets. We should not add VHS distortion, flicker or cumbersome terminals. Native rendering does not require all artwork to be generated from rectangles at runtime.

### Chicken Police: animal characters can inhabit a convincing noir world

The Wild Gentlemen's June 2019 diary describes noir in terms of damaged characters, moral tensions and relationships, alongside the buddy-cop pairing. Their art diary explains combining photography and hand-painted work, including the importance of believable shadows. This is especially relevant to a game whose detectives are animals. [Developer diaries](https://store.steampowered.com/news/posts/?appgroupname=Chicken+Police&appids=1084640&enddate=1561565188).

**Application:** the rats can remain playful while their paperwork takes the city seriously. A routine transfer form, an amended statement or an overdue harbour charge provides more useful noir character than covering every sheet with cheese jokes. The feature needs coherence with the game, not a photorealistic art replacement or a new dramatic story campaign.

### Doom 3, BioShock 2 and multiplayer traces: objects imply an event

Harvey Smith and Matthias Worch's GDC 2010 slides use a Doom 3 blood trail as a warning, BioShock 2's defaced Ryan display and abandoned paintbrush as a causal scene, and Half-Life multiplayer traces as information about earlier action. The same presentation includes hypothetical examples; those should not be represented as shipped features. [Slides with speaker notes](https://media.gdcvault.com/gdc10/slides/Smith_Harvey_WhatHappenedHereWeb_Notes.pdf).

**Application:** where the case is actually dropped or knocked loose, a small paper scatter can truthfully mark an event. We should make the relationship clear: case, matching documents, disturbance. A static trail generated toward today's target is a navigation aid, however; it should not be described as a forensic reconstruction of yesterday's carrier movement.

## Proposed visual language

### A related file, with different contents

Start with four document families and a few shape variants, rather than six unrelated kinds of litter:

| Document | Recognizable at playing distance | Close detail | Handling |
|---|---|---|---|
| Witness statement | Full sheet, strong heading, uneven text block | A typed statement and signature line | Mostly flat, one small folded corner |
| Evidence inventory | Ruled columns and short numbered entries | Shared case reference and precinct mark | A light cross-fold or shallow crease |
| Harbour receipt | Narrow strip, short horizontal entries | A plausible city business and amount | Slight curl at one end |
| Photograph with note | Dark image area inside a pale border | Original scene image and a short annotation | Stiffer, flatter stock |

These examples are proposed art, not new lore accepted by Tyler. The exact wording can remain minimal. All four should share a small case mark corresponding to the case tag. Players should identify a family through shape, print pattern and the red edge; reading the serial number must never be necessary at running speed.

Use mostly single sheets. An occasional deliberately composed pair or small spill creates variety. Rotate and place an entire authored arrangement, with independent support for each sheet; do not create overlaps by throwing arbitrary sheets together.

### Paper should look like paper

Choose off-white, grey-white and subdued cream office stock. Keep rough surfaces and quiet ink. Include small, specific handling marks: a crease, a dog-ear, a slightly uneven stamp. Avoid turning every sheet into stained antique parchment. The world is noir, but its paperwork can have been printed this morning.

Most sheets should lie almost flat. A minority can have an asymmetric lifted corner or a soft curl. The repeated central V currently makes them look like little tents. Ground contact must be credible at normal camera height: no hovering layer and no large generic circular shadow beneath each page.

The art should remain simplified enough to match the existing rats and city. Hyper-detailed photorealistic scans on otherwise simple surroundings would be another mismatch. Physical reference is a starting point for authored artwork, not an instruction to change the game's entire fidelity level.

### Keep the red outline restrained and reliable

Honor Tyler's requested red outline. It should trace the sheet's visible perimeter, remain hidden behind buildings and sit within the existing case-red language. It should not pulse, expand, throw light into the street or turn the page into a luminous panel.

The red edge and the paper silhouette need to survive the normal camera and reduced render scale. If an edge becomes a crawling subpixel line, the response is to adjust its filtered coverage and viewing-distance treatment, not add a larger beacon. Close print can disappear into a plausible grey texture at distance; the entire sheet should not blink out.

### Noir comes from context as well as color

Place papers where their light/dark silhouette is legible within the existing street illumination. Let the same scene lighting affect them. Under a lamp they should feel like pale matte stock; in shadow they should darken. The red edge may need a modest visibility floor, but the page should not become self-lit.

Short content can imply the city's institutions and pressures: a correction to a witness statement, an unsigned transfer, a mundane receipt filed as evidence. Keep this optional and restrained. There is no need to add dialogue, a lore database or lengthy readable documents to make the objects feel authored.

## How the trail should work

### Spawn: an immediate, visible first lead

A valid spawn should show a small asymmetric paper arrangement on visible, supported ground in or close to the initial view. The continuation must be discoverable from it. A paper hidden behind the player, inside a wall or on the wrong floor does not satisfy the guarantee, even if a distance query says it is nearby.

Do not cover every compass direction with matching piles. Choose a coherent departure along the actual route. Keep multiple clues along that route, as Tyler requested. If a placement fails visibility/support checks, select another valid point in that local route corridor. If a spawn's geometry cannot support the promise, report that concrete exception rather than quietly count an invisible clue as success.

### Corners and junctions: continuity through composition

On a straight stretch, single sheets can be spaced irregularly within a bounded range. Around a corner, ensure the last visible clue leads to a place from which the next is visible. The player should discover the continuation by moving normally. Avoid a gap that requires guessing among several streets.

A small cluster at a threshold can mark a change of space. Its shapes need not point like arrowheads. The route's continuity comes from where papers exist, not painted arrows or aligned triangular forms.

### Stairs and sewers: evidence on the route's real surface

Place papers on supported landings or usable ramp surfaces, not at a single approximate floor height. A paper above the sewer does not guide someone inside it. Keep vertical transitions legible with a clue before entering and another after the transition becomes visible. Never use through-wall visibility to compensate for poor placement.

### At the case: a clear relationship

Use the same document family near the actual case. A small local spill can connect the loose papers to the object they belong with. This must remain subordinate to recognizing and reaching the real, collectible case; it should never resemble a second case prop or resurrect the prior ghost-case problem.

### Moving case: acknowledge the design tradeoff

Guaranteed spawn-to-case guidance, permanently stationary physical evidence and a constantly moving target cannot all behave as a literal historical trail. Our existing route is generated toward the current case, not solely shed by its past carrier.

Preserve useful generated routes, but stop rebuilding unaffected presentation unnecessarily. Give route segments stable identity and keep unchanged sheets fixed. When the destination changes, update the necessary branches; do not let all nearby papers reshuffle as a player takes a step. Invalid guidance must cease promptly enough to avoid knowingly leading players away. A cosmetic transition must not conceal stale authority.

Reserve stronger signs of an actual event for true case drops and knocks. That preserves honesty about what the world communicates without adding a historical-tracking simulator. Exact route-refresh behavior still needs a bounded moving-target experiment; this report does not invent a solved algorithm or claim it has been validated.

## Native Three.js implementation direction

Use the existing renderer and lifecycle. A small authored texture atlas plus simple paper meshes is the appropriate starting point. Original artwork can be prepared as static images or drawn with Canvas2D; runtime CanvasTexture already has local precedents. Prefer whichever produces convincing art with less machinery. Runtime procedural generation is not a requirement of native implementation. [CanvasTexture](https://threejs.org/docs/pages/CanvasTexture.html).

Put paper color, ink and the red perimeter on the same sheet surface. Use a rough, lit material, with a red-only emissive mask if needed to preserve the edge quietly. This avoids stacking separate ink and rim planes at tiny offsets. A handful of mesh variants can share an atlas/material and use instanced batches. This is a design target, not a measured performance claim. [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html); [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html).

Use padded atlas tiles, mipmaps and suitable anisotropic filtering for the shallow ground angle. Compare normal and reduced rendering scale; a high-resolution texture cannot compensate for a tiny on-screen line. Keep colors in the correct texture color space. [Texture documentation](https://threejs.org/docs/pages/Texture.html).

Prefer opaque sheets with modeled boundaries. If torn silhouettes need cutouts, evaluate alpha testing with MSAA alpha-to-coverage. Avoid alpha-hashed transparency for this feature because its noise works against the specific stability complaint. Keep depth testing. Polygon offset is a targeted option for demonstrated ground depth conflict, not a repair for intersecting paper geometry. [Material documentation](https://threejs.org/docs/pages/Material.html).

| Technique | Useful for | Recommendation here |
|---|---|---|
| Small mesh plus atlas | Folded or flat sheet; real silhouette; shared batches | Primary implementation |
| Surface decal | Completely flat print or litter conforming to a surface | Optional later, not required for first sample |
| Camera-facing sprite | A consistently facing icon | Poor fit for grounded paper |
| Whole-frame outline effect | Broad silhouette highlighting across objects | Unnecessary new rendering complexity |
| Simulated physical sheets | Airborne movement and collision | Unnecessary cost and instability for a static trail |

Three.js provides surface-projected decal geometry, but that does not make it the best solution for a lifted corner or folded sheet. [DecalGeometry](https://threejs.org/docs/pages/DecalGeometry.html).

Integrate materials explicitly with `NoirCity`'s dynamic-object support. Its initial material collection does not automatically prove later-created meshes are included. Warm and dispose the new meshes through the existing session lifecycle. Share resources instead of giving every paper its own texture, physics body or light.

Use GPU depth for partial wall occlusion. A single physics ray to a paper cluster's center should not delete visible portions of the cluster. Bounds-aware frustum selection and stable budget boundaries are preferable. Keep bot observation rules separate: changing visual culling does not authorize giving bots information through walls.

## Flicker: diagnosis before prescribing one fix

| Observed symptom | Source-supported candidate | Isolating check for the future sample | Likely response if confirmed |
|---|---|---|---|
| Fine edges crawl as camera moves | Subpixel red/ink geometry; reduced resolution | Fixed clue list, slow pan at both render scales | Integrated filtered artwork; adequate line coverage |
| Two surfaces sparkle against one another | Near-coplanar layers or intersecting sheets | One sheet, no separate ink/rim layers | Remove competing surfaces; correct geometry |
| Entire clue blinks at a corner | Center-point sight-ray culling | Keep GPU depth, bypass that cull locally | Bounds-aware visibility; let depth hide covered portions |
| Papers appear elsewhere as player/case moves | Route window/list changes | Record stable IDs and positions alongside video | Preserve unchanged segments and presentation |
| Distant clues alternate near selection boundary | Nearest-item budget or hard cutoff | Stationary route, move across boundary | Stable selection and suitable boundary behavior |
| Appearance differs from surrounding city | Dynamic material integration | Compare lit sample with known native city prop | Correct NoirCity adoption and lifecycle |

No new unit-test suite is proposed. For this visual feature, a short instrumented E2E session and repeatable motion artifact are the appropriate evidence. The exact cause of Tyler's report remains unconfirmed until that experiment is authorized and performed.

## Concrete next actions

1. **Author one coherent paper set.** Four document families, a few restrained shape variants, common file identity, thin red edge. Evaluate at the rat's normal shoulder camera, not only a close-up asset view.
2. **Make one small in-engine comparison scene on Halla.** A straight street, a corner and a sewer transition using the real lighting/material path. Start with stationary evidence so art and raster stability can be judged independently of route updates.
3. **Capture the flicker diagnosis.** Fixed list versus live list; current center culling versus depth-only visual occlusion; normal and reduced resolution. Record a short moving-camera clip and clue identity/visibility events.
4. **Integrate stable, naturally arranged route placement.** Preserve the guaranteed spawn lead, current case authority and traversable routes. Remove the repeated two-sheet/cardinal arrangement, preserve unchanged paper positions, and validate ground support.
5. **Demonstrate the complete experience.** Fresh spawn, reconnect, corner, sewer, loose-case pickup and moving carrier. Use the same camera path where possible and keep a reproducible artifact. Report performance against the existing implementation.

The first deliverable should be a convincing in-game motion sample, before replacing staging again. The visual decision is whether the documents and placement feel right in the actual city; a passing clue-count assertion cannot make that decision.

## Acceptance criteria

- A fresh player sees an actionable first lead without searching for a minute or being told where to look.
- The documents read as normal paper at playing distance, and at least several types are distinguishable without magnification.
- The red edge remains restrained and recognizable, with no through-building rendering, pulsing page or oversized marker treatment.
- Papers remain grounded and stationary when their route segment has not changed.
- A fixed scene does not show whole-clue popping or obvious ink/edge crawling during a normal pan and walk.
- The route continues through real openings and vertical transitions and reaches the actual current case.
- Case movement changes only the guidance that needs to change, without a visibly regenerating carpet around the player.
- A person unfamiliar with the setup can follow it. Record observation, not just automated presence checks.
- Existing authority, bot equality, human-only room lifecycle and unrelated visibility mechanics remain intact.

## Evidence limits and current decision

This is research and a proposed direction. Source-backed game examples do not prove the new art will work in Rat Detective. We have not produced or judged that art in this pass. The existing flicker candidates are supported by source inspection, but no single root cause is claimed.

Some official PDF retrievals were intermittent. The L.A. Noire receipt example was available in the indexed official guide; the VR manual is explicitly a separate edition. Remedy's large environment presentation was not successfully inspected and is not used as evidence. No claim is made to have watched a conference talk from reading its abstract.

No new strategic choice needs to be pushed back to Tyler now. His direction is sufficiently clear: multiple natural paper clues, obvious on spawn, leading to the case, red outlines, no visibility through buildings, detective/noir character. The next substantive review is a small moving in-game sample implementing this direction, when work resumes. This research does not grant itself permission to deploy another revision.
