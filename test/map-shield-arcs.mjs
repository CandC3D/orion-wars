// Where a shield face is DRAWN on the map must be where that face actually IS.
//
// PLAYTEST BUG, Chris, 9 September 2026: "in some cases, different shields are shown as damaged
// between the paper doll and the map marker". The data was never in doubt - both readouts call the
// same shieldFaces() - so the disagreement was geometric.
//
// The oracle is the engine plus the map's own projection, not a screenshot. For a ship at heading f,
// shield face F covers hex direction (f + offset(F)); project that neighbouring hex with the
// projection the map itself documents, and the arc for F must lie on that bearing. Nothing here
// hard-codes an angle, so the test still holds if the hex layout is ever re-derived.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { shieldArcMarkup, contactShieldArcMarkup } = await mod('arena/contact-condition-arcs.js');
const { OFFSET_OF_FACE } = await mod('arena/command-model.js');
const { DIRS } = await mod('src/tactical/hex.js');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };

// The map's documented pointy-top axial geometry: x = pitch(q + r/2), y = pitch(0.866)r, screen y
// growing downward. contact-map-layout.js states it in those words.
const PITCH = 120;
const project = p => ({ x: PITCH * (p.q + p.r / 2), y: PITCH * 0.866 * p.r });
const CENTRE = project({ q: 0, r: 0 });

// Screen bearing in degrees, measured counter-clockwise from screen right, y growing downward.
const bearingOf = (dx, dy) => (Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360;
const gap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// Where the engine says direction d lies on this map.
const directionBearing = d => {
  const n = project({ q: DIRS[d].q, r: DIRS[d].r });
  return bearingOf(n.x - CENTRE.x, n.y - CENTRE.y);
};

// The drawn bearing of one face: the midpoint of the track arc's chord, which for an arc symmetric
// about its face centre lies on exactly the bearing the face was drawn at.
function drawnBearing(markup, attribute, face) {
  const group = new RegExp(`<g data-${attribute}="${face}"[\\s\\S]*?</g>`).exec(markup);
  assert.ok(group, `no group rendered for face ${face}`);
  const d = /<path d="M([-\d.]+),([-\d.]+)A[\d.]+,[\d.]+ 0 \d \d ([-\d.]+),([-\d.]+)"/.exec(group[0]);
  assert.ok(d, `face ${face} drew no arc path`);
  const mx = (Number(d[1]) + Number(d[3])) / 2, my = (Number(d[2]) + Number(d[4])) / 2;
  return bearingOf(mx - CENTRE.x, my - CENTRE.y);
}

const shields = () => [1, 2, 3, 4, 5, 6].map(face => ({ face, capacity: 12, remaining: 6, down: false }));
const ship = facing => ({ id: 'A-own', pos: { q: 0, r: 0 }, facing, shields: shields() });

check('every own shield face is drawn on the bearing of the hex direction it covers', () => {
  for (let facing = 0; facing < 6; facing++) {
    const markup = shieldArcMarkup(ship(facing), { project, scale: 40 });
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const expected = directionBearing((facing + OFFSET_OF_FACE[face]) % 6);
      const actual = drawnBearing(markup, 'shield-face', face);
      assert.ok(gap(expected, actual) < 1,
        `facing ${facing}, face ${face}: drawn at ${actual.toFixed(1)}deg, covers ${expected.toFixed(1)}deg`);
    }
  }
});

check('a scanned contact ring uses the same geometry as the own ring', () => {
  // The two rings differ in colour, radius and provenance. They must not differ in where a face is.
  const reading = { detail: 'points', takenTurn: 3, stale: false, ageTurns: 0,
    faces: [1, 2, 3, 4, 5, 6].map(face => ({ face, capacity: 9, remaining: 4, down: false })) };
  for (let facing = 0; facing < 6; facing++) {
    const markup = contactShieldArcMarkup({ id: 'B-foe', pos: { q: 0, r: 0 }, facing, shields: reading }, { project, scale: 40 });
    for (const face of [1, 2, 3, 4, 5, 6]) {
      const expected = directionBearing((facing + OFFSET_OF_FACE[face]) % 6);
      const actual = drawnBearing(markup, 'contact-shield-face', face);
      assert.ok(gap(expected, actual) < 1,
        `facing ${facing}, face ${face}: drawn at ${actual.toFixed(1)}deg, covers ${expected.toFixed(1)}deg`);
    }
  }
});

check('the bow face leads the ship, at every heading', () => {
  // The cheapest sanity check a reader can hold in their head: face 2 is forward, so it must sit in
  // the direction the ship is pointing. This one would have caught the mirror at four headings of six.
  for (let facing = 0; facing < 6; facing++) {
    const markup = shieldArcMarkup(ship(facing), { project, scale: 40 });
    assert.ok(gap(directionBearing(facing), drawnBearing(markup, 'shield-face', 2)) < 1,
      `facing ${facing}: the forward face is not forward`);
  }
});

check('the ring winds the same way the hex directions do', () => {
  // The mirror this test was written for kept every face on the ring and in the right order, and
  // only reversed the sense of rotation. Pin the sense itself.
  const markup = shieldArcMarkup(ship(0), { project, scale: 40 });
  const twoDeg = drawnBearing(markup, 'shield-face', 2);
  const oneDeg = drawnBearing(markup, 'shield-face', 1);
  // Face 1 is one direction counter-clockwise of the bow, so its bearing is 60 degrees greater.
  assert.ok(gap((twoDeg + 60) % 360, oneDeg) < 1,
    `face 1 should sit 60deg counter-clockwise of face 2; got ${twoDeg.toFixed(1)} and ${oneDeg.toFixed(1)}`);
});

check('a face that is down is marked down wherever it is drawn', () => {
  const s = ship(2);
  s.shields = s.shields.map(f => f.face === 3 ? { ...f, down: true, remaining: 0 } : f);
  const markup = shieldArcMarkup(s, { project, scale: 40 });
  const group = /<g data-shield-face="3"[\s\S]*?<\/g>/.exec(markup)[0];
  assert.match(group, /data-shield-down="true"/);
  assert.ok(gap(directionBearing((2 + OFFSET_OF_FACE[3]) % 6), drawnBearing(markup, 'shield-face', 3)) < 1,
    'and it is drawn on the bearing it covers');
  for (const face of [1, 2, 4, 5, 6])
    assert.match(/<g data-shield-face="\d"[\s\S]*?<\/g>/.exec(new RegExp(`<g data-shield-face="${face}"[\\s\\S]*?</g>`).exec(markup)[0])[0], /data-shield-down="false"/);
});

console.log(`\nMap shield arcs: ${passed} checks passed.`);
