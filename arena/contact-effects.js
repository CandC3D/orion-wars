// contact-effects.js -- value-only SVG combat effects for the restricted
// contact map.
//
// HARD INFORMATION BOUNDARY. This module is deliberately isolated: it imports
// nothing, touches no DOM, no globals, no clock and no randomness. Everything
// it draws is derived from (a) the fields of the *projected* event handed in by
// the caller and (b) the projected own ship (`victim`) when the caller knows an
// own ship is the recipient. There is no back channel to the resolver, to the
// replay viewer or to the observation.
//
// The single rule that governs every branch below: a missing `source` or
// `destination` means that geometry does not exist for the player. No line, no
// heading, no travel toward an inferred point, no "probably over there" hint.
// Where only one endpoint is known the effect is *radial* -- rings, converging
// ticks, orbiting chevrons -- so it says "something happened here" and nothing
// about where it came from.
//
// Two further policies:
//   * `resolved` is NOT a hit. It means the exchange resolved and the player is
//     entitled to see that it did. Nothing here labels a hit or shows damage.
//   * `unconfirmed` must stay visibly unconfirmed: dashed, muted, `?`, and
//     never a burst.
//   * Incoming missiles never carry a launcher position. Even if a caller hands
//     one a `source` field, we drop it (see `sourceOf`).
//
// Visual language adapted from the replay viewer (arena/arena.js), ported as
// pure string builders -- techniques only, no code and no import:
//   drawBeam        -> bright core + soft halo + a short travelling pulse
//   drawSpinalFire  -> heavy violet discharge, white core, wide halo, shock ring
//   drawStrikes     -> staggered craft chevrons with lateral spread + flicker
//   arrival labels  -> a short tag at the point of arrival, outcome-coloured

export const EFFECT_PROFILE = 'contact-effects/1';

// ---------------------------------------------------------------- palette

// Faction flavour: each power's beams and missiles have their own colour and shape. Neutral is used when the
// shooter's faction is not known to the player (an unattributed incoming shot never discloses one).
export const FLAVOURS = {
  EAR: { name: 'Earth', beamCore: '#dff1ff', beamHalo: '#4f8ef7', beamStyle: 'lance', missile: '#9ad4ff', missileHalo: '#4f8ef7', missileStyle: 'torpedo' },
  KRE: { name: 'Krelath', beamCore: '#d8ffd8', beamHalo: '#3fbf5a', beamStyle: 'bolts', missile: '#b6ff9a', missileHalo: '#3fbf5a', missileStyle: 'comet' },
  VRA: { name: 'Vraygon', beamCore: '#fff1c2', beamHalo: '#e2b53a', beamStyle: 'crystal', missile: '#ffd77a', missileHalo: '#e2b53a', missileStyle: 'shard' },
  ZAN: { name: 'Zandrax', beamCore: '#ffd0c8', beamHalo: '#e8483f', beamStyle: 'ragged', missile: '#ff9a8a', missileHalo: '#e8483f', missileStyle: 'swarm' },
  neutral: { name: 'Unknown', beamCore: '#bfeaff', beamHalo: '#5bbdff', beamStyle: 'lance', missile: '#ffb347', missileHalo: '#ff512f', missileStyle: 'torpedo' }
};
function flavourOf(faction) { return FLAVOURS[faction] || FLAVOURS.neutral; }
const C = {
  beamCore: '#bfeaff',
  beamHalo: '#5bbdff',
  spinal: '#c9a6ff',
  spinalHalo: '#a678ff',
  spinalCore: '#fdfbff',
  strike: '#7cf2b0',
  missile: '#ffb347',
  burst: '#ff512f',
  muted: '#9aa6b2',
  defensive: '#8ec6dc',
  white: '#ffffff'
};

// Face -> hex direction offset, and the on-screen angle of a direction.
// Pointy-top axial, +x east, y down: direction d points at -d * 60 degrees.
const OFFSET_OF_FACE = { 2: 0, 1: 1, 6: 2, 5: 3, 4: 4, 3: 5 };

const NO_EFFECT_KINDS = new Set(['contact-acquired', 'contact-lost']);

// ---------------------------------------------------------------- helpers

function n(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Deterministic cosmetic jitter. FNV-1a over the seed string; no RNG, no clock.
function hashUnit(seed, salt) {
  const text = String(seed == null ? '' : seed) + '|' + String(salt);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function rot(px, py, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: px * c - py * s, y: px * s + py * c };
}

function line(x1, y1, x2, y2, attrs) {
  return '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" ' + attrs + '/>';
}

function circle(cx, cy, r, attrs) {
  return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(Math.max(0, r)) + '" ' + attrs + '/>';
}

function polyline(points, attrs) {
  const body = points.map(p => n(p.x) + ',' + n(p.y)).join(' ');
  return '<polyline points="' + body + '" ' + attrs + '/>';
}

function text(x, y, body, attrs) {
  return '<text x="' + n(x) + '" y="' + n(y) + '" ' + attrs + '>' + body + '</text>';
}

// Arcs are emitted as polylines rather than path arcs so that every number in
// the output is a plain absolute coordinate -- easy to audit for invented
// geometry, and immune to path-flag mis-parsing.
function arcPoints(cx, cy, r, fromDeg, toDeg, steps) {
  const out = [];
  const count = Math.max(2, steps | 0);
  for (let i = 0; i <= count; i++) {
    const deg = fromDeg + (toDeg - fromDeg) * (i / count);
    const rad = deg * Math.PI / 180;
    out.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return out;
}

function ring(cx, cy, r, attrs) {
  return polyline(arcPoints(cx, cy, r, 0, 360, 28).concat([]), attrs);
}

function chevron(cx, cy, heading, size, attrs) {
  const pts = [
    rot(-size, -size * 0.62, heading),
    rot(size * 0.9, 0, heading),
    rot(-size, size * 0.62, heading)
  ].map(p => ({ x: cx + p.x, y: cy + p.y }));
  return polyline(pts, attrs);
}

function tag(x, y, body, colour, extra) {
  return text(x, y, body,
    'fill="' + colour + '" font-size="9" font-family="ui-monospace,Menlo,Consolas,monospace" ' +
    'text-anchor="middle" letter-spacing="0.6" opacity="' + (extra == null ? 0.9 : extra) + '"');
}

function group(cls, body) {
  if (!body) return '';
  return '<g class="fx ' + cls + '" pointer-events="none">' + body + '</g>';
}

// ------------------------------------------------------------------ defs

export function effectDefs() {
  return [
    '<defs>',
    '<filter id="fx-glow-tight" x="-60%" y="-60%" width="220%" height="220%">',
    '<feGaussianBlur stdDeviation="1.6" result="b"/>',
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '<filter id="fx-glow-soft" x="-80%" y="-80%" width="260%" height="260%">',
    '<feGaussianBlur stdDeviation="3.2" result="b"/>',
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '<filter id="fx-glow-wide" x="-120%" y="-120%" width="340%" height="340%">',
    '<feGaussianBlur stdDeviation="6" result="b"/>',
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '<radialGradient id="fx-grad-bloom">',
    '<stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>',
    '<stop offset="0.35" stop-color="#d6bcff" stop-opacity="0.7"/>',
    '<stop offset="1" stop-color="#401684" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="fx-grad-burst">',
    '<stop offset="0" stop-color="#fff7de" stop-opacity="0.95"/>',
    '<stop offset="0.45" stop-color="#ffb347" stop-opacity="0.7"/>',
    '<stop offset="1" stop-color="#ff512f" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="fx-grad-strike">',
    '<stop offset="0" stop-color="#eafff4" stop-opacity="0.9"/>',
    '<stop offset="0.5" stop-color="#7cf2b0" stop-opacity="0.55"/>',
    '<stop offset="1" stop-color="#7cf2b0" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="fx-grad-guard">',
    '<stop offset="0" stop-color="#e6f6ff" stop-opacity="0.8"/>',
    '<stop offset="0.6" stop-color="#8ec6dc" stop-opacity="0.4"/>',
    '<stop offset="1" stop-color="#8ec6dc" stop-opacity="0"/></radialGradient>',
    '<radialGradient id="fx-grad-muted">',
    '<stop offset="0" stop-color="#d8dee6" stop-opacity="0.55"/>',
    '<stop offset="1" stop-color="#9aa6b2" stop-opacity="0"/></radialGradient>',
    '</defs>'
  ].join('');
}

// -------------------------------------------------------------- geometry
//
// sourceOf / destinationOf are the only two places geometry enters. If they
// return null the corresponding drawing branch is simply unavailable.

function sourceOf(event, project) {
  // Defensive: an arriving missile never discloses launcher coordinates. Even
  // when a caller fabricates one, we refuse to read it.
  if (event.kind === 'missile') return null;
  const pos = event.source;
  if (!pos || !Number.isFinite(pos.q) || !Number.isFinite(pos.r)) return null;
  return project(pos);
}

function destinationOf(event, project) {
  const pos = event.destination;
  if (!pos || !Number.isFinite(pos.q) || !Number.isFinite(pos.r)) return null;
  return project(pos);
}

// ------------------------------------------------------------ face cue

function faceCue(event, victim, project, icon) {
  if (!victim || !victim.pos) return '';
  if (!Number.isInteger(event.face)) return '';
  const offset = OFFSET_OF_FACE[event.face];
  if (offset == null) return '';
  const facing = Number.isFinite(victim.facing) ? victim.facing : 0;
  const dir = (((facing + offset) % 6) + 6) % 6;
  const centre = -dir * 60;
  const at = project(victim.pos);
  const r = icon * 1.05;
  return polyline(arcPoints(at.x, at.y, r, centre - 34, centre + 34, 14),
    'fill="none" stroke="' + C.defensive + '" stroke-width="2.2" stroke-linecap="round" ' +
    'opacity="0.85" filter="url(#fx-glow-tight)"') +
    polyline(arcPoints(at.x, at.y, r * 0.82, centre - 22, centre + 22, 10),
      'fill="none" stroke="' + C.white + '" stroke-width="0.9" opacity="0.5"');
}

// ------------------------------------------------------------- builders

// The direction an incoming round came from, when the projection actually discloses it: the struck shield face of a
// known own ship. Never guessed. Returns a unit vector pointing from the victim OUT toward the attacker's side.
function approachVector(event, victim) {
  if (!victim || !victim.pos || !Number.isInteger(event.face)) return null;
  const offset = OFFSET_OF_FACE[event.face];
  if (offset == null) return null;
  const facing = Number.isFinite(victim.facing) ? victim.facing : 0;
  const dir = (((facing + offset) % 6) + 6) % 6;
  const rad = -dir * 60 * Math.PI / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

// Inbound rounds closing on a point. With a disclosed approach side one round comes in along it; without one, several
// converge radially -- the same "from nowhere in particular" statement the inbound flare makes.
function inboundRounds(b, icon, travel, F, approach, seed, opacity) {
  const size = icon * 0.3;
  if (approach) {
    const d = icon * (1.05 - 1.05 * travel);
    const x = b.x + approach.x * d, y = b.y + approach.y * d;
    const tl = Math.min(icon * 1.05, d + icon * 0.45);
    return line(b.x + approach.x * tl, b.y + approach.y * tl, x, y,
      'stroke="' + F.missile + '" stroke-width="' + n(icon * 0.09) + '" stroke-linecap="round" opacity="' + n(opacity * 0.55) + '"') +
      projectileGlyph(x, y, size, F, opacity) +
      circle(x, y, icon * 0.11, 'fill="' + C.white + '" opacity="' + n(opacity * 0.9) + '"');
  }
  let out = '';
  for (let i = 0; i < 4; i++) {
    const rad = (i * 90 + hashUnit(seed, 'i' + i) * 40) * Math.PI / 180;
    const d = icon * (1.0 - 0.9 * travel);
    out += projectileGlyph(b.x + Math.cos(rad) * d, b.y + Math.sin(rad) * d, size * 0.8, F, opacity * 0.9);
  }
  return out;
}

// Fragments thrown out from a point: interception debris and impact spall.
function shards(b, icon, spread, count, colour, seed, opacity, reach) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const rad = (i * (360 / count) + hashUnit(seed, 's' + i) * 40) * Math.PI / 180;
    const d = icon * (0.2 + reach * spread * (0.45 + hashUnit(seed, 'r' + i) * 0.5));
    const x = b.x + Math.cos(rad) * d, y = b.y + Math.sin(rad) * d;
    out += line(b.x + Math.cos(rad) * d * 0.55, b.y + Math.sin(rad) * d * 0.55, x, y,
      'stroke="' + colour + '" stroke-width="' + n(icon * 0.07) + '" stroke-linecap="round" opacity="' + n(opacity) + '"');
  }
  return out;
}

// A jagged path between two points: deterministic zigzag (Vraygon crystal, Zandrax ragged).
function jaggedPath(a, b, amp, segments, seed) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, off = (i === 0 || i === segments) ? 0 : (hashUnit(seed, i) * 2 - 1) * amp;
    pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return pts;
}
function beamBoth(a, b, icon, phase, reduced, F, seed) {
  F = F || FLAVOURS.neutral;
  const core = F.beamCore, halo = F.beamHalo, style = F.beamStyle;
  if (reduced) {
    return line(a.x, a.y, b.x, b.y,
      'stroke="' + halo + '" stroke-width="' + n(icon * 0.3) + '" stroke-linecap="round" opacity="0.45"') +
      line(a.x, a.y, b.x, b.y, 'stroke="' + core + '" stroke-width="1.6" stroke-linecap="round" opacity="0.95"' + (style === 'bolts' ? ' stroke-dasharray="' + n(icon * 0.5) + ' ' + n(icon * 0.35) + '"' : '')) +
      circle(a.x, a.y, icon * 0.2, 'fill="' + core + '" opacity="0.9"') +
      circle(b.x, b.y, icon * 0.24, 'fill="none" stroke="' + core + '" stroke-width="1.4" opacity="0.9"') +
      tag(b.x, b.y - icon * 1.3, 'beam', core, 0.85);
  }
  const fade = 1 - clamp01(phase) * 0.65;
  const head = clamp01(phase);
  const tail = clamp01(phase - 0.16);
  const hx = a.x + (b.x - a.x) * head, hy = a.y + (b.y - a.y) * head;
  const tx = a.x + (b.x - a.x) * tail, ty = a.y + (b.y - a.y) * tail;
  if (style === 'bolts') {
    // Krelath blasters: a chain of short bolts racing along the bearing, no continuous line.
    const dashLen = icon * 0.55, gap = icon * 0.4, len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const offset = -(head * len);
    return line(a.x, a.y, hx, hy,
      'stroke="' + halo + '" stroke-width="' + n(icon * 0.3) + '" stroke-linecap="round" opacity="' + n(fade * 0.35) + '" filter="url(#fx-glow-soft)"') +
      line(a.x, a.y, hx, hy,
        'stroke="' + core + '" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="' + n(dashLen) + ' ' + n(gap) + '" stroke-dashoffset="' + n(offset) + '" opacity="' + n(fade) + '"') +
      circle(hx, hy, icon * 0.2, 'fill="' + core + '" opacity="' + n(fade * 0.9) + '" filter="url(#fx-glow-tight)"');
  }
  if (style === 'crystal' || style === 'ragged') {
    // Vraygon crystal: tight bright zigzag with a gold halo. Zandrax ragged: wider, flickering, red.
    const amp = icon * (style === 'crystal' ? 0.18 : 0.32), segs = style === 'crystal' ? 10 : 7;
    const pts = jaggedPath(a, { x: hx, y: hy }, amp, segs, seed + (style === 'ragged' ? Math.round(phase * 6) : 0));
    return polyline(pts, 'fill="none" stroke="' + halo + '" stroke-width="' + n(icon * 0.28) + '" stroke-linejoin="round" opacity="' + n(fade * 0.4) + '" filter="url(#fx-glow-soft)"') +
      polyline(pts, 'fill="none" stroke="' + core + '" stroke-width="' + (style === 'crystal' ? '1.4' : '2') + '" stroke-linejoin="round" opacity="' + n(fade) + '"') +
      circle(hx, hy, icon * 0.18, 'fill="' + C.white + '" opacity="' + n(fade * 0.9) + '" filter="url(#fx-glow-tight)"');
  }
  // Earth lance: clean core with a soft halo and a running white pulse.
  return line(a.x, a.y, b.x, b.y,
    'stroke="' + halo + '" stroke-width="' + n(icon * 0.34) + '" stroke-linecap="round" ' +
    'opacity="' + n(fade * 0.45) + '" filter="url(#fx-glow-soft)"') +
    line(a.x, a.y, b.x, b.y,
      'stroke="' + core + '" stroke-width="1.7" stroke-linecap="round" opacity="' + n(fade) + '"') +
    line(tx, ty, hx, hy,
      'stroke="' + C.white + '" stroke-width="2.6" stroke-linecap="round" ' +
      'opacity="' + n(fade * 0.95) + '" filter="url(#fx-glow-tight)"') +
    circle(hx, hy, icon * 0.16, 'fill="' + C.white + '" opacity="' + n(fade * 0.9) + '"');
}

// Destination only: an inbound flare that converges from nowhere in
// particular. Concentric contraction plus evenly spaced inward ticks -- there
// is no bearing in this picture because the player has no bearing.
function inboundFlare(b, icon, phase, reduced, colour, halo, label) {
  if (reduced) {
    return ring(b.x, b.y, icon * 1.05,
      'fill="none" stroke="' + halo + '" stroke-width="2" opacity="0.6"') +
      ring(b.x, b.y, icon * 0.6, 'fill="none" stroke="' + colour + '" stroke-width="1.4" opacity="0.9"') +
      tag(b.x, b.y - icon * 1.35, label, colour, 0.85);
  }
  const p = clamp01(phase);
  const outer = icon * (1.25 - 0.85 * p);
  const fade = 1 - p * 0.55;
  let out = ring(b.x, b.y, outer,
    'fill="none" stroke="' + halo + '" stroke-width="' + n(icon * 0.16) + '" ' +
    'opacity="' + n(fade * 0.5) + '" filter="url(#fx-glow-soft)"') +
    ring(b.x, b.y, outer * 0.66,
      'fill="none" stroke="' + colour + '" stroke-width="1.6" opacity="' + n(fade * 0.95) + '"');
  for (let i = 0; i < 8; i++) {
    const rad = i * 45 * Math.PI / 180;
    const r0 = outer * 1.0, r1 = outer * 0.74;
    out += line(b.x + Math.cos(rad) * r0, b.y + Math.sin(rad) * r0,
      b.x + Math.cos(rad) * r1, b.y + Math.sin(rad) * r1,
      'stroke="' + colour + '" stroke-width="1.5" stroke-linecap="round" opacity="' + n(fade * 0.8) + '"');
  }
  out += circle(b.x, b.y, icon * 0.14 * (1 - p * 0.4), 'fill="' + C.white + '" opacity="' + n(fade * 0.8) + '"');
  return out;
}

function spinalBoth(a, b, icon, phase, reduced) {
  if (reduced) {
    return line(a.x, a.y, b.x, b.y,
      'stroke="' + C.spinalHalo + '" stroke-width="' + n(icon * 0.5) + '" stroke-linecap="round" opacity="0.4"') +
      line(a.x, a.y, b.x, b.y,
        'stroke="' + C.spinal + '" stroke-width="' + n(icon * 0.22) + '" stroke-linecap="round" opacity="0.85"') +
      line(a.x, a.y, b.x, b.y, 'stroke="' + C.spinalCore + '" stroke-width="1.6" stroke-linecap="round" opacity="0.95"') +
      circle(a.x, a.y, icon * 0.34, 'fill="none" stroke="' + C.spinal + '" stroke-width="1.4" opacity="0.9"') +
      ring(b.x, b.y, icon * 0.8, 'fill="none" stroke="' + C.spinal + '" stroke-width="1.6" opacity="0.85"') +
      tag(b.x, b.y - icon * 1.35, 'spinal', C.spinal, 0.9);
  }
  const p = clamp01(phase);
  const fade = 1 - p * 0.6;
  const bloom = icon * (0.55 - 0.2 * p);
  const shock = icon * (0.4 + 0.85 * p);
  return line(a.x, a.y, b.x, b.y,
    'stroke="' + C.spinalHalo + '" stroke-width="' + n(icon * 0.55) + '" stroke-linecap="round" ' +
    'opacity="' + n(fade * 0.42) + '" filter="url(#fx-glow-wide)"') +
    line(a.x, a.y, b.x, b.y,
      'stroke="' + C.spinal + '" stroke-width="' + n(icon * 0.24) + '" stroke-linecap="round" ' +
      'opacity="' + n(fade * 0.85) + '" filter="url(#fx-glow-soft)"') +
    line(a.x, a.y, b.x, b.y,
      'stroke="' + C.spinalCore + '" stroke-width="1.8" stroke-linecap="round" opacity="' + n(fade) + '"') +
    circle(a.x, a.y, bloom, 'fill="url(#fx-grad-bloom)" opacity="' + n(fade * 0.95) + '"') +
    ring(b.x, b.y, shock,
      'fill="none" stroke="' + C.spinal + '" stroke-width="' + n(icon * 0.09) + '" ' +
      'opacity="' + n((1 - p) * 0.9) + '" filter="url(#fx-glow-soft)"') +
    circle(b.x, b.y, icon * 0.2, 'fill="' + C.spinalCore + '" opacity="' + n(fade * 0.7) + '"');
}

function strikeBoth(a, b, icon, phase, reduced, seed) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const heading = Math.atan2(dy, dx);
  const nx = -dy / length, ny = dx / length;
  const count = 3 + Math.floor(hashUnit(seed, 'count') * 3); // 3..5
  const size = icon * 0.3;
  const stroke = 'fill="none" stroke="' + C.strike + '" stroke-width="1.8" stroke-linejoin="round" ';
  let out = '';
  if (reduced) {
    out += line(a.x, a.y, b.x, b.y,
      'stroke="' + C.strike + '" stroke-width="1.2" stroke-dasharray="5 5" opacity="0.4"');
    for (let i = 0; i < count; i++) {
      const lead = 0.25 + 0.55 * (count === 1 ? 0 : i / (count - 1));
      const spread = ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) * icon * 0.42;
      out += chevron(a.x + dx * lead + nx * spread, a.y + dy * lead + ny * spread, heading, size,
        stroke + 'opacity="0.9"');
    }
    out += ring(b.x, b.y, icon * 0.55, 'fill="none" stroke="' + C.strike + '" stroke-width="1.4" opacity="0.8"');
    out += tag(b.x, b.y - icon * 1.35, 'strike run', C.strike, 0.9);
    return out;
  }
  const p = clamp01(phase);
  for (let i = 0; i < count; i++) {
    const jitter = (hashUnit(seed, 'j' + i) - 0.5) * 0.06;
    const lead = clamp01(p * 1.12 - i * 0.09 + jitter);
    const spread = ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) * icon * (0.4 + hashUnit(seed, 's' + i) * 0.22);
    out += chevron(a.x + dx * lead + nx * spread, a.y + dy * lead + ny * spread, heading, size,
      stroke + 'opacity="' + n(0.55 + 0.4 * (1 - i / count)) + '" filter="url(#fx-glow-tight)"');
  }
  if (p > 0.45) {
    const f = clamp01((p - 0.45) / 0.5);
    const flicker = 0.75 + 0.35 * (hashUnit(seed, 'f' + Math.round(p * 8)) );
    out += circle(b.x, b.y, icon * (0.4 + 0.55 * f) * flicker,
      'fill="url(#fx-grad-strike)" opacity="' + n(1 - f) + '"');
  }
  return out;
}

// Destination only: attack-run cues loitering near the recipient. They orbit,
// so no chevron implies a bearing back to a carrier.
function strikeOrbit(b, icon, phase, reduced, seed) {
  const count = 3 + Math.floor(hashUnit(seed, 'count') * 3);
  const size = icon * 0.28;
  const r = icon * 0.85;
  const stroke = 'fill="none" stroke="' + C.strike + '" stroke-width="1.8" stroke-linejoin="round" ';
  let out = '';
  const spin = reduced ? 0 : clamp01(phase) * 150;
  for (let i = 0; i < count; i++) {
    const deg = spin + i * (360 / count) + hashUnit(seed, 'o' + i) * 20;
    const rad = deg * Math.PI / 180;
    const cx = b.x + Math.cos(rad) * r;
    const cy = b.y + Math.sin(rad) * r;
    out += chevron(cx, cy, rad + Math.PI / 2, size, stroke + 'opacity="' + (reduced ? '0.9' : '0.85') + '"');
  }
  out += ring(b.x, b.y, icon * (reduced ? 0.5 : 0.45 + 0.35 * clamp01(phase)),
    'fill="none" stroke="' + C.strike + '" stroke-width="1.3" opacity="' + (reduced ? '0.8' : '0.6') + '"');
  out += tag(b.x, b.y - icon * 1.35, 'strike run', C.strike, 0.9);
  return out;
}

// Launch: a DEPARTURE cue at the launcher, never an arrival. A torpedo launched
// this round does not reach its target until the next turn's impact phase, and
// the engine says so by emitting the arrival as a separate event there. So the
// glyph clears the tube and no more; the rest of the disclosed line is drawn as
// a dashed track showing where the shot was aimed, and the impact belongs to the
// arrival cue. Source only: a short streak straight up, since no course is
// disclosed at all.
// Projectile glyph per faction: Earth torpedo (capsule), Krelath comet (dot with trailing sparks), Vraygon shard
// (diamond), Zandrax swarm (three small dots). Drawn at (x, y), pointing screen-up; size in map units.
function projectileGlyph(x, y, size, F, opacity) {
  const c = F.missile, o = n(opacity);
  if (F.missileStyle === 'comet') return circle(x, y, size * 0.5, 'fill="' + c + '" opacity="' + o + '"') + circle(x - size * 0.35, y + size * 0.9, size * 0.22, 'fill="' + F.missileHalo + '" opacity="' + n(opacity * 0.7) + '"') + circle(x + size * 0.3, y + size * 1.3, size * 0.16, 'fill="' + F.missileHalo + '" opacity="' + n(opacity * 0.5) + '"');
  if (F.missileStyle === 'shard') return polyline([{ x: x, y: y - size }, { x: x + size * 0.45, y: y }, { x: x, y: y + size * 0.7 }, { x: x - size * 0.45, y: y }, { x: x, y: y - size }], 'fill="' + c + '" stroke="' + F.missileHalo + '" stroke-width="0.8" opacity="' + o + '"');
  if (F.missileStyle === 'swarm') return circle(x, y - size * 0.3, size * 0.3, 'fill="' + c + '" opacity="' + o + '"') + circle(x - size * 0.5, y + size * 0.4, size * 0.26, 'fill="' + c + '" opacity="' + n(opacity * 0.85) + '"') + circle(x + size * 0.5, y + size * 0.4, size * 0.26, 'fill="' + c + '" opacity="' + n(opacity * 0.85) + '"');
  return polyline([{ x: x - size * 0.3, y: y + size * 0.8 }, { x: x - size * 0.3, y: y - size * 0.4 }, { x: x, y: y - size }, { x: x + size * 0.3, y: y - size * 0.4 }, { x: x + size * 0.3, y: y + size * 0.8 }, { x: x - size * 0.3, y: y + size * 0.8 }], 'fill="' + c + '" stroke="' + F.missileHalo + '" stroke-width="0.8" opacity="' + o + '"');
}
const LAUNCH_DEPARTURE = 0.2;
function launchCue(a, icon, phase, reduced, F, toward) {
  F = F || FLAVOURS.neutral;
  // Both endpoints disclosed: draw the aimed line, but move the torpedo only
  // clear of the launcher. It lands on the arrival event, a turn later.
  if (reduced) {
    return ring(a.x, a.y, icon * 0.7, 'fill="none" stroke="' + F.missile + '" stroke-width="1.6" opacity="0.85"') +
      projectileGlyph(a.x, a.y - icon * 0.75, icon * 0.22, F, 0.95) +
      tag(a.x, a.y - icon * 1.35, 'launch', F.missile, 0.9);
  }
  const p = clamp01(phase);
  const r = icon * (0.35 + 0.95 * Math.min(1, p * 2));
  let gx, gy, tx, ty;
  if (toward) {
    // Only the opening fifth of the run: this is the tube emptying, not a flight.
    const ease = (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) * LAUNCH_DEPARTURE;
    gx = a.x + (toward.x - a.x) * ease; gy = a.y + (toward.y - a.y) * ease;
    const tail = Math.max(0, ease - 0.06); tx = a.x + (toward.x - a.x) * tail; ty = a.y + (toward.y - a.y) * tail;
  } else {
    gx = a.x; gy = a.y - icon * 1.0 * p; tx = a.x; ty = a.y;
  }
  const size = icon * 0.42;
  const tipAngle = Math.atan2(gy - ty, gx - tx);
  return ring(a.x, a.y, r,
    'fill="none" stroke="' + F.missileHalo + '" stroke-width="' + n(icon * 0.14) + '" ' +
    'opacity="' + n(Math.max(0, 1 - p * 2) * 0.95) + '" filter="url(#fx-glow-soft)"') +
    circle(a.x, a.y, icon * 0.42 * Math.max(0, 1 - p * 2), 'fill="' + C.white + '" opacity="' + n(Math.max(0, 1 - p * 2) * 0.9) + '" filter="url(#fx-glow-tight)"') +
    line(tx, ty, gx, gy, 'stroke="' + F.missileHalo + '" stroke-width="' + n(icon * 0.22) + '" stroke-linecap="round" opacity="0.35" filter="url(#fx-glow-soft)"') +
    line(tx, ty, gx, gy, 'stroke="' + F.missile + '" stroke-width="' + n(icon * 0.1) + '" stroke-linecap="round" opacity="0.8"') +
    projectileGlyph(gx, gy, size, F, 1) +
    circle(gx, gy, icon * 0.16, 'fill="' + C.white + '" opacity="0.95" filter="url(#fx-glow-tight)"') +
    (toward ? line(gx, gy, toward.x, toward.y, 'stroke="' + F.missile + '" stroke-width="' + n(icon * 0.05) + '" stroke-dasharray="' + n(icon * 0.22) + ' ' + n(icon * 0.28) + '" opacity="0.4"') : '') +
    tag(a.x, a.y - icon * 1.45, 'launch', F.missile, 0.9);
}

function arrivalColours(outcome, F) {
  if (outcome === 'intercepted' || outcome === 'evaded') return { core: C.defensive, halo: C.defensive, grad: 'fx-grad-guard' };
  if (outcome === 'miss' || outcome === 'unconfirmed') return { core: C.muted, halo: C.muted, grad: 'fx-grad-muted' };
  F = F || FLAVOURS.neutral;
  return { core: F.missile, halo: F.missileHalo, grad: 'fx-grad-burst' };
}

function missileArrival(b, icon, phase, reduced, outcome, F, approach, seed) {
  const col = arrivalColours(outcome, F);
  F = F || FLAVOURS.neutral;
  const label = outcome === 'resolved' ? 'impact' : outcome;
  const off = approach || { x: 0, y: -1 };
  if (reduced) {
    // At rest: the struck point, its spall, and the round that made it.
    return circle(b.x, b.y, icon * 0.45, 'fill="url(#' + col.grad + ')" opacity="0.9"') +
      ring(b.x, b.y, icon * 0.9, 'fill="none" stroke="' + col.halo + '" stroke-width="2" opacity="0.7"') +
      shards(b, icon, 1, 8, col.core, seed, 0.75, 0.85) +
      (approach ? projectileGlyph(b.x + off.x * icon * 0.9, b.y + off.y * icon * 0.9, icon * 0.26, F, 0.5) : '') +
      tag(b.x, b.y - icon * 1.4, label, col.core, 0.95);
  }
  const p = clamp01(phase);
  const hit = 0.42;                                   // the round reaches the hull here
  if (p < hit) {
    // Closing: the round itself, so it is obvious what is about to strike.
    return inboundRounds(b, icon, p / hit, F, approach, seed, 1) +
      ring(b.x, b.y, icon * (0.5 + 0.2 * (p / hit)), 'fill="none" stroke="' + col.halo + '" stroke-width="1.2" ' +
        'opacity="' + n(0.25 + 0.3 * (p / hit)) + '"') +
      tag(b.x, b.y - icon * 1.4, label, col.core, 0.9);
  }
  // Struck: white flash, expanding shock ring, spall thrown back out along the bearing.
  const a = (p - hit) / (1 - hit);
  const shock = icon * (0.3 + 0.95 * a);
  return circle(b.x, b.y, icon * 0.62 * (1 - a * 0.45), 'fill="url(#' + col.grad + ')" opacity="' + n(1 - a * 0.55) + '"') +
    circle(b.x, b.y, icon * 0.44 * Math.max(0, 1 - a * 1.7), 'fill="' + C.white + '" opacity="' + n(Math.max(0, 1 - a * 1.5)) + '" filter="url(#fx-glow-tight)"') +
    ring(b.x, b.y, shock, 'fill="none" stroke="' + C.white + '" stroke-width="' + n(icon * 0.2 * (1 - a * 0.55)) + '" ' +
      'opacity="' + n(Math.max(0, 0.95 - a * 0.9)) + '" filter="url(#fx-glow-soft)"') +
    ring(b.x, b.y, shock * 0.62, 'fill="none" stroke="' + col.core + '" stroke-width="' + n(icon * 0.12) + '" ' +
      'opacity="' + n(Math.max(0, 0.9 - a * 0.7)) + '"') +
    shards(b, icon, 1, 9, col.core, seed, Math.max(0, 1 - a * 0.85), Math.min(1, a * 1.2)) +
    tag(b.x, b.y - icon * 1.4, label, col.core, 0.95);
}

function missCue(a, b, icon, phase, reduced) {
  const anchor = b || a;
  const fade = reduced ? 0.7 : 1 - clamp01(phase) * 0.75;
  let out = '';
  if (a && b) {
    out += line(a.x, a.y, b.x, b.y,
      'stroke="' + C.muted + '" stroke-width="1.2" stroke-linecap="round" ' +
      'stroke-dasharray="6 6" opacity="' + n(fade * 0.75) + '"');
  } else {
    const r = reduced ? icon * 0.9 : icon * (0.5 + 0.55 * clamp01(phase));
    out += ring(anchor.x, anchor.y, r,
      'fill="none" stroke="' + C.muted + '" stroke-width="1.3" stroke-dasharray="5 6" ' +
      'opacity="' + n(fade * 0.8) + '"');
  }
  out += tag(anchor.x, anchor.y - icon * 1.35, 'miss', C.muted, 0.9);
  return out;
}

function defensiveCue(b, icon, phase, reduced, outcome, seed, F, approach) {
  F = F || FLAVOURS.neutral;
  const evaded = outcome === 'evaded';
  if (reduced) {
    // At rest: the round stopped short of the hull, with the guard arc that stopped it.
    const off = approach || { x: 0, y: -1 };
    return polyline(arcPoints(b.x, b.y, icon * 0.95, -150, -30, 18),
      'fill="none" stroke="' + C.defensive + '" stroke-width="2.4" stroke-linecap="round" opacity="0.85" filter="url(#fx-glow-tight)"') +
      projectileGlyph(b.x + off.x * icon * 0.8, b.y + off.y * icon * 0.8, icon * 0.28, F, 0.85) +
      shards(b, icon, 1, 6, C.defensive, seed, 0.75, 0.9) +
      tag(b.x, b.y - icon * 1.35, outcome, C.defensive, 0.9);
  }
  const p = clamp01(phase);
  const meet = 0.5;                       // the round is stopped (or slips past) halfway through the cue
  const close = Math.min(1, p / meet);    // 0..1 while closing
  const after = Math.max(0, (p - meet) / (1 - meet));
  const off = approach || { x: 0, y: -1 };
  let out = '';
  // Point-defence: three short tracers snapping out from the hull toward the round.
  if (p > 0.12) {
    for (let i = 0; i < 3; i++) {
      const spread = (i - 1) * 13 * Math.PI / 180;
      const base = Math.atan2(off.y, off.x) + spread;
      const t = clamp01((p - 0.12 - i * 0.06) / 0.42);
      const r0 = icon * 0.45, r1 = icon * (0.45 + 0.75 * t);
      if (t <= 0) continue;
      out += line(b.x + Math.cos(base) * r0, b.y + Math.sin(base) * r0,
        b.x + Math.cos(base) * r1, b.y + Math.sin(base) * r1,
        'stroke="' + C.white + '" stroke-width="' + n(icon * 0.13) + '" stroke-linecap="round" ' +
        'opacity="' + n((1 - t * 0.7) * 0.95) + '" filter="url(#fx-glow-tight)"');
    }
  }
  if (evaded) {
    // The round is not stopped: it slides past the hull and keeps going, with a shimmer where it was refused.
    const sx = -off.y, sy = off.x;         // sidestep, perpendicular to the approach
    const d = icon * (1.02 - 1.8 * p);
    const drift = icon * 0.6 * Math.max(0, p - meet) * 2;
    const ex = b.x + off.x * d + sx * drift, ey = b.y + off.y * d + sy * drift;
    out += line(ex - off.x * icon * 0.4, ey - off.y * icon * 0.4, ex, ey, 'stroke="' + F.missile + '" stroke-width="' + n(icon * 0.09) + '" stroke-linecap="round" opacity="0.6"') +
      projectileGlyph(ex, ey, icon * 0.32, F, 1) +
      circle(ex, ey, icon * 0.12, 'fill="' + C.white + '" opacity="0.9"');
    out += polyline(arcPoints(b.x, b.y, icon * (0.8 + 0.25 * p), -150, -30, 16),
      'fill="none" stroke="' + C.defensive + '" stroke-width="1.8" stroke-linecap="round" opacity="' + n((1 - p) * 0.7) + '"');
  } else if (p < meet) {
    out += inboundRounds(b, icon, close, F, approach, seed, 1);
  } else {
    // Killed short of the hull: a bright pop where the round died, then fragments spraying back along its bearing.
    const kx = b.x + off.x * icon * 0.55, ky = b.y + off.y * icon * 0.55;
    out += circle(kx, ky, icon * 0.55 * (1 - after * 0.4), 'fill="url(#fx-grad-guard)" opacity="' + n(1 - after * 0.55) + '"') +
      ring(kx, ky, icon * (0.2 + 0.45 * after), 'fill="none" stroke="' + C.defensive + '" stroke-width="' + n(icon * 0.12) + '" opacity="' + n(Math.max(0, 0.95 - after)) + '" filter="url(#fx-glow-soft)"') +
      circle(kx, ky, icon * 0.3 * Math.max(0, 1 - after * 1.6), 'fill="' + C.white + '" opacity="' + n(Math.max(0, 1 - after * 1.3)) + '" filter="url(#fx-glow-tight)"') +
      shards({ x: kx, y: ky }, icon, 0.8, 8, C.white, seed, Math.max(0, 1 - after * 0.9), after);
  }
  // The guard arc itself, brightest at the moment of the kill.
  out += polyline(arcPoints(b.x, b.y, icon * (0.72 + 0.18 * p), -150, -30, 18),
    'fill="none" stroke="' + C.defensive + '" stroke-width="2.4" stroke-linecap="round" ' +
    'opacity="' + n((evaded ? 0.5 : 1) * (0.35 + 0.6 * (1 - Math.abs(p - meet) * 2))) + '" filter="url(#fx-glow-tight)"');
  out += tag(b.x, b.y - icon * 1.4, outcome, C.defensive, 0.95);
  return out;
}

function unconfirmedCue(a, b, icon, phase, reduced) {
  const anchor = b || a;
  const fade = reduced ? 0.8 : 0.85 - clamp01(phase) * 0.35;
  let out = '';
  if (a && b) {
    out += line(a.x, a.y, b.x, b.y,
      'stroke="' + C.muted + '" stroke-width="1.4" stroke-dasharray="4 7" stroke-linecap="round" ' +
      'opacity="' + n(fade) + '"');
    out += ring(b.x, b.y, icon * 0.55,
      'fill="none" stroke="' + C.muted + '" stroke-width="1.2" stroke-dasharray="3 6" opacity="' + n(fade) + '"');
  } else {
    const r = reduced ? icon * 0.85 : icon * (0.6 + 0.35 * clamp01(phase));
    out += ring(anchor.x, anchor.y, r,
      'fill="none" stroke="' + C.muted + '" stroke-width="1.4" stroke-dasharray="4 7" opacity="' + n(fade) + '"');
  }
  // Never a burst: an unconfirmed exchange gets a question mark and nothing
  // that reads as confirmation.
  out += tag(anchor.x, anchor.y - icon * 1.35, '? unconfirmed', C.muted, 0.9);
  return out;
}

function genericPulse(anchor, icon, phase, reduced) {
  if (reduced) {
    return ring(anchor.x, anchor.y, icon * 0.8, 'fill="none" stroke="' + C.beamHalo + '" stroke-width="1.6" opacity="0.75"') +
      circle(anchor.x, anchor.y, icon * 0.2, 'fill="' + C.beamCore + '" opacity="0.85"') +
      tag(anchor.x, anchor.y - icon * 1.3, 'fire', C.beamCore, 0.85);
  }
  const p = clamp01(phase);
  return ring(anchor.x, anchor.y, icon * (0.35 + 0.7 * p),
    'fill="none" stroke="' + C.beamHalo + '" stroke-width="' + n(icon * 0.1) + '" ' +
    'opacity="' + n((1 - p) * 0.85) + '" filter="url(#fx-glow-soft)"') +
    circle(anchor.x, anchor.y, icon * 0.18 * (1 - p * 0.5), 'fill="' + C.beamCore + '" opacity="' + n(1 - p * 0.6) + '"');
}

// ------------------------------------------------------------- markup

export function effectMarkup(event, options) {
  if (!event || !event.kind) return '';
  if (NO_EFFECT_KINDS.has(event.kind)) return '';
  const opts = options || {};
  const project = opts.project;
  if (typeof project !== 'function') return '';
  const icon = Number.isFinite(opts.icon) ? opts.icon : 12;
  const phase = Number.isFinite(opts.phase) ? clamp01(opts.phase) : 0;
  const reduced = !!opts.reduced;
  const seed = opts.seed == null ? event.kind : opts.seed;
  const F = flavourOf(opts.faction);
  const approach = approachVector(event, opts.victim);

  const a = sourceOf(event, project);
  const b = destinationOf(event, project);
  if (!a && !b) return '';

  const outcome = event.outcome || 'resolved';
  const kind = event.kind;
  let body = '';
  let cls = 'fx-' + kind + (opts.faction && FLAVOURS[opts.faction] ? ' fx-' + opts.faction : '');

  if (outcome === 'unconfirmed') {
    cls += ' fx-unconfirmed';
    body = unconfirmedCue(a, b, icon, phase, reduced);
  } else if (outcome === 'miss') {
    cls += ' fx-miss';
    body = missCue(a, b, icon, phase, reduced);
  } else if (outcome === 'intercepted' || outcome === 'evaded') {
    cls += ' fx-defended';
    body = b ? defensiveCue(b, icon, phase, reduced, outcome, seed, F, approach)
      : defensiveCue(a, icon, phase, reduced, outcome, seed, F, approach);
  } else if (kind === 'beam') {
    body = a && b ? beamBoth(a, b, icon, phase, reduced, F, seed)
      : b ? inboundFlare(b, icon, phase, reduced, F.beamCore, F.beamHalo, 'beam')
        : genericPulse(a, icon, phase, reduced);
  } else if (kind === 'spinal') {
    body = a && b ? spinalBoth(a, b, icon, phase, reduced)
      : b ? inboundFlare(b, icon, phase, reduced, C.spinal, C.spinalHalo, 'spinal')
        : genericPulse(a, icon, phase, reduced);
  } else if (kind === 'strike') {
    body = a && b ? strikeBoth(a, b, icon, phase, reduced, seed)
      : b ? strikeOrbit(b, icon, phase, reduced, seed)
        : strikeOrbit(a, icon, phase, reduced, seed);
  } else if (kind === 'launch') {
    if (a) {
      body = launchCue(a, icon, phase, reduced, F, b);
      if (b) {
        // Both endpoints were supplied, so a faint intent line discloses
        // nothing new. It is dashed and labelled "launch" -- it is not a
        // flight path and no projectile travels along it.
        body = line(a.x, a.y, b.x, b.y,
          'stroke="' + F.missile + '" stroke-width="1.6" stroke-dasharray="4 8" stroke-linecap="round" ' +
          'opacity="' + (reduced ? '0.4' : n(0.55 - clamp01(phase) * 0.2)) + '"') + body;
      }
    } else {
      body = launchCue(b, icon, phase, reduced, F);
    }
  } else if (kind === 'missile') {
    body = b ? missileArrival(b, icon, phase, reduced, outcome, F, approach, seed) : '';
  } else {
    body = genericPulse(b || a, icon, phase, reduced);
  }

  if (!body) return '';
  body += faceCue(event, opts.victim, project, icon);
  return group(cls, body);
}

// ------------------------------------------------------- announcements

const KIND_TITLE = {
  beam: 'Beam fire',
  spinal: 'Spinal cannon fired',
  strike: 'Strike run launched',
  launch: 'Torpedo launched',
  missile: 'Torpedo arrival',
  fire: 'Weapons fire'
};

function nameOf(id, label) {
  if (id == null) return null;
  if (typeof label === 'function') {
    const got = label(id);
    if (got) return String(got);
  }
  return String(id);
}

export function announcement(event, options) {
  if (!event || !event.kind) return { title: '', detail: '', weight: 'minor' };
  const label = (options || {}).label;
  const outcome = event.outcome || 'resolved';
  const incoming = event.direction === 'incoming';

  if (event.kind === 'contact-acquired') {
    return {
      title: 'Contact acquired',
      detail: (nameOf(event.contactId, label) || 'Unknown contact') + ' · sensor contact established',
      weight: 'minor'
    };
  }
  if (event.kind === 'contact-lost') {
    // Contact loss is not destruction and must never be reported as one.
    return {
      title: 'Contact lost',
      detail: (nameOf(event.contactId, label) || 'Unknown contact') + ' · track dropped, status unknown',
      weight: 'minor'
    };
  }

  const shooter = nameOf(event.shooterId, label) || 'Unknown source';
  const target = nameOf(event.targetId, label) || 'Unknown recipient';

  let title = KIND_TITLE[event.kind] || KIND_TITLE.fire;
  let weight = 'minor';

  if (event.kind === 'spinal' || event.kind === 'strike') weight = 'major';
  if (event.kind === 'missile') {
    if (outcome === 'resolved') {
      weight = 'major';
      title = incoming
        ? (Number.isInteger(event.face)
          ? 'Incoming torpedo strikes own shield face ' + event.face
          : 'Incoming torpedo arrives on own hull')
        : 'Torpedo arrives on target';
    } else {
      title = 'Torpedo ' + (outcome === 'miss' ? 'missed' : outcome);
    }
  } else if (incoming) {
    title = 'Incoming ' + title.charAt(0).toLowerCase() + title.slice(1);
  }

  if (outcome === 'unconfirmed') {
    weight = event.kind === 'spinal' || event.kind === 'strike' ? 'major' : 'minor';
    if (!/unconfirmed/i.test(title)) title = title + ' (unconfirmed)';
  } else if (outcome === 'miss' || outcome === 'intercepted' || outcome === 'evaded') {
    weight = 'minor';
  }

  const detail = shooter + ' → ' + target + ' · outcome ' + outcome;
  return { title, detail, weight };
}

// ----------------------------------------------------------- durations

export function effectDuration(event, reduced) {
  if (reduced) return 0;
  if (!event || !event.kind) return 0;
  if (NO_EFFECT_KINDS.has(event.kind)) return 0;
  if (event.outcome === 'miss') return 500;
  switch (event.kind) {
    case 'beam': return 700;
    case 'spinal': return 1400;
    case 'strike': return 1300;
    case 'launch': return 1100;
    case 'missile': return 1300;
    default: return 600;
  }
}

// ------------------------------------------------------------- gallery
//
// Synthetic fixtures only. None of this is real combat data; the coordinates
// are invented for the gallery page and never come from a session.

export const GALLERY = [
  {
    name: 'beam-outgoing-both-endpoints',
    note: 'Own beam with both endpoints known: pale-blue core, soft halo, bright pulse running source to destination.',
    event: { kind: 'beam', direction: 'outgoing', outcome: 'resolved', shooterId: 'own-1', source: { q: 2, r: 3 }, targetId: 'contact-7', destination: { q: 7, r: 1 } }
  },
  {
    name: 'beam-incoming-source-unknown',
    note: 'Incoming beam with no source: contracting ring plus inward ticks. No line, no bearing.',
    event: { kind: 'beam', direction: 'incoming', outcome: 'resolved', targetId: 'own-1', destination: { q: 4, r: 4 } }
  },
  {
    name: 'spinal-outgoing-both-endpoints',
    note: 'Heavy violet discharge, white core, wide halo, muzzle bloom at source and shock ring at destination.',
    event: { kind: 'spinal', direction: 'outgoing', outcome: 'resolved', shooterId: 'own-2', source: { q: 1, r: 6 }, targetId: 'contact-3', destination: { q: 8, r: 2 } }
  },
  {
    name: 'spinal-incoming-destination-only',
    note: 'Incoming spinal, carrier concealed: violet ring-based flare at the recipient only.',
    event: { kind: 'spinal', direction: 'incoming', outcome: 'resolved', targetId: 'own-2', destination: { q: 5, r: 5 } }
  },
  {
    name: 'strike-outgoing-both-endpoints',
    note: 'Stylised attack run: staggered chevrons with lateral spread and a flicker at the destination. Illustrative, not squadron positions.',
    event: { kind: 'strike', direction: 'outgoing', outcome: 'resolved', shooterId: 'own-3', source: { q: 0, r: 2 }, targetId: 'contact-9', destination: { q: 9, r: 4 } }
  },
  {
    name: 'strike-incoming-carrier-concealed',
    note: 'Incoming strike with no source: chevrons orbit the recipient so no chevron implies a bearing to a carrier.',
    event: { kind: 'strike', direction: 'incoming', outcome: 'resolved', targetId: 'own-3', destination: { q: 6, r: 3 } }
  },
  {
    name: 'launch-source-only',
    note: 'Launch cue at the launcher: expanding ring and a projectile glyph drifting clear. No course is drawn.',
    event: { kind: 'launch', direction: 'outgoing', outcome: 'launched', shooterId: 'own-1', source: { q: 3, r: 5 } }
  },
  {
    name: 'launch-source-and-destination',
    note: 'Same launch cue plus a faint dashed intent line, allowed because both endpoints were supplied. Labelled launch, not travel.',
    event: { kind: 'launch', direction: 'outgoing', outcome: 'launched', shooterId: 'own-1', source: { q: 3, r: 5 }, targetId: 'contact-4', destination: { q: 9, r: 1 } }
  },
  {
    name: 'missile-arrival-own-resolved',
    note: 'Arrival at an own ship with a known shield face: warm contracting ring and burst, plus a face arc on the correct facing.',
    event: { kind: 'missile', direction: 'incoming', outcome: 'resolved', targetId: 'own-4', destination: { q: 5, r: 2 }, face: 2 },
    victim: { id: 'own-4', pos: { q: 5, r: 2 }, facing: 1 }
  },
  {
    name: 'missile-arrival-miss',
    note: 'Muted dashed ring with a miss tag. No burst.',
    event: { kind: 'missile', direction: 'incoming', outcome: 'miss', targetId: 'own-4', destination: { q: 5, r: 2 } }
  },
  {
    name: 'missile-arrival-intercepted',
    note: 'Defensive cue: cyan shield arc with scatter, tagged intercepted.',
    event: { kind: 'missile', direction: 'incoming', outcome: 'intercepted', targetId: 'own-4', destination: { q: 5, r: 2 }, face: 5 },
    victim: { id: 'own-4', pos: { q: 5, r: 2 }, facing: 3 }
  },
  {
    name: 'missile-arrival-evaded',
    note: 'Same defensive family, tagged evaded.',
    event: { kind: 'missile', direction: 'outgoing', outcome: 'evaded', shooterId: 'own-1', targetId: 'contact-2', destination: { q: 7, r: 6 } }
  },
  {
    name: 'beam-unconfirmed',
    note: 'Dashed muted geometry with a question mark. Never a burst, never a claim.',
    event: { kind: 'beam', direction: 'outgoing', outcome: 'unconfirmed', shooterId: 'own-1', source: { q: 2, r: 2 }, targetId: 'contact-8', destination: { q: 8, r: 5 } }
  },
  {
    name: 'fire-generic',
    note: 'Unclassified weapons fire: a neutral pulse at the one known point.',
    event: { kind: 'fire', direction: 'incoming', outcome: 'resolved', targetId: 'own-5', destination: { q: 4, r: 1 } }
  },
  {
    name: 'missile-with-fabricated-source',
    note: 'Defensive case. A source field is present but an arriving missile never discloses launcher coordinates, so it is dropped and only the arrival cue is drawn.',
    event: { kind: 'missile', direction: 'incoming', outcome: 'resolved', targetId: 'own-4', source: { q: 0, r: 0 }, destination: { q: 6, r: 6 } }
  },
  {
    name: 'contact-acquired',
    note: 'No map effect at all: the marker itself is the news. Announcement only.',
    event: { kind: 'contact-acquired', contactId: 'contact-11' }
  },
  {
    name: 'contact-lost',
    note: 'No map effect. Contact loss is not destruction and the wording says track dropped, status unknown.',
    event: { kind: 'contact-lost', contactId: 'contact-11' }
  }
];
