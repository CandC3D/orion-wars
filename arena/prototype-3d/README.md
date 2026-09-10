# Three frigates: steel, bronze and gold - revision 06

The current Monoceros, Sparrowhawk and Shard now treat their substantial metal
regions as silver/steel, bronze and gold. They share a rough metallic-flake
finish, washed recesses and burnished edges; body paints remain matte. All
source colours remain room-lit and non-emissive. Planning draws no energy.

The [faction contracts](FACTION-PALETTES.md) now govern every prepared hull;
[the staged audit](LIBRARY-AUDIT.md) covers all 20 files / 18 distinct contents
available here. Only two Krelath hulls are staged; the missing library is not
claimed as inspected. Alternate Earth steel, dead-flat Krelath deck and painted
Vraygon cyan are encoded without adding geometry to the frigates.

The corrected [per-hull region tables](REGION-TABLES.md) include all 23 colours,
source/reduced surface areas, material classifications and open questions.
[The contract](SOURCE-GAP.md) records the inert energy attachment maps and the
optional clear-green Shard insert. [Scale measurements](SCALE.md) are republished;
all dimensions and furniture remain unchanged.

Start with [native planning](evidence/planning.png) and [resolution](evidence/beam.png).
Native, unscaled hull crops: [Monoceros](evidence/monoceros-planning.png),
[Sparrowhawk](evidence/sparrowhawk-planning.png), [Shard](evidence/shard-planning.png).

| Hull | Plan detail | Side | Stern | Bow |
|---|---|---|---|---|
| Monoceros | [Plan](evidence/monoceros-detail.png) | [Side](evidence/monoceros-side.png) | [Stern](evidence/monoceros-stern.png) | [Bow](evidence/monoceros-bow.png) |
| Sparrowhawk | [Plan](evidence/sparrowhawk-detail.png) | [Side](evidence/sparrowhawk-side.png) | [Stern](evidence/sparrowhawk-stern.png) | [Bow](evidence/sparrowhawk-bow.png) |
| Shard | [Plan](evidence/shard-detail.png) | [Side](evidence/shard-side.png) | [Stern](evidence/shard-stern.png) | [Bow](evidence/shard-bow.png) |

[Paint / clear comparison](variants.html) provides matched cameras and links to
both live variants. Painted green remains the default. Clear green has no paint
marks and transmits through a measured thin volume; its shadow is approximate.
I prefer the painted part at planning distance, and the clear insert in detail.
Chris's choice remains open, as does [base identification](IDENTIFICATION.md).

[Pre-build rubric](RUBRIC.md) and [adversarial review](REVIEW.md): 94.45/100
weighted, each criterion >=90. Metal scores: Earth 90, Krelath 91, Vraygon 92;
optional insert comparison 90. These are fresh self-review scores, not Chris's
approval. I directly viewed the 22 distinct images covering all 25 final captures.
Frame/file hashes and scope
checks are attached in evidence/adversarial-review.json.

## Correction and uncertainty

Earth's steel mask was intact but wrongly classified as pale paint. It is
43.952% of the entire surface; the two blue regions together are 47.679%.
The planning camera sees 38.77% steel and 53.84% blue, so no source colours were
swapped to force a steel majority on screen. The steel now has the metallic finish.
Earth's 2.177% gold sensor dish is now confirmed metal. Its entire source and
reduced gold region is confined to the dish; out-of-bounds gold fails preparation.
Shard's 27.175% yellow is confirmed paint by Chris's later faction
set. Its purple/lavender/red are designated energy-capable, with no guessed
weapon or engine functions. Krelath's green distinction and small dome remain
unnamed. All designations are inert until an explicitly supported animation.

## Budgets and run

| Measurement | Painted default | Optional clear experiment |
|---|---|---|
| Largest captured planning submission | 69,736 triangles / 73 draws | 104,649 / 110 |
| Submission caps | 70,000 / 90 | 110,000 / 110 |
| Material textures | 17.31 MiB / 24 cap | Same; transmission is a render target |
| Target estimate cap | 64 MiB | 96 MiB; half-resolution MSAA transmission adds up to about 30 MiB |
| Lighting | One warm shadow key, existing fill | Same lights; no emissive material |
| Shadow / buffer | 2048 square; <=2,073,600 pixels | Same; clear insert casts an opaque approximate shadow |
| Camera | Y >=24 units, downward pitch >=32 degrees | Same floors, including comparison cameras |

The clear pass exceeds the painted budget. It is an experiment, not a fleet-wide
performance claim. Its target allocation remains until reload after switching
back to paint. Peak driver memory, integrated-GPU behaviour and full-board costs
are unmeasured. The ordinary three-hull Edge/RTX 5060 Ti probe averaged 0.42 ms,
p95 0.50 ms for JS submission plus gl.finish at 1920 x 1080; this is not a full-board test.

From this worktree:

```powershell
$env:PORT = '18873'
node scripts/serve.js
```

Open `http://127.0.0.1:18873/arena/prototype-3d/index.html` (painted default),
`index.html?insert=clear` (optional insert), or `variants.html` (paired captures).
Pinned local Three.js r180/WebGL2 is unchanged; SVG remains the fallback.

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
$env:PLAYWRIGHT_MODULE = 'file:///path/to/playwright/index.mjs'
$env:PROTOTYPE_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node arena/prototype-3d/review.mjs
```

28 prototype checks, the unchanged fast suite and browser checks pass. Browser
checks cover every material mask, missing classifications, inert designated
faces, physical/energy separation, floors, pause/skip, fallback and both variant
URLs. Rebuild commands are in SOURCE-GAP.md. The three derivative GLBs rebuilt byte-identically during preparation verification;
all source files remain untouched.

All implementation remains under arena/prototype-3d/, on work/presentation-3d,
base HEAD 29c322e. No branch or commit was created. Furniture, black stands,
identifier choice, shared runtime and other sessions' files remain unchanged.
Stopped before destruction, planet/nebula samples and the full-board test.
