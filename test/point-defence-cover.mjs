// Point defence is umbrella cover, and the console has to say so.
//
// The engine pools every friendly hull carrying point defence within pointDefence.rangeHexes of the
// TARGET. Four classes carry none - battleship, heavy cruiser, monitor, corvette - so they are
// defended entirely by who is standing near them. Chris, 10 September 2026: "this is important so
// cover can be provided for ships without PD of their own. The human currently has no way to tell."
//
// These checks are against the engine's own rule rather than against a number typed here, so they
// still hold if the radius is retuned.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { pointDefenceUmbrellas, coverFor, pointDefenceMarkup, pointDefenceKey } = await mod('arena/contact-point-defence.js');
const { schematicMarkup } = await mod('arena/console-instruments.js');
const { sideView } = await mod('src/captains/observation.js');
const { createBattleFromFleets } = await mod('src/tactical/resolver.js');
const { buildShip } = await mod('src/tactical/ship.js');
const { enableContacts } = await mod('src/tactical/contacts.js');
const { SENSING_PROFILE } = await mod('src/tactical/sensing.js');
const { makePrng } = await mod('src/prng.js');
const tuning = JSON.parse(fs.readFileSync(path.join(root, 'data/tactical-tuning.json'), 'utf8'));
const loadouts = JSON.parse(fs.readFileSync(path.join(root, 'data/loadouts.json'), 'utf8'));

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };
const RANGE = tuning.pointDefence.rangeHexes;
const hull = className => ({ pointDefence: tuning.hullClasses[className].pointDefence ?? 0 });
const ship = (id, className, q, r) => ({ id, className, hull: hull(className), pos: { q, r } });

check('the classes that carry none are the ones the whole feature is for', () => {
  const without = Object.entries(tuning.hullClasses).filter(([, v]) => !(v.pointDefence > 0)).map(([k]) => k);
  assert.ok(without.includes('battleship') && without.includes('heavy-cruiser'),
    `expected the heavy hulls to carry none; carried by ${without.join(', ')}`);
  assert.ok(Object.values(tuning.hullClasses).some(v => v.pointDefence > 0), 'and something must carry it');
});

check('only living hulls that carry point defence project an umbrella', () => {
  const fleet = [ship('A-cl', 'light-cruiser', 0, 0), ship('A-bb', 'battleship', 1, 0),
    { ...ship('A-dead', 'light-cruiser', 2, 0), destroyed: true }];
  const u = pointDefenceUmbrellas(fleet, RANGE);
  assert.deepEqual(u.map(x => x.id), ['A-cl']);
  assert.equal(u[0].hexes, RANGE);
  assert.equal(u[0].points, tuning.hullClasses['light-cruiser'].pointDefence);
});

check('a hull with none is told what covers it, and what does not', () => {
  const covering = ship('A-cl', 'light-cruiser', 0, 0);
  const near = ship('A-bb', 'battleship', RANGE, 0);          // just inside
  const far = ship('A-ca', 'heavy-cruiser', RANGE + 1, 0);    // just outside
  const u = pointDefenceUmbrellas([covering, near, far], RANGE);
  const inside = coverFor(near, u), outside = coverFor(far, u);
  assert.deepEqual(inside.from, ['A-cl']);
  assert.equal(inside.own, 0);
  assert.equal(inside.pooled, covering.hull.pointDefence);
  assert.deepEqual(outside.from, [], 'one hex further and nothing covers it');
  assert.equal(outside.pooled, 0);
});

check('a covering hull does not count itself twice', () => {
  const a = ship('A-1', 'light-cruiser', 0, 0), b = ship('A-2', 'light-cruiser', 1, 0);
  const u = pointDefenceUmbrellas([a, b], RANGE);
  const cover = coverFor(a, u);
  assert.equal(cover.own, a.hull.pointDefence);
  assert.deepEqual(cover.from, ['A-2']);
  assert.equal(cover.pooled, a.hull.pointDefence + b.hull.pointDefence);
});

check('the overlay draws one hexagon per covering hull, and marks the selected one', () => {
  const fleet = [ship('A-cl', 'light-cruiser', 0, 0), ship('A-dd', 'destroyer', 4, 0), ship('A-bb', 'battleship', 1, 0)];
  const project = p => ({ x: 100 * (p.q + p.r / 2), y: 100 * 0.866 * p.r });
  const svg = pointDefenceMarkup(fleet, { project, rangeHexes: RANGE, selectedId: 'A-dd' });
  assert.equal((svg.match(/data-point-defence=/g) || []).length, 2, 'two covering hulls, two umbrellas');
  assert.ok(!/data-point-defence="A-bb"/.test(svg), 'a hull with none projects nothing');
  assert.match(svg, /data-point-defence="A-dd"[^>]*class|class="point-defence selected"/);
  const poly = /<polygon class="point-defence selected"[^>]*points="([^"]+)"/.exec(svg);
  assert.ok(poly, 'the selected hull is marked');
  assert.equal(poly[1].trim().split(/\s+/).length, 6, 'the region within N hexes is a hexagon');
});

check('nothing is drawn when nothing carries it, or the rule is missing', () => {
  const project = p => ({ x: p.q, y: p.r });
  assert.equal(pointDefenceMarkup([ship('A-bb', 'battleship', 0, 0)], { project, rangeHexes: RANGE }), '');
  assert.equal(pointDefenceMarkup([ship('A-cl', 'light-cruiser', 0, 0)], { project, rangeHexes: 0 }), '');
  assert.equal(pointDefenceMarkup([], { project, rangeHexes: RANGE }), '');
});

check('the key says the thing the player actually wants to know', () => {
  const covering = ship('A-cl', 'light-cruiser', 0, 0), near = ship('A-bb', 'battleship', 1, 0), lone = ship('A-ca', 'heavy-cruiser', 40, 0);
  const u = pointDefenceUmbrellas([covering, near, lone], RANGE);
  assert.match(pointDefenceKey(covering, u), /POINT DEFENCE \d+ · \d+ HEX UMBRELLA/);
  assert.match(pointDefenceKey(near, u), /NO POINT DEFENCE · COVERED BY 1/);
  assert.match(pointDefenceKey(lone, u), /NO POINT DEFENCE · UNCOVERED/);
});

check('the umbrella radius is published to the console as a rule', () => {
  // The console cannot draw a radius it is not told. It is a public rule like the arcs.
  const rng = makePrng(4);
  const a = buildShip('A-1', 'EAR', 'light-cruiser', tuning, loadouts, rng);
  const b = buildShip('B-1', 'KRE', 'destroyer', tuning, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0; b.pos = { q: 8, r: 0 }; b.facing = 3;
  const battle = createBattleFromFleets([[a], [b]], tuning, rng, { terrain: [], maxTurns: 4 });
  enableContacts(battle, { profile: SENSING_PROFILE });
  const view = sideView(battle, 'A');
  assert.equal(view.rules.pointDefence.rangeHexes, RANGE);
  assert.ok(view.own[0].hull.pointDefence >= 0, 'and own hulls report their own points');
});

// ---------------------------------------------------------------- the schematic ring
check('the console schematic draws its shield faces as hexagon flats', () => {
  // Chris, 10 September 2026: apply the map's hexagon to the paper doll too, so the two readouts of
  // the same six faces share a silhouette rather than only a numbering.
  const svg = schematicMarkup({ facing: 0, mounts: [],
    shields: [1, 2, 3, 4, 5, 6].map(face => ({ face, capacity: 9, remaining: face === 2 ? 1 : 9, down: false })) }, { size: 300 });
  assert.equal((svg.match(/data-face=/g) || []).length, 6);
  const [, track, fill] = /data-face="2">[\s\S]*?<path d="([^"]+)"[\s\S]*?<path d="([^"]+)"/.exec(svg);
  assert.ok(!/ A /.test(track), 'a face is a flat, not an arc');
  assert.match(track, /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/);
  const span = d => { const n = d.match(/-?[\d.]+/g).map(Number); return Math.hypot(n[2] - n[0], n[3] - n[1]); };
  assert.ok(span(fill) > 0 && span(fill) < span(track) * 0.25, 'a face at 1 of 9 fills about a ninth');
  // Face 2 is forward and the schematic draws bow-up, so its flat is horizontal across the top.
  const n = track.match(/-?[\d.]+/g).map(Number);
  assert.ok(Math.abs(n[1] - n[3]) < 0.01, 'the forward flat is level');
  assert.ok(n[1] < 150, 'and it is at the top');
});

console.log(`\nPoint defence cover: ${passed} checks passed.`);
