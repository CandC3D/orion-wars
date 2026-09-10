# Adversarial review — revision 07

**Self-review: 94.30/100. Every criterion clears its independent 90 gate.**
The earlier Earth-metal and Shard-comparison scores are withdrawn. This review
starts from Fable's findings; the geometry count never stands in for visual
material quality. Chris has not approved this revision.

I can see the captures. I inspected native planning and hull crops first, then
metal detail views, the larger Crystal pairs and both post views. The deciding
clear comparison is now Crystal, including close material views; Shard's old
pair is not used to pass that criterion. Reviewed images are named in the
evidence artifact, alongside hashes of the complete capture set.

| Pre-build rubric criterion | Weight | Score /100 | Finding and deductions |
|---|---:|---:|---|
| Brief and ownership | 10% | 98 | Final implementation is confined to the prototype; furniture, sources, identifiers and shared runtime unchanged. Deduct 2 for a briefly misplaced placeholder file, disclosed below. |
| Authored geometry and palettes | 15% | 97 | All four prepared hulls retain their own regions; Crystal retains 53 components and its eight green patches. No enlarged/relocated part or invented weapon assignment. Deduct 3 for the measured reductions' small surface deviations. |
| FASA base and post geometry | 15% | 95 | Retained bevelled skirt, six shallow roof facets and central apex; gentle taper and seated endpoints. Deduct 5 because exact original FASA dimensions have not been verified; the chosen dimensions are explicit. |
| Steel reads as metal at planning height | 20% | 91 | The native collars and rails now have darker bodies, dark joints and brighter burnished edges; they read as dull metal rather than white trim. Deduct 5 for the warm key's pewter tint and 4 because flake itself remains unresolved at ordinary planning size. |
| Period finish on all hulls | 10% | 93 | Rough steel, bronze and gold; matte body paint, real-edge brushwork and no mirror images. Deduct 4 for regular stroke breakup in macros and 3 for subdued fine-flake cues on small surfaces. |
| Decidable clear-material experiment | 20% | 92 | Matched Crystal detail/side/plan pairs and actual-size black/clear posts make the choice visible. Deduct 4 for convex-volume and single-screen-space-ray optics, 3 for coloured backing/reflections obscuring green identity, 1 for approximate shadow coverage. |
| Scale, registers and readable play elements | 10% | 98 | Measured skirt, pyramid, taper, exposure and mount gaps; no physical emission or planning energy; existing camera floors retained. Deduct 2 for provisional miniature/class-study sizes. |

Separate gates: **steel at planning 91; Earth metal in detail 92; Krelath
bronze 93; Vraygon gold 93; Crystal clear comparison 92; clear-post comparison
93.** None is rescued by the weighted score. No in-scope visual criterion is
unscored.

## The mounting geometry

The base remains 25 mm across flats. Its original 3 mm bevelled skirt is intact;
the top now rises another 2 mm through six planar faces to the apex. Above that
apex is 30 mm of exposed post, tapering from 3.0 to 2.4 mm diameter. Geometry
measurements and a deliberate post-stretch failure test prevent the scale table
from simply repeating constants.

The old cylinder was buried 0.5 mm in the flat base and ended 0.5 mm below the
declared hull attachment. Its actual exposure was 29.5 mm despite the 30 mm
geometry parameter. Both new endpoints are seated explicitly. The three
measured exposures are 30 mm; maximum end gap is under 0.000002 mm (floating
point error). Skirt, pyramid rise and exposed post are separate SCALE.md rows.

Chris's FASA profile governs the shape. I found the mechanics notes but no
original base photograph or dimensioned drawing in this worktree. The
[1986 FASA catalogue](https://tardiscaptain.com/wp-content/uploads/2021/04/FASA-Spring-1986-Catalog.pdf)
describes clear plastic stands; the dimensions above are chosen prototype
dimensions, not purported measurements from that catalogue.

## Steel and the room

The previous pale response survived correct region assignment. The new steel
film is darker and has stronger burnish on measured convex edges, with fine
value variation filtered below a pixel. All metals now share metalness 0.58,
roughness 0.62, edge roughness 0.53 and 0.12 mm flake pitch. Steel has its own
film value; its bright return no longer depends on a pale base colour alone.

A 128-pixel cube capture of the already-lit physical tabletop supplies rough
room reflections to the hull and clear materials. It adds no furniture or light.
The existing hemisphere still supplies diffuse fill. Captured reflections are
disabled with the room lights in the blackout test. No sharp room image appears
on the metal, and the grey surfaces retain texture and dark joints in detail.

The blues remain saturated and visually prominent. They have not been altered
to manufacture a steel majority. Source steel remains 43.952% of total surface;
the new mounting position gives 39.48% of native visible pixels to steel and
53.52% to both blues. Fable's outward-facing surface measurement and this
camera's pixel coverage measure different things; neither is a material score.

## The larger comparison and the post decision

Crystal is a separate, provisional 90 mm study asset. Its local derivative is
377,776 bytes / 11,742 triangles, from 1,987,232 bytes / 23,642 triangles. All
53 components remain. Maximum measured vertex-to-surface deviation in either
direction is 0.142754 mm, not a certified continuous Hausdorff bound. The green
region is 1.091% of source area across eight patches. No specific system anatomy
is invented, and pale cyan stays paint.

The [comparison page](variants.html) puts the matched material details first,
then whole-hull context and the black/clear post pair. The live material study
keeps the same cameras when switching variants. Neither source geometry nor
the green fixture scale changes. The deciding close view supplies 10,610 clear
pixels, with a measured median optical path of 1.333 mm. That supports a visual
comparison; the old tiny Shard pair did not.

Clear parts use glossy dielectric transmission, IOR 1.57 and roughness 0.095,
without paint marks. Green absorbs with depth over 2.5 mm; the post is nearly
colourless, slightly cool styrene. Each green patch uses its own convex optical
volume; the post measures ray exit from its finite cone. Optical caps do not add
visible triangles. The post test measures a 2.196 mm median ray path. Distorted
board print remains visible through the post; it has a small surface glint and
a much weaker shadow than its black neighbour.

The shadow test measures 17 changed shadow pixels for the transmitting post,
versus 194 when forced opaque. Coverage is an approximation of transmitted key
light, not a simulation of caustics or coloured refraction in shadows. The
painted green geometry is also masked out of the opaque shadow pass when clear
is enabled. No self-emission is used to make plastic readable.

My preference is **clear for the stand's float illusion**. On Crystal I prefer
the clear kit-part impression in detail, while paint identifies the green more
clearly. The gold caps/backing and the dark board remain visible influences on
the clear material. Chris decides adoption. Every post on the three-frigate
board remains black and opaque; only the isolated post study draws clear posts.

## Validation and budgets

- 29 prototype checks and the unchanged fast suite pass (exit 0).
- Both browser workflows pass, with no page or shader errors. All 23 board
  region masks and the additional eight-colour Crystal contract pass.
- Six roof facets, actual geometry dimensions, post-stretch rejection and both
  mounting endpoints are verified. All visible review cameras obey the floors.
- Paint, green clear parts and clear posts output zero physical pixels with
  room illumination removed. Planning has zero energy objects. Energy on/off
  leaves the physical and shadow buffers byte-identical.
- The existing clock's pause, skip and reduced-motion behaviour, safe event
  projection, depth occlusion and SVG fallback still pass.
- Main planning submits 69,832 triangles / 73 draws, under 70,000 / 90. Hull
  material textures including the captured room use 18.81 MiB, under 24 MiB.
- The retained clear-Shard board submits 104,793 / 110, within its separate
  110,000 / 110 limit. It is not the deciding plastic study.
- Crystal's largest capture submits 41,642 / 55; the post pair 7,144 / 47.
  The separate study caps are 90,000 / 110, 2.07M pixels and 160 MiB estimated
  offscreen targets. Full-resolution transmission estimates 80.97 MiB at the
  captured size. The estimate excludes driver overhead and the browser's
  default drawing buffer; allocation persists after switching back to paint.
- The three-hull Edge/RTX 5060 Ti probe is approximately 0.35 ms mean / 0.50 ms
  p95 for submission plus gl.finish, 60 warm samples at 1920 x 1080. This says
  nothing about full-board or integrated-GPU performance.

Unscored outside this slice: full-board performance/readability, identifier
choice, class scale ladder, original-part dimensional calibration, destruction,
planet/nebula samples, permanent intake, unavailable hulls, peak driver memory
and integrated-GPU behaviour. No such work was added to meet a score.

Boundary slip: I briefly created a placeholder `review-study.tmp` at the worktree
root and removed it immediately. No existing file outside the prototype was
modified. All surviving implementation changes are under arena/prototype-3d/;
furniture and sources remain untouched. No branch or commit was created.
