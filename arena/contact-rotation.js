// A ship that turns in place draws no travel line, so it needs its own mark.
//
// Chris, 10 September 2026: rotating in place is now the default for a Maneuver action - a turn no
// longer drags a forced hex of movement behind it - and "this will require a map indicator of some
// kind since the travel line will not display in this setting."
//
// The mark is a curved arrow round the hull, from the heading it holds to the heading it will hold,
// in the course colour so it reads as part of the plan. One arrow per action that rotates without
// moving, stepped outward by action so three quarter-turns in one hex stay three separate arrows.
const COURSE = '#efb773';
const rad = Math.PI / 180;
// Screen angle of a heading, measured clockwise from screen right with y growing downward: heading
// f points along hex direction f, which the map draws at -60f. Same convention as the shield ring.
const headingAngle = f => -60 * f;
const wrapTurn = t => { let x = ((t % 6) + 6) % 6; return x > 3 ? x - 6 : x; };

// The actions in a forecast that change heading without leaving their hex.
export function inPlaceRotations(actions) {
  return (actions ?? []).filter(a => a?.start && a?.end
    && a.start.q === a.end.q && a.start.r === a.end.r
    && wrapTurn(a.end.facing - a.start.facing) !== 0)
    .map(a => ({ round: a.round, at: { q: a.end.q, r: a.end.r },
      from: a.start.facing, to: a.end.facing, turn: wrapTurn(a.end.facing - a.start.facing) }));
}

export function rotationMarkup(actions, { project, scale } = {}) {
  const turns = inPlaceRotations(actions);
  if (!turns.length || typeof project !== 'function' || !(scale > 0)) return '';
  const body = turns.map((t, n) => {
    const p = project(t.at), r = scale * (0.62 + 0.13 * n);
    const a0 = headingAngle(t.from), sweep = -60 * t.turn, steps = Math.max(6, Math.abs(t.turn) * 8);
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const th = (a0 + sweep * k / steps) * rad;
      pts.push({ x: p.x + r * Math.cos(th), y: p.y + r * Math.sin(th) });
    }
    // Arrowhead along the direction of travel at the tip.
    const tip = pts.at(-1), thEnd = (a0 + sweep) * rad, dir = Math.sign(sweep);
    const tx = -Math.sin(thEnd) * dir, ty = Math.cos(thEnd) * dir, len = Math.max(5, scale * 0.16);
    // Two barbs swept back 28 degrees either side of the reversed travel direction.
    const barb = side => {
      const c = Math.cos(28 * rad), sn = Math.sin(28 * rad) * side;
      return { x: tip.x + (-tx * c - ty * sn) * len, y: tip.y + (-ty * c + tx * sn) * len };
    };
    const w1 = barb(1), w2 = barb(-1);
    const f = v => v.toFixed(1);
    const words = `${Math.abs(t.turn)} face${Math.abs(t.turn) === 1 ? '' : 's'} to ${t.turn > 0 ? 'port' : 'starboard'}`;
    return `<g class="rotate-in-place" data-rotation-round="${t.round}" data-rotation-turn="${t.turn}">`
      + `<title>Action ${t.round}: rotate in place, ${words}, heading ${t.from} to ${t.to}</title>`
      + `<polyline points="${pts.map(q => `${f(q.x)},${f(q.y)}`).join(' ')}" fill="none" stroke="${COURSE}" stroke-width="2.5" stroke-linecap="round"/>`
      + `<path d="M${f(w1.x)},${f(w1.y)}L${f(tip.x)},${f(tip.y)}L${f(w2.x)},${f(w2.y)}" fill="none" stroke="${COURSE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      + `</g>`;
  }).join('');
  return `<g class="rotations" pointer-events="none">${body}</g>`;
}
