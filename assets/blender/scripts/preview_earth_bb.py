"""Clay preview of Earth Battleship: separate loose parts, report part bboxes,
render 4 views. Helps decide material assignment before building the kit."""
import bpy
import json
import math
import os

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models", "Earth Battleship.stl")
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview")
os.makedirs(OUTDIR, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]

# separate into loose parts
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

parts = []
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    bb = [o.matrix_world @ v.co for v in o.data.vertices]
    xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
    parts.append({
        "name": o.name,
        "tris": len(o.data.polygons),
        "bbox_min": [round(min(xs), 2), round(min(ys), 2), round(min(zs), 2)],
        "bbox_max": [round(max(xs), 2), round(max(ys), 2), round(max(zs), 2)],
    })
with open(os.path.join(OUTDIR, "earth_bb_parts.json"), "w") as f:
    json.dump(parts, f, indent=2)
print("PARTS", len(parts))

# clay material
mat = bpy.data.materials.new("Clay")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.7, 0.7, 0.7, 1)
bsdf.inputs["Roughness"].default_value = 0.8
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    o.data.materials.clear()
    o.data.materials.append(mat)

# lighting
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 1.0
fill.rotation_euler = (math.radians(-60), 0, math.radians(-140))
bpy.context.collection.objects.link(fill)

world = bpy.data.worlds.new("World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.05, 0.06, 1)
bpy.context.scene.world = world

# camera setup helper
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1280
scene.render.resolution_y = 960

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam

# center of all geometry
allobjs = [o for o in bpy.data.objects if o.type == "MESH"]
minv = [min(min((o.matrix_world @ v.co)[i] for v in o.data.vertices) for o in allobjs) for i in range(3)]
maxv = [max(max((o.matrix_world @ v.co)[i] for v in o.data.vertices) for o in allobjs) for i in range(3)]
center = [(minv[i] + maxv[i]) / 2 for i in range(3)]
size = max(maxv[i] - minv[i] for i in range(3))

views = {
    "top":   (center[0], center[1], center[2] + size * 1.8),
    "side":  (center[0] + size * 1.8, center[1], center[2]),
    "front": (center[0], center[1] - size * 1.8, center[2]),
    "persp": (center[0] + size * 1.2, center[1] - size * 1.2, center[2] + size * 0.8),
}
import mathutils
for label, loc in views.items():
    cam.location = loc
    direction = mathutils.Vector(center) - mathutils.Vector(loc)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUTDIR, f"earth_bb_clay_{label}.png")
    bpy.ops.render.render(write_still=True)
print("RENDER_DONE")
