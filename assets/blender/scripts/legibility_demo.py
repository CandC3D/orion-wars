"""Render a before/after distance-legibility study for the Earth cruisers.

Run with:
    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" \
        --background --python assets/blender/scripts/legibility_demo.py

The source meshes and silhouettes are never edited.  The AFTER treatment flood-
fills source-colour faces across position-welded edges, recolours complete blue
regions, and masks complete authored lit-system regions for emission.  This
keeps every boundary on an existing geometric edge.
"""

import math
import os
import subprocess
import tempfile
from array import array
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, Tuple

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

# Display-intended sRGB values.  Tinkercad wrote the source palette into the
# linear-spec COLOR_0 slot, so these use the same encoded convention and are
# decoded by ShaderNodeGamma (2.2) at render time.
DARK_NAVY_SRGB = (0.035, 0.12, 0.18, 1.0)
CLASS_LIGHT_SRGB = (0.82, 0.87, 0.90, 1.0)
SYSTEM_CORE_SRGB = (0.02, 0.50, 0.72, 1.0)
NO_EMISSION = (0.0, 0.0, 0.0, 1.0)
MASK_ON = (1.0, 1.0, 1.0, 1.0)
WELD_EPSILON = 1.0e-4
WINDOW_COMPONENT_AREA_MAX = 4.0
SPRITE_TILE_PIXELS = 64
SPRITE_SILHOUETTE_PIXELS = 48
SPRITE_MIN_CLEARANCE_PIXELS = 5


@dataclass(frozen=True)
class HullConfig:
    key: str
    label: str
    model_relpath: str
    paint_mode: str
    emission_mode: str
    # Normalized face-region fits.  X is the long axis; max X is the prow.
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
    blue_panel_x_bands: Tuple[Tuple[float, float], ...] = ()
    glow_y_bands: Tuple[Tuple[float, float], ...] = ()


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
    "light_cruiser": HullConfig(
        key="light_cruiser",
        label="Earth Light Cruiser",
        model_relpath=os.path.join(
            "assets", "models", "v2", "Earth Light Cruiser v2.1 Union Group.glb"
        ),
        paint_mode="light_drum_block",
        emission_mode="three_even_dorsal_groups",
        dorsal_normal_z=0.30,
        dorsal_z_min=0.52,
        central_half_width=0.54,
        wedge_x=(0.235, 0.555),
        wedge_z_min=0.56,
        wedge_half_width=(0.54, 0.54),
        pod_inner_y=0.0,
        pod_outer_y=0.0,
        glow_x_bands=((0.28, 0.33), (0.44, 0.49), (0.56, 0.59)),
        glow_z_min=0.64,
        glow_face_x_span_max=0.035,
        glow_y_bands=((0.42, 0.52), (0.42, 0.52), (0.0, 0.10)),
    ),
    "heavy_cruiser": HullConfig(
        key="heavy_cruiser",
        label="Earth Heavy Cruiser",
        model_relpath=os.path.join(
            "assets", "models", "v2", "Earth Heavy Cruiser 2.1 series.glb"
        ),
        paint_mode="dark_drum_with_blue_panels",
        emission_mode="paired_fore_aft_groups",
        dorsal_normal_z=0.30,
        dorsal_z_min=0.52,
        central_half_width=0.56,
        wedge_x=(0.22, 0.70),
        wedge_z_min=0.54,
        wedge_half_width=(0.56, 0.56),
        pod_inner_y=0.0,
        pod_outer_y=0.0,
        glow_x_bands=((0.24, 0.28), (0.44, 0.48)),
        glow_z_min=0.54,
        glow_face_x_span_max=0.04,
        blue_panel_x_bands=((0.20, 0.32),),
        glow_y_bands=((0.46, 0.54), (0.46, 0.54)),
    ),
}

ACTIVE_HULLS = ("light_cruiser", "heavy_cruiser")


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


def ensure_mask_attribute(mesh, name):
    old = mesh.color_attributes.get(name)
    if old:
        mesh.color_attributes.remove(old)
    attr = mesh.color_attributes.new(
        name=name, type="BYTE_COLOR", domain="CORNER"
    )
    for datum in attr.data:
        datum.color = NO_EMISSION
    return attr


def ensure_emission_attribute(mesh):
    return ensure_mask_attribute(mesh, "LegibilityEmission")


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


def is_class_paint(config: HullConfig, xn: float, yn: float, zn: float, normal_z: float) -> bool:
    if config.paint_mode == "dark_prow_spine_wedge":
        return is_wedge(config, xn, yn, zn, normal_z)
    if config.paint_mode not in ("light_drum_block", "dark_drum_with_blue_panels"):
        return False
    if zn < config.wedge_z_min or normal_z < config.dorsal_normal_z:
        return False
    if not is_central_drum(config, xn, yn):
        return False
    if config.paint_mode == "dark_drum_with_blue_panels":
        return not any(lo <= xn <= hi for lo, hi in config.blue_panel_x_bands)
    return True


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
    if config.emission_mode in ("three_even_dorsal_groups", "paired_fore_aft_groups"):
        if (
            zn < config.glow_z_min
            or abs(yn) > config.central_half_width * 0.66
            or face_x_span > config.glow_face_x_span_max
        ):
            return False
        return any(lo <= xn <= hi for lo, hi in config.glow_x_bands)
    return False


@dataclass(frozen=True)
class BlueRegion:
    face_indices: Tuple[int, ...]
    dorsal_centroid: Vector
    dorsal_area: float
    total_area: float


@dataclass(frozen=True)
class ColourRegion:
    face_indices: Tuple[int, ...]
    centroid: Vector
    total_area: float


def position_key(point: Vector) -> Tuple[int, int, int]:
    return tuple(round(point[axis] / WELD_EPSILON) for axis in range(3))


def build_colour_regions(obj, palette_name: str):
    """Flood-fill one authored colour across geometric edges after welding."""
    mesh = obj.data
    color_attr = mesh.color_attributes["Color"]
    colour_faces = [
        poly for poly in mesh.polygons
        if dominant_face_colour(poly, color_attr) == palette_name
    ]
    parent = {poly.index: poly.index for poly in colour_faces}

    def find(index):
        root = index
        while parent[root] != root:
            root = parent[root]
        while index != root:
            next_index = parent[index]
            parent[index] = root
            index = next_index
        return root

    def union(a, b):
        root_a, root_b = find(a), find(b)
        if root_a != root_b:
            parent[root_b] = root_a

    world_vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    edge_faces = defaultdict(list)
    for poly in colour_faces:
        keys = [position_key(world_vertices[index]) for index in poly.vertices]
        for edge_index, first in enumerate(keys):
            second = keys[(edge_index + 1) % len(keys)]
            edge_faces[tuple(sorted((first, second)))].append(poly.index)
    for owners in edge_faces.values():
        for owner in owners[1:]:
            union(owners[0], owner)

    grouped = defaultdict(list)
    for poly in colour_faces:
        grouped[find(poly.index)].append(poly)

    regions = []
    for polys in grouped.values():
        total_area = sum(poly.area for poly in polys)
        weighted = sum(
            ((obj.matrix_world @ poly.center) * poly.area for poly in polys),
            Vector(),
        )
        regions.append(
            ColourRegion(
                face_indices=tuple(poly.index for poly in polys),
                centroid=weighted / total_area,
                total_area=total_area,
            )
        )
    return regions


def build_blue_regions(obj, config: HullConfig, frame: HullFrame):
    """Add dorsal measurements to complete, position-welded blue regions."""
    mesh = obj.data
    regions = []
    eligible_dorsal_blue_area = 0.0
    for colour_region in build_colour_regions(obj, "blue"):
        polys = [mesh.polygons[index] for index in colour_region.face_indices]
        dorsal_faces = []
        for poly in polys:
            center = obj.matrix_world @ poly.center
            normal = (obj.matrix_world.to_3x3() @ poly.normal).normalized()
            _xn, _yn, zn = frame.normalized(center)
            if is_dorsal(config, zn, normal.z):
                dorsal_faces.append(poly)
        dorsal_area = sum(poly.area for poly in dorsal_faces)
        eligible_dorsal_blue_area += dorsal_area
        if dorsal_area:
            weighted = sum(
                ((obj.matrix_world @ poly.center) * poly.area for poly in dorsal_faces),
                Vector(),
            )
            dorsal_centroid = weighted / dorsal_area
        else:
            dorsal_centroid = Vector((math.nan, math.nan, math.nan))
        regions.append(
            BlueRegion(
                face_indices=tuple(poly.index for poly in polys),
                dorsal_centroid=dorsal_centroid,
                dorsal_area=dorsal_area,
                total_area=colour_region.total_area,
            )
        )
    return regions, eligible_dorsal_blue_area


def is_glow_region(config: HullConfig, xn: float, yn: float, zn: float) -> bool:
    if zn < config.glow_z_min:
        return False
    absolute_y = abs(yn)
    if config.glow_y_bands:
        return any(
            x_low <= xn <= x_high and y_low <= absolute_y <= y_high
            for (x_low, x_high), (y_low, y_high)
            in zip(config.glow_x_bands, config.glow_y_bands)
        )
    return any(low <= xn <= high for low, high in config.glow_x_bands)


def recolour_region(mesh, region: BlueRegion, color_attr, colour) -> None:
    for face_index in region.face_indices:
        for loop_index in mesh.polygons[face_index].loop_indices:
            color_attr.data[loop_index].color = colour


def mark_regions_emissive(mesh, emission_attr, regions: Iterable) -> int:
    face_count = 0
    for region in regions:
        face_count += len(region.face_indices)
        for face_index in region.face_indices:
            for loop_index in mesh.polygons[face_index].loop_indices:
                emission_attr.data[loop_index].color = MASK_ON
    return face_count


def apply_after_scheme(obj, config: HullConfig, frame: HullFrame) -> dict:
    mesh = obj.data
    color_attr = mesh.color_attributes["Color"]
    emission_attr = ensure_emission_attribute(mesh)
    regions, eligible_dorsal_blue_area = build_blue_regions(obj, config, frame)
    red_regions = build_colour_regions(obj, "red")
    green_regions = build_colour_regions(obj, "green")
    light_gray_regions = build_colour_regions(obj, "light_gray")
    window_regions = [
        region for region in light_gray_regions
        if region.total_area <= WINDOW_COMPONENT_AREA_MAX
    ]
    class_regions = []
    glow_regions = []

    for region in regions:
        if not region.dorsal_area:
            continue
        xn, yn, zn = frame.normalized(region.dorsal_centroid)
        if is_class_paint(config, xn, yn, zn, 1.0):
            class_regions.append(region)
        if is_glow_region(config, xn, yn, zn):
            glow_regions.append(region)

    class_colour = (
        CLASS_LIGHT_SRGB if config.paint_mode == "light_drum_block"
        else DARK_NAVY_SRGB
    )
    for region in class_regions:
        recolour_region(mesh, region, color_attr, class_colour)

    # Glow regions are also whole position-welded blue regions.  Their sRGB
    # core colour is written in the source file's encoded convention, and only
    # these complete regions receive the explicit emission mask.
    for region in glow_regions:
        recolour_region(mesh, region, color_attr, SYSTEM_CORE_SRGB)

    cyan_faces = mark_regions_emissive(mesh, emission_attr, glow_regions)
    red_faces = mark_regions_emissive(mesh, emission_attr, red_regions)
    window_faces = mark_regions_emissive(mesh, emission_attr, window_regions)
    green_faces = mark_regions_emissive(mesh, emission_attr, green_regions)

    # A selected or untouched source-blue region must remain one uniform
    # per-face colour after the pass.  Any mixed result would mean a mask cut
    # through a welded panel and would recreate the visible sliver problem.
    for region in regions:
        region_colours = {
            tuple(round(channel, 5) for channel in color_attr.data[loop_index].color)
            for face_index in region.face_indices
            for loop_index in mesh.polygons[face_index].loop_indices
        }
        if len(region_colours) != 1:
            raise RuntimeError(
                "%s blue region contains %d colours after panel snapping"
                % (config.label, len(region_colours))
            )

    def centroid_list(selected):
        return [
            tuple(round(value, 3) for value in frame.normalized(region.dorsal_centroid))
            for region in selected
        ]

    print("PANEL_REGIONS", config.key, "blue=%d class=%s glow=%s" % (
        len(regions), centroid_list(class_regions), centroid_list(glow_regions)
    ))
    print(
        "LIT_SYSTEM_REGIONS %s cyan=%d red=%d white_windows=%d/%d green=%d "
        "window_area_max=%.1f"
        % (
            config.key,
            len(glow_regions),
            len(red_regions),
            len(window_regions),
            len(light_gray_regions),
            len(green_regions),
            WINDOW_COMPONENT_AREA_MAX,
        )
    )

    return {
        "painted_faces": sum(len(region.face_indices) for region in class_regions),
        "painted_area": sum(region.dorsal_area for region in class_regions),
        "glow_faces": sum(len(region.face_indices) for region in glow_regions),
        "glow_area": sum(region.dorsal_area for region in glow_regions),
        "painted_regions": len(class_regions),
        "glow_regions": len(glow_regions),
        "eligible_dorsal_blue_area": eligible_dorsal_blue_area,
        "cyan_emissive_faces": cyan_faces,
        "red_emissive_faces": red_faces,
        "window_emissive_faces": window_faces,
        "window_emissive_regions": len(window_regions),
        "light_gray_regions": len(light_gray_regions),
        "green_emissive_faces": green_faces,
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
    decode = nodes.new("ShaderNodeGamma")
    decode.inputs["Gamma"].default_value = 2.2
    links.new(base.outputs["Color"], decode.inputs["Color"])

    emission = nodes.new("ShaderNodeVertexColor")
    emission.layer_name = "LegibilityEmission"
    emission_rgb = nodes.new("ShaderNodeSeparateColor")
    links.new(emission.outputs["Color"], emission_rgb.inputs["Color"])
    strength = nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = emission_strength
    links.new(emission_rgb.outputs["Red"], strength.inputs[0])

    bsdf.inputs["Roughness"].default_value = 0.60
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.20
    links.new(decode.outputs["Color"], bsdf.inputs["Base Color"])
    # The decoded base colour drives emission for every masked face.  Cyan
    # stations receive SYSTEM_CORE_SRGB; red, white, and green retain their
    # authored hues.  The face mask controls where strength is nonzero.
    links.new(decode.outputs["Color"], bsdf.inputs["Emission Color"])
    links.new(strength.outputs[0], bsdf.inputs["Emission Strength"])
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
        camera.data.shift_x = 0.0
        camera.data.shift_y = 0.0
        camera.location = frame.center + Vector((0.0, 0.0, span * 2.0))
        camera.rotation_euler = (0.0, 0.0, 0.0)
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


def projected_vertex_bounds(obj, camera):
    """Return exact camera-plane bounds from every mesh vertex."""
    bpy.context.view_layer.update()
    world_to_camera = camera.matrix_world.inverted()
    projected = [
        world_to_camera @ (obj.matrix_world @ vertex.co)
        for vertex in obj.data.vertices
    ]
    return (
        min(point.x for point in projected),
        max(point.x for point in projected),
        min(point.y for point in projected),
        max(point.y for point in projected),
    )


def fit_sprite_camera(scene, camera, obj, frame: HullFrame, scale: int):
    """Centre and fit the complete projected mesh with 8 px nominal clearance."""
    width = SPRITE_TILE_PIXELS * scale
    height = SPRITE_TILE_PIXELS * scale
    aspect = (
        width * scene.render.pixel_aspect_x
        / (height * scene.render.pixel_aspect_y)
    )
    camera.data.type = "ORTHO"
    camera.data.shift_x = 0.0
    camera.data.shift_y = 0.0
    camera.location = frame.center + Vector((0.0, 0.0, max(frame.size) * 2.0))
    camera.rotation_euler = (0.0, 0.0, 0.0)

    min_x, max_x, min_y, max_y = projected_vertex_bounds(obj, camera)
    centre_x = (min_x + max_x) * 0.5
    centre_y = (min_y + max_y) * 0.5
    camera_right = camera.matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))
    camera_up = camera.matrix_world.to_3x3() @ Vector((0.0, 1.0, 0.0))
    camera.location += camera_right * centre_x + camera_up * centre_y
    bpy.context.view_layer.update()

    min_x, max_x, min_y, max_y = projected_vertex_bounds(obj, camera)
    projected_width = max_x - min_x
    projected_height = max_y - min_y
    fill_fraction = SPRITE_SILHOUETTE_PIXELS / SPRITE_TILE_PIXELS
    camera.data.ortho_scale = max(
        projected_height,
        projected_width / aspect,
    ) / fill_fraction
    expected_width = projected_width / (camera.data.ortho_scale * aspect) * width
    expected_height = projected_height / camera.data.ortho_scale * height
    print(
        "SPRITE_PROJECTED_FIT %s %dx expected=%.2fx%.2f px vertex_bounds="
        "(%.5f,%.5f,%.5f,%.5f)"
        % (
            obj.name,
            scale,
            expected_width,
            expected_height,
            min_x,
            max_x,
            min_y,
            max_y,
        )
    )


def non_background_pixel_bounds(filepath: str, region=None):
    """Measure RGB pixels that differ visibly from the tile's corner pixel."""
    image = bpy.data.images.load(filepath, check_existing=False)
    try:
        width, height = image.size
        pixels = array("f", [0.0]) * (width * height * 4)
        image.pixels.foreach_get(pixels)
        if region is None:
            x0, y0, region_width, region_height = 0, 0, width, height
        else:
            x0, y0, region_width, region_height = region
        background_offset = (y0 * width + x0) * 4
        background = pixels[background_offset:background_offset + 3]
        tolerance = 3.0 / 255.0
        min_x, min_y = region_width, region_height
        max_x = max_y = -1
        for local_y in range(region_height):
            for local_x in range(region_width):
                offset = ((y0 + local_y) * width + x0 + local_x) * 4
                if max(
                    abs(pixels[offset + channel] - background[channel])
                    for channel in range(3)
                ) > tolerance:
                    min_x = min(min_x, local_x)
                    max_x = max(max_x, local_x)
                    min_y = min(min_y, local_y)
                    max_y = max(max_y, local_y)
        if max_x < 0:
            raise RuntimeError("No non-background pixels found in %s" % filepath)
        return min_x, max_x, min_y, max_y
    finally:
        bpy.data.images.remove(image)


def verify_sprite_bounds(filepath: str, scale: int, label: str, region=None):
    bounds = non_background_pixel_bounds(filepath, region)
    tile_size = SPRITE_TILE_PIXELS * scale
    min_x, max_x, min_y, max_y = bounds
    clearance = (min_x, tile_size - 1 - max_x, min_y, tile_size - 1 - max_y)
    minimum = SPRITE_MIN_CLEARANCE_PIXELS * scale
    if min(clearance) < minimum:
        raise RuntimeError(
            "%s sprite clearance %s is below %d px" % (label, clearance, minimum)
        )
    print(
        "SPRITE_PIXEL_BOUNDS %s x=%d..%d y=%d..%d clearance=%s"
        % (label, min_x, max_x, min_y, max_y, clearance)
    )
    return bounds


def render_sprite_tile(scene, camera, before, after, frame: HullFrame, state: str, filepath: str, scale: int) -> None:
    """Render one square tile with the full silhouette fitted from all vertices."""
    set_visibility(before, after, state)
    scene.render.resolution_x = SPRITE_TILE_PIXELS * scale
    scene.render.resolution_y = SPRITE_TILE_PIXELS * scale
    fit_sprite_camera(scene, camera, before, frame, scale)
    scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    verify_sprite_bounds(filepath, scale, "%s-%s-%dx" % (before.name, state, scale))


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


def assemble_sprite_strip(tile_paths, output_path: str, scale: int) -> None:
    """Join CL-before, CL-after, CA-before, CA-after without resampling."""
    tile_width = SPRITE_TILE_PIXELS * scale
    tile_height = SPRITE_TILE_PIXELS * scale
    draw_commands = []
    for index, path in enumerate(tile_paths):
        draw_commands.append(
            "$img=[Drawing.Image]::FromFile(%s); "
            "$dest=[Drawing.Rectangle]::new(%d,0,%d,%d); "
            "$g.DrawImage($img,$dest,0,0,%d,%d,[Drawing.GraphicsUnit]::Pixel); "
            "$img.Dispose();"
            % (
                powershell_quote(path),
                index * tile_width,
                tile_width,
                tile_height,
                tile_width,
                tile_height,
            )
        )
    script = (
        "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; "
        "$canvas=New-Object Drawing.Bitmap %d,%d; " % (tile_width * 4, tile_height)
        + "$g=[Drawing.Graphics]::FromImage($canvas); "
        + "$g.Clear([Drawing.Color]::FromArgb(255,5,6,9)); "
        + " ".join(draw_commands)
        + " $canvas.Save(%s,[Drawing.Imaging.ImageFormat]::Png); " % powershell_quote(output_path)
        + "$g.Dispose(); $canvas.Dispose();"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        check=True,
    )


def process_hull(config: HullConfig, sprite_dir: str):
    reset_scene()
    before = import_hull(config)
    frame = world_frame(before)
    ensure_emission_attribute(before.data)

    after = before.copy()
    after.data = before.data.copy()
    after.name = config.key + "_after"
    bpy.context.scene.collection.objects.link(after)
    metrics = apply_after_scheme(after, config, frame)
    ratio = 100.0 * metrics["painted_area"] / max(metrics["eligible_dorsal_blue_area"], 1e-6)
    if not 20.0 <= ratio <= 35.0:
        print(
            "PANEL_SHARE_NOTE %s class paint covers %.1f%% of eligible dorsal blue; "
            "panel snapping takes precedence over the 20-35%% target"
            % (config.label, ratio)
        )

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

    sprite_paths = {1: {}, 4: {}}
    for scale in (1, 4):
        for state in ("before", "after"):
            sprite_path = os.path.join(sprite_dir, "%s_%s_%dx.png" % (config.key, state, scale))
            print("RENDER", sprite_path)
            render_sprite_tile(scene, camera, before, after, frame, state, sprite_path, scale)
            sprite_paths[scale][state] = sprite_path

    composite_path = os.path.join(OUTPUT_DIR, "%s_composite.png" % config.key)
    print("RENDER", composite_path)
    render_composite(source_paths, composite_path)

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
    return sprite_paths, metrics


if __name__ == "__main__":
    all_sprite_paths = {}
    with tempfile.TemporaryDirectory(prefix="legibility_sprites_") as sprite_dir:
        for hull_key in ACTIVE_HULLS:
            all_sprite_paths[hull_key], _metrics = process_hull(HULLS[hull_key], sprite_dir)
        for scale, suffix in ((1, ""), (4, "_4x")):
            ordered = [
                all_sprite_paths["light_cruiser"][scale]["before"],
                all_sprite_paths["light_cruiser"][scale]["after"],
                all_sprite_paths["heavy_cruiser"][scale]["before"],
                all_sprite_paths["heavy_cruiser"][scale]["after"],
            ]
            strip_path = os.path.join(OUTPUT_DIR, "cruisers_sprite_strip%s.png" % suffix)
            print("ASSEMBLE", strip_path)
            assemble_sprite_strip(ordered, strip_path, scale)
            tile_size = SPRITE_TILE_PIXELS * scale
            labels = ("CL-before", "CL-after", "CA-before", "CA-after")
            for index, label in enumerate(labels):
                verify_sprite_bounds(
                    strip_path,
                    scale,
                    "%s-strip-%dx" % (label, scale),
                    region=(index * tile_size, 0, tile_size, tile_size),
                )
    print("LEGIBILITY_DEMO_DONE")
