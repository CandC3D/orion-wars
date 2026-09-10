# Source art and material contract - revision 06

The authoritative per-hull classifications and measured triangle areas are in
[REGION-TABLES.md](REGION-TABLES.md). All 23 current COLOR_0 keys inherit classifications from faction-palettes.json.
Per-hull anatomical meanings remain in hull-art.js. Unknown faction colours fail
in preparation, region generation and runtime painting. Linear tuples are preserved; they are never decoded again as
sRGB or interpreted through a global colour-to-function map.

Earth uses the current Monoceros v3 and its schematic. Krelath uses the approved
Sparrowhawk and v2 schematic/written conventions. Shard uses the current model
alone. The surface-area audit confirms steel 43.952%, bronze 13.537%, gold
53.521%. The old Earth profile wrongly called steel pale paint; neither the
source nor the derivative had swapped colour regions. Combined Earth blues
cover 47.679% of the whole source, and 53.84% of the visible planning pixels.
Repainting blue to force a steel majority in that view would falsify the art.

Chris's later emissive sets are now authority: Earth red/green/white; Krelath
orange/yellow/white; Vraygon purple/lavender/red. Shard yellow is explicitly
paint. Earth gold is now confirmed metal and is confined to the sensor dish. All
12,480 source corners fall within its authored bounds, and all 467 reduced gold
triangles form one connected dish patch. Preparation and region generation reject
gold outside those bounds. The primary steel and gold share one metal finish. Krelath's green distinction and smaller dome's function
remain unnamed. No Shard weapon or exhaust socket has been inferred.

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


## Shared metal finish and the faction extensions

Silver/steel, bronze and gold use the same fine-flake binder finish. Their hues
come from their own source colours. Metalness is 0.52, body roughness 0.67,
burnished edge roughness 0.53. The sampled flake field has 0.12 mm pitch;
its colour and micro-normal variation is filtered away below a pixel, retaining
the rough average reflection. There are no self-lit glitter points, chrome
reflections, extra room lights or faction-specific finish cheats.

All materials take black ink at actual concave creases (0.25 mm). Metal recesses
lose metalness beneath pooled ink; raised edges burnish brighter. Matte painted
areas retain roughness 0.98 and strongly reduced broad dielectric specular
return, with slight uneven opaque coverage. Drybrush is 0.38 mm, picked work
0.12 mm, only at real convex creases. Rare chips require two actual convex
edge directions, not a noise spot on a flat panel. Metal receives less chalk
than body paint. No assumed casting seam, flash, decorative panel or system
feature is fabricated.

Creases require a 24-degree normal break. Smooth triangulation and unmatched
edges are not seams. Float textures store nearest actual crease segments per
face so strokes continue across tessellation. They occupy 5.31 MiB, within the
unchanged 24 MiB material-texture cap. See REVIEW.md for planning evidence;
shader numbers alone do not establish visual success.

## Faction-wide validation

The JSON palette contract includes Earth alternate steel a7adb1, Krelath
flight-deck c8e4bd, and Vraygon cyan 75cedb. The alternate alloy is darker and
slightly warmer (source tuple with linear tint 1.04 / 1.00 / 0.94), using the same
flake and roughness settings. Monoceros lacks this region; none is synthesised.
Deck paint has roughness 1, zero metalness and zero F0/F90 specular return,
including at grazing angles and over ink. Cyan is ordinary paint, never a clear
variant. Green 46b749 alone is eligible for Vraygon clear styrene.

The full staged audit covers 20 files / 18 distinct contents: 9 Earth, 2 Krelath,
9 Vraygon. Two root copies duplicate library hulls. Every primitive and colour
passes. Larger Krelath hulls/fighters are absent from this worktree, so their
exceptions are encoded from Chris but not counted as inspected. See
LIBRARY-AUDIT.md and FACTION-PALETTES.md. This is not full visual intake.

Preparation has a --validate-only option which exits before import, reduction
or export. Normal preparation also runs the same mandatory validation. Exact
per-hull counts/palettes remain an additional guard against changed exports.

## Inert region map and explicit animation

The versioned contract is now tabletop-colour-regions/3:

- palette: per-region material classification, optional metal name, role,
  uncertainty, allowed variant, physical register and physicalEmission: 0.
- patches: connected source-colour geometry in the physical register.
- energyAttachments: an entry for EVERY region, designated true or false,
  enabledByDefault: false, exact designated face indices, evidence and the
  names of any confirmed feature subsets. Non-designated entries have no faces.
- features: the confirmed, source-exact semantic subsets. A feature must be a
  subset of its hull's designated region. A designation alone supplies no mount.

The renderer validates this contract before using its feature subsets. It does
not search colours or recover a hidden muzzle from simulation state. Monoceros
uses the red forward laser muzzle (179 faces) and red aft outlet insert (12).
Sparrowhawk uses the large yellow dome (312) and vertical orange exhaust (18).
Both muzzle sockets come from those face bounds. Impact locations remain
presentation-only surface contacts. Shard has no feature subset or weapon socket.

Planning has zero visible energy objects. The existing resolution demo alone
activates the confirmed exhaust copies; a disclosed shot activates its confirmed
emitter and beam. Other designated regions are merely mapped for later work.
Each energy object is a separate unlit, additive, depth-occluded drawable with
no shadow or room light. Source colours, including all nine designated regions,
remain physical non-emissive coatings. Lost contacts disappear without breakage.

## Optional clear Shard insert

The default green fixture remains paint. The explicit ?insert=clear variant
replaces only the actual 24 green triangles with a separate physical material.
No geometry is enlarged, moved, newly labelled or given a muzzle. No paint
shader, lining, drybrush or wear is applied to the clear component.

MeshPhysicalMaterial supplies room-lit Fresnel/specular and screen-space
transmission: roughness 0.13, IOR 1.57, transmission 0.96. Green attenuation
uses the source linear tuple at 2.5 mm attenuation distance. Per-vertex depth
to the authored mating plane varies from a 0.02 mm numerical floor to 1.751 mm.
This is a thin-volume approximation; it is not a closed-volume ray tracer.
Shadowing remains the opaque silhouette approximation. There is no fabricated
sprue nub or mould line. The part occupies 4.831 x 1.751 x 4.260 mm and 23
planning pixels, so compare the matched detail frames as well as the board.

This optional transmission pass has a separate comparison budget: 110,000
submitted triangles, 110 draws, 96 MiB estimated render targets. Default painted
limits remain 70,000 / 90 / 64 MiB. Half-resolution transmission needs an extra
opaque pass and up to about 30 MiB at the pixel cap (including mipmaps and MSAA).
Three retains that allocation after toggling the variant off until page reload;
the estimate reports it. This experiment does not pass the old default budget
and is not a recommendation to deploy transmission across fleets.

## Rebuild

From this worktree with Blender 5.2 and Node:

```powershell
foreach ($faction in @('EAR','KRE','VRA')) {
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python arena/prototype-3d/prepare-models.py -- $faction
  node arena/prototype-3d/inspect-regions.mjs $faction
}
node arena/prototype-3d/write-region-table.mjs
node arena/prototype-3d/test.mjs
```

Blender's optional extension-cache write is denied by the sandbox; preparation
succeeds without it. Source libraries remain ignored working copies, not
permanent asset intake. That ownership remains campaign-map's.
