# Adversarial review - revision 04, 10 September 2026

**The three-frigate slice clears my self-review gate: 94.30/100 weighted, with
no criterion or individual hull-material score below 90.** These are my
assessments of the final captured work, not Chris's approval of this revision.

I **can see the images**. I inspected the ordinary planning frame at native
size first, then its three unscaled hull crops, the beam/shield/anonymous frames,
and all twelve hull close-ups: **19 final images**. Monoceros was compared with
its v3 schematic/provenance and model regions; Sparrowhawk with its approved
source placement and v2 references; Shard with its supplied model and regions.
No missing schematic is treated as a missing Shard reference.

The [rubric](RUBRIC.md) was updated before implementation. It explicitly adds
**reads as painted metal rather than rendered plastic**, weighted at 25%, and
requires each hull to pass that material criterion individually. The scores
below do not carry forward the previous materials score.

| Criterion | Weight | Score /100 | Evidence and deductions |
|---|---:|---:|---|
| Brief and scope fidelity | 15% | **100** | All three current frigates have local derivatives and the developed treatment. Black stands, projection, clock and camera floors retained. Furniture/scale definitions, live runtime, shared fixtures and other sessions' files unchanged. No new identification scheme, destruction, planet/nebula or full-board work. No contrary behaviour found in this slice. |
| Fidelity to generated art | 25% | **94** | All 9/7/7 palettes and 2/3/33 connected components retained, with per-hull interpretation. Real geometry controls lining/highlights; actual small fixtures remain. Earth and Krelath effects use confirmed face patches. Shard has no invented anatomy or effect sockets. -3: Earth/Shard reduction approximates the source by up to 0.259/0.175 mm in the measured vertex-to-surface comparison. -3: fine nav/windows and some reduced contours require close inspection; the bound is not a continuous surface certificate. |
| Painted metal rather than rendered plastic | 25% | **91** | Matte body response, readable native-planning lining/edges, restrained dull metallics, uneven coverage and sparse actual-corner wear. Broad body/chrome highlights have been removed. This criterion takes the **lowest** of the three individual assessments below; it is not their average. |
| Period technique and register fidelity | 10% | **95** | Opaque block coats, black recesses, local ink pooling, chalky strokes and picked metal follow period techniques. Bright paint emits nothing; energy is a separate drawable with no room-light/shadow contribution. -3: computed brush deposits retain more regularity than a particular painter's hand. -2: casting imperfections are represented by retained source softness and paint coverage, without an independently authored mould seam/flash pass. |
| Scale coherence | 10% | **96** | All 16 existing dimension rows measured; furniture dimensions unchanged. Current 55/65/45 mm hulls have newly published measured height/width, and posts meet the new undersides at uniform 30 mm exposed length. -2: D20 opposite-vertex sizing remains a declared convention. -2: table/board/base production dimensions remain prototype choices. |
| Unaided play-element reading | 15% | **93** | At native planning size, the three ships read as painted objects on black stands, with distinct silhouettes and source schemes. Resolution retains the table and legal angle. -4: the small Shard's finest violet/fixture work loses separation at planning distance. -3: individual wear flecks are subordinate to the readable larger lining/highlight pattern. No full-board recognition score is implied. |

## Individual material assessments

| Hull | Score /100 | What was judged at planning height and then close-up |
|---|---:|---|
| Monoceros | **92** | Matte blue/pale coats, dark curved recesses, picked collars/rails and preserved small colours read as careful period painting. -4: collar-edge strokes remain regular. -2: very small chips are not individually resolved in the ordinary frame. -2: the pale paint is still cleaner than a specific aged miniature would be. |
| Sparrowhawk | **93** | Broad green flanks absorb the key; black feature boundaries and chalky leading edges survive the planning view. Bronze gives a dull local return rather than a broad chrome patch. -4: its deliberately dull bronze can read close to brown in the top view. -3: long highlighted edges remain more uniform than individual brushwork. |
| Shard | **91** | Real hexagonal surface features, purple/violet regions and gold framework retain dark separations and chalky corners without mirror reflections. -4: gold/yellow dominates its small planning silhouette, leaving subtler colours less distinct. -3: edge work is comparatively heavy on this compact hull. -2: its fine coverage pattern remains procedurally regular. |

These are visual judgments, not scores inferred from shader constants. There is
no unscored criterion within this slice. The minimum individual material score
is used for the material criterion so stronger hulls cannot conceal a weaker one.

## Supporting checks and evidence

- **23 prototype checks pass. All 38 unchanged fast-suite groups pass.** The
  tests reject stale repo hulls, cross-hull colour maps, unknown colours,
  guessed effects and missing/mixed register classifications. They verify exact
  source colour counts, derivative hashes, all connected components, physical
  scale, projection boundaries and the existing playback clock.
- All three preparations were repeated; GLB bytes remained identical. Shard's
  reduction generated 20 duplicate faces, removed locally before measurement
  and export. Source libraries are untouched. Full per-hull interpretation,
  reduction and colour-area measurements are in [SOURCE-GAP.md](SOURCE-GAP.md).
- Native-planning brush ablation, one hull at a time: **823 Earth / 680 Krelath /
  589 Vraygon pixels** change by more than 0.025 in a linear colour channel.
  This confirms an observable contribution at the actual viewing distance;
  it does not measure artistic quality or replace viewing the frame.
- Lights off: **0 non-black physical pixels**, **1,309 energetic pixels**.
  Effects off/on: physical buffers both `672010a4`, shadow buffers both
  `2eca1c08`. Bright paint remains part of the physical pass.
- Energy occlusion: hidden probe 0 samples, exposed 424. Pause, skip, reduced
  motion, classification, analytic crease tests and SVG fallback pass. **Zero
  page or console errors.** Every captured camera meets both floors.
- Ordinary captures submit **68,736-69,766 triangles / 66-75 calls**, within
  70,000 / 90. Material textures total **17.31 MiB**, including **5.31 MiB**
  of actual-crease coordinate data, under 24 MiB. Target allocation remains
  within the estimated 64 MiB cap.
- Edge 152 / RTX 5060 Ti / ANGLE D3D11: the warm three-hull 1920 x 1080 probe
  averages **0.48 ms**, p95 **0.70 ms** for submission plus gl.finish. No full-board
  or target-hardware performance claim is made.

[Planning](evidence/planning.png), [beam](evidence/beam.png),
[shield](evidence/shield.png), [anonymous arrival](evidence/anonymous.png) and
all native crops/close-ups are linked from [README.md](README.md).
[adversarial-review.json](evidence/adversarial-review.json) records the rubric,
individual deductions, source/output evidence and all 19 reviewed image hashes.
The [scale table](SCALE.md) is republished with the current hull bounds.

## Remaining questions and scope

Sparrowhawk's two greens retain identical hull-paint treatment without inferred
meaning. Its smaller dome keeps its source colour and warning ring, with no
function, second mount or glow. Shard's unclear region functions remain
unassigned; its model was sufficient for the completed paint pass. Gold-pigment
handling is a paint choice, not a fictional-system classification.

The existing [identification proposal](IDENTIFICATION.md) is unchanged and
unimplemented. Furniture was not developed. No commit or branch was created;
implementation remains in `arena/prototype-3d/`, with a separate standing-mailbox
report. Campaign-map retains permanent intake and exporter/roster fixes; map
retains integration/picking; console retains live controls.

Explicitly unscored outside this slice: replacement identification and full-board
readability/performance, the cross-class scale ladder, destruction, planet/nebula
samples, interactive/integrated-GPU timings, and peak decoded-image/driver
memory. Work stops here for Chris's frame review.
