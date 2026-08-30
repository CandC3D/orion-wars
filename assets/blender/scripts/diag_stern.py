"""Stern diagnostic: isolate every rear-facing cap disc (nozzles + the big
central cylinder) with its own centre, radius and y station."""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models", "Earth Battleship.stl")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]
me = obj.data
xs = [v.co.x for v in me.vertices]
ys = [v.co.y for v in me.vertices]
zs = [v.co.z for v in me.vertices]
c0 = mathutils.Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2,
                       (max(zs) + min(zs)) / 2))
me.transform(mathutils.Matrix.Translation(-c0))

bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()
print("YMIN %.2f" % min(v.co.y for v in me.vertices))

bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()

# rear-facing faces in the stern region, grouped by shared vertices
cand = [f for f in bm.faces
        if f.normal.y < -0.7 and f.calc_center_median().y < -20.5]
print("REARFACING %d" % len(cand))
idx = {f.index: i for i, f in enumerate(cand)}
parent = list(range(len(cand)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for f in cand:
    for e in f.edges:
        for g in e.link_faces:
            if g.index in idx and g.index != f.index:
                a, b = find(idx[f.index]), find(idx[g.index])
                if a != b:
                    parent[b] = a

clusters = {}
for f in cand:
    clusters.setdefault(find(idx[f.index]), []).append(f)

print("\n=== STERN CAPS (rear-facing discs) ===")
rows = []
for root, faces in clusters.items():
    cs = [f.calc_center_median() for f in faces]
    area = sum(f.calc_area() for f in faces)
    cx = sum(c.x for c in cs) / len(cs)
    cz = sum(c.z for c in cs) / len(cs)
    cy = sum(c.y for c in cs) / len(cs)
    rr = [math.sqrt((c.x - cx) ** 2 + (c.z - cz) ** 2) for c in cs]
    rows.append((area, len(faces), cx, cz, cy, max(rr)))
rows.sort(reverse=True)
for area, n, cx, cz, cy, rmax in rows[:12]:
    print("  area=%7.2f n=%5d centre=(%6.2f,%6.2f) y=%7.2f rmax=%5.2f"
          % (area, n, cx, cz, cy, rmax))

# how deep does each cap sit - is there a cone behind it?
print("\n=== Y PROFILE of stern geometry (all faces) ===")
fc = np.array([[f.calc_center_median().x, f.calc_center_median().y,
                f.calc_center_median().z] for f in bm.faces])
for y0 in np.arange(-23.5, -20.0, 0.25):
    m = (fc[:, 1] >= y0) & (fc[:, 1] < y0 + 0.25)
    if m.sum():
        s = fc[m]
        print("  y=[%6.2f,%6.2f) n=%5d x=[%6.2f,%6.2f] z=[%6.2f,%6.2f]"
              % (y0, y0 + 0.25, m.sum(), s[:, 0].min(), s[:, 0].max(),
                 s[:, 2].min(), s[:, 2].max()))
bm.free()
print("DIAG_DONE")
