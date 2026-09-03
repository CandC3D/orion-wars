"""Coincident-shell cleanup: where two faces of different colour lie on the
same surface (ray test), delete the face that belongs to the SMALLER
same-colour connected region (the larger region is the host part).
  blender --background --python coincident_cleanup.py -- "<in.glb>" "<out.glb>" [eps]
"""
import bpy, os, sys, bmesh
from collections import defaultdict
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
args = sys.argv[sys.argv.index("--")+1:]
src, dst = args[0], args[1]
EPS = float(args[2]) if len(args) > 2 else 0.03
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src if os.path.isabs(src) else os.path.join(ROOT, "assets", "models", "v2", src))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data
def key(c): return tuple(round(x, 2) for x in c[:3])
fcol = [key(col[p.loop_indices[0]].color) for p in me.polygons]
# same-colour connected regions via welded positions
vkey = [(round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)) for v in me.vertices]
pos_faces = defaultdict(list)
for p in me.polygons:
    for v in p.vertices: pos_faces[vkey[v]].append(p.index)
parent = list(range(len(me.polygons)))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for p in me.polygons:
    for v in p.vertices:
        for f in pos_faces[vkey[v]]:
            if fcol[f] == fcol[p.index]:
                a, b = find(f), find(p.index)
                if a != b: parent[a] = b
area = defaultdict(float)
for p in me.polygons: area[find(p.index)] += p.area
# coincident test both directions
kill = set(); pairs = 0
for p in me.polygons:
    i = p.index
    for sign in (1.0, -1.0):
        origin = p.center + p.normal * (EPS * sign)
        hit, loc, nrm, fidx = obj.ray_cast(origin, -p.normal * sign, distance=EPS * 2)
        if hit and fidx != i and fcol[fidx] != fcol[i] and (loc - p.center).length < EPS:
            pairs += 1
            if area[find(i)] < area[find(fidx)]:
                kill.add(i)
            break
print("faces %d coincident-diffcolour faces %d -> deleting %d (smaller-region side)" % (len(me.polygons), pairs, len(kill)))
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in kill], context="FACES")
bm.to_mesh(me); bm.free()
print("CLEANUP faces now", len(me.polygons))
for o in bpy.data.objects: o.select_set(o is obj)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True)
print("CLEANUP_DONE")
