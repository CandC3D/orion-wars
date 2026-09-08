"""Trace a ship's plan-view masks into a console glyph / paper-doll SVG.

The console loads this with <image href>, so it cannot inherit CSS colour - the
faction palette is baked in. Output matches the convention already in
assets/icons/ (viewBox 0 0 100 100, bow up), so a generated file drops in.

DETAIL LEVELS exist because the same hull is wanted at very different sizes and
for different jobs:

  map      28px on the tactical map. Faction colour and silhouette only. Any
           internal feature at this size is mush, so there is almost none.
  console  120px inside the shield ring. This is the PAPER DOLL: weapon lamps
           are placed at their physical positions on the hull, so the structural
           bands have to stay legible or a turret has nothing to sit against.
  full     Large display. Every traced feature, finest tolerance.

The structural bands are separated by a DARKER EDGE, not a lighter fill. A pale
fill over a mid-blue hull has almost no contrast and adjacent bands bleed into a
single shape; an outline holds them apart at any size.

  python scripts/trace-ship-icon.py --slug earth_frigate --faction EAR \
      --view top --detail console --out assets/icons/ear_frigate.svg
"""
import argparse
import os

from PIL import Image

# Faction palettes, extending the colours already used in assets/icons/.
FACTIONS = {
    "EAR": {"wire": "#57d6ff", "fill": "#4f8ef7", "line": "#1b2f6b", "band": "#a9c9f7", "edge": "#24408c", "lit": "#ff5a4d", "trim": "#f0a63a", "deep": "#2f6ac4"},
    "VRA": {"wire": "#ffd166", "fill": "#e0b02e", "line": "#5f4506", "band": "#f7e3a8", "edge": "#8a6608", "lit": "#ff8a3d", "trim": "#b57d12", "deep": "#c2941f"},
    "ZAN": {"wire": "#ff7a66", "fill": "#e0574a", "line": "#611711", "band": "#f7c3bc", "edge": "#8f2419", "lit": "#ffd23d", "trim": "#b03a2e", "deep": "#c04537"},
    "KRE": {"wire": "#6ee7a0", "fill": "#4fae7a", "line": "#0f3f24", "band": "#bfe8d2", "edge": "#1c6238", "lit": "#9be36a", "trim": "#2e8f5c", "deep": "#3a9668"},
}

# per level: hull stroke width, band fill opacity, band stroke width, trace
# tolerance, minimum band blob area as a fraction of the frame, layers drawn.
DETAIL = {
    # map keeps a heavy outline so the silhouette survives 28px, but it now
    # carries the same structure the other levels do rather than a bare shape.
    "map":     dict(hull_stroke=3.4, band_fill=0.5,  band_stroke=0.8, eps=1.1, min_band=0.0009, layers=("hull", "deep", "metal", "trim", "lit")),
    "console": dict(hull_stroke=2.4, band_fill=0.58, band_stroke=1.0, eps=0.8, min_band=0.0004, layers=("hull", "deep", "metal", "trim", "lit")),
    "full":    dict(hull_stroke=2.0, band_fill=0.62, band_stroke=0.9, eps=0.6, min_band=0.0003, layers=("hull", "deep", "metal", "trim", "lit")),
    # Line only, for a large systems display: no fills, one accent colour, every
    # region boundary drawn as an edge. This is the damage-report aesthetic
    # rather than the map token, so it assumes room to be read.
    "wire":    dict(hull_stroke=1.4, band_fill=0.0,  band_stroke=0.8, eps=0.5, min_band=0.0002, layers=("hull", "deep", "metal", "trim", "lit"), wire=True),
}


def load_mask(path, threshold=110):
    img = Image.open(path).convert("L")
    w, h = img.size
    px = img.load()
    return [[1 if px[x, y] >= threshold else 0 for x in range(w)] for y in range(h)], w, h


def trace_contours(grid, w, h, min_area_px):
    """Flood-fill each blob, then walk its border (Moore neighbourhood)."""
    seen = [[False] * w for _ in range(h)]
    contours = []
    for sy in range(h):
        for sx in range(w):
            if grid[sy][sx] != 1 or seen[sy][sx]:
                continue
            stack, blob = [(sx, sy)], []
            seen[sy][sx] = True
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and grid[ny][nx] == 1 and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if len(blob) < min_area_px:
                continue
            member = set(blob)
            start = min(blob, key=lambda p: (p[1], p[0]))
            nbrs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
            contour, cur, back = [start], start, 4
            guard = 0
            while guard < 8 * len(blob) + 64:
                guard += 1
                found = False
                for step in range(8):
                    d = (back + 1 + step) % 8
                    nx, ny = cur[0] + nbrs[d][0], cur[1] + nbrs[d][1]
                    if (nx, ny) in member:
                        back = (d + 5) % 8
                        cur = (nx, ny)
                        contour.append(cur)
                        found = True
                        break
                if not found or (len(contour) > 2 and cur == start):
                    break
            contours.append(contour)
    return contours


def simplify(points, epsilon):
    """Douglas-Peucker on an open polyline."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    norm = (dx * dx + dy * dy) ** 0.5 or 1.0
    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        dist = abs(dy * px - dx * py + bx * ay - by * ax) / norm
        if dist > worst:
            worst, index = dist, i
    if worst > epsilon:
        return simplify(points[:index + 1], epsilon)[:-1] + simplify(points[index:], epsilon)
    return [points[0], points[-1]]


def simplify_closed(points, epsilon):
    """Run naively on a closed ring, the first and last point are the same, the
    baseline has zero length, and the whole ring collapses to two points. Split
    at the point farthest from the start so each half has a real baseline."""
    ring = points[:-1] if len(points) > 1 and points[0] == points[-1] else points[:]
    if len(ring) < 4:
        return ring
    ax, ay = ring[0]
    far = max(range(1, len(ring)), key=lambda i: (ring[i][0] - ax) ** 2 + (ring[i][1] - ay) ** 2)
    return simplify(ring[:far + 1], epsilon)[:-1] + simplify(ring[far:] + [ring[0]], epsilon)[:-1]


def measure(contours, w, h):
    """Where each traced blob sits, in the same 0-100 space as the emitted paths.

    This is what a LIVE damage-marker system binds to: a marker can be placed on
    the real feature - this nav light, that structural band, the dish - instead
    of at a guessed offset. Nothing is baked into the drawing.
    """
    out = []
    for contour in contours:
        xs = [p[0] for p in contour]
        ys = [p[1] for p in contour]
        sx, sy = 100.0 / w, 100.0 / h
        out.append({
            "cx": round(sum(xs) / len(xs) * sx, 2),
            "cy": round(sum(ys) / len(ys) * sy, 2),
            "x0": round(min(xs) * sx, 2), "y0": round(min(ys) * sy, 2),
            "x1": round(max(xs) * sx, 2), "y1": round(max(ys) * sy, 2),
            "px": len(contour),
        })
    return out


def to_paths(contours, w, h, epsilon, decimals=1):
    """Scale pixel contours into the 0-100 viewBox. One path per blob, so each
    structural band carries its own edge instead of merging into one shape."""
    out = []
    for contour in contours:
        pts = simplify_closed(contour, epsilon)
        if len(pts) < 3:
            continue
        d = []
        for i, (x, y) in enumerate(pts):
            d.append("%s%g %g" % ("M" if i == 0 else "L",
                                  round(x * 100.0 / w, decimals), round(y * 100.0 / h, decimals)))
        out.append(" ".join(d) + " Z")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--faction", required=True, choices=sorted(FACTIONS))
    ap.add_argument("--view", default="top", help="one view, or several comma-separated for a multi-view sheet")
    ap.add_argument("--layout", default="row", choices=("row", "column"))
    ap.add_argument("--stroke", default=None, help="override the line colour")
    ap.add_argument("--anchors", default=None, help="also write feature anchors as JSON")
    ap.add_argument("--detail", default="console", choices=sorted(DETAIL))
    ap.add_argument("--masks", default="assets/blender/renders/v3/masks")
    ap.add_argument("--size", type=int, default=64, help="rendered width/height attribute")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    pal = FACTIONS[args.faction]
    spec = DETAIL[args.detail]
    wire = bool(spec.get("wire"))
    views = [v.strip() for v in args.view.split(",") if v.strip()]

    anchors = {}

    def trace_view(view):
        got = {}
        found = {}
        for tag in spec["layers"]:
            path = os.path.join(args.masks, "%s_%s_%s.png" % (args.slug, view, tag))
            if not os.path.exists(path):
                legacy = os.path.join(args.masks, "%s_%s.png" % (args.slug, tag))
                if os.path.exists(legacy):
                    path = legacy
            if not os.path.exists(path):
                continue
            grid, w, h = load_mask(path)
            min_frac = (0.0015 if tag == "hull"
                        else 0.0002 if tag in ("trim", "lit")
                        else spec["min_band"])
            eps = spec["eps"] * (1.0 if tag == "hull" else 1.3)
            contours = trace_contours(grid, w, h, int(w * h * min_frac))
            got[tag] = to_paths(contours, w, h, eps)
            found[tag] = measure(contours, w, h)
        anchors[view] = found
        return got

    def draw(layers, dx, dy):
        line = args.stroke or pal.get("wire", "#8fd6ff")
        out = ['<g transform="translate(%g %g)">' % (dx, dy)]
        if wire:
            # Every region contributes its boundary; nothing is filled.
            for tag, width in (("hull", spec["hull_stroke"]), ("deep", spec["band_stroke"] * 0.7),
                               ("metal", spec["band_stroke"]), ("trim", spec["band_stroke"]),
                               ("lit", spec["band_stroke"])):
                for d in layers.get(tag, []):
                    out.append('<path d="%s" fill="none" stroke="%s" stroke-width="%g" '
                               'stroke-linejoin="round" opacity="%g"/>'
                               % (d, line, width, 1.0 if tag == "hull" else 0.8))
        else:
            out.append('<path d="%s" fill="%s" stroke="%s" stroke-width="%g" stroke-linejoin="round"/>'
                       % (" ".join(layers["hull"]), pal["fill"], pal["line"], spec["hull_stroke"]))
            for d in layers.get("deep", []):
                out.append('<path d="%s" fill="%s" fill-opacity="0.9"/>' % (d, pal["deep"]))
            for d in layers.get("metal", []):
                out.append('<path d="%s" fill="%s" fill-opacity="%g" stroke="%s" stroke-width="%g" '
                           'stroke-linejoin="round"/>'
                           % (d, pal["band"], spec["band_fill"], pal["edge"], spec["band_stroke"]))
            for d in layers.get("trim", []):
                out.append('<path d="%s" fill="%s" stroke="%s" stroke-width="%g" stroke-linejoin="round"/>'
                           % (d, pal["trim"], pal["edge"], spec["band_stroke"] * 0.8))
            for d in layers.get("lit", []):
                out.append('<path d="%s" fill="%s"/>' % (d, pal["lit"]))
        out.append("</g>")
        return chr(10).join(out)

    panels = []
    for view in views:
        layers = trace_view(view)
        if not layers.get("hull"):
            print("no hull traced for view %s - skipping" % view)
            continue
        print("%-8s %s" % (view, " ".join("%s:%d" % (t, len(v)) for t, v in layers.items())))
        panels.append(layers)
    if not panels:
        raise SystemExit("nothing traced - are the masks present?")

    across = len(panels) if args.layout == "row" else 1
    down = 1 if args.layout == "row" else len(panels)
    vb_w, vb_h = 100 * across, 100 * down
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" width="%d" height="%d">'
           % (vb_w, vb_h, args.size * across, args.size * down)]
    for i, layers in enumerate(panels):
        svg.append(draw(layers, 100 * i if args.layout == "row" else 0,
                        0 if args.layout == "row" else 100 * i))
    svg.append("</svg>")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(svg) + "\n")
    print("wrote %s (%d bytes, detail=%s, views=%s)"
          % (args.out, os.path.getsize(args.out), args.detail, ",".join(views)))

    if args.anchors:
        import json
        # Panel offsets so an anchor lands correctly on a multi-view sheet.
        placed = {}
        for i, view in enumerate([v for v in views if v in anchors]):
            dx = 100 * i if args.layout == "row" else 0
            dy = 0 if args.layout == "row" else 100 * i
            placed[view] = {
                "offset": {"x": dx, "y": dy},
                "features": {tag: [dict(a, cx=a["cx"] + dx, cy=a["cy"] + dy,
                                        x0=a["x0"] + dx, y0=a["y0"] + dy,
                                        x1=a["x1"] + dx, y1=a["y1"] + dy)
                                   for a in items]
                             for tag, items in anchors[view].items()},
            }
        doc = {"slug": args.slug, "faction": args.faction, "detail": args.detail,
               "layout": args.layout, "viewBox": [vb_w, vb_h], "views": placed}
        with open(args.anchors, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, indent=1)
        print("wrote %s (%d anchors)"
              % (args.anchors, sum(len(v) for p in placed.values() for v in p["features"].values())))


if __name__ == "__main__":
    main()
