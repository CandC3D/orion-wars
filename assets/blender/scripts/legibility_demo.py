"""Render a before/after distance-legibility study for the Earth fleet.

Run with:
    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" \
        --background --python assets/blender/scripts/legibility_demo.py

The source meshes and silhouettes are never edited.  The AFTER treatment is made
entirely in copied per-corner colour attributes, selected by normalized geometric
regions.  Add a HullConfig entry to ACTIVE_HULLS when the Frigate export is ready.
"""

import math
import os
import subprocess
from dataclasses import dataclass
from typing import Dict, Tuple

import bpy
from mathutils import Vector


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
OUTPUT_DIR = os.path.join(ROOT, "assets", "blender", "preview", "legibility_demo")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# The values below are the authoring/display-space BYTE_COLOR values in the GLB.
PALETTE = {
    "blue": (0.00, 0.62, 0.85),
    "gray": (0.75, 0.78, 0.80),
    "light_gray": (0.98, 0.98, 0.98),
    "red": (0.91, 0.11, 0.18),
    "orange": (0.96, 0.51, 0.12),
    "gold": (0.88, 0.68, 0.21),
    "green": (0.27, 0.72, 0.29),
    "dark_gray": (0.38, 0.40, 0.42),
}

DARK_NAVY = (0.025, 0.095, 0.145, 1.0)
SYSTEM_CORE = (0.02, 0.32, 0.46, 1.0)
SYSTEM_EMISSION = (0.02, 0.50, 0.72, 1.0)
NO_EMISSION = (0.0, 0.0, 0.0, 1.0)


@dataclass(frozen=True)
class HullConfig:
    key: str
    label: str
    model_relpath: str
    paint_mode: str
    emission_mode: str
    # Normalized face-region fits.  X is the long axis; min X is the prow.
    dorsal_normal_z: float
    dorsal_z_min: float
    central_half_width: float
    wedge_x: Tuple[float, float]
    wedge_z_min: float
    wedge_half_width: Tuple[float, float]
    pod_inner_y: float
    pod_outer_y: float
    glow_x_bands: Tuple[Tuple[float, float], ...]
    glow_z_min: float
    glow_face_x_span_max: float


HULLS: Dict[str, HullConfig] = {
    "destroyer": HullConfig(
        key="destroyer",
        label="Earth Destroyer",
        model_relpath=os.path.join("assets", "models", "v2", "Earth Destroyer v2.1 Union Group.glb"),
        paint_mode="dark_prow_spine_wedge",
        emission_mode="two_short_paired_groups",
        dorsal_normal_z=0.30,
        dorsal_z_min=0.52,
        central_half_width=0.42,
        wedge_x=(0.46, 0.98),
        wedge_z_min=0.55,
        wedge_half_width=(0.07, 0.40),
        pod_inner_y=0.52,
        pod_outer_y=1.02,
        glow_x_bands=((0.045, 0.105), (0.43, 0.49)),
        glow_z_min=0.40,
        glow_face_x_span_max=0.04,
    ),
    # Frigate second pass: add its model path and activate this entry after the
    # corrected export arrives.  The generic modes are already implemented:
    # paint_mode="light_dorsal_panel", emission_mode="one_continuous_group".
}

ACTIVE_HULLS = ("destroyer",)


@dataclass(frozen=True)
class HullFrame:
    lo: Vector
    hi: Vector
    center: Vector
    size: Vector

    def normalized(self, point: Vector) -> Tuple[float, float, float]:
        return (
            (point.x - self.lo.x) / self.size.x,
            (point.y - self.center.y) / (self.size.y * 0.5),
            (point.z - self.lo.z) / self.size.z,
        )


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_hull(config: HullConfig):
    before_names = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, config.model_relpath))
    meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name not in before_names
    ]
    if len(meshes) != 1:
        raise RuntimeError("Expected one merged mesh for %s, found %d" % (config.label, len(meshes)))
    obj = meshes[0]
    obj.name = config.key + "_before"
    if "Color" not in obj.data.color_attributes:
        raise RuntimeError("%s has no per-corner Color attribute" % config.label)
    color = obj.data.color_attributes["Color"]
    if color.domain != "CORNER" or color.data_type != "BYTE_COLOR":
        raise RuntimeError("Expected Color to be CORNER BYTE_COLOR, got %s %s" % (color.domain, color.data_type))
    return obj


def world_frame(obj) -> HullFrame:
    coords = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    lo = Vector((min(p.x for p in coords), min(p.y for p in coords), min(p.z for p in coords)))
    hi = Vector((max(p.x for p in coords), max(p.y for p in coords), max(p.z for p in coords)))
    return HullFrame(lo=lo, hi=hi, center=(lo + hi) * 0.5, size=hi - lo)


def nearest_palette_name(color) -> str:
    rgb = color[:3]
    return min(
        PALETTE,
        key=lambda name: sum((rgb[channel] - PALETTE[name][channel]) ** 2 for channel in range(3)),
    )


def dominant_face_colour(poly, color_attr) -> str:
    counts = {}
    for loop_index in poly.loop_indices:
        name = nearest_palette_name(color_attr.data[loop_index].color)
        counts[name] = counts.get(name, 0) + 1
    return max(counts, key=counts.get)


def ensure_emission_attribute(mesh):
    old = mesh.color_attributes.get("LegibilityEmission")
    if old:
        mesh.color_attributes.remove(old)
    attr = mesh.color_attributes.new(
        name="LegibilityEmission", type="BYTE_COLOR", domain="CORNER"
    )
    for datum in attr.data:
        datum.color = NO_EMISSION
    return attr


def is_dorsal(config: HullConfig, zn: float, normal_z: float) -> bool:
    return zn >= config.dorsal_z_min and normal_z >= config.dorsal_normal_z


def is_central_drum(config: HullConfig, xn: float, yn: float) -> bool:
    return config.wedge_x[0] <= xn <= config.wedge_x[1] and abs(yn) <= config.central_half_width


def is_fitted_pod(config: HullConfig, yn: float) -> bool:
    ay = abs(yn)
    return config.pod_inner_y <= ay <= config.pod_outer_y


def is_wedge(config: HullConfig, xn: float, yn: float, zn: float, normal_z: float) -> bool:
    if config.paint_mode != "dark_prow_spine_wedge":
        return False
    if zn < config.wedge_z_min or normal_z < config.dorsal_normal_z:
        return False
    if not is_central_drum(config, xn, yn):
        return False
    t = (xn - config.wedge_x[0]) / max(config.wedge_x[1] - config.wedge_x[0], 1e-6)
    half_width = config.wedge_half_width[0] + t * (
        config.wedge_half_width[1] - config.wedge_half_width[0]
    )
    return abs(yn) <= half_width


def is_emissive_group(
    config: HullConfig,
    xn: float,
    yn: float,
    zn: float,
    normal_z: float,
    face_x_span: float,
) -> bool:
    if not is_dorsal(config, zn, normal_z):
        return False
    if config.emission_mode == "two_short_paired_groups":
        if (
            zn < config.glow_z_min
            or not is_fitted_pod(config, yn)
            or face_x_span > config.glow_face_x_span_max
        ):
            return False
        return any(lo <= xn <= hi for lo, hi in config.glow_x_bands)
    if config.emission_mode == "one_continuous_group":
        return config.glow_x_bands[0][0] <= xn <= config.glow_x_bands[0][1] and abs(yn) <= config.central_half_width
    return False


def apply_after_scheme(obj, config: HullConfig, frame: HullFrame) -> dict:
    mesh = obj.data
    color_attr = mesh.color_attributes["Color"]
    emission_attr = ensure_emission_attribute(mesh)
    painted_faces = 0
    painted_area = 0.0
    glow_faces = 0
    glow_area = 0.0
    eligible_dorsal_blue_area = 0.0

    for poly in mesh.polygons:
        source_colour = dominant_face_colour(poly, color_attr)
        center = obj.matrix_world @ poly.center
        normal = (obj.matrix_world.to_3x3() @ poly.normal).normalized()
        xn, yn, zn = frame.normalized(center)
        face_xs = [
            (obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co).x
            for loop_index in poly.loop_indices
        ]
        face_x_span = (max(face_xs) - min(face_xs)) / frame.size.x

        if source_colour == "blue" and is_dorsal(config, zn, normal.z):
            eligible_dorsal_blue_area += poly.area

        # Restrict all class-code edits to original Earth blue.  This protects
        # the orange weapons, gold dish, red radiators, nav lights and structure.
        if source_colour != "blue":
            continue

        if is_wedge(config, xn, yn, zn, normal.z):
            for loop_index in poly.loop_indices:
                color_attr.data[loop_index].color = DARK_NAVY
            painted_faces += 1
            painted_area += poly.area

        if is_emissive_group(config, xn, yn, zn, normal.z, face_x_span):
            for loop_index in poly.loop_indices:
                color_attr.data[loop_index].color = SYSTEM_CORE
                emission_attr.data[loop_index].color = SYSTEM_EMISSION
            glow_faces += 1
            glow_area += poly.area

    return {
        "painted_faces": painted_faces,
        "painted_area": painted_area,
        "glow_faces": glow_faces,
        "glow_area": glow_area,
        "eligible_dorsal_blue_area": eligible_dorsal_blue_area,
    }


def make_vertex_colour_material(name: str, emission_strength: float):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)

    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    base = nodes.new("ShaderNodeVertexColor")
    base.layer_name = "Color"
    emission = nodes.new("ShaderNodeVertexColor")
    emission.layer_name = "LegibilityEmission"

    bsdf.inputs["Roughness"].default_value = 0.60
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.20
    bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(emission.outputs["Color"], bsdf.inputs["Emission Color"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material


def assign_material(obj, material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.material_index = 0


def setup_render_scene(scene):
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("Legibility World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.022, 0.032, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world

    sun_data = bpy.data.lights.new("Key Sun", "SUN")
    sun_data.energy = 2.2
    sun = bpy.data.objects.new("Key Sun", sun_data)
    sun.rotation_euler = (math.radians(55), 0.0, math.radians(35))
    scene.collection.objects.link(sun)

    fill_data = bpy.data.lights.new("Fill Sun", "SUN")
    fill_data.energy = 0.9
    fill = bpy.data.objects.new("Fill Sun", fill_data)
    fill.rotation_euler = (math.radians(-60), 0.0, math.radians(-130))
    scene.collection.objects.link(fill)

    camera_data = bpy.data.cameras.new("Legibility Camera")
    camera = bpy.data.objects.new("Legibility Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def aim_camera(camera, location: Vector, target: Vector) -> None:
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()


def set_visibility(before, after, state: str) -> None:
    before.hide_render = state not in ("before", "both")
    after.hide_render = state not in ("after", "both")


def render_view(scene, camera, before, after, frame: HullFrame, state: str, view: str, filepath: str) -> None:
    set_visibility(before, after, state)
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900

    span = max(frame.size)
    if view == "dorsal":
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = max(frame.size.y * 1.45, frame.size.x / (4.0 / 3.0) * 1.55)
        aim_camera(camera, frame.center + Vector((0.0, 0.0, span * 2.0)), frame.center)
    elif view == "oblique":
        camera.data.type = "PERSP"
        camera.data.lens = 50.0
        aim_camera(
            camera,
            frame.center + Vector((span * 1.22, span * 1.10, span * 0.61)),
            frame.center,
        )
    else:
        raise ValueError("Unknown view %s" % view)

    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)


def render_sprite_strip(scene, camera, before, after, frame: HullFrame, filepath: str) -> None:
    set_visibility(before, after, "both")
    ship_length = frame.size.x
    before_base = before.location.copy()
    after_base = after.location.copy()
    # 160 px / (3.333 ship lengths) = 48 px per ship, before left / after right.
    before.location = before_base + Vector((-0.58 * ship_length, 0.0, 0.0))
    after.location = after_base + Vector((0.58 * ship_length, 0.0, 0.0))
    scene.render.resolution_x = 160
    scene.render.resolution_y = 64
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = ship_length * (160.0 / 48.0) / (160.0 / 64.0)
    aim_camera(camera, frame.center + Vector((0.0, 0.0, ship_length * 2.0)), frame.center)
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    before.location = before_base
    after.location = after_base


def powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render_composite(source_paths, output_path: str) -> None:
    """Assemble a pixel-exact 2x2 sheet with labels using Windows GDI+."""
    ordered = (
        (source_paths["before_dorsal"], 0, 0, "BEFORE - DORSAL"),
        (source_paths["after_dorsal"], 1200, 0, "AFTER - DORSAL"),
        (source_paths["before_oblique"], 0, 900, "BEFORE - OBLIQUE"),
        (source_paths["after_oblique"], 1200, 900, "AFTER - OBLIQUE"),
    )
    draw_commands = []
    for path, x, y, label in ordered:
        draw_commands.append(
            "$img=[Drawing.Image]::FromFile(%s); "
            "$g.DrawImage($img,[Drawing.Rectangle]::new(%d,%d,1200,900)); $img.Dispose(); "
            "$g.FillRectangle($labelBg,%d,%d,310,44); "
            "$g.DrawString(%s,$font,$labelBrush,%d,%d);"
            % (powershell_quote(path), x, y, x + 18, y + 18, powershell_quote(label), x + 30, y + 25)
        )
    script = (
        "Add-Type -AssemblyName System.Drawing; "
        "$canvas=New-Object Drawing.Bitmap 2400,1800; "
        "$g=[Drawing.Graphics]::FromImage($canvas); "
        "$g.CompositingQuality=[Drawing.Drawing2D.CompositingQuality]::HighQuality; "
        "$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; "
        "$font=New-Object Drawing.Font 'Segoe UI',18,([Drawing.FontStyle]::Bold); "
        "$labelBrush=New-Object Drawing.SolidBrush ([Drawing.Color]::White); "
        "$labelBg=New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(190,16,20,28)); "
        + " ".join(draw_commands)
        + " $canvas.Save(%s,[Drawing.Imaging.ImageFormat]::Png); " % powershell_quote(output_path)
        + "$labelBg.Dispose(); $labelBrush.Dispose(); $font.Dispose(); $g.Dispose(); $canvas.Dispose();"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        check=True,
    )


def process_hull(config: HullConfig) -> None:
    reset_scene()
    before = import_hull(config)
    frame = world_frame(before)
    ensure_emission_attribute(before.data)

    after = before.copy()
    after.data = before.data.copy()
    after.name = config.key + "_after"
    bpy.context.scene.collection.objects.link(after)
    metrics = apply_after_scheme(after, config, frame)

    assign_material(before, make_vertex_colour_material(config.key + " Before", 0.0))
    assign_material(after, make_vertex_colour_material(config.key + " After", 1.5))
    camera = setup_render_scene(bpy.context.scene)
    scene = bpy.context.scene

    source_paths = {}
    for state in ("before", "after"):
        for view in ("dorsal", "oblique"):
            key = "%s_%s" % (state, view)
            path = os.path.join(OUTPUT_DIR, "%s_%s.png" % (config.key, key))
            source_paths[key] = path
            print("RENDER", path)
            render_view(scene, camera, before, after, frame, state, view, path)

    sprite_path = os.path.join(OUTPUT_DIR, "%s_sprite_strip.png" % config.key)
    print("RENDER", sprite_path)
    render_sprite_strip(scene, camera, before, after, frame, sprite_path)

    composite_path = os.path.join(OUTPUT_DIR, "%s_composite.png" % config.key)
    print("RENDER", composite_path)
    render_composite(source_paths, composite_path)

    ratio = 100.0 * metrics["painted_area"] / max(metrics["eligible_dorsal_blue_area"], 1e-6)
    print(
        "LEGIBILITY_METRICS %s painted_faces=%d painted_area=%.2f glow_faces=%d glow_area=%.2f "
        "painted_share_of_dorsal_blue=%.1f%%"
        % (
            config.key,
            metrics["painted_faces"],
            metrics["painted_area"],
            metrics["glow_faces"],
            metrics["glow_area"],
            ratio,
        )
    )


if __name__ == "__main__":
    for hull_key in ACTIVE_HULLS:
        process_hull(HULLS[hull_key])
    print("LEGIBILITY_DEMO_DONE")
