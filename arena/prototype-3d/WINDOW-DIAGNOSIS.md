# Vraygon window pinching — diagnosis before correction

The broad radial pinches are introduced by **our smoothing of hard edges**, not
by the paint, and not by a collapsed source window grid. `prepare-models.py`
previously set every polygon's `use_smooth=True` before exporting normals. Around tiny
window clusters, that averages window-wall normals into long triangles on the
large flat hull panels. Interpolation then carries that normal change across
the entire panel as a triangular light/dark fan.

This was isolated before changing the shader or preparation. Shard and Crystal
were rendered from the same camera in three neutral-material cases: the prepared
mesh with its exported normals, that same mesh with face normals, and the source
mesh with face normals. The material has no ink, drybrush, AO or metallic map.
Both smoothed derivatives retain the pinch. Both face-normal derivatives lose it.
Their authored window insets and flat panels agree with the source reference.
The source GLBs supply POSITION and COLOR_0, not authored normals.

- [Shard, exported smooth normals](evidence/revision-11/vra-shard-prepared-smooth.png)
- [Shard, same geometry and face normals](evidence/revision-11/vra-shard-prepared-flat.png)
- [Shard source reference](evidence/revision-11/vra-shard-source-flat.png)
- [Crystal, exported smooth normals](evidence/revision-11/vra-crystal-prepared-smooth.png)
- [Crystal, same geometry and face normals](evidence/revision-11/vra-crystal-prepared-flat.png)
- [Crystal source reference](evidence/revision-11/vra-crystal-source-flat.png)
- [Counts and identical camera parameters](evidence/revision-11/window-diagnosis.json)

The correction preserves the Vraygon models' actual faceted normals through
preparation and painting. All seven Vraygon derivatives have been rebuilt; their
three corner normals agree on each facet. The runtime also recomputes face
normals after expanding the derivative into independent triangles. No source vertices, window recesses or colour regions
need moving. Small differences due to reduction remain subject to the existing
component, surface-share and two-way distance checks. Lining is corrected separately with complete, surface-local crease support; it is not being used to conceal this geometry fault.

## Finished comparisons, identical side cameras

| Hull | Before (5dd04ba) | After |
|---|---|---|
| Shard | [Before](evidence/revision-11/vra-shard-before.png) | [After](evidence/revision-11/vra-shard-after.png) |
| Crystal | [Before](evidence/revision-11/vra-crystal-before.png) | [After](evidence/revision-11/vra-crystal-after.png) |

The finished pairs also include the approved clear supports/crystals, restricted rim codes and controlled lining. The neutral triplets above isolate the normals cause. [Matched-view evidence](evidence/revision-11/matched-views.json) asserts the before/after side camera parameters are identical.

The diagnostic smooth captures were taken **before** rebuilding, from the derivative at 5dd04ba. Re-running `capture-diagnosis.mjs` against the corrected derivatives no longer recreates that historical smooth baseline; it must not overwrite these historical evidence files. Sources are unchanged.
