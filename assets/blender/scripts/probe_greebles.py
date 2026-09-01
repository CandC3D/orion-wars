import bpy, os, glob
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2", "greebles")
for path in sorted(glob.glob(os.path.join(SRC, "*.stl"))):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=path)
    obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    me = obj.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    name = os.path.basename(path).replace(" - Earth Fixtures and Greebles.stl", "")
    print("%-24s tris=%6d verts=%6d dims=(%.1f, %.1f, %.1f)" % (
        name, len(me.polygons), len(me.vertices),
        max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)))
print("GREEBLES_DONE")
