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
import os
import json
import bpy
import bmesh
import math
import mathutils
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ROOT = REPO

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
# Per-faction, from data/ship-markup.json. Emissive rulings are Chris's and
# live there beside the colours, so this file holds no faction knowledge.
FACTION = args.get("faction", "EAR")
with open(os.path.join(REPO, "data", "ship-markup.json"), encoding="utf-8") as _fh:
    MARKUP = json.load(_fh)[FACTION]
PALETTE = [(r["key"], tuple(r["colour"]),
            dict(metal=r["metal"], rough=r["rough"], emit=r["emit"]))
           for r in MARKUP["regions"]]
PROTECT = {r["key"] for r in MARKUP["regions"] if r["role"] == "lit"}
PROTECT_WEIGHT = 0.0    # full protection: at 0.22 the lit detail still vanished,
                        # because slivers are what a collapse removes first

# Region-map colours: flat, maximally distinct, for the verification render.
REGION_KEY = {}
_spread = [(0.10, 0.45, 1.00), (0.05, 0.20, 0.55), (0.85, 0.85, 0.85), (0.30, 0.30, 0.32),
           (1.00, 0.78, 0.10), (1.00, 0.45, 0.05), (1.00, 0.05, 0.05), (0.10, 1.00, 0.20),
           (1.00, 1.00, 1.00)]
for _i, (_k, _c, _s) in enumerate(PALETTE):
    REGION_KEY[_k] = _spread[_i % len(_spread)]


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

def align_hull():
    """Put every exported hull on the same axis.

    These sets are not consistently modelled: across the Krelath Star Navy some
    classes run along X and others along Y. The game will place and rotate these
    itself, so they have to agree with each other - the longest axis onto X, and
    the slimmer end (the bow, on every design in these fleets) at +X.
    """
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    dims = list(obj.dimensions)
    longest = dims.index(max(dims))
    if longest == 1:
        obj.rotation_euler = (0.0, 0.0, math.radians(-90.0))
    elif longest == 2:
        obj.rotation_euler = (0.0, math.radians(90.0), 0.0)
    if longest != 0:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    xs = [v.co.x for v in mesh.vertices]
    mid = (min(xs) + max(xs)) / 2.0

    def spread(front):
        sel = [v for v in mesh.vertices if (v.co.x > mid) == front]
        if not sel:
            return 0.0
        return max(abs(v.co.y) for v in sel) + max(abs(v.co.z) for v in sel)

    if spread(True) > spread(False):
        obj.rotation_euler = (0.0, 0.0, math.radians(180.0))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    print("aligned: dims %s" % [round(d, 1) for d in obj.dimensions])


align_hull()

# A v3 export arrives as an unwelded triangle SOUP - exactly 3 vertices per
# triangle, nothing shared. That single fact causes most of what looks like
# separate problems: smoothing has no shared vertices to average across, so the
# hull shades as hair; and a collapse has no real edges to collapse, so it
# leaves slivers and bristles along every rim. Weld first, and the rest of the
# pipeline behaves.
bm = bmesh.new()
bm.from_mesh(mesh)
before_verts = len(bm.verts)
span = max(obj.dimensions)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=span * 1e-5)
bmesh.ops.dissolve_degenerate(bm, dist=span * 1e-6, edges=bm.edges)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mesh)
bm.free()
mesh.update()
print("welded %d -> %d verts (%d faces)"
      % (before_verts, len(mesh.vertices), len(mesh.polygons)))

# Now that vertices are shared, smoothing by angle means something.
bpy.ops.object.shade_smooth()
try:
    bpy.ops.object.shade_auto_smooth(angle=math.radians(32))
except Exception as exc:
    print("auto-smooth unavailable:", exc)

# ---------------- classify faces by their markup colour ----------------
attr = mesh.color_attributes[0]
counts = [0] * len(PALETTE)
areas = [0.0] * len(PALETTE)
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
    areas[idx] += poly.area

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
    # AgX rolls saturated emissives toward white, which rendered every red light
    # salmon-pink and had the critic reporting a colour fault that was the view
    # transform, not the asset. Standard is honest about emissive hue, which is
    # what an art review needs.
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.look = "None"
    except Exception as exc:
        print("view transform unavailable:", exc)
    scene.view_settings.exposure = 0.0
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
    bg.inputs["Strength"].default_value = 1.0
    if "SkyGrad" not in wt.nodes:
        # Two jobs, one world. The camera should see a dark backdrop, because
        # that is what the game shows and the ship needs to read against it -
        # but metal needs something BRIGHT to reflect or it renders as charcoal.
        # Light Path separates them: dark to camera rays, bright to everything
        # else (reflections, diffuse lighting).
        tex = wt.nodes.new("ShaderNodeTexGradient"); tex.name = "SkyGrad"
        geo = wt.nodes.new("ShaderNodeNewGeometry")
        sep = wt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = wt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[0].color = (0.06, 0.07, 0.10, 1)
        ramp.color_ramp.elements[1].position = 0.52
        ramp.color_ramp.elements[1].color = (1.60, 1.70, 1.95, 1)
        mid = ramp.color_ramp.elements.new(0.62); mid.color = (0.42, 0.47, 0.60, 1)
        top = ramp.color_ramp.elements.new(1.0); top.color = (0.20, 0.24, 0.33, 1)
        wt.links.new(geo.outputs["Incoming"], sep.inputs["Vector"])
        wt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])

        lit = wt.nodes.new("ShaderNodeBackground")
        wt.links.new(ramp.outputs["Color"], lit.inputs["Color"])
        lit.inputs["Strength"].default_value = 1.0
        seen = wt.nodes.new("ShaderNodeBackground")
        seen.inputs["Color"].default_value = (0.020, 0.026, 0.036, 1)
        seen.inputs["Strength"].default_value = 1.0
        path = wt.nodes.new("ShaderNodeLightPath")
        mix = wt.nodes.new("ShaderNodeMixShader")
        wt.links.new(lit.outputs["Background"], mix.inputs[1])
        wt.links.new(seen.outputs["Background"], mix.inputs[2])
        wt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
        out = wt.nodes["World Output"]
        wt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

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

    lamp("key", 16.0, 0.55, (-0.8, -1.0, 0.75))
    lamp("fill", 7.0, 0.90, (1.0, -0.55, 0.10))
    lamp("rim", 11.0, 0.40, (0.35, 1.0, 0.45))
    # The game sees these from above. Without an overhead source the top view -
    # the only view that ships - renders flat and murky.
    lamp("over", 13.0, 0.75, (-0.15, -0.25, 1.0))


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
# The measure has to be surface AREA, not face count: a planar dissolve merging
# a window panel into two big n-gons keeps every square millimetre of it, and a
# face-count gate reads that as a loss. Area only falls when geometry is gone.
after_area = [0.0] * len(PALETTE)
after_count = [0] * len(PALETTE)
for poly in mesh.polygons:
    after_area[poly.material_index] += poly.area
    after_count[poly.material_index] += 1
total_before, total_after = sum(areas), sum(after_area)
overall = total_after / total_before if total_before else 1.0
print("REGION SURVIVAL by area (overall %.1f%% of the source surface)" % (100 * overall))
lost = []
for (name, _, _), area_was, area_now, was, now in zip(PALETTE, areas, after_area, counts, after_count):
    if area_was <= 0:
        continue
    rate = area_now / area_was
    flag = ""
    if rate < 0.90:
        flag = "  <-- LOST"
        lost.append(name)
    print("  %-16s area %5.1f%%   faces %6d -> %6d%s" % (name, 100 * rate, was, now, flag))
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
