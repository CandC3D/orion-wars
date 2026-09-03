import bpy, os, sys
from collections import defaultdict, Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
name = sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", name))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data
# 1) coincident faces: same rounded centroid (1e-3)
buckets = defaultdict(list)
for p in me.polygons:
    c = p.center
    buckets[(round(c.x,3), round(c.y,3), round(c.z,3))].append(p.index)
dup_groups = [v for v in buckets.values() if len(v) > 1]
print("faces", len(me.polygons), "coincident-centroid groups", len(dup_groups),
      "faces involved", sum(len(v) for v in dup_groups))
# how many of those groups mix colours?
mixed = 0
for g in dup_groups:
    cols = set(tuple(round(x,2) for x in col[me.polygons[i].loop_indices[0]].color[:3]) for i in g)
    if len(cols) > 1: mixed += 1
print("coincident groups with DIFFERENT colours:", mixed)
# 2) per-triangle colour noise: fraction of faces whose edge-neighbours (shared verts) have a different colour
vert_faces = defaultdict(list)
for p in me.polygons:
    for v in p.vertices: vert_faces[v].append(p.index)
def fc(i): return tuple(round(x,2) for x in col[me.polygons[i].loop_indices[0]].color[:3])
noisy = 0; checked = 0
for p in me.polygons:
    mine = fc(p.index); nb = set()
    for v in p.vertices:
        for f in vert_faces[v]:
            if f != p.index: nb.add(fc(f))
    if nb:
        checked += 1
        if mine not in nb and len(nb) >= 2: noisy += 1
print("faces whose every neighbour differs in colour (noise-like): %d of %d (%.1f%%)" % (noisy, checked, 100.0*noisy/max(checked,1)))
# 3) corner-colour disagreement within single faces
disagree = sum(1 for p in me.polygons if len(set(tuple(round(x,2) for x in col[li].color[:3]) for li in p.loop_indices)) > 1)
print("faces with mixed corner colours:", disagree)
print("OVERLAP_DONE")
