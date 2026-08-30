"""One-shot diagnostic: saucer patch structure, lozenge geometry, mid-hull
cylinder fit. Answers the open questions before rewriting the kit."""
import bpy, bmesh, math, os, mathutils
import numpy as np

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
STL = os.path.join(ROOT, "assets", "models", "Earth Battleship.stl")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
obj = bpy.context.selected_objects[0]
me = obj.data
xs=[v.co.x for v in me.vertices]; ys=[v.co.y for v in me.vertices]; zs=[v.co.z for v in me.vertices]
c0 = mathutils.Vector(((max(xs)+min(xs))/2,(max(ys)+min(ys))/2,(max(zs)+min(zs))/2))
me.transform(mathutils.Matrix.Translation(-c0))

bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()

V = np.array([list(v.co) for v in me.vertices])
pts = V[(V[:,1] > 8.0) & (np.abs(V[:,2]) > 5.0)]
A = np.c_[pts*2, np.ones(len(pts))]
sol,*_ = np.linalg.lstsq(A, (pts**2).sum(axis=1), rcond=None)
scx, scy, scz = sol[:3]
srad = math.sqrt(sol[3] + scx**2 + scy**2 + scz**2)
print(f"SPHERE center=({scx:.3f},{scy:.3f},{scz:.3f}) r={srad:.3f}")

# ---- patch analysis ----
bm = bmesh.new(); bm.from_mesh(me)
bm.faces.ensure_lookup_table(); bm.edges.ensure_lookup_table()
parent = list(range(len(bm.faces)))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]; i = parent[i]
    return i
for e in bm.edges:
    lf = e.link_faces
    if len(lf) == 2:
        try: ang = e.calc_face_angle()
        except ValueError: ang = 0.0
        if ang < math.radians(30):
            ra, rb = find(lf[0].index), find(lf[1].index)
            if ra != rb: parent[rb] = ra
groups = {}
for f in bm.faces:
    groups.setdefault(find(f.index), []).append(f)

print("\n=== BOW PATCHES (any face y>2), by area ===")
rows = []
for root, faces in groups.items():
    cs = [f.calc_center_median() for f in faces]
    if max(c.y for c in cs) <= 2.0:
        continue
    area = sum(f.calc_area() for f in faces)
    rh = [math.sqrt((c.x-scx)**2 + (c.y-scy)**2) for c in cs]
    zz = [c.z for c in cs]
    mnz = sum(abs(f.normal.z)*f.calc_area() for f in faces)/area
    npass = sum(1 for c, r in zip(cs, rh) if c.y > 4.0 and abs(c.z) < 1.5 and r > 8.03)
    rows.append((area, len(faces), min(rh), max(rh), min(zz), max(zz), mnz, npass))
rows.sort(reverse=True)
for area, n, r0, r1, z0, z1, mnz, npass in rows[:14]:
    print(f"  area={area:8.2f} n={n:6d} rh=[{r0:6.2f},{r1:6.2f}] z=[{z0:6.2f},{z1:6.2f}] "
          f"mean|nz|={mnz:.2f} pass_current_rule={npass}/{n}")

print("\n=== BRIM CANDIDATE FACES (rh>7.5, y>4) z-distribution ===")
sel = [(f, f.calc_center_median()) for f in bm.faces]
brim = [(f, c) for f, c in sel if c.y > 4.0 and math.sqrt((c.x-scx)**2+(c.y-scy)**2) > 7.5]
if brim:
    zz = np.array([c.z for _, c in brim])
    rr = np.array([math.sqrt((c.x-scx)**2+(c.y-scy)**2) for _, c in brim])
    print(f"  n={len(brim)} z=[{zz.min():.2f},{zz.max():.2f}] rh=[{rr.min():.2f},{rr.max():.2f}]")
    for lo, hi in ((0,0.5),(0.5,1.0),(1.0,1.5),(1.5,2.0),(2.0,3.0),(3.0,9.0)):
        m = (np.abs(zz)>=lo)&(np.abs(zz)<hi)
        if m.sum():
            print(f"    |z| in [{lo},{hi}): n={m.sum():5d} rh=[{rr[m].min():.2f},{rr[m].max():.2f}]")

print("\n=== LOZENGE (dorsal pod) ===")
fc = np.array([[f.calc_center_median().x, f.calc_center_median().y, f.calc_center_median().z] for f in bm.faces])
fn = np.array([[f.normal.x, f.normal.y, f.normal.z] for f in bm.faces])
lm = (fc[:,2] > 3.6) & (fc[:,1] > -16) & (fc[:,1] < -4) & (np.abs(fc[:,0]) < 4)
L = fc[lm]; LN = fn[lm]
if len(L):
    print(f"  n={len(L)} x=[{L[:,0].min():.2f},{L[:,0].max():.2f}] "
          f"y=[{L[:,1].min():.2f},{L[:,1].max():.2f}] z=[{L[:,2].min():.2f},{L[:,2].max():.2f}]")
    for lbl, m in (("|nx|>0.45", np.abs(LN[:,0])>0.45), ("nz>0.6", LN[:,2]>0.6),
                   ("ny>0.45", LN[:,1]>0.45), ("ny<-0.45", LN[:,1]<-0.45)):
        if m.sum():
            s = L[m]
            print(f"    {lbl:10s} n={m.sum():5d} x=[{s[:,0].min():.2f},{s[:,0].max():.2f}] "
                  f"y=[{s[:,1].min():.2f},{s[:,1].max():.2f}] z=[{s[:,2].min():.2f},{s[:,2].max():.2f}]")

print("\n=== MID-HULL CYLINDER (ports) ===")
mm = (fc[:,1] > -4.0) & (fc[:,1] < 3.0) & (np.abs(fn[:,1]) < 0.25)
M = fc[mm]
if len(M):
    P = M[:, [0,2]]
    for _ in range(4):
        A2 = np.c_[P[:,0]*2, P[:,1]*2, np.ones(len(P))]
        s2,*_ = np.linalg.lstsq(A2, P[:,0]**2 + P[:,1]**2, rcond=None)
        mx, mz = s2[0], s2[1]; mr = math.sqrt(s2[2]+mx**2+mz**2)
        res = np.abs(np.sqrt((P[:,0]-mx)**2 + (P[:,1]-mz)**2) - mr)
        keep = res < 0.35
        if keep.all(): break
        P = P[keep]
    print(f"  axis=({mx:.3f},{mz:.3f}) r={mr:.3f} inliers={len(P)}/{mm.sum()} "
          f"y=[{M[:,1].min():.2f},{M[:,1].max():.2f}]")
    on = np.abs(np.sqrt((M[:,0]-mx)**2 + (M[:,2]-mz)**2) - mr) < 0.3
    print(f"  faces on cylinder: {on.sum()}  z-range={M[on][:,2].min():.2f}..{M[on][:,2].max():.2f}")

print("\n=== RAYCAST MOUNT POINTS ===")
bm.free()
depsgraph = bpy.context.evaluated_depsgraph_get()
def cast(origin, direction):
    ok, loc, nrm, idx = obj.ray_cast(mathutils.Vector(origin), mathutils.Vector(direction))
    return (ok, tuple(round(v,3) for v in loc), tuple(round(v,3) for v in nrm)) if ok else (False, None, None)
for lbl, o, d in (("sphere_top",(0,11.75,30),(0,0,-1)),
                  ("sphere_bot",(0,11.75,-30),(0,0,1)),
                  ("neck_dorsal",(0,0.9,30),(0,0,-1)),
                  ("neck_ventral",(0,0.9,-30),(0,0,1)),
                  ("whip_port",(-1.3,3.2,30),(0,0,-1)),
                  ("whip_stbd",(1.3,3.2,30),(0,0,-1)),
                  ("bow_nose",(0,40,0),(0,-1,0))):
    print(f"  {lbl:14s} {cast(o,d)}")
print("DIAG_DONE")
