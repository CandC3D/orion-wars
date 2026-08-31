"""Pixel-difference summary for the Light Cruiser mechanism renders."""
import bpy
import json
import os


ROOT = r"C:\Users\chorr\Documents\triangle_campaign"
DIR = os.path.join(ROOT, "assets", "blender", "preview", "earth_v2")
CASES = {
    "exact_pair_cleanup": (
        "v2inv_light_cruiser_starboard_mid_before.png",
        "v2inv_light_cruiser_starboard_mid_after_exact_pair_cleanup.png",
    ),
    "unsafe_near_surface_cleanup": (
        "v2inv_light_cruiser_starboard_mid_before.png",
        "v2inv_light_cruiser_starboard_mid_after_in_memory_cleanup.png",
    ),
}


def compare(a_name, b_name):
    a = bpy.data.images.load(os.path.join(DIR, a_name), check_existing=False)
    b = bpy.data.images.load(os.path.join(DIR, b_name), check_existing=False)
    pa = list(a.pixels)
    pb = list(b.pixels)
    pixels = len(pa) // 4
    changed_1 = 0
    changed_10 = 0
    sum_abs = 0.0
    max_abs = 0.0
    for i in range(pixels):
        d = max(abs(pa[i * 4 + c] - pb[i * 4 + c]) for c in range(3))
        sum_abs += d
        max_abs = max(max_abs, d)
        if d > 1.0 / 255.0:
            changed_1 += 1
        if d > 10.0 / 255.0:
            changed_10 += 1
    bpy.data.images.remove(a)
    bpy.data.images.remove(b)
    return {
        "pixels": pixels,
        "pixels_changed_gt_1_byte": changed_1,
        "fraction_changed_gt_1_byte": changed_1 / pixels,
        "pixels_changed_gt_10_bytes": changed_10,
        "fraction_changed_gt_10_bytes": changed_10 / pixels,
        "mean_max_channel_abs_difference": sum_abs / pixels,
        "max_channel_abs_difference": max_abs,
    }


result = {name: compare(*paths) for name, paths in CASES.items()}
with open(os.path.join(DIR, "v2inv_render_pixel_differences.json"), "w") as f:
    json.dump(result, f, indent=2)
print("V2INV_COMPARE_DONE", json.dumps(result, sort_keys=True), flush=True)
