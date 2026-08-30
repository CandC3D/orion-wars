"""Geometry probe for Earth Battleship revision pass: pod axes/radii/collars,
nozzle taper, dorsal lozenge bbox, central stern cylinder, ring z extent."""
import bpy
import bmesh
import json
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models", "Earth Battleship.stl")
OUT = os.path.join(ROOT, "assets", "blender", "preview", "earth_bb_probe.json")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]
me = obj.data
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
center = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-center))

V = np.array([list(v.co) for v in me.vertices])
report = {}

# --- pod clustering: slab in the engine section, cluster on (x, z) by grid flood fill
def cluster_slab(y_lo, y_hi, grid=0.8):
    pts = V[(V[:, 1] > y_lo) & (V[:, 1] < y_hi)]
    cells = {}
    for p in pts:
        cells.setdefault((round(p[0] / grid), round(p[2] / grid)), []).append(p)
    seen = set(); clusters = []
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
                    stack.append((k[0] + dx, k[1] + dz))
        m = np.array(members)
        cx, cz = m[:, 0].mean(), m[:, 2].mean()
        r = np.sqrt((m[:, 0] - cx) ** 2 + (m[:, 2] - cz) ** 2).max()
        clusters.append({"cx": round(float(cx), 2), "cz": round(float(cz), 2),
                         "rmax": round(float(r), 2), "n": len(members)})
    return sorted(clusters, key=lambda c: -c["n"])

report["slab_mid_engine"] = cluster_slab(-16, -14)
report["slab_fore_engine"] = cluster_slab(-6, -4)
report["slab_rear"] = cluster_slab(V[:, 1].min(), V[:, 1].min() + 1.0)

# --- radius profile vs y for each pod found in mid slab (collar detection)
profiles = {}
for i, cl in enumerate(report["slab_mid_engine"][:8]):
    ax, az = cl["cx"], cl["cz"]
    rows = []
    for yb in np.arange(-24, 0, 0.5):
        sel = V[(V[:, 1] >= yb) & (V[:, 1] < yb + 0.5)]
        if not len(sel):
            continue
        d = np.sqrt((sel[:, 0] - ax) ** 2 + (sel[:, 2] - az) ** 2)
        near = sel[d < 4.5]
        if not len(near):
            continue
        dn = np.sqrt((near[:, 0] - ax) ** 2 + (near[:, 2] - az) ** 2)
        rows.append([round(yb, 1), round(float(dn.max()), 2)])
    profiles[f"pod{i}_at_{ax}_{az}"] = rows
report["pod_profiles"] = profiles

# --- dorsal lozenge (torpedo pod): high-z verts forward of engine section
loz = V[(V[:, 2] > 6.2) & (V[:, 1] < 3) & (V[:, 1] > -14)]
if len(loz):
    report["lozenge_bbox"] = {
        "min": [round(float(loz[:, i].min()), 2) for i in range(3)],
        "max": [round(float(loz[:, i].max()), 2) for i in range(3)],
    }

# --- ring z extent (outside fitted sphere r=8 at center y=11.75)
rxy = np.sqrt(V[:, 0] ** 2 + (V[:, 1] - 11.75) ** 2)
ring = V[(rxy > 8.3) & (V[:, 1] > 4)]
report["ring_z_range"] = [round(float(ring[:, 2].min()), 2), round(float(ring[:, 2].max()), 2)]
report["ring_r_range"] = [round(float(np.sqrt(ring[:, 0]**2 + (ring[:, 1]-11.75)**2).min()), 2),
                          round(float(np.sqrt(ring[:, 0]**2 + (ring[:, 1]-11.75)**2).max()), 2)]

# --- mid cylinder radius (between sphere and engines)
mid = V[(V[:, 1] > -1) & (V[:, 1] < 2)]
report["mid_r_max"] = round(float(np.sqrt(mid[:, 0] ** 2 + mid[:, 2] ** 2).max()), 2)
report["y_min"] = round(float(V[:, 1].min()), 2)

with open(OUT, "w") as f:
    json.dump(report, f, indent=2)
print("PROBE_DONE")
