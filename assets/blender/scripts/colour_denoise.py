"""Neighbour majority-vote filter for per-triangle vertex-colour noise in
Tinkercad GLB exports. A face whose colour is held by none/few of its
position-neighbours, while the neighbours strongly agree on another colour,
adopts that colour. Usage:
  blender --background --python colour_denoise.py -- "<in.glb>" "<out.glb>" [iterations]
"""
import bpy, os, sys
from collections import defaultdict, Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
args = sys.argv[sys.argv.index("--")+1:]
src, dst = args[0], args[1]
iters = int(args[2]) if len(args) > 2 else 3
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src if os.path.isabs(src) else os.path.join(ROOT, "assets", "models", "v2", src))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; ca = me.color_attributes[0]; col = ca.data
def key(c): return tuple(round(x, 3) for x in c[:3])
face_col = [key(col[p.loop_indices[0]].color) for p in me.polygons]
vkey = [(round(v.co.x, 3), round(v.co.y, 3), round(v.co.z, 3)) for v in me.vertices]
pos_faces = defaultdict(list)
for p in me.polygons:
    for v in p.vertices: pos_faces[vkey[v]].append(p.index)
neigh = []
for p in me.polygons:
    s = set()
    for v in p.vertices: s.update(pos_faces[vkey[v]])
    s.discard(p.index); neigh.append(list(s))
total_changed = 0
for it in range(iters):
    changed = 0; new = list(face_col)
    for i, nb in enumerate(neigh):
        if not nb: continue
        cnt = Counter(face_col[j] for j in nb)
        top, topn = cnt.most_common(1)[0]
        mine = cnt.get(face_col[i], 0)
        # adopt if my colour is a small minority and the neighbourhood agrees
        if top != face_col[i] and topn >= 0.6 * len(nb) and mine <= 0.15 * len(nb):
            new[i] = top; changed += 1
    face_col = new; total_changed += changed
    print("iter %d changed %d" % (it, changed))
    if changed == 0: break
for p in me.polygons:
    c = face_col[p.index]
    for li in p.loop_indices:
        col[li].color = (c[0], c[1], c[2], 1.0)
print("DENOISE faces %d changed %d (%.2f%%)" % (len(me.polygons), total_changed, 100.0 * total_changed / len(me.polygons)))
for o in bpy.data.objects: o.select_set(o is obj)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=True)
print("DENOISE_DONE")
