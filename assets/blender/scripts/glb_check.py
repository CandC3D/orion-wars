"""Re-import an exported GLB and render it - bake quality sanity check."""
import bpy, math, os, mathutils, sys
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
slug = "earth_frigate"
for a in sys.argv:
    if a.startswith("only="):
        slug = a.split("=", 1)[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "game", "ships", slug + ".glb"))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(55), 0, math.radians(35))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 2.2
fill.rotation_euler = (math.radians(-60), 0, math.radians(-130))
bpy.context.collection.objects.link(fill)
world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.012, 0.02, 1)
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
scene.camera = cam
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
allco = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
size = max(max(c.x for c in allco) - min(c.x for c in allco),
           max(c.y for c in allco) - min(c.y for c in allco))
cam.location = (size * 1.0, size * 0.95, size * 0.5)
d = mathutils.Vector((0, 0, 0)) - mathutils.Vector(cam.location)
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = os.path.join(ROOT, "assets", "blender", "preview", "glb_check_%s.png" % slug)
bpy.ops.render.render(write_still=True)
print("CHECK_DONE")
