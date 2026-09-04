import bpy, os
from collections import Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v3", "Earth Missile Destroyer v3 Series [NEW].glb"))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data; M = obj.matrix_world
far = [p for p in me.polygons if (M @ p.center).x > 200 or (M @ p.center).y > 200]
print("stray faces:", len(far), "of", len(me.polygons))
if far:
    cs = [M @ p.center for p in far]
    print("stray bbox x %.1f..%.1f y %.1f..%.1f z %.1f..%.1f" % (min(c.x for c in cs), max(c.x for c in cs), min(c.y for c in cs), max(c.y for c in cs), min(c.z for c in cs), max(c.z for c in cs)))
    print("stray colours:", Counter(tuple(round(v,2) for v in col[p.loop_indices[0]].color[:3]) for p in far).most_common(4))
main = [M @ p.center for p in me.polygons if not ((M @ p.center).x > 200 or (M @ p.center).y > 200)]
print("main bbox x %.1f..%.1f y %.1f..%.1f z %.1f..%.1f" % (min(c.x for c in main), max(c.x for c in main), min(c.y for c in main), max(c.y for c in main), min(c.z for c in main), max(c.z for c in main)))
print("STRAY_DONE")
