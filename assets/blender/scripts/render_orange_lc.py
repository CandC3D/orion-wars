import bpy, math, os, mathutils
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUT = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Light Cruiser v2.1.glb"))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data
ca = me.color_attributes[0]
col = ca.data
def near(c, t):
    return all(abs(round(a, 2) - b) < 0.02 for a, b in zip(c[:3], t))
n_orange = 0
for p in me.polygons:
    if all(near(col[li].color, (0.96, 0.51, 0.12)) for li in p.loop_indices):
        n_orange += 1
        for li in p.loop_indices:
            col[li].color = (0.0, 1.0, 0.0, 1.0)
print("highlighted", n_orange)
# material showing vertex colour
mat = bpy.data.materials.new("VCol"); mat.use_nodes = True
nt = mat.node_tree
vc = nt.nodes.new("ShaderNodeVertexColor"); vc.layer_name = ca.name
bsdf = nt.nodes["Principled BSDF"]
nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
me.materials.clear(); me.materials.append(mat)
# lights & camera aimed at orange cluster centre
ws = [obj.matrix_world @ v.co for v in me.vertices]
ctr = sum(ws, mathutils.Vector()) / len(ws)
ext = max(max(c[i] for c in ws) - min(c[i] for c in ws) for i in range(3))
print("ship ctr", tuple(round(v,1) for v in ctr), "ext", round(ext,1))
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 5; sun.rotation_euler = (math.radians(50), 0, math.radians(30))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("F", bpy.data.lights.new("F", "SUN"))
fill.data.energy = 2.5; fill.rotation_euler = (math.radians(-55), 0, math.radians(-140))
bpy.context.collection.objects.link(fill)
w = bpy.data.worlds.new("W"); w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.05, 0.07, 1)
bpy.context.scene.world = w
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400; scene.render.resolution_y = 1000
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam); scene.camera = cam
for label, mult in (("sideA", (1.0, 0.75, 0.55)), ("sideB", (-1.0, -0.75, 0.55)), ("top", (0.05, 0.05, 1.4))):
    cam.location = ctr + mathutils.Vector(mult) * ext
    d = ctr - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, "lc_orange2_%s.png" % label)
    bpy.ops.render.render(write_still=True)
print("ORANGE_RENDER_DONE")
