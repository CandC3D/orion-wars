"""Top-down plan-view masks for a ship, for the console's class glyph.

The console draws the class icon at 120px inside the shield ring
(console-instruments.js: <image x=90 y=90 width=120 height=120>) and the
tactical map draws the same file at 28px. It is loaded with <image href>, so it
cannot inherit CSS colour - whatever it needs must be baked in. At 28px a
wireframe is mush, so what the glyph wants is the hull's true PLAN OUTLINE,
filled, in the faction's colours, with only the strongest internal features.

This renders the masks; trace-ship-icon.py turns them into the SVG.

Bow-up, because the console puts the BOW marker at the top of the ring.

  hull  - the whole silhouette
  lit   - the emissive regions only (nav lights, windows, engine bell)
  metal - the structural bands, the strongest internal read at small size

Run:
  blender --background --python ship_schematic.py -- src=<glb> slug=<name> [res=768]
"""
import os
import bpy
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
SLUG = args.get("slug", "ship")
RES = int(args.get("res", 768))
# Named views, as (azimuth degrees about Z, elevation degrees). The hull's long
# axis is world X with the bow at +X. More can be added here without touching
# anything else; the tracer keys off whatever names appear in the filenames.
VIEWS = {
    "top":     (0.0,   90.0),
    "bow":     (0.0,    0.0),
    "stern":   (180.0,  0.0),
    "side":    (90.0,   0.0),
    "quarter": (35.0,  28.0),
    "high":    (20.0,  62.0),
}
requested = args.get("views", "top")
OUTDIR = args.get("out", os.path.join(ROOT, "assets", "blender", "renders", "v3", "masks"))
os.makedirs(OUTDIR, exist_ok=True)

# The markup reading is per faction and lives in data/ship-markup.json, so a new
# faction is an entry there rather than an edit here.
import json
FACTION = args.get("faction", "EAR")
with open(os.path.join(REPO, "data", "ship-markup.json"), encoding="utf-8") as _fh:
    MARKUP = json.load(_fh)[FACTION]
PALETTE = [(r["key"], tuple(r["colour"])) for r in MARKUP["regions"]]
GROUPS = {}
for _r in MARKUP["regions"]:
    GROUPS.setdefault(_r["role"], set()).add(_r["key"])


def nearest(c):
    return min(range(len(PALETTE)), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, PALETTE[i][1])))


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
for o in bpy.data.objects:
    o.select_set(False)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
mesh = obj.data

attr = mesh.color_attributes[0]
face_region = []
for poly in mesh.polygons:
    r = g = b = 0.0
    for li in poly.loop_indices:
        c = attr.data[li].color
        r += c[0]; g += c[1]; b += c[2]
    n = len(poly.loop_indices)
    face_region.append(nearest((r / n, g / n, b / n)))

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 4
scene.render.film_transparent = False
scene.render.resolution_x = RES
scene.render.resolution_y = RES
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "BW"
try:
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
except Exception as exc:
    print("view transform unavailable:", exc)
if scene.world is None:
    scene.world = bpy.data.worlds.new("World")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0

def align_hull():
    """Put every hull on the same axis, without guessing which end is the bow.

    Models within a fleet are authored to a consistent convention, so the
    reliable move is to rotate the longest axis onto X and stop. An earlier
    version tried to infer the bow by comparing the cross-section of the two
    halves and putting the slimmer end forward. That inverted every hull whose
    point-defence blisters widen the bow - a whole class of ships - and left
    near-cubic strike craft to chance. Direction is data now: orientation.yaw in
    data/ship-markup.json, per faction with per-hull overrides, applied after
    the axis rotation.
    """
    # The glTF importer leaves objects in QUATERNION mode, in which assigning
    # rotation_euler is silently ignored.
    obj.rotation_mode = "XYZ"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    dims = list(obj.dimensions)
    longest = dims.index(max(dims))
    if longest == 1:
        obj.rotation_euler = (0.0, 0.0, math.radians(-90.0))
    elif longest == 2:
        obj.rotation_euler = (0.0, math.radians(90.0), 0.0)
    if longest != 0:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    orient = MARKUP.get("orientation", {})
    yaw = orient.get("hulls", {}).get(SLUG)
    if yaw is None:
        key = orient.get("markerRegion")
        rule_used = "none"
        if key:
            # Orient from the MARKUP, not from hull shape. On Earth the painted
            # orange cap sits on the command sphere, and Chris's rule is that the
            # sphere is always at the top - so putting that region forward is a
            # fact about the model rather than a guess about its silhouette.
            # Two shape heuristics were tried and both failed on whole classes:
            # "slimmer end forward" inverted every hull whose point-defence
            # blisters widen the bow, and "widest station forward" chose the
            # nacelles, which spread wider than the sphere.
            idx = [i for i, (k, _) in enumerate(PALETTE) if k == key]
            if idx:
                want = idx[0]
                xs = []
                for poly in mesh.polygons:
                    if face_region[poly.index] == want:
                        xs.append(poly.center.x)
                if xs:
                    allx = [v.co.x for v in mesh.vertices]
                    mid = (min(allx) + max(allx)) / 2.0
                    yaw = 0 if (sum(xs) / len(xs)) > mid else 180
                    rule_used = "%s at %s" % (key, "+X" if yaw == 0 else "-X")
        if yaw is None:
            yaw = 0
        print("orientation rule: %s" % rule_used)
    yaw = yaw or 0
    if yaw:
        obj.rotation_euler = (0.0, 0.0, math.radians(yaw))
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    print("aligned: dims %s yaw %s" % ([round(d, 1) for d in obj.dimensions], yaw))

align_hull()

corners = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
centre = sum(corners, mathutils.Vector()) / 8.0
span = max((max(c[i] for c in corners) - min(c[i] for c in corners)) for i in range(3))


def aim(view):
    """Place an orthographic camera for a named view.

    Top is special-cased: the console puts the BOW marker at the top of the
    shield ring, so a plan view has to be rolled to put the bow at screen up.
    Every other view is a straightforward track-to.
    """
    az, el = VIEWS[view]
    cam_data = bpy.data.cameras.new("cam_" + view)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span * 1.04
    cam = bpy.data.objects.new("cam_" + view, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    if el >= 89.0:
        cam.location = centre + mathutils.Vector((0.0, 0.0, span * 3))
        cam.rotation_euler = (0.0, 0.0, math.radians(-90.0))
        return cam
    a, e = math.radians(az), math.radians(el)
    d = mathutils.Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    cam.location = centre + d * span * 3
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (-d).to_track_quat("-Z", "Y")
    return cam


def flat(value):
    mat = bpy.data.materials.new("mask_%s" % value)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (value, value, value, 1.0)
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return mat


white, black = flat(1.0), flat(0.0)

wanted_views = [v.strip() for v in requested.split(",") if v.strip() in VIEWS]
if not wanted_views:
    raise SystemExit("no known view requested; choose from %s" % ", ".join(sorted(VIEWS)))

# One mask per REGION, not per role. Two regions can share a role and still be
# different things - Krelath orange and yellow are both self-lit, and drawing
# them in one colour turned every orange component gold.
for view in wanted_views:
    cam = aim(view)
    for tag in ["hull"] + [k for k, _ in PALETTE]:
        mesh.materials.clear()
        mesh.materials.append(white)
        mesh.materials.append(black)
        if tag == "hull":
            for poly in mesh.polygons:
                poly.material_index = 0
        else:
            want = [i for i, (k, _) in enumerate(PALETTE) if k == tag][0]
            for poly in mesh.polygons:
                poly.material_index = 0 if face_region[poly.index] == want else 1
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s_%s.png" % (SLUG, view, tag))
        bpy.ops.render.render(write_still=True)
    # Crease pass. The region masks can only put an edge where two MATERIALS
    # meet, so wherever one part joins another of the same material - a warp pod
    # meeting the structure it hangs from, the spoke joining a nav ball to its
    # nacelle - the two merge into a single shape with no line between them.
    # Freestyle draws the model's own silhouette and fold lines, which is what
    # makes the result read as a schematic rather than a flat colour map.
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = 1.0
    view_layer = bpy.context.view_layer
    view_layer.use_freestyle = True
    fs = view_layer.freestyle_settings
    fs.crease_angle = math.radians(134)
    for old in list(fs.linesets):
        fs.linesets.remove(old)
    ls = fs.linesets.new("creases")
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_contour = True
    ls.select_material_boundary = False      # the region masks already carry those
    ls.linestyle.color = (1.0, 1.0, 1.0)
    ls.linestyle.thickness = float(args.get("crease_px", 2.0))
    mesh.materials.clear()
    mesh.materials.append(black)             # body black, lines white
    for poly in mesh.polygons:
        poly.material_index = 0
    scene.render.filepath = os.path.join(OUTDIR, "%s_%s_creases.png" % (SLUG, view))
    bpy.ops.render.render(write_still=True)
    scene.render.use_freestyle = False
    view_layer.use_freestyle = False

    print("rendered %d masks for view %s" % (len(PALETTE) + 1, view))
    bpy.data.objects.remove(cam, do_unlink=True)

print("MASKS_DONE")
