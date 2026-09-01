import bpy, os
from collections import Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Yamato Class Dreadnought 2.1 Series.glb"))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data
col = me.color_attributes[0].data
TARGET = (0.96, 0.51, 0.12)
def near(c, t):
    return all(abs(round(a, 2) - b) < 0.02 for a, b in zip(c[:3], t))
orange_faces = []
for p in me.polygons:
    cs = [col[li].color for li in p.loop_indices]
    if all(near(c, TARGET) for c in cs):
        orange_faces.append(p.index)
print("orange faces:", len(orange_faces))
# union-find by shared verts
parent = {}
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
vert_owner = {}
for fi in orange_faces:
    parent[fi] = fi
for fi in orange_faces:
    for v in me.polygons[fi].vertices:
        key = tuple(round(c, 3) for c in me.vertices[v].co)
        if key in vert_owner:
            a, b = find(vert_owner[key]), find(fi)
            parent[a] = b
        else:
            vert_owner[key] = fi
comps = Counter(find(f) for f in orange_faces)
for root, n in comps.most_common(30):
    fs = [f for f in orange_faces if find(f) == root]
    xs, ys, zs = [], [], []
    for f in fs:
        for v in me.polygons[f].vertices:
            co = me.vertices[v].co
            xs.append(co.x); ys.append(co.y); zs.append(co.z)
    print("comp %6d faces  bbox (%.1f,%.1f,%.1f)-(%.1f,%.1f,%.1f)" %
          (n, min(xs), min(ys), min(zs), max(xs), max(ys), max(zs)))
print("n_comps:", len(comps))
print("ORANGE_DONE")
