import bpy, os
from collections import Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Frigate v2.glb"))
me = [o for o in bpy.data.objects if o.type == "MESH"][0].data
print("color_attributes:", [(a.name, a.domain, a.data_type) for a in me.color_attributes])
print("uv_layers:", [l.name for l in me.uv_layers])
if me.color_attributes:
    ca = me.color_attributes[0]
    cnt = Counter()
    for d in ca.data:
        c = d.color
        cnt[(round(c[0], 2), round(c[1], 2), round(c[2], 2))] += 1
    for col, n in cnt.most_common(12):
        print("  colour", col, "x", n)
print("VC_DONE")
