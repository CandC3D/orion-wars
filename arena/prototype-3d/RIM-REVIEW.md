# Rim lettering — revision 08 finding, withheld

**The candidate fails planning legibility and is not enabled on the accepted
board.** Both complete codes read in detail; neither can reliably be read in the
native planning frame. Earth remains visibly blank and unscored in this requested
two-code test. There is no passing aggregate score for this slice.

During the final audit, two external commits advanced the brief from aa4b615 to
fbf124f. Commit 0732ca3 now supplies **EFG-03** for Monoceros; fbf124f supplies
**VBB-01** and **VDD-03** as the authoritative Cluster/Point corrections. Only
the brief changed. I recorded those rulings without changing this message's
explicitly requested blank Earth test or adding hulls to the failed candidate.
Earth's code is therefore no longer an outstanding fiction question; its rim
implementation and legibility are unscored in this test.

I can see the captures. I directly inspected native planning, both native crops
at each of six sizes, the paper alternative and all three detail views. Knowing
the strings beforehand biases recognition: guessing an expected string from
three rows of pixels is not reading it.

## Measurement and the missing minimum

The browser is 1600 × 1080, device scale 1; scene buffer 1514 × 750. The unchanged
planning camera is (8, 63, 54), FOV 32°, downward pitch 48.637°. No camera floor,
viewing scale, base dimension or pixel budget was changed.

| Printed capital height | KFG-01 cap / code width | VFG-04 cap / code width | Native result |
|---:|---:|---:|---|
| 1.000 mm | 1.19 / 6.80 px | 1.20 / 6.90 px | Unreadable |
| 1.500 mm | 1.79 / 10.20 px | 1.79 / 10.35 px | Unreadable |
| 2.000 mm | 2.39 / 13.60 px | 2.39 / 13.80 px | Unreadable |
| 2.300 mm | 2.75 / 15.64 px | 2.75 / 15.86 px | Unreadable |
| 2.600 mm | 3.11 / 17.68 px | 3.11 / 17.93 px | Not reliably readable |
| 2.638 mm, largest tested fit | 3.15 / 17.94 px | 3.16 / 18.19 px | Not reliably readable |

Measurements follow the glyph height/width axes, not its axis-aligned rectangle:
a sloping three-pixel-high word can occupy an eight-pixel-tall bounding box
without acquiring eight rows of letter detail. Values use the best available
face by projected width, before occlusion. Occlusion cannot improve them.

**No minimum legible text height was found within the rim.** The skirt is 3 mm
vertically and 3.038 mm along its slope. Nominal 0.2 mm ink margins leave 2.638 mm
capitals. Code widths are 11.768 mm / 12.339 mm; the face is at least 13.884 mm
wide. The decal carrier's measured vertical bounds are 0.180–2.822 mm, entirely
below the 3 mm skirt top. The pyramid carries no print.

Even removing every margin yields only 3.63 projected pixels of full skirt height
on the best-facing faces in this pose. Across the 5° intermediate-rotation sweep,
the maximum full height of any front-facing skirt remains below 3.68 px.
Wrapping around corners could gain width, but cannot gain this missing height.

Paper produces a more visible pale strip, not readable glyphs. Establishing a
readable minimum needs more screen space per rim: a viewing-scale or physical-
dimension decision outside this pass. Neither was changed. No overlay, roof text,
or untested pixel threshold is presented as a solution or a measured minimum.

## Print and orientation

The isolated [rim-study.html](rim-study.html) carries exactly `KFG-01` and
`VFG-04`, from the supplied frigate filenames. Earth has no fallback, prefix,
question mark or pending symbol on its miniature. Unknown hull keys fail.
The larger Vraygon source filenames still contain `BB-01` / `DD-03`; the new
authoritative codes are `VBB-01` / `VDD-03`. Neither hull was drawn or source
filename changed.

I chose **off-white waterslide lettering in bold Arial**. It keeps the skirt
black and reads as a printed transfer in detail. A black-on-paper version remains
available for the contrast comparison. Arial's original design dates to 1982,
according to its publisher's [Monotype family description](https://www.myfonts.com/collections/arial-font-monotype-imaging).
The installed local face supplies glyphs; no font file is copied into the repo.
Print uses a rough, lit, nonemitting physical material with depth/shadow
participation. Decals use alpha-tested ink; paper preserves antialiased dark
print over opaque pale stock. Neither makes the native capitals readable.

Each code repeats **once on each of six skirt faces**, centred and upright from
outside that face. No face is designated as front. All six legal headings retain
an available camera-facing code. A separate 5° projection sweep through one 60°
symmetry interval checks geometry between headings, without injecting fractional
headings into rules packets. It does not claim transit occlusion or readability.
There is no facing indicator; repetition supplies no facing information.

## Adversarial result

[RIM-RUBRIC.md](RIM-RUBRIC.md) records weights and failures before implementation.
Passing supporting criteria cannot rescue the first row.

| Criterion | Weight | Score /100 | Finding |
|---|---:|---:|---|
| Rim-code legibility at planning height | 40% | **20 — FAIL** | Ink is detectable; complete codes cannot reliably be read. Krelath 20, Vraygon 20 separately. |
| Source fidelity | 15% | 100 | Exact supplied codes, Earth blank, no new fiction. |
| Physical placement and orientation | 15% | 96 | Six true skirt faces and measured fit. Deduct 4: no crowded/transit occlusion claim. |
| Period printing and visual restraint | 15% | 93 | Period typeface and physical transfer. Deduct 4 for maximum-size crowding near corners and 3 for ink/carrier approximation. |
| Scope, repeatability and scale | 15% | 100 | Accepted board byte-identical; dimensions/furniture untouched; no shared runtime changes, branch or commit. |

Earth implementation and legibility: **unscored — blank as requested**. Facing and
full-board readability remain unscored and unbuilt. The failed criterion is a
measured blocker, not a request to send Chris a passing frame.

## Verification

The 29 existing prototype checks, unchanged fast suite and rim browser workflow
pass. Automated passes certify contracts and measurements, not reading. The
workflow checks exact codes, blank Earth, six repetitions, geometry below the
skirt top, oversize rejection, six headings, intermediate geometric availability,
black opaque 30 mm posts, and physical blackout. It compares the accepted board
with its existing PNG byte-for-byte and verifies energy isolation of the physical
and shadow buffers. Native crops are unscaled.

Two combined label meshes add 24 triangles, plus their shadow submissions:
planning totals 69,880 triangles / 77 draws, within 70,000 / 90. Material textures
use 19.78 MiB within 24 MiB. The explicit study callback alone supplies lettering;
the main page neither requests nor loads it. Sources, hulls, furniture, scale,
camera and black supports remain unchanged. No full-board test, destruction,
planet/nebula sample, clear-post adoption or identifier alternative was added.

Reproduce with the Playwright/browser environment described in README.md:

```powershell
node arena/prototype-3d/test.mjs
node test/run-tests.js
node arena/prototype-3d/review-rim.mjs
```

`evidence/rim/` contains measurements and diagnostic frames: failure evidence
for Fable, not an approved frame handover. No branch or commit was created;
starting HEAD was aa4b615; external brief-only commits advanced it to fbf124f
on work/presentation-3d during this pass.
