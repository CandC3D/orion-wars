# Earth fleet legibility demonstration

This pass demonstrates the Section A distance-legibility recommendations on the **Earth Destroyer only**. The Frigate is intentionally deferred until its corrected export is available.

## True-colour correction to the earlier advice

The earlier description of Earth ships as having "pale cyan/white shells" was an artefact of the old emissive gate and AgX view transform. The authored Earth hull colour is a saturated mid-blue (`0, 0.62, 0.85`) over silver-gray structure. White is a limited accent/window-bank colour, not the main shell colour.

The operational-colour reading also changes: red is painted radiator treatment, not a glow or weapon colour; weapons are orange, the sensor dish is gold, and the dome navigation lights are red/green. Accordingly, this demo never derives emission from palette colour. Only faces explicitly selected by the class-rhythm mask emit.

The useful part of the earlier recommendation remains the value-structure principle: keep the established saturated blue identity, then add one large, darker recognition block with a separate, restrained system-light rhythm.

## Destroyer treatment

- **Large-area class paint code (Section A.1):** the AFTER version adds a very dark navy prow/spine wedge to original-blue faces on the upper command dome and central drum. It occupies **29.6% of the eligible dorsal blue area**, within the proposed 20–35% recognition range.
- **Dorsal-first design (A.2):** the mask uses upper-facing normals, a normalized Z cutoff, and a fitted centerline region. It is designed to read most clearly from overhead, then repeats naturally onto the visible upper curvature in the oblique view.
- **One unmistakable value difference (A.3):** at approximately 48 pixels long, the Destroyer changes from a predominantly bright-blue front to a dark-fronted, blue-edged mass. This is more reliable than counting fixtures.
- **Emissive rhythm (A.4):** two short bilateral groups are selected on the outboard pod tops. A per-corner `LegibilityEmission` attribute drives only those faces at strength `1.5`; there is no broad colour-key gate and no bloom that can erase the solid cyan core.
- **Material/value hierarchy (A.5–A.6):** the current satin rig is retained (`roughness 0.6`, `specular 0.2`, Standard view transform), so the test isolates paint/value and emission placement. The authored silver-gray, red, orange, gold, green, white, and mid-dark gray faces are unchanged.
- **Canon geometry:** the source GLB and silhouette are untouched. BEFORE and AFTER use copied mesh data; changes are limited to copied per-corner colour attributes and shader inputs.

Region fitting is normalized to each imported hull's bounds. The code separates dorsal faces, center/drum faces, and bilateral pod faces, and rejects long-span pod triangles from the emissive mask so a short group cannot become a full-length glowing rail. `HULLS` in the script is the extension point for the Frigate; its `light_dorsal_panel` and `one_continuous_group` modes are already supported.

## Outputs

| File | Contents |
| --- | --- |
| `destroyer_before_dorsal.png` | Current vertex colours, dorsal, 1200x900 |
| `destroyer_after_dorsal.png` | Dark wedge + paired system rhythm, dorsal, 1200x900 |
| `destroyer_before_oblique.png` | Current vertex colours, 3/4 oblique, 1200x900 |
| `destroyer_after_oblique.png` | Dark wedge + paired system rhythm, 3/4 oblique, 1200x900 |
| `destroyer_sprite_strip.png` | BEFORE left / AFTER right, 160x64; each ship is approximately 48 px long |
| `destroyer_composite.png` | Labeled 2x2 comparison sheet, 2400x1800 |

Regenerate everything from the repository root with:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python "assets/blender/scripts/legibility_demo.py"
```

## What to tune next

1. Compare the corrected Frigate beside this Destroyer at the same 48-pixel presentation. Tune the Frigate's single light dorsal panel and continuous system group as a pair with this dark wedge, rather than in isolation.
2. Test the sprite strip over the actual tactical-map backgrounds. The first adjustment should be wedge value; the second should be system-core intensity. Do not add bloom until those two shapes read without it.
3. If the final game camera is more oblique than this study, widen the aft end of the wedge slightly so more of it survives foreshortening.
4. Carry the same wedge into the tactical icon/lowest LOD, then add the redundant class glyph or tick language described in A.9.

