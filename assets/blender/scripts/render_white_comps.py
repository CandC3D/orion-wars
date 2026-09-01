"""Colour-code the Frigate's white components to tell strut from windows."""
import bpy, math, os, mathutils
from collections import defaultdict
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Frigate v2.1.glb"))
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
me = obj.data
ca = me.color_attributes[0]
white = [p.index for p in me.polygons
         if all(ca.data[p.loop_start].color[k] > 0.9 for k in range(3))]
wset = set(white)
vmap = defaultdict(list)
for i in white:
    for v in me.polygons[i].vertices:
        co = me.vertices[v].co
        vmap[(round(co.x, 3), round(co.y, 3), round(co.z, 3))].append(i)
parent = {i: i for i in white}
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i
for key, faces in vmap.items():
    a = find(faces[0])
    for f in faces[1:]:
        b = find(f)
        if a != b:
            parent[b] = a
comps = defaultdict(list)
for i in white:
    comps[find(i)].append(i)
sized = sorted(comps.values(), key=len, reverse=True)
CODE = [(1, 0, 0, 1), (1, 0.5, 0, 1), (0, 1, 0, 1), (0, 1, 0, 1),
        (0, 0.4, 1, 1), (0, 0.4, 1, 1), (1, 0, 1, 1), (1, 1, 0, 1),
        (1, 1, 0, 1)]
for idx, cfs in enumerate(sized):
    col = CODE[idx] if idx < len(CODE) else (1, 1, 0, 1)
    for i in cfs:
        p = me.polygons[i]
        for lo_i in range(p.loop_start, p.loop_start + p.loop_total):
            ca.data[lo_i].color = col
mat = bpy.data.materials.new("VCol")
mat.use_nodes = True
nt = mat.node_tree
attr = nt.nodes.new("ShaderNodeVertexColor")
attr.layer_name = "Color"
nt.links.new(attr.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
obj.data.materials.clear()
obj.data.materials.append(mat)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 4.0
sun.rotation_euler = (math.radians(55), 0, math.radians(35))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 2.4
fill.rotation_euler = (math.radians(-60), 0, math.radians(-130))
bpy.context.collection.objects.link(fill)
world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.04, 0.04, 0.05, 1)
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
scene.camera = cam
cs = [obj.matrix_world @ v.co for v in me.vertices]
lo2 = mathutils.Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
hi2 = mathutils.Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
ctr = (lo2 + hi2) / 2
size = max(hi2 - lo2)
for label, off in (("a", (0.9, 0.85, 0.55)), ("b", (-0.9, -0.9, -0.45))):
    cam.location = (ctr.x + size * off[0], ctr.y + size * off[1], ctr.z + size * off[2])
    d = ctr - mathutils.Vector(cam.location)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(ROOT, "assets", "blender", "preview",
                                         "earth_v2", "white_comps_%s.png" % label)
    bpy.ops.render.render(write_still=True)
print("COMP_RENDER_DONE")
