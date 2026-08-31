"""Camera-ray census of differently coloured near-depth layers."""
import bpy
import json
import math
import os
from collections import Counter

from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2")
OUT = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2", "v2inv_depth_layers.json")
CASES = {
    "Earth Destroyer v2": {"target": (119.0, -212.0, 132.0)},
    "Earth Light Cruiser v2": {"target": (215.1, -207.0, 128.6)},
    "Earth Heavy Cruiser v2": {"target": (329.0, -207.0, 112.5)},
    "Earth Battleship v2": {"target": (435.0, -207.0, 144.0)},
    "Earth Command Ship v2": {"target": (536.0, -212.0, 128.6)},
}
GRID_X = 260
GRID_Y = 180
ASPECT = 1400 / 1000
LENS_MM = 72.0
SENSOR_MM = 36.0
GAPS = [1e-4, 5e-4, 1e-3, 5e-3, 1e-2, 5e-2, 1e-1, 5e-1]


def byte_color(c):
    return tuple(int(round(max(0.0, min(1.0, float(c[i]))) * 255.0)) for i in range(4))


results = {}
for ship, cfg in CASES.items():
    print("V2INV_DEPTH_START", ship, flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, ship + ".glb"))
    obj = next(o for o in bpy.data.objects if o.type == "MESH")
    me = obj.data
    mw = obj.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    attr = me.color_attributes.get("Color") or me.color_attributes[0]
    colors = []
    for p in me.polygons:
        colors.append(Counter(byte_color(attr.data[li].color) for li in p.loop_indices).most_common(1)[0][0])
    bvh = BVHTree.FromPolygons(verts, faces, all_triangles=True)
    target = Vector(cfg["target"])
    camera = target + Vector((40.0, 38.0, 22.0))
    forward = (target - camera).normalized()
    right = forward.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(forward).normalized()
    half_w = math.tan(2.0 * math.atan(SENSOR_MM / (2.0 * LENS_MM)) / 2.0)
    half_h = half_w / ASPECT
    all_two_layer = 0
    diff_two_layer = 0
    same_two_layer = 0
    diff_cumulative = {str(g): 0 for g in GAPS}
    same_cumulative = {str(g): 0 for g in GAPS}
    diff_pairs = Counter()
    samples = []
    first_hits = 0
    for py in range(GRID_Y):
        v = (1.0 - 2.0 * (py + 0.5) / GRID_Y) * half_h
        for px in range(GRID_X):
            u = (2.0 * (px + 0.5) / GRID_X - 1.0) * half_w
            direction = (forward + right * u + up * v).normalized()
            hit1 = bvh.ray_cast(camera, direction)
            if hit1[0] is None:
                continue
            first_hits += 1
            loc1, _n1, fi1, _d1 = hit1
            # Advance only 1e-5 units: enough to avoid self-rehit while retaining
            # the depth separations implicated by the rendered artifact.
            hit2 = bvh.ray_cast(loc1 + direction * 1e-5, direction)
            if hit2[0] is None:
                continue
            loc2, _n2, fi2, _d2 = hit2
            gap = (loc2 - loc1).length
            all_two_layer += 1
            different = colors[fi1] != colors[fi2]
            cumulative = diff_cumulative if different else same_cumulative
            for g in GAPS:
                if gap <= g:
                    cumulative[str(g)] += 1
            if different:
                diff_two_layer += 1
                diff_pairs[(colors[fi1], colors[fi2])] += 1
                if gap <= 0.1 and len(samples) < 5000:
                    samples.append({
                        "pixel": [px, py], "gap": gap,
                        "front_face": fi1, "back_face": fi2,
                        "front_color": colors[fi1], "back_color": colors[fi2],
                        "front_location": list(loc1),
                    })
            else:
                same_two_layer += 1
    result = {
        "ship": ship,
        "grid": [GRID_X, GRID_Y],
        "target": list(target),
        "camera": list(camera),
        "first_hit_rays": first_hits,
        "rays_with_second_layer": all_two_layer,
        "different_color_second_layer_rays": diff_two_layer,
        "same_color_second_layer_rays": same_two_layer,
        "different_color_gap_cumulative": diff_cumulative,
        "same_color_gap_cumulative": same_cumulative,
        "top_front_back_color_pairs": [
            {"front": list(k[0]), "back": list(k[1]), "rays": v}
            for k, v in diff_pairs.most_common(20)
        ],
        "near_different_color_samples": samples,
    }
    results[ship] = result
    print("V2INV_DEPTH_RESULT", ship, json.dumps({k: v for k, v in result.items() if k != "near_different_color_samples"}), flush=True)

with open(OUT, "w") as f:
    json.dump(results, f, indent=2)
print("V2INV_DEPTH_DONE", OUT, flush=True)
