# Source art and material contract - revision 07

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
cover 47.679% of the whole source, and 53.52% of the visible planning pixels after the base rise.
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
| Crystal (comparison only) | 0.50 | 23,642 / 11,742 | 1,987,232 / 377,776 | 53 / 53 | 0.142754 mm |

Deviation is bidirectional, all vertices to the nearest triangle, not a certified
continuous Hausdorff bound. Maximum colour-area fraction changes are 0.038605,
0.019017 and 0.628739 percentage points respectively. Shard's decimator creates
20 duplicate faces; explicit mesh validation removes them before measurement
and export. No connected part is removed. Source and derivative hashes, full
palettes, region areas and component bounds accompany each derivative in
`<hull>-preparation.json` and `<hull>-regions.json`.


## Shared metal finish and the faction extensions

Silver/steel, bronze and gold use the same fine-flake binder finish. Their hues
come from their own source colours. Metalness is 0.58, body roughness 0.62,
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

## Optional clear parts and stand study

Shard retains both treatments but no longer carries the decision. Crystal's
90 mm comparison preserves eight connected green patches (1.091% of source
surface). The current 377,776-byte derivative retains all 53 components; Blender
validation removes 40 duplicate/degenerate faces after reduction. No green
region is enlarged or relocated, and pale cyan is ordinary paint.

The common moulded-plastic material uses transmission 1, roughness 0.095 and
IOR 1.57. Each green patch gets a closed convex optical volume from its own
vertices; only the actual source-derived triangles are visible. Per-fragment
refraction measures the exit distance through that volume. Green attenuation
uses the source tuple over 2.5 mm. This replaces the one-plane Shard approximation.
The clear post measures ray exit from its finite tapered cone; its dimensions
come from SIZES, with slightly cool, nearly colourless attenuation over 30 mm.
Neither uses paint shader marks, wear, emission or invented sprue geometry.

The physical tabletop is captured once at 128 cube resolution and rough-filtered
for room reflections. It introduces no new scene object or light. Diffuse fill
continues to use the existing hemisphere. Captured reflection intensity goes
zero with the room lights in the physical-blackout test. Steel has a darker
film value, greater fine-flake value range and stronger real burnished edges;
metal BRDF parameters remain common to steel, bronze and gold.

Clear objects cast a stochastic neutral transmission shadow, 0.10 coverage for
posts and 0.24 for green parts. The hidden painted green triangles are also
removed from the opaque shadow pass. In RGB-packed depth Three ignores ordinary
opacity, so the coverage uniform is explicitly applied before alpha hashing.
This is not a caustics or multiple-internal-reflection simulation. Refraction
is screen-space and convex volumes may span concave voids within a source patch.

The new material-study.html uses full-resolution transmission for the deciding
captures, bounded to 90,000 submitted triangles / 110 draws, 2.07M pixels and
160 MiB of estimated offscreen targets (80.97 MiB at the captured size, excluding
driver overhead and the default drawing buffer). This is an isolated
comparison, not a full-board test. The ordinary board keeps its existing 70,000 /
90 / 64 MiB default and separate 110,000 / 110 / 96 MiB clear-Shard budget.
The retained transmission allocation persists until reload.

## Cast stand geometry

Chris's specified FASA profile is authoritative: the original bevelled skirt
remains and six shallow planar faces rise to a central apex. The chosen skirt
is 25 mm across flats and 3 mm high; the pyramid adds 2 mm. Exposed post length
is a separate 30 mm, tapering from 3.0 to 2.4 mm. The board always uses black,
opaque posts. Clear posts exist only in the explicit side-by-side study.

The previous cylinder was buried 0.5 mm into the flat base and stopped 0.5 mm
short of the hull, making its exposed length 29.5 mm despite a 30 mm geometry
parameter. The new instance endpoints meet the measured apex and ray-seated
underside; the exposure and both end gaps are tested independently.

The repository contains FASA mechanics notes, but I did not find the original
base photographs or dimensional drawing here. FASA's [spring 1986 catalogue](https://tardiscaptain.com/wp-content/uploads/2021/04/FASA-Spring-1986-Catalog.pdf)
describes clear plastic stands; it supplies no verified dimensions for this
implementation. The dimensions above are explicitly prototype choices following
Chris's profile, not claimed measurements of an original part.

## Rebuild

From this worktree with Blender 5.2 and Node:

```powershell
foreach ($faction in @('EAR','KRE','VRA')) {
  & 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python arena/prototype-3d/prepare-models.py -- $faction
  node arena/prototype-3d/inspect-regions.mjs $faction
}
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python arena/prototype-3d/prepare-models.py -- VRA --comparison
node arena/prototype-3d/inspect-regions.mjs VRA --comparison
node arena/prototype-3d/write-region-table.mjs
node arena/prototype-3d/test.mjs
```

Blender's optional extension-cache write is denied by the sandbox; preparation
succeeds without it. Source libraries remain ignored working copies, not
permanent asset intake. That ownership remains campaign-map's.
