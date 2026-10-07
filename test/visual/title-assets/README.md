# Title scene assets

`test/visual/title-scene.html` builds the detective's office in three.js and path traces it once
(`three-gpu-pathtracer`) into the title stills in `public/title/`. The game never loads WebGL on the title;
it shows the stills and puts live HTML on them (`src/ui/title.css`).

## Textures

`fetch.sh` downloads the maps into `textures/` (git-ignored). All are CC0 from
[ambientCG](https://ambientcg.com) (licence: <https://docs.ambientcg.com/license/>):

| Asset | Used for |
| --- | --- |
| Cork003 | the cork board |
| Paper001 | paper fibre (normal map) on every pinned scrap |
| Paper005 | manila case folders |
| PaintedPlaster017 | the walls |
| Wood066 | the desk |
| Wood026 | the floor and the board frame |
| Leather037 | the desk blotter |

Everything else (the newspaper, mugshots, map, notes, rain on the glass, the skyline) is drawn in canvas
by `title-props.ts`. The mugshots are the game's own rats (`src/utils/RatModel.ts`).

## Rendering

The path tracer is not a project dependency. This offline asset generator is excluded from the normal test TypeScript project; install its optional dependencies before rendering it. Install it without saving, then serve `test/visual`:

```sh
test/visual/title-assets/fetch.sh
npm i --no-save three-gpu-pathtracer@0.0.24 three-mesh-bvh@0.9.15
npx vite --config vite.visual.config.ts --port 5196
```

Open the page in Chrome with a capable GPU (an AMD Lucienne iGPU hangs on the tracer's shader; an RTX 3050
renders the desktop still at 768 samples in about ten minutes). `window.titleRender` resolves to
`{image}` (a PNG data URL); `window.titleLayout` holds the overlay CSS for that framing.

| Query | Output |
| --- | --- |
| `?mode=trace&spp=768` | `office.webp` (1920×1080) |
| `?mode=trace&spp=768&variant=phone` | `office-wide.webp` (1920×888, screens wider than 2:1) |
| `?mode=trace&spp=160&scale=.5&pass=blinds` | `office-stripes.webp`, the blind-stripe light alone (headlight sweep mask) |
| `?mode=trace&spp=160&scale=.5&pass=lamp` | `office-lamp.webp`, the lamp light alone (flicker and dust mask) |
| `?mode=trace&spp=256&pass=die&frames=12&size=192` | `die.webp`, the die tumbling through one turn |

Add `&variant=phone` to the two mask passes for the `office-wide-*` masks. `?mode=raster` gives a fast
preview. Encode the PNGs as WebP; the masks are white with the light as alpha. After moving anything
on the board, copy `window.titleLayout` into the matching block of `src/ui/title.css`.
