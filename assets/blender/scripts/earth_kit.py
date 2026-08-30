"""Earth Federation material kit v3 - Earth Battleship.

Geometry-driven rather than hand-tuned: surface patches (flood fill across
edges under 30 deg) identify the saucer brim, engine collar rings and the
dorsal torpedo pod, and raycasts find real surface contact points for every
added fitting. Numbers come from diag_bow.py.

v3 revisions (per Chris):
- turrets at the sphere's top AND bottom poles
- all fittings raycast onto the hull so nothing floats
- broadside missile ports circular and clamped to the mid-hull cylinder
- torpedo pod re-detailed: circular tubes + rectangular windows, flanks only
- saucer brim silver resolved by patch identity (no coordinate guessing)
- glowing heat vents, antenna masts, greeble plates
- panel plating is a faction-parameterized lattice (Earth: rectangular)

Run:  blender --background --python earth_kit.py
"""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np
from collections import Counter

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models", "Earth Battleship.stl")
OUTDIR = os.path.join(ROOT, "assets", "blender", "renders", "earth")
BLEND = os.path.join(ROOT, "assets", "blender", "earth.blend")
os.makedirs(OUTDIR, exist_ok=True)

# ---------------- faction parameters ----------------
# Panel lattice: Voronoi randomness 0 gives regular cells, 1 gives the crystal
# shatter. Earth/Krelath/Zandrax take regular polygons, Vraygon the crystal.
PATTERN = "rect"
RANDOMNESS = {"rect": 0.0, "crystal": 1.0}[PATTERN]
PANEL_SCALE = 0.85
PANEL_ASPECT = (1.0, 0.62, 1.0)   # anisotropy -> oblong plates, not cubes
PANEL_BUMP = 0.30
SEAM_WIDTH = 0.06

BLUE = (0.028, 0.085, 0.28, 1.0)
BLUE_LIGHT = (0.045, 0.125, 0.37, 1.0)
SILVER = (0.82, 0.84, 0.86, 1.0)
WINDOW_COL = (0.7, 0.85, 1.0, 1.0)
GLOW_COL = (1.0, 0.16, 0.015, 1.0)
GUNMETAL = (0.06, 0.065, 0.075, 1.0)

WINDOW_ROWS = [(-2.6, -1.6), (1.6, 2.6)]
WINDOW_Y_MIN = -2.0
WINDOW_FREQ_Y = 0.9
WINDOW_EMIT = 4.0
GLOW_EMIT = 1.1
TORP_EMIT = 1.5
BAY_EMIT = 0.7
VENT_EMIT = 1.4
STRIPE_BANDS = [(-10.3, -8.3)]
PORT_Y_RANGE = (-3.6, 1.2)   # stop short of the sphere junction
TUBE_Y = (-7.0, -8.35)       # exactly two torpedo tubes per flank
NAV_Y = (-6.7, -19.4)        # nav light stations on the engine body

# ---------------- import + repair ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]
obj.name = "EarthBattleship"
me = obj.data

xs = [v.co.x for v in me.vertices]
ys = [v.co.y for v in me.vertices]
zs = [v.co.z for v in me.vertices]
center = mathutils.Vector((
    (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2))
me.transform(mathutils.Matrix.Translation(-center))

bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me)
bm.free()

# ---------------- fits + patch analysis ----------------
V = np.array([list(v.co) for v in me.vertices])
pts = V[(V[:, 1] > 8.0) & (np.abs(V[:, 2]) > 5.0)]
A = np.c_[pts * 2, np.ones(len(pts))]
sol, *_ = np.linalg.lstsq(A, (pts ** 2).sum(axis=1), rcond=None)
scx, scy, scz = sol[:3]
srad = math.sqrt(sol[3] + scx ** 2 + scy ** 2 + scz ** 2)
print("SPHERE (%.2f,%.2f,%.2f) r=%.2f" % (scx, scy, scz, srad))

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

brim_faces = set()
ring_faces = set()
n_brim = n_ring = 0
for root, faces in groups.items():
    cs = [f.calc_center_median() for f in faces]
    area = sum(f.calc_area() for f in faces)
    zex = max(c.z for c in cs) - min(c.z for c in cs)
    yex = max(c.y for c in cs) - min(c.y for c in cs)
    rh = [math.sqrt((c.x - scx) ** 2 + (c.y - scy) ** 2) for c in cs]
    # Saucer brim: a thin annulus concentric with the sphere. It must both
    # start at the sphere's radius (min rh ~ srad, which excludes every aft
    # patch, since those sit far off the sphere axis) and reach well beyond
    # it (max rh, which excludes the sphere itself).
    if (area > 5.0 and zex < 4.0
            and min(rh) < srad + 0.5 and max(rh) > srad + 2.5):
        n_brim += 1
        for f in faces:
            brim_faces.add(f.index)
        continue
    # collar/hull rings: short radial bands standing proud of a barrel
    if area > 0.8 and yex < 1.6:
        mny = sum(abs(f.normal.y) * f.calc_area() for f in faces) / area
        if mny <= 0.30:
            n_ring += 1
            for f in faces:
                ring_faces.add(f.index)

# dorsal torpedo pod: the patch owning the highest face in the pod's y window
pod_faces = set()
best = None
for f in bm.faces:
    c = f.calc_center_median()
    if -16.0 < c.y < -5.0 and (best is None or c.z > best[0]):
        best = (c.z, f.index)
if best:
    pf = groups[find(best[1])]
    pod_faces = {f.index for f in pf}
    pc = [f.calc_center_median() for f in pf]
    print("POD bbox x=[%.2f,%.2f] y=[%.2f,%.2f] z=[%.2f,%.2f]"
          % (min(c.x for c in pc), max(c.x for c in pc),
             min(c.y for c in pc), max(c.y for c in pc),
             min(c.z for c in pc), max(c.z for c in pc)))
print("PATCHES brim=%d(%df) ring=%d(%df) pod=%df"
      % (n_brim, len(brim_faces), n_ring, len(ring_faces), len(pod_faces)))

# stern bulkhead plane (modal rear-facing y station)
cand = [round(p.center.y * 2) / 2 for p in me.polygons
        if p.normal.y < -0.9 and -21.5 < p.center.y < -13]
bay_y = Counter(cand).most_common(1)[0][0] if cand else None
bm.free()


# ---------------- material helpers ----------------
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
    """circular mask: u^2 + v^2 < radius^2"""
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
    """centered sawtooth: signed offset from the middle of each cell"""
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


def panel_lattice(nodes, links, coord, randomness):
    """Regular (randomness 0) or crystalline (randomness 1) plate lattice.
    Returns (tone_bw, seam_height). Works in 3D, so no projection streaking."""
    mp = nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = tuple(PANEL_SCALE * a for a in PANEL_ASPECT)
    links.new(coord, mp.inputs["Vector"])
    tone = nodes.new("ShaderNodeTexVoronoi")
    tone.voronoi_dimensions = "3D"
    tone.feature = "F1"
    tone.inputs["Scale"].default_value = 1.0
    tone.inputs["Randomness"].default_value = randomness
    links.new(mp.outputs[0], tone.inputs["Vector"])
    bw = nodes.new("ShaderNodeRGBToBW")
    links.new(tone.outputs["Color"], bw.inputs[0])
    edge = nodes.new("ShaderNodeTexVoronoi")
    edge.voronoi_dimensions = "3D"
    edge.feature = "DISTANCE_TO_EDGE"
    edge.inputs["Scale"].default_value = 1.0
    edge.inputs["Randomness"].default_value = randomness
    links.new(mp.outputs[0], edge.inputs["Vector"])
    seam = nodes.new("ShaderNodeMapRange")
    seam.inputs["From Min"].default_value = 0.0
    seam.inputs["From Max"].default_value = SEAM_WIDTH
    seam.inputs["To Min"].default_value = 0.0
    seam.inputs["To Max"].default_value = 1.0
    seam.clamp = True
    links.new(edge.outputs["Distance"], seam.inputs["Value"])
    return bw.outputs[0], seam.outputs["Result"]


# ---------------- hull material ----------------
def build_hull(name, striped):
    mat, nt, bsdf = new_mat(name)
    nodes, links = nt.nodes, nt.links
    coord = nodes.new("ShaderNodeTexCoord")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coord.outputs["Object"], sep.inputs[0])
    geom = nodes.new("ShaderNodeNewGeometry")
    nsep = nodes.new("ShaderNodeSeparateXYZ")
    links.new(geom.outputs["Normal"], nsep.inputs[0])

    tone_bw, seam = panel_lattice(nodes, links, coord.outputs["Object"], RANDOMNESS)
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
        ssum = None
        for lo, hi in STRIPE_BANDS:
            b = band(nodes, links, sep.outputs["Y"], lo, hi)
            ssum = b if ssum is None else combine(nodes, links, "ADD", ssum, b)
        smix = nodes.new("ShaderNodeMix")
        smix.data_type = "RGBA"
        smix.inputs["B"].default_value = SILVER
        links.new(ssum, smix.inputs["Factor"])
        links.new(base_col, smix.inputs["A"])
        base_col = smix.outputs["Result"]

    # side-facing gate, shared by ports and bay doors
    nax = nodes.new("ShaderNodeMath")
    nax.operation = "ABSOLUTE"
    links.new(nsep.outputs["X"], nax.inputs[0])
    pside = nodes.new("ShaderNodeMath")
    pside.operation = "GREATER_THAN"
    pside.inputs[1].default_value = 0.6
    links.new(nax.outputs[0], pside.inputs[0])

    # broadside missile ports: circular, clamped to the r=5 mid-hull cylinder
    # so they cannot bleed onto the neck cone or past the silhouette
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
    on_cyl = band(nodes, links, rad.outputs[0], 4.65, 5.35)
    pu = cell_axis(nodes, links, sep.outputs["Y"], 1.45)
    port_mask = disc(nodes, links, pu, sep.outputs["Z"], 0.40)
    for gate in (band(nodes, links, sep.outputs["Y"], *PORT_Y_RANGE),
                 on_cyl, pside.outputs[0]):
        port_mask = combine(nodes, links, "MULTIPLY", port_mask, gate)
    pdark = nodes.new("ShaderNodeMix")
    pdark.data_type = "RGBA"
    pdark.inputs["B"].default_value = (0.004, 0.004, 0.006, 1.0)
    links.new(port_mask, pdark.inputs["Factor"])
    links.new(base_col, pdark.inputs["A"])
    base_col = pdark.outputs["Result"]

    links.new(base_col, bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = 0.35
    rmap = nodes.new("ShaderNodeMapRange")
    rmap.inputs["To Min"].default_value = 0.38
    rmap.inputs["To Max"].default_value = 0.55
    links.new(tone_bw, rmap.inputs["Value"])
    links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])

    # rectangular windows
    cz = band(nodes, links, cell_axis(nodes, links, sep.outputs["Z"], 0.5), -0.12, 0.08)
    cy = band(nodes, links,
              cell_axis(nodes, links, sep.outputs["Y"], 1.0 / WINDOW_FREQ_Y),
              -0.30, 0.14)
    mask = combine(nodes, links, "MULTIPLY", cz, cy)
    rows = None
    for lo, hi in WINDOW_ROWS:
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
    fwd.inputs[1].default_value = WINDOW_Y_MIN
    links.new(sep.outputs["Y"], fwd.inputs[0])
    for gate in (rows, flat.outputs[0], fwd.outputs[0]):
        mask = combine(nodes, links, "MULTIPLY", mask, gate)
    inv = nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    links.new(port_mask, inv.inputs[1])
    mask = combine(nodes, links, "MULTIPLY", mask, inv.outputs[0])

    # glowing heat-vent louvers on the flanks of the engine body
    vent = combine(nodes, links, "MULTIPLY",
                   band(nodes, links, sep.outputs["Y"], -20.6, -19.6),
                   band(nodes, links,
                        cell_axis(nodes, links, sep.outputs["Z"], 0.55),
                        -0.16, 0.06))
    vent = combine(nodes, links, "MULTIPLY", vent, pside.outputs[0])

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


mat_clean = build_hull("Earth Hull Blue", striped=False)
mat_striped = build_hull("Earth Hull Blue Striped", striped=True)

# ---------------- accent, glow, pod, machinery ----------------
mat_silver, _, sb = new_mat("Earth Accent Silver")
sb.inputs["Base Color"].default_value = SILVER
sb.inputs["Metallic"].default_value = 0.7
sb.inputs["Roughness"].default_value = 0.42

mat_glow, _, gb = new_mat("Earth Engine Glow")
gb.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
gb.inputs["Emission Color"].default_value = GLOW_COL
gb.inputs["Emission Strength"].default_value = GLOW_EMIT

# torpedo pod flanks: circular tubes + rectangular windows, port/starboard only
mat_torp, tnt, tb = new_mat("Earth Torpedo Pod")
tn, tl = tnt.nodes, tnt.links
tcoord = tn.new("ShaderNodeTexCoord")
tsep = tn.new("ShaderNodeSeparateXYZ")
tl.new(tcoord.outputs["Object"], tsep.inputs[0])
tgeo = tn.new("ShaderNodeNewGeometry")
tnsep = tn.new("ShaderNodeSeparateXYZ")
tl.new(tgeo.outputs["Normal"], tnsep.inputs[0])
ttone, tseam = panel_lattice(tn, tl, tcoord.outputs["Object"], RANDOMNESS)
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
tzc = tn.new("ShaderNodeMath")
tzc.operation = "SUBTRACT"
tzc.inputs[1].default_value = 4.45
tl.new(tsep.outputs["Z"], tzc.inputs[0])
tspan = band(tn, tl, tsep.outputs["Y"], -14.35, -5.9)
# exactly two tubes per flank at fixed stations - no repeating cell, so no
# half-tube clipped at the pod's fore end
tube = None
for ty in TUBE_Y:
    tu = tn.new("ShaderNodeMath")
    tu.operation = "SUBTRACT"
    tu.inputs[1].default_value = ty
    tl.new(tsep.outputs["Y"], tu.inputs[0])
    d = disc(tn, tl, tu.outputs[0], tzc.outputs[0], 0.33)
    tube = d if tube is None else combine(tn, tl, "ADD", tube, d)
tube = combine(tn, tl, "MULTIPLY", tube, tside.outputs[0])
# windows at explicit stations on the straight flank only - a repeating cell
# wrapped onto the curved end caps and left half-windows there
tnay2 = tn.new("ShaderNodeMath")
tnay2.operation = "ABSOLUTE"
tl.new(tnsep.outputs["Y"], tnay2.inputs[0])
tflat = tn.new("ShaderNodeMath")
tflat.operation = "LESS_THAN"
tflat.inputs[1].default_value = 0.35
tl.new(tnay2.outputs[0], tflat.inputs[0])
twin_z = band(tn, tl, tsep.outputs["Z"], 5.28, 5.62)
twin = None
for wy in (-13.2, -12.2, -11.2, -10.2, -9.2):
    w = band(tn, tl, tsep.outputs["Y"], wy - 0.2, wy + 0.2)
    twin = w if twin is None else combine(tn, tl, "ADD", twin, w)
twin = combine(tn, tl, "MULTIPLY", twin, twin_z)
twin = combine(tn, tl, "MULTIPLY", twin, tside.outputs[0])
twin = combine(tn, tl, "MULTIPLY", twin, tflat.outputs[0])
tube = combine(tn, tl, "MULTIPLY", tube, tflat.outputs[0])
tdark = tn.new("ShaderNodeMix")
tdark.data_type = "RGBA"
tdark.inputs["B"].default_value = (0.004, 0.005, 0.008, 1.0)
tl.new(tube, tdark.inputs["Factor"])
tl.new(tmix.outputs["Result"], tdark.inputs["A"])
tl.new(tdark.outputs["Result"], tb.inputs["Base Color"])
tb.inputs["Metallic"].default_value = 0.35
tb.inputs["Roughness"].default_value = 0.45
tstr = tn.new("ShaderNodeMath")
tstr.operation = "MULTIPLY"
tstr.inputs[1].default_value = TORP_EMIT
tl.new(combine(tn, tl, "ADD", tube, twin), tstr.inputs[0])
tb.inputs["Emission Color"].default_value = WINDOW_COL
tl.new(tstr.outputs[0], tb.inputs["Emission Strength"])

# stern hangar: the rear cap of the central cylinder reads as the flight
# deck - lit rim ring centred on the cap, retractable door panels drawn as
# vertical slats with lit seams
_cap = [p.center for p in me.polygons if p.normal.y < -0.7 and p.center.y < -23.0]
BAY_CX = sum(c.x for c in _cap) / len(_cap)
BAY_CZ = sum(c.z for c in _cap) / len(_cap)
print("BAYCAP centre=(%.2f,%.2f) faces=%d" % (BAY_CX, BAY_CZ, len(_cap)))
mat_bay, bnt, bb = new_mat("Earth Shuttlebay")
bn, bl = bnt.nodes, bnt.links
bb.inputs["Base Color"].default_value = (0.006, 0.010, 0.022, 1.0)
bb.inputs["Metallic"].default_value = 0.2
bb.inputs["Roughness"].default_value = 0.6
bcoord = bn.new("ShaderNodeTexCoord")
bsep = bn.new("ShaderNodeSeparateXYZ")
bl.new(bcoord.outputs["Object"], bsep.inputs[0])
bxo = bn.new("ShaderNodeMath")
bxo.operation = "SUBTRACT"
bxo.inputs[1].default_value = BAY_CX
bl.new(bsep.outputs["X"], bxo.inputs[0])
bzo = bn.new("ShaderNodeMath")
bzo.operation = "SUBTRACT"
bzo.inputs[1].default_value = BAY_CZ
bl.new(bsep.outputs["Z"], bzo.inputs[0])
bx2 = bn.new("ShaderNodeMath")
bx2.operation = "MULTIPLY"
bl.new(bxo.outputs[0], bx2.inputs[0])
bl.new(bxo.outputs[0], bx2.inputs[1])
bz2 = bn.new("ShaderNodeMath")
bz2.operation = "MULTIPLY"
bl.new(bzo.outputs[0], bz2.inputs[0])
bl.new(bzo.outputs[0], bz2.inputs[1])
brad = bn.new("ShaderNodeMath")
brad.operation = "SQRT"
bl.new(combine(bn, bl, "ADD", bx2.outputs[0], bz2.outputs[0]), brad.inputs[0])
brim_ring = band(bn, bl, brad.outputs[0], 2.05, 2.45)   # bright rim ring
binner = bn.new("ShaderNodeMath")
binner.operation = "LESS_THAN"
binner.inputs[1].default_value = 1.95
bl.new(brad.outputs[0], binner.inputs[0])
# retracting-door graphic: vertical panel slats with faintly lit seams
bseam = band(bn, bl, cell_axis(bn, bl, bxo.outputs[0], 0.6), -0.035, 0.035)
bseam = combine(bn, bl, "MULTIPLY", bseam, binner.outputs[0])
bsstr = bn.new("ShaderNodeMath")
bsstr.operation = "MULTIPLY"
bsstr.inputs[1].default_value = 0.5
bl.new(bseam, bsstr.inputs[0])
bsum = combine(bn, bl, "ADD", brim_ring, bsstr.outputs[0])
# door panels sit a shade lighter than the surrounding bulkhead
bpanel = bn.new("ShaderNodeMix")
bpanel.data_type = "RGBA"
bpanel.inputs["A"].default_value = (0.006, 0.010, 0.022, 1.0)
bpanel.inputs["B"].default_value = (0.022, 0.032, 0.058, 1.0)
bl.new(binner.outputs[0], bpanel.inputs["Factor"])
bl.new(bpanel.outputs["Result"], bb.inputs["Base Color"])
bstr = bn.new("ShaderNodeMath")
bstr.operation = "MULTIPLY"
bstr.inputs[1].default_value = BAY_EMIT
bl.new(bsum, bstr.inputs[0])
bb.inputs["Emission Color"].default_value = WINDOW_COL
bl.new(bstr.outputs[0], bb.inputs["Emission Strength"])

# aft machinery with glowing heat-vent louvers
mat_gun, gnt, gm = new_mat("Earth Gunmetal")
gn, gl = gnt.nodes, gnt.links
gm.inputs["Base Color"].default_value = GUNMETAL
gm.inputs["Metallic"].default_value = 0.8
gm.inputs["Roughness"].default_value = 0.5
# plain dark machinery - the louvered heat vents live on the hull flanks
# instead (striping the nozzle barrels read as candy stripes)

me.materials.clear()
for m in (mat_clean, mat_silver, mat_glow, mat_torp, mat_gun, mat_bay):
    me.materials.append(m)
S_HULL, S_SILVER, S_GLOW, S_TORP, S_GUN, S_BAY = range(6)

# ---------------- face assignment ----------------
counts = dict(glow=0, brim=0, ring=0, pod=0, gun=0, rod=0, bay=0)
for p in me.polygons:
    c, n = p.center, p.normal
    # the six true nozzle caps: rear-facing small discs near the pod axes
    if (n.y < -0.7 and -22.6 < c.y < -22.3
            and min(math.hypot(c.x - 5.5, c.z), math.hypot(c.x + 5.5, c.z)) < 3.0):
        p.material_index = S_GLOW
        counts["glow"] += 1
    # stern hangar: the rearmost central cap ("the back cylinder")
    elif (n.y < -0.7 and c.y < -23.0
            and math.hypot(c.x - BAY_CX, c.z - BAY_CZ) < 3.0):
        p.material_index = S_BAY
        counts["bay"] += 1
    elif bay_y is not None and n.y < -0.9 and abs(c.y - bay_y) < 0.3:
        p.material_index = S_GUN
        counts["gun"] += 1
    elif c.y < -21.3:
        p.material_index = S_GUN
        counts["gun"] += 1
    elif p.index in brim_faces:
        p.material_index = S_SILVER
        counts["brim"] += 1
    elif p.index in pod_faces:
        p.material_index = S_TORP
        counts["pod"] += 1
    elif p.index in ring_faces:
        p.material_index = S_SILVER
        counts["ring"] += 1
    elif abs(abs(c.x) - 5.0) < 0.5 and abs(c.z) < 0.6 and -19 < c.y < -9:
        p.material_index = S_SILVER
        counts["rod"] += 1
    else:
        p.material_index = S_HULL
print("FACEGROUPS", counts)

# ---------------- fittings, placed by raycast ----------------
bpy.context.scene.cursor.location = (0, 0, 0)
made = []


def surface(origin, direction):
    ok, loc, nrm, _ = obj.ray_cast(mathutils.Vector(origin), mathutils.Vector(direction))
    if not ok:
        raise RuntimeError("raycast missed from %s along %s" % (origin, direction))
    return loc, nrm


def basis(normal, forward=(0, 1, 0)):
    z = mathutils.Vector(normal).normalized()
    f = mathutils.Vector(forward)
    if abs(f.dot(z)) > 0.95:
        f = mathutils.Vector((0, 0, 1))
    y = (f - f.dot(z) * z).normalized()
    x = y.cross(z)
    return mathutils.Matrix((x, y, z)).transposed().to_4x4()


def place(parts, loc, normal, sink):
    """Join parts (authored around the origin, +Z outward) and seat them on
    the hull at loc, sunk in along -normal so nothing floats."""
    for o in bpy.data.objects:
        o.select_set(False)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    n = mathutils.Vector(normal).normalized()
    o.matrix_world = mathutils.Matrix.Translation(
        mathutils.Vector(loc) - n * sink) @ basis(n)
    made.append(o)
    return o


def turret(origin, direction, scale=1.0):
    loc, nrm = surface(origin, direction)
    bpy.ops.mesh.primitive_cylinder_add(radius=1.0 * scale, depth=0.6 * scale,
                                        vertices=24, location=(0, 0, 0.3 * scale))
    base = bpy.context.active_object
    base.data.materials.append(mat_silver)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.85 * scale, segments=20,
                                         ring_count=10, location=(0, 0, 0.62 * scale))
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
    return place(parts, loc, nrm, sink=0.24 * scale)


def mast(origin, direction, length, radius=0.075):
    loc, nrm = surface(origin, direction)
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
    return place([foot, rod, tip], loc, nrm, sink=0.12)


def plate(origin, direction, sx, sy):
    loc, nrm = surface(origin, direction)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.07))
    pl = bpy.context.active_object
    pl.scale = (sx, sy, 0.14)
    pl.data.materials.append(mat_gun)
    return place([pl], loc, nrm, sink=0.06)


# nav lights: red to port, green to starboard, on the engine-body centreline
mat_nav_red, _, nr = new_mat("Nav Red")
nr.inputs["Base Color"].default_value = (0.1, 0.005, 0.005, 1)
nr.inputs["Emission Color"].default_value = (1.0, 0.02, 0.02, 1)
nr.inputs["Emission Strength"].default_value = 2.5
mat_nav_green, _, ng = new_mat("Nav Green")
ng.inputs["Base Color"].default_value = (0.005, 0.1, 0.01, 1)
ng.inputs["Emission Color"].default_value = (0.05, 1.0, 0.1, 1)
ng.inputs["Emission Strength"].default_value = 2.5


def nav_light(origin, direction, mat):
    loc, nrm = surface(origin, direction)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, segments=12, ring_count=6,
                                         location=(0, 0, 0))
    lamp = bpy.context.active_object
    lamp.data.materials.append(mat)
    return place([lamp], loc, nrm, sink=0.06)


# turrets: sphere top and bottom poles, weapons-pod top, mid-hull ventral
turret((scx, scy, scz + 40), (0, 0, -1))
turret((scx, scy, scz - 40), (0, 0, 1))
turret((0, -10.2, 40), (0, 0, -1))
turret((0, 0.9, -40), (0, 0, 1), scale=0.85)
# nav lights at both stations, port (red) and starboard (green)
for ny in NAV_Y:
    nav_light((-40, ny, 0), (1, 0, 0), mat_nav_red)
    nav_light((40, ny, 0), (-1, 0, 0), mat_nav_green)
# antenna masts: forward sensor boom off the brim tip, twin dorsal whips
mast((0, 40, 0), (0, -1, 0), 3.4, radius=0.09)
mast((-1.35, 3.4, 40), (0, 0, -1), 2.6)
mast((1.35, 3.4, 40), (0, 0, -1), 2.6)
# greeble plates on the dorsal and ventral spine
plate((0, -3.0, 40), (0, 0, -1), 2.2, 1.3)
plate((0, -3.0, -40), (0, 0, 1), 2.0, 1.1)

for o in bpy.data.objects:
    o.select_set(False)
obj.select_set(True)
for o in made:
    o.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.join()
print("FITTINGS", len(made))

for op in ("shade_auto_smooth", "shade_smooth_by_angle"):
    try:
        getattr(bpy.ops.object, op)(angle=math.radians(35))
        break
    except AttributeError:
        continue

# ---------------- scene ----------------
scene = bpy.context.scene
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
add_sun("Fill", 1.6, -60, -130, (0.8, 0.87, 1.0))
add_sun("Rim", 2.0, 15, 180, (0.9, 0.95, 1.0))

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
size = 46.5


def look(loc, target=(0, 0, 0)):
    cam.location = loc
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


VIEWS = {
    "front_quarter": ((size * 0.85, size * 0.9, size * 0.45), (0, 0, 0)),
    "rear_quarter": ((size * 0.8, -size * 0.95, size * 0.35), (0, 0, 0)),
    "side": ((size * 1.25, 0, size * 0.12), (0, 0, 0)),
    "top": ((0.01, 0.01, size * 1.5), (0, 0, 0)),
    "stern_close": ((size * 0.55, -size * 1.0, -size * 0.1), (0, -17, 0)),
    "detail_pod": ((size * 0.42, -size * 0.30, size * 0.30), (0, -10, 4)),
    "detail_bow": ((size * 0.55, size * 0.34, size * 0.26), (0, 11, 1)),
}

md = obj.data
for variant, hull_mat in (("clean", mat_clean), ("striped", mat_striped)):
    md.materials[S_HULL] = hull_mat
    for label, (loc, tgt) in VIEWS.items():
        look(loc, tgt)
        scene.render.filepath = os.path.join(OUTDIR, "earth_bb_%s_%s.png" % (variant, label))
        bpy.ops.render.render(write_still=True)

md.materials[S_HULL] = mat_clean
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("KIT_DONE")
