# Complete-library inspection — final adversarial self-review

All three sheets clear the inspection gate: **Earth 96.1, Krelath 94.6,
Vraygon 95.6 /100**. Every hull clears independently. These are Astra's
self-review scores, not Chris's approval.

**I can see the captures.** I directly inspected both rendered views of all
26 hulls, the supplied Earth/Krelath plates, the three shared-scale strips,
and the assembled sheet layouts. Visual scores are based on those images,
not inferred from passing geometry checks. Full-resolution files are retained;
clicking either image in an HTML sheet opens its 1000 × 720 native capture.

- [Earth sheet](fleet-sheets/earth.html) · [full PNG](fleet-sheets/earth.png)
- [Krelath sheet](fleet-sheets/krelath.html) · [full PNG](fleet-sheets/krelath.png)
- [Vraygon sheet](fleet-sheets/vraygon.html) · [full PNG](fleet-sheets/vraygon.png)
- [Rubric written before implementation](FLEET-RUBRIC.md)
- [Provisional scale table](FLEET-SCALE.md) · [every region and surface share](FLEET-REGIONS.md)
- [Scores and bound evidence hashes](evidence/fleet/scores.json)

## Rubric and per-hull scores

All criterion scores are out of 100. Weights: authored geometry/regions **30%**;
period paint/metals **30%**; miniature/scale/mounting **20%**;
inspection/identification **20%**. Metal reading is explicitly included in each
hull's second score: steel and alternate steel on Earth, bronze on Krelath,
gold on Vraygon and Earth sensor dishes. No finish was retuned by faction or
hull to flatter the sheets; all use the existing approved material treatment.

| Hull | Art | Paint / metal | Scale / mount | Inspection | Total | Adversarial deduction |
|---|---:|---:|---:|---:|---:|---|
| EAR Monoceros | 97 | 92 | 95 | 96 | **94.9** | Steel collars and belly retain grain, dark recesses and burnish; warm key still warms the neutral metal. |
| EAR Victory | 97 | 93 | 95 | 96 | **95.2** | Paired nacelles and dish remain distinct; blue still attracts attention more strongly than neutral steel. |
| EAR Saturn | 96 | 92 | 95 | 96 | **94.6** | Three-nacelle arrangement matches its plate; small hull-ring wear is slightly coarse in the side capture. |
| EAR Acamar | 96 | 93 | 95 | 96 | **94.9** | Raised sensor dish and four-nacelle arrangement survive; the lowest fixtures are partly hidden at this angle. |
| EAR Yi Sun-sin | 95 | 92 | 94 | 95 | **93.9** | Long engineering section and steel bands read; retained reduction error is the library maximum, 0.341 mm. |
| EAR Federation | 97 | 93 | 94 | 95 | **94.8** | Six nacelles and multiple picked housings remain inspectable; dense small fittings merge in the shared-scale strip. |
| EAR Yamato | 96 | 93 | 94 | 96 | **94.7** | Raised command pod, dish and spinal ribs match the plate; finely repeated edges are intentionally busier than the flat paint. |
| KRE Sparrowhawk | 98 | 95 | 95 | 96 | **96.1** | Two greens, rough bronze housings and the red emitter ring agree with the approved source treatment; smaller dome remains unlabeled. |
| KRE Swift | 98 | 94 | 95 | 96 | **95.8** | Doubled rear structures and actual forward warning plates remain distinct; some small lining needs the native image. |
| KRE Ballista | 98 | 94 | 95 | 96 | **95.8** | Paired forward warning housings agree with the plate; the source shares Swift's length rather than a guessed class-size increase. |
| KRE Raptor | 97 | 93 | 94 | 95 | **94.8** | Broad circular hull and bronze patches remain separate; fine outline wear is stronger than broad surface texture. |
| KRE Lightning | 97 | 93 | 94 | 95 | **94.8** | Actual raised dorsal housing distinguishes it from Raptor; the same source length makes the scale-strip difference primarily silhouette. |
| KRE Star Knight | 96 | 93 | 94 | 95 | **94.5** | Ring structure and extended forward body retain wash and bronze; small slots merge when the full sheet is reduced to screen width. |
| KRE Bladestar | 98 | 94 | 94 | 95 | **95.4** | Authored pale deck stays flat and separated from the bronze ring; the long upper deck partially hides lower features in side view. |
| KRE Star Lord | 96 | 93 | 93 | 95 | **94.3** | Additional upper structures and bow warning housings are visible; dense overlapping geometry limits the two-view view into recesses. |
| KRE Fighter — Bomber | 97 | 92 | 91 | 91 | **93.1** | Wide swept wing, forward warning fixture and aft outlet are retained; the uniform 25 mm base dominates this 9.45 mm-long piece. |
| KRE Fighter — Interceptor | 97 | 92 | 91 | 92 | **93.3** | Narrower wing and yellow forward fixture distinguish it from the bomber; tiny metallic areas need the native capture. |
| KRE Intrallus | 98 | 91 | 93 | 93 | **93.9** | Twin matte decks, bronze body and actual warning bands retained; fine lining is weakest on the largest smooth green expanses. Filename is necessary to distinguish the two flagship meshes. |
| KRE Boss / Game Secret | 98 | 91 | 93 | 93 | **93.9** | Separate source and derivative retained; material comparison is intentionally almost identical to Intrallus. Local deck geometry differs below normal sheet recognition size. |
| VRA Shard | 96 | 94 | 94 | 96 | **95.0** | Gold body, yellow paint and inert violet regions remain distinct; small green part stays painted. |
| VRA Point | 96 | 94 | 94 | 96 | **95.0** | Twin side structures and green fixtures follow the model; authoritative VDD-03 overrides the filename's missing V. |
| VRA Avalanche | 96 | 94 | 94 | 96 | **95.0** | Twin forward fixtures and yellow additions are preserved; no extra anatomy is assigned to the unschematized model. |
| VRA Feldspar | 96 | 94 | 93 | 95 | **94.6** | Long gold facets show rough metallic variation and recess lining; some lower detail is occluded in this matched view pair. |
| VRA Crystal | 96 | 94 | 93 | 95 | **94.6** | Broad painted yellow structures stay distinct from gold and cyan stays paint; green crystal is not switched to clear. |
| VRA Cluster | 96 | 94 | 92 | 95 | **94.4** | Repeated aft sections and broad bow compare clearly; large-hull stability on the shared base remains a scale-proposal question. |
| VRA Bastion | 96 | 93 | 91 | 92 | **93.3** | Tall arrangement is kept upright and fully framed; it produces the smallest readable side capitals and the strongest provisional mounting concern. |

Four code-legibility subitems are unscored because Chris supplied no codes:
the Bomber, Interceptor, Intrallus and Boss/Game Secret flagships. Their rims
are blank, their captions say pending, and their complete-hull inspection
scores assess the supplied geometry and honest identification instead.

## Whole-sheet scores

Weights: completeness/authority **30%**; direct visual comparison **30%**;
provisional shared-scale strip **25%**; reproduction/scope **15%**.

| Sheet | Complete | Comparison | Scale strip | Reproduction | Total | Adversarial deduction |
|---|---:|---:|---:|---:|---:|---|
| EAR | 100 | 95 | 94 | 94 | **96.1** | All seven source classes, corrected codes and matched views; shared-scale strip intentionally leaves space to preserve the same scale as Krelath. |
| KRE | 100 | 92 | 92 | 93 | **94.6** | All twelve models, four honest blank codes and both full flagship filenames; longest sheet, small fighters and almost-identical flagships demand native-image inspection. |
| VRA | 100 | 95 | 92 | 94 | **95.6** | All seven models and corrected V-prefixed codes; the source-unit calibration has no independent Vraygon physical-length reference. |

The native sheets are 3200 pixels wide: Earth and Vraygon 4190 pixels high,
Krelath 5819. All two-view cells and all strip entries are present and unclipped.
The shared strips are **3.333 pixels/mm at native sheet width**, including the
same 50 mm reference bar. Every strip capture uses exactly the same orthographic
camera and projection; composition only crops/translates. Browser fitting and
overview images reduce the entire sheet uniformly. The two main views fit
each complete assembly independently and are explicitly labelled as inspection
views, not a common physical scale.

## What the hostile pass still sees

Earth's neutral metallic body is less conspicuous than its blue paint under
the warm key. The steel now has dark recesses, broken bright real edges and
fine rough variation; it does not read as white trim or a mirror in the native
inspection views. The neutral metal remains the weakest of the three metal
hues, reflected in its scores. This does not claim the postponed full-board
material-recognition result.

Krelath's large smooth surfaces carry less visible lining than the small
frigate because the source supplies fewer recesses per visible area. Both
flagships receive the lowest metal/paint scores, **91**, for that limitation.
No decorative panel lines were invented. Pale flight decks remain dead-flat.
The two greens remain separate paint regions without a new explanation for
their fictional distinction.

The fighter stand dominates the piece, and Bastion looks tall above a small
base. Both are visible consequences of the proposed scale ladder and uniform
mounting contract. Stability, spacing, practical casting and an approved
cross-class ladder still need Chris's judgement. The sheets do not hide them
with larger fighter geometry, shorter fighter posts or larger capital bases.

The provisional formula is **55 × sqrt(calibrated metres / 205) mm**, spanning
**9.45–96.90 mm**. Fighter forward fixtures and aft outlets establish source
**−X**, while source Y is wing span; they do not inherit the frigate's −Y axis.
The Bomber is 6.05 calibrated metres / 9.45 miniature mm, the Interceptor
7.76 m / 10.70 mm. Vraygon has no independent physical-length calibration in
the staged references, so the common source-unit factor remains provisional
there. No hull lacks measurable geometry, but those Vraygon metres are an
explicit calibration assumption.

## Both flagship files: the actual difference

`Supreme Leader's Flagship Intrallus.glb` and
`Krelath Star Navy - Supreme Leader's Flagship (Boss. Game Secret).glb`
are retained as separate source and prepared assets, with separate cells.

| Source property | Intrallus | Boss / Game Secret |
|---|---:|---:|
| Native forward axis | −Y | +X |
| Source triangles | 482,876 | 483,242 |
| Aligned longitudinal / beam / height units | 289.988 / 98.640 / 63.481 | 289.988 / 98.640 / 63.481 |
| Calibrated length / provisional miniature length | 636.31 m / 96.90 mm | 636.31 m / 96.90 mm |
| Source flight-deck surface share | 3.26745% | 3.25748% |

They differ in source placement/orientation, triangulation and local surfaces;
**they have essentially the same silhouette and overall component arrangement**.
Boss has 366 more source triangles. After centring and rotation, 99% of sampled
vertices lie within about 0.0004 miniature mm of the other mesh. The largest
measured difference is **0.1391 mm** from Intrallus to Boss; the reverse maximum
is **0.00332 mm**. The larger difference falls on boundaries between the
forward pale flight-deck region (`#c8e4bd`) and dark-green hull (`#126936`).
This is a local geometric difference, not evidence of a different weapon loadout.
At normal sheet size I cannot reliably distinguish the two without the filenames.

[Comparison evidence](evidence/fleet/flagship-comparison.json) measures every
source vertex against the other mesh's closest triangle in both directions.
It is not a certified continuous Hausdorff bound and does not establish that
the two models are interchangeable for future gameplay or asset intake.

## Integrity, preparation and budget

The actual individual count is **26**, not roughly 24: **7 Earth, 12 Krelath,
7 Vraygon**. Exactly the three named composite fleets are excluded. Zandrax
has no supplied library and is explicitly absent. No source files were changed;
all 26 SHA-256 hashes are checked against the initial source inventory.

Preparation uses Blender 5.2: apply export transforms, weld only coincident
vertices, decimate, preserve COLOR_0, normalise the declared longitudinal axis,
and scale the derivative. The initial target is 26,000 triangles (or 60% of an
already-small mesh). Failed geometry/component checks increase retained detail.
Every final hull preserves its connected-component count, every palette region,
and stays below **0.35 mm** maximum sampled vertex-to-surface error in both
directions. The actual worst error is **0.34077 mm**; the greatest per-region
surface-share change is **0.11143 percentage points**. Surface tables count
exported triangle area, not vertex counts or just outward-visible faces.

The GLBs total **52,911,468 bytes (50.46 MiB)** versus **339,987,540 bytes
(324.24 MiB)** of individual sources: **84.44% less**. Most hulls are about
26,000 triangles or fewer. Exceptions preserving small components are
Federation (83,527), Raptor (118,058), Lightning (140,472), Bladestar (156,892),
Intrallus (385,563) and Boss (385,898). These are inspection derivatives;
the two flagship meshes are not evidence of an acceptable full-board budget.

The isolated studio loads one model at a time and disposes its previous model,
paint-edge resources and rim texture. Its explicit cap is 1.2 million submitted
triangles, including shadows; the largest capture is **777,666**, Boss. There
is no energetic draw or transmission pass. The capture canvas is 1000 × 720,
with one 2048² shadow map and the existing room reflection treatment. Peak GPU
memory, integrated-GPU behaviour and full-board performance remain unmeasured.

Each prepared region file contains exact emissive-designated face membership
in its energy attachment map. Every attachment is disabled; no new subsystem
function or socket is inferred. Removing room light and reflections produces
**zero non-black pixels for every hull**, including all bright regions.
Vraygon green remains painted; pale cyan is regular paint.

## Codes and the existing board

Codes come from the explicit `fleet-assets.json` table, never filename parsing.
That includes **VDD-03 Point**, **VBB-01 Cluster**, and **EFG-03 Monoceros**.
The board now uses all three supplied frigate codes. Off-white bold Arial
waterslide transfers repeat the same code on all six bevelled skirt faces;
they carry no facing signal. Capitals are 2.6 mm high. In native close-side
captures the best-facing capitals measure **14.72–23.98 pixels** and can be read.
No result here reverses the earlier **20/100 native planning-legibility finding**.

The board remains inside its original painted cap: **69,904 triangles / 79
draws**, against 70,000 / 90. The existing opt-in clear-Shard experiment now
costs 104,901 / 119: three physical rim transfers add nine submissions across
its passes. Its separate draw cap is explicitly updated from 110 to **119**;
its triangle and target-memory caps are unchanged. Clear is still opt-in and
no post becomes clear. Furniture geometry/materials, facing and shared runtime
are unchanged.

## Verification and reproduction

- Main fast regression suite: **passed**.
- Existing prototype checks: **29 passed**.
- Complete-library checks: **30 passed**; reject missing codes, palette faults
  and missing region classifications; check source/derivative hashes, reduction,
  all 26 inert captures, mounting, size and common strip projection.
- Existing browser review: **passed**, including the new board-code assertions,
  playback pause/skip, information boundary, clear opt-in and SVG fallback.
- Fleet browser capture: **78 views passed**, no browser errors or clipping;
  every post seated within 0.001 mm at both ends.
- Sheet export: **three passed**, exact manifest/cell/strip membership, all images
  decoded, no caption overflow. Final export refuses scores below 90 or changed
  image/GLB/material-contract evidence hashes.

From the repository root (Blender and Playwright must be locally available):

```powershell
node arena/prototype-3d/fleet-inventory.mjs
node arena/prototype-3d/prepare-fleet.mjs
node arena/prototype-3d/capture-fleet.mjs
node arena/prototype-3d/test-fleet.mjs
node arena/prototype-3d/build-fleet-sheets.mjs
node arena/prototype-3d/capture-fleet-sheets.mjs
```

`PROTOTYPE_BLENDER`, `PLAYWRIGHT_MODULE` and `PROTOTYPE_BROWSER` optionally point
to the local Blender executable, Playwright module and browser. Supply hull IDs
to preparation/capture to rebuild a subset. After a fresh direct visual review
and updated evidence-bound scores, `capture-fleet-sheets.mjs --final` produces
the deliverable sheets. Source files are working copies under ignored `source/`;
regeneration requires those supplied libraries, while the prepared assets and
static sheets are self-contained inside the prototype.

Unscored and outside this delivery: the four unsupplied codes; full-board
recognition/performance and final scale approval; facing; clear-plastic adoption;
destruction; planet/nebula samples; Zandrax. None has been quietly marked passed.

All implementation changes stay inside `arena/prototype-3d/`. No permanent asset
intake, shared-runtime changes, branch or commit. HEAD remains **03c12bf**.
