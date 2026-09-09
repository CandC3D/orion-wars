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

import json

from PIL import Image

# Faction palettes live with the markup reading in data/ship-markup.json, so the
# glyph colours and the asset materials cannot drift apart.
_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(_REPO, "data", "ship-markup.json"), encoding="utf-8") as _fh:
    _MARKUP = json.load(_fh)
FACTIONS = {k: v["palette"] for k, v in _MARKUP.items() if not k.startswith("_")}
# Region -> its own glyph colour, so two regions sharing a role do not collapse
# into one colour (Krelath orange and yellow are both self-lit, and are not the
# same thing). Falls back to the role colour where a region has none.
GLYPH = {k: {r["key"]: r.get("glyph") for r in v["regions"]}
         for k, v in _MARKUP.items() if not k.startswith("_")}
ROLE_OF = {k: {r["key"]: r["role"] for r in v["regions"]}
           for k, v in _MARKUP.items() if not k.startswith("_")}
ROLES = {k: {r["key"]: r["role"] for r in v["regions"]} for k, v in _MARKUP.items() if not k.startswith("_")}

# per level: hull stroke, region edge stroke, trace tolerance, minimum blob area
# as a fraction of the frame, and which roles are drawn. Nothing is drawn
# semi-transparent: these are solid parts of a ship seen from above, and a
# translucent band over a dark hull is what muted the command spheres to
# cornflower.
DETAIL = {
    "map":     dict(hull_stroke=3.4, edge=0.8, eps=1.1, min_area=0.0012, roles=("hull", "deep", "metal", "trim", "lit"), creases=False),
    "console": dict(hull_stroke=2.4, edge=1.0, eps=0.8, min_area=0.0004, roles=("hull", "deep", "metal", "trim", "lit")),
    "full":    dict(hull_stroke=2.0, edge=0.9, eps=0.6, min_area=0.0002, roles=("hull", "deep", "metal", "trim", "lit")),
    "wire":    dict(hull_stroke=1.4, edge=0.8, eps=0.5, min_area=0.0002, roles=("hull", "deep", "metal", "trim", "lit"), wire=True),
}
# trim last: the Krelath carrier's flight deck is a large self-lit white
# surface, and its three red elevator hexes are painted markings ON that
# deck. Drawing lit after trim buried them under the deck.
# 'hull' is in here deliberately. The silhouette is painted first as one flat
# shape, but the hull-role REGIONS were then never drawn at all - so the dark
# green fin structures around the Krelath warp pods, which are hull_primary
# against the brighter hull, vanished along with their outlines.
ROLE_ORDER = ("hull", "deep", "metal", "lit", "trim")


def load_mask(path, threshold=110, symmetric=False):
    """Read a mask. Optionally force it symmetric about the vertical centreline.

    These hulls are bilaterally symmetric, but a mask traced pixel by pixel is
    not: antialiasing differs a fraction between the two sides, so the contour
    wanders and the result looks hand-drawn rather than schematic - and whole
    features appear on one side only, which is why the engine bells painted on
    the port nacelle and not the starboard. Mirroring one half onto the other
    removes both faults at the source.

    Not applied to the lit regions: a red light to port and a green to starboard
    are deliberately NOT symmetric, and mirroring would duplicate one and delete
    the other.
    """
    img = Image.open(path).convert("L")
    w, h = img.size
    px = img.load()
    grid = [[1 if px[x, y] >= threshold else 0 for x in range(w)] for y in range(h)]
    if symmetric:
        half = w // 2
        for y in range(h):
            row = grid[y]
            for x in range(half):
                row[w - 1 - x] = row[x]
    return grid, w, h


def find_holes(grid, w, h, min_area_px):
    """Background regions fully enclosed by the shape.

    Without these a ring fills as a disc. That is what turned the silver collar
    around every Earth command sphere into a solid plate and left the pod a
    featureless circle - the trace walked the outer boundary and threw the
    middle away.
    """
    seen = [[False] * w for _ in range(h)]
    holes = []
    for sy in range(h):
        for sx in range(w):
            if grid[sy][sx] != 0 or seen[sy][sx]:
                continue
            stack, blob, edge = [(sx, sy)], [], False
            seen[sy][sx] = True
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                if x in (0, w - 1) or y in (0, h - 1):
                    edge = True
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and grid[ny][nx] == 0 and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if edge or len(blob) < min_area_px:
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
                    dd = (back + 1 + step) % 8
                    nx, ny = cur[0] + nbrs[dd][0], cur[1] + nbrs[dd][1]
                    if (nx, ny) in member:
                        back = (dd + 5) % 8
                        cur = (nx, ny)
                        contour.append(cur)
                        found = True
                        break
                if not found or (len(contour) > 2 and cur == start):
                    break
            holes.append(contour)
    return holes


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


def min_span(d):
    """Narrowest dimension of a path's first subpath, in the 0-100 glyph space."""
    import re as _re
    first = d.split("Z")[0]
    nums = [float(x) for x in _re.findall(r'-?\d+\.?\d*', first)]
    xs, ys = nums[0::2], nums[1::2]
    if len(xs) < 3:
        return 0.0
    return min(max(xs) - min(xs), max(ys) - min(ys))


def inside(point, poly):
    x, y = point
    hit = False
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / ((y1 - y0) or 1e-9) + x0:
            hit = not hit
    return hit


def assign_holes(contours, holes):
    """Give each hole to the contour that encloses it.

    Emitting every blob of a region as one even-odd path made disjoint and
    nested blobs cancel: a bronze pod inside another bronze contour XORed itself
    away and the hull colour showed through. One path per contour, carrying only
    its own holes, keeps rings hollow without erasing anything.
    """
    groups = [[c] for c in contours]
    for hole in holes:
        probe = hole[0]
        best, best_area = None, None
        for i, c in enumerate(contours):
            if inside(probe, c):
                area = (max(x for x, _ in c) - min(x for x, _ in c)) *                        (max(y for _, y in c) - min(y for _, y in c))
                if best_area is None or area < best_area:
                    best, best_area = i, area
        if best is not None:
            groups[best].append(hole)
    return groups


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
        keys = [k for k in ROLE_OF[args.faction] if ROLE_OF[args.faction][k] in spec["roles"]] + ["hull"]
        if spec.get("creases", True):
            keys.append("creases")
        for key in keys:
            path = os.path.join(args.masks, "%s_%s_%s.png" % (args.slug, view, key))
            if not os.path.exists(path):
                continue
            role = ROLE_OF[args.faction].get(key)
            if key == "creases":
                role = "creases"
            grid, w, h = load_mask(path, symmetric=(role != "lit"))
            # Lights and painted marks are SMALL by nature - a nav light is
            # 28 px in a 768px frame - so they need their own floor. A single
            # threshold for every region discarded the red coolant fins on the
            # nacelles and the green starboard light entirely.
            if key == "hull":
                min_frac = 0.0015
            elif key == "creases":
                min_frac = 0.000004      # a fold line is a hairline by nature
            elif role in ("lit", "trim"):
                min_frac = 0.000015
            else:
                min_frac = spec["min_area"]
            eps = spec["eps"] * (1.0 if key == "hull" else 0.45 if key == "creases" else 0.7)
            contours = trace_contours(grid, w, h, int(w * h * min_frac))
            if contours:
                holes = find_holes(grid, w, h, max(24, int(w * h * min_frac * 0.35)))
                if key == "creases":
                    # The fold lines are one connected network, so the flood fill
                    # finds a single blob whose outer boundary is the silhouette.
                    # Filling that alone paints the whole ship solid: the shape
                    # of the line work lives entirely in the enclosed areas, so
                    # the holes are the drawing.
                    cell_holes = find_holes(grid, w, h, 6)
                    groups = assign_holes(contours, cell_holes)
                    got[key] = [d for d in (" ".join(to_paths(g, w, h, eps)) for g in groups) if d]
                else:
                    groups = assign_holes(contours, holes)
                    got[key] = [d for d in (" ".join(to_paths(g, w, h, eps)) for g in groups) if d]
                anchors.setdefault(view, {})[key] = measure(contours, w, h)
        return got

    def draw(layers, dx, dy):
        pal = FACTIONS[args.faction]
        colours = GLYPH[args.faction]
        roles = ROLE_OF[args.faction]
        out = ['<g transform="translate(%g %g)">' % (dx, dy)]
        if wire:
            line = args.stroke or pal.get("wire", "#8fd6ff")
            for key, paths in layers.items():
                width = spec["hull_stroke"] if key == "hull" else spec["edge"]
                for d in paths:
                    out.append('<path d="%s" fill="none" stroke="%s" stroke-width="%g" '
                               'stroke-linejoin="round" opacity="%g"/>'
                               % (d, line, width, 1.0 if key == "hull" else 0.8))
        else:
            for d in layers.get("hull", []):
                out.append('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" stroke-width="%g" '
                           'stroke-linejoin="round"/>'
                           % (d, pal["fill"], pal["line"], spec["hull_stroke"]))
            # Painted in role order so structure sits over hull shading and the
            # lights sit over everything. Every region carries its own colour and
            # its own dark edge, so adjacent parts stay distinct.
            for role in ROLE_ORDER:
                for key, paths in layers.items():
                    if key == "hull" or roles.get(key) != role:
                        continue
                    colour = colours.get(key) or pal.get(role, pal["fill"])
                    for d in paths:
                        # A dark edge makes structural plates read as separate
                        # parts, but on a thin shape it simply eats the shape: a
                        # 1.0-wide stroke centred on a 1.9-wide coolant fin
                        # leaves no colour at all, which is why the fins and the
                        # nav lights disappeared. Stroke only what is wide
                        # enough to survive it.
                        # Scale the outline to the shape rather than dropping it.
                        # All-or-nothing stopped the edge swallowing Earth's
                        # 1.9-wide coolant fins, but it also left the Krelath
                        # fin-like warp pods with no outline at all, which is an
                        # important visual detail. A third of the narrow
                        # dimension keeps a line on thin parts without eating
                        # their colour.
                        span = min_span(d)
                        edge = min(spec["edge"], span / 3.0)
                        if edge < 0.22:
                            edge = 0.0
                        if edge:
                            out.append('<path d="%s" fill="%s" fill-rule="evenodd" stroke="%s" '
                                       'stroke-width="%g" stroke-linejoin="round"/>'
                                       % (d, colour, pal["line"], edge))
                        else:
                            out.append('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (d, colour))
            # Fold lines on top of everything: this is what separates two parts
            # made of the same material, which no material boundary can.
            for d in layers.get("creases", []):
                out.append('<path d="%s" fill="%s" fill-rule="evenodd"/>' % (d, pal["line"]))
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
