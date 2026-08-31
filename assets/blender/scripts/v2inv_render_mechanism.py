"""Render Light Cruiser overlap regions before/after in-memory face cleanup.

No source GLB is written. The cleanup keeps the more prevalent colour wherever a
less prevalent face centroid lies on a nearly parallel differently coloured face.
"""
import bpy
import json
import math
import os
from collections import Counter, defaultdict

from mathutils import Vector
from mathutils.bvhtree import BVHTree


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2", "Earth Light Cruiser v2.glb")
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
os.makedirs(OUTDIR, exist_ok=True)
DIST_TOL = 0.05
DOT_MIN = 0.9999
SURFACE_COLORS = {
    (0, 159, 216, 255),
    (190, 200, 204, 255),
    (97, 103, 107, 255),
}
EXACT_TOL = 1e-4
TARGETS = {
    "starboard_mid": Vector((215.1, -207.0, 128.6)),
    "starboard_tube": Vector((215.1, -242.0, 128.6)),
}


def byte_color(c):
    return tuple(int(round(max(0.0, min(1.0, float(c[i]))) * 255.0)) for i in range(4))


def poly_color(mesh, poly, attr):
    return Counter(byte_color(attr.data[li].color) for li in poly.loop_indices).most_common(1)[0][0]


def build_clean_mesh(source_mesh, keep_faces):
    attr = source_mesh.color_attributes.get("Color") or source_mesh.color_attributes[0]
    new_verts = []
    new_faces = []
    corner_colors = []
    for fi in keep_faces:
        poly = source_mesh.polygons[fi]
        base = len(new_verts)
        for li in poly.loop_indices:
            vi = source_mesh.loops[li].vertex_index
            new_verts.append(tuple(source_mesh.vertices[vi].co))
            corner_colors.append(tuple(attr.data[li].color))
        new_faces.append((base, base + 1, base + 2))
    cleaned = bpy.data.meshes.new(source_mesh.name + "_in_memory_cleanup")
    cleaned.from_pydata(new_verts, [], new_faces)
    cleaned.update()
    out_attr = cleaned.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    for i, color in enumerate(corner_colors):
        out_attr.data[i].color = color
    for mat in source_mesh.materials:
        cleaned.materials.append(mat)
    return cleaned


def setup_render(obj):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("V2 investigation world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.025, 0.03, 0.045, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
    scene.world = world

    key_data = bpy.data.lights.new("Key", "SUN")
    key_data.energy = 4.0
    key = bpy.data.objects.new("Key", key_data)
    key.rotation_euler = (math.radians(55), 0, math.radians(35))
    bpy.context.collection.objects.link(key)

    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 2.0
    fill = bpy.data.objects.new("Fill", fill_data)
    fill.rotation_euler = (math.radians(-60), 0, math.radians(-130))
    bpy.context.collection.objects.link(fill)

    cam_data = bpy.data.cameras.new("MechanismCam")
    cam_data.lens = 72
    cam_data.clip_start = 0.02
    cam_data.clip_end = 1000
    cam = bpy.data.objects.new("MechanismCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    return scene, cam


def render_targets(scene, cam, suffix):
    for label, target in TARGETS.items():
        # Similar view direction to the whole-ship probe, with a tight crop.
        cam.location = target + Vector((40.0, 38.0, 22.0))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUTDIR, "v2inv_light_cruiser_%s_%s.png" % (label, suffix))
        bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
obj = next(o for o in bpy.data.objects if o.type == "MESH")
mesh = obj.data
mw = obj.matrix_world
verts = [mw @ v.co for v in mesh.vertices]
faces = [tuple(p.vertices) for p in mesh.polygons]
ctrs = []
normals = []
for face in faces:
    a, b, c = (verts[i] for i in face)
    ctrs.append((a + b + c) / 3.0)
    normals.append((b - a).cross(c - a).normalized())
attr = mesh.color_attributes.get("Color") or mesh.color_attributes[0]
colors = [poly_color(mesh, p, attr) for p in mesh.polygons]
freq = Counter(colors)
by_color = defaultdict(list)
for fi, col in enumerate(colors):
    by_color[col].append(fi)
color_bvhs = {
    col: (BVHTree.FromPolygons(verts, [faces[i] for i in ids], all_triangles=True), ids)
    for col, ids in by_color.items()
}

delete_faces = set()
cleanup_pairs = set()
for fi, ctr in enumerate(ctrs):
    col = colors[fi]
    if col not in SURFACE_COLORS:
        continue
    best = None
    for other_col, (bvh, ids) in color_bvhs.items():
        if other_col == col or other_col not in SURFACE_COLORS:
            continue
        near = bvh.find_nearest(ctr, DIST_TOL)
        if near[0] is None:
            continue
        _loc, other_normal, local_i, distance = near
        dot = abs(normals[fi].dot(other_normal))
        if dot < DOT_MIN:
            continue
        other_fi = ids[local_i]
        if best is None or distance < best[0]:
            best = (float(distance), other_fi, other_col)
    if best is None:
        continue
    _distance, other_fi, other_col = best
    pair = (min(fi, other_fi), max(fi, other_fi))
    cleanup_pairs.add(pair)
    # Deterministic demonstration policy: retain the globally more prevalent
    # surface colour; face index breaks equal-frequency ties.
    if freq[col] < freq[other_col] or (freq[col] == freq[other_col] and fi > other_fi):
        delete_faces.add(fi)

# Literal test requested in the investigation: same centroid within 1e-4,
# coplanar/parallel, then delete the later face from each pair.
exact_delete_faces = set()
exact_pairs = set()
centroid_buckets = defaultdict(list)
for fi, ctr in enumerate(ctrs):
    key = tuple(int(math.floor(float(x) / EXACT_TOL)) for x in ctr)
    candidates = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                candidates.extend(centroid_buckets.get((key[0] + dx, key[1] + dy, key[2] + dz), ()))
    for other_fi in candidates:
        if (ctr - ctrs[other_fi]).length > EXACT_TOL:
            continue
        if abs(normals[fi].dot(normals[other_fi])) < 0.999999:
            continue
        if abs((ctr - verts[faces[other_fi][0]]).dot(normals[other_fi])) > EXACT_TOL:
            continue
        exact_pairs.add((other_fi, fi))
        exact_delete_faces.add(fi)
    centroid_buckets[key].append(fi)

scene, cam = setup_render(obj)
render_targets(scene, cam, "before")

exact_keep = [fi for fi in range(len(faces)) if fi not in exact_delete_faces]
exact_mesh = build_clean_mesh(mesh, exact_keep)
obj.data = exact_mesh
render_targets(scene, cam, "after_exact_pair_cleanup")

keep = [fi for fi in range(len(faces)) if fi not in delete_faces]
cleaned_mesh = build_clean_mesh(mesh, keep)
obj.data = cleaned_mesh
render_targets(scene, cam, "after_in_memory_cleanup")

report = {
    "source": os.path.relpath(SRC, ROOT).replace("\\", "/"),
    "source_triangles": len(faces),
    "distance_tolerance": DIST_TOL,
    "parallel_abs_dot_min": DOT_MIN,
    "surface_colors_considered": [list(c) for c in sorted(SURFACE_COLORS)],
    "candidate_pairs": len(cleanup_pairs),
    "deleted_faces": len(delete_faces),
    "remaining_faces": len(keep),
    "policy": "keep globally more prevalent color for a near-coplanar cross-color face",
    "exact_centroid_plane_pairs": len(exact_pairs),
    "exact_pair_deleted_faces": len(exact_delete_faces),
    "exact_pair_remaining_faces": len(exact_keep),
    "targets": {k: list(v) for k, v in TARGETS.items()},
}
with open(os.path.join(OUTDIR, "v2inv_light_cruiser_render_cleanup.json"), "w") as f:
    json.dump(report, f, indent=2)
print("V2INV_RENDER_DONE", json.dumps(report, sort_keys=True), flush=True)
