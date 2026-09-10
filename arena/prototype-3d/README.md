# Printed board lettering — revision 10

The supplied Distant Sectors wordmark and The Achernar Campaign subtitle now
print in dark spot ink on the board's cream header, left and right respectively.
SECTOR SHEET 01 remains plain set type. The original cream vectors are unchanged.
See the [branding review and rubric](BRAND-REVIEW.md),
[current planning frame](evidence/brand/planning.png) and
[current resolution frame](evidence/brand/resolution.png).

Direct visual self-review: **95.6/100**, with every scored criterion at least 90.
Resolution depth-of-field still softens the header. Board texture resolution is
1536 × 1024; scene material textures remain below the unchanged 24 MiB cap at
23.76 MiB. Existing ship/contact-sheet evidence below belongs to its prior review.

## Complete ship library — revision 09

**26 individual models, three inspection sheets:**
[Earth](fleet-sheets/earth.html) · [Krelath](fleet-sheets/krelath.html) ·
[Vraygon](fleet-sheets/vraygon.html). Each has matched planning-height and close
side views, explicit class codes, and a provisional shared-scale strip.
Full PNGs and native captures are linked from the sheets and
[FLEET-REVIEW.md](FLEET-REVIEW.md).

Direct visual self-review: **Earth 96.1, Krelath 94.6, Vraygon 95.6 /100**;
every hull independently scores at least **93.1**. The
[pre-build rubric](FLEET-RUBRIC.md), [per-hull scores](FLEET-REVIEW.md),
[complete scale table](FLEET-SCALE.md) and [region tables](FLEET-REGIONS.md)
record the evidence, deductions, preparation costs and unresolved decisions.
Both fighters and both distinct flagship meshes are included, with four
intentionally blank rims. Three composites are excluded; no Zandrax was supplied.

The existing board now has **EFG-03 / KFG-01 / VFG-04**, taken from the explicit
[class table](fleet-assets.json). Its miniature sizes remain 55 / 65 / 45 mm;
the new provisional contact-sheet ladder is separate. The earlier
[20/100 native planning-legibility finding](RIM-REVIEW.md) still stands.
Readable inspection captures do not overturn it. The historical rim-study page
retains the two-code fixture used to measure that failure.

Current board budgets: **69,904 triangles / 79 draws** painted, within the
original 70,000 / 90 cap. The optional clear-Shard variant adds the three rim
transfers across its passes: **104,901 / 119**, with its separate draw cap
updated to 119. All posts remain black. Furniture and shared runtime are untouched.
No commit or branch has been created.

## Earlier material and mounting slices

The following describes the existing three-frigate prototype. Historical
revision 07 scores are preserved in REVIEW.md; the current complete-library
assessment is FLEET-REVIEW.md. Board captures have been refreshed with the
newly authorised codes.

The three-frigate board now has black FASA-profile bases: the retained bevelled
skirt with six shallow facets rising to a central apex. Black posts taper gently
from 3.0 to 2.4 mm and remain uniformly **30 mm exposed above the apex**. The
2 mm pyramid rise and 3 mm skirt are measured separately in [SCALE.md](SCALE.md).
The old 0.5 mm mounting error is fixed; both post endpoints are now seated.

Earth steel has a darker metallic body, more visible real-edge burnish and rough
reflections captured from the existing lit tabletop. The source's blue regions
stay blue. Steel, bronze and gold share the rough fine-flake finish; none is a
mirror. Furniture, source art and shared runtime are untouched.

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

Revision 07's [pre-build rubric](RUBRIC.md) and [adversarial review](REVIEW.md) scored
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
| Painted three-frigate board, current codes | 69,904 triangles / 79 draws | 70,000 / 90 |
| Optional clear Shard on that board, current codes | 104,901 / 119 | 110,000 / 119 |
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
