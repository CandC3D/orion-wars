import bpy, os, time
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Destroyer v2.1 Union Group.glb"))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
bpy.context.view_layer.objects.active = obj
for o in bpy.data.objects: o.select_set(o is obj)
t = time.time()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.intersect_boolean(operation="UNION", use_self=True, solver="EXACT")
bpy.ops.object.mode_set(mode="OBJECT")
print("SELFUNION tris", len(obj.data.polygons), "time %.0fs" % (time.time() - t))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, "assets", "blender", "preview", "truecolor", "dd_selfunion.glb"), export_format="GLB", use_selection=True)
print("SELFUNION_DONE")
