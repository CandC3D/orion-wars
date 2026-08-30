"""Zandrax Horde fleet build - texture and glow pass (no added geometry).

Canon: red base, gold accents, yellow windows, purple highlights, yellow
engine glow. Brutalist mass-produced hexagonal plate armor: honeycomb plates
with raised weld-bead seams, mismatched panel tones, battle grime, and the
occasional gold replacement plate. Purple glowing vent slats near the stern;
yellow hex-cell engine arrays. Hexagon completes Chris's polygon assignment
(Earth rectangle, Krelath triangle, Zandrax hexagon).

Run:  blender --background --python zandrax_fleet.py
"""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "renders", "zandrax")
BLENDDIR = os.path.join(ROOT, "assets", "blender")
os.makedirs(OUTDIR, exist_ok=True)

RED_DARK = (0.240, 0.028, 0.018, 1.0)
RED_LIGHT = (0.400, 0.065, 0.030, 1.0)
GOLD_PLATE = (0.62, 0.40, 0.08, 1.0)
WELD_DARK = (0.030, 0.022, 0.020, 1.0)
WINDOW_COL = (1.0, 0.85, 0.15, 1.0)      # yellow windows
HIGHLIGHT_COL = (0.62, 0.10, 1.0, 1.0)   # purple highlights
GLOW_COL = (1.0, 0.80, 0.05, 1.0)        # yellow engine glow

HEX_R = 0.95             # hex plate circumradius
SEAM_LO = 0.84           # weld band (fraction of the hex inradius)
SEAM_HI = 1.00
WINDOW_EMIT = 3.6
GLOW_EMIT = 2.88
VENT_EMIT = 1.96
GOLD_FRACTION = 0.87     # panel-tone above this becomes a gold plate

HULLS = {
    "Zandrax Frigate": "zandrax_frigate",
    "Zandrax Destroyer": "zandrax_destroyer",
    "Zandrax Light Cruiser": "zandrax_light_cruiser",
    "Zandrax Heavy Cruiser": "zandrax_heavy_cruiser",
    "Zandrax Battleship": "zandrax_battleship",
    "Zandrax Corvette": "zandrax_corvette",
}


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


def const_mul(nodes, links, sock, k):
    m = nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    m.inputs[1].default_value = k
    links.new(sock, m.inputs[0])
    return m.outputs[0]


def const_add(nodes, links, sock, k):
    m = nodes.new("ShaderNodeMath")
    m.operation = "ADD"
    m.inputs[1].default_value = k
    links.new(sock, m.inputs[0])
    return m.outputs[0]


def wrap_center(nodes, links, sock, period):
    """mod(v, period) - period/2"""
    m = nodes.new("ShaderNodeMath")
    m.operation = "MODULO"
    m.inputs[1].default_value = period
    links.new(sock, m.inputs[0])
    # MODULO can return negatives; wrap into [0, period)
    m2 = nodes.new("ShaderNodeMath")
    m2.operation = "ADD"
    m2.inputs[1].default_value = period
    links.new(m.outputs[0], m2.inputs[0])
    m3 = nodes.new("ShaderNodeMath")
    m3.operation = "MODULO"
    m3.inputs[1].default_value = period
    links.new(m2.outputs[0], m3.inputs[0])
    return const_add(nodes, links, m3.outputs[0], -period / 2)


def hexdist(nodes, links, u, v):
    """hex support metric: max of |projections| on edge normals 0/60/120 deg"""
    d = None
    for ang in (0.0, 60.0, 120.0):
        a = math.radians(ang)
        px = const_mul(nodes, links, u, math.cos(a))
        py = const_mul(nodes, links, v, math.sin(a))
        s = combine(nodes, links, "ADD", px, py)
        ab = nodes.new("ShaderNodeMath")
        ab.operation = "ABSOLUTE"
        links.new(s, ab.inputs[0])
        d = ab.outputs[0] if d is None else combine(nodes, links, "MAXIMUM",
                                                    d, ab.outputs[0])
    return d


def hex_lattice(nodes, links, u_sock, v_sock, R):
    """distance (hex metric) to the nearest honeycomb cell centre"""
    w = math.sqrt(3.0) * R
    h = 3.0 * R
    d = None
    for ox, oy in ((0.0, 0.0), (w / 2, h / 2)):
        uu = wrap_center(nodes, links, const_add(nodes, links, u_sock, ox), w)
        vv = wrap_center(nodes, links, const_add(nodes, links, v_sock, oy), h)
        dd = hexdist(nodes, links, uu, vv)
        d = dd if d is None else combine(nodes, links, "MINIMUM", d, dd)
    return d  # boundary sits at sqrt(3)/2 * R


def blend_fac(nodes, links, a_sock, b_sock, lo=-0.02, hi=0.02):
    aa = nodes.new("ShaderNodeMath")
    aa.operation = "ABSOLUTE"
    links.new(a_sock, aa.inputs[0])
    ab = nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    links.new(b_sock, ab.inputs[0])
    df = combine(nodes, links, "SUBTRACT", ab.outputs[0], aa.outputs[0])
    mr = nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = lo
    mr.inputs["From Max"].default_value = hi
    mr.clamp = True
    links.new(df, mr.inputs["Value"])
    return mr.outputs["Result"]


def mix_val(nodes, links, a, b, fac):
    m = nodes.new("ShaderNodeMix")
    m.data_type = "FLOAT"
    links.new(fac, m.inputs["Factor"])
    links.new(a, m.inputs["A"])
    links.new(b, m.inputs["B"])
    return m.outputs["Result"]


def hex_lattice_tp(nodes, links, sep_, nsep_, R):
    d_xy = hex_lattice(nodes, links, sep_.outputs["X"], sep_.outputs["Y"], R)
    d_yz = hex_lattice(nodes, links, sep_.outputs["Y"], sep_.outputs["Z"], R)
    d_xz = hex_lattice(nodes, links, sep_.outputs["X"], sep_.outputs["Z"], R)
    # asymmetric tie-break: exact 45-degree chamfers pick d_xy decisively
    f1 = blend_fac(nodes, links, nsep_.outputs["Z"], nsep_.outputs["X"],
                   lo=0.0, hi=0.04)
    d = mix_val(nodes, links, d_xy, d_yz, f1)
    nxa = nodes.new("ShaderNodeMath")
    nxa.operation = "ABSOLUTE"
    links.new(nsep_.outputs["X"], nxa.inputs[0])
    nza = nodes.new("ShaderNodeMath")
    nza.operation = "ABSOLUTE"
    links.new(nsep_.outputs["Z"], nza.inputs[0])
    mx = combine(nodes, links, "MAXIMUM", nxa.outputs[0], nza.outputs[0])
    f2 = blend_fac(nodes, links, mx, nsep_.outputs["Y"], lo=0.15, hi=0.25)
    return mix_val(nodes, links, d, d_xz, f2)


def build_ship(hull, slug):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models",
                                                hull + ".stl"))
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
    hw = float(dims[0]) / 2
    ymin, ymax = float(V[:, 1].min()), float(V[:, 1].max())
    central_w = max(2.2, 0.45 * hw)
    r_in = math.sqrt(3.0) / 2 * HEX_R

    # ---------------- hull material ----------------
    mat_hull, nt, bsdf = new_mat("Zandrax Plate")
    nodes, links = nt.nodes, nt.links
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs[0])
    geom = nodes.new("ShaderNodeNewGeometry")
    nsep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geom.outputs["Normal"], nsep.inputs[0])

    hexd = hex_lattice_tp(nodes, links, sep, nsep, HEX_R)
    weld = band(nodes, links, hexd, SEAM_LO * r_in, SEAM_HI * r_in)

    # raised weld bead + hammered surface noise
    hammer = nodes.new("ShaderNodeTexNoise")
    hammer.inputs["Scale"].default_value = 3.0
    hammer.inputs["Detail"].default_value = 2.0
    links.new(coord.outputs["Object"], hammer.inputs["Vector"])
    hn = const_mul(nodes, links, hammer.outputs["Fac"], 0.12)
    height = combine(nodes, links, "ADD",
                     const_mul(nodes, links, weld, 0.6), hn)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    links.new(height, bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # mismatched panel tones + rare gold replacement plates + grime
    tonev = nodes.new("ShaderNodeTexVoronoi")
    tonev.voronoi_dimensions = "3D"
    tonev.feature = "F1"
    tonev.inputs["Scale"].default_value = 1.0 / (HEX_R * 1.6)
    tonev.inputs["Randomness"].default_value = 0.35
    links.new(coord.outputs["Object"], tonev.inputs["Vector"])
    tbw = nodes.new("ShaderNodeRGBToBW")
    links.new(tonev.outputs["Color"], tbw.inputs[0])
    tone = nodes.new("ShaderNodeMix")
    tone.data_type = "RGBA"
    tone.inputs["A"].default_value = RED_DARK
    tone.inputs["B"].default_value = RED_LIGHT
    links.new(tbw.outputs[0], tone.inputs["Factor"])
    is_gold = nodes.new("ShaderNodeMath")
    is_gold.operation = "GREATER_THAN"
    is_gold.inputs[1].default_value = GOLD_FRACTION
    links.new(tbw.outputs[0], is_gold.inputs[0])
    gmix = nodes.new("ShaderNodeMix")
    gmix.data_type = "RGBA"
    gmix.inputs["B"].default_value = GOLD_PLATE
    links.new(is_gold.outputs[0], gmix.inputs["Factor"])
    links.new(tone.outputs["Result"], gmix.inputs["A"])
    grime = nodes.new("ShaderNodeTexNoise")
    grime.inputs["Scale"].default_value = 0.18
    grime.inputs["Detail"].default_value = 4.0
    links.new(coord.outputs["Object"], grime.inputs["Vector"])
    gr = nodes.new("ShaderNodeMapRange")
    gr.inputs["To Min"].default_value = 0.42
    gr.inputs["To Max"].default_value = 1.0
    links.new(grime.outputs["Fac"], gr.inputs["Value"])
    dirty = nodes.new("ShaderNodeMix")
    dirty.data_type = "RGBA"
    dirty.blend_type = "MULTIPLY"
    dirty.inputs["Factor"].default_value = 1.0
    links.new(gmix.outputs["Result"], dirty.inputs["A"])
    gcol = nodes.new("ShaderNodeCombineColor")
    links.new(gr.outputs["Result"], gcol.inputs["Red"])
    links.new(gr.outputs["Result"], gcol.inputs["Green"])
    links.new(gr.outputs["Result"], gcol.inputs["Blue"])
    links.new(gcol.outputs["Color"], dirty.inputs["B"])
    wdark = nodes.new("ShaderNodeMix")
    wdark.data_type = "RGBA"
    wdark.inputs["B"].default_value = WELD_DARK
    links.new(weld, wdark.inputs["Factor"])
    links.new(dirty.outputs["Result"], wdark.inputs["A"])
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
    links.new(wdark.outputs["Result"], mmix.inputs["A"])
    links.new(mcol.outputs["Color"], mmix.inputs["B"])
    links.new(mmix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.45
    rmap = nodes.new("ShaderNodeMapRange")
    rmap.inputs["To Min"].default_value = 0.50
    rmap.inputs["To Max"].default_value = 0.72
    links.new(tbw.outputs[0], rmap.inputs["Value"])
    links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])

    # windows (yellow) on central flanks; vents (purple) near the stern
    nax = nodes.new("ShaderNodeMath")
    nax.operation = "ABSOLUTE"
    links.new(nsep.outputs["X"], nax.inputs[0])
    flank = nodes.new("ShaderNodeMath")
    flank.operation = "GREATER_THAN"
    flank.inputs[1].default_value = 0.40
    links.new(nax.outputs[0], flank.inputs[0])
    naz = nodes.new("ShaderNodeMath")
    naz.operation = "ABSOLUTE"
    links.new(nsep.outputs["Z"], naz.inputs[0])
    wflat = nodes.new("ShaderNodeMath")
    wflat.operation = "LESS_THAN"
    wflat.inputs[1].default_value = 0.55
    links.new(naz.outputs[0], wflat.inputs[0])
    outb = nodes.new("ShaderNodeMath")
    outb.operation = "MULTIPLY"
    links.new(sep.outputs["X"], outb.inputs[0])
    links.new(nsep.outputs["X"], outb.inputs[1])
    outward = nodes.new("ShaderNodeMath")
    outward.operation = "GREATER_THAN"
    outward.inputs[1].default_value = 0.0
    links.new(outb.outputs[0], outward.inputs[0])
    xab = nodes.new("ShaderNodeMath")
    xab.operation = "ABSOLUTE"
    links.new(sep.outputs["X"], xab.inputs[0])
    central = nodes.new("ShaderNodeMath")
    central.operation = "LESS_THAN"
    central.inputs[1].default_value = central_w
    links.new(xab.outputs[0], central.inputs[0])

    wu = nodes.new("ShaderNodeMath")
    wu.operation = "FRACT"
    links.new(const_mul(nodes, links, sep.outputs["Y"], 0.55), wu.inputs[0])
    wcell = band(nodes, links, wu.outputs[0], 0.30, 0.52)
    wz = band(nodes, links, sep.outputs["Z"], -0.5, 0.3)
    wspan = band(nodes, links, sep.outputs["Y"], ymin + 0.20 * L,
                 ymax - 0.30 * L)
    wmask = combine(nodes, links, "MULTIPLY", wcell, wz)
    for gate in (flank.outputs[0], wspan, wflat.outputs[0],
                 outward.outputs[0], central.outputs[0]):
        wmask = combine(nodes, links, "MULTIPLY", wmask, gate)

    vz = nodes.new("ShaderNodeMath")
    vz.operation = "FRACT"
    links.new(const_mul(nodes, links, sep.outputs["Z"], 1.0 / 0.6),
              vz.inputs[0])
    vslat = band(nodes, links, vz.outputs[0], 0.25, 0.55)
    vent = combine(nodes, links, "MULTIPLY",
                   band(nodes, links, sep.outputs["Y"],
                        ymin + 1.0, ymin + 2.4),
                   vslat)
    for gate in (flank.outputs[0],
                 band(nodes, links, sep.outputs["Z"], -2.5, 2.5),
                 outward.outputs[0], central.outputs[0]):
        vent = combine(nodes, links, "MULTIPLY", vent, gate)

    we = const_mul(nodes, links, wmask, WINDOW_EMIT)
    ve = const_mul(nodes, links, vent, VENT_EMIT)
    ecol = nodes.new("ShaderNodeMix")
    ecol.data_type = "RGBA"
    ecol.inputs["A"].default_value = WINDOW_COL
    ecol.inputs["B"].default_value = HIGHLIGHT_COL
    links.new(vent, ecol.inputs["Factor"])
    links.new(ecol.outputs["Result"], bsdf.inputs["Emission Color"])
    links.new(combine(nodes, links, "ADD", we, ve),
              bsdf.inputs["Emission Strength"])

    # ---------------- engine hex array (yellow) ----------------
    mat_engine, ent, eb = new_mat("Zandrax Engine Array")
    en, el = ent.nodes, ent.links
    eb.inputs["Base Color"].default_value = WELD_DARK
    eb.inputs["Metallic"].default_value = 0.4
    eb.inputs["Roughness"].default_value = 0.5
    ecoord = en.new("ShaderNodeTexCoord")
    esep = en.new("ShaderNodeSeparateXYZ")
    el.new(ecoord.outputs["Object"], esep.inputs[0])
    ehex = hex_lattice(en, el, esep.outputs["X"], esep.outputs["Z"], 0.8)
    er_in = math.sqrt(3.0) / 2 * 0.8
    ecell = en.new("ShaderNodeMath")
    ecell.operation = "LESS_THAN"
    ecell.inputs[1].default_value = 0.80 * er_in
    el.new(ehex, ecell.inputs[0])
    estr = const_mul(en, el, ecell.outputs[0], GLOW_EMIT)
    eb.inputs["Emission Color"].default_value = GLOW_COL
    el.new(estr, eb.inputs["Emission Strength"])

    me.materials.clear()
    for m in (mat_hull, mat_engine):
        me.materials.append(m)
    S_HULL, S_ENGINE = 0, 1

    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    eng_cand = [f.index for f in bm.faces
                if f.normal.y < -0.45
                and f.calc_center_median().y < ymin + 0.25 * L]
    eset = set(eng_cand)
    eparent = {i: i for i in eng_cand}

    def efind(i):
        while eparent[i] != i:
            eparent[i] = eparent[eparent[i]]
            i = eparent[i]
        return i

    for i in eng_cand:
        for e in bm.faces[i].edges:
            for g in e.link_faces:
                if g.index in eset and g.index != i:
                    a, b = efind(i), efind(g.index)
                    if a != b:
                        eparent[b] = a
    eclusters = {}
    for i in eng_cand:
        eclusters.setdefault(efind(i), []).append(i)
    engine_faces = set()
    for root, idxs in eclusters.items():
        if sum(bm.faces[i].calc_area() for i in idxs) > max(
                0.4, 1.2 * (L / 50.0) ** 2):
            engine_faces.update(idxs)
    if not engine_faces:
        # chevron hulls (Corvette): trailing faces sit mid-hull, so widen the
        # window - the rearmost flat rear-facing cluster is the engine
        cand2 = [(f.index, f.calc_center_median().y) for f in bm.faces
                 if f.normal.y < -0.85
                 and f.calc_center_median().y < ymin + 0.55 * L]
        if cand2:
            y_rear = min(y for _, y in cand2)
            engine_faces = {i for i, y in cand2 if y < y_rear + 1.5}
    bm.free()

    n_eng = 0
    for p in me.polygons:
        if p.index in engine_faces:
            p.material_index = S_ENGINE
            n_eng += 1
        else:
            p.material_index = S_HULL
    print("%s: engine=%d tris=%d" % (slug, n_eng, len(me.polygons)))

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

    add_sun("Key", 4.0, 55, 35, (1.0, 0.96, 0.9))
    add_sun("Fill", 2.6, -60, -130, (0.9, 0.85, 0.85))
    add_sun("Rim", 2.2, 15, 180, (1.0, 0.9, 0.85))
    add_sun("Under", 0.9, -125, 40, (0.9, 0.85, 0.85))
    world = bpy.data.worlds.new("Space")
    world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links
    wcoord = wn.new("ShaderNodeTexCoord")
    wmap = wn.new("ShaderNodeMapping")
    wmap.inputs["Rotation"].default_value = (0, math.radians(-90), 0)
    wgrad = wn.new("ShaderNodeTexGradient")
    wramp = wn.new("ShaderNodeValToRGB")
    wramp.color_ramp.elements[0].color = (0.004, 0.005, 0.009, 1)
    wramp.color_ramp.elements[1].color = (0.05, 0.04, 0.045, 1)
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
        "front_quarter": ((size * 1.12, size * 1.176, size * 0.616), (0, 0, 0)),
        "rear_quarter": ((size * 1.064, -size * 1.232, size * 0.504), (0, 0, 0)),
        "side": ((size * 1.68, 0, size * 0.1344), (0, 0, 0)),
        "top": ((0.01, 0.01, size * 1.904), (0, 0, 0)),
        "stern_close": ((size * 0.56, -size * 1.288, -size * 0.112),
                        (0, ymin * 0.8, 0)),
        "detail_bow": ((size * 0.672, size * 0.84, size * 0.336),
                       (0, ymax * 0.6, 1)),
    }
    for label, (loc, tgt) in views.items():
        look(loc, tgt)
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s.png" % (slug, label))
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=os.path.join(BLENDDIR, slug + ".blend"))


for hull, slug in HULLS.items():
    build_ship(hull, slug)
print("ZANDRAX_FLEET_DONE")
