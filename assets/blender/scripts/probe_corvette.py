import bpy, os, mathutils
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", "Zandrax Corvette.stl"))
me = bpy.context.selected_objects[0].data
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
ctr = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-ctr))
rows = sorted(((round(p.normal.y, 2), round(p.center.y, 1), round(p.center.z, 1),
                round(p.area, 2)) for p in me.polygons), key=lambda t: t[0])
for r in rows[:12]:
    print("  ny=%5.2f y=%6.1f z=%5.1f area=%5.2f" % r)
print("ymin=%.1f ymax=%.1f" % (min(ys)-ctr.y, max(ys)-ctr.y))
print("DONE")
