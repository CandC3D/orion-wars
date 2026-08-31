"""Inventory virtually welded connected shells and likely duplicate component pairs."""
import bpy
import json
import math
import os
from collections import Counter, defaultdict

from mathutils import Vector


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
WELD_TOL = 1e-5


class DSU:
    def __init__(self, n):
        self.p = list(range(n))
        self.sz = [1] * n

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a == b:
            return
        if self.sz[a] < self.sz[b]:
            a, b = b, a
        self.p[b] = a
        self.sz[a] += self.sz[b]


def q(v):
    return tuple(int(round(float(x) / WELD_TOL)) for x in v)


def byte_color(c):
    return tuple(int(round(max(0.0, min(1.0, float(c[i]))) * 255.0)) for i in range(4))


def overlap_fraction(a, b):
    lengths = [max(0.0, min(a[1][i], b[1][i]) - max(a[0][i], b[0][i])) for i in range(3)]
    inter = lengths[0] * lengths[1] * lengths[2]
    va = math.prod(max(1e-12, a[1][i] - a[0][i]) for i in range(3))
    vb = math.prod(max(1e-12, b[1][i] - b[0][i]) for i in range(3))
    return inter / min(va, vb)


all_results = {}
for ship in SHIPS:
    print("V2INV_COMPONENT_START", ship, flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, ship + ".glb"))
    obj = next(o for o in bpy.data.objects if o.type == "MESH")
    me = obj.data
    mw = obj.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    pos_to_weld = {}
    welded = []
    raw_to_weld = []
    for v in verts:
        key = q(v)
        if key not in pos_to_weld:
            pos_to_weld[key] = len(welded)
            welded.append(v)
        raw_to_weld.append(pos_to_weld[key])
    wf = [tuple(raw_to_weld[i] for i in p.vertices) for p in me.polygons]
    dsu = DSU(len(welded))
    for a, b, c in wf:
        dsu.union(a, b)
        dsu.union(b, c)
        dsu.union(c, a)
    groups = defaultdict(list)
    for fi, f in enumerate(wf):
        groups[dsu.find(f[0])].append(fi)
    attr = me.color_attributes.get("Color") or me.color_attributes[0]
    face_colors = []
    for p in me.polygons:
        face_colors.append(Counter(byte_color(attr.data[li].color) for li in p.loop_indices).most_common(1)[0][0])
    components = []
    face_to_component = {}
    for ci, fis in enumerate(sorted(groups.values(), key=lambda x: (-len(x), min(x)))):
        used = set(v for fi in fis for v in wf[fi])
        pts = [welded[v] for v in used]
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        hist = Counter(face_colors[fi] for fi in fis)
        area = 0.0
        vol6 = 0.0
        for fi in fis:
            a, b, c = (welded[i] for i in wf[fi])
            area += (b - a).cross(c - a).length * 0.5
            vol6 += a.dot(b.cross(c))
            face_to_component[fi] = ci
        components.append({
            "component": ci,
            "triangles": len(fis),
            "first_face": min(fis),
            "last_face": max(fis),
            "bbox_min": lo,
            "bbox_max": hi,
            "bbox_dims": [hi[i] - lo[i] for i in range(3)],
            "surface_area": area,
            "signed_volume": vol6 / 6.0,
            "dominant_color": list(hist.most_common(1)[0][0]),
            "color_histogram": [{"color": list(k), "triangles": v} for k, v in hist.most_common()],
        })
    pairs = []
    for i in range(len(components)):
        a = components[i]
        for j in range(i + 1, len(components)):
            b = components[j]
            if a["dominant_color"] == b["dominant_color"]:
                continue
            af = (a["bbox_min"], a["bbox_max"])
            bf = (b["bbox_min"], b["bbox_max"])
            overlap = overlap_fraction(af, bf)
            bbox_delta = max(
                abs(a["bbox_min"][k] - b["bbox_min"][k]) for k in range(3)
            )
            bbox_delta = max(bbox_delta, max(
                abs(a["bbox_max"][k] - b["bbox_max"][k]) for k in range(3)
            ))
            tri_ratio = min(a["triangles"], b["triangles"]) / max(a["triangles"], b["triangles"])
            if overlap >= 0.5 or bbox_delta <= 0.25:
                pairs.append({
                    "component_a": i,
                    "component_b": j,
                    "colors": [a["dominant_color"], b["dominant_color"]],
                    "triangles": [a["triangles"], b["triangles"]],
                    "bbox_overlap_fraction_of_smaller": overlap,
                    "max_bbox_endpoint_delta": bbox_delta,
                    "triangle_count_ratio": tri_ratio,
                })
    pairs.sort(key=lambda r: (r["max_bbox_endpoint_delta"], -r["bbox_overlap_fraction_of_smaller"]))
    result = {"ship": ship, "weld_tolerance": WELD_TOL, "components": components, "different_color_high_bbox_overlap_pairs": pairs}
    all_results[ship] = result
    print("V2INV_COMPONENT_RESULT", ship, "components", len(components), "pairs", len(pairs), flush=True)

with open(os.path.join(OUTDIR, "v2inv_component_inventory.json"), "w") as f:
    json.dump(all_results, f, indent=2)
print("V2INV_COMPONENT_DONE", flush=True)
