# Cast stands, steel and clear kit parts — revision 07

**Revision 08 rim-code finding:** Chris selected printed class codes, but the
isolated candidate fails native planning legibility. The 2.638 mm maximum tested
capitals project to only 3.15–3.16 pixels; paper contrast does not rescue them.
Earth is blank and unscored. The accepted board below remains byte-identical.
See [RIM-REVIEW.md](RIM-REVIEW.md) for the withheld result and supporting scores.
This does not carry revision 07's passing material score into identification.

The three-frigate board now has black FASA-profile bases: the retained bevelled
skirt with six shallow facets rising to a central apex. Black posts taper gently
from 3.0 to 2.4 mm and remain uniformly **30 mm exposed above the apex**. The
2 mm pyramid rise and 3 mm skirt are measured separately in [SCALE.md](SCALE.md).
The old 0.5 mm mounting error is fixed; both post endpoints are now seated.

Earth steel has a darker metallic body, more visible real-edge burnish and rough
reflections captured from the existing lit tabletop. The source's blue regions
stay blue. Steel, bronze and gold share the rough fine-flake finish; none is a
mirror. Furniture, source art, identifiers and shared runtime are untouched.

Start with [native planning](evidence/planning.png), the native
[Earth crop](evidence/monoceros-planning.png), and the
[Earth side view](evidence/monoceros-side.png). [Resolution](evidence/beam.png)
continues to use the existing playback clock and separate energetic register.

The [matched material comparisons](variants.html) now use the **Crystal heavy
cruiser**, with detail, side and plan pairs and a black/clear post study.
[Open the interactive study](material-study.html) to switch the same camera
between treatments. The 90 mm comparison hull stays off the three-frigate board;
its source green regions are neither enlarged nor relocated. Pale cyan is paint.
Shard retains its optional variant but no longer carries the material decision.

Clear parts transmit with geometry-derived depth and cast a weaker, approximate
transmission shadow. They emit nothing and have no paint marks. I prefer clear
for the stand's float illusion; on Crystal, paint still identifies green more
strongly while clear reads as a separate kit part in detail. Chris decides.
**Every post on the board remains black and opaque.**

The [pre-build rubric](RUBRIC.md) and [fresh adversarial review](REVIEW.md) score
94.30/100, with every criterion at least 90. Independent gates: steel at planning
91, Crystal comparison 92, clear-post comparison 93. I can see and directly
inspected the captured images. These are self-review scores, not Chris's approval.

| Hull | Plan detail | Side | Stern | Bow |
|---|---|---|---|---|
| Monoceros | [Plan](evidence/monoceros-detail.png) | [Side](evidence/monoceros-side.png) | [Stern](evidence/monoceros-stern.png) | [Bow](evidence/monoceros-bow.png) |
| Sparrowhawk | [Plan](evidence/sparrowhawk-detail.png) | [Side](evidence/sparrowhawk-side.png) | [Stern](evidence/sparrowhawk-stern.png) | [Bow](evidence/sparrowhawk-bow.png) |
| Shard | [Plan](evidence/shard-detail.png) | [Side](evidence/shard-side.png) | [Stern](evidence/shard-stern.png) | [Bow](evidence/shard-bow.png) |

The [region tables](REGION-TABLES.md) include the comparison hull. The
[faction contracts](FACTION-PALETTES.md), [20-file source audit](LIBRARY-AUDIT.md)
and [source/material contract](SOURCE-GAP.md) document the source boundaries,
preparation, inert energy attachments, clear optics and limitations.

## Budgets and validation

| View | Largest captured submission | Limit |
|---|---|---|
| Painted three-frigate board | 69,832 triangles / 73 draws | 70,000 / 90 |
| Optional clear Shard on that board | 104,793 / 110 | 110,000 / 110 |
| Isolated Crystal comparison | 41,642 / 55 | 90,000 / 110 |
| Isolated post pair | 7,144 / 47 | 90,000 / 110 |

Main material textures use 18.81 MiB of the 24 MiB budget, including the captured
room. Main offscreen-target limits remain 64 MiB painted / 96 MiB optional clear.
The separate deciding study uses full-resolution transmission, estimated at
80.97 MiB for its targets at the captured size, with a 160 MiB limit and 2.07M
pixel cap. The estimate excludes driver overhead and the default browser drawing
buffer. Transmission allocation persists until reload. Peak driver memory,
integrated-GPU behaviour and full-board performance remain unmeasured.

29 prototype checks, the unchanged fast suite, and both browser workflows pass.
Checks include the six roof facets, actual scale measurements, both mounting
gaps, authored palette/geometry, optical depth, transmitting shadow, no physical
emission, independent energy, camera floors, pause/skip and SVG fallback.

From this worktree:

```powershell
$env:PORT = '18873'
node scripts/serve.js
```

Open `http://127.0.0.1:18873/arena/prototype-3d/index.html` for the board,
`material-study.html` for live comparisons, or `variants.html` for matched frames.
The board's `?insert=clear` option affects Shard's green fixture only.

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
$env:PLAYWRIGHT_MODULE = 'file:///path/to/playwright/index.mjs'
$env:PROTOTYPE_BROWSER = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node arena/prototype-3d/review.mjs
node arena/prototype-3d/review-study.mjs
```

Rebuild commands are in SOURCE-GAP.md. The Crystal derivative rebuilt
byte-identically; the three frigate meshes and all supplied GLBs remain unchanged.

Work remains uncommitted on work/presentation-3d, base HEAD 38f8d0b. No branch
was created. All surviving implementation changes are inside the prototype;
the review discloses one immediately removed misplaced placeholder. Stopped
before destruction, planets/nebulae, identification decisions and full-board work.
