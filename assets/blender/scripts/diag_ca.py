"""Heavy Cruiser diagnostics: dorsal pod ring patches + bay cap centre."""
import bpy, bmesh, math, os, mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", "Earth Heavy Cruiser.stl"))
obj = bpy.context.selected_objects[0]
me = obj.data
xs=[v.co.x for v in me.vertices]; ys=[v.co.y for v in me.vertices]; zs=[v.co.z for v in me.vertices]
c0 = mathutils.Vector(((max(xs)+min(xs))/2,(max(ys)+min(ys))/2,(max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-c0))
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()

bm = bmesh.new(); bm.from_mesh(me)
bm.faces.ensure_lookup_table(); bm.edges.ensure_lookup_table()
parent = list(range(len(bm.faces)))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]; i = parent[i]
    return i
for e in bm.edges:
    lf = e.link_faces
    if len(lf) == 2:
        try: ang = e.calc_face_angle()
        except ValueError: ang = 0.0
        if ang < math.radians(30):
            ra, rb = find(lf[0].index), find(lf[1].index)
            if ra != rb: parent[rb] = ra
groups = {}
for f in bm.faces:
    groups.setdefault(find(f.index), []).append(f)

print("=== PATCHES near dorsal pod (any face with z>3, |x|<4, -18<y<0) ===")
for root, faces in groups.items():
    cs = [f.calc_center_median() for f in faces]
    if not any(c.z > 3 and abs(c.x) < 4 and -18 < c.y < 0 for c in cs):
        continue
    area = sum(f.calc_area() for f in faces)
    if area < 0.5:
        continue
    yex = max(c.y for c in cs) - min(c.y for c in cs)
    mny = sum(abs(f.normal.y) * f.calc_area() for f in faces) / area
    mx = sum(c.x for c in cs) / len(cs)
    mz = sum(c.z for c in cs) / len(cs)
    print("  n=%5d area=%8.2f y=[%6.2f,%6.2f] yex=%5.2f mny=%.2f mean=(%.2f,%.2f) z=[%5.2f,%5.2f]"
          % (len(faces), area, min(c.y for c in cs), max(c.y for c in cs), yex, mny,
             mx, mz, min(c.z for c in cs), max(c.z for c in cs)))

print("\n=== BAY CAP (rear-facing, y<-21.2) centre estimates ===")
cap = [f for f in bm.faces if f.normal.y < -0.7 and f.calc_center_median().y < -21.2]
cs = [f.calc_center_median() for f in cap]
ar = [f.calc_area() for f in cap]
xsc = [c.x for c in cs]; zsc = [c.z for c in cs]
print("  n=%d" % len(cap))
print("  bbox mid      = (%.3f, %.3f)" % ((min(xsc)+max(xsc))/2, (min(zsc)+max(zsc))/2))
print("  mean          = (%.3f, %.3f)" % (sum(xsc)/len(xsc), sum(zsc)/len(zsc)))
aw_x = sum(c.x*a for c, a in zip(cs, ar)) / sum(ar)
aw_z = sum(c.z*a for c, a in zip(cs, ar)) / sum(ar)
print("  area-weighted = (%.3f, %.3f)" % (aw_x, aw_z))
print("  x range [%.2f, %.2f]  z range [%.2f, %.2f]" % (min(xsc), max(xsc), min(zsc), max(zsc)))
# boundary-vertex circle fit: verts used by cap faces that also touch non-cap faces
capset = {f.index for f in cap}
bverts = []
for f in cap:
    for v in f.verts:
        if any(g.index not in capset for g in v.link_faces):
            bverts.append((v.co.x, v.co.z))
if bverts:
    B = np.array(list(set(bverts)))
    A = np.c_[B[:, 0]*2, B[:, 1]*2, np.ones(len(B))]
    s, *_ = np.linalg.lstsq(A, B[:, 0]**2 + B[:, 1]**2, rcond=None)
    fr = math.sqrt(s[2] + s[0]**2 + s[1]**2)
    print("  boundary fit  = (%.3f, %.3f) r=%.3f  nb=%d" % (s[0], s[1], fr, len(B)))
bm.free()
print("DIAG_DONE")
