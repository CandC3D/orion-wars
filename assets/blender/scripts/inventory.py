"""Inventory pass: import each STL, report geometry stats + issues.

Run:  blender --background --python inventory.py
Writes assets/blender/inventory.json. Read-only w.r.t. the STL sources.
"""
import bpy
import bmesh
import json
import os
import sys

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
MODELS = os.path.join(ROOT, "assets", "models")
OUT = os.path.join(ROOT, "assets", "blender", "inventory.json")

report = []

for name in sorted(os.listdir(MODELS)):
    if not name.lower().endswith(".stl"):
        continue
    # fresh empty scene each iteration
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = os.path.join(MODELS, name)
    try:
        bpy.ops.wm.stl_import(filepath=path)
    except AttributeError:
        bpy.ops.import_mesh.stl(filepath=path)

    obj = bpy.context.selected_objects[0] if bpy.context.selected_objects else None
    if obj is None:
        objs = [o for o in bpy.data.objects if o.type == "MESH"]
        obj = objs[0] if objs else None
    if obj is None:
        report.append({"file": name, "error": "no mesh imported"})
        continue

    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()

    non_manifold_edges = sum(1 for e in bm.edges if not e.is_manifold)
    loose_verts = sum(1 for v in bm.verts if not v.link_edges)
    tris = sum(len(f.verts) - 2 for f in bm.faces)

    # dimensions from bounding box (object space == world space for STL import)
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    dims = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)] if xs else [0, 0, 0]

    bm.free()

    report.append({
        "file": name,
        "verts": len(me.vertices),
        "faces": len(me.polygons),
        "tris": tris,
        "non_manifold_edges": non_manifold_edges,
        "loose_verts": loose_verts,
        "dimensions": [round(d, 3) for d in dims],
    })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(report, f, indent=2)
print("INVENTORY_DONE", len(report))
