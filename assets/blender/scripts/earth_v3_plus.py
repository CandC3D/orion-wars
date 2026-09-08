"""Earth v3 "plussing" pass - turn a vertex-coloured sketch into a game asset.

The v3 EDF exports carry POSITION + COLOR_0 and nothing else: no normals, no
UVs, no materials. The COLOR_0 layer is the author's region markup (Tinkercad),
so this reads the markup rather than guessing where anything goes.

Earth emissive ruling (Chris, 2026-09-07): red, white and green are emissive.
The gold/amber dish is metallic like the grey parts. The orange ball turret is
painted safety orange in-universe - NOT emissive, and not metal. Each faction
gets its own ruling; this file is Earth's.

Two passes, so the treatments can be compared:
  light - the markup, resolved to clean PBR. Nothing added.
  heavy - the same, plus a procedural panel lattice driving bump, seam darkening
          and roughness break-up on hull and structure. Emissive regions stay
          clean. Silhouette is canon either way: no geometry is added.

Run:
  blender --background --python earth_v3_plus.py -- src="<glb>" slug=<name> mode=light
"""
import bpy
import bmesh
import math
import mathutils
import os
import sys

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"

args = {}
if "--" in sys.argv:
    for a in sys.argv[sys.argv.index("--") + 1:]:
        if "=" in a:
            k, v = a.split("=", 1)
            args[k] = v

SRC = args.get("src")
SLUG = args.get("slug", "earth_v3")
MODE = args.get("mode", "light")
OUTDIR = args.get("out", os.path.join(ROOT, "assets", "blender", "renders", "v3"))
RES = int(args.get("res", 2048))
# v1 Earth outputs sit at 8.4k-23.1k verts / 2.6-4.0 MB, but that budget belongs
# to models authored low-poly. A v3 hull needs more, and the protected lit detail
# spends ~22k of it outright. Under 8 MB is the real ceiling.
TARGET_TRIS = int(args.get("tris", 66000))
os.makedirs(OUTDIR, exist_ok=True)

# ---------------- the markup palette ----------------
# Raw COLOR_0 values as stored. Tinkercad writes sRGB numbers into the
# (linear-spec) COLOR_0 slot, so these match what the attribute reads back;
# they are decoded to linear before being used as a colour.
# role: how the region behaves.  metal/rough: PBR.  emit: emission strength.
# Metals are BRUSHED, not polished (Chris, 2026-09-07): high metallic, but
# roughness up around 0.5 so the silver reads as machined plate, not chrome.
PALETTE = [
    ("hull_primary",   (0.00, 0.62, 0.85), dict(metal=0.35, rough=0.42, emit=0.0)),
    ("hull_deep",      (0.00, 0.46, 0.67), dict(metal=0.35, rough=0.50, emit=0.0)),
    ("structure",      (0.75, 0.78, 0.80), dict(metal=0.90, rough=0.52, emit=0.0)),
    ("gunmetal",       (0.38, 0.40, 0.42), dict(metal=0.80, rough=0.58, emit=0.0)),
    ("dish_gold",      (0.88, 0.68, 0.21), dict(metal=0.90, rough=0.42, emit=0.0)),
    ("turret_orange",  (0.96, 0.51, 0.12), dict(metal=0.00, rough=0.55, emit=0.0)),
    ("nav_red",        (0.91, 0.11, 0.18), dict(metal=0.00, rough=0.40, emit=3.0)),
    ("nav_green",      (0.27, 0.72, 0.29), dict(metal=0.00, rough=0.40, emit=3.0)),
    ("window_white",   (0.98, 0.98, 0.98), dict(metal=0.00, rough=0.35, emit=2.2)),
]

# Collapse decimation preferentially removes low-area triangles, and a thin lit
# strip, a small window panel and a nav dot are made of precisely those. Left
# alone it destroyed nav_red (18,551 -> 279 faces), window_white (2,206 -> 45)
# and nav_green (1,296 -> 0) while the hull kept 40-50%. These are protected
# from the collapse entirely.
PROTECT = {"nav_red", "nav_green", "window_white"}
PROTECT_WEIGHT = 0.0    # full protection: at 0.22 the lit detail still vanished,
                        # because slivers are what a collapse removes first

# Region-map colours: flat, maximally distinct, for the verification render.
REGION_KEY = {
    "hull_primary": (0.10, 0.45, 1.00), "hull_deep": (0.05, 0.20, 0.55),
    "structure": (0.85, 0.85, 0.85), "gunmetal": (0.30, 0.30, 0.32),
    "dish_gold": (1.00, 0.78, 0.10), "turret_orange": (1.00, 0.45, 0.05),
    "nav_red": (1.00, 0.05, 0.05), "nav_green": (0.10, 1.00, 0.20),
    "window_white": (1.00, 1.00, 1.00),
}


def srgb_to_linear(c):
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


def nearest(colour):
    best, bd = 0, 1e9
    for i, (_, ref, _) in enumerate(PALETTE):
        d = sum((a - b) ** 2 for a, b in zip(colour, ref))
        if d < bd:
            best, bd = i, d
    return best


# ---------------- import ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
obj = max(meshes, key=lambda o: len(o.data.polygons))
for o in bpy.data.objects:
    o.select_set(False)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
mesh = obj.data
tris_before = len(mesh.polygons)

# A v3 export has POSITION only - no normals - so it arrives flat-faceted and
# both decimation and lighting suffer. Smooth it by angle first.
bpy.ops.object.shade_smooth()
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
except Exception as exc:
    print("auto-smooth unavailable:", exc)

# ---------------- classify faces by their markup colour ----------------
attr = mesh.color_attributes[0]
counts = [0] * len(PALETTE)
face_index = [0] * len(mesh.polygons)
for poly in mesh.polygons:
    r = g = b = 0.0
    for li in poly.loop_indices:
        c = attr.data[li].color
        r += c[0]; g += c[1]; b += c[2]
    n = len(poly.loop_indices)
    idx = nearest((r / n, g / n, b / n))
    face_index[poly.index] = idx
    counts[idx] += 1

print("REGION CENSUS")
for (name, _, _), n in zip(PALETTE, counts):
    print("  %-16s %7d faces  %5.1f%%" % (name, n, 100.0 * n / len(mesh.polygons)))


# ---------------- materials ----------------
def lattice(nt, scale, strength):
    """Voronoi panel plating: seams darken the plate and break the normal."""
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Scale"].default_value = (scale, scale * 1.6, scale)
    nt.links.new(coord.outputs["Object"], mapn.inputs["Vector"])
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Randomness"].default_value = 0.0
    nt.links.new(mapn.outputs["Vector"], vor.inputs["Vector"])
    seam = nt.nodes.new("ShaderNodeMapRange")
    seam.inputs["From Min"].default_value = 0.0
    seam.inputs["From Max"].default_value = 0.06
    nt.links.new(vor.outputs["Distance"], seam.inputs["Value"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    nt.links.new(seam.outputs["Result"], bump.inputs["Height"])
    return seam, bump


def build_material(name, base_srgb, spec, heavy):
    mat = bpy.data.materials.new("%s_%s" % (SLUG, name))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    lin = srgb_to_linear(base_srgb)
    emissive = spec["emit"] > 0

    bsdf.inputs["Metallic"].default_value = spec["metal"]
    bsdf.inputs["Roughness"].default_value = spec["rough"]
    if emissive:
        # A lit panel reads as light, not as painted colour: keep the diffuse
        # dark so the emission carries it.
        bsdf.inputs["Base Color"].default_value = (lin[0] * 0.15, lin[1] * 0.15, lin[2] * 0.15, 1.0)
        bsdf.inputs["Emission Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Emission Strength"].default_value = spec["emit"]
    else:
        bsdf.inputs["Base Color"].default_value = (*lin, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 0.0

    # Heavy pass: plating on the big painted/metal regions only. Emissive
    # regions and the small painted turret stay clean - panel seams across a
    # window strip read as dirt, not detail.
    if heavy and not emissive and name in ("hull_primary", "hull_deep", "structure", "gunmetal"):
        seam, bump = lattice(nt, 3.2 if name.startswith("hull") else 5.0, 0.22)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["A"].default_value = (lin[0] * 0.72, lin[1] * 0.72, lin[2] * 0.72, 1.0)
        mix.inputs["B"].default_value = (*lin, 1.0)
        nt.links.new(seam.outputs["Result"], mix.inputs["Factor"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        rough = nt.nodes.new("ShaderNodeMapRange")
        rough.inputs["To Min"].default_value = max(0.0, spec["rough"] - 0.12)
        rough.inputs["To Max"].default_value = min(1.0, spec["rough"] + 0.18)
        nt.links.new(seam.outputs["Result"], rough.inputs["Value"])
        nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def build_region_material(name):
    mat = bpy.data.materials.new("region_" + name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    c = REGION_KEY[name]
    bsdf.inputs["Base Color"].default_value = (*c, 1.0)
    bsdf.inputs["Emission Color"].default_value = (*c, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


mesh.materials.clear()
for name, srgb, spec in PALETTE:
    mesh.materials.append(build_material(name, srgb, spec, MODE == "heavy"))
for poly in mesh.polygons:
    poly.material_index = face_index[poly.index]

# ---------------- region map render (verification, before anything is lost) ----------------
region_mats = [build_region_material(name) for name, _, _ in PALETTE]


def look(name, cam_dir, ortho_pad=1.15):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast" if "AgX" in scene.view_settings.view_transform else "None"
    scene.view_settings.exposure = 1.2
    if scene.world is None:                     # an empty factory start has no world
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    # Metal is a mirror: against a black void the silver structure renders as
    # charcoal and the pass looks like it failed when it did not. Give the
    # review render a dim sky to reflect - a gradient, brighter overhead - while
    # keeping the visible backdrop dark.
    wt = scene.world.node_tree
    bg = wt.nodes["Background"]
    bg.inputs["Color"].default_value = (0.05, 0.065, 0.09, 1)
    bg.inputs["Strength"].default_value = 1.35
    if "SkyGrad" not in wt.nodes:
        tex = wt.nodes.new("ShaderNodeTexGradient"); tex.name = "SkyGrad"
        tex.gradient_type = "EASING"
        geo = wt.nodes.new("ShaderNodeNewGeometry")
        sep = wt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = wt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.10, 0.115, 0.145, 1)
        ramp.color_ramp.elements[1].color = (0.62, 0.68, 0.80, 1)
        wt.links.new(geo.outputs["Incoming"], sep.inputs["Vector"])
        wt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
        wt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Aim at the geometry, not the object origin - an imported GLB's origin is
    # often nowhere near its bounding box.
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    centre = sum(corners, mathutils.Vector()) / 8.0
    span = max((max(c[i] for c in corners) - min(c[i] for c in corners)) for i in range(3))
    cam_data.ortho_scale = span * ortho_pad
    v = mathutils.Vector(cam_dir).normalized()
    cam.location = centre + v * span * 3
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (-v).to_track_quat("-Z", "Y")
    return cam



def add_lights():
    corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
    centre = sum(corners, mathutils.Vector()) / 8.0
    span = max((max(c[i] for c in corners) - min(c[i] for c in corners)) for i in range(3))

    def lamp(name, energy, size, direction):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy * (span ** 2) * 0.35
        data.size = span * size
        o = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(o)
        v = mathutils.Vector(direction).normalized()
        o.location = centre + v * span * 2.2
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = (-v).to_track_quat("-Z", "Y")

    lamp("key", 8.5, 0.55, (-0.8, -1.0, 0.75))
    lamp("fill", 3.0, 0.9, (1.0, -0.55, 0.10))
    lamp("rim", 6.0, 0.40, (0.35, 1.0, 0.45))


VIEWS = [("q34", (-0.75, -1.0, 0.42)), ("side", (-1.0, 0.0, 0.06)),
         ("top", (0.0, -0.12, 1.0)), ("front", (0.0, -1.0, 0.10))]

if MODE == "regions":
    for m in region_mats:
        pass
    mesh.materials.clear()
    for m in region_mats:
        mesh.materials.append(m)
    for poly in mesh.polygons:
        poly.material_index = face_index[poly.index]
    add_lights()
    for tag, dirv in VIEWS:
        cam = look(tag, dirv)
        bpy.context.scene.render.filepath = os.path.join(OUTDIR, "%s_regions_%s.png" % (SLUG, tag))
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
    print("REGIONS_DONE")
    sys.exit(0)

# ---------------- decimate ----------------
# Planar dissolve alone is what the v1 pipeline used, because those STLs were
# faceted low-poly. A v3 export is smooth CAD: almost nothing is coplanar, so
# dissolve removes ~1%. A collapse has to follow - but collapsing a smooth hull
# to the v1 triangle budget shreds it, because v1's budget belongs to models
# that were authored low-poly rather than reduced from CAD.
mod = obj.modifiers.new("Dec", "DECIMATE")
mod.decimate_type = "DISSOLVE"
mod.angle_limit = math.radians(4.0)
mod.delimit = {"MATERIAL"}          # never dissolve across a region boundary
bpy.ops.object.modifier_apply(modifier=mod.name)
after_planar = len(mesh.polygons)

if TARGET_TRIS and len(mesh.polygons) > TARGET_TRIS:
    # Weight every vertex of a protected region at 0 and everything else at 1,
    # then hand the group to the modifier: the collapse acts where the weight is,
    # so the lights survive at full density while the hull carries the reduction.
    group = obj.vertex_groups.new(name="reducible")
    protected_slots = {i for i, (n, _, _) in enumerate(PALETTE) if n in PROTECT}
    protected_verts = set()
    for poly in mesh.polygons:
        if poly.material_index in protected_slots:
            protected_verts.update(poly.vertices)
    free = [v.index for v in mesh.vertices if v.index not in protected_verts]
    if free:
        group.add(free, 1.0, "REPLACE")
    if protected_verts:
        # Fully protected. The budget below is raised to pay for it, because
        # partial protection does not work here: the lit regions are thin
        # slivers and a collapse removes those first at any weight above zero.
        group.add(sorted(protected_verts), PROTECT_WEIGHT, "REPLACE")
    print("protected %d of %d vertices from the collapse"
          % (len(protected_verts), len(mesh.vertices)))

    mod = obj.modifiers.new("Col", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.use_collapse_triangulate = True
    mod.vertex_group = group.name
    mod.vertex_group_factor = 1.0
    # The modifier ratio is GLOBAL - the vertex group only decides where the
    # reduction lands, not how much of it there is. Aiming this at the reducible
    # subset instead double-counted the cut and crushed the hull to 3%.
    mod.ratio = min(1.0, TARGET_TRIS / float(len(mesh.polygons)))
    bpy.ops.object.modifier_apply(modifier=mod.name)

print("decimated %d -> %d (planar) -> %d tris"
      % (tris_before, after_planar, len(mesh.polygons)))

# A triangle budget and a file size can both pass while the ship has silently
# lost its navigation lights - that is exactly what happened on the first run.
# Measure every region's survival and fail loudly on any that fell off a cliff.
after = [0] * len(PALETTE)
for poly in mesh.polygons:
    after[poly.material_index] += 1
overall = len(mesh.polygons) / float(after_planar)
print("REGION SURVIVAL (overall %.0f%%)" % (100 * overall))
lost = []
for (name, _, _), was, now in zip(PALETTE, counts, after):
    if not was:
        continue
    rate = now / float(was)
    flag = ""
    if now == 0 or rate < overall * 0.5:
        flag = "  <-- LOST"
        lost.append(name)
    print("  %-16s %7d -> %7d  %5.1f%%%s" % (name, was, now, 100 * rate, flag))
if lost:
    print("REGION_GATE_FAILED: " + ", ".join(lost))
else:
    print("REGION_GATE_OK")

if MODE == "light":
    # Every light-pass region is a flat colour, so there is nothing a texture
    # could carry that a material cannot. Skip UV and bake entirely: glTF takes
    # the nine materials directly, the file has no images in it at all, and the
    # colours arrive exact instead of resampled.
    pass
else:
    # Heavy regions are procedural, so they have to be baked down. Texture
    # budget has to match the triangle count: Smart UV Project on a dense hull
    # makes thousands of small islands, and at 1024 the margins eat the map and
    # most of it bakes black.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")

    for ms in obj.material_slots:
        for n in ms.material.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.inputs["Metallic"].default_value = 0.0   # metals bake near-black

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 2
    scene.cycles.use_denoising = False
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True

    # No normal bake. Baking the lattice's bump through Smart UV seams produces
    # a normal map that shades the hull into black shards when re-applied - the
    # plating has to survive in base colour and roughness instead.
    BAKES = [("base", "DIFFUSE", "sRGB"), ("rough", "ROUGHNESS", "Non-Color"),
             ("emit", "EMIT", "sRGB")]
    images = {}
    for tag, btype, cspace in BAKES:
        img = bpy.data.images.new("%s_%s_%s" % (SLUG, MODE, tag), RES, RES,
                                  alpha=False, float_buffer=(tag == "normal"))
        img.colorspace_settings.name = cspace
        images[tag] = img
        added = []
        for ms in obj.material_slots:
            nt = ms.material.node_tree
            texn = nt.nodes.new("ShaderNodeTexImage")
            texn.image = img
            nt.nodes.active = texn
            texn.select = True
            added.append((nt, texn))
        bpy.ops.object.bake(type=btype)
        for nt, texn in added:
            nt.nodes.remove(texn)
        print("  baked", tag)

    mat = bpy.data.materials.new("%s_%s_baked" % (SLUG, MODE))
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.35
    for tag, sock in (("base", "Base Color"), ("rough", "Roughness"), ("emit", "Emission Color")):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = images[tag]
        nt.links.new(t.outputs["Color"], bsdf.inputs[sock])
    bsdf.inputs["Emission Strength"].default_value = 1.5
    mesh.materials.clear()
    mesh.materials.append(mat)

out_glb = os.path.join(OUTDIR, "%s_%s.glb" % (SLUG, MODE))
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True)
size_mb = os.path.getsize(out_glb) / 1e6

add_lights()
for tag, dirv in VIEWS:
    cam = look(tag, dirv)
    bpy.context.scene.render.filepath = os.path.join(OUTDIR, "%s_%s_%s.png" % (SLUG, MODE, tag))
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)

print("PLUSSED %s mode=%s tris %d->%d  %.1f MB  -> %s"
      % (SLUG, MODE, tris_before, len(mesh.polygons), size_mb, out_glb))
print("V3_PLUS_DONE")
