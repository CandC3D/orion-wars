"""Measure near-coplanar differently coloured surfaces over several tolerances."""
import bpy
import json
import os
from collections import Counter, defaultdict

from mathutils.bvhtree import BVHTree


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2")
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
SHIPS = [
    "Earth Destroyer v2",
    "Earth Light Cruiser v2",
    "Earth Heavy Cruiser v2",
    "Earth Battleship v2",
    "Earth Command Ship v2",
]
DISTANCES = [1e-4, 5e-4, 1e-3, 5e-3, 1e-2, 5e-2, 1e-1]
DOTS = [0.999999, 0.9999, 0.999, 0.99]


def byte_color(c):
    return tuple(int(round(max(0.0, min(1.0, float(c[i]))) * 255.0)) for i in range(4))


def dominant_color(mesh, poly, attr):
    return Counter(byte_color(attr.data[li].color) for li in poly.loop_indices).most_common(1)[0][0]


results = {}
for ship in SHIPS:
    print("V2INV_NEAR_START", ship, flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, ship + ".glb"))
    obj = next(o for o in bpy.data.objects if o.type == "MESH")
    me = obj.data
    mw = obj.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    ctrs = []
    normals = []
    for f in faces:
        a, b, c = (verts[i] for i in f)
        ctrs.append((a + b + c) / 3.0)
        normals.append((b - a).cross(c - a).normalized())
    attr = me.color_attributes.get("Color") or me.color_attributes[0]
    colors = [dominant_color(me, p, attr) for p in me.polygons]
    mixed_faces = 0
    corner_patterns = Counter()
    for p in me.polygons:
        cs = tuple(byte_color(attr.data[li].color) for li in p.loop_indices)
        corner_patterns[tuple(sorted(cs))] += 1
        if len(set(cs)) > 1:
            mixed_faces += 1
    by_color = defaultdict(list)
    for fi, col in enumerate(colors):
        by_color[col].append(fi)
    bvhs = {
        col: (BVHTree.FromPolygons(verts, [faces[i] for i in ids], all_triangles=True), ids)
        for col, ids in by_color.items()
    }
    grid = {str(dot): {str(d): set() for d in DISTANCES} for dot in DOTS}
    distance_hist = Counter()
    pair_color_hist = Counter()
    samples = []
    for fi, ctr in enumerate(ctrs):
        best = None
        for col, (bvh, ids) in bvhs.items():
            if col == colors[fi]:
                continue
            near = bvh.find_nearest(ctr, DISTANCES[-1])
            if near[0] is None:
                continue
            loc, other_normal, local_i, dist = near
            dot = abs(normals[fi].dot(other_normal))
            if best is None or dist < best[0]:
                best = (float(dist), float(dot), ids[local_i], col)
        if best is None:
            continue
        dist, dot, other_fi, other_col = best
        for dot_min in DOTS:
            if dot >= dot_min:
                for dmax in DISTANCES:
                    if dist <= dmax:
                        grid[str(dot_min)][str(dmax)].add(fi)
        if dot >= 0.99:
            for upper in DISTANCES:
                if dist <= upper:
                    distance_hist[str(upper)] += 1
                    break
            pair_color_hist[(colors[fi], other_col)] += 1
            if len(samples) < 5000:
                samples.append({
                    "face": fi,
                    "other_face": other_fi,
                    "color": colors[fi],
                    "other_color": other_col,
                    "centroid": [float(x) for x in ctr],
                    "distance": dist,
                    "abs_normal_dot": dot,
                })
    result = {
        "ship": ship,
        "triangles": len(faces),
        "mixed_corner_color_faces": mixed_faces,
        "near_other_color_face_counts": {
            dot: {dist: len(ids) for dist, ids in row.items()} for dot, row in grid.items()
        },
        "nearest_distance_exclusive_bins_at_abs_dot_0.99": dict(distance_hist),
        "top_directional_color_pairs_within_0.1_at_abs_dot_0.99": [
            {"color": list(k[0]), "other_color": list(k[1]), "faces": v}
            for k, v in pair_color_hist.most_common(20)
        ],
    }
    results[ship] = result
    with open(os.path.join(OUTDIR, "v2inv_%s_near_samples.json" % ship.lower().replace(" ", "_")), "w") as f:
        json.dump(samples, f)
    print("V2INV_NEAR_RESULT", json.dumps(result, sort_keys=True), flush=True)

with open(os.path.join(OUTDIR, "v2inv_near_surface.json"), "w") as f:
    json.dump(results, f, indent=2)
print("V2INV_NEAR_DONE", flush=True)
