// A side-by-side of the three shield-ring silhouettes, drawn by the real renderer on the real hex
// geometry, so the choice is made on the thing itself rather than on a description of it.
// Writes an HTML file; pass an output path or take the default.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shieldArcMarkup, conditionArcMarkup, RING_SHAPES } from '../arena/contact-condition-arcs.js';
import { hexGridPath, HEX_CIRCUMRADIUS } from '../arena/contact-map-layout.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] || path.join(root, 'docs', 'ring-shapes.html');

const SCALE = 92;                                   // hex pitch, a little above the play zoom
const project = p => ({ x: 300 + SCALE * (p.q + p.r / 2), y: 210 + SCALE * 0.866 * p.r });
const cells = [];
for (let r = -3; r <= 3; r++) for (let q = -4; q <= 4; q++) if (Math.abs(q + r / 2) <= 3.4) cells.push({ q, r });

// One hurt own ship and one enemy contact, the pairing that prompted the note: the enemy's hull ring
// is a plain circle, so whatever the own ring is must not read as the same instrument.
const own = {
  id: 'A-heavy-cruiser-1', pos: { q: 0, r: 0 }, facing: 0,
  shields: [
    { face: 1, capacity: 13, remaining: 5, down: false },
    { face: 2, capacity: 13, remaining: 13, down: false },
    { face: 3, capacity: 13, remaining: 0, down: true },
    { face: 4, capacity: 13, remaining: 13, down: false },
    { face: 5, capacity: 13, remaining: 9, down: false },
    { face: 6, capacity: 13, remaining: 13, down: false }
  ]
};
const foe = { id: 'B-battleship-1', pos: { q: 2, r: -1 }, facing: 3,
  observedDamage: { detail: 'bracket', condition: 'damaged' } };

const ICON = (p, fill) => `<g transform="translate(${p.x},${p.y})">`
  + `<path d="M14,0 L-7,10 L-7,-10 Z" fill="${fill}" fill-opacity=".85" stroke="${fill}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
const LABEL = (p, text, fill) => `<text x="${p.x}" y="${p.y + 66}" text-anchor="middle" font-size="12"`
  + ` letter-spacing="1.5" fill="${fill}" font-family="ui-monospace,Consolas,monospace">${text}</text>`;

function panel(shape, radius = null) {
  const grid = hexGridPath(cells, project, SCALE);
  return `<svg viewBox="0 0 600 420" width="600" height="420" role="img" aria-label="${shape} shield ring">`
    + `<rect width="600" height="420" fill="#0b141b"/>`
    + `<path d="${grid}" fill="none" stroke="#22323d" stroke-width="1"/>`
    + conditionArcMarkup(foe, { project, scale: SCALE })
    + ICON(project(foe.pos), '#7fd39b') + LABEL(project(foe.pos), 'BATTLESHIP 01', '#7fd39b')
    + shieldArcMarkup(own, { project, scale: SCALE, shape, radius })
    + ICON(project(own.pos), '#7bc6ec') + LABEL(project(own.pos), 'HEAVY CRUISER 01', '#7bc6ec')
    + `</svg>`;
}

// Each hexagon is inscribed in the circle the circle-shape draws, so all four
// panels have the same footprint except the last, which is deliberately smaller.
const PANELS = [
  { shape: 'circle', name: 'CIRCLE &middot; today',
    note: 'Both rings are circles. The enemy ring means hull condition, the own ring means shields, and nothing but colour says which.' },
  { shape: 'hex', name: 'HEXAGON',
    note: 'Same footprint, different silhouette. A shield face is the hex edge an attack crosses, so each face is drawn as a flat at that bearing.' },
  { shape: 'roundhex', name: 'ROUNDED HEXAGON',
    note: 'The same six flats, bowed outward. Keeps the hexagonal read but softens against the grid.' },
  { shape: 'hex', radius: HEX_CIRCUMRADIUS(SCALE), name: 'HEXAGON &middot; at cell size',
    note: 'The same shape pulled in until the flats land on the ship own hex edges. Now the ring is not a symbol of the facing, it is the boundary the attack crosses.' }
];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Shield ring silhouettes</title>
<style>
  body{background:#070e13;color:#cfe0e8;font:14px ui-monospace,Consolas,monospace;margin:0;padding:28px 20px 40px}
  h1{font-size:15px;letter-spacing:3px;font-weight:600;color:#7bc6ec;margin:0 0 4px}
  p.lede{color:#8ea6b4;margin:0 0 24px;max-width:78ch;line-height:1.55}
  .row{display:flex;flex-wrap:wrap;gap:22px}
  figure{margin:0;border:1px solid #22323d;background:#0b141b}
  figcaption{padding:10px 14px;border-top:1px solid #22323d}
  b{color:#e9f4f6;letter-spacing:2px;font-weight:600;display:block;margin-bottom:4px}
  span{color:#8ea6b4;line-height:1.5;display:block;max-width:56ch}
  svg{display:block}
</style>
<h1>SHIELD RING SILHOUETTES</h1>
<p class="lede">Heavy Cruiser 01 at heading 0, face 1 down to 5 of 13, face 3 knocked out, face 5 at 9 of 13 &mdash;
with Battleship 01 alongside carrying the enemy hull-condition ring, which is the circle the own ring is
being confused with. Drawn by the live renderer on the live hex geometry.</p>
<div class="row">${PANELS.map(p => `<figure>${panel(p.shape, p.radius ?? null)}<figcaption><b>${p.name}</b><span>${p.note}</span></figcaption></figure>`).join('')}</div>
`, 'utf8');
console.log('wrote', out);
