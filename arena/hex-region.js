// Outline a set of hexes along their real edges.
//
// Chris, 10 September 2026: "The movement and PD coverage displays should exactly outline the hexes
// that they cover, to remove ambiguity over what spaces are included and which are not."
//
// Both overlays used to draw a polygon through the centres of the six cells N steps out along each
// direction. That polygon cuts straight through the cells on its boundary, so a hex sitting under
// the line was neither visibly in nor out. The honest drawing is the boundary of the cell set: for
// every included cell, every edge whose neighbour is NOT included. The result is the stepped hex
// outline that a board game prints, and it stays exact for any region shape - clipped by terrain
// or the map edge later without changing a line here.
import { DIRS, distance } from '../src/tactical/hex.js';

export const key = c => `${c.q},${c.r}`;

// Every axial cell within n steps of a centre.
export function hexesWithin(centre, n) {
  const out = [], N = Math.max(0, Math.floor(Number(n) || 0));
  for (let dq = -N; dq <= N; dq++)
    for (let dr = Math.max(-N, -dq - N); dr <= Math.min(N, -dq + N); dr++)
      out.push({ q: centre.q + dq, r: centre.r + dr });
  return out;
}

// For a pointy-top cell the edge that faces hex direction d is centred on screen angle -60d (screen
// y grows downward, so this is measured clockwise from screen right) and runs between the cell's
// vertices 30 degrees either side. That matches the projection the map uses; see the direction
// table test/map-shield-arcs.mjs derives from the same projection.
export function regionEdges(cells, project, scale) {
  const inside = new Set(cells.map(key));
  const R = scale / Math.sqrt(3), rad = Math.PI / 180, edges = [];
  for (const c of cells) {
    const p = project(c);
    for (let d = 0; d < 6; d++) {
      if (inside.has(key({ q: c.q + DIRS[d].q, r: c.r + DIRS[d].r }))) continue;
      const mid = -60 * d;
      edges.push([
        { x: p.x + R * Math.cos((mid - 30) * rad), y: p.y + R * Math.sin((mid - 30) * rad) },
        { x: p.x + R * Math.cos((mid + 30) * rad), y: p.y + R * Math.sin((mid + 30) * rad) }
      ]);
    }
  }
  return edges;
}

export function regionOutlinePath(cells, project, scale) {
  return regionEdges(cells, project, scale)
    .map(([a, b]) => `M${a.x.toFixed(1)},${a.y.toFixed(1)}L${b.x.toFixed(1)},${b.y.toFixed(1)}`).join('');
}

// Convenience for the two overlays that need exactly "everything within N of here".
export function radiusOutlinePath(centre, n, project, scale) {
  return regionOutlinePath(hexesWithin(centre, n), project, scale);
}

export { distance };
