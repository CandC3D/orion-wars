"""Probe the v2 Earth GLB models: structure, materials, colours, scale.
Writes a text report + 3 renders per ship for external inspection."""
import bpy
import json
import math
import os
import mathutils

ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
SRC = os.path.join(ROOT, "assets", "models", "v2")
OUTDIR = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
os.makedirs(OUTDIR, exist_ok=True)

SHIPS = ["Earth Frigate v2", "Earth Destroyer v2", "Earth Light Cruiser v2",
         "Earth Heavy Cruiser v2", "Earth Battleship v2",
         "Earth Command Ship v2"]

report = {}
for ship in SHIPS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, ship + ".glb"))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    allco = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = mathutils.Vector((min(c.x for c in allco), min(c.y for c in allco),
                           min(c.z for c in allco)))
    hi = mathutils.Vector((max(c.x for c in allco), max(c.y for c in allco),
                           max(c.z for c in allco)))
    dims = hi - lo
    info = {
        "objects": len(meshes),
        "total_tris": sum(len(o.data.polygons) for o in meshes),
        "dims": [round(v, 2) for v in dims],
        "bbox_min": [round(v, 2) for v in lo],
        "bbox_max": [round(v, 2) for v in hi],
        "object_list": [],
        "materials": {},
    }
    for o in sorted(meshes, key=lambda o: -len(o.data.polygons))[:40]:
        cs = [o.matrix_world @ v.co for v in o.data.vertices]
        ol = [round(min(c[i] for c in cs), 1) for i in range(3)]
        oh = [round(max(c[i] for c in cs), 1) for i in range(3)]
        info["object_list"].append({
            "name": o.name, "tris": len(o.data.polygons),
            "mats": [ms.material.name if ms.material else "None"
                     for ms in o.material_slots],
            "bbox": [ol, oh]})
    for m in bpy.data.materials:
        col = None
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    c = n.inputs["Base Color"].default_value
                    col = [round(v, 3) for v in (c[0], c[1], c[2])]
                    break
        tris = sum(len(o.data.polygons) for o in meshes
                   for ms in o.material_slots if ms.material is m)
        info["materials"][m.name] = {"base_color": col, "tris_using": tris}
    report[ship] = info

    # renders (imported materials as-is)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))
    bpy.context.collection.objects.link(sun)
    fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", "SUN"))
    fill.data.energy = 2.0
    fill.rotation_euler = (math.radians(-60), 0, math.radians(-130))
    bpy.context.collection.objects.link(fill)
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = \
        (0.03, 0.032, 0.045, 1)
    bpy.context.scene.world = world
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    ctr = (lo + hi) / 2
    size = max(dims)
    slug = ship.lower().replace(" ", "_")
    for label, off in (("persp", (1.0, 0.95, 0.55)),
                       ("side", (1.5, 0.0, 0.12)),
                       ("rear", (0.8, -1.2, 0.35))):
        cam.location = (ctr.x + size * off[0], ctr.y + size * off[1],
                        ctr.z + size * off[2])
        d = ctr - mathutils.Vector(cam.location)
        cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(OUTDIR, "%s_%s.png" % (slug, label))
        bpy.ops.render.render(write_still=True)

with open(os.path.join(OUTDIR, "earth_v2_probe.json"), "w") as f:
    json.dump(report, f, indent=2)
print("V2_PROBE_DONE")
