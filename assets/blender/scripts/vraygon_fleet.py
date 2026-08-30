"""Vraygon Star Realm fleet build - texture and glow pass ONLY (per Chris:
no greebles, no added geometry of any kind).

Canon: gold base, blue accents, orange windows, red highlights, orange
engine glow. The ships ARE faceted crystal - facets stay flat-shaded and
each facet-cell gets its own tone; a crystal shatter lattice (Voronoi,
randomness 1) carves seams that glow faintly red-orange like light inside
the crystal. A scattering of facets reads as blue crystal inclusions.

Run:  blender --background --python vraygon_fleet.py
"""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTDIR = os.path.join(ROOT, "assets", "blender", "renders", "vraygon")
BLENDDIR = os.path.join(ROOT, "assets", "blender")
os.makedirs(OUTDIR, exist_ok=True)

GOLD_DARK = (0.28, 0.155, 0.030, 1.0)
GOLD_LIGHT = (0.63, 0.42, 0.10, 1.0)
BLUE_CRYSTAL = (0.045, 0.16, 0.52, 1.0)
SEAM_DARK = (0.10, 0.05, 0.01, 1.0)
VEIN_COL = (1.0, 0.10, 0.02, 1.0)       # red highlights in the seams
WINDOW_COL = (1.0, 0.42, 0.06, 1.0)     # orange windows
GLOW_COL = (1.0, 0.30, 0.015, 1.0)      # orange engine glow

CRYSTAL_SCALE = 0.30     # shatter cell density
SEAM_W = 0.07
WINDOW_EMIT = 3.6
GLOW_EMIT = 3.52
VEIN_EMIT = 0.10
BLUE_FRACTION = 0.90     # facets with cell-tone above this go blue

HULLS = {
    "Vraygon Frigate": "vraygon_frigate",
    "Vraygon Destroyer": "vraygon_destroyer",
    "Vraygon Light Cruiser": "vraygon_light_cruiser",
    "Vraygon Heavy Cruiser": "vraygon_heavy_cruiser",
    "Vraygon Battleship": "vraygon_battleship",
    "Vraygon Monitor": "vraygon_monitor",
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

    # ---------------- crystal hull material ----------------
    mat_hull, nt, bsdf = new_mat("Vraygon Crystal")
    nodes, links = nt.nodes, nt.links
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs[0])
    geom = nodes.new("ShaderNodeNewGeometry")
    nsep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geom.outputs["Normal"], nsep.inputs[0])

    # shatter cells: per-cell tone + distance-to-edge seams (3D - no smear)
    vor = nodes.new("ShaderNodeTexVoronoi")
    vor.voronoi_dimensions = "3D"
    vor.feature = "F1"
    vor.inputs["Scale"].default_value = CRYSTAL_SCALE
    vor.inputs["Randomness"].default_value = 1.0
    links.new(coord.outputs["Object"], vor.inputs["Vector"])
    vbw = nodes.new("ShaderNodeRGBToBW")
    links.new(vor.outputs["Color"], vbw.inputs[0])

    edge = nodes.new("ShaderNodeTexVoronoi")
    edge.voronoi_dimensions = "3D"
    edge.feature = "DISTANCE_TO_EDGE"
    edge.inputs["Scale"].default_value = CRYSTAL_SCALE
    edge.inputs["Randomness"].default_value = 1.0
    links.new(coord.outputs["Object"], edge.inputs["Vector"])
    seam = nodes.new("ShaderNodeMapRange")
    seam.inputs["From Max"].default_value = SEAM_W
    seam.clamp = True
    links.new(edge.outputs["Distance"], seam.inputs["Value"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.5
    links.new(seam.outputs["Result"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # facet tones: dark amber -> pale gold, with rare blue inclusions
    tone = nodes.new("ShaderNodeMix")
    tone.data_type = "RGBA"
    tone.inputs["A"].default_value = GOLD_DARK
    tone.inputs["B"].default_value = GOLD_LIGHT
    links.new(vbw.outputs[0], tone.inputs["Factor"])
    is_blue = nodes.new("ShaderNodeMath")
    is_blue.operation = "GREATER_THAN"
    is_blue.inputs[1].default_value = BLUE_FRACTION
    links.new(vbw.outputs[0], is_blue.inputs[0])
    bmix = nodes.new("ShaderNodeMix")
    bmix.data_type = "RGBA"
    bmix.inputs["B"].default_value = BLUE_CRYSTAL
    links.new(is_blue.outputs[0], bmix.inputs["Factor"])
    links.new(tone.outputs["Result"], bmix.inputs["A"])
    sdark = nodes.new("ShaderNodeMix")
    sdark.data_type = "RGBA"
    sdark.inputs["A"].default_value = SEAM_DARK
    links.new(bmix.outputs["Result"], sdark.inputs["B"])
    links.new(seam.outputs["Result"], sdark.inputs["Factor"])
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
    links.new(sdark.outputs["Result"], mmix.inputs["A"])
    links.new(mcol.outputs["Color"], mmix.inputs["B"])
    links.new(mmix.outputs["Result"], bsdf.inputs["Base Color"])

    bsdf.inputs["Metallic"].default_value = 0.55
    rmap = nodes.new("ShaderNodeMapRange")
    rmap.inputs["To Min"].default_value = 0.14
    rmap.inputs["To Max"].default_value = 0.38
    links.new(vbw.outputs[0], rmap.inputs["Value"])
    links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])
    try:
        bsdf.inputs["Coat Weight"].default_value = 0.5
    except KeyError:
        pass

    # windows: orange cells on the central flanks
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
    wz = band(nodes, links, sep.outputs["Z"], -1.0, 0.6)
    wspan = band(nodes, links, sep.outputs["Y"], ymin + 0.20 * L,
                 ymax - 0.30 * L)
    wmask = combine(nodes, links, "MULTIPLY", wcell, wz)
    for gate in (flank.outputs[0], wspan, wflat.outputs[0],
                 outward.outputs[0], central.outputs[0]):
        wmask = combine(nodes, links, "MULTIPLY", wmask, gate)

    # emission: orange windows + faint red vein glow in the seams
    vein = nodes.new("ShaderNodeMath")
    vein.operation = "SUBTRACT"
    vein.inputs[0].default_value = 1.0
    links.new(seam.outputs["Result"], vein.inputs[1])
    ve = const_mul(nodes, links, vein.outputs[0], VEIN_EMIT)
    we = const_mul(nodes, links, wmask, WINDOW_EMIT)
    ecol = nodes.new("ShaderNodeMix")
    ecol.data_type = "RGBA"
    ecol.inputs["A"].default_value = VEIN_COL
    ecol.inputs["B"].default_value = WINDOW_COL
    links.new(wmask, ecol.inputs["Factor"])
    links.new(ecol.outputs["Result"], bsdf.inputs["Emission Color"])
    links.new(combine(nodes, links, "ADD", we, ve),
              bsdf.inputs["Emission Strength"])

    # ---------------- engine crystal array ----------------
    mat_engine, ent, eb = new_mat("Vraygon Engine Array")
    en, el = ent.nodes, ent.links
    eb.inputs["Base Color"].default_value = SEAM_DARK
    eb.inputs["Metallic"].default_value = 0.4
    eb.inputs["Roughness"].default_value = 0.4
    ecoord = en.new("ShaderNodeTexCoord")
    eedge = en.new("ShaderNodeTexVoronoi")
    eedge.voronoi_dimensions = "3D"
    eedge.feature = "DISTANCE_TO_EDGE"
    eedge.inputs["Scale"].default_value = 0.9
    eedge.inputs["Randomness"].default_value = 1.0
    el.new(ecoord.outputs["Object"], eedge.inputs["Vector"])
    ecell = en.new("ShaderNodeMath")
    ecell.operation = "GREATER_THAN"
    ecell.inputs[1].default_value = 0.14
    el.new(eedge.outputs["Distance"], ecell.inputs[0])
    estr = const_mul(en, el, ecell.outputs[0], GLOW_EMIT)
    eb.inputs["Emission Color"].default_value = GLOW_COL
    el.new(estr, eb.inputs["Emission Strength"])

    me.materials.clear()
    for m in (mat_hull, mat_engine):
        me.materials.append(m)
    S_HULL, S_ENGINE = 0, 1

    # engine faces: rear-facing clusters in the aft third
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    # crystal stern facets are angled, never flat-aft: loose normal gate,
    # tight aft gate
    eng_cand = [f.index for f in bm.faces
                if f.normal.y < -0.55
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
    min_area = max(1.5, 4.0 * (L / 57.0) ** 2)
    engine_faces = set()
    for root, idxs in eclusters.items():
        if sum(bm.faces[i].calc_area() for i in idxs) > min_area:
            engine_faces.update(idxs)
    bm.free()

    n_eng = 0
    for p in me.polygons:
        if p.index in engine_faces:
            p.material_index = S_ENGINE
            n_eng += 1
        else:
            p.material_index = S_HULL
    print("%s: engine=%d tris=%d" % (slug, n_eng, len(me.polygons)))
    # crystal ships stay flat-shaded: the faceting IS the species

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

    add_sun("Key", 4.0, 55, 35, (1.0, 0.96, 0.88))
    add_sun("Fill", 2.6, -60, -130, (0.85, 0.88, 1.0))
    add_sun("Rim", 2.2, 15, 180, (1.0, 0.95, 0.85))
    add_sun("Under", 0.9, -125, 40, (0.85, 0.88, 1.0))
    world = bpy.data.worlds.new("Space")
    world.use_nodes = True
    wn, wl = world.node_tree.nodes, world.node_tree.links
    wcoord = wn.new("ShaderNodeTexCoord")
    wmap = wn.new("ShaderNodeMapping")
    wmap.inputs["Rotation"].default_value = (0, math.radians(-90), 0)
    wgrad = wn.new("ShaderNodeTexGradient")
    wramp = wn.new("ShaderNodeValToRGB")
    wramp.color_ramp.elements[0].color = (0.004, 0.005, 0.009, 1)
    wramp.color_ramp.elements[1].color = (0.045, 0.045, 0.06, 1)
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
print("VRAYGON_FLEET_DONE")
