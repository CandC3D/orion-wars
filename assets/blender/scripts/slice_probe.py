"""Slice the Earth Battleship at several y stations; cluster section points
to get true axes/radii of every structure crossing each station."""
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
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
center = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-center))

def section(y):
    bm = bmesh.new(); bm.from_mesh(me)
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                                 plane_co=(0, y, 0), plane_no=(0, 1, 0),
                                 clear_inner=True, clear_outer=True)
    pts = np.array([list(v.co) for v in bm.verts])
    bm.free()
    if not len(pts):
        print(f"Y={y}: empty")
        return
    # cluster on (x, z)
    grid = 0.7
    cells = {}
    for p in pts:
        cells.setdefault((round(p[0]/grid), round(p[2]/grid)), []).append(p)
    seen = set(); out = []
    for c in cells:
        if c in seen:
            continue
        stack = [c]; members = []
        while stack:
            k = stack.pop()
            if k in seen or k not in cells:
                continue
            seen.add(k); members.extend(cells[k])
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    stack.append((k[0]+dx, k[1]+dz))
        m = np.array(members)
        cx, cz = m[:, 0].mean(), m[:, 2].mean()
        r = np.sqrt((m[:, 0]-cx)**2 + (m[:, 2]-cz)**2)
        out.append((len(members), round(float(cx), 2), round(float(cz), 2),
                    round(float(r.mean()), 2), round(float(r.max()), 2)))
    out.sort(reverse=True)
    print(f"Y={y}: " + " | ".join(f"n={n} c=({cx},{cz}) rmean={rm} rmax={rx}"
                                  for n, cx, cz, rm, rx in out[:8]))

for y in (-22.8, -21.0, -20.0, -18.0, -13.0, -10.0, -6.0, -3.0, 0.0, 2.0):
    section(y)
print("SLICE_DONE")
