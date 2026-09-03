# Earth cruiser legibility demonstration

This pass uses the clean **Earth Light Cruiser (CL)** and **Earth Heavy Cruiser (CA)** exports. The Destroyer and Frigate remain outside this comparison because their coincident colour shells can create false candy-stripe/speckle readings.

The canon GLBs remain unchanged: one merged mesh, no UVs, and per-corner `BYTE_COLOR` data in `Color`. The render rig follows `render_tc_cl.py` / `render_tc_ca.py`: EEVEE, Standard view transform, satin roughness `0.6`, specular `0.2`, and no bloom.

## Colour decode

Tinkercad stored display/sRGB values in glTF `COLOR_0`, although glTF defines that slot as linear. Blender therefore treated the encoded values as linear and made the earlier renders look pale and washed out. Both BEFORE and AFTER materials now put a `ShaderNodeGamma` set to `2.2` between `Color` and the Principled BSDF. The saturated mid-blue, red radiators, orange weapons, gold dish, white windows, and gray structure now match the corrected true-colour rigs.

New class and system colours are specified as the sRGB values intended to be seen, written into `Color` using the same encoded convention as the source, and decoded by the same gamma node. Emissive regions use that decoded colour and an explicit `LegibilityEmission` face mask at strength `1.5`.

## CL / CA Section-A treatment

### Light Cruiser (CL)

- **A.1 — large class block:** eight complete position-welded blue regions—the four dorsal drum panels and their matching side regions—become light silver-white. Their eligible dorsal area is **23.2%**, within the 20–35% target.
- **A.2–A.3 — dorsal-first value cue:** the complete light drum reads as a single CL mass from overhead and remains visible in the 3/4 view.
- **A.4 — three-beat system rhythm:** two complete side-panel pairs plus the complete forward drum-ring region form three longitudinal cyan stations. No station cuts a triangle.

### Heavy Cruiser (CA)

- **A.1 — large class block:** five complete blue regions become dark navy: one complete drum-panel station with its side regions plus the forward drum ring. The other station remains as **two separated authored-blue panels**. The dark block covers **21.3%** of eligible dorsal blue area, within the 20–35% target.
- **A.2–A.3 — dorsal-first value cue:** the dark forward drum and retained blue panel pair produce the CA mass cue; the canon third nacelle remains a redundant silhouette cue.
- **A.4 — paired system rhythm:** complete aft and fore side-panel pairs emit, with the dark drum section between them. No glow mask is cut through a panel.

Orange, gold, red, white, silver-gray, navigation-colour, and mid-gray source faces are never candidates for class recolouring.

## Section-A implementation lesson: snap to panels

These exports are unwelded triangle soups, so object-space station cuts can cross long triangles and appear as streaks or slivers even when evaluated cleanly in a shader. The script now welds vertices by world-space position for connectivity, builds an edge-adjacency graph of source-blue faces, and flood-fills complete same-colour regions. A region is selected only when its dorsal area-weighted centroid falls inside the configured class or system band; every face in that region is then changed together. Boundaries therefore coincide with existing panel, collar, or ring seams.

Panel integrity takes precedence over hitting an exact area percentage. The script reports the measured panel-snapped share and emits a note if it falls outside 20–35%; it never expands a mask through the middle of a triangle merely to reach the target.

## Sprite-scale comparison

The strip order is **CL-before, CL-after, CA-before, CA-after**. Each ship is framed from its complete imported bounding box at approximately 48 pixels long inside its own 64×64 tile. Projected silhouette bounds are approximately x=7…55, leaving visible clearance around both ends rather than clipping the bow sphere.

The 4x strip is rendered natively at four times the tile resolution, not enlarged from the 1:1 strip.

## Outputs

| File | Contents |
| --- | --- |
| `light_cruiser_before_dorsal.png` | CL decoded authored colours, dorsal, 1200×900 |
| `light_cruiser_after_dorsal.png` | CL panel-snapped light drum + three system groups, dorsal, 1200×900 |
| `light_cruiser_before_oblique.png` | CL decoded authored colours, 3/4 oblique, 1200×900 |
| `light_cruiser_after_oblique.png` | CL panel-snapped light drum + three system groups, 3/4 oblique, 1200×900 |
| `light_cruiser_composite.png` | Labeled CL 2×2 comparison, 2400×1800 |
| `heavy_cruiser_before_dorsal.png` | CA decoded authored colours, dorsal, 1200×900 |
| `heavy_cruiser_after_dorsal.png` | CA panel-snapped dark drum + two blue panels + paired system groups, dorsal, 1200×900 |
| `heavy_cruiser_before_oblique.png` | CA decoded authored colours, 3/4 oblique, 1200×900 |
| `heavy_cruiser_after_oblique.png` | CA panel-snapped dark drum + two blue panels + paired system groups, 3/4 oblique, 1200×900 |
| `heavy_cruiser_composite.png` | Labeled CA 2×2 comparison, 2400×1800 |
| `cruisers_sprite_strip.png` | Four 64×64 tiles, 256×64 total; ~48 px ship length |
| `cruisers_sprite_strip_4x.png` | Four 256×256 tiles, 1024×256 total; ~192 px ship length |

Regenerate from the repository root with:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python "assets/blender/scripts/legibility_demo.py"
```
