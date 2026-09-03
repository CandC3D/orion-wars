"""Render the corrected Frigate v2 FINAL with vertex colours + emissive
interpretation (red engine/port, green starboard, white windows)."""
import bpy, math, os, mathutils
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "blender", "preview", "truecolor", "dd_cleaned.glb"))
obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
mat = bpy.data.materials.new("VCol")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeVertexColor")
attr.layer_name = "Color"
nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.6
bsdf.inputs["Specular IOR Level"].default_value = 0.2
# emissive interpretation: white + green + red glow candidates via colour match
sep = nt.nodes.new("ShaderNodeSeparateColor")
nt.links.new(attr.outputs["Color"], sep.inputs["Color"])
# white: all channels high
mn = nt.nodes.new("ShaderNodeMath"); mn.operation = "MINIMUM"
nt.links.new(sep.outputs["Red"], mn.inputs[0])
nt.links.new(sep.outputs["Blue"], mn.inputs[1])
mn2 = nt.nodes.new("ShaderNodeMath"); mn2.operation = "MINIMUM"
nt.links.new(mn.outputs[0], mn2.inputs[0])
nt.links.new(sep.outputs["Green"], mn2.inputs[1])
is_white = nt.nodes.new("ShaderNodeMath"); is_white.operation = "GREATER_THAN"
is_white.inputs[1].default_value = 0.9
nt.links.new(mn2.outputs[0], is_white.inputs[0])
# green: G high, R low
gg = nt.nodes.new("ShaderNodeMath"); gg.operation = "GREATER_THAN"; gg.inputs[1].default_value = 0.55
nt.links.new(sep.outputs["Green"], gg.inputs[0])
rl = nt.nodes.new("ShaderNodeMath"); rl.operation = "LESS_THAN"; rl.inputs[1].default_value = 0.45
nt.links.new(sep.outputs["Red"], rl.inputs[0])
is_green = nt.nodes.new("ShaderNodeMath"); is_green.operation = "MULTIPLY"
nt.links.new(gg.outputs[0], is_green.inputs[0])
nt.links.new(rl.outputs[0], is_green.inputs[1])
# red: R high, G low
rh = nt.nodes.new("ShaderNodeMath"); rh.operation = "GREATER_THAN"; rh.inputs[1].default_value = 0.75
nt.links.new(sep.outputs["Red"], rh.inputs[0])
gl2 = nt.nodes.new("ShaderNodeMath"); gl2.operation = "LESS_THAN"; gl2.inputs[1].default_value = 0.3
nt.links.new(sep.outputs["Green"], gl2.inputs[0])
is_red = nt.nodes.new("ShaderNodeMath"); is_red.operation = "MULTIPLY"
nt.links.new(rh.outputs[0], is_red.inputs[0])
nt.links.new(gl2.outputs[0], is_red.inputs[1])
esum = nt.nodes.new("ShaderNodeMath"); esum.operation = "ADD"
nt.links.new(is_white.outputs[0], esum.inputs[0])
nt.links.new(is_green.outputs[0], esum.inputs[1])
esum2 = nt.nodes.new("ShaderNodeMath"); esum2.operation = "ADD"
nt.links.new(esum.outputs[0], esum2.inputs[0])
nt.links.new(is_red.outputs[0], esum2.inputs[1])
estr = nt.nodes.new("ShaderNodeMath"); estr.operation = "MULTIPLY"; estr.inputs[1].default_value = 0.0  # true-colour intake: no emission
nt.links.new(esum2.outputs[0], estr.inputs[0])
nt.links.new(attr.outputs["Color"], bsdf.inputs["Emission Color"])
nt.links.new(estr.outputs[0], bsdf.inputs["Emission Strength"])
obj.data.materials.clear()
obj.data.materials.append(mat)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
sun.data.energy = 2.2
sun.rotation_euler = (math.radians(55), 0, math.radians(35))
bpy.context.collection.objects.link(sun)
fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
fill.data.energy = 0.9
fill.rotation_euler = (math.radians(-60), 0, math.radians(-130))
bpy.context.collection.objects.link(fill)
world = bpy.data.worlds.new("W"); world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.022, 0.032, 1)
scene.world = world
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
bpy.context.collection.objects.link(cam)
scene.camera = cam
cs = [obj.matrix_world @ v.co for v in obj.data.vertices]
lo = mathutils.Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
hi = mathutils.Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
ctr = (lo + hi) / 2
size = max(hi - lo)
for label, off in (("persp", (1.0, 0.9, 0.5)), ("rear", (0.9, -1.15, 0.3))):
    cam.location = (ctr.x + size * off[0], ctr.y + size * off[1], ctr.z + size * off[2])
    d = ctr - mathutils.Vector(cam.location)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(ROOT, "assets", "blender", "preview",
                                         "truecolor", "dd_cleaned_%s.png" % label)
    bpy.ops.render.render(write_still=True)
print("RENDER_DONE")
