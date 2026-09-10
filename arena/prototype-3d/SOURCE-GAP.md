# Source colour contract - correction and implementation

My earlier claim that the supplied GLB lacked colour regions was wrong. I
inspected materials, images and textures but missed the primitive's `COLOR_0`
attribute. The derivative had already preserved it. This note replaces the
incorrect blocker explanation; no new colour source was required.

The original Sparrowhawk has POSITION and COLOR_0, with 250,524 colour vertices
and seven distinct values. Every triangle has one colour. The new references
`source/krelath-schematic-style.md` and
`source/sparrowhawk-class-frigate-schematic-v2.provenance.md`, together with the
v2 plate, identify how those colours relate to the physical features.

| Source key | Source vertices | Tabletop treatment |
|---|---:|---|
| #126936 | 101,052 | Painted hull green A |
| #46b749 | 55,350 | Painted hull green B; distinction from A unresolved |
| #a97b50 | 58,557 | Metallic bronze paint, on the actual bronze faces |
| #f5831f | 17,751 | Orange paint: collector, exhaust and radiators |
| #ffdd1a | 15,549 | Yellow paint, including both actual domes |
| #e91d2d | 2,001 | Red warning paint on its actual rings |
| #fafafa | 264 | White paint, including the bridge and habitation windows |

The keys label the source tuples; the GLB values are linear RGB and are used as
linear vertex colours. They are not decoded a second time as sRGB hex strings.
The table is not a promise of those exact screen pixels under a warm room key.
Both greens receive the same painted, non-metallic treatment. No functional
meaning, rank or material distinction is invented for the brighter green.

## Preparation and fidelity

`prepare-models.py` welds coincident vertices at 1e-7 of source extent, applies
Blender collapse decimation at 0.16, retains all connected components, centres
and orients bow +X / Y up, and makes the miniature 65 mm long. It preserves
COLOR_0. It adds no topology or decoration, and writes only under `prepared/`.

| Measure | Original | Local derivative |
|---|---:|---:|
| Bytes | 7,015,984 | 371,208 |
| Triangles | 83,508 | 13,351 |
| Connected components after welding | 3 | 3 |
| Authored colour regions | 7 | 7 |

Maximum measured bidirectional vertex-to-nearest-triangle error is 0.037093 mm
at miniature scale. This is not a certified full-surface Hausdorff bound.
Blender's colour storage round trip perturbs three palette values slightly;
runtime restores only that small quantisation error to the exact source tuples.
Unknown colours and triangles mixing region IDs fail validation.

`inspect-regions.mjs` reads the source and derivative attributes, finds connected
colour patches, and writes `prepared/regions.json`. The largest change in any
region's fraction of total surface area is 0.00019017 (0.019017 percentage
points). Source and derivative area fractions are recorded there; geometry and
source hashes are in `prepared/preparation.json`.

## Period painting from real features

`hull-paint.js` uses the original colour regions as flat block coats. Bronze
receives a controlled metallic return; the greens and bright paints do not.
It measures adjacent triangle normals and shared geometric edges. Concave breaks
receive dark undercoat/ink; convex breaks receive chalky drybrush and narrower
picked edge strokes. The 24-degree threshold excludes ordinary smooth-surface
triangulation. Unmatched edges are left alone rather than declared seams.

The current derivative supplies 1,450 concave and 978 raised crease edges.
Ink width is 0.14 mm, drybrush width 0.22 mm, and the narrower picked line is
0.065 mm. Broken chalk deposits have a 0.2 mm scale; pixel-footprint filtering
averages their coverage when minified. Paint remains flat away from those
features. Ink pooling lowers roughness locally; chalk stays rough. There are
no new panel grids, arbitrary trim bands, normal/displacement maps, zenithal
pass, weathering powders or added greebles. Room lighting creates the ordinary
shading gradients; the block coats do not contain them.

These are authored-region and measured-geometry masks, not a generic hull shader.
The red rings remain at both source domes; the smaller dome receives no label,
second tactical mount or glow. All bronze is confined to the bronze colour mask.
The orange forward collector, vertical stern exhaust, horizontal radiators,
lower flight-deck doors and white window groups keep their source locations.

## Two objects, two registers

All seven colours belong to the physical hull: opaque MeshStandardMaterial,
room-lit, shadowed, depth-writing, emissive zero. Even the bright orange, yellow
and white paint emits nothing.

The separate energetic scene copies only two confirmed connected patches:

- Stern exhaust: the vertical orange patch, 18 triangles; restrained continuous
  energy at that exact surface.
- Larger dorsal beam emitter: the yellow dome patch, 312 triangles; energy only
  during its disclosed shot. The beam starts at the actual larger dome.

Copies receive a 0.03 mm outward offset to prevent coincident-depth interference.
They are unlit/additive, cast no shadow and add no lights. No energetic copy is
made for the smaller dome, collector, radiators or windows in this slice. Their
physical bright paint is still present. The region map classifies physical
pigments and energetic copies separately, and runtime rejects missing or mixed
classification and stale face maps.

A lights-off browser check produces zero non-black pixels in the entire
physical pass while the energetic pass remains visible. Effects on/off also
leave physical and shadow buffers identical. These test the register split
through actual rendered buffers, including the bright paint.

## Rebuild

From this worktree, using Blender 5.2 and Node:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python arena/prototype-3d/prepare-models.py
node arena/prototype-3d/inspect-regions.mjs
node arena/prototype-3d/test.mjs
```

The supplied source files remain gitignored and unchanged. The page loads the
371 KB derivative, never the 7 MB raw source or the deprecated game Krelath hull.
Permanent intake and exporter changes remain with campaign-map.
