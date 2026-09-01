"""Compare the four Frigate v2 FINAL export variants: what does each format
preserve (objects, names, materials, vertex colours)?"""
import bpy, os
from collections import Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2")
FILES = ["Earth Destroyer v2.1 Union Group.glb", "Earth Destroyer v2.1 Bundle Group.glb"]
for fn in FILES:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    p = os.path.join(SRC, fn)
    if fn.endswith(".stl"):
        bpy.ops.wm.stl_import(filepath=p)
    else:
        bpy.ops.import_scene.gltf(filepath=p)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print("=== %s: %d mesh objects, %d materials" % (fn, len(meshes), len(bpy.data.materials)))
    for o in sorted(meshes, key=lambda o: -len(o.data.polygons))[:25]:
        ca = o.data.color_attributes[0] if o.data.color_attributes else None
        ccount = 0
        top = ""
        if ca:
            cnt = Counter()
            for d in ca.data:
                c = d.color
                cnt[(round(c[0], 2), round(c[1], 2), round(c[2], 2))] += 1
            ccount = len(cnt)
            top = str(cnt.most_common(8))
        print("  obj '%s' tris=%d mats=%s vcols=%d %s"
              % (o.name, len(o.data.polygons),
                 [ms.material.name if ms.material else "-" for ms in o.material_slots],
                 ccount, top[:400]))
    if len(meshes) > 25:
        print("  ... and %d more objects" % (len(meshes) - 25))
print("VARIANTS_DONE")
