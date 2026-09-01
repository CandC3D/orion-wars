"""Where is the white on Frigate v2.1 vs Destroyer v2.0? Connected
components of near-white faces: sizes + bounding boxes."""
import bpy, os, mathutils
ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
for fn in ("Earth Frigate v2.1.glb", "Earth Destroyer v2.0.glb"):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets", "models", "v2", fn))
    obj = [o for o in bpy.data.objects if o.type == "MESH"][0]
    me = obj.data
    ca = me.color_attributes[0]
    # face is white when its first corner colour is ~0.98 uniform
    white_faces = []
    for p in me.polygons:
        c = ca.data[p.loop_start].color
        if c[0] > 0.9 and c[1] > 0.9 and c[2] > 0.9:
            white_faces.append(p.index)
    wset = set(white_faces)
    # connectivity via shared vertices (positions are unindexed; weld by rounded pos)
    from collections import defaultdict
    vmap = defaultdict(list)
    for i in white_faces:
        for v in me.polygons[i].vertices:
            co = me.vertices[v].co
            vmap[(round(co.x, 3), round(co.y, 3), round(co.z, 3))].append(i)
    parent = {i: i for i in white_faces}
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for key, faces in vmap.items():
        a = find(faces[0])
        for f in faces[1:]:
            b = find(f)
            if a != b:
                parent[b] = a
    comps = defaultdict(list)
    for i in white_faces:
        comps[find(i)].append(i)
    sized = sorted(comps.values(), key=len, reverse=True)
    print("=== %s: white faces %d in %d components" % (fn, len(white_faces), len(comps)))
    for cfs in sized[:8]:
        pts = [me.vertices[v].co for i in cfs for v in me.polygons[i].vertices]
        lo = [round(min(p[k] for p in pts), 1) for k in range(3)]
        hi = [round(max(p[k] for p in pts), 1) for k in range(3)]
        print("   comp tris=%d bbox %s -> %s" % (len(cfs), lo, hi))
print("WHITE_DONE")
