// Where a shield face is DRAWN on the map must be where that face actually IS.
//
// PLAYTEST BUG, Chris, 9 September 2026: "in some cases, different shields are shown as damaged
// between the paper doll and the map marker". The data was never in doubt - both readouts call the
// same shieldFaces() - so the disagreement was geometric.
//
// The oracle is the engine plus the map's own projection, not a screenshot. For a ship at heading f,
// shield face F covers hex direction (f + offset(F)); project that neighbouring hex with the
// projection the map itself documents, and the face for F must lie on that bearing. Nothing here
// hard-codes an angle, so the test still holds if the hex layout is ever re-derived - and it holds
// for all three ring shapes, because the shape is a silhouette decision and never a geometry one.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { shieldArcMarkup, contactShieldArcMarkup, RING_SHAPES, DEFAULT_RING_SHAPE } = await mod('arena/contact-condition-arcs.js');
const { OFFSET_OF_FACE } = await mod('arena/command-model.js');
const { DIRS } = await mod('src/tactical/hex.js');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };

// The map's documented pointy-top axial geometry: x = pitch(q + r/2), y = pitch(0.866)r, screen y
// growing downward. contact-map-layout.js states it in those words.
const PITCH = 120;
const project = p => ({ x: PITCH * (p.q + p.r / 2), y: PITCH * 0.866 * p.r });
const CENTRE = project({ q: 0, r: 0 });

// Screen bearing in degrees, counter-clockwise from screen right, y growing downward.
const bearingOf = (dx, dy) => (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
const gap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Where the engine says direction d lies on this map.
const directionBearing = d => {
  const n = project({ q: DIRS[d].q, r: DIRS[d].r });
  return bearingOf(n.x - CENTRE.x, n.y - CENTRE.y);
};

const numbersIn = markup => markup.match(/-?[\d.]+/g).map(Number);
const faceGroup = (markup, attribute, face) => {
  const g = new RegExp(`<g data-${attribute}="${face}"[\\s\\S]*?</g>`).exec(markup);
  assert.ok(g, `no group rendered for face ${face}`);
  return g[0];
};
// The track is an arc, a straight edge or a quadratic; in every case its first and last coordinate
// pairs are the two ends of the face, so their midpoint lies on the bearing the face was drawn at.
function drawnBearing(markup, attribute, face) {
  const d = /<path d="([^"]+)"/.exec(faceGroup(markup, attribute, face));
  assert.ok(d, `face ${face} drew no path`);
  const n = numbersIn(d[1]);
  return bearingOf((n[0] + n.at(-2)) / 2 - CENTRE.x, (n[1] + n.at(-1)) / 2 - CENTRE.y);
}

const shields = () => [1, 2, 3, 4, 5, 6].map(face => ({ face, capacity: 12, remaining: 6, down: false }));
const ship = facing => ({ id: 'A-own', pos: { q: 0, r: 0 }, facing, shields: shields() });

check('every own shield face is drawn on the bearing of the hex direction it covers', () => {
  for (const shape of RING_SHAPES) for (let facing = 0; facing < 6; facing++) {
    const markup = shieldArcMarkup(ship(facing), { project, scale: 40, shape });
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const expected = directionBearing((facing + OFFSET_OF_FACE[face]) % 6);
      const actual = drawnBearing(markup, 'shield-face', face);
      assert.ok(gap(expected, actual) < 1,
        `${shape}, facing ${facing}, face ${face}: drawn at ${actual.toFixed(1)}deg, covers ${expected.toFixed(1)}deg`);
    }
  }
});

check('a scanned contact ring uses the same geometry as the own ring', () => {
  // The two rings differ in colour, radius and provenance. They must not differ in where a face is.
  const reading = { detail: 'points', takenTurn: 3, stale: false, ageTurns: 0,
    faces: [1, 2, 3, 4, 5, 6].map(face => ({ face, capacity: 9, remaining: 4, down: false })) };
  for (const shape of RING_SHAPES) for (let facing = 0; facing < 6; facing++) {
    const markup = contactShieldArcMarkup({ id: 'B-foe', pos: { q: 0, r: 0 }, facing, shields: reading }, { project, scale: 40, shape });
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const expected = directionBearing((facing + OFFSET_OF_FACE[face]) % 6);
      const actual = drawnBearing(markup, 'contact-shield-face', face);
      assert.ok(gap(expected, actual) < 1,
        `${shape}, facing ${facing}, face ${face}: drawn at ${actual.toFixed(1)}deg, covers ${expected.toFixed(1)}deg`);
    }
  }
});

check('the bow face leads the ship, at every heading and in every shape', () => {
  // The cheapest sanity check a reader can hold in their head: face 2 is forward, so it must sit in
  // the direction the ship is pointing. This alone would have caught the mirror at four headings of six.
  for (const shape of RING_SHAPES) for (let facing = 0; facing < 6; facing++) {
    const markup = shieldArcMarkup(ship(facing), { project, scale: 40, shape });
    assert.ok(gap(directionBearing(facing), drawnBearing(markup, 'shield-face', 2)) < 1,
      `${shape}, facing ${facing}: the forward face is not forward`);
  }
});

check('the ring winds the same way the hex directions do', () => {
  // The mirror this file was written for kept every face on the ring and in the right order, and
  // only reversed the sense of rotation. Pin the sense itself.
  const markup = shieldArcMarkup(ship(0), { project, scale: 40 });
  const two = drawnBearing(markup, 'shield-face', 2), one = drawnBearing(markup, 'shield-face', 1);
  // Face 1 is one direction counter-clockwise of the bow, so its bearing is 60 degrees greater.
  assert.ok(gap((two + 60) % 360, one) < 1,
    `face 1 should sit 60deg counter-clockwise of face 2; got ${two.toFixed(1)} and ${one.toFixed(1)}`);
});

// ---------------------------------------------------------------- the shape, which is only a shape
check('the hexagon lines up with the ship own hex cell', () => {
  // The point of the hexagon is that a shield face IS the hex edge an attack crosses. Each face is
  // therefore a flat whose two ends sit near the cell corners, 30 degrees either side of its centre.
  const markup = shieldArcMarkup(ship(0), { project, scale: 40, shape: 'hex' });
  for (const face of [1, 2, 3, 4, 5, 6]) {
    const n = numbersIn(/<path d="([^"]+)"/.exec(faceGroup(markup, 'shield-face', face))[1]);
    assert.equal(n.length, 4, 'a hex face is a straight edge: two points, no control point');
    const mid = directionBearing(OFFSET_OF_FACE[face]);
    for (const [x, y] of [[n[0], n[1]], [n[2], n[3]]]) {
      const off = ((bearingOf(x - CENTRE.x, y - CENTRE.y) - mid + 540) % 360) - 180;
      assert.ok(Math.abs(Math.abs(off) - 30) < 7, `face ${face} end lies ${off.toFixed(1)}deg off centre, expected about 30`);
    }
  }
});

check('the bowed variant curves, and the flat one does not', () => {
  const flat = numbersIn(/<path d="([^"]+)"/.exec(faceGroup(shieldArcMarkup(ship(0), { project, scale: 40, shape: 'hex' }), 'shield-face', 2))[1]);
  const bowed = numbersIn(/<path d="([^"]+)"/.exec(faceGroup(shieldArcMarkup(ship(0), { project, scale: 40, shape: 'roundhex' }), 'shield-face', 2))[1]);
  assert.equal(flat.length, 4);
  assert.equal(bowed.length, 6, 'a bowed face carries a control point');
  // Same two ends, different middle: the silhouette changes, the geometry does not.
  assert.deepEqual([bowed[0], bowed[1], bowed[4], bowed[5]], flat);
});

check('every shape reports the same faces down, and only the shape changes', () => {
  const s = ship(3);
  s.shields = s.shields.map(f => f.face === 5 ? { ...f, down: true, remaining: 0 } : f);
  const downed = shape => [...shieldArcMarkup(s, { project, scale: 40, shape })
    .matchAll(/data-shield-face="(\d)" data-shield-down="true"/g)].map(m => m[1]);
  for (const shape of RING_SHAPES) assert.deepEqual(downed(shape), ['5'], `${shape} disagrees about what is down`);
});

check('a partly spent face fills from its start, in every shape', () => {
  const s = ship(0);
  s.shields = s.shields.map(f => f.face === 2 ? { ...f, remaining: 3 } : f);   // a quarter left
  for (const shape of RING_SHAPES) {
    const group = faceGroup(shieldArcMarkup(s, { project, scale: 40, shape }), 'shield-face', 2);
    const paths = [...group.matchAll(/<path d="([^"]+)"/g)].map(m => numbersIn(m[1]));
    assert.equal(paths.length, 2, `${shape}: expected a track and a fill`);
    assert.deepEqual([paths[1][0], paths[1][1]], [paths[0][0], paths[0][1]], `${shape}: the fill must start where the face starts`);
    const span = Math.hypot(paths[0].at(-2) - paths[0][0], paths[0].at(-1) - paths[0][1]);
    const lit = Math.hypot(paths[1].at(-2) - paths[1][0], paths[1].at(-1) - paths[1][1]);
    assert.ok(lit > 0 && lit < span * 0.6, `${shape}: a quarter-full face drew ${lit.toFixed(1)} of ${span.toFixed(1)}`);
  }
});

check('the default shape is one the renderer actually knows', () => {
  assert.ok(RING_SHAPES.includes(DEFAULT_RING_SHAPE));
});

console.log(`\nMap shield arcs: ${passed} checks passed.`);
