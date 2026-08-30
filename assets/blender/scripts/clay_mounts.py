"""Clay views of the annotated Krelath model to locate the weapon mounts."""
import bpy, math, os, mathutils

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "krelath")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=os.path.join(
    ROOT, "assets", "models", "Krelath - suggested weapons placements.stl"))
obj = bpy.context.selected_objects[0]
me = obj.data
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
ctr = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-ctr))

mat = bpy.data.materials.new("Clay"); mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
me.materials.clear(); me.materials.append(mat)
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 1.4
fill.rotation_euler = (math.radians(-55), 0, math.radians(-140))
bpy.context.collection.objects.link(fill)
world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.02, 0.03, 1)
bpy.context.scene.world = world
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
scene.camera = cam
size = 57.0
for label, loc, up in (
        ("persp", (size*0.9, size*0.85, size*0.55), None),
        ("top", (0.01, 0.01, size*1.5), None),
        ("bottom", (0.01, 0.01, -size*1.5), None),
        ("side", (size*1.4, 0, size*0.1), None)):
    cam.location = loc
    d = mathutils.Vector((0, 0, 0)) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUTDIR, "mounts_%s.png" % label)
    bpy.ops.render.render(write_still=True)
print("CLAY_DONE")
