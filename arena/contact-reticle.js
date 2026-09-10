// The selection mark. Chris, 10 September 2026: "selection outline should be something more science
// fictiony than a white bounding box."
//
// The white box was never designed. It was the browser's own focus outline - an axis-aligned rectangle
// round the clicked SVG group - showing through because the group is keyboard-focusable. So this
// replaces it for BOTH selection and keyboard focus rather than simply hiding it, which would have
// left keyboard users with no indicator at all.
//
// The mark is a targeting reticle in the map's own vocabulary: six corner brackets on the ship's hex,
// just outside it, the same pointy-top hexagon the shield ring and the coverage outlines now draw. A
// bracket is two short strokes along the edges either side of each corner.
export const RETICLE_COLOUR = '#efb773';

export function reticleMarkup(centre, scale, { colour = RETICLE_COLOUR, reach = 1.12, bracket = 0.3 } = {}) {
  if (!centre || !(scale > 0)) return '';
  const R = (scale / Math.sqrt(3)) * reach, rad = Math.PI / 180, f = v => v.toFixed(1);
  // Pointy-top corners sit at screen angles 30 + 60i with y growing downward, matching the grid.
  const corner = i => ({ x: centre.x + R * Math.cos((30 + 60 * i) * rad), y: centre.y + R * Math.sin((30 + 60 * i) * rad) });
  let d = '';
  for (let i = 0; i < 6; i++) {
    const v = corner(i), prev = corner((i + 5) % 6), next = corner((i + 1) % 6);
    const a = { x: v.x + (prev.x - v.x) * bracket, y: v.y + (prev.y - v.y) * bracket };
    const b = { x: v.x + (next.x - v.x) * bracket, y: v.y + (next.y - v.y) * bracket };
    d += `M${f(a.x)},${f(a.y)}L${f(v.x)},${f(v.y)}L${f(b.x)},${f(b.y)}`;
  }
  return `<path class="reticle" d="${d}" fill="none" stroke="${colour}" stroke-width="2.2" stroke-linejoin="miter" stroke-linecap="square"/>`;
}
