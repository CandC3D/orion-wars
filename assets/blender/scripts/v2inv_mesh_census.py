"""Quantify coincident triangles, disconnected shells, and topology in Earth v2 GLBs.

Run with Blender 5.2 in background mode. This script is read-only with respect to
the source GLBs and writes JSON/CSV evidence under the Earth v2 preview folder.
"""
import bpy
import csv
import json
import math
import os
import time
from collections import Counter, defaultdict

from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2")
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
os.makedirs(OUTDIR, exist_ok=True)

SHIPS = [
    "Earth Destroyer v2",
    "Earth Light Cruiser v2",
    "Earth Heavy Cruiser v2",
    "Earth Battleship v2",
    "Earth Command Ship v2",
]
CENTROID_TOL = 1.0e-4
PLANE_TOL = 1.0e-4
PARALLEL_DOT = 1.0 - 1.0e-6
AREA_EPS = 1.0e-12
INSIDE_SAMPLE_MAX = 12000
TOPOLOGY_WELD_TOL = 1.0e-5


def qkey(v, tol):
    return tuple(int(math.floor(float(x) / tol)) for x in v)


def color_byte(c):
    return tuple(max(0, min(255, int(round(float(c[i]) * 255.0)))) for i in range(4))


def face_color(mesh, poly, color_attr):
    if color_attr is None:
        return (255, 255, 255, 255)
    values = []
    if color_attr.domain == "CORNER":
        for li in poly.loop_indices:
            values.append(color_byte(color_attr.data[li].color))
    elif color_attr.domain == "POINT":
        for vi in poly.vertices:
            values.append(color_byte(color_attr.data[vi].color))
    else:
        return (255, 255, 255, 255)
    return Counter(values).most_common(1)[0][0]


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


def signed_shell_count(bvh, point, direction, step_eps, max_hits=512):
    """Return oriented shell count from point to infinity, or None on ambiguity."""
    origin = point.copy()
    signed = 0
    hits = 0
    while hits < max_hits:
        loc, normal, _index, _distance = bvh.ray_cast(origin, direction)
        if loc is None:
            return signed
        nd = normal.dot(direction)
        if abs(nd) < 1.0e-7:
            return None
        signed += 1 if nd > 0.0 else -1
        origin = loc + direction * step_eps
        hits += 1
    return None


def inside_shell_count(bvh, point, scale):
    # Three non-axis-aligned rays reduce vertex/edge degeneracy. Median is robust
    # to a single ambiguous or inconsistent result.
    directions = [
        Vector((0.431, 0.713, 0.552)).normalized(),
        Vector((-0.619, 0.337, 0.709)).normalized(),
        Vector((0.217, -0.829, 0.515)).normalized(),
    ]
    vals = []
    for d in directions:
        val = signed_shell_count(bvh, point, d, max(scale * 1.0e-7, 2.0e-6))
        if val is not None:
            vals.append(abs(val))
    if not vals:
        return None
    vals.sort()
    return vals[len(vals) // 2]


def analyze_ship(ship):
    started = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(SRC, ship + ".glb")
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o.type == "MESH"]
    if len(objs) != 1:
        raise RuntimeError("Expected one merged mesh in %s; found %d" % (ship, len(objs)))
    obj = objs[0]
    mesh = obj.data
    if any(len(p.vertices) != 3 for p in mesh.polygons):
        raise RuntimeError("Expected raw triangles in %s" % ship)
    mw = obj.matrix_world
    verts = [mw @ v.co for v in mesh.vertices]
    faces = [tuple(p.vertices) for p in mesh.polygons]
    normals = []
    centroids = []
    areas = []
    for face in faces:
        a, b, c = (verts[i] for i in face)
        cross = (b - a).cross(c - a)
        twice_area = cross.length
        areas.append(twice_area * 0.5)
        normals.append(cross.normalized() if twice_area > AREA_EPS else Vector((0, 0, 0)))
        centroids.append((a + b + c) / 3.0)

    color_attr = mesh.color_attributes.get("Color")
    if color_attr is None and mesh.color_attributes:
        color_attr = mesh.color_attributes[0]
    colors = [face_color(mesh, p, color_attr) for p in mesh.polygons]
    color_hist = Counter(colors)

    # The GLBs are deliberately non-indexed (three distinct vertex records per
    # triangle, needed for corner colours). Virtually weld equal positions before
    # topology tests; this changes no source or Blender mesh data.
    welded_index = {}
    welded_coords = []
    raw_to_welded = []
    for v in verts:
        key = qkey(v, TOPOLOGY_WELD_TOL)
        wi = welded_index.get(key)
        if wi is None:
            wi = len(welded_coords)
            welded_index[key] = wi
            welded_coords.append(v)
        raw_to_welded.append(wi)
    welded_faces = [tuple(raw_to_welded[v] for v in face) for face in faces]
    dsu = DSU(len(welded_coords))
    edge_counts = Counter()
    face_edges = []
    for face in welded_faces:
        a, b, c = face
        dsu.union(a, b)
        dsu.union(b, c)
        dsu.union(c, a)
        edges = ((min(a, b), max(a, b)), (min(b, c), max(b, c)), (min(c, a), max(c, a)))
        face_edges.append(edges)
        edge_counts.update(edges)
    component_faces = defaultdict(list)
    for fi, face in enumerate(welded_faces):
        component_faces[dsu.find(face[0])].append(fi)

    boundary_edges = sum(1 for n in edge_counts.values() if n == 1)
    nonmanifold_edges = sum(1 for n in edge_counts.values() if n > 2)
    faces_touching_bad_edge = sum(
        1 for edges in face_edges if any(edge_counts[e] != 2 for e in edges)
    )
    degenerate_faces = sum(1 for a in areas if a <= AREA_EPS)

    component_rows = []
    negative_component_faces = 0
    open_component_faces = 0
    for root, fis in component_faces.items():
        vol6 = 0.0
        comp_edges = set()
        for fi in fis:
            a, b, c = (welded_coords[i] for i in welded_faces[fi])
            vol6 += a.dot(b.cross(c))
            comp_edges.update(face_edges[fi])
        open_edges = sum(1 for e in comp_edges if edge_counts[e] != 2)
        signed_volume = vol6 / 6.0
        if signed_volume < -1.0e-8:
            negative_component_faces += len(fis)
        if open_edges:
            open_component_faces += len(fis)
        component_rows.append({
            "triangles": len(fis),
            "signed_volume": signed_volume,
            "open_or_nonmanifold_edges": open_edges,
        })

    # Centroid/plane coincidence census. Search adjacent quantization buckets so
    # the stated Euclidean tolerance is honored across bucket boundaries.
    buckets = defaultdict(list)
    coincident_pairs = 0
    coincident_different_color_pairs = 0
    coincident_same_color_pairs = 0
    exact_vertex_set_pairs = 0
    exact_vertex_set_different_color_pairs = 0
    coincident_face_ids = set()
    diff_coincident_face_ids = set()
    diff_rows = []
    for i, ctr in enumerate(centroids):
        key = qkey(ctr, CENTROID_TOL)
        candidates = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    candidates.extend(buckets.get((key[0] + dx, key[1] + dy, key[2] + dz), ()))
        for j in candidates:
            if (ctr - centroids[j]).length > CENTROID_TOL:
                continue
            if abs(normals[i].dot(normals[j])) < PARALLEL_DOT:
                continue
            if abs((ctr - verts[faces[j][0]]).dot(normals[j])) > PLANE_TOL:
                continue
            coincident_pairs += 1
            coincident_face_ids.update((i, j))
            different = colors[i] != colors[j]
            if different:
                coincident_different_color_pairs += 1
                diff_coincident_face_ids.update((i, j))
            else:
                coincident_same_color_pairs += 1
            sig_i = sorted(qkey(verts[v], CENTROID_TOL) for v in faces[i])
            sig_j = sorted(qkey(verts[v], CENTROID_TOL) for v in faces[j])
            exact = sig_i == sig_j
            if exact:
                exact_vertex_set_pairs += 1
                if different:
                    exact_vertex_set_different_color_pairs += 1
            if different and len(diff_rows) < 20000:
                diff_rows.append({
                    "face_a": j,
                    "face_b": i,
                    "color_a": colors[j],
                    "color_b": colors[i],
                    "centroid": [float(x) for x in (ctr + centroids[j]) * 0.5],
                    "normal_dot": float(normals[i].dot(normals[j])),
                    "exact_vertex_set": exact,
                })
        buckets[key].append(i)

    # A same-centroid census misses congruent shells with different tessellation.
    # For each face, ask whether its centroid lies (within tolerance) on a
    # parallel triangle carrying another dominant colour.
    faces_by_color = defaultdict(list)
    for fi, col in enumerate(colors):
        faces_by_color[col].append(fi)
    color_bvhs = {}
    for col, fis in faces_by_color.items():
        color_bvhs[col] = (
            BVHTree.FromPolygons(verts, [faces[fi] for fi in fis], all_triangles=True, epsilon=0.0),
            fis,
        )
    cross_color_pairs = set()
    cross_color_faces = set()
    cross_color_rows = []
    cross_color_directional_hits = 0
    for fi, ctr in enumerate(centroids):
        for other_col, (other_bvh, other_fis) in color_bvhs.items():
            if other_col == colors[fi]:
                continue
            nearest = other_bvh.find_nearest(ctr, CENTROID_TOL)
            if nearest[0] is None:
                continue
            _loc, other_normal, other_local_index, distance = nearest
            if abs(normals[fi].dot(other_normal)) < PARALLEL_DOT:
                continue
            other_fi = other_fis[other_local_index]
            pair = (min(fi, other_fi), max(fi, other_fi))
            cross_color_directional_hits += 1
            cross_color_pairs.add(pair)
            cross_color_faces.update(pair)
            if len(cross_color_rows) < 20000:
                cross_color_rows.append({
                    "face": fi,
                    "other_face": other_fi,
                    "color": colors[fi],
                    "other_color": other_col,
                    "centroid": [float(x) for x in ctr],
                    "distance": float(distance),
                    "normal_dot": float(normals[fi].dot(other_normal)),
                })

    # Rough hidden-surface estimate: for each sampled face, offset to both sides.
    # A face is internal to another oriented closed shell when both sides have a
    # nonzero shell count after excluding the face's own boundary crossing.
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    scale = (hi - lo).length
    bvh = BVHTree.FromPolygons(verts, faces, all_triangles=True, epsilon=0.0)
    sample_step = max(1, len(faces) // INSIDE_SAMPLE_MAX)
    sample_ids = list(range(0, len(faces), sample_step))[:INSIDE_SAMPLE_MAX]
    offset = max(scale * 2.0e-6, 5.0e-5)
    hidden = 0
    external = 0
    ambiguous = 0
    hidden_area = 0.0
    classified_area = 0.0
    for fi in sample_ids:
        if areas[fi] <= AREA_EPS:
            ambiguous += 1
            continue
        p = centroids[fi]
        n = normals[fi]
        ca = inside_shell_count(bvh, p + n * offset, scale)
        cb = inside_shell_count(bvh, p - n * offset, scale)
        if ca is None or cb is None:
            ambiguous += 1
            continue
        classified_area += areas[fi]
        if ca > 0 and cb > 0:
            hidden += 1
            hidden_area += areas[fi]
        else:
            external += 1

    result = {
        "ship": ship,
        "source": os.path.relpath(path, ROOT).replace("\\", "/"),
        "vertices": len(verts),
        "virtually_welded_vertices": len(welded_coords),
        "topology_weld_tolerance": TOPOLOGY_WELD_TOL,
        "triangles": len(faces),
        "color_attribute": None if color_attr is None else {
            "name": color_attr.name,
            "domain": color_attr.domain,
            "data_type": color_attr.data_type,
            "unique_dominant_face_colors": len(color_hist),
            "top_face_colors": [
                {"rgba_byte_in_blender": list(k), "triangles": v}
                for k, v in color_hist.most_common(12)
            ],
        },
        "connected_components": len(component_faces),
        "closed_components": sum(1 for r in component_rows if r["open_or_nonmanifold_edges"] == 0),
        "negative_volume_components": sum(1 for r in component_rows if r["signed_volume"] < -1.0e-8),
        "negative_volume_component_faces": negative_component_faces,
        "open_component_faces": open_component_faces,
        "largest_components_by_triangles": sorted(component_rows, key=lambda r: -r["triangles"])[:20],
        "boundary_edges": boundary_edges,
        "nonmanifold_edges_gt2": nonmanifold_edges,
        "faces_touching_non2_edge": faces_touching_bad_edge,
        "degenerate_faces": degenerate_faces,
        "coincident_test": {
            "centroid_distance_tolerance": CENTROID_TOL,
            "plane_distance_tolerance": PLANE_TOL,
            "parallel_abs_dot_min": PARALLEL_DOT,
            "pairs": coincident_pairs,
            "pairs_different_dominant_corner_color": coincident_different_color_pairs,
            "pairs_same_dominant_corner_color": coincident_same_color_pairs,
            "unique_faces_in_pairs": len(coincident_face_ids),
            "unique_faces_in_different_color_pairs": len(diff_coincident_face_ids),
            "exact_quantized_vertex_set_pairs": exact_vertex_set_pairs,
            "exact_quantized_vertex_set_pairs_different_color": exact_vertex_set_different_color_pairs,
        },
        "cross_color_coplanar_surface_test": {
            "probe": "face centroid nearest point on each other-color BVH",
            "distance_tolerance": CENTROID_TOL,
            "parallel_abs_dot_min": PARALLEL_DOT,
            "unique_nearest_pairs": len(cross_color_pairs),
            "unique_faces": len(cross_color_faces),
            "fraction_of_all_faces": len(cross_color_faces) / max(1, len(faces)),
            "directional_hits": cross_color_directional_hits,
            "saved_directional_rows": len(cross_color_rows),
        },
        "interior_shell_sample": {
            "method": "oriented BVH ray shell-count on both normal offsets",
            "sampled_faces": len(sample_ids),
            "classified_faces": hidden + external,
            "ambiguous_faces": ambiguous,
            "hidden_faces": hidden,
            "external_faces": external,
            "hidden_fraction_by_face": hidden / max(1, hidden + external),
            "hidden_fraction_by_area": hidden_area / max(1.0e-30, classified_area),
        },
        "analysis_seconds": time.time() - started,
    }
    return result, diff_rows, cross_color_rows


all_results = {}
all_diff_rows = []
for ship_name in SHIPS:
    print("V2INV_START", ship_name, flush=True)
    result, diff_rows, cross_color_rows = analyze_ship(ship_name)
    all_results[ship_name] = result
    for row in diff_rows:
        row["ship"] = ship_name
        all_diff_rows.append(row)
    cross_path = os.path.join(OUTDIR, "v2inv_%s_cross_color_coplanar.json" % ship_name.lower().replace(" ", "_"))
    with open(cross_path, "w", encoding="utf-8") as f:
        json.dump(cross_color_rows, f)
    print("V2INV_RESULT", json.dumps(result, sort_keys=True), flush=True)

json_path = os.path.join(OUTDIR, "v2inv_mesh_census.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(all_results, f, indent=2)

csv_path = os.path.join(OUTDIR, "v2inv_different_color_coincident_faces.csv")
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    fields = ["ship", "face_a", "face_b", "color_a", "color_b", "centroid", "normal_dot", "exact_vertex_set"]
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(all_diff_rows)

print("V2INV_CENSUS_DONE", json_path, csv_path, flush=True)
