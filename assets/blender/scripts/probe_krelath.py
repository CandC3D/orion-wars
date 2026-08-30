"""Probe the six Krelath hulls + the two turret models: stats, stern caps,
dorsal peaks, cross-sections, clay renders."""
import bpy, bmesh, json, math, os, mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "krelath")
os.makedirs(OUTDIR, exist_ok=True)
MODELS = ["Krelath Frigate", "Krelath Destroyer", "Krelath Light Cruiser",
          "Krelath Heavy Cruiser", "Krelath Battleship", "Krelath Strike Cruiser",
          "Krelath Missile Turret", "Krelath Beam Turret"]

report = {}
for name in MODELS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", name + ".stl"))
    obj = bpy.context.selected_objects[0]
    me = obj.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    ctr = mathutils.Vector(((max(xs)+min(xs))/2, (max(ys)+min(ys))/2, (max(zs)+min(zs))/2))
    me.transform(mathutils.Matrix.Translation(-ctr))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()

    V = np.array([list(v.co) for v in me.vertices])
    dims = (V.max(axis=0) - V.min(axis=0)).round(2).tolist()
    info = {"dims": dims, "tris": len(me.polygons),
            "ymin": round(float(V[:, 1].min()), 2), "ymax": round(float(V[:, 1].max()), 2)}

    if "Turret" not in name:
        L = dims[1]
        ymin = float(V[:, 1].min())
        fc = np.array([[p.center.x, p.center.y, p.center.z] for p in me.polygons])
        fn = np.array([[p.normal.x, p.normal.y, p.normal.z] for p in me.polygons])
        # stern caps
        cand = np.where((fn[:, 1] < -0.7) & (fc[:, 1] < ymin + 0.12 * L))[0]
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        cset = set(int(i) for i in cand)
        parent = {i: i for i in cset}
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for i in cset:
            for e in bm.faces[i].edges:
                for g in e.link_faces:
                    if g.index in cset and g.index != i:
                        a, b = find(i), find(g.index)
                        if a != b: parent[b] = a
        clusters = {}
        for i in cset:
            clusters.setdefault(find(i), []).append(i)
        caps = []
        for root, idxs in clusters.items():
            pts = fc[idxs]
            cx, cy, cz = pts[:, 0].mean(), pts[:, 1].mean(), pts[:, 2].mean()
            rmax = float(np.sqrt((pts[:, 0]-cx)**2 + (pts[:, 2]-cz)**2).max())
            area = sum(me.polygons[i].area for i in idxs)
            caps.append({"area": round(float(area), 2), "n": len(idxs),
                         "c": [round(float(cx), 2), round(float(cz), 2)],
                         "y": round(float(cy), 2), "rmax": round(rmax, 2)})
        caps.sort(key=lambda c: -c["area"])
        info["stern_caps"] = caps[:8]
        bm.free()
        # dorsal peak + widest section
        mwin = (fc[:, 1] > ymin + 0.15 * L) & (fc[:, 1] < ymin + 0.85 * L)
        if mwin.sum():
            zi = fc[mwin][:, 2].argmax()
            info["dorsal_peak"] = [round(float(v), 2) for v in fc[mwin][zi]]

    report[name] = info

    # clay renders
    mat = bpy.data.materials.new("Clay"); mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    me.materials.clear(); me.materials.append(mat)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 1.2
    fill.rotation_euler = (math.radians(-55), 0, math.radians(-140))
    bpy.context.collection.objects.link(fill)
    world = bpy.data.worlds.new("W"); world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.02, 0.03, 1)
    bpy.context.scene.world = world
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 800
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    size = max(dims)
    slug = name.lower().replace(" ", "_")
    for label, loc in (("persp", (size*1.0, size*0.9, size*0.6)),
                      ("top", (0.01, 0.01, size*1.6))):
        cam.location = loc
        d = mathutils.Vector((0, 0, 0)) - mathutils.Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s.png" % (slug, label))
        bpy.ops.render.render(write_still=True)

with open(os.path.join(OUTDIR, "krelath_probe.json"), "w") as f:
    json.dump(report, f, indent=2)
print("KRELATH_PROBE_DONE")
