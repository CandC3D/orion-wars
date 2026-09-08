"""Run the whole v3 chain across the Earth roster.

Per hull: coincident-shell cleanup -> plussing pass (asset GLB + turnaround) ->
plan-view masks -> class glyph SVG at map and console detail.

The seven hulls map one-to-one onto rosters.EAR in data/tactical-tuning.json,
and the slugs match the icon filenames already in assets/icons/, so a generated
glyph drops straight in.

  python scripts/build-earth-v3.py                 # everything
  python scripts/build-earth-v3.py --only frigate  # one hull
  python scripts/build-earth-v3.py --skip-plus     # glyphs only, reuse cleaned
"""
import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
SOURCE = r"C:\Users\chorr\Downloads\Earth Defense Force (EDF) Ship Models"

WORK = os.path.join(ROOT, "assets", "blender", "renders", "v3")
MASKS = os.path.join(WORK, "masks")
ICONS = os.path.join(WORK, "icons")          # staged, NOT written over assets/icons yet

# hull key -> (slug, source filename)
HULLS = [
    ("frigate",               "earth_frigate",               "Earth Monoceros Class Frigate v3 Series.glb"),
    ("destroyer",             "earth_destroyer",              "Earth Victory Class Destroyer v3 Series.glb"),
    ("missile-destroyer",     "earth_missile_destroyer",      "Earth Saturn Class Missile Destroyer v3 Series [NEW].glb"),
    ("light-cruiser",         "earth_light_cruiser",          "Earth Acamar Class Light Cruiser v3.glb"),
    ("heavy-cruiser",         "earth_heavy_cruiser",          "Earth Yi Sun-sin Class Heavy Cruiser v3 series.glb"),
    ("battleship",            "earth_battleship",             "Earth Federation Class Battleship v3 series.glb"),
    ("gunstar-battlecruiser", "earth_gunstar_battlecruiser",  "Earth Yamato Class Gunstar Battlecruiser v3 Series.glb"),
]


def blender(script, extra):
    cmd = [BLENDER, "--background", "--python", os.path.join(ROOT, "assets", "blender", "scripts", script), "--"] + extra
    done = subprocess.run(cmd, capture_output=True, text=True)
    return done.returncode, done.stdout + done.stderr


def note(out, *keys):
    for line in out.splitlines():
        if any(k in line for k in keys):
            print("      " + line.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="hull key, e.g. frigate")
    ap.add_argument("--skip-clean", action="store_true")
    ap.add_argument("--skip-plus", action="store_true")
    args = ap.parse_args()

    os.makedirs(MASKS, exist_ok=True)
    os.makedirs(ICONS, exist_ok=True)
    hulls = [h for h in HULLS if not args.only or h[0] == args.only]
    if not hulls:
        raise SystemExit("unknown hull; choose from %s" % ", ".join(h[0] for h in HULLS))

    failures = []
    for key, slug, filename in hulls:
        started = time.time()
        print("\n=== %s (%s)" % (key, slug))
        src = os.path.join(SOURCE, filename)
        if not os.path.exists(src):
            print("      SOURCE MISSING:", src)
            failures.append((key, "source missing"))
            continue

        cleaned = os.path.join(WORK, "%s_cleaned.glb" % slug)
        if not args.skip_clean or not os.path.exists(cleaned):
            code, out = blender("coincident_cleanup.py", [src, cleaned, "0.03"])
            note(out, "coincident", "CLEANUP faces")
            if code != 0 or not os.path.exists(cleaned):
                failures.append((key, "cleanup failed"))
                note(out, "Error", "Traceback")
                continue

        if not args.skip_plus:
            code, out = blender("earth_v3_plus.py", [
                "src=" + cleaned, "slug=" + slug, "mode=light", "out=" + WORK])
            note(out, "welded", "decimated", "REGION_GATE", "PLUSSED")
            if "REGION_GATE_FAILED" in out:
                failures.append((key, "region gate failed"))
            if code != 0:
                failures.append((key, "plussing failed"))
                note(out, "Error", "Traceback")
                continue

        code, out = blender("ship_schematic.py", [
            "src=" + cleaned, "slug=" + slug, "views=top", "out=" + MASKS])
        if code != 0:
            failures.append((key, "masks failed"))
            note(out, "Error", "Traceback")
            continue

        for detail, size in (("map", 28), ("console", 120)):
            done = subprocess.run([
                sys.executable, os.path.join(ROOT, "scripts", "trace-ship-icon.py"),
                "--slug", slug, "--faction", "EAR", "--view", "top",
                "--detail", detail, "--size", str(size), "--masks", MASKS,
                "--out", os.path.join(ICONS, "ear_%s_%s.svg" % (key.replace("-", "_"), detail)),
            ], capture_output=True, text=True)
            if done.returncode != 0:
                failures.append((key, "trace %s failed" % detail))
                print("      " + done.stdout.strip() + done.stderr.strip())
            else:
                note(done.stdout, "wrote")
        print("      %.0fs" % (time.time() - started))

    print("\n%d hulls attempted, %d problems" % (len(hulls), len(failures)))
    for key, why in failures:
        print("  FAILED %-24s %s" % (key, why))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
