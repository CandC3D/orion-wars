# Adversarial review - revision 05

**Self-review: 93.95/100 weighted; every criterion passes its separate 90 gate.**
These scores replace revision 04. That art score was invalidated by the wrong
Earth material classification. They are my assessment for Chris to inspect,
not a claim of his approval.

I can see captured images. I opened all 25 final captures, starting with the
ordinary planning frame and native crops, then resolution and each hull's
plan/side/stern/bow detail views. I also opened the Monoceros v3 and Sparrowhawk
v2 source schematics. Shard uses its geometry/COLOR_0 and Chris's material sets;
there is no invented schematic. No in-scope visual criterion is unscored.

## Rubric, evidence and deductions

The [rubric](RUBRIC.md) was written before implementation, then extended before
building the clear variant when the newer mailbox ruling was found. A failed
criterion cannot be rescued by the weighted average.

| Criterion | Weight | Score /100 | Adversarial finding / deduction |
|---|---:|---:|---|
| Brief and scope | 10% | 100 | Three current local frigates; furniture, black bases, identifier choice, sources and shared runtime unchanged. Only prototype implementation files changed. The clear comparison is explicit and retains paint as default. |
| Generated art and classification | 25% | 95 | Steel/bronze/gold masks and all 23 regional areas re-derived and checked. No swapped blue/steel faces. All faction emissive sets are separate. Deduct 3 for the existing reduction's small surface deviations (Shard area drift up to 0.629 percentage points), 2 for the provisional Earth dish substance. No uncertain function becomes a socket. |
| Period metallic finish | 25% | 90 | Lowest of Earth 90, Krelath 91, Vraygon 92, assessed separately below. No averaging across hulls. |
| Body paint, period and registers | 15% | 94 | Real recesses remain black-lined and raised edges readable at planning distance; body paint absorbs broad highlights. All source colours go dark without room light. Deduct 4 for still regular, algorithmic stroke breakup visible in macros, 2 for the clear insert's thin-volume/opaque-shadow approximation. |
| Scale coherence | 10% | 98 | All measured dimensions unchanged, including 55/65/45 mm lengths and 30 mm black posts. Deduct 2 for the provisional frigate size choices; no cross-class evidence claimed. |
| Unaided play-element reading | 15% | 92 | Distinct metal-and-paint miniatures and physical supports read at allowed heights. Deduct 5 because metal character is weaker at the small planning size than in detail, 3 because tiny fixture detail cannot be read there. Full-board identification is outside this score. |

## Metals, individually

| Hull | Score /100 | What I could see / deduction |
|---|---:|---|
| Monoceros / steel | 90 | A dull grey metal structure with bright collars/rails, darker inked joints and blue panelling. Fine grain is present in detail and the return stays broad and rough, without chrome. Deduct 6 because the warm room still pulls steel towards a beige pewter in some views, 4 because at planning size several collars read primarily as a light value. |
| Sparrowhawk / bronze | 91 | Bronze housings retain the actual boundaries and dark recesses; body greens stay matte. The close views show binder grain and a soft metallic return. Deduct 5 because the broad oval housing reads quite subdued head-on, 4 because the fine flake itself is unresolved at planning distance. |
| Shard / gold | 92 | Warm dull gold covers the majority of the hull, with dark structural recesses and brighter real edges. Yellow painted facets have a different, flatter return. Deduct 4 because neighbouring yellow and gold remain close in value under this key, 4 because grain and finish distinction diminish at planning size. |

Metalness 0.52 / roughness 0.67 and 0.12 mm filtered flake pitch are common to all
three; edge roughness is 0.53. None uses a different finish to manufacture faction
identity. Matte body roughness remains 0.98. Ink, drybrush and picked widths are
0.25 / 0.38 / 0.12 mm. These measurements support the visual review; they do not
supply its score.

## The Earth inversion

Source steel is 43.952%; bright/deep blues together are 47.679%. The derivative
keeps those areas within 0.039 percentage points. The native planning ID pass
sees 808 steel pixels (38.77%) and 1,122 blue pixels (53.84%). That is the actual
camera-visible geometry, not a material mask swap. The previous error was in
hull-art.js calling steel pale paint. The new mask is tested in the actual
browser geometry. Forcing a majority of visible pixels to steel would require
changing Chris's blue regions or the already-approved camera.

## Optional clear insert: 90/100

The [matched comparison](variants.html) retains both versions. The clear insert
has no lining, chalk, chips or paint shader; the smooth green surface transmits
and changes density across its measured depth. Its actual gold backing affects
the transmitted colour. I prefer paint for planning readability, clear for the
close-up impression of a separate kit part. Chris decides; the default is paint.

Deduct 4 for the thin-volume approximation rather than a closed solid; 2 for its
opaque shadow; 2 because its gold backing pushes the green towards olive; 2 for
limited planning legibility. The part is 4.831 x 1.751 x 4.260 mm, 24 exact source
triangles and only 23 planning pixels. Both detail pairs are legible at their
native size, so no larger hull, enlargement or relocated fixture was needed.
This is a detail-view comparison, not evidence that clear parts improve Fleet
Command identification. Camera positions/lenses are asserted identical in each
pair, and all obey the height/pitch floors.

Transmission costs an additional pass: planning paint is 69,736 submitted
triangles / 73 draws; clear is 104,649 / 110. The old painted budget still applies
to paint. The explicit experimental budget is 110,000 / 110 with 96 MiB estimated
target storage, compared with 64 MiB for paint. Half-resolution MSAA transmission
can add about 30 MiB at the pixel cap, and Three retains that allocation until
reload. Peak driver memory and variant animation performance are not measured.

## Validation

- 26 prototype checks passed, including every hull's material/emissive set,
  rejecting missing classifications and invented activation/faces, intact source
  hashes, all derivatives/components, shared-hex layout and existing clock.
- The unchanged fast regression suite passed. No shared fixture or test changed.
- All 23 runtime region masks checked: 3 metals, 9 emissive-designated physical
  coatings, 1 permitted clear variant. Cross-faction semantics are rejected.
- Region maps and the published table rebuild byte-identically.
- Room lights off: 0 nonzero physical pixels for paint and clear. Separate demo
  energy remains independent (1,309 nonzero pixels in the beam check).
- Planning draws 0 energy objects. The explicit clear URL works; default is paint.
- Turning demo energy off/on leaves physical hash 8627b27 and shadow hash
  2eca1c08 identical. Behind-board energy has 0 samples; the front probe draws.
- Planning brush ablation changes 721 Earth, 648 Krelath and 505 Vraygon pixels
  by more than 0.025 in a linear channel. This confirms contribution at native
  resolution, not visual quality by itself.
- Camera floors, pause/skip, reduced motion, material/scene classification,
  depth occlusion and SVG fallback pass. Browser page/console errors: 0.
- Edge 152 / RTX 5060 Ti, 1920 x 1080, 10 warmup + 60 samples: ordinary three-hull
  submission plus gl.finish mean 0.49 ms, p95 0.70 ms. No full-board claim.

## Unscored, unresolved and ownership

Unscored: full-board readability/performance, replacement identifier choice,
cross-class scale ladder, destruction, planets/nebulae, peak driver memory,
integrated-GPU/interactive variant performance and permanent asset intake.
No in-scope criterion is left unscored.

Unresolved fiction/materials: Earth dish brass versus paint; the meaning of
Krelath's two painted greens; the smaller yellow dome's function; individual
Shard system functions. Shard yellow is now conclusively paint, and its
lavender/purple/red are energy-designated. Nothing is inferred from a shared hex.

Implementation stays in arena/prototype-3d/. Source GLBs and prepared meshes are
unchanged; no commit/branch, shared runtime, furniture, identifier decision,
other-session file or PLAY change. Existing exporter/root and roster/filename
handover items remain campaign-map's responsibility. Stop for frame review.

All 25 final frame hashes, relevant file hashes, source/prepared hashes and scope
checks are recorded in evidence/adversarial-review.json.
