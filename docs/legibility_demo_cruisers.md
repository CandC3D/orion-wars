# Earth cruiser legibility demonstration

This pass uses the clean **Earth Light Cruiser (CL)** and **Earth Heavy Cruiser (CA)** exports. The Destroyer and Frigate remain outside this comparison because their coincident colour shells can create false candy-stripe/speckle readings.

The canon GLBs remain unchanged: one merged mesh, no UVs, and per-corner `BYTE_COLOR` data in `Color`. The render rig follows `render_tc_cl.py` / `render_tc_ca.py`: EEVEE, Standard view transform, satin roughness `0.6`, specular `0.2`, and no bloom.

## Colour decode

Tinkercad stored display/sRGB values in glTF `COLOR_0`, although glTF defines that slot as linear. Blender therefore treated the encoded values as linear and made the earlier renders look pale and washed out. Both BEFORE and AFTER materials put a `ShaderNodeGamma` set to `2.2` between `Color` and the Principled BSDF. The saturated mid-blue, red radiators, orange weapons, gold dish, white windows, and gray structure match the corrected true-colour rigs.

New class and cyan system colours are specified as the sRGB values intended to be seen, written into `Color` using the same encoded convention as the source, and decoded by the same gamma node. Emissive regions use that decoded base colour and the explicit `LegibilityEmission` face mask at strength `1.5`, retaining a solid, non-bloomed core.

## Owner-directed lit-system language

The AFTER state on both cruisers now treats all authored lit-system colours consistently through the same emission mask:

- cyan system-light stations;
- every authored red face, including nacelle radiator strips and port navigation balls;
- the small authored-white window-slot components only; and
- the authored-green starboard dome light.

This follows the owner's direction that red, white windows, and the green light should all glow. It explicitly supersedes the earlier reading of **red = paint only**. Each group keeps its decoded authored hue; no emission colour is replaced with a generic cyan or white. BEFORE remains decoded true colour with zero emission.

Window selection is based on position-welded connected-component area, not a spatial cut. The slot components occupy a tight measured band of about `3.49–3.62` area units, while the larger light-gray structural component is about `6.24`; the mask therefore accepts light-gray components up to `4.0`. This selects **21 of 22** light-gray components on the CL and **36 of 37** on the CA, leaving the larger structural component non-emissive.

## CL / CA Section-A treatment

### Light Cruiser (CL)

- **A.1 — large class block:** eight complete position-welded blue regions—the four dorsal drum panels and their matching side regions—become light silver-white. Their eligible dorsal area is **23.2%**, within the 20–35% target.
- **A.2–A.3 — dorsal-first value cue:** the complete light drum reads as a single CL mass from overhead and remains visible in the 3/4 view.
- **A.4 — three-beat system rhythm:** two complete side-panel pairs plus the complete forward drum-ring region form three longitudinal cyan stations. No station cuts a triangle.

### Heavy Cruiser (CA)

- **A.1 — large class block:** five complete blue regions become dark navy: one complete drum-panel station with its side regions plus the forward drum ring. The other station remains as **two separated authored-blue panels**. The dark block covers **21.3%** of eligible dorsal blue area, within the 20–35% target.
- **A.2–A.3 — dorsal-first value cue:** the dark forward drum and retained blue panel pair produce the CA mass cue; the canon third nacelle remains a redundant silhouette cue.
- **A.4 — paired system rhythm:** complete aft and fore side-panel pairs emit, with the dark drum section between them. No glow mask is cut through a panel.

Orange, gold, silver-gray, and mid-gray source faces are never candidates for class recolouring. Authored red, white-window, and green faces retain their colours and receive emission only in AFTER.

## Section-A implementation lesson: snap to panels

These exports are unwelded triangle soups, so object-space station cuts can cross long triangles and appear as streaks or slivers even when evaluated cleanly in a shader. The script welds vertices by world-space position for connectivity, builds an edge-adjacency graph of source-blue faces, and flood-fills complete same-colour regions. A region is selected only when its dorsal area-weighted centroid falls inside the configured class or system band; every face in that region is then changed together. Boundaries therefore coincide with existing panel, collar, or ring seams.

Panel integrity takes precedence over hitting an exact area percentage. The script reports the measured panel-snapped share and emits a note if it falls outside 20–35%; it never expands a mask through the middle of a triangle merely to reach the target.

## Sprite-scale comparison

The strip order is **CL-before, CL-after, CA-before, CA-after**. Each 64×64 tile uses an orthographic camera fitted from the exact projection of every mesh vertex, then centred on those projected limits. The intended maximum silhouette extent is 48 pixels, leaving clearance around the full ship rather than clipping the bow sphere.

Measured non-background pixel bounds after rendering and again after strip assembly:

| Tile | 1× bounds in 64×64 | 4× bounds in 256×256 |
| --- | --- | --- |
| CL before / after | `x=7…56`, `y=18…44` | `x=31…224`, `y=76…178` |
| CA before / after | `x=7…56`, `y=20…42` | `x=31…224`, `y=85…170` |

The closest horizontal edge clearance is 7 pixels at 1× and 31 pixels at 4×. The script treats less than 5 pixels at 1× (20 pixels at 4×) as a render failure. The 4× strip is rendered natively at four times the tile resolution, not enlarged from the 1× strip.

## Outputs

| File | Contents |
| --- | --- |
| `light_cruiser_before_dorsal.png` | CL decoded authored colours, dorsal, 1200×900 |
| `light_cruiser_after_dorsal.png` | CL panel-snapped light drum + complete lit-system language, dorsal, 1200×900 |
| `light_cruiser_before_oblique.png` | CL decoded authored colours, 3/4 oblique, 1200×900 |
| `light_cruiser_after_oblique.png` | CL panel-snapped light drum + complete lit-system language, 3/4 oblique, 1200×900 |
| `light_cruiser_composite.png` | Labeled CL 2×2 comparison, 2400×1800 |
| `heavy_cruiser_before_dorsal.png` | CA decoded authored colours, dorsal, 1200×900 |
| `heavy_cruiser_after_dorsal.png` | CA dark drum + retained blue panels + complete lit-system language, dorsal, 1200×900 |
| `heavy_cruiser_before_oblique.png` | CA decoded authored colours, 3/4 oblique, 1200×900 |
| `heavy_cruiser_after_oblique.png` | CA dark drum + retained blue panels + complete lit-system language, 3/4 oblique, 1200×900 |
| `heavy_cruiser_composite.png` | Labeled CA 2×2 comparison, 2400×1800 |
| `cruisers_sprite_strip.png` | Four 64×64 tiles, 256×64 total; approximately 48 px maximum silhouette extent |
| `cruisers_sprite_strip_4x.png` | Four 256×256 tiles, 1024×256 total; approximately 192 px maximum silhouette extent |

Regenerate from the repository root with:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python "assets/blender/scripts/legibility_demo.py"
```
