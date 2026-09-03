import bpy, os, sys, random
from collections import defaultdict, Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
name = sys.argv[sys.argv.index("--")+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", name))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data
def fc(i): return tuple(round(x,2) for x in col[me.polygons[i].loop_indices[0]].color[:3])
EPS = 0.02
random.seed(1)
sample = random.sample(range(len(me.polygons)), min(20000, len(me.polygons)))
coincident = 0; coincident_diffcol = 0; pair_cols = Counter()
for i in sample:
    p = me.polygons[i]
    origin = p.center + p.normal * EPS
    hit, loc, nrm, fidx = obj.ray_cast(origin, -p.normal, distance=EPS * 2)
    if hit and fidx != i and (loc - p.center).length < EPS * 0.5:
        coincident += 1
        if fc(fidx) != fc(i):
            coincident_diffcol += 1
            pair_cols[(fc(i), fc(fidx))] += 1
print("sampled %d faces: coincident-with-other-face %d (%.1f%%), of which DIFFERENT colour %d (%.1f%%)" %
      (len(sample), coincident, 100.0*coincident/len(sample), coincident_diffcol, 100.0*coincident_diffcol/len(sample)))
for k, v in pair_cols.most_common(6):
    print("  pair top=%s hidden=%s : %d" % (k[0], k[1], v))
# welded-position neighbour colour noise
vkey = {}
for v in me.vertices:
    vkey[v.index] = (round(v.co.x,3), round(v.co.y,3), round(v.co.z,3))
pos_faces = defaultdict(set)
for p in me.polygons:
    for v in p.vertices: pos_faces[vkey[v]].add(p.index)
noisy = 0
for i in sample:
    p = me.polygons[i]; mine = fc(i); nb = Counter()
    for v in p.vertices:
        for f in pos_faces[vkey[v]]:
            if f != i: nb[fc(f)] += 1
    if nb and mine not in nb: noisy += 1
print("sampled faces whose NO position-neighbour shares its colour (per-triangle noise): %d (%.1f%%)" % (noisy, 100.0*noisy/len(sample)))
print("OVERLAP2_DONE")
