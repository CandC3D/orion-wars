// Chris's playtest of 10 September 2026, the console half. Each check names the note it answers.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { hexesWithin, regionEdges, key } = await mod('arena/hex-region.js');
const { inPlaceRotations, rotationMarkup } = await mod('arena/contact-rotation.js');
const { reticleMarkup } = await mod('arena/contact-reticle.js');
const { debrisVariant, debrisMarkup, DEBRIS_VARIANTS } = await mod('arena/contact-debris.js');
const { readinessChanges } = await mod('arena/weapon-readiness.js');
const { DIRS } = await mod('src/tactical/hex.js');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };
const PITCH = 100;
const project = p => ({ x: PITCH * (p.q + p.r / 2), y: PITCH * 0.866 * p.r });

// ---------------------------------------------------------------- "exactly outline the hexes"
check('a coverage outline runs along the real edges of the covered cells', () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const cells = hexesWithin({ q: 0, r: 0 }, n);
    assert.equal(cells.length, 3 * n * (n + 1) + 1, `n=${n} cell count`);
    assert.equal(regionEdges(cells, project, PITCH).length, 6 * (2 * n + 1), `n=${n} boundary edges`);
  }
});

check('and every edge sits exactly between a covered cell and an uncovered one', () => {
  // An asymmetric region, so a mirrored edge mapping cannot hide behind the right counts - the
  // failure the map shield ring had on 9 September.
  const cells = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 2, r: -1 }, { q: 2, r: -2 }];
  const inside = new Set(cells.map(key));
  for (const [a, b] of regionEdges(cells, project, PITCH)) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const ok = cells.some(c => DIRS.some(d => {
      const n = { q: c.q + d.q, r: c.r + d.r };
      if (inside.has(key(n))) return false;
      const pc = project(c), pn = project(n);
      return Math.hypot((pc.x + pn.x) / 2 - m.x, (pc.y + pn.y) / 2 - m.y) < 0.01;
    }));
    assert.ok(ok, `edge at ${m.x.toFixed(1)},${m.y.toFixed(1)} is not on the covered boundary`);
  }
});

// ---------------------------------------------------------------- "rotate the ship in place"
check('a turn that does not leave its hex is found, and one that moves is not', () => {
  const actions = [
    { round: 1, start: { q: 0, r: 0, facing: 0 }, end: { q: 0, r: 0, facing: 1 } },
    { round: 2, start: { q: 0, r: 0, facing: 1 }, end: { q: 2, r: 0, facing: 1 } },
    { round: 3, start: { q: 2, r: 0, facing: 1 }, end: { q: 2, r: 0, facing: 5 } },
    { round: 4, start: { q: 2, r: 0, facing: 5 }, end: { q: 2, r: 0, facing: 5 } }
  ];
  assert.deepEqual(inPlaceRotations(actions).map(r => [r.round, r.turn]), [[1, 1], [3, -2]],
    'a +4 turn is the short way round: two faces to starboard');
  const svg = rotationMarkup(actions, { project, scale: PITCH });
  assert.equal((svg.match(/class="rotate-in-place"/g) || []).length, 2);
  assert.ok(!/NaN/.test(svg));
});

// ---------------------------------------------------------------- "more science fictiony"
check('the selection mark is six corner brackets on the ship own hex, not a box', () => {
  const svg = reticleMarkup({ x: 0, y: 0 }, PITCH);
  const d = /d="([^"]+)"/.exec(svg)[1];
  assert.equal((d.match(/M/g) || []).length, 6, 'one bracket per corner');
  const pts = d.match(/-?[\d.]+/g).map(Number);
  // Every bracket corner lies just outside the cell circumradius, at a pointy-top corner bearing.
  const R = PITCH / Math.sqrt(3);
  for (let i = 0; i < pts.length; i += 6) {
    const cx = pts[i + 2], cy = pts[i + 3];
    assert.ok(Math.hypot(cx, cy) > R, 'the reticle sits outside the hex');
    const bearing = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
    assert.ok(Math.abs(((bearing - 30) % 60 + 60) % 60) < 0.5 || Math.abs(((bearing - 30) % 60 + 60) % 60 - 60) < 0.5,
      `bracket corner at ${bearing.toFixed(1)}deg is not a hex corner`);
  }
});

// ---------------------------------------------------------------- "ship debris, at least 3"
check('there are at least three debris variants and every one renders', () => {
  assert.ok(DEBRIS_VARIANTS.length >= 3);
  for (let v = 0; v < DEBRIS_VARIANTS.length; v++) assert.ok(DEBRIS_VARIANTS[v](1).length > 50);
});

check('a wreck always shows the same debris, and the fleet shows a spread of them', () => {
  assert.equal(debrisVariant('B-battleship-1'), debrisVariant('B-battleship-1'));
  const classes = ['frigate', 'destroyer', 'missile-destroyer', 'light-cruiser', 'heavy-cruiser', 'battleship', 'carrier', 'monitor'];
  const ids = []; for (const side of 'AB') for (const c of classes) for (let n = 1; n <= 4; n++) ids.push(`${side}-${c}-${n}`);
  const counts = new Array(DEBRIS_VARIANTS.length).fill(0);
  for (const id of ids) counts[debrisVariant(id)]++;
  // Ids differ only in their tails; a weak hash put six of eight on one variant. Demand real variety.
  for (const c of counts) assert.ok(c >= ids.length / DEBRIS_VARIANTS.length * 0.6, `uneven debris spread: ${counts.join('/')}`);
});

check('debris stands where the ship was, turned to its last heading', () => {
  const svg = debrisMarkup({ id: 'B-1', facing: 2 }, { x: 120, y: 80 }, 30);
  assert.match(svg, /translate\(120\.0 80\.0\)/);
  assert.match(svg, /rotate\(-120\)/);
  assert.ok(!/NaN/.test(svg));
});

// ---------------------------------------------------------------- "comes back online"
const own = (spinal, fired) => ({ own: [{ id: 'A-g', destroyed: false, spinal,
  mounts: [{ id: 1, kind: 'spinal', type: 'spinal-cannon', displayName: 'Spinal cannon' },
    { id: 2, kind: 'beam', type: 'laser', displayName: 'Laser', firedThisTurn: fired }] }] });

check('the cannon cycle is news', () => {
  const cool = readinessChanges(own({ state: 'cooldown', charge: 0, cooldown: 1 }, false), own({ state: 'charging', charge: 0, cooldown: 0 }, false));
  assert.deepEqual(cool.map(e => e.detail), ['cooldown complete; available to charge']);
  const full = readinessChanges(own({ state: 'charging', charge: 20 }, false), own({ state: 'ready', charge: 40 }, false));
  assert.deepEqual(full.map(e => e.detail), ['fully charged and ready to fire']);
});

check('but a gun that fired last turn and is ready this turn is not', () => {
  // That happens to the whole battery every turn. Announcing it would bury the tape.
  assert.deepEqual(readinessChanges(own({ state: 'ready', charge: 40 }, true), own({ state: 'ready', charge: 40 }, false)), []);
});

check('a destroyed ship reports nothing coming back', () => {
  const after = own({ state: 'ready', charge: 40 }, false); after.own[0].destroyed = true;
  assert.deepEqual(readinessChanges(own({ state: 'charging', charge: 20 }, false), after), []);
});

console.log(`\nPlaytest console: ${passed} checks passed.`);
