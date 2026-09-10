// Point defence is UMBRELLA cover, and that is the whole reason this exists.
//
// The engine does not ask whether the ship being shot at has point defence. It gathers every
// friendly hull with `pointDefence > 0` within `pointDefence.rangeHexes` of the TARGET and pools
// their points against the incoming round. So a battleship, a heavy cruiser, a monitor and a
// corvette - the four classes that carry none - are defended entirely by whoever is standing near
// them, and a player who cannot see the umbrella cannot make that decision on purpose.
//
// Chris, 10 September 2026: "this is important so cover can be provided for ships without PD of
// their own. The human currently has no way to tell."
//
// Drawn for EVERY own hull that carries point defence, not only the selected one, because the case
// that matters most is selecting a ship with none and asking whose cover it is standing in.
import { distance } from '../src/tactical/hex.js';
import { radiusOutlinePath } from './hex-region.js';

export const PD_COLOUR = '#e2a2ff';
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

// Which own hulls project an umbrella, and how far.
export function pointDefenceUmbrellas(ships, rangeHexes) {
  const hexes = num(rangeHexes);
  if (!(hexes > 0)) return [];
  return (ships ?? [])
    .filter(s => s && !s.destroyed && num(s.hull?.pointDefence) > 0 && s.pos)
    .map(s => ({ id: s.id, pos: s.pos, points: num(s.hull.pointDefence), hexes }));
}

// Own hulls that carry none, and whether anything covers them. The answer the player wants is not
// "where are the umbrellas" but "is THIS ship under one", so it is computed rather than eyeballed.
export function coverFor(ship, umbrellas) {
  if (!ship || ship.destroyed || !ship.pos) return null;
  const own = num(ship.hull?.pointDefence);
  const from = (umbrellas ?? []).filter(u => u.id !== ship.id && distance(u.pos, ship.pos) <= u.hexes);
  const pooled = own + from.reduce((sum, u) => sum + u.points, 0);
  return { own, from: from.map(u => u.id), pooled };
}

// Outlines the actual covered hexes along their edges, shared with the movement overlay through
// hex-region.js, so the two agree about what "N hexes" includes and a hex on the boundary is
// visibly in or out (Chris, 10 September 2026).
export function pointDefenceMarkup(ships, { project, scale, rangeHexes, selectedId = null } = {}) {
  const umbrellas = pointDefenceUmbrellas(ships, rangeHexes);
  if (!umbrellas.length || typeof project !== 'function' || !(scale > 0)) return '';
  const body = umbrellas.map(u => {
    const mine = u.id === selectedId;
    return `<path class="point-defence${mine ? ' selected' : ''}" data-point-defence="${u.id}"`
      + ` data-pd-points="${u.points}" d="${radiusOutlinePath(u.pos, u.hexes, project, scale)}" fill="none" stroke="${PD_COLOUR}"`
      + ` stroke-opacity="${mine ? '.95' : '.5'}" stroke-width="${mine ? 2 : 1.4}" stroke-dasharray="7 6" stroke-linecap="round">`
      + `<title>${u.id} point defence: ${u.points} point(s) covering every outlined hex, within ${u.hexes} hexes,`
      + ` including hulls that carry none of their own</title></path>`;
  }).join('');
  return `<g class="point-defence-umbrellas" pointer-events="none" role="img"`
    + ` aria-label="Point defence umbrellas: ${umbrellas.length} covering hull(s)">${body}</g>`;
}

// One line for the weapon key, so point defence reads as part of the battery rather than a special
// case. A hull with none is told what is covering it, which is the question it actually has.
export function pointDefenceKey(ship, umbrellas) {
  const cover = coverFor(ship, umbrellas);
  if (!cover) return '';
  const range = umbrellas?.[0]?.hexes ?? 0;
  const label = cover.own > 0
    ? `POINT DEFENCE ${cover.own} · ${range} HEX UMBRELLA`
    : cover.from.length ? `NO POINT DEFENCE · COVERED BY ${cover.from.length}` : 'NO POINT DEFENCE · UNCOVERED';
  const detail = cover.own > 0
    ? `Covers this hull and every friendly within ${range} hexes. Pooled against an incoming round: ${cover.pooled} point(s).`
    : cover.from.length
      ? `This hull carries none. Inside the umbrella of ${cover.from.join(', ')}; pooled ${cover.pooled} point(s).`
      : `This hull carries none and no friendly point defence is within ${range} hexes of it.`;
  return `<span class="range-limit pd-key" data-pd-cover="${cover.pooled}" title="${detail}">${label}</span>`;
}
