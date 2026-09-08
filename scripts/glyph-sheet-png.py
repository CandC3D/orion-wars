"""Rasterise the generated glyphs into a PNG sheet.

The glyphs are SVG and the review gate reads images, so without this there is no
way to look at them except by asking a human - which is how a regression reached
Chris twice. The paths this pipeline emits are plain polygons (M/L...Z only), so
they can be filled directly with PIL; no SVG engine is needed.

  python scripts/glyph-sheet-png.py --faction KRE --out review/kre.png
"""
import argparse
import glob
import os
import re

from PIL import Image, ImageDraw

CELL = 260
PAD = 18


def parse_paths(svg):
    """Return [(fill, stroke, stroke_width, [(x, y), ...]), ...] in 0-100 space."""
    out = []
    for m in re.finditer(r'<path\b([^>]*)/>', svg):
        attrs = m.group(1)
        d = re.search(r'\bd="([^"]+)"', attrs)
        if not d:
            continue
        fill = re.search(r'\bfill="([^"]+)"', attrs)
        stroke = re.search(r'\bstroke="([^"]+)"', attrs)
        width = re.search(r'\bstroke-width="([^"]+)"', attrs)
        subs = []
        for chunk in d.group(1).split("Z"):
            nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', chunk)]
            pts = list(zip(nums[0::2], nums[1::2]))
            if len(pts) >= 3:
                subs.append(pts)
        if subs:
            out.append((
                None if not fill or fill.group(1) == "none" else fill.group(1),
                None if not stroke or stroke.group(1) == "none" else stroke.group(1),
                float(width.group(1)) if width else 1.0,
                subs,
            ))
    return out


def render(svg_path, size, bg=(13, 22, 32)):
    svg = open(svg_path, encoding="utf-8").read()
    ss = 4                                    # supersample, then downscale
    img = Image.new("RGB", (size * ss, size * ss), bg)
    dr = ImageDraw.Draw(img)
    k = size * ss / 100.0
    for fill, stroke, width, subs in parse_paths(svg):
        polys = [[(x * k, y * k) for x, y in pts] for pts in subs]
        if fill:
            # Even-odd: the first subpath is the outline, the rest are holes, so
            # build a mask and punch them out rather than painting them solid.
            mask = Image.new("L", img.size, 0)
            md = ImageDraw.Draw(mask)
            md.polygon(polys[0], fill=255)
            for hole in polys[1:]:
                md.polygon(hole, fill=0)
            img.paste(Image.new("RGB", img.size, fill), (0, 0), mask)
        if stroke:
            for poly in polys:
                dr.line(poly + [poly[0]], fill=stroke,
                        width=max(1, int(round(width * k))), joint="curve")
    return img.resize((size, size), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--faction", required=True)
    ap.add_argument("--icons", default="assets/blender/renders/v3/icons")
    ap.add_argument("--detail", default="console")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cell", type=int, default=CELL)
    args = ap.parse_args()

    pre = args.faction.lower()
    files = sorted(glob.glob(os.path.join(args.icons, "%s_*_%s.svg" % (pre, args.detail))))
    if not files:
        raise SystemExit("no glyphs found for %s" % args.faction)

    cols = 4
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (args.cell + PAD) + PAD,
                              rows * (args.cell + PAD + 22) + PAD), (8, 13, 19))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        cx = PAD + (i % cols) * (args.cell + PAD)
        cy = PAD + (i // cols) * (args.cell + PAD + 22)
        sheet.paste(render(f, args.cell), (cx, cy))
        name = os.path.basename(f).replace("_%s.svg" % args.detail, "").replace(pre + "_", "")
        dr.text((cx + 2, cy + args.cell + 5), name, fill=(140, 165, 185))
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    sheet.save(args.out)
    print("wrote %s (%d glyphs, %dx%d)" % (args.out, len(files), sheet.width, sheet.height))


if __name__ == "__main__":
    main()
