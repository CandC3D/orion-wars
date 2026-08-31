# Render top-down transparent sprites for the battle arena from the finished
# faction .blend files. One headless run does all ships:
#   blender --background --python assets/blender/scripts/arena_sprites.py
#
# Output: arena/sprites/<stem>.png (square, tight fit, nose +Y = up) and
# arena/sprites/manifest.json carrying each ship's world-unit footprint so the
# viewer can scale sprites consistently regardless of per-image framing.

import bpy, json, os, math

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
BLEND_DIR = os.path.join(ROOT, "assets", "blender")
OUT_DIR = os.path.join(ROOT, "arena", "sprites")
os.makedirs(OUT_DIR, exist_ok=True)

SHIPS = [
    ("earth_frigate", "EAR", "frigate"),
    ("earth_destroyer", "EAR", "destroyer"),
    ("earth_light_cruiser", "EAR", "light-cruiser"),
    ("earth_heavy_cruiser", "EAR", "heavy-cruiser"),
    ("earth_battleship", "EAR", "battleship"),
    ("earth_command_ship", "EAR", "command-ship"),
    ("krelath_frigate", "KRE", "frigate"),
    ("krelath_destroyer", "KRE", "destroyer"),
    ("krelath_light_cruiser", "KRE", "light-cruiser"),
    ("krelath_heavy_cruiser", "KRE", "heavy-cruiser"),
    ("krelath_battleship", "KRE", "battleship"),
    ("krelath_strike_cruiser", "KRE", "strike-cruiser"),
    ("vraygon_frigate", "VRA", "frigate"),
    ("vraygon_destroyer", "VRA", "destroyer"),
    ("vraygon_light_cruiser", "VRA", "light-cruiser"),
    ("vraygon_heavy_cruiser", "VRA", "heavy-cruiser"),
    ("vraygon_battleship", "VRA", "battleship"),
    ("vraygon_monitor", "VRA", "monitor"),
    ("zandrax_frigate", "ZAN", "frigate"),
    ("zandrax_destroyer", "ZAN", "destroyer"),
    ("zandrax_light_cruiser", "ZAN", "light-cruiser"),
    ("zandrax_heavy_cruiser", "ZAN", "heavy-cruiser"),
    ("zandrax_battleship", "ZAN", "battleship"),
    ("zandrax_corvette", "ZAN", "corvette"),
]

RES = 512
PAD = 1.08

manifest = {}

for stem, faction, klass in SHIPS:
    path = os.path.join(BLEND_DIR, stem + ".blend")
    if not os.path.exists(path):
        print("SKIP missing", path)
        continue
    bpy.ops.wm.open_mainfile(filepath=path)
    scene = bpy.context.scene

    # World-space bounds of every visible mesh.
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for ob in scene.objects:
        if ob.type != "MESH" or ob.hide_render:
            continue
        for corner in ob.bound_box:
            w = ob.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    if lo[0] > hi[0]:
        print("SKIP no mesh in", stem)
        continue
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    span = max(hi[0] - lo[0], hi[1] - lo[1]) * PAD

    cam_data = bpy.data.cameras.new("ArenaCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span
    cam_data.clip_start = 0.1
    cam_data.clip_end = 10000
    cam = bpy.data.objects.new("ArenaCam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (cx, cy, hi[2] + 50)
    cam.rotation_euler = (0.0, 0.0, 0.0)  # looking -Z, +Y up: nose renders up
    scene.camera = cam

    scene.render.engine = "BLENDER_EEVEE"   # 5.2 enum (not _NEXT)
    scene.render.film_transparent = True
    scene.render.resolution_x = RES
    scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = os.path.join(OUT_DIR, stem + ".png")
    bpy.ops.render.render(write_still=True)

    manifest[faction + "/" + klass] = {
        "file": stem + ".png",
        "spanUnits": round(span, 3),          # world units across the sprite
        "lengthUnits": round(hi[1] - lo[1], 3),
        "widthUnits": round(hi[0] - lo[0], 3),
        "nose": "up",
    }
    print("RENDERED", stem, "span", round(span, 2), "len", round(hi[1] - lo[1], 2))

with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
    json.dump(manifest, f, indent=2)
print("MANIFEST", len(manifest), "ships")
