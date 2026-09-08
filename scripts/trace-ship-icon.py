"""Trace a ship's plan-view masks into the console's class-glyph SVG.

The console loads this file with <image href>, so it cannot inherit CSS colour -
the faction palette is baked in. It is drawn at 120px inside the shield ring and
at 28px on the tactical map, so the glyph is a filled plan OUTLINE with only the
strongest internal features; anything finer is mush at map size.

Output matches the existing icon convention exactly: viewBox 0 0 100 100,
width/height 64, bow up, so it drops into assets/icons/ with no other change.

  python scripts/trace-ship-icon.py --slug earth_frigate --faction EAR \
      --masks assets/blender/renders/v3/masks --out assets/icons/ear_frigate.svg
"""
import argparse
import os

from PIL import Image

# Faction palettes, taken from the icons already in assets/icons/.
FACTIONS = {
    "EAR": {"fill": "#4f8ef7", "line": "#1e3a8a", "metal": "#cfe0f5", "lit": "#ff5a4d"},
    "VRA": {"fill": "#e0b02e", "line": "#7a5a06", "metal": "#f6e6b4", "lit": "#ff8a3d"},
    "ZAN": {"fill": "#e0574a", "line": "#7a1d16", "metal": "#f7cfc9", "lit": "#ffd23d"},
    "KRE": {"fill": "#4fae7a", "line": "#14512f", "metal": "#cdeadb", "lit": "#9be36a"},
}


def load_mask(path, threshold=110):
    img = Image.open(path).convert("L")
    w, h = img.size
    px = img.load()
    return [[1 if px[x, y] >= threshold else 0 for x in range(w)] for y in range(h)], w, h


def trace_contours(grid, w, h, min_area_px):
    """Marching-squares boundary walk over each filled blob."""
    seen = [[False] * w for _ in range(h)]
    contours = []
    # 8-connected flood fill to find blobs, then walk each blob's border.
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
            # Moore boundary trace, starting from the blob's topmost-leftmost pixel.
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
    """Douglas-Peucker."""
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
        left = simplify(points[:index + 1], epsilon)
        right = simplify(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


def simplify_closed(points, epsilon):
    """Douglas-Peucker on a CLOSED ring. Run naively, the first and last points
    are the same, the baseline has zero length and the whole ring collapses to
    two points. Split at the point farthest from the start and simplify each
    half against a real baseline."""
    ring = points[:-1] if len(points) > 1 and points[0] == points[-1] else points[:]
    if len(ring) < 4:
        return ring
    ax, ay = ring[0]
    far = max(range(1, len(ring)), key=lambda i: (ring[i][0] - ax) ** 2 + (ring[i][1] - ay) ** 2)
    first = simplify(ring[:far + 1], epsilon)
    second = simplify(ring[far:] + [ring[0]], epsilon)
    return first[:-1] + second[:-1]


def to_path(contours, w, h, epsilon, decimals=1):
    """Scale pixel contours into the 0-100 viewBox and emit one path."""
    out = []
    for contour in contours:
        pts = simplify_closed(contour, epsilon)
        if len(pts) < 3:
            continue
        d = []
        for i, (x, y) in enumerate(pts):
            sx = round(x * 100.0 / w, decimals)
            sy = round(y * 100.0 / h, decimals)
            d.append("%s%g %g" % ("M" if i == 0 else "L", sx, sy))
        out.append(" ".join(d) + " Z")
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--faction", required=True, choices=sorted(FACTIONS))
    ap.add_argument("--masks", default="assets/blender/renders/v3/masks")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epsilon", type=float, default=1.6, help="trace tolerance in mask pixels")
    args = ap.parse_args()

    pal = FACTIONS[args.faction]
    layers = {}
    for tag, min_frac, eps_scale in (("hull", 0.0015, 1.0), ("metal", 0.0035, 1.8), ("lit", 0.0004, 1.5)):
        path = os.path.join(args.masks, "%s_%s.png" % (args.slug, tag))
        if not os.path.exists(path):
            print("missing mask:", path)
            continue
        grid, w, h = load_mask(path)
        contours = trace_contours(grid, w, h, int(w * h * min_frac))
        layers[tag] = to_path(contours, w, h, args.epsilon * eps_scale)
        print("%-6s %d blobs" % (tag, len(contours)))

    if not layers.get("hull"):
        raise SystemExit("no hull silhouette traced - is the mask empty?")

    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64">']
    svg.append('<path d="%s" fill="%s" stroke="%s" stroke-width="4" stroke-linejoin="round"/>'
               % (layers["hull"], pal["fill"], pal["line"]))
    if layers.get("metal"):
        svg.append('<path d="%s" fill="%s" opacity="0.38"/>' % (layers["metal"], pal["metal"]))
    if layers.get("lit"):
        svg.append('<path d="%s" fill="%s"/>' % (layers["lit"], pal["lit"]))
    svg.append("</svg>")

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(svg) + "\n")
    print("wrote %s (%d bytes)" % (args.out, os.path.getsize(args.out)))


if __name__ == "__main__":
    main()
