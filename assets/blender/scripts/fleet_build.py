"""Earth Federation fleet build - applies the approved Battleship kit to all
six Earth hulls.

Feature placement is measurement-driven (see probe_fleet.py output): stern
caps are re-detected per hull and classified by radius (small = nozzle glow,
central rearmost large = flight deck, rest = bulkhead machinery); the saucer
brim, collar rings and dorsal weapons pod come from patch analysis; fittings
are raycast onto the hull. Per-hull style stations scale with hull length,
while plate size, window size and fitting proportions stay absolute so the
fleet reads at a common scale.

Run:  blender --background --python fleet_build.py
"""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "renders", "earth")
BLENDDIR = os.path.join(ROOT, "assets", "blender")
os.makedirs(OUTDIR, exist_ok=True)

# ---------------- faction style ----------------
PATTERN = "rect"
RANDOMNESS = {"rect": 0.0, "crystal": 1.0}[PATTERN]
PANEL_SCALE = 0.85
PANEL_ASPECT = (1.0, 0.62, 1.0)
PANEL_BUMP = 0.30
SEAM_WIDTH = 0.06

BLUE = (0.028, 0.085, 0.28, 1.0)
BLUE_LIGHT = (0.045, 0.125, 0.37, 1.0)
SILVER = (0.82, 0.84, 0.86, 1.0)
WINDOW_COL = (0.7, 0.85, 1.0, 1.0)
GLOW_COL = (1.0, 0.16, 0.015, 1.0)
GUNMETAL = (0.06, 0.065, 0.075, 1.0)

WINDOW_EMIT = 7.2
GLOW_EMIT = 1.76
TORP_EMIT = 2.7
BAY_EMIT = 1.26
VENT_EMIT = 1.96

# ---------------- per-hull configuration (from probe_fleet.json) ----------------
# zone: aft-machinery boundary (everything aft of it is gunmetal)
# rmid: radius of the mid-hull cylinder that carries the missile-port row
HULLS = {
    "Earth Frigate": dict(
        slug="earth_frigate", rmid=3.0, zone=-16.9, has_pod=False,
        sphere=True, tur=0.55, ventral_mid=False, rods=False, whips=False,
        ports=False),   # frigates carry no missile weapons
    "Earth Destroyer": dict(
        slug="earth_destroyer", rmid=4.69, zone=-18.05, has_pod=False,
        sphere=True, tur=0.7, ventral_mid=True, rods=False, whips=True),
    "Earth Light Cruiser": dict(
        slug="earth_light_cruiser", rmid=5.0, zone=-19.55, has_pod=True,
        sphere=True, tur=0.85, ventral_mid=True, rods=False, whips=True),
    "Earth Heavy Cruiser": dict(
        slug="earth_heavy_cruiser", rmid=5.0, zone=-19.55, has_pod=True,
        sphere=True, tur=0.85, ventral_mid=True, rods=False, whips=True,
        pod_turret=False),   # dorsal pod is an engine pod - no turret on it
    "Earth Battleship": dict(
        slug="earth_battleship", rmid=5.0, zone=-21.3, has_pod=True,
        sphere=True, tur=1.0, ventral_mid=True, rods=True, whips=True,
        nav_fixed=[(-6.7, 0.0), (-19.4, 0.0)]),  # approved centreline rings
    "Earth Command Ship": dict(
        slug="earth_command_ship", rmid=None, zone=-20.55, has_pod=False,
        sphere=False, tur=1.0, ventral_mid=False, rods=False, whips=False,
        dorsal_mounts=[(0, -5.2)], nav="upper"),  # single cylinder turret
}


# ---------------- shader helpers ----------------
def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]


def band(nodes, links, sock, lo, hi):
    gt = nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = lo
    lt = nodes.new("ShaderNodeMath")
    lt.operation = "LESS_THAN"
    lt.inputs[1].default_value = hi
    mul = nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    links.new(sock, gt.inputs[0])
    links.new(sock, lt.inputs[0])
    links.new(gt.outputs[0], mul.inputs[0])
    links.new(lt.outputs[0], mul.inputs[1])
    return mul.outputs[0]


def combine(nodes, links, op, a, b):
    m = nodes.new("ShaderNodeMath")
    m.operation = op
    links.new(a, m.inputs[0])
    links.new(b, m.inputs[1])
    return m.outputs[0]


def disc(nodes, links, u, v, radius):
    u2 = nodes.new("ShaderNodeMath")
    u2.operation = "MULTIPLY"
    links.new(u, u2.inputs[0])
    links.new(u, u2.inputs[1])
    v2 = nodes.new("ShaderNodeMath")
    v2.operation = "MULTIPLY"
    links.new(v, v2.inputs[0])
    links.new(v, v2.inputs[1])
    rr = combine(nodes, links, "ADD", u2.outputs[0], v2.outputs[0])
    lt = nodes.new("ShaderNodeMath")
    lt.operation = "LESS_THAN"
    lt.inputs[1].default_value = radius * radius
    links.new(rr, lt.inputs[0])
    return lt.outputs[0]


def cell_axis(nodes, links, sock, period, phase=0.5):
    m = nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    m.inputs[1].default_value = 1.0 / period
    links.new(sock, m.inputs[0])
    fr = nodes.new("ShaderNodeMath")
    fr.operation = "FRACT"
    links.new(m.outputs[0], fr.inputs[0])
    sb = nodes.new("ShaderNodeMath")
    sb.operation = "SUBTRACT"
    sb.inputs[1].default_value = phase
    links.new(fr.outputs[0], sb.inputs[0])
    sc = nodes.new("ShaderNodeMath")
    sc.operation = "MULTIPLY"
    sc.inputs[1].default_value = period
    links.new(sb.outputs[0], sc.inputs[0])
    return sc.outputs[0]


def offset(nodes, links, sock, value):
    s = nodes.new("ShaderNodeMath")
    s.operation = "SUBTRACT"
    s.inputs[1].default_value = value
    links.new(sock, s.inputs[0])
    return s.outputs[0]


def panel_lattice(nodes, links, coord):
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = tuple(PANEL_SCALE * a for a in PANEL_ASPECT)
    links.new(coord, mp.inputs["Vector"])
    tone = nodes.new("ShaderNodeTexVoronoi")
    tone.voronoi_dimensions = "3D"
    tone.feature = "F1"
    tone.inputs["Scale"].default_value = 1.0
    tone.inputs["Randomness"].default_value = RANDOMNESS
    links.new(mp.outputs[0], tone.inputs["Vector"])
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(tone.outputs["Color"], bw.inputs[0])
    edge = nodes.new("ShaderNodeTexVoronoi")
    edge.voronoi_dimensions = "3D"
    edge.feature = "DISTANCE_TO_EDGE"
    edge.inputs["Scale"].default_value = 1.0
    edge.inputs["Randomness"].default_value = RANDOMNESS
    links.new(mp.outputs[0], edge.inputs["Vector"])
    seam = nodes.new("ShaderNodeMapRange")
    seam.inputs["From Max"].default_value = SEAM_WIDTH
    seam.clamp = True
    links.new(edge.outputs["Distance"], seam.inputs["Value"])
    return bw.outputs[0], seam.outputs["Result"]


# ---------------- per-hull build ----------------
def build_ship(hull, cfg):
    slug = cfg["slug"]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models", hull + ".stl"))
    obj = bpy.context.selected_objects[0]
    obj.name = hull.replace(" ", "")
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
    dims = V.max(axis=0) - V.min(axis=0)
    L = float(dims[1])
    ymin, ymax = float(V[:, 1].min()), float(V[:, 1].max())

    # style stations scaled by hull length
    zone = cfg["zone"]
    stripe_c = ymin + 0.30 * L
    stripe_w = L / 46.5
    stripe = (stripe_c - stripe_w, stripe_c + stripe_w)
    vent_band = (zone + 0.7, zone + 1.7)
    nav_ys = (zone + 1.9, stripe[1] + 1.6)
    port_y = (ymax - 0.578 * L, ymax - 0.474 * L)
    win_y_min = ymax - 0.55 * L
    rmid = cfg["rmid"]
    if rmid:
        win_rows = [(-0.52 * rmid, -0.32 * rmid), (0.32 * rmid, 0.52 * rmid)]
    else:
        win_rows = [(-1.6, -0.8), (0.8, 1.6)]

    # bow sphere fit
    scx = scy = scz = srad = None
    if cfg["sphere"]:
        zgate = float(dims[2]) * 0.30
        pts = V[(V[:, 1] > ymax - dims[2] * 1.1) & (np.abs(V[:, 2]) > zgate)]
        A = np.c_[pts * 2, np.ones(len(pts))]
        sol, *_ = np.linalg.lstsq(A, (pts ** 2).sum(axis=1), rcond=None)
        scx, scy, scz = (float(v) for v in sol[:3])
        srad = math.sqrt(float(sol[3]) + scx ** 2 + scy ** 2 + scz ** 2)

    # ---------------- patch analysis ----------------
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for e in bm.edges:
        lf = e.link_faces
        if len(lf) == 2:
            try:
                ang = e.calc_face_angle()
            except ValueError:
                ang = 0.0
            if ang < math.radians(30):
                ra, rb = find(lf[0].index), find(lf[1].index)
                if ra != rb:
                    parent[rb] = ra
    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f)

    brim_faces, ring_faces = set(), set()
    high_collars = []
    annuli = []
    for root, faces in groups.items():
        cs = [f.calc_center_median() for f in faces]
        area = sum(f.calc_area() for f in faces)
        zex = max(c.z for c in cs) - min(c.z for c in cs)
        yex = max(c.y for c in cs) - min(c.y for c in cs)
        if srad is not None:
            rh = [math.sqrt((c.x - scx) ** 2 + (c.y - scy) ** 2) for c in cs]
            if (area > 5.0 and zex < 0.4 * srad
                    and min(rh) < srad + 0.5 and max(rh) > srad + 2.5):
                brim_faces.update(f.index for f in faces)
                continue
        if area > 0.8 and yex < 1.6:
            mny = sum(abs(f.normal.y) * f.calc_area() for f in faces) / area
            if mny <= 0.3:
                ring_faces.update(f.index for f in faces)
                continue
        if 0.4 < area < 25.0 and yex < 0.3:
            mny2 = sum(abs(f.normal.y) * f.calc_area() for f in faces) / area
            if mny2 > 0.85:
                annuli.append([f.index for f in faces])
        if area > 2.0 and yex < 3.5:
            mny = sum(abs(f.normal.y) * f.calc_area() for f in faces) / area
            mx = sum(c.x for c in cs) / len(cs)
            mz = sum(c.z for c in cs) / len(cs)
            if mny <= 0.35 and abs(mx) < 2.5 and mz > (rmid or 4.0) * 0.9:
                high_collars.append([f.index for f in faces])

    pod_faces = set()
    pod_bounds = None
    if cfg["has_pod"]:
        best = None
        for f in bm.faces:
            c = f.calc_center_median()
            if (ymin + 0.15 * L < c.y < ymax - 0.35 * L
                    and (best is None or c.z > best[0])):
                best = (c.z, f.index)
        if best:
            pf = groups[find(best[1])]
            pod_faces = {f.index for f in pf}
            pc = [f.calc_center_median() for f in pf]
            pod_bounds = dict(y_lo=min(c.y for c in pc),
                              y_hi=max(c.y for c in pc),
                              z_top=max(c.z for c in pc))

    # rear-facing connected caps: small caps glow, the central large cap is
    # the bay, and the remaining large caps are machinery bulkheads
    stern_gate = ymin + 0.12 * L
    cand = [f.index for f in bm.faces
            if f.normal.y < -0.7 and f.calc_center_median().y < stern_gate]
    cset = set(cand)
    cparent = {i: i for i in cand}

    def cfind(i):
        while cparent[i] != i:
            cparent[i] = cparent[cparent[i]]
            i = cparent[i]
        return i

    for i in cand:
        for e in bm.faces[i].edges:
            for g in e.link_faces:
                if g.index in cset and g.index != i:
                    a, b = cfind(i), cfind(g.index)
                    if a != b:
                        cparent[b] = a
    cclusters = {}
    for i in cand:
        cclusters.setdefault(cfind(i), []).append(i)
    caps = []
    for root, idxs in cclusters.items():
        pts2 = np.array([[bm.faces[i].calc_center_median().x,
                          bm.faces[i].calc_center_median().y,
                          bm.faces[i].calc_center_median().z] for i in idxs])
        cx, cy, cz = pts2[:, 0].mean(), pts2[:, 1].mean(), pts2[:, 2].mean()
        rmax = float(np.sqrt((pts2[:, 0] - cx) ** 2
                             + (pts2[:, 2] - cz) ** 2).max())
        caps.append(dict(idx=set(idxs), cx=float(cx), cy=float(cy),
                         cz=float(cz), rmax=rmax, n=len(idxs)))
    bm.free()

    glow_faces, gun_caps = set(), set()
    bay = None
    nozzles = [c for c in caps if c["rmax"] < 1.3 and c["n"] > 20]
    for c in nozzles:
        glow_faces.update(c["idx"])
    bigs = [c for c in caps if c["rmax"] >= 1.5]
    central = [c for c in bigs if abs(c["cx"]) < 1.0]
    if central:
        bay = min(central, key=lambda c: c["cy"])
        for c in bigs:
            if c is not bay:
                gun_caps.update(c["idx"])
    else:
        for c in bigs:
            gun_caps.update(c["idx"])

    side_noz = [c for c in nozzles if abs(c["cx"]) > 0.5]
    if side_noz:
        noz_y = max(c["cy"] for c in side_noz)
        vent_band = (noz_y + 0.7, noz_y + 1.9)
        vent_z = sum(c["cz"] for c in side_noz) / len(side_noz)
    elif nozzles:
        noz_y = nozzles[0]["cy"]
        vent_band = (noz_y + 0.7, noz_y + 1.9)
        vent_z = nozzles[0]["cz"]
    else:
        vent_z = 0.0

    if annuli and ring_faces:
        ring_verts = set()
        for i in ring_faces:
            ring_verts.update(me.polygons[i].vertices)
        added = 0
        for patch in annuli:
            if not any(v in ring_verts for i in patch
                       for v in me.polygons[i].vertices):
                continue
            new = [i for i in patch if i not in ring_faces]
            ring_faces.update(new)
            added += len(new)
        if added:
            print("ANNULI silvered: %d" % added)

    if pod_bounds:
        ctr_noz = [c for c in nozzles if abs(c["cx"]) < 1.0]
        if ctr_noz:
            az = ctr_noz[0]["cz"]
            buckets = {}
            for i in pod_faces:
                p = me.polygons[i]
                r = math.hypot(p.center.x, p.center.z - az)
                b = round(p.center.y * 2) / 2
                buckets.setdefault(b, []).append((i, r, abs(p.normal.y)))
            rmaxes = {b: max(r for i, r, ny in v)
                      for b, v in buckets.items()}
            med = sorted(rmaxes.values())[len(rmaxes) // 2]
            collar = set()
            for b, v in buckets.items():
                if rmaxes[b] > med + 0.12:
                    for i, r, ny in v:
                        if r > med - 0.05 and ny < 0.6:
                            collar.add(i)
            pod_faces -= collar
            ring_faces |= collar
            for hc in high_collars:
                collar.update(hc)
                ring_faces.update(hc)
                pod_faces -= set(hc)
            print("POD collar carved: %d faces" % len(collar))

    print("%s: caps=%d nozzles=%d bay=%s pod=%s brim=%d rings=%d"
          % (slug, len(caps), len(nozzles),
             "yes r%.2f" % bay["rmax"] if bay else "none",
             "yes" if pod_bounds else "none", len(brim_faces), len(ring_faces)))

    # ---------------- materials ----------------
    def build_hull_mat(name, striped):
        mat, nt, bsdf = new_mat(name)
        nodes, links = nt.nodes, nt.links
        coord = nodes.new("ShaderNodeTexCoord")
        sep = nodes.new("ShaderNodeSeparateXYZ")
        links.new(coord.outputs["Object"], sep.inputs[0])
        geom = nodes.new("ShaderNodeNewGeometry")
        nsep = nodes.new("ShaderNodeSeparateXYZ")
        links.new(geom.outputs["Normal"], nsep.inputs[0])

        tone_bw, seam = panel_lattice(nodes, links, coord.outputs["Object"])
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = PANEL_BUMP
        links.new(seam, bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

        tone = nodes.new("ShaderNodeMix")
        tone.data_type = "RGBA"
        tone.inputs["A"].default_value = BLUE
        tone.inputs["B"].default_value = BLUE_LIGHT
        links.new(tone_bw, tone.inputs["Factor"])
        base_col = tone.outputs["Result"]

        if striped:
            b = band(nodes, links, sep.outputs["Y"], *stripe)
            smix = nodes.new("ShaderNodeMix")
            smix.data_type = "RGBA"
            smix.inputs["B"].default_value = SILVER
            links.new(b, smix.inputs["Factor"])
            links.new(base_col, smix.inputs["A"])
            base_col = smix.outputs["Result"]

        nax = nodes.new("ShaderNodeMath")
        nax.operation = "ABSOLUTE"
        links.new(nsep.outputs["X"], nax.inputs[0])
        pside = nodes.new("ShaderNodeMath")
        pside.operation = "GREATER_THAN"
        pside.inputs[1].default_value = 0.6
        links.new(nax.outputs[0], pside.inputs[0])

        port_mask = None
        if rmid and cfg.get("ports", True):
            rx2 = nodes.new("ShaderNodeMath")
            rx2.operation = "MULTIPLY"
            links.new(sep.outputs["X"], rx2.inputs[0])
            links.new(sep.outputs["X"], rx2.inputs[1])
            rz2 = nodes.new("ShaderNodeMath")
            rz2.operation = "MULTIPLY"
            links.new(sep.outputs["Z"], rz2.inputs[0])
            links.new(sep.outputs["Z"], rz2.inputs[1])
            rad = nodes.new("ShaderNodeMath")
            rad.operation = "SQRT"
            links.new(combine(nodes, links, "ADD", rx2.outputs[0], rz2.outputs[0]),
                      rad.inputs[0])
            on_cyl = band(nodes, links, rad.outputs[0], rmid - 0.35, rmid + 0.35)
            pu = cell_axis(nodes, links, sep.outputs["Y"], 1.45)
            port_mask = disc(nodes, links, pu, sep.outputs["Z"], 0.40)
            for gate in (band(nodes, links, sep.outputs["Y"], *port_y),
                         on_cyl, pside.outputs[0]):
                port_mask = combine(nodes, links, "MULTIPLY", port_mask, gate)
            pdark = nodes.new("ShaderNodeMix")
            pdark.data_type = "RGBA"
            pdark.inputs["B"].default_value = (0.004, 0.004, 0.006, 1.0)
            links.new(port_mask, pdark.inputs["Factor"])
            links.new(base_col, pdark.inputs["A"])
            base_col = pdark.outputs["Result"]

        macro = nodes.new("ShaderNodeTexVoronoi")
        macro.voronoi_dimensions = "3D"
        macro.feature = "F1"
        macro.inputs["Scale"].default_value = 0.06
        macro.inputs["Randomness"].default_value = 0.7
        links.new(coord.outputs["Object"], macro.inputs["Vector"])
        mbw = nodes.new("ShaderNodeRGBToBW")
        links.new(macro.outputs["Color"], mbw.inputs[0])
        mrange = nodes.new("ShaderNodeMapRange")
        mrange.inputs["To Min"].default_value = 0.82
        mrange.inputs["To Max"].default_value = 1.06
        links.new(mbw.outputs[0], mrange.inputs["Value"])
        mcol = nodes.new("ShaderNodeCombineColor")
        for ch in ("Red", "Green", "Blue"):
            links.new(mrange.outputs["Result"], mcol.inputs[ch])
        mmix = nodes.new("ShaderNodeMix")
        mmix.data_type = "RGBA"
        mmix.blend_type = "MULTIPLY"
        mmix.inputs["Factor"].default_value = 1.0
        links.new(base_col, mmix.inputs["A"])
        links.new(mcol.outputs["Color"], mmix.inputs["B"])
        links.new(mmix.outputs["Result"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 0.35
        rmap = nodes.new("ShaderNodeMapRange")
        rmap.inputs["To Min"].default_value = 0.45
        rmap.inputs["To Max"].default_value = 0.62
        links.new(tone_bw, rmap.inputs["Value"])
        links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])

        cz = band(nodes, links, cell_axis(nodes, links, sep.outputs["Z"], 0.5),
                  -0.12, 0.08)
        cy = band(nodes, links, cell_axis(nodes, links, sep.outputs["Y"], 1.0 / 0.9),
                  -0.30, 0.14)
        mask = combine(nodes, links, "MULTIPLY", cz, cy)
        rows = None
        for lo, hi in win_rows:
            b = band(nodes, links, sep.outputs["Z"], lo, hi)
            rows = b if rows is None else combine(nodes, links, "ADD", rows, b)
        naz = nodes.new("ShaderNodeMath")
        naz.operation = "ABSOLUTE"
        links.new(nsep.outputs["Z"], naz.inputs[0])
        flat = nodes.new("ShaderNodeMath")
        flat.operation = "LESS_THAN"
        flat.inputs[1].default_value = 0.55
        links.new(naz.outputs[0], flat.inputs[0])
        fwd = nodes.new("ShaderNodeMath")
        fwd.operation = "GREATER_THAN"
        fwd.inputs[1].default_value = win_y_min
        links.new(sep.outputs["Y"], fwd.inputs[0])
        for gate in (rows, flat.outputs[0], fwd.outputs[0]):
            mask = combine(nodes, links, "MULTIPLY", mask, gate)
        if port_mask is not None:
            inv = nodes.new("ShaderNodeMath")
            inv.operation = "SUBTRACT"
            inv.inputs[0].default_value = 1.0
            links.new(port_mask, inv.inputs[1])
            mask = combine(nodes, links, "MULTIPLY", mask, inv.outputs[0])

        vent = combine(nodes, links, "MULTIPLY",
                       band(nodes, links, sep.outputs["Y"], *vent_band),
                       band(nodes, links,
                            cell_axis(nodes, links, sep.outputs["Z"], 0.55),
                            -0.16, 0.06))
        vent = combine(nodes, links, "MULTIPLY", vent, pside.outputs[0])
        vent = combine(nodes, links, "MULTIPLY", vent,
                       band(nodes, links, sep.outputs["Z"],
                            vent_z - 1.3, vent_z + 1.3))
        we = nodes.new("ShaderNodeMath")
        we.operation = "MULTIPLY"
        we.inputs[1].default_value = WINDOW_EMIT
        links.new(mask, we.inputs[0])
        ve = nodes.new("ShaderNodeMath")
        ve.operation = "MULTIPLY"
        ve.inputs[1].default_value = VENT_EMIT
        links.new(vent, ve.inputs[0])
        ecol = nodes.new("ShaderNodeMix")
        ecol.data_type = "RGBA"
        ecol.inputs["A"].default_value = WINDOW_COL
        ecol.inputs["B"].default_value = GLOW_COL
        links.new(vent, ecol.inputs["Factor"])
        links.new(ecol.outputs["Result"], bsdf.inputs["Emission Color"])
        links.new(combine(nodes, links, "ADD", we.outputs[0], ve.outputs[0]),
                  bsdf.inputs["Emission Strength"])
        return mat

    mat_clean = build_hull_mat("Earth Hull Blue", False)
    mat_striped = build_hull_mat("Earth Hull Blue Striped", True)
    mat_silver, _, sb = new_mat("Earth Accent Silver")
    sb.inputs["Base Color"].default_value = SILVER
    sb.inputs["Metallic"].default_value = 0.9
    sb.inputs["Roughness"].default_value = 0.28
    mat_glow, _, gb = new_mat("Earth Engine Glow")
    gb.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    gb.inputs["Emission Color"].default_value = GLOW_COL
    gb.inputs["Emission Strength"].default_value = GLOW_EMIT
    mat_gun, _, gm = new_mat("Earth Gunmetal")
    gm.inputs["Base Color"].default_value = GUNMETAL
    gm.inputs["Metallic"].default_value = 0.8
    gm.inputs["Roughness"].default_value = 0.5

    mat_torp = None
    if pod_bounds:
        z_top = pod_bounds["z_top"]
        y_hi, y_lo = pod_bounds["y_hi"], pod_bounds["y_lo"]
        tube_ys = (y_hi - 1.6, y_hi - 2.95)
        win_ys = []
        wy = y_hi - 3.8
        while wy > y_lo + 1.6:
            win_ys.append(wy)
            wy -= 1.0
        mat_torp, tnt, tb = new_mat("Earth Torpedo Pod")
        tn, tl = tnt.nodes, tnt.links
        tcoord = tn.new("ShaderNodeTexCoord")
        tsep = tn.new("ShaderNodeSeparateXYZ")
        tl.new(tcoord.outputs["Object"], tsep.inputs[0])
        tgeo = tn.new("ShaderNodeNewGeometry")
        tnsep = tn.new("ShaderNodeSeparateXYZ")
        tl.new(tgeo.outputs["Normal"], tnsep.inputs[0])
        ttone, tseam = panel_lattice(tn, tl, tcoord.outputs["Object"])
        tbump = tn.new("ShaderNodeBump")
        tbump.inputs["Strength"].default_value = PANEL_BUMP
        tl.new(tseam, tbump.inputs["Height"])
        tl.new(tbump.outputs["Normal"], tb.inputs["Normal"])
        tmix = tn.new("ShaderNodeMix")
        tmix.data_type = "RGBA"
        tmix.inputs["A"].default_value = BLUE
        tmix.inputs["B"].default_value = BLUE_LIGHT
        tl.new(ttone, tmix.inputs["Factor"])
        tnax = tn.new("ShaderNodeMath")
        tnax.operation = "ABSOLUTE"
        tl.new(tnsep.outputs["X"], tnax.inputs[0])
        tside = tn.new("ShaderNodeMath")
        tside.operation = "GREATER_THAN"
        tside.inputs[1].default_value = 0.45
        tl.new(tnax.outputs[0], tside.inputs[0])
        tnay = tn.new("ShaderNodeMath")
        tnay.operation = "ABSOLUTE"
        tl.new(tnsep.outputs["Y"], tnay.inputs[0])
        tflat = tn.new("ShaderNodeMath")
        tflat.operation = "LESS_THAN"
        tflat.inputs[1].default_value = 0.35
        tl.new(tnay.outputs[0], tflat.inputs[0])
        tzc = offset(tn, tl, tsep.outputs["Z"], z_top - 2.05)
        tube = None
        for ty in tube_ys:
            d = disc(tn, tl, offset(tn, tl, tsep.outputs["Y"], ty), tzc, 0.33)
            tube = d if tube is None else combine(tn, tl, "ADD", tube, d)
        for gate in (tside.outputs[0], tflat.outputs[0]):
            tube = combine(tn, tl, "MULTIPLY", tube, gate)
        twin_z = band(tn, tl, tsep.outputs["Z"], z_top - 1.22, z_top - 0.88)
        twin = None
        for wy in win_ys:
            w = band(tn, tl, tsep.outputs["Y"], wy - 0.2, wy + 0.2)
            twin = w if twin is None else combine(tn, tl, "ADD", twin, w)
        if twin is not None:
            for gate in (twin_z, tside.outputs[0], tflat.outputs[0]):
                twin = combine(tn, tl, "MULTIPLY", twin, gate)
        tdark = tn.new("ShaderNodeMix")
        tdark.data_type = "RGBA"
        tdark.inputs["B"].default_value = (0.004, 0.005, 0.008, 1.0)
        tl.new(tube, tdark.inputs["Factor"])
        tl.new(tmix.outputs["Result"], tdark.inputs["A"])
        tl.new(tdark.outputs["Result"], tb.inputs["Base Color"])
        tb.inputs["Metallic"].default_value = 0.35
        tb.inputs["Roughness"].default_value = 0.45
        tsum = tube if twin is None else combine(tn, tl, "ADD", tube, twin)
        tstr = tn.new("ShaderNodeMath")
        tstr.operation = "MULTIPLY"
        tstr.inputs[1].default_value = TORP_EMIT
        tl.new(tsum, tstr.inputs[0])
        tb.inputs["Emission Color"].default_value = WINDOW_COL
        tl.new(tstr.outputs[0], tb.inputs["Emission Strength"])

    mat_bay = None
    if bay:
        bidx = bay["idx"]
        capverts = set()
        for i in bidx:
            capverts.update(me.polygons[i].vertices)
        boundary = set()
        for p in me.polygons:
            if p.index in bidx:
                continue
            for v in p.vertices:
                if v in capverts:
                    boundary.add(v)
        fitted = False
        if len(boundary) >= 8:
            B = np.array([[me.vertices[v].co.x, me.vertices[v].co.z]
                          for v in boundary])
            A2 = np.c_[B[:, 0] * 2, B[:, 1] * 2, np.ones(len(B))]
            s2, *_ = np.linalg.lstsq(A2, B[:, 0] ** 2 + B[:, 1] ** 2,
                                     rcond=None)
            r2 = float(s2[2] + s2[0] ** 2 + s2[1] ** 2)
            if r2 > 0.25:
                bay["cx"], bay["cz"] = float(s2[0]), float(s2[1])
                bay["rmax"] = math.sqrt(r2)
                fitted = True
        if not fitted:
            bcs = [me.polygons[i].center for i in bidx]
            ar = [me.polygons[i].area for i in bidx]
            asum = sum(ar)
            bay["cx"] = sum(c.x * a for c, a in zip(bcs, ar)) / asum
            bay["cz"] = sum(c.z * a for c, a in zip(bcs, ar)) / asum
        print("BAY centre (%.2f, %.2f) r=%.2f fitted=%s"
              % (bay["cx"], bay["cz"], bay["rmax"], fitted))
        r = bay["rmax"]
        mat_bay, bnt, bb = new_mat("Earth Shuttlebay")
        bn, bl = bnt.nodes, bnt.links
        bcoord = bn.new("ShaderNodeTexCoord")
        bsep = bn.new("ShaderNodeSeparateXYZ")
        bl.new(bcoord.outputs["Object"], bsep.inputs[0])
        bxo = offset(bn, bl, bsep.outputs["X"], bay["cx"])
        bzo = offset(bn, bl, bsep.outputs["Z"], bay["cz"])
        bx2 = bn.new("ShaderNodeMath")
        bx2.operation = "MULTIPLY"
        bl.new(bxo, bx2.inputs[0])
        bl.new(bxo, bx2.inputs[1])
        bz2 = bn.new("ShaderNodeMath")
        bz2.operation = "MULTIPLY"
        bl.new(bzo, bz2.inputs[0])
        bl.new(bzo, bz2.inputs[1])
        brad = bn.new("ShaderNodeMath")
        brad.operation = "SQRT"
        bl.new(combine(bn, bl, "ADD", bx2.outputs[0], bz2.outputs[0]), brad.inputs[0])
        rim = band(bn, bl, brad.outputs[0], 0.72 * r, 0.86 * r)
        binner = bn.new("ShaderNodeMath")
        binner.operation = "LESS_THAN"
        binner.inputs[1].default_value = 0.68 * r
        bl.new(brad.outputs[0], binner.inputs[0])
        bseam = band(bn, bl, cell_axis(bn, bl, bxo, 0.21 * r), -0.017, 0.017)
        bseam = combine(bn, bl, "MULTIPLY", bseam, binner.outputs[0])
        bsstr = bn.new("ShaderNodeMath")
        bsstr.operation = "MULTIPLY"
        bsstr.inputs[1].default_value = 0.5
        bl.new(bseam, bsstr.inputs[0])
        bsum = combine(bn, bl, "ADD", rim, bsstr.outputs[0])
        bpanel = bn.new("ShaderNodeMix")
        bpanel.data_type = "RGBA"
        bpanel.inputs["A"].default_value = (0.006, 0.010, 0.022, 1.0)
        bpanel.inputs["B"].default_value = (0.022, 0.032, 0.058, 1.0)
        bl.new(binner.outputs[0], bpanel.inputs["Factor"])
        bl.new(bpanel.outputs["Result"], bb.inputs["Base Color"])
        bb.inputs["Metallic"].default_value = 0.2
        bb.inputs["Roughness"].default_value = 0.6
        bstr = bn.new("ShaderNodeMath")
        bstr.operation = "MULTIPLY"
        bstr.inputs[1].default_value = BAY_EMIT
        bl.new(bsum, bstr.inputs[0])
        bb.inputs["Emission Color"].default_value = WINDOW_COL
        bl.new(bstr.outputs[0], bb.inputs["Emission Strength"])

    mats = [mat_clean, mat_silver, mat_glow, mat_gun]
    S_HULL, S_SILVER, S_GLOW, S_GUN = 0, 1, 2, 3
    S_TORP = S_BAY = None
    if mat_torp:
        S_TORP = len(mats)
        mats.append(mat_torp)
    if mat_bay:
        S_BAY = len(mats)
        mats.append(mat_bay)
    me.materials.clear()
    for m in mats:
        me.materials.append(m)

    # ---------------- face assignment ----------------
    bay_idx = bay["idx"] if bay else set()
    for p in me.polygons:
        c, i = p.center, p.index
        if i in glow_faces:
            p.material_index = S_GLOW
        elif S_BAY is not None and i in bay_idx:
            p.material_index = S_BAY
        elif i in gun_caps or c.y < zone:
            p.material_index = S_GUN
        elif i in brim_faces:
            p.material_index = S_SILVER
        elif S_TORP is not None and i in pod_faces:
            p.material_index = S_TORP
        elif i in ring_faces:
            p.material_index = S_SILVER
        elif (cfg["rods"] and abs(abs(c.x) - 5.0) < 0.5
              and abs(c.z) < 0.6 and -19 < c.y < -9):
            p.material_index = S_SILVER
        else:
            p.material_index = S_HULL

    # ---------------- fittings, placed by raycast ----------------
    made = []

    def surface(origin, direction):
        ok, loc, nrm, _ = obj.ray_cast(mathutils.Vector(origin),
                                       mathutils.Vector(direction))
        return (loc, nrm) if ok else (None, None)

    def basis(normal, forward=(0, 1, 0)):
        z = mathutils.Vector(normal).normalized()
        f = mathutils.Vector(forward)
        if abs(f.dot(z)) > 0.95:
            f = mathutils.Vector((0, 0, 1))
        y = (f - f.dot(z) * z).normalized()
        x = y.cross(z)
        return mathutils.Matrix((x, y, z)).transposed().to_4x4()

    def place(parts, loc, normal, sink):
        for o in bpy.data.objects:
            o.select_set(False)
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        o = bpy.context.active_object
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        n = mathutils.Vector(normal).normalized()
        o.matrix_world = mathutils.Matrix.Translation(
            mathutils.Vector(loc) - n * sink) @ basis(n)
        made.append(o)
        return o

    def turret(origin, direction, scale=1.0):
        loc, nrm = surface(origin, direction)
        if loc is None:
            return
        bpy.ops.mesh.primitive_cylinder_add(radius=1.0 * scale, depth=0.6 * scale,
                                            vertices=24, location=(0, 0, 0.3 * scale))
        base = bpy.context.active_object
        base.data.materials.append(mat_silver)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.85 * scale, segments=20,
                                             ring_count=10,
                                             location=(0, 0, 0.62 * scale))
        dome = bpy.context.active_object
        dome.data.materials.append(mat_silver)
        parts = [base, dome]
        for sx in (-0.35, 0.35):
            bpy.ops.mesh.primitive_cylinder_add(
                radius=0.13 * scale, depth=2.6 * scale, vertices=12,
                location=(sx * scale, 1.25 * scale, 0.75 * scale),
                rotation=(math.radians(90), 0, 0))
            b = bpy.context.active_object
            b.data.materials.append(mat_gun)
            parts.append(b)
        place(parts, loc, nrm, sink=0.24 * scale)

    def mast(origin, direction, length, radius=0.075):
        loc, nrm = surface(origin, direction)
        if loc is None:
            return
        bpy.ops.mesh.primitive_cylinder_add(radius=radius * 3.4, depth=0.30,
                                            vertices=14, location=(0, 0, 0.15))
        foot = bpy.context.active_object
        foot.data.materials.append(mat_silver)
        bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, vertices=10,
                                            location=(0, 0, 0.22 + length / 2))
        rod = bpy.context.active_object
        rod.data.materials.append(mat_silver)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * 2.2, segments=12,
                                             ring_count=6,
                                             location=(0, 0, 0.22 + length))
        tip = bpy.context.active_object
        tip.data.materials.append(mat_silver)
        place([foot, rod, tip], loc, nrm, sink=0.12)

    def plate(origin, direction, sx, sy):
        loc, nrm = surface(origin, direction)
        if loc is None:
            return
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.07))
        pl = bpy.context.active_object
        pl.scale = (sx, sy, 0.14)
        pl.data.materials.append(mat_gun)
        place([pl], loc, nrm, sink=0.06)

    mat_nav_red, _, nr = new_mat("Nav Red")
    nr.inputs["Base Color"].default_value = (0.1, 0.005, 0.005, 1)
    nr.inputs["Emission Color"].default_value = (1.0, 0.02, 0.02, 1)
    nr.inputs["Emission Strength"].default_value = 4.0
    mat_nav_green, _, ng = new_mat("Nav Green")
    ng.inputs["Base Color"].default_value = (0.005, 0.1, 0.01, 1)
    ng.inputs["Emission Color"].default_value = (0.05, 1.0, 0.1, 1)
    ng.inputs["Emission Strength"].default_value = 4.0

    def nav_light(origin, direction, mat):
        loc, nrm = surface(origin, direction)
        if loc is None:
            return
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, segments=12, ring_count=6,
                                             location=(0, 0, 0))
        lamp = bpy.context.active_object
        lamp.data.materials.append(mat)
        place([lamp], loc, nrm, sink=0.06)

    far = L * 1.2
    ts = cfg["tur"]
    if cfg["sphere"]:
        turret((scx, scy, scz + far), (0, 0, -1), ts)
        turret((scx, scy, scz - far), (0, 0, 1), ts)
    for my in cfg.get("dorsal_mounts", []):
        turret((my[0], my[1], far), (0, 0, -1), ts)
    if pod_bounds and cfg.get("pod_turret", True):
        turret((0, (pod_bounds["y_lo"] + pod_bounds["y_hi"]) / 2, far),
               (0, 0, -1), ts)
    if cfg["ventral_mid"]:
        turret((0, ymax - 0.49 * L, -far), (0, 0, 1), ts * 0.85)
    mast((0, far, scz if scz is not None else 0), (0, -1, 0), 0.073 * L,
         radius=0.09)
    if cfg["whips"]:
        wx = 0.029 * L
        wy = ymax - 0.427 * L
        mast((-wx, wy, far), (0, 0, -1), 0.056 * L)
        mast((wx, wy, far), (0, 0, -1), 0.056 * L)
    plate((0, stripe_c + 3.0, far), (0, 0, -1), 2.2, 1.3)
    plate((0, stripe_c + 3.0, -far), (0, 0, 1), 2.0, 1.1)

    def zaim(sign):
        side = [c for c in nozzles if sign * c["cx"] > 0.5]
        if side:
            return max(c["cz"] for c in side)
        return nozzles[0]["cz"] if nozzles else 0.0

    navz_port, navz_stbd = zaim(-1), zaim(1)
    ring_cs = [me.polygons[i].center.copy() for i in ring_faces]
    side_rings = [c for c in ring_cs if abs(c.x) > 2.5]
    if not side_rings:
        side_rings = [c for c in ring_cs if abs(c.x) > 1.0]
    if cfg.get("nav_fixed"):
        pairs = [(y, z, z) for (y, z) in cfg["nav_fixed"]]
    elif side_rings:
        ys_sorted = sorted(c.y for c in side_rings)
        bands = []
        start = prev = ys_sorted[0]
        for yy in ys_sorted[1:]:
            if yy - prev > 1.2:
                bands.append((start + prev) / 2)
                start = yy
            prev = yy
        bands.append((start + prev) / 2)
        stations = sorted(set([min(bands), max(bands)]))
        pairs = [(sta, navz_port, navz_stbd) for sta in stations]
    else:
        pairs = [(ny, navz_port, navz_stbd) for ny in nav_ys]
    for ny, zp, zs in pairs:
        nav_light((-far, ny, zp), (1, 0, 0), mat_nav_red)
        nav_light((far, ny, zs), (-1, 0, 0), mat_nav_green)

    for o in bpy.data.objects:
        o.select_set(False)
    obj.select_set(True)
    for o in made:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()

    for op in ("shade_auto_smooth", "shade_smooth_by_angle"):
        try:
            getattr(bpy.ops.object, op)(angle=math.radians(35))
            break
        except AttributeError:
            continue

    # ---------------- scene + renders ----------------
    scene = bpy.context.scene
    try:
        ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
        scene.compositing_node_group = ng
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        gl.inputs["Type"].default_value = "Fog Glow"
        gl.inputs["Threshold"].default_value = 1.0
        gl.inputs["Strength"].default_value = 0.55
        outn = ng.nodes.new("NodeGroupOutput")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(gl.outputs["Image"], outn.inputs["Image"])
        scene.render.use_compositing = True
    except Exception as exc:
        print("glare skipped:", exc)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200

    def add_sun(name, energy, rx, rz, color=(1, 1, 1)):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        light.color = color
        o = bpy.data.objects.new(name, light)
        o.rotation_euler = (math.radians(rx), 0, math.radians(rz))
        bpy.context.collection.objects.link(o)

    add_sun("Key", 4.0, 55, 35, (1.0, 0.97, 0.92))
    add_sun("Fill", 2.6, -60, -130, (0.8, 0.87, 1.0))
    add_sun("Rim", 2.0, 15, 180, (0.9, 0.95, 1.0))
    add_sun("Under", 0.9, -125, 40, (0.8, 0.87, 1.0))
    world = bpy.data.worlds.new("Space")
    world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links
    wcoord = wn.new("ShaderNodeTexCoord")
    wmap = wn.new("ShaderNodeMapping")
    wmap.inputs["Rotation"].default_value = (0, math.radians(-90), 0)
    wgrad = wn.new("ShaderNodeTexGradient")
    wramp = wn.new("ShaderNodeValToRGB")
    wramp.color_ramp.elements[0].color = (0.004, 0.005, 0.009, 1)
    wramp.color_ramp.elements[1].color = (0.035, 0.045, 0.075, 1)
    wl.new(wcoord.outputs["Generated"], wmap.inputs["Vector"])
    wl.new(wmap.outputs[0], wgrad.inputs["Vector"])
    wl.new(wgrad.outputs["Fac"], wramp.inputs[0])
    wl.new(wramp.outputs["Color"], wn["Background"].inputs["Color"])
    scene.world = world

    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    size = max(float(d) for d in dims)

    def look(loc, target=(0, 0, 0)):
        cam.location = loc
        d = mathutils.Vector(target) - mathutils.Vector(loc)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

    views = {
        "front_quarter": ((size * 1.12, size * 1.176, size * 0.56), (0, 0, 0)),
        "rear_quarter": ((size * 1.064, -size * 1.232, size * 0.448), (0, 0, 0)),
        "side": ((size * 1.624, 0, size * 0.1568), (0, 0, 0)),
        "stern_close": ((size * 0.672, -size * 1.288, -size * 0.1344),
                        (0, ymin * 0.75, 0)),
    }
    md = obj.data
    for variant, hull_mat in (("clean", mat_clean), ("striped", mat_striped)):
        md.materials[S_HULL] = hull_mat
        vv = views if variant == "clean" else {k: views[k] for k in
                                              ("front_quarter", "side")}
        for label, (loc, tgt) in vv.items():
            look(loc, tgt)
            scene.render.filepath = os.path.join(
                OUTDIR, "%s_%s_%s.png" % (slug, variant, label))
            bpy.ops.render.render(write_still=True)
    md.materials[S_HULL] = mat_clean
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLENDDIR, slug + ".blend"))


for hull, cfg in HULLS.items():
    build_ship(hull, cfg)
print("FLEET_DONE")
