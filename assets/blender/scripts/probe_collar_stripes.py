import bpy, os, math
from collections import Counter
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", "Earth Destroyer v2.1 Union Group.glb"))
obj = max([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: len(o.data.polygons))
me = obj.data; col = me.color_attributes[0].data
def key(c): return tuple(round(x, 2) for x in c[:3])
# find striped region: faces whose normal is radial to the X axis (cylinder sides) in the mid-hull
cands = []
for p in me.polygons:
    n = p.normal
    if abs(n.x) < 0.15 and p.area < 0.5:
        cands.append(p)
# bin by X station (1-unit slices) and count colour mix per slice
slices = {}
for p in cands:
    s = int(round(p.center.x))
    slices.setdefault(s, Counter())[key(col[p.loop_indices[0]].color)] += 1
mixed = [(s, c) for s, c in sorted(slices.items()) if len(c) >= 3 and sum(c.values()) > 200]
print("X-slices with >=3 colours on cylinder-side faces:", len(mixed))
for s, c in mixed[:6]:
    print("  x=%d faces=%d colours=%s" % (s, sum(c.values()), dict(c.most_common(4))))
# angular colour sequence around one striped slice
if mixed:
    s0 = mixed[0][0]
    ring = [p for p in cands if int(round(p.center.x)) == s0]
    cy = sum(p.center.y for p in ring)/len(ring); cz = sum(p.center.z for p in ring)/len(ring)
    ring.sort(key=lambda p: math.atan2(p.center.z - cz, p.center.y - cy))
    seq = [key(col[p.loop_indices[0]].color) for p in ring]
    names = {(0.0,0.62,0.85):"B",(0.75,0.78,0.8):"G",(0.91,0.11,0.18):"R",(0.98,0.98,0.98):"W",(0.38,0.4,0.42):"D",(0.96,0.51,0.12):"O",(0.88,0.68,0.21):"Y"}
    print("colour sequence around x=%d ring (first 120 faces by angle): %s" % (s0, "".join(names.get(c,"?") for c in seq[:120])))
    # radius spread: same surface or stacked shells?
    rs = [math.hypot(p.center.y-cy, p.center.z-cz) for p in ring]
    print("ring radius min %.3f max %.3f (spread %.3f)" % (min(rs), max(rs), max(rs)-min(rs)))
print("STRIPES_DONE")
