# Fleet polish pass — spec (plan b)

Target files (Blender 5.2 headless Python, run via `blender --background --python <file>`):
- `assets/blender/scripts/fleet_build.py`      (Earth Federation)
- `assets/blender/scripts/krelath_fleet.py`    (Krelath Empire)
- `assets/blender/scripts/vraygon_fleet.py`    (Vraygon Star Realm)
- `assets/blender/scripts/zandrax_fleet.py`    (Zandrax Horde)

EDIT CODE ONLY. Do NOT run Blender. Do NOT touch face-classification logic,
patch analysis, raycast fitting placement, or render-view direction logic.
Keep the existing coding style (node-graph helpers, module constants).

## Hard API rules (violations fail silently or crash)
- `ShaderNodeMix`: ALWAYS link `inputs["A"]` / `inputs["B"]` by NAME.
  `inputs[0]` is Factor — linking A/B by index breaks the node silently.
- Render engine string is `"BLENDER_EEVEE"`.
- `Material.use_nodes = True` emits a deprecation warning — that is fine.
- New value sockets: `MapRange` outputs `outputs["Result"]`; Voronoi color is
  `outputs["Color"]`; distance is `outputs["Distance"]`.

## 1. Emissive lift (all four files)
- Multiply every window/door/tube/bay emission strength constant by 1.8
  (e.g. Earth `WINDOW_EMIT = 4.0` -> `7.2`, `BAY_EMIT` 0.7 -> 1.26, torp
  emission 1.5 -> 2.7; Krelath `WINDOW_EMIT` 1.8 -> 3.2, `TORP_EMIT`;
  Vraygon/Zandrax `WINDOW_EMIT`).
- Multiply engine-glow strength constants by 1.6 (`GLOW_EMIT` everywhere;
  Earth's `GLOW_EMIT = 1.1` -> 1.76).
- Vent strengths (`VENT_EMIT`) x1.4.
- Nav-light emission strength 2.5 -> 4.0 where present (Earth, Krelath).

## 2. Compositor glare (all four files)
In each scene-setup section (after the world is assigned, before the camera),
add a guarded compositor glare so emissives bloom:
```python
try:
    scene.use_nodes = True
    ct = scene.node_tree
    for n in list(ct.nodes):
        ct.nodes.remove(n)
    rl = ct.nodes.new("CompositorNodeRLayers")
    gl = ct.nodes.new("CompositorNodeGlare")
    gl.glare_type = "FOG_GLOW"
    gl.quality = "HIGH"
    gl.threshold = 1.0
    gl.size = 7
    comp = ct.nodes.new("CompositorNodeComposite")
    ct.links.new(rl.outputs["Image"], gl.inputs["Image"])
    ct.links.new(gl.outputs["Image"], comp.inputs["Image"])
    scene.render.use_compositing = True
except Exception as exc:
    print("glare skipped:", exc)
```
Keep the try/except exactly — Blender 5.2 may differ; a failure must not
break the render loop.

## 3. Lighting: lift the undersides (all four files)
- Raise the "Fill" sun energy to 2.6.
- Add a fourth sun "Under" with energy 0.9, rotation
  `(math.radians(-125), 0, math.radians(40))`, colour matching that file's
  Fill tint.

## 4. Camera margins (all four files)
All views currently frame too tight in places. In each `views`/`VIEWS` dict,
multiply every camera-location component that is a multiple of `size` by
1.12 (i.e. widen the orbit distance 12%). Do not change targets.

## 5. Material tiers
- Earth (`fleet_build.py`): hull roughness MapRange To Min/Max
  0.38/0.55 -> 0.45/0.62; silver accent metallic 0.7 -> 0.9 and roughness
  0.42 -> 0.28.
- Krelath (`krelath_fleet.py`): chitin roughness MapRange To Min/Max
  0.32/0.5 -> 0.40/0.58; bronze metallic 0.85 -> 0.95, roughness
  0.42 -> 0.30.
- Vraygon (`vraygon_fleet.py`): leave crystal gloss; engine material: change
  cell threshold 0.10 -> 0.14 (wider glowing cores, thinner dark borders).
- Zandrax (`zandrax_fleet.py`): red roughness MapRange To Min/Max
  0.42/0.62 -> 0.50/0.72; `GOLD_PLATE` -> (0.62, 0.40, 0.08, 1.0); grime
  MapRange To Min 0.50 -> 0.42.

## 6. Macro texture layer (all four files)
The reviews say fine detail collapses at distance; add ONE low-frequency
macro tone layer per hull material, layered multiplicatively into the final
base colour just before it links to `bsdf.inputs["Base Color"]`. Pattern to
replicate (adapted from zandrax_fleet.py's grime block):
```python
macro = nodes.new("ShaderNodeTexVoronoi")
macro.voronoi_dimensions = "3D"
macro.feature = "F1"
macro.inputs["Scale"].default_value = 0.06
macro.inputs["Randomness"].default_value = 0.7
links.new(coord.outputs["Object"], macro.inputs["Vector"])
mbw = nodes.new("ShaderNodeRGBToBW")
links.new(macro.outputs["Color"], mbw.inputs[0])
mrange = nodes.new("ShaderNodeMapRange")
mrange.inputs["To Min"].default_value = 0.82
mrange.inputs["To Max"].default_value = 1.06
links.new(mbw.outputs[0], mrange.inputs["Value"])
mcol = nodes.new("ShaderNodeCombineColor")
for ch in ("Red", "Green", "Blue"):
    links.new(mrange.outputs["Result"], mcol.inputs[ch])
mmix = nodes.new("ShaderNodeMix")
mmix.data_type = "RGBA"
mmix.blend_type = "MULTIPLY"
mmix.inputs["Factor"].default_value = 1.0
links.new(<current base colour socket>, mmix.inputs["A"])
links.new(mcol.outputs["Color"], mmix.inputs["B"])
# then link mmix.outputs["Result"] into bsdf Base Color instead
```
Use variable names that do not collide. In krelath_fleet.py additionally
reduce the barb bump contribution 0.16 -> 0.10. In vraygon_fleet.py set
`SEAM_W` 0.09 -> 0.07. Earth's hull builder is `build_hull_mat` (two
variants call it — edit the shared function only).

## Acceptance
- `python -m py_compile` passes on all four files.
- No other behavioural changes.
