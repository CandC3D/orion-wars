"""What do Vraygon sterns look like? Rear-facing-ish faces, loose gate."""
import bpy, bmesh, math, os, mathutils
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
for hull in ["Vraygon Destroyer", "Vraygon Battleship", "Vraygon Monitor"]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", hull + ".stl"))
    obj = bpy.context.selected_objects[0]
    me = obj.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    ctr = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
    me.transform(mathutils.Matrix.Translation(-ctr))
    ymin = min(v.co.y for v in me.vertices)
    ymax = max(v.co.y for v in me.vertices)
    L = ymax - ymin
    print("== %s L=%.1f ymin=%.1f" % (hull, L, ymin))
    cands = [(p.normal.y, round(p.center.y, 1), round(p.center.x, 1),
              round(p.center.z, 1), round(p.area, 1))
             for p in me.polygons
             if p.normal.y < -0.35 and p.center.y < ymin + 0.45 * L
             and p.area > 0.8]
    cands.sort(key=lambda t: t[1])
    for ny, cy, cx, cz, a in cands[:14]:
        print("   ny=%5.2f y=%6.1f x=%6.1f z=%5.1f area=%6.1f" % (ny, cy, cx, cz, a))
print("DONE")
