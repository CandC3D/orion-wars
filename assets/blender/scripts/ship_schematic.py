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
import bpy
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

# Same markup palette the plussing pass reads, so the masks agree with the asset.
PALETTE = [
    ("hull_primary",  (0.00, 0.62, 0.85)), ("hull_deep",     (0.00, 0.46, 0.67)),
    ("structure",     (0.75, 0.78, 0.80)), ("gunmetal",      (0.38, 0.40, 0.42)),
    ("dish_gold",     (0.88, 0.68, 0.21)), ("turret_orange", (0.96, 0.51, 0.12)),
    ("nav_red",       (0.91, 0.11, 0.18)), ("nav_green",     (0.27, 0.72, 0.29)),
    ("window_white",  (0.98, 0.98, 0.98)),
]
GROUPS = {
    "lit": {"nav_red", "nav_green", "window_white"},
    "metal": {"structure", "gunmetal"},
    # The dish and the painted cap were in no group at all, so the two most
    # identifying things in a plan view - the cap dead centre on the command
    # sphere, the dish beneath it - were simply absent from the glyph.
    "trim": {"dish_gold", "turret_orange"},
    # Where the hull's own two blues meet. In a plan view this carries most of
    # the structural break-up that a quarter view gets from its silhouette.
    "deep": {"hull_deep"},
}


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

for view in wanted_views:
    cam = aim(view)
    for tag in ("hull", "lit", "metal", "trim", "deep"):
        mesh.materials.clear()
        mesh.materials.append(white)
        mesh.materials.append(black)
        if tag == "hull":
            for poly in mesh.polygons:
                poly.material_index = 0
        else:
            wanted = {i for i, (n, _) in enumerate(PALETTE) if n in GROUPS[tag]}
            for poly in mesh.polygons:
                poly.material_index = 0 if face_region[poly.index] in wanted else 1
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s_%s.png" % (SLUG, view, tag))
        bpy.ops.render.render(write_still=True)
        print("wrote", scene.render.filepath)
    bpy.data.objects.remove(cam, do_unlink=True)

print("MASKS_DONE")
