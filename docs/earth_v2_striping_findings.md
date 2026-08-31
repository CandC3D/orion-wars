# Earth v2 striping investigation

Date: 2026-08-30  
Blender: 5.2.0 LTS, headless, `BLENDER_EEVEE`

## Verdict

The working hypothesis is **confirmed in substance but refuted in its narrow form**.

- The exports are non-CSG triangle soups containing many intersecting construction
  shells. That is a pipeline-cleanup issue, not evidence of a damaged re-export.
- The affected ships have dense, differently coloured surfaces that are nearly
  parallel and extremely close, or that cross one another with different
  tessellations. EEVEE exposes those layers as stable triangle bands and speckles.
- The visible artifact is **not primarily caused by pairs of triangles with the
  same centroid and exactly coplanar planes**. There are too few such pairs, and
  deleting them does not change the diagnostic render at all.
- Normals are not the primary cause. No virtually welded connected component has
  negative signed volume.

The corrected mechanism is therefore: **un-unioned, interpenetrating coloured
shells with near-coincident/crossing exterior surfaces**, not a large population
of exact duplicate triangles. Calling all of it “z-fighting” is directionally
useful, but the rendered pattern also includes deterministic depth ordering where
two differently tessellated skins repeatedly pass in front of one another.

## Data handling and mesh structure

All inspected GLBs import as one mesh object with a per-corner `BYTE_COLOR`
attribute named `Color`. Every triangle owns three vertex records; the mesh is
unindexed at import. Topology results below therefore use a read-only virtual
position weld at `1e-5`. No source mesh was edited or exported.

All triangles have a single, uniform corner colour. Mixed-colour triangle counts
are zero for DD, CL, CA, BB, and CS, ruling out colour interpolation or a corrupt
`COLOR_0` mapping as the cause.

## Exact coincident-face census

A pair qualifies when its centroids are within `1e-4`, its planes are within
`1e-4`, and `abs(normal dot) >= 0.999999`.

| Ship | Triangles | Coincident pairs | Pairs with different dominant colours | Exact quantized vertex-set pairs with different colours |
|---|---:|---:|---:|---:|
| Destroyer (clean) | 145,632 | 0 | 0 | 0 |
| Light Cruiser (striped) | 151,812 | 32 | 6 | 5 |
| Heavy Cruiser (clean) | 256,384 | 0 | 0 | 0 |
| Battleship (striped) | 276,440 | 67 | 20 | 17 |
| Command Ship (striped) | 160,544 | 30 | 3 | 3 |

The affected ships do contain a small exact-coincidence signal, while both clean
controls contain none. It is real, but it is orders of magnitude too small to
produce the widespread artifact.

## Near-surface census

The same-centroid test misses shells with different tessellations. A second test
builds one BVH per dominant face colour and asks whether each face centroid lies
near a parallel surface carrying another colour.

| Ship | Faces within 0.01, `abs(dot)>=0.99` | Share of all faces | Faces within 0.01, `abs(dot)>=0.999999` | Share of all faces |
|---|---:|---:|---:|---:|
| Destroyer (clean) | 1,750 | 1.20% | 526 | 0.36% |
| Light Cruiser (striped) | 5,063 | 3.34% | 2,152 | 1.42% |
| Heavy Cruiser (clean) | 253 | 0.10% | 181 | 0.07% |
| Battleship (striped) | 12,766 | 4.62% | 4,843 | 1.75% |
| Command Ship (striped) | 4,914 | 3.06% | 1,834 | 1.14% |

This is the strongest quantitative separation. CL, BB, and CS form one group;
CA is an especially clean control. DD has some near construction surfaces, but
far fewer than the affected ships and they do not create the same dense exposed
pattern.

The component inventory explains the family split more concretely:

- CL has two long `~39.5k`-triangle side assemblies, each about
  `25.25 x 95 x 20`, whose virtually connected surfaces contain cyan, silver,
  red, and dark gray faces.
- BB has four comparable `~39.5k`-triangle multi-colour assemblies.
- CS inherits two comparable assemblies from the CL chassis.
- CA has no corresponding `39.5k` assemblies; its largest repeated shells are
  `16,128` triangles and its near-different-colour count is only 253.
- DD has smaller overlapping construction pieces, but no CL/BB/CS-style long
  multi-layer assemblies. Its visible outer depth order remains stable.

Thus DD and CA are clean because they lack the dense, exposed, near-parallel
different-colour crossings present in the affected chassis—not because they are
fully unioned. Every design still contains multiple construction shells.

## Rough interior-shell estimate

For 12,000 faces per ship, the test offsets the face centroid to both sides of
the normal and performs oriented BVH ray shell counts. A face is marked hidden
when both offsets remain inside at least one oriented shell. This is deliberately
a rough diagnostic, not a production generalized-winding-number test.

| Ship | Hidden by face count | Hidden by sampled area | Ambiguous rays |
|---|---:|---:|---:|
| Destroyer | 50.3% | 52.6% | 196 |
| Light Cruiser | 26.5% | 45.5% | 112 |
| Heavy Cruiser | 59.3% | 66.5% | 178 |
| Battleship | 42.0% | 60.3% | 64 |
| Command Ship | 36.8% | 55.2% | 108 |

The clean ships can have as much or more internal construction surface than the
striped ships. Interior surface fraction alone is therefore **not** causal. The
relevant discriminator is whether differently coloured shells become nearly
coincident at the visible exterior.

## Render mechanism test

The close-up clearly shows triangle-aligned colour bands and speckling:

- [Light Cruiser close-up before](../assets/blender/preview/earth_v2/v2inv_light_cruiser_starboard_mid_before.png)
- [After deleting all 32 strict centroid/plane-coincident pairs](../assets/blender/preview/earth_v2/v2inv_light_cruiser_starboard_mid_after_exact_pair_cleanup.png)

Deleting the later face from every strict pair reduced CL from 151,812 to 151,780
triangles. Pixel comparison of the two 1400x1000 renders found **0 changed pixels
out of 1,400,000**. This directly refutes exact pair deletion as the fix.

An intentionally broad experiment deleted 7,366 lower-priority faces whose
centroids were within `0.05` of another coloured parallel surface. It changed
4.68% of pixels but opened black holes and left substantial striping:

- [Unsafe proximity deletion result](../assets/blender/preview/earth_v2/v2inv_light_cruiser_starboard_mid_after_in_memory_cleanup.png)

That negative result is important: centroid-nearest face deletion cannot
distinguish an overlapping skin from a legitimate nearby/intersecting detail.
It must not be used as the v2 cleanup algorithm.

## Normals and topology

Counts below are after virtual position welding at `1e-5`; raw index-based edge
counts would be meaningless because the import has three unique vertices per
triangle.

| Ship | Components | Closed components | Boundary edges | Edges used by >2 faces | Degenerate faces | Negative-volume components |
|---|---:|---:|---:|---:|---:|---:|
| Destroyer | 41 | 28 | 2,368 | 2,368 | 2,368 | 0 |
| Light Cruiser | 40 | 29 | 1,248 | 1,353 | 1,334 | 0 |
| Heavy Cruiser | 71 | 47 | 4,192 | 4,198 | 4,200 | 0 |
| Battleship | 48 | 35 | 1,312 | 1,592 | 1,546 | 0 |
| Command Ship | 38 | 26 | 1,344 | 1,483 | 1,467 | 0 |

The topology is not production-ready, but CA and DD have at least as many bad
edge/degenerate candidates as CL. Inverted normals do not explain the affected
versus clean split.

## Recommended v2 cleanup algorithm

Use a labelled-solid CSG/exterior extraction pass. Do not use duplicate-face or
nearest-centroid deletion.

1. Import and preserve the raw per-corner `Color` bytes before any weld or
   decimation.
2. Virtually index positions, then recover construction shells by shared **full
   edges**, geometric continuity, and colour. Do not connect parts merely because
   they intersect or share an isolated position. Repair zero-area faces and small
   boundary defects per shell.
3. Establish deterministic material precedence for overlapping coloured solids.
   Prefer explicit per-part priority metadata. If unavailable, use a documented
   ship/palette priority plus a visual regression reference; exact ties cannot be
   inferred reliably from a flattened GLB alone.
4. Compute one exterior solid using a robust exact boolean union/difference
   library. A labelled SDF/voxel union is an acceptable fallback for LOD meshes,
   provided the voxel size is below the smallest feature to retain.
5. Assign the exterior colour from the highest-priority source solid containing
   a point just inside each output face. For an SDF pass, transfer labels with a
   neighbourhood vote and the same priority tie-break—not a single nearest face.
6. Remove all internal faces, weld the resulting exterior by tolerance, orient
   normals outward, and validate watertightness, non-manifold edges, and minimum
   wall/feature size.
7. Preserve colour boundaries as hard seams during LOD generation and run
   before/after render regression checks from several cameras.

For a Blender-only implementation, the exact Boolean solver is appropriate for
the source/master cleanup if recovered shells are repaired first. Voxel remesh is
better reserved for generated LOD/collision output because it can soften the
small antennae, barrels, and radiator collars.

## What the owner should do in Tinkercad

No re-export is required to fix a defective file: the current GLBs consistently
contain valid triangle positions and valid per-corner colours. This is a cleanup
requirement created by the flattened, non-CSG export representation.

The owner does **not** need to rebuild the affected ships if the pipeline adds the
labelled-solid cleanup above. For future edits, the safest authoring practice is
to avoid different-colour parts with coplanar or almost-coplanar outer skins.
Either make the overlap intentionally internal, leave a visible clearance, or
perform a real boolean cut/union before export.

“Group” or “flatten” is useful only if the exported geometry is demonstrably a
single booleaned exterior. The current v2 evidence shows that grouping/exporting
still retained construction shells, so repeating that operation alone is not a
reliable fix. If the owner can export parts separately or include their intended
front-to-back/material priority, that would make colour-preserving cleanup more
deterministic, but it is optional rather than a re-export requirement.

## Reproducibility and outputs

Investigation scripts:

- `assets/blender/scripts/v2inv_mesh_census.py`
- `assets/blender/scripts/v2inv_near_surface.py`
- `assets/blender/scripts/v2inv_component_inventory.py`
- `assets/blender/scripts/v2inv_depth_layers.py`
- `assets/blender/scripts/v2inv_render_mechanism.py`
- `assets/blender/scripts/v2inv_compare_renders.py`

Primary data:

- `assets/blender/preview/earth_v2/v2inv_mesh_census.json`
- `assets/blender/preview/earth_v2/v2inv_near_surface.json`
- `assets/blender/preview/earth_v2/v2inv_component_inventory.json`
- `assets/blender/preview/earth_v2/v2inv_depth_layers.json`
- `assets/blender/preview/earth_v2/v2inv_render_pixel_differences.json`

The source GLBs were read only. Their sizes and modification times remained
unchanged after the investigation; SHA-256 checks were also recorded during final
verification.
