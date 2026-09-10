# Source art and paint contract - revision 04

Each hull owns its palette and meanings. `hull-art.js` contains three separate
profiles; `hull-sources.json` records the exact source filenames, colour counts,
lengths and preparation ratios. A shared hex value is never a shared function.
The earlier missing-colour blocker was an inspection error: the art was already
in COLOR_0, including in the previous Sparrowhawk derivative.

## Authority and interpretation

- Earth: `source/edf/Earth Monoceros Class Frigate v3 Series.glb`, the paired
  `monoceros-class-frigate-schematic-v3.png`, its provenance and the supplied
  Earth conventions. Native +X is forward, Z is up. The raised nacelle, its
  side radiators, forward collector, command pod, laser housing, lower dish,
  habitation ring and rear flight-deck doors follow the schematic.
- Krelath: `source/Krelath KFG-01 _Sparrowhawk_ Class Frigate.glb`, Sparrowhawk v2
  schematic/provenance and Krelath conventions. Native -Y is forward, Z is up.
  Chris has approved its colour placement; this revision changes the paint
  response and brush treatment, not its source geometry or colours.
- Vraygon: `source/vtw/Vraygon VFG-04 _Shard_ Class Frigate.glb` is the reference.
  No schematic is required or invented. Native +X is the long pointed end and
  becomes presentation-forward; Z is up. Panel forms, hexagonal fittings and
  every coloured face come from the model. No weapon, nav, bridge, engine or
  other system designation is assigned from appearance alone.

Earth's style document specifies schematic display colours, not replacement
model colours. Its cyan linework is not applied as a hull palette. Orange
weapons warnings and port-red/starboard-green navigation are the conventions
recorded in Fable's current instruction.

| Monoceros key | Source corners | Interpretation used |
|---|---:|---|
| bfc7cc | 151,419 | Pale hull paint |
| 009fd7 | 60,171 | Bright blue paint; no whole-region system name |
| e91d2d | 55,653 | Multiple red parts, including collector, radiator/strut details, muzzle, aft outlet and a small port fitting; not one nav/warning mask |
| 0076a9 | 54,504 | Deep blue paint; no whole-region system name |
| f5831f | 13,164 | Actual orange laser warning housing |
| e1ad34 | 12,480 | Gold paint on the actual lower dish |
| fafafa | 6,618 | Actual white windows/fittings |
| 61676a | 3,999 | Dark grey aft nacelle outlet housing |
| 46b749 | 3,888 | Small starboard nav fitting, matching the Dome Light fingerprint |

| Shard key | Source corners | Interpretation used |
|---|---:|---|
| d3bfe5 | 15,750 | Pale violet paint |
| e1ad34 | 14,073 | Dull gold-coloured paint |
| 7e3f98 | 7,893 | Purple paint |
| ffdd1a | 2,454 | Yellow paint |
| f5831f | 1,782 | Orange paint |
| 46b749 | 156 | Green fittings; function unassigned |
| e91d2d | 84 | Red fitting; function unassigned |

No Shard colour is promoted to a system name. Treating the gold as dull metallic
pigment is a paint choice, not a claim about the material or function of the
fictional ship. Small green/red fittings remain their actual sizes and places.

Sparrowhawk retains green A #126936 (101,052), green B #46b749 (55,350), bronze
#a97b50 (58,557), orange #f5831f (17,751), yellow #ffdd1a (15,549), red #e91d2d
(2,001) and white #fafafa (264). Both greens use identical hull-paint material
parameters. Their distinction remains unresolved. The smaller dome retains its
source paint and ring, with no label, second mount or glow.

These keys label the GLB's linear RGB tuples. They are not sRGB strings to be
decoded again, nor promises of exact screen pixels under a warm key. All source
triangles have a single palette region. Slight Blender colour quantisation is
re-anchored to that hull's exact source palette; unknown colours fail.

## Prototype-local preparation

`prepare-models.py -- EAR|KRE|VRA` welds coincident vertices at 1e-7 of source
extent, collapses the mesh using the declared ratio, validates the result,
centres/orients it and normalises to the declared physical length. It retains
all connected components and COLOR_0. Inputs are read only; outputs stay in
`prepared/`. `inspect-regions.mjs EAR|KRE|VRA` builds the per-hull connected colour
patches and confirmed energetic face maps. Selectors fail if the source changes.

| Hull | Ratio | Triangles before / after | Bytes before / after | Components | Max measured deviation |
|---|---:|---:|---:|---:|---:|
| Monoceros | 0.095 | 120,632 / 11,442 | 10,134,364 / 334,512 | 2 / 2 | 0.258724 mm |
| Sparrowhawk | 0.16 | 83,508 / 13,351 | 7,015,984 / 371,208 | 3 / 3 | 0.037093 mm |
| Shard | 0.30 | 14,064 / 4,188 | 1,182,644 / 139,164 | 33 / 33 | 0.175217 mm |

Deviation is bidirectional, all vertices to the nearest triangle, not a certified
continuous Hausdorff bound. Maximum colour-area fraction changes are 0.038605,
0.019017 and 0.628739 percentage points respectively. Shard's decimator creates
20 duplicate faces; explicit mesh validation removes them before measurement
and export. No connected part is removed. Source and derivative hashes, full
palettes, region areas and component bounds accompany each derivative in
`<hull>-preparation.json` and `<hull>-regions.json`.

## One period brush treatment

All three use the same material procedure, with metallic-pigment eligibility
specified separately in each hull profile. No rule infers a function from hex.

- Matte opaque block coats: body roughness 0.98 and 3.5% of the ordinary
  dielectric specular colour. The existing room lighting still shades forms;
  no zenithal or directional gradient is painted into the coat.
- Slight nondirectional coverage variation (linear coat multiplier 0.625-0.665),
  filtered at small sizes. No invented panel grid, photographic bump map or
  sculpted detail is added.
- Actual concave creases receive 0.25 mm black undercoat/ink lining. Ink can
  pool locally at lower roughness. It does not turn the whole paint film glossy.
- Actual raised edges receive 0.38 mm broken chalk work and a narrower 0.12 mm
  picked stroke. Their physical coverage is filtered at the pixel footprint.
  Recess ink suppresses overlying drybrush so fine fittings retain separation.
- Bronze/gold paint uses roughness 0.82 and metalness 0.18; only small picked
  edges return more light. It is not a polished or chrome surface.
- Sparse exposed-corner chips occur only where two actual convex crease
  directions meet. They expose bright alloy; no random flat-panel damage is
  invented. No casting seam or flash is fabricated at an assumed mould split.

Creases require a 24-degree normal break. Smooth triangulation is excluded;
unmatched edges are not declared seams. Generated float textures contain the
nearest real crease segments for each face. The brush therefore crosses triangle
boundaries continuously, rather than revealing tessellation as jagged paint.
These textures contain geometry coordinates, not authored panel images, and
consume 5.31 MiB within the 24 MiB material budget.

## Physical paint and separate energy

All 23 palette entries across the three profiles are physical: room-lit, opaque,
shadowed, depth-writing and non-emissive, including every bright/nav colour.

| Hull | Separate energetic geometry | Evidence |
|---|---|---|
| Monoceros | Red aft nacelle insert, 12 faces; red forward laser muzzle, 179 faces | Model positions and matched side/plan/end schematic; orange housing remains physical warning paint |
| Sparrowhawk | Vertical orange stern exhaust, 18 faces; larger yellow dorsal emitter, 312 faces | v2 schematic and written anatomy |
| Shard | None assigned | Geometry/colour are sufficient for painting, but no function is invented to place a weapon or exhaust effect |

Each energetic copy has its own classification, material and exact face map,
with a 0.03 mm outward depth offset. It adds no room light or shadow. Emitter
energy activates only for a disclosed shot; the fixture still fires Sparrowhawk
at Monoceros. Neither nav paint nor the smaller Krelath dome is activated.
Missing/mixed classifications, cross-hull maps and stale feature bounds fail.

## Rebuild

From this worktree with Blender 5.2 and Node:

```powershell
foreach ($faction in @('EAR','KRE','VRA')) {
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python arena/prototype-3d/prepare-models.py -- $faction
  node arena/prototype-3d/inspect-regions.mjs $faction
}
node arena/prototype-3d/test.mjs
```

Blender's optional extension-cache write is denied by the sandbox; preparation
succeeds without it. Source libraries remain ignored working copies, not
permanent asset intake. That ownership remains campaign-map's.
