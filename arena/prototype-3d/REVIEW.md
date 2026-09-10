# Adversarial review - revision 03, 10 September 2026

**This slice clears my review gate: every criterion is at least 90/100.**
The weighted score is **95.30/100**. These are my assessments of the captured
prototype, with deductions below; they are not Chris's approval.

I **can see my captured images**. I directly inspected all eight final captures:
planning, beam, shield, anonymous arrival, and the Sparrowhawk's plan, side,
stern and bow close-ups. I compared the hull with its source colour regions,
v2 schematic and written conventions. Visual scores come from those images,
supported by measurements, not from geometry checks alone.

I missed `COLOR_0` in the previous inspection. My assertion that the colour
reference was absent was wrong. The full generated-art criterion is now
scored, including colour placement, metallic regions, warnings and the
physical/energetic split. No geometry-only substitute is used.

The criteria and weights in [RUBRIC.md](RUBRIC.md) were written before the
rebuild and retained for this pass. Each criterion must independently reach
90; averaging cannot rescue a failure.

| Criterion | Weight | Score /100 | Evidence and explicit deductions |
|---|---:|---:|---|
| Brief and scope fidelity | 20% | **100** | Correct current Sparrowhawk derivative, three hulls and exactly one developed paint candidate. Black bases/posts, measured scale, one warm shadow key, shared playback clock, camera floors and observation projection remain. Physical paint emits nothing; separate energy uses the actual exhaust and larger dome. No shared implementation, source intake, new identifier, destruction or full-board work. No contrary behaviour found within this slice. |
| Fidelity to generated art | 25% | **95** | All seven source regions retained; both greens, actual bronze housings, orange collector/exhaust/radiators, yellow domes, red rings and white windows follow the model. Bow/stern, nacelle, unequal domes and lower aft doors agree with the schematic. No new panels, plasma projector or second weapon. -2: decimation introduces a small measured surface approximation, not a certified continuous bound. -3: the finest window shapes and door separation require close inspection and are less distinct in the ordinary view. |
| Period materials and painting | 20% | **92** | Flat block coats, dark actual recesses, glossy ink pooling, chalky raised-edge work and picked bronze read as painted miniatures under room light. The board reads as printed card; stands are black. No painted zenithal gradient or luminous pigment. -4: edge strokes retain more regular widths than individual handwork. -2: bronze has a broad, simplified metallic highlight rather than resolved paint flakes. -2: box-cover art and wood grain are visibly stylised. |
| Scale coherence | 20% | **96** | All 16 dimension rows checked against built geometry and visually compared. Mug 95 mm tall / 80 mm diameter, D6 16 mm, D20 20 mm vertex diameter, book/notebook 216 x 279 mm, pencil 190 mm, hex 32 mm. Frigates are 45/55/65 mm. -2: the D20 sizing convention is declared but not confirmed against Chris's actual die. -2: table/board/base dimensions are explicit prototype choices, not approved production dimensions. |
| Unaided tabletop reading | 15% | **93** | Planning and resolution read as miniatures on a printed board on a furnished table. The mug, books, dice, card edge, black stands and warm shadows establish size; restrained effects remain separate from the paint. No forbidden angle or added surface density was needed. -4: fine window/ring work diminishes at ordinary planning scale. -3: simplified background props and focus blur still disclose the illustrative prototype. Full-board recognition is not credited here. |

## Visual evidence

The [planning frame](evidence/planning.png) establishes the complete tabletop;
the [beam](evidence/beam.png), [shield](evidence/shield.png) and
[anonymous arrival](evidence/anonymous.png) exercise the resolution presentation.
The [paint close-up](evidence/sparrowhawk-detail.png),
[side](evidence/sparrowhawk-side.png), [stern](evidence/sparrowhawk-stern.png)
and [bow](evidence/sparrowhawk-bow.png) expose the real colour and feature map.
All four close-up cameras also obey the 240 mm height and 32-degree pitch floors.
The final frame hashes and criterion scores are attached in
[adversarial-review.json](evidence/adversarial-review.json).

The hostile pass checked specifically for misplaced stripes/trim, black lines
on smooth triangulation, glowing physical yellow/orange, a second guessed
weapon, wrong stern glow, low-angle dependence and implausible relative sizes.
The final captures show the source's own coloured shapes and actual crease
work. Chalk deposition is filtered when minified; the focus blur uses a compact
nine-tap kernel. These address small-scale shimmer and doubled background text
found during iteration. Intermediate frames are not submitted as accepted work.

## Validation supporting the measurable claims

- **20 prototype checks pass; all 38 unchanged fast-suite groups pass.** No
  shared test runner, fixture or runtime was edited.
- Source: 83,508 triangles / 7,015,984 bytes to 13,351 / 371,208. All three
  welded components and seven colours retained. Maximum measured bidirectional
  vertex-to-triangle error: **0.037093 mm**. Maximum colour-area fraction change:
  **0.019017 percentage points**. This measures preservation, not visual merit.
- Actual crease masks: 1,450 concave and 978 raised edges; unmatched edges are
  not invented seams. Analytic cube, plane and concave-fold checks pass. Missing
  or unknown colours, missing classification and mixed registers fail loudly.
- Lights off: **0 non-black physical pixels**, **1,330 energetic pixels**.
  Physical colour hashes remain `5922a43f`; shadow hashes remain `e94c0ec`
  with effects disabled/enabled. This includes the bright physical paint.
- Energy occlusion: hidden probe 0 samples, exposed probe 424. Pause, skip,
  reduced motion and SVG fallback pass. Browser/page console errors: **0**.
- Ordinary captures: **67-76 draw calls / 60,280-61,310 submitted triangles**,
  below the 90 / 70,000 caps. Material textures estimate 22.67 MiB against
  24 MiB; target buffers remain within their estimated 64 MiB cap.
- Edge 152, RTX 5060 Ti, ANGLE D3D11: 60 warm 1920 x 1080 submission-plus-
  `gl.finish` samples average **0.55 ms**, p95 **0.70 ms**. This small three-hull
  probe is neither production latency nor a full-board performance result.
- `git diff --check` passes. Implementation remains inside the prototype;
  supplied sources and the pre-existing user ignore change are preserved.

The [republished scale table](SCALE.md) has unchanged dimensions. The source,
paint and register contracts and rebuild commands are in
[SOURCE-GAP.md](SOURCE-GAP.md); its filename is retained, but the old blocker
explanation has been replaced with the correction.

## Questions and explicitly unscored work

Both greens are painted hull greens with identical material treatment. Their
fictional distinction remains Chris's question. The smaller dome keeps its
actual paint and warning ring, with no functional label, mount or glow.
These unknown meanings do not prevent reproducing the supplied art.

No criterion in this slice remains unscored. The following are outside it and
receive no implicit score: Chris's replacement identification scheme, full-board
readability/performance, the cross-class size ladder, destruction, and
planet/nebula samples. The [identification proposal](IDENTIFICATION.md)
recommends testing authored hull paint plus a rim class code; no code, badge,
counter or faction accent has been implemented. The frigate-only size variation
is provisional.

Interactive target-machine and integrated-GPU performance, peak decoded-image
and driver memory still need measurement. Permanent intake, exporter root and
roster-to-filename fixes remain with campaign-map; integration/picking with map;
live controls with console. No commit or branch was created. Work stops here
for Chris's frame review, before destruction or the full-board test.
