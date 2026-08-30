"""Krelath Empire material kit v1 - Krelath Battleship.

Canon: green base, bronze accents, yellow/green glowing windows, red engine
glow. Chris: triangle plating, feathery. Chitinous arthropod look.

- Triangle plate lattice: three stripe families at 60 degrees; seam = min
  distance to any family's lines -> equilateral triangle cells.
- Feathery: overlapping shingle ramps along the hull axis + fine barb
  micro-ridges angled off the centreline, all in the bump channel.
- Bronze spearhead prow; the flat stern plate becomes a red engine array
  patterned into glowing triangle cells.
- Turrets are Chris's supplied models (beam dome, missile claw-crown).

Run:  blender --background --python krelath_kit.py
"""
import bpy
import bmesh
import math
import os
import mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models",
                   "Krelath - suggested weapons placements.stl")
OUTDIR = os.path.join(ROOT, "assets", "blender", "renders", "krelath")
BLEND = os.path.join(ROOT, "assets", "blender", "krelath_battleship.blend")
os.makedirs(OUTDIR, exist_ok=True)

# ---------------- faction palette ----------------
GREEN = (0.020, 0.110, 0.030, 1.0)
GREEN_LIGHT = (0.042, 0.170, 0.055, 1.0)
BRONZE = (0.340, 0.185, 0.050, 1.0)
WINDOW_COL = (0.75, 1.0, 0.25, 1.0)     # yellow-green
GLOW_COL = (1.0, 0.035, 0.015, 1.0)     # red
CHITIN_DARK = (0.015, 0.045, 0.02, 1.0)

TRI_SCALE = 2.2        # triangle cell size (world units)
SEAM_W = 0.10
SHINGLE_P = 1.6        # feather shingle period along hull axis
BARB_P = 0.42          # barb micro-ridge period
WINDOW_EMIT = 1.8
GLOW_EMIT = 1.6
VENT_EMIT = 1.2

# ---------------- import + repair ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]
obj.name = "KrelathBattleship"
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
print("HULL dims", dims.round(2).tolist())


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


def const_mul(nodes, links, sock, k):
    m = nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    m.inputs[1].default_value = k
    links.new(sock, m.inputs[0])
    return m.outputs[0]


def tri_wave(nodes, links, sock, period):
    """|centered sawtooth| -> distance to the nearest line of a stripe family"""
    m = const_mul(nodes, links, sock, 1.0 / period)
    fr = nodes.new("ShaderNodeMath")
    fr.operation = "FRACT"
    links.new(m, fr.inputs[0])
    sb = nodes.new("ShaderNodeMath")
    sb.operation = "SUBTRACT"
    sb.inputs[1].default_value = 0.5
    links.new(fr.outputs[0], sb.inputs[0])
    ab = nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    links.new(sb.outputs[0], ab.inputs[0])
    return const_mul(nodes, links, ab.outputs[0], period)


def project(nodes, links, xs_, ys_, ang_deg):
    """x*cos(a) + y*sin(a)"""
    a = math.radians(ang_deg)
    px = const_mul(nodes, links, xs_, math.cos(a))
    py = const_mul(nodes, links, ys_, math.sin(a))
    return combine(nodes, links, "ADD", px, py)


def tri_lattice(nodes, links, xs_, ys_, scale):
    """min distance to three 60-degree stripe families -> triangle seams"""
    d = None
    for ang in (90.0, 210.0, 330.0):
        w = tri_wave(nodes, links, project(nodes, links, xs_, ys_, ang), scale)
        d = w if d is None else combine(nodes, links, "MINIMUM", d, w)
    return d


def blend_fac(nodes, links, a_sock, b_sock):
    """0 where |a| dominates, 1 where |b| dominates (soft switch)"""
    aa = nodes.new("ShaderNodeMath")
    aa.operation = "ABSOLUTE"
    links.new(a_sock, aa.inputs[0])
    ab = nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    links.new(b_sock, ab.inputs[0])
    df = combine(nodes, links, "SUBTRACT", ab.outputs[0], aa.outputs[0])
    mr = nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -0.15
    mr.inputs["From Max"].default_value = 0.15
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


def tri_lattice_tp(nodes, links, sep_, nsep_, scale):
    """triplanar triangle lattice: pick the projection plane per face so box
    flanks get real triangles instead of stripe smear"""
    d_xy = tri_lattice(nodes, links, sep_.outputs["X"], sep_.outputs["Y"], scale)
    d_yz = tri_lattice(nodes, links, sep_.outputs["Y"], sep_.outputs["Z"], scale)
    d_xz = tri_lattice(nodes, links, sep_.outputs["X"], sep_.outputs["Z"], scale)
    f1 = blend_fac(nodes, links, nsep_.outputs["Z"], nsep_.outputs["X"])
    d = mix_val(nodes, links, d_xy, d_yz, f1)
    nxa = nodes.new("ShaderNodeMath")
    nxa.operation = "ABSOLUTE"
    links.new(nsep_.outputs["X"], nxa.inputs[0])
    nza = nodes.new("ShaderNodeMath")
    nza.operation = "ABSOLUTE"
    links.new(nsep_.outputs["Z"], nza.inputs[0])
    mx = combine(nodes, links, "MAXIMUM", nxa.outputs[0], nza.outputs[0])
    f2 = blend_fac(nodes, links, mx, nsep_.outputs["Y"])
    fake = nodes.new("ShaderNodeMath")
    fake.operation = "MULTIPLY"
    fake.inputs[1].default_value = 1.0
    links.new(mx, fake.inputs[0])
    return mix_val(nodes, links, d, d_xz, f2)


# ---------------- hull material ----------------
mat_hull, nt, bsdf = new_mat("Krelath Chitin")
nodes, links = nt.nodes, nt.links
coord = nodes.new("ShaderNodeTexCoord")
sep = nodes.new("ShaderNodeSeparateXYZ")
links.new(coord.outputs["Object"], sep.inputs[0])
geom = nodes.new("ShaderNodeNewGeometry")
nsep = nodes.new("ShaderNodeSeparateXYZ")
links.new(geom.outputs["Normal"], nsep.inputs[0])

# triangle plate seams (projected on the x/y plane - hulls are flat)
tridist = tri_lattice_tp(nodes, links, sep, nsep, TRI_SCALE)
seam = nodes.new("ShaderNodeMapRange")
seam.inputs["From Max"].default_value = SEAM_W
seam.clamp = True
links.new(tridist, seam.inputs["Value"])

# feather shingles: ramp that repeats along the hull axis (overlap look)
shingle = nodes.new("ShaderNodeMath")
shingle.operation = "FRACT"
links.new(const_mul(nodes, links, sep.outputs["Y"], 1.0 / SHINGLE_P),
          shingle.inputs[0])
# barbs: fine ridges angled off the centreline like feather vanes,
# projected per-face like the plates so flanks get true vanes
def barb_pair(u_sock, v_sock):
    bb_ = None
    for ang in (60.0, 120.0):
        w = tri_wave(nodes, links, project(nodes, links, u_sock, v_sock, ang),
                     BARB_P)
        b_ = const_mul(nodes, links, w, 1.0 / BARB_P)
        bb_ = b_ if bb_ is None else combine(nodes, links, "MINIMUM", bb_, b_)
    return bb_

barbs = mix_val(nodes, links,
                barb_pair(sep.outputs["X"], sep.outputs["Y"]),
                barb_pair(sep.outputs["Y"], sep.outputs["Z"]),
                blend_fac(nodes, links, nsep.outputs["Z"], nsep.outputs["X"]))

height = combine(nodes, links, "ADD",
                 const_mul(nodes, links, seam.outputs["Result"], 1.0),
                 const_mul(nodes, links, shingle.outputs[0], 0.22))
height = combine(nodes, links, "ADD", height,
                 const_mul(nodes, links, barbs, 0.16))
bump = nodes.new("ShaderNodeBump")
bump.inputs["Strength"].default_value = 0.45
links.new(height, bump.inputs["Height"])
links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

# organic tone mottle
noise = nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 0.35
noise.inputs["Detail"].default_value = 3.0
links.new(coord.outputs["Object"], noise.inputs["Vector"])
tone = nodes.new("ShaderNodeMix")
tone.data_type = "RGBA"
tone.inputs["A"].default_value = GREEN
tone.inputs["B"].default_value = GREEN_LIGHT
links.new(noise.outputs["Fac"], tone.inputs["Factor"])
# seams darken toward the chitin dark tone
seam_dark = nodes.new("ShaderNodeMix")
seam_dark.data_type = "RGBA"
seam_dark.inputs["A"].default_value = CHITIN_DARK
links.new(tone.outputs["Result"], seam_dark.inputs["B"])
links.new(seam.outputs["Result"], seam_dark.inputs["Factor"])
links.new(seam_dark.outputs["Result"], bsdf.inputs["Base Color"])
bsdf.inputs["Metallic"].default_value = 0.15
rmap = nodes.new("ShaderNodeMapRange")
rmap.inputs["To Min"].default_value = 0.32
rmap.inputs["To Max"].default_value = 0.5
links.new(noise.outputs["Fac"], rmap.inputs["Value"])
links.new(rmap.outputs["Result"], bsdf.inputs["Roughness"])

# windows: sparse yellow-green rectangles on the flank faces
nax = nodes.new("ShaderNodeMath")
nax.operation = "ABSOLUTE"
links.new(nsep.outputs["X"], nax.inputs[0])
flank = nodes.new("ShaderNodeMath")
flank.operation = "GREATER_THAN"
flank.inputs[1].default_value = 0.55
links.new(nax.outputs[0], flank.inputs[0])
wu = nodes.new("ShaderNodeMath")
wu.operation = "FRACT"
links.new(const_mul(nodes, links, sep.outputs["Y"], 0.55), wu.inputs[0])
wcell = band(nodes, links, wu.outputs[0], 0.30, 0.52)
wz = band(nodes, links, sep.outputs["Z"], -0.5, 0.35)
wspan = band(nodes, links, sep.outputs["Y"], ymin + 0.22 * L, ymax - 0.34 * L)
naz = nodes.new("ShaderNodeMath")
naz.operation = "ABSOLUTE"
links.new(nsep.outputs["Z"], naz.inputs[0])
wflat = nodes.new("ShaderNodeMath")
wflat.operation = "LESS_THAN"
wflat.inputs[1].default_value = 0.35
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
central.inputs[1].default_value = 5.2
links.new(xab.outputs[0], central.inputs[0])
wmask = combine(nodes, links, "MULTIPLY", wcell, wz)
wmask = combine(nodes, links, "MULTIPLY", wmask, flank.outputs[0])
wmask = combine(nodes, links, "MULTIPLY", wmask, wspan)
wmask = combine(nodes, links, "MULTIPLY", wmask, wflat.outputs[0])
wmask = combine(nodes, links, "MULTIPLY", wmask, outward.outputs[0])
wmask = combine(nodes, links, "MULTIPLY", wmask, central.outputs[0])

# red heat vents on the flanks near the stern
vent = combine(nodes, links, "MULTIPLY",
               band(nodes, links, sep.outputs["Y"], ymin + 1.0, ymin + 2.2),
               band(nodes, links,
                    tri_wave(nodes, links, sep.outputs["Z"], 0.6),
                    0.0, 0.16))
vent = combine(nodes, links, "MULTIPLY", vent, flank.outputs[0])
vent = combine(nodes, links, "MULTIPLY", vent,
               band(nodes, links, sep.outputs["Z"], -2.5, 2.5))
vent = combine(nodes, links, "MULTIPLY", vent, outward.outputs[0])
vent = combine(nodes, links, "MULTIPLY", vent, central.outputs[0])

we = const_mul(nodes, links, wmask, WINDOW_EMIT)
ve = const_mul(nodes, links, vent, VENT_EMIT)
ecol = nodes.new("ShaderNodeMix")
ecol.data_type = "RGBA"
ecol.inputs["A"].default_value = WINDOW_COL
ecol.inputs["B"].default_value = GLOW_COL
links.new(vent, ecol.inputs["Factor"])
links.new(ecol.outputs["Result"], bsdf.inputs["Emission Color"])
links.new(combine(nodes, links, "ADD", we, ve),
          bsdf.inputs["Emission Strength"])

# ---------------- bronze accent ----------------
mat_bronze, bnt, bb = new_mat("Krelath Bronze")
bn, bl = bnt.nodes, bnt.links
bb.inputs["Base Color"].default_value = BRONZE
bb.inputs["Metallic"].default_value = 0.85
bb.inputs["Roughness"].default_value = 0.42
bcoord = bn.new("ShaderNodeTexCoord")
bsep = bn.new("ShaderNodeSeparateXYZ")
bl.new(bcoord.outputs["Object"], bsep.inputs[0])
bgeom = bn.new("ShaderNodeNewGeometry")
bnsep = bn.new("ShaderNodeSeparateXYZ")
bl.new(bgeom.outputs["Normal"], bnsep.inputs[0])
btri = tri_lattice_tp(bn, bl, bsep, bnsep, TRI_SCALE)
bseam = bn.new("ShaderNodeMapRange")
bseam.inputs["From Max"].default_value = SEAM_W
bseam.clamp = True
bl.new(btri, bseam.inputs["Value"])
bbump = bn.new("ShaderNodeBump")
bbump.inputs["Strength"].default_value = 0.35
bl.new(bseam.outputs["Result"], bbump.inputs["Height"])
bl.new(bbump.outputs["Normal"], bb.inputs["Normal"])

# ---------------- engine array (flat stern plate) ----------------
mat_engine, ent, eb = new_mat("Krelath Engine Array")
en, el = ent.nodes, ent.links
eb.inputs["Base Color"].default_value = CHITIN_DARK
eb.inputs["Metallic"].default_value = 0.3
eb.inputs["Roughness"].default_value = 0.55
ecoord = en.new("ShaderNodeTexCoord")
esep = en.new("ShaderNodeSeparateXYZ")
el.new(ecoord.outputs["Object"], esep.inputs[0])
# glowing triangle cells with dark grid between them
etri = tri_lattice(en, el, esep.outputs["X"], esep.outputs["Z"], 1.4)
ecell = en.new("ShaderNodeMath")
ecell.operation = "GREATER_THAN"
ecell.inputs[1].default_value = 0.16
el.new(etri, ecell.inputs[0])
estr = const_mul(en, el, ecell.outputs[0], GLOW_EMIT)
eb.inputs["Emission Color"].default_value = GLOW_COL
el.new(estr, eb.inputs["Emission Strength"])

me.materials.clear()
for m in (mat_hull, mat_bronze, mat_engine):
    me.materials.append(m)
S_HULL, S_BRONZE, S_ENGINE = range(3)

# ---------------- face assignment ----------------
# --- detect Chris's modelled weapon mounts: dense smooth patches on an
# otherwise coarse-faceted hull; bronze the whole fixture region ---
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

mount_faces = set()
n_mounts = 0
for root, faces in groups.items():
    if len(faces) < 40:
        continue
    cs = [f.calc_center_median() for f in faces]
    lo = mathutils.Vector((min(c.x for c in cs), min(c.y for c in cs),
                           min(c.z for c in cs)))
    hi = mathutils.Vector((max(c.x for c in cs), max(c.y for c in cs),
                           max(c.z for c in cs)))
    diag = (hi - lo).length
    if diag < 5.0:
        n_mounts += 1
        mount_faces.update(f.index for f in faces)
        print("   mount patch n=%d c=%s diag=%.1f"
              % (len(faces), tuple(round(v, 1) for v in (lo + hi) / 2), diag))
print("MOUNTS detected:", n_mounts)

# engine faces: connectivity clusters of rear-facing geometry, big ones only
eng_cand = [f.index for f in bm.faces
            if f.normal.y < -0.85 and f.calc_center_median().y < ymin + 0.35 * L]
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
    if sum(bm.faces[i].calc_area() for i in idxs) > 4.0:
        engine_faces.update(idxs)
bm.free()


counts = dict(engine=0, mount=0)
for p in me.polygons:
    c = p.center
    if p.index in engine_faces:
        p.material_index = S_ENGINE
        counts["engine"] += 1
    elif p.index in mount_faces or (
            abs(abs(c.x) - 4.3) < 2.4 and abs(c.y + 6.2) < 2.5 and c.z > 0.9):
        p.material_index = S_BRONZE
        counts["mount"] += 1
    else:
        p.material_index = S_HULL
print("FACEGROUPS", counts)

# ---------------- fittings ----------------
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


def import_turret(stl_name, mat):
    bpy.ops.wm.stl_import(filepath=os.path.join(ROOT, "assets", "models",
                                                stl_name + ".stl"))
    t = bpy.context.selected_objects[0]
    td = t.data
    txs = [v.co.x for v in td.vertices]
    tys = [v.co.y for v in td.vertices]
    tzs = [v.co.z for v in td.vertices]
    # recentre x/y, rest the base on local z=0
    tc = mathutils.Vector(((max(txs) + min(txs)) / 2,
                           (max(tys) + min(tys)) / 2, min(tzs)))
    td.transform(mathutils.Matrix.Translation(-tc))
    td.materials.clear()
    td.materials.append(mat)
    return t


def place_turret(stl_name, origin, direction, mat, scale=1.0, sink=0.12):
    loc, nrm = surface(origin, direction)
    if loc is None:
        print("MISS", stl_name, origin)
        return
    t = import_turret(stl_name, mat)
    n = mathutils.Vector(nrm).normalized()
    t.matrix_world = (mathutils.Matrix.Translation(
        mathutils.Vector(loc) - n * sink) @ basis(n)
        @ mathutils.Matrix.Scale(scale, 4))
    made.append(t)


def nav_light(origin, direction, color):
    loc, nrm = surface(origin, direction)
    if loc is None:
        return
    m, _, nb = new_mat("Nav")
    nb.inputs["Base Color"].default_value = (color[0] * 0.1, color[1] * 0.1,
                                             color[2] * 0.1, 1)
    nb.inputs["Emission Color"].default_value = (*color, 1)
    nb.inputs["Emission Strength"].default_value = 2.5
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, segments=12, ring_count=6,
                                         location=(0, 0, 0))
    lamp = bpy.context.active_object
    lamp.data.materials.append(m)
    n = mathutils.Vector(nrm).normalized()
    lamp.matrix_world = mathutils.Matrix.Translation(
        mathutils.Vector(loc) - n * 0.07) @ basis(n)
    made.append(lamp)


far = L * 1.2
# weapon mounts are modelled into Chris's updated hull - nothing to place
# nav lights on the widest flank points (no engine rings on this species)
nav_light((-far, -6.0, 0), (1, 0, 0), (1.0, 0.02, 0.02))
nav_light((far, -6.0, 0), (-1, 0, 0), (0.05, 1.0, 0.1))

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
        getattr(bpy.ops.object, op)(angle=math.radians(12))
        break
    except AttributeError:
        continue

# ---------------- scene + renders ----------------
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
add_sun("Fill", 1.6, -60, -130, (0.85, 0.9, 0.85))
add_sun("Rim", 2.0, 15, 180, (0.9, 0.95, 0.9))
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


VIEWS = {
    "front_quarter": ((size * 1.0, size * 1.05, size * 0.55), (0, 0, 0)),
    "rear_quarter": ((size * 0.95, -size * 1.1, size * 0.45), (0, 0, 0)),
    "top": ((0.01, 6.0, size * 1.6), (0, 5.9, 0)),
    "stern_close": ((size * 0.5, -size * 1.15, -size * 0.1), (0, ymin * 0.8, 0)),
    "detail_bow": ((size * 0.6, size * 0.75, size * 0.3), (0, ymax * 0.6, 1)),
}
for label, (loc, tgt) in VIEWS.items():
    look(loc, tgt)
    scene.render.filepath = os.path.join(OUTDIR, "krelath_bb_%s.png" % label)
    bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print("KIT_DONE")
