// The Krelath warp on the map. Chris, 10 September 2026: warp is a straight jump of up to 8 hexes,
// no turning - and "there should also be a warp effect to make the warp maneuver obvious."
//
// Two marks share one vocabulary, a violet the rest of the board does not use:
//   - planning: where the ordered jump leaves and the hex it lands in (warpCourseMarkup);
//   - playback: the ship folding out of its hex, a streak along the line, and the arrival flash
//     (warpCue, called by the effects renderer for a tape event of kind 'warp').

export const WARP_CORE = '#e6dcff', WARP_HALO = '#8a6cff';
const f = v => Number(v).toFixed(1);

// The landing hex as one filled polygon: pointy-top corners at 30 + 60i degrees, the grid's own.
const hexCorners = (c, scale) => Array.from({ length: 6 }, (_, i) => {
  const a = (30 + 60 * i) * Math.PI / 180, R = scale / Math.sqrt(3) * .96;
  return `${f(c.x + R * Math.cos(a))},${f(c.y + R * Math.sin(a))}`;
}).join(' ');

export function warpCourseMarkup(actions, { project, scale }) {
  let svg = '';
  for (const a of actions ?? []) {
    if (a?.kind !== 'warp' || !a.start || !a.end || (a.start.q === a.end.q && a.start.r === a.end.r)) continue;
    const u = project(a.start), v = project(a.end);
    svg += `<g class="warp-course" data-warp-round="${a.round}" pointer-events="none"><title>Warp, action ${a.round}: jumps straight ahead to ${a.end.q}, ${a.end.r}</title>`
      + `<line x1="${f(u.x)}" y1="${f(u.y)}" x2="${f(v.x)}" y2="${f(v.y)}" stroke="${WARP_HALO}" stroke-width="${f(Math.max(1.4, scale * .06))}" stroke-dasharray="1 6" stroke-linecap="round"/>`
      + `<circle cx="${f(u.x)}" cy="${f(u.y)}" r="${f(scale * .3)}" fill="none" stroke="${WARP_HALO}" stroke-width="1.4" stroke-dasharray="3 3"/>`
      + `<polygon class="warp-landing" points="${hexCorners(v, scale)}" fill="${WARP_HALO}" fill-opacity=".35" stroke="${WARP_CORE}" stroke-width="2.2"/>`
      + `</g>`;
  }
  return svg;
}

// Playback. `a` departure and `b` arrival are projected points; either may be missing when the jump
// was only partly seen (an enemy that came out of, or went into, the dark).
export function warpCue(a, b, icon, phase, reduced) {
  const ring = (p, r, o, w) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(Math.max(0, r))}" fill="none" stroke="${WARP_HALO}" stroke-width="${f(w)}" opacity="${f(o)}"/>`;
  const disc = (p, r, o) => `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(Math.max(0, r))}" fill="${WARP_CORE}" opacity="${f(o)}"/>`;
  if (reduced) return (a ? ring(a, icon * .9, .6, 1.4) : '') + (a && b ? `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${WARP_HALO}" stroke-width="2" stroke-dasharray="1 5" opacity=".7"/>` : '')
    + (b ? ring(b, icon * 1.1, .85, 2) + disc(b, icon * .2, .8) : '');
  const p = Math.max(0, Math.min(1, phase));
  const out = Math.min(1, p / .4), streak = p < .25 ? 0 : p < .55 ? (p - .25) / .3 : 1 - (p - .55) / .45, arrive = Math.max(0, (p - .4) / .6);
  let svg = '';
  // Departure: the hex folds in on the ship - a ring collapsing to a point, a core flash going out.
  if (a && p < .5) svg += ring(a, icon * 1.6 * (1 - out), 1 - out * .6, icon * .12) + disc(a, icon * .35 * (1 - out), .9 * (1 - out));
  // The streak along the line of the jump.
  if (a && b && streak > 0) svg += `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${WARP_CORE}" stroke-width="${f(icon * .14)}" stroke-linecap="round" opacity="${f(streak * .9)}"/>`
    + `<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${WARP_HALO}" stroke-width="${f(icon * .45)}" stroke-linecap="round" opacity="${f(streak * .35)}"/>`;
  // Arrival: a flash, then a ring thrown outward.
  if (b && arrive > 0) svg += disc(b, icon * (.25 + .3 * (1 - arrive)), (1 - arrive) * .95) + ring(b, icon * (.3 + 1.6 * arrive), (1 - arrive) * .9, icon * .1);
  return svg;
}
