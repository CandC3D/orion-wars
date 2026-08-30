"""Measure all six Earth hulls: adaptive sphere fit, patch stats, stern caps,
dorsal pod, mid-hull cylinder. Dumps JSON + two clay renders per hull so the
fleet build can be parameterized from real numbers in one pass."""
import bpy
import bmesh
import json
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "fleet")
os.makedirs(OUTDIR, exist_ok=True)
HULLS = ["Earth Frigate", "Earth Destroyer", "Earth Light Cruiser",
         "Earth Heavy Cruiser", "Earth Battleship", "Earth Command Ship"]

report = {}
for hull in HULLS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", hull + ".stl"))
    obj = bpy.context.selected_objects[0]
    me = obj.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    ctr = mathutils.Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2,
                            (max(zs) + min(zs)) / 2))
    me.transform(mathutils.Matrix.Translation(-ctr))

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()

    V = np.array([list(v.co) for v in me.vertices])
    dims = (V.max(axis=0) - V.min(axis=0)).round(2).tolist()
    L = dims[1]
    ymin, ymax = float(V[:, 1].min()), float(V[:, 1].max())
    info = {"dims": dims, "ymin": round(ymin, 2), "ymax": round(ymax, 2),
            "tris": len(me.polygons)}

    # adaptive bow sphere fit: forward verts away from the ring plane
    zgate = dims[2] * 0.30
    pts = V[(V[:, 1] > ymax - dims[2] * 1.1) & (np.abs(V[:, 2]) > zgate)]
    if len(pts) > 50:
        A = np.c_[pts * 2, np.ones(len(pts))]
        sol, *_ = np.linalg.lstsq(A, (pts ** 2).sum(axis=1), rcond=None)
        scx, scy, scz = sol[:3]
        sr2 = sol[3] + scx ** 2 + scy ** 2 + scz ** 2
        if sr2 > 0:
            srad = math.sqrt(sr2)
            resid = np.abs(np.sqrt(((pts - [scx, scy, scz]) ** 2).sum(axis=1)) - srad)
            info["sphere"] = {"c": [round(float(scx), 2), round(float(scy), 2),
                                    round(float(scz), 2)],
                              "r": round(float(srad), 2),
                              "resid90": round(float(np.percentile(resid, 90)), 3),
                              "n": len(pts)}

    # face centres/normals
    fc = np.array([[p.center.x, p.center.y, p.center.z] for p in me.polygons])
    fn = np.array([[p.normal.x, p.normal.y, p.normal.z] for p in me.polygons])

    # stern caps: connectivity clusters of rear-facing faces near the stern
    stern_y = ymin + L * 0.10
    cand_idx = [p.index for p in me.polygons
                if p.normal.y < -0.7 and p.center.y < stern_y]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    cset = set(cand_idx)
    parent = {i: i for i in cand_idx}

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in cand_idx:
        for e in bm.faces[i].edges:
            for g in e.link_faces:
                if g.index in cset and g.index != i:
                    a, b = find(i), find(g.index)
                    if a != b:
                        parent[b] = a
    clusters = {}
    for i in cand_idx:
        clusters.setdefault(find(i), []).append(i)
    caps = []
    for root, idxs in clusters.items():
        cs = fc[idxs]
        area = sum(me.polygons[i].area for i in idxs)
        cx, cz, cy = cs[:, 0].mean(), cs[:, 2].mean(), cs[:, 1].mean()
        rmax = float(np.sqrt((cs[:, 0] - cx) ** 2 + (cs[:, 2] - cz) ** 2).max())
        caps.append({"area": round(float(area), 2), "n": len(idxs),
                     "c": [round(float(cx), 2), round(float(cz), 2)],
                     "y": round(float(cy), 2), "rmax": round(rmax, 2)})
    caps.sort(key=lambda c: -c["area"])
    info["stern_caps"] = caps[:10]
    bm.free()

    # dorsal pod candidate: highest face in the mid/aft window
    mwin = (fc[:, 1] > ymin + 0.15 * L) & (fc[:, 1] < ymax - 0.35 * L)
    if mwin.sum():
        zi = fc[mwin][:, 2].argmax()
        info["dorsal_peak"] = [round(float(v), 2) for v in fc[mwin][zi]]

    # mid-hull cylinder fit (radial faces around amidships-forward)
    mm = ((fc[:, 1] > ymax - 0.55 * L) & (fc[:, 1] < ymax - 0.40 * L)
          & (np.abs(fn[:, 1]) < 0.25))
    if mm.sum() > 30:
        P = fc[mm][:, [0, 2]]
        for _ in range(4):
            A2 = np.c_[P[:, 0] * 2, P[:, 1] * 2, np.ones(len(P))]
            s2, *_ = np.linalg.lstsq(A2, P[:, 0] ** 2 + P[:, 1] ** 2, rcond=None)
            mx, mz = s2[0], s2[1]
            mr2 = s2[2] + mx ** 2 + mz ** 2
            if mr2 <= 0:
                break
            mr = math.sqrt(mr2)
            res = np.abs(np.sqrt((P[:, 0] - mx) ** 2 + (P[:, 1] - mz) ** 2) - mr)
            keep = res < 0.3
            if keep.all():
                break
            P = P[keep]
        else:
            keep = None
        if mr2 > 0:
            info["midcyl"] = {"c": [round(float(mx), 2), round(float(mz), 2)],
                              "r": round(float(mr), 2), "n": int(len(P))}

    report[hull] = info

    # clay renders: persp + side
    mat = bpy.data.materials.new("Clay")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    me.materials.clear()
    me.materials.append(mat)
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o is not obj:
            bpy.data.objects.remove(o)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 1.2
    fill.rotation_euler = (math.radians(-55), 0, math.radians(-140))
    bpy.context.collection.objects.link(fill)
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
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
    slug = hull.lower().replace(" ", "_")
    for label, loc in (("persp", (size * 1.0, size * 0.9, size * 0.6)),
                       ("side", (size * 1.5, 0, size * 0.15))):
        cam.location = loc
        d = mathutils.Vector((0, 0, 0)) - mathutils.Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s.png" % (slug, label))
        bpy.ops.render.render(write_still=True)

with open(os.path.join(OUTDIR, "fleet_probe.json"), "w") as f:
    json.dump(report, f, indent=2)
print("FLEET_PROBE_DONE")
