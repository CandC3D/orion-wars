import bpy, os, sys
from collections import defaultdict
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
name = sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", name))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data
M = obj.matrix_world
allx = [(M @ v.co).x for v in me.vertices]
print("ship X extent %.1f .. %.1f (bow = ?)" % (min(allx), max(allx)))
acc = defaultdict(lambda: [0, 1e9, -1e9, 1e9, -1e9, 1e9, -1e9])
for p in me.polygons:
    c = col[p.loop_indices[0]].color
    key = tuple(round(v, 2) for v in c[:3])
    a = acc[key]; a[0] += 1
    for vi in p.vertices:
        w = M @ me.vertices[vi].co
        a[1] = min(a[1], w.x); a[2] = max(a[2], w.x)
        a[3] = min(a[3], w.y); a[4] = max(a[4], w.y)
        a[5] = min(a[5], w.z); a[6] = max(a[6], w.z)
for key, a in sorted(acc.items(), key=lambda kv: -kv[1][0]):
    print("colour %-18s faces %6d  x %.0f..%.0f  y %.0f..%.0f  z %.0f..%.0f" % (key, a[0], a[1], a[2], a[3], a[4], a[5], a[6]))
print("REGIONS_DONE")
