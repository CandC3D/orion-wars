// Value-only SVG terrain art for the restricted contact map.
//
// This module is a code-native port of the replay viewer's procedural canvas
// terrain (arena/arena.js drawTerrain / drawMoonOrPlanet / drawLargeAsteroid /
// drawAsteroidField / drawNebula). It is deliberately isolated: pure functions
// of their arguments, no DOM, no globals, no clock, no randomness, no imports.
// The same (q, r) always yields the same string, so the map never shimmers and
// the art can be diffed and unit-tested without a browser.
//
// UNITS. The caller supplies `scale`, the hex PITCH in map units: cell centres
// one step apart are `scale` apart horizontally. The contact map draws a cell
// as a hexagon of circumradius `scale * 0.5`, so every viewer constant that
// multiplied the viewer's `geo.scale` (which IS a circumradius there) is
// multiplied here by CELL = scale * 0.5. That keeps the viewer's proportions
// (moon 0.72 of a cell radius, planet 2.15, nebula 0.8, field rocks out to 0.6)
// while guaranteeing the art cannot imply a collision footprint it does not
// have. Nothing here knows anything about ships.

const TAU = Math.PI * 2;

// --- deterministic textures ---------------------------------------------
// Ported verbatim from arena/arena.js (which itself mirrors editor-core.js).
// Kept private so this module has no dependency on the viewer script.

function hashHex(q, r, salt) {
  let h = (Math.trunc(q) * 374761393 + Math.trunc(r) * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
  h ^= h >>> 14;
  return (h >>> 0) || 1;
}

function hexRng(q, r, salt) {
  let state = hashHex(q, r, salt);
  return function next() {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function asteroidFieldRocks(q, r) {
  const rand = hexRng(q, r, 1);
  const count = 6 + Math.floor(rand() * 4);
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * TAU;
    const dist = rand() * .6;
    rocks.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, radius: .09 + rand() * .14, shade: rand() });
  }
  return rocks;
}

function largeAsteroidOutline(q, r) {
  const rand = hexRng(q, r, 2);
  const points = 9 + Math.floor(rand() * 4);
  const outline = [];
  for (let i = 0; i < points; i++) outline.push({ angle: (i / points) * TAU, radius: .72 + rand() * .28 });
  return outline;
}

function nebulaOutline(q, r) {
  const rand = hexRng(q, r, 4);
  const points = 10 + Math.floor(rand() * 5);
  const outline = [];
  for (let i = 0; i < points; i++) outline.push({ angle: (i / points) * TAU, radius: .82 + rand() * .16 });
  return outline;
}

// --- public description ---------------------------------------------------

export const TERRAIN_LEGEND = [
  { type: 'planet', label: 'Planet', note: 'seven-cell body; blocks movement and fire' },
  { type: 'moon', label: 'Moon', note: 'one-cell body; blocks movement and fire' },
  { type: 'asteroid', label: 'Large asteroid', note: 'one-cell body; blocks movement and fire' },
  { type: 'asteroids', label: 'Asteroid field', note: 'passable, slow; blocks fire in and out' },
  { type: 'nebula', label: 'Nebula', note: 'passable; short visibility, shields useless inside' }
];

const LEGEND_BY_TYPE = new Map(TERRAIN_LEGEND.map(entry => [entry.type, entry]));

// Largest extent any type draws, as a multiple of the cell circumradius.
// Used by the legend swatch to fit the same art into a small box, and by the
// containment tests as the declared budget.
// (For the planet the seven-cell outline, reaching 3 cell radii, is wider than
// the 2.28 of the atmosphere ring.)
const EXTENT = { planet: 3, moon: 1, asteroid: 1, asteroids: 1, nebula: 1 };

const NEIGHBOURS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

function defaultFootprint(item) {
  if (!item || !Number.isFinite(item.q) || !Number.isFinite(item.r)) return [];
  const centre = { q: item.q, r: item.r };
  return item.type === 'planet'
    ? [centre, ...NEIGHBOURS.map(d => ({ q: centre.q + d.q, r: centre.r + d.r }))]
    : [centre];
}

// --- small helpers --------------------------------------------------------

function n(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function finite(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

// Cell outline in the map's pointy-top convention: vertices at 30, 90, ... degrees
// so adjacent footprint cells share edges (the radius passed in is pitch / sqrt(3)).
function hexPoints(centre, radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + i * Math.PI / 3;
    pts.push(`${n(centre.x + Math.cos(a) * radius)},${n(centre.y + Math.sin(a) * radius)}`);
  }
  return pts.join(' ');
}

function blobPath(centre, base, outline) {
  let d = '';
  outline.forEach((point, i) => {
    const r = base * point.radius;
    const x = centre.x + Math.cos(point.angle) * r;
    const y = centre.y + Math.sin(point.angle) * r;
    d += `${i ? 'L' : 'M'}${n(x)},${n(y)}`;
  });
  return d + 'Z';
}

// --- defs -----------------------------------------------------------------

// All gradients use objectBoundingBox units, so one definition serves every
// zoom level and every item: the ids stay stable across redraws (no per-item
// gradient churn) and a 4096-item map still emits exactly one <defs>.
// `scale` is accepted so callers can pass the live pitch uniformly; the defs
// are intentionally scale-independent for that stability.
export function terrainArtDefs(scale) {
  void scale;
  return '<defs>' +
    '<radialGradient id="terrain-planet-body" cx="0.5" cy="0.5" r="0.5" fx="0.36" fy="0.35">' +
      '<stop offset="0" stop-color="#fff1c9"/>' +
      '<stop offset="0.35" stop-color="#bba982"/>' +
      '<stop offset="1" stop-color="#4b4036"/>' +
    '</radialGradient>' +
    '<radialGradient id="terrain-planet-limb" cx="0.5" cy="0.5" r="0.5" fx="0.34" fy="0.32">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>' +
      '<stop offset="0.45" stop-color="#ffffff" stop-opacity="0.06"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
    '</radialGradient>' +
    '<radialGradient id="terrain-moon-body" cx="0.5" cy="0.5" r="0.5" fx="0.36" fy="0.35">' +
      '<stop offset="0" stop-color="#f4f7f8"/>' +
      '<stop offset="0.45" stop-color="#aab3ba"/>' +
      '<stop offset="1" stop-color="#48535b"/>' +
    '</radialGradient>' +
    '<radialGradient id="terrain-rock-body" cx="0.5" cy="0.5" r="0.5" fx="0.37" fy="0.35">' +
      '<stop offset="0" stop-color="#93816a"/>' +
      '<stop offset="0.5" stop-color="#5e4d3d"/>' +
      '<stop offset="1" stop-color="#2b221a"/>' +
    '</radialGradient>' +
    '<radialGradient id="terrain-nebula-haze" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#ba96ff" stop-opacity="0.55"/>' +
      '<stop offset="0.6" stop-color="#8a60e0" stop-opacity="0.36"/>' +
      '<stop offset="1" stop-color="#5a3aa8" stop-opacity="0.08"/>' +
    '</radialGradient>' +
    '</defs>';
}

// --- per-type art ---------------------------------------------------------
// Each returns the inner markup of one terrain group. `cells` are the
// projected footprint cell centres; `cells[0]` is the item's own hex.

function planetArt(cells, cell) {
  const at = cells[0];
  const radius = cell * 2.15;
  // The disc is wider than one hex, so the seven collision cells are outlined
  // faintly underneath it: the art must never imply a different footprint.
  let out = '';
  for (const c of cells) out += `<polygon points="${hexPoints(c, cell * 2 / Math.sqrt(3))}" fill="#816b4a" fill-opacity="0.9" stroke="#aaa" stroke-opacity="0.5" stroke-width="1"/>`;
  out += `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(radius)}" fill="url(#terrain-planet-body)" fill-opacity="0.8"/>`;
  out += `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(radius)}" fill="url(#terrain-planet-limb)"/>`;
  out += `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(radius * 1.05)}" fill="none" stroke="#d2a96d" stroke-opacity="0.3" stroke-width="1"/>`;
  return out;
}

function moonArt(cells, cell) {
  const at = cells[0];
  const radius = cell * .72;
  return `<polygon points="${hexPoints(at, cell * 2 / Math.sqrt(3))}" fill="#9ca5a7" fill-opacity="0.9" stroke="#aaa" stroke-opacity="0.5" stroke-width="1"/>` +
    `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(radius)}" fill="url(#terrain-moon-body)" fill-opacity="0.82"/>` +
    `<circle cx="${n(at.x)}" cy="${n(at.y)}" r="${n(radius)}" fill="url(#terrain-planet-limb)"/>`;
}

function asteroidArt(cells, cell, item) {
  const at = cells[0];
  const base = cell * .72;
  const d = blobPath(at, base, largeAsteroidOutline(item.q, item.r));
  return `<polygon points="${hexPoints(at, cell * 2 / Math.sqrt(3))}" fill="#765f4d" fill-opacity="0.9" stroke="#aaa" stroke-opacity="0.5" stroke-width="1"/>` +
    `<path d="${d}" fill="url(#terrain-rock-body)" fill-opacity="0.85" stroke="#251c15" stroke-opacity="0.85" stroke-width="1"/>`;
}

const FIELD_ROCK_CAP = 14;

function asteroidFieldArt(cells, cell, item) {
  const at = cells[0];
  let out = `<polygon points="${hexPoints(at, cell * 2 / Math.sqrt(3))}" fill="#9b7f5b" fill-opacity="0.35" stroke="#bba273" stroke-opacity="0.9" stroke-width="1"/>`;
  const rocks = asteroidFieldRocks(item.q, item.r).slice(0, FIELD_ROCK_CAP);
  for (const rock of rocks) {
    const x = at.x + rock.dx * cell;
    const y = at.y + rock.dy * cell;
    // Floor keeps a rock visible when zoomed out; the 0.15 cap keeps the
    // floor from ever pushing a rock outside its own hex.
    const r = Math.max(Math.min(.4, cell * .15), rock.radius * cell);
    const tone = 96 + Math.round(rock.shade * 60);
    const fill = `rgb(${tone},${Math.round(tone * .86)},${Math.round(tone * .7)})`;
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}" fill-opacity="0.85"/>`;
  }
  return out;
}

function nebulaArt(cells, cell, item) {
  const at = cells[0];
  const base = cell * .8;
  const d = blobPath(at, base, nebulaOutline(item.q, item.r));
  return `<polygon points="${hexPoints(at, cell * 2 / Math.sqrt(3))}" fill="#594a89" fill-opacity="0.38" stroke="#aaa" stroke-opacity="0.5" stroke-width="1"/>` +
    `<path d="${d}" fill="url(#terrain-nebula-haze)" fill-opacity="0.7" stroke="#b79cff" stroke-opacity="0.22" stroke-width="1"/>`;
}

const ART = {
  planet: planetArt,
  moon: moonArt,
  asteroid: asteroidArt,
  asteroids: asteroidFieldArt,
  nebula: nebulaArt
};

// --- public renderer ------------------------------------------------------

// items:   public terrain records ({ type, q, r }). Nothing else is read.
// project: cell -> { x, y } in map units (the caller's xy()).
// scale:   hex pitch in map units.
// footprint: item -> cells (defaults to the engine's planet-flower rule).
export function terrainArt(items, options = {}) {
  const project = options.project;
  const scale = options.scale;
  const footprint = options.footprint || defaultFootprint;
  if (!Array.isArray(items) || typeof project !== 'function' || !Number.isFinite(scale)) return '';
  const cellRadius = scale * .5;
  let svg = '';
  for (const item of items) {
    if (!item || !Number.isFinite(item.q) || !Number.isFinite(item.r)) continue;
    const draw = ART[item.type];
    const legend = LEGEND_BY_TYPE.get(item.type);
    if (!draw || !legend) continue;
    const cells = (footprint(item) || []).map(project);
    if (!cells.length || !cells.every(finite)) continue;
    const where = `hex ${item.q}, ${item.r}`;
    svg += `<g data-terrain="${esc(item.type)}" data-q="${esc(item.q)}" data-r="${esc(item.r)}" role="img" aria-label="${esc(`${legend.label} at ${where}`)}">` +
      `<title>${esc(`${legend.label} · ${where} · ${legend.note}`)}</title>` +
      draw(cells, cellRadius, item) +
      '</g>';
  }
  return svg;
}

// --- legend swatch --------------------------------------------------------

// The same art, fitted into a size x size box: the pitch is chosen so the
// type's widest element lands just inside the box.
export function terrainSwatch(type, size = 18) {
  const legend = LEGEND_BY_TYPE.get(type);
  const box = Number.isFinite(size) && size > 0 ? size : 18;
  if (!legend) return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box)}" height="${n(box)}" viewBox="0 0 ${n(box)} ${n(box)}" role="img" aria-label="Unknown terrain"></svg>`;
  const extent = EXTENT[type] || 1;
  // pitch such that extent * (pitch/2) <= 0.92 * box/2, and the cell outline
  // itself still fits the box.
  // The pointy-top cell outline spans 2/sqrt(3) of the pitch vertically, so fit that too.
  const pitch = box * .92 / Math.max(extent, 2 / Math.sqrt(3));
  const cx = box / 2, cy = box / 2;
  // Same axial projection the contact map uses, centred in the swatch box.
  const project = cell => ({ x: cx + (cell.q + cell.r / 2) * pitch, y: cy + cell.r * pitch * .866 });
  const art = terrainArt([{ type, q: 0, r: 0 }], { project, scale: pitch });
  // A swatch is standalone, so it carries its own copy of the gradients. The
  // ids are re-prefixed ('terrain-swatch-') so inlining a legend beside the map
  // on one page cannot collide with the map's own <defs>.
  const local = (terrainArtDefs(pitch) + art).replace(/terrain-/g, 'terrain-swatch-');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box)}" height="${n(box)}" viewBox="0 0 ${n(box)} ${n(box)}" role="img" aria-label="${esc(legend.label)}">` +
    local + '</svg>';
}
