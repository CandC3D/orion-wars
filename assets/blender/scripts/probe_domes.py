import bpy, os, mathutils
import numpy as np
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=os.path.join(
    ROOT, "assets", "models", "Krelath - suggested weapons placements.stl"))
me = bpy.context.selected_objects[0].data
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
ctr = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-ctr))
V = np.array([list(v.co) for v in me.vertices])
# boom region between pods and head: |x|<4, y in [-2, 16]; find raised bumps
sel = V[(np.abs(V[:, 0]) < 5) & (V[:, 1] > -12) & (V[:, 1] < 10)]
zt = 1.5
high = sel[sel[:, 2] > zt]
print("boom z60=%.2f high verts=%d" % (zt, len(high)))
if len(high):
    # cluster by x sign
    for lbl, m in (("port", high[:, 0] < 0), ("stbd", high[:, 0] >= 0)):
        if m.sum():
            h = high[m]
            print(" %s: n=%d centre=(%.2f, %.2f, %.2f) zmax=%.2f xr=[%.1f,%.1f] yr=[%.1f,%.1f]"
                  % (lbl, m.sum(), h[:, 0].mean(), h[:, 1].mean(), h[:, 2].mean(),
                     h[:, 2].max(), h[:, 0].min(), h[:, 0].max(), h[:, 1].min(), h[:, 1].max()))
print("DONE")
