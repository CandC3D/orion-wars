# Printed board lettering — revision 10

The supplied wordmark and subtitle now replace the board header's placeholder
type. Both use the board's dark spot ink, **#293b41**, on the existing cream card.
The supplied cream SVGs remain byte-for-byte unchanged.

I chose the **left/right arrangement**: the stacked Distant Sectors mark at left,
The Achernar Campaign at right, with **SECTOR SHEET 01** below it in the existing
plain monospace type. This gives the long subtitle enough width while keeping
both marks inside the shallow header strip. Neither outlined asset is stretched,
relettered or substituted with a font.

## Captures and direct visual review

**I can see these captured images and inspected them directly.** The scores below
come from an adversarial pass against the [rubric written before implementation](BRAND-RUBRIC.md),
supported by browser measurements. These are board-branding scores, not new scores
for the hulls, furniture or earlier contact sheets.

- [Planning, native frame](evidence/brand/planning.png)
- [Resolution, native frame](evidence/brand/resolution.png)
- [Printed header at native texture resolution](evidence/brand/header.png)
- [Unmodified source outlines on a dark reference ground](evidence/brand/source-outlines.png)
- [Outline, camera and budget measurements](evidence/brand/checks.json)
- [Full prototype browser checks](evidence/brand/main-checks.json)

| Criterion | Weight | Score /100 | Evidence and deductions |
|---|---:|---:|---|
| Supplied art fidelity | 30% | 100 | All 14 wordmark paths and 19 subtitle paths retained, including both registered-mark paths and the first Achernar r. Browser alpha comparison against each original SVG is pixel-identical: zero differing coverage, zero solid-pixel mismatches. Source hashes match the generated data. |
| Printed-component treatment | 25% | 95 | Dark outlines share the card's ink palette, registration displacement and tint-dot pitch. Existing folds cross the printed title naturally. The title is in the board albedo, lit and shadowed with the card. Deduction: print variation remains a restrained procedural approximation, not a scan of an actual printed component. |
| Header composition and camera reading | 25% | 92 | Both titles are readable at native planning size; the two title areas and stock component number remain distinct. Angular cuts and the corrected hook survive rasterisation. Deduction: the existing resolution depth-of-field softens this distant header, including its small component number; the native resolution capture shows that limitation. |
| Scope and rendering cost | 20% | 94 | No extra geometry, draw calls, runtime image fetches or material class. All existing checks pass. Furniture, camera and shared runtime code are untouched. Deduction: material textures now use 23.76 of the existing 24 MiB cap, leaving only 0.24 MiB. |
| **Weighted result** | **100%** | **95.6** | Every scored criterion is at least 90. |

The resolution camera retains its existing, up-to-three-pixel depth-of-field
blur. Increasing texture resolution does not remove that optical softness, and
this pass does not change the camera to hide it. The flat header capture documents
the raster's sharp edges; the resolution frame documents what the player actually
sees. The tiny registered symbol is preserved and inspectable in the header
capture; independent reading of its R at planning distance is **unscored**.
The deferred box treatment and full-board class-code/performance tests are also
unscored. None is represented by the weighted result above.

## Print and raster budget

The board artwork retains its original 1152 × 768 coordinate system and physical
size. Its texture is now **1536 × 1024**, rasterised directly from the supplied
outlines at 4/3 scale; there is no small intermediate bitmap to upscale. The
wordmark's raster box is approximately **403 × 91 pixels** and the subtitle's
**699 × 52 pixels**, including their supplied view-box margins. Both preserve
their original aspect ratios. Existing mipmaps and 4× anisotropic filtering remain.

The faint displaced ink impression uses the grid's **(+1.5, +0.7)** artwork-unit
offset and existing warm spot ink at 25% opacity. A low-contrast tint is clipped
inside the original paths, with the board's **8-unit pitch, 1.15-unit dot radius
and grid phase**. The primary dark silhouette remains solid: no distress cutouts,
invented serifs, erased corners or modified lettering. The original fold marks
are drawn over the header, as over the rest of the card.

Board texture storage with mipmaps increases from **4.5 to 8.0 MiB**. Measured
scene material textures are **23.7622 MiB**, within the unchanged 24 MiB ceiling.
Planning remains **69,904 submitted triangles / 79 draws**; resolution beam remains
**69,278 / 74**. No rendering budget was raised. No new fleet-scale performance
claim is made.

## Reproduction and validation

`brand/build-board-marks.mjs` compiles the two supplied SVGs into local path data.
It retains individual paths, named groups, translations, fill rules and source
hashes. Separate paths keep their original paint order: merging even-odd paths
could incorrectly cut holes in overlapping lettering. The compiler rejects
unreviewed SVG features instead of silently discarding them.

```text
node arena/prototype-3d/brand/build-board-marks.mjs
node arena/prototype-3d/review-brand.mjs
```

The second command uses the same local Playwright and optional browser environment
variables as `review.mjs`. It captures the actual prototype cameras and compares
the compiled outlines against the original SVGs in the browser. No server is left
running. The generator was run twice with **byte-identical output**.

Validation completed:

- `test.mjs`: **29 passed**.
- `test-fleet.mjs`: **30 passed**, covering all 26 prepared individual hulls.
- `review.mjs`: **passed**, no browser errors; register enforcement, inert physical
  materials, energy isolation/occlusion, stands, playback pause/skip/reduced motion,
  optional clear variant and WebGL2-to-SVG fallback remained valid.
- `review-brand.mjs`: **passed**, exact source silhouettes and hashes, both native
  camera captures, texture budget below 24 MiB, no browser errors.

New captures and the full browser-check result are under `evidence/brand/`.
Earlier approved ship/contact-sheet captures and their score records are retained
as historical evidence, not silently rescored after a board-only change.

No commit or branch was created. Only prototype files were written. The cream
sources, furniture, ships, bases, posts, facing and shared runtime were not edited.
