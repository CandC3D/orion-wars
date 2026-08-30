"""GLB export pass - bakes each ship's procedural materials to textures and
exports a web-ready GLB per ship for the game renderer.

Per ship (.blend saved by the fleet build scripts):
1. open the .blend, find the ship mesh (largest mesh object)
2. Earth hulls only: planar-decimate (4 deg) - silhouette-safe on boolean
   models; alien hulls are already low-poly
3. Smart UV Project
4. Cycles-bake base colour (DIFFUSE/COLOR), roughness, emission and normal
   (includes shader bump) to 1024px maps
5. replace all materials with one baked Principled material
6. export GLB (textures packed) to assets/game/ships/<slug>.glb

Run:  blender --background --python glb_export.py [-- only=<slug>]
"""
import bpy
import math
import os
import sys

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
BLENDDIR = os.path.join(ROOT, "assets", "blender")
OUTDIR = os.path.join(ROOT, "assets", "game", "ships")
os.makedirs(OUTDIR, exist_ok=True)

SLUGS = [
    "earth_frigate", "earth_destroyer", "earth_light_cruiser",
    "earth_heavy_cruiser", "earth_battleship", "earth_command_ship",
    "krelath_frigate", "krelath_destroyer", "krelath_light_cruiser",
    "krelath_heavy_cruiser", "krelath_battleship", "krelath_strike_cruiser",
    "vraygon_frigate", "vraygon_destroyer", "vraygon_light_cruiser",
    "vraygon_heavy_cruiser", "vraygon_battleship", "vraygon_monitor",
    "zandrax_frigate", "zandrax_destroyer", "zandrax_light_cruiser",
    "zandrax_heavy_cruiser", "zandrax_battleship", "zandrax_corvette",
]

only = None
if "--" in sys.argv:
    for a in sys.argv[sys.argv.index("--") + 1:]:
        if a.startswith("only="):
            only = a.split("=", 1)[1]

RES = 1024
BAKES = [
    ("base", "DIFFUSE", "sRGB"),
    ("rough", "ROUGHNESS", "Non-Color"),
    ("emit", "EMIT", "sRGB"),
    ("normal", "NORMAL", "Non-Color"),
]


def export_ship(slug):
    path = os.path.join(BLENDDIR, slug + ".blend")
    if not os.path.exists(path):
        print("MISSING", slug)
        return
    bpy.ops.wm.open_mainfile(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    obj = max(meshes, key=lambda o: len(o.data.vertices))
    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    tris_before = len(obj.data.polygons)
    if slug.startswith("earth_"):
        mod = obj.modifiers.new("Dec", "DECIMATE")
        mod.decimate_type = "DISSOLVE"
        mod.angle_limit = math.radians(4.0)
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # UVs
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")

    # metals bake near-black in DIFFUSE/COLOR - zero metallic first (the
    # originals are discarded after export anyway)
    for ms in obj.material_slots:
        mat = ms.material
        if mat and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Metallic"].default_value = 0.0

    # bake setup
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 2
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True

    images = {}
    for tag, btype, cspace in BAKES:
        img = bpy.data.images.new("%s_%s" % (slug, tag), RES, RES,
                                  alpha=False,
                                  float_buffer=(tag == "normal"))
        img.colorspace_settings.name = cspace
        images[tag] = img
        nodes_added = []
        for ms in obj.material_slots:
            mat = ms.material
            if not mat or not mat.use_nodes:
                continue
            nt = mat.node_tree
            texn = nt.nodes.new("ShaderNodeTexImage")
            texn.image = img
            nt.nodes.active = texn
            texn.select = True
            nodes_added.append((nt, texn))
        bpy.ops.object.bake(type=btype)
        for nt, texn in nodes_added:
            nt.nodes.remove(texn)
        print("  baked", tag)

    # baked material
    mat = bpy.data.materials.new(slug + "_baked")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.35

    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = images["base"]
    nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])

    tr = nt.nodes.new("ShaderNodeTexImage")
    tr.image = images["rough"]
    nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])

    te = nt.nodes.new("ShaderNodeTexImage")
    te.image = images["emit"]
    nt.links.new(te.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.5

    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = images["normal"]
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    obj.data.materials.clear()
    obj.data.materials.append(mat)

    out = os.path.join(OUTDIR, slug + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB",
                              use_selection=True)
    sz = os.path.getsize(out) / 1e6
    print("EXPORTED %s tris %d->%d  %.1f MB"
          % (slug, tris_before, len(obj.data.polygons), sz))


targets = [only] if only else SLUGS
for slug in targets:
    try:
        export_ship(slug)
    except Exception as exc:
        print("FAILED", slug, exc)
print("GLB_DONE")
