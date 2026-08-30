"""Extract Chris's weapon-mount markers from the annotated Krelath model.
Recentres by the LARGEST part's bbox (the hull) so coordinates match the
kit's frame, then reports every small loose part as a mount candidate."""
import bpy, bmesh, math, os, mathutils

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=os.path.join(
    ROOT, "assets", "models", "Krelath - suggested weapons placements.stl"))
obj = bpy.context.selected_objects[0]
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")

parts = []
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    cs = [o.matrix_world @ v.co for v in o.data.vertices]
    xs = [c.x for c in cs]; ys = [c.y for c in cs]; zs = [c.z for c in cs]
    parts.append({
        "obj": o, "tris": len(o.data.polygons),
        "min": mathutils.Vector((min(xs), min(ys), min(zs))),
        "max": mathutils.Vector((max(xs), max(ys), max(zs))),
    })
hull = max(parts, key=lambda p: p["tris"])
hc = (hull["min"] + hull["max"]) / 2
print("HULL part tris=%d dims=%s centre_offset=%s"
      % (hull["tris"], tuple(round(v, 2) for v in (hull["max"] - hull["min"])),
         tuple(round(v, 2) for v in hc)))

print("\n=== MOUNT MARKERS (recentred to hull frame) ===")
for p in sorted(parts, key=lambda p: p["tris"]):
    if p is hull:
        continue
    mid = (p["min"] + p["max"]) / 2 - hc
    dim = p["max"] - p["min"]
    print("  tris=%4d centre=(%6.2f,%7.2f,%6.2f) dims=(%.2f,%.2f,%.2f)"
          % (p["tris"], mid.x, mid.y, mid.z, dim.x, dim.y, dim.z))
print("PROBE_DONE")
