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
const { torpedoMarkup, torpedoSummary } = await mod('arena/contact-torpedoes.js');
const { mountAssignment, setMountAssignment, pruneMountOrders, mountSolutions } = await mod('arena/mount-orders-ui.js');
const { announcement } = await mod('arena/contact-effects.js');
const { sequenceKeysMarkup } = await mod('arena/console-sequence.js');

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

// ---------------------------------------------------------------- "torpedoes remain on the map"
const tView = torpedoes => ({ own: [{ id: 'A-1', pos: { q: 0, r: 0 }, facing: 0, destroyed: false }],
  contacts: [{ id: 'B-1', pos: { q: 6, r: 0 }, facing: 3, vesselName: { full: 'IKS Honor' } },
    { id: 'B-2', pos: { q: 9, r: 2 }, facing: 3, destroyed: true, wreckedTurn: 2 }], torpedoes, incoming: torpedoes.filter(t => t.direction === 'incoming') });

check('a torpedo in flight stands where the engine says it is, aimed at its target', () => {
  const svg = torpedoMarkup(tView([{ id: 'm1', targetId: 'B-1', direction: 'outgoing', arrival: 'before-next-refill', launchPos: { q: 0, r: 0 }, pos: { q: 3, r: 0 } }]), { project, scale: PITCH, icon: 30 });
  assert.equal((svg.match(/class="torpedo"/g) || []).length, 1);
  assert.match(svg, /translate\(300\.0 0\.0\) rotate\(0\.0\)/, 'at its fractional hex, pointing along +q at the target');
  assert.match(svg, /IKS Honor/);
  assert.ok(!/NaN/.test(svg));
});

check('an incoming torpedo whose launcher is unseen gets a warning on its target, never a track', () => {
  const svg = torpedoMarkup(tView([{ id: 'm2', targetId: 'A-1', direction: 'incoming', arrival: 'before-next-refill' },
    { id: 'm3', targetId: 'A-1', direction: 'incoming', arrival: 'before-next-refill' }]), { project, scale: PITCH, icon: 30 });
  assert.equal((svg.match(/class="torpedo"/g) || []).length, 0, 'no invented position');
  assert.equal((svg.match(/class="torpedo-warning"/g) || []).length, 1, 'one warning per threatened hull');
  assert.match(svg, /2 incoming torpedoes/);
  assert.match(torpedoSummary(tView([{ id: 'm2', targetId: 'A-1', direction: 'incoming' }])), /1 incoming/);
});

check('a salvo on one course is drawn once, with its count', () => {
  const salvo = ['a', 'b', 'c'].map(id => ({ id, targetId: 'B-1', direction: 'outgoing', launchPos: { q: 0, r: 0 }, pos: { q: 2.5, r: 0 } }));
  const svg = torpedoMarkup(tView(salvo), { project, scale: PITCH, icon: 30 });
  assert.equal((svg.match(/class="torpedo"/g) || []).length, 1);
  assert.match(svg, /data-count="3"/); assert.match(svg, /×3/);
});

// ---------------------------------------------------------------- "per weapon target / hold fire"
const gun = { id: 'A-1', pos: { q: 0, r: 0 }, facing: 0, destroyed: false, power: 20, reserve: 0,
  mounts: [{ id: 1, kind: 'beam', type: 'laser', arc: [1, 2, 6], maxRange: 8, bands: [{ to: 8 }], weapon: { maxPower: 5 } },
    { id: 2, kind: 'beam', type: 'laser', arc: [1, 2, 6], maxRange: 8, bands: [{ to: 8 }], weapon: { maxPower: 5 } }] };
const fireView = { ...tView([]), terrain: [], map: { widthHexes: 40, heightHexes: 30 }, rules: { terrain: {}, movement: { sameHexNoFire: true } } };

check('an assignment is stored under the mount id, and clearing the last one removes the field', () => {
  const order = { plan: [], target: 'auto', reserve: .3 };
  setMountAssignment(order, 1, 'hold'); setMountAssignment(order, 2, 'B-1');
  assert.deepEqual(order.mountOrders, { 1: 'hold', 2: 'B-1' });
  assert.equal(mountAssignment(order, 2), 'B-1');
  setMountAssignment(order, 1, 'auto'); setMountAssignment(order, 2, null);
  assert.ok(!('mountOrders' in order), 'an empty object would still be sent');
});

check('an assignment the engine would refuse is pruned before it is sent', () => {
  const order = { mountOrders: { 1: 'B-2', 2: 'B-gone', 9: 'hold' } };
  pruneMountOrders(order, gun, fireView);
  assert.ok(!('mountOrders' in order), 'a wreck, a lost track and an unknown mount are all dropped');
  const kept = { mountOrders: { 1: 'hold', 2: 'B-1' } };
  assert.deepEqual(pruneMountOrders(kept, gun, fireView).mountOrders, { 1: 'hold', 2: 'B-1' });
});

check('each mount reports against ITS target: held, locked on its own, or following the ship', () => {
  const sol = mountSolutions(gun, { target: 'auto', mountOrders: { 1: 'hold', 2: 'B-1' } }, fireView, 20);
  assert.equal(sol.get(1).short, 'HOLD FIRE');
  assert.equal(sol.get(2).short, 'TARGET LOCKED'); assert.equal(sol.get(2).targetName, 'IKS Honor'); assert.equal(sol.get(2).assigned, true);
  const follow = mountSolutions(gun, { target: 'auto' }, fireView, 20);
  assert.equal(follow.get(1).state, 'none', 'no priority and no assignment: nothing claimed');
});

// ---------------------------------------------------------------- the tape
check('a kill is news on the tape, and so is a loss', () => {
  const a = announcement({ kind: 'destruction', shipId: 'B-1', name: 'IKS Honor', own: false, turn: 3 }, {});
  assert.equal(a.title, 'Enemy vessel destroyed'); assert.match(a.detail, /IKS Honor/); assert.equal(a.weight, 'major');
  assert.equal(announcement({ kind: 'destruction', shipId: 'A-1', name: 'ISS Guardian', own: true }, {}).title, 'Own vessel lost');
});

check('point defence names the hulls that stopped the torpedo', () => {
  const a = announcement({ kind: 'missile', outcome: 'intercepted', direction: 'incoming', shooterId: 'B-1', targetId: 'A-1',
    defenders: [{ shipId: 'A-2', name: 'ISS Guardian' }] }, { label: id => id });
  assert.match(a.detail, /stopped by ISS Guardian point defence/);
});

check("a captain's objection reads as his, not as a beam shot from nowhere", () => {
  const a = announcement({ kind: 'captain', shipId: 'A-1', rule: 'will-not-close', reason: 'Capt. Ridley will not close with a heavier ship', held: 1, of: 3 }, { label: () => 'ISS Resolute' });
  assert.match(a.title, /held short \(1 of 3 hex\)/); assert.match(a.detail, /Capt\. Ridley/); assert.ok(!/Unknown source/.test(a.detail));
});

// ---------------------------------------------------------------- "not a bloody checkbox"
check('the sequence keys light the order the ship will fly, and go dark when there is nothing to sequence', () => {
  const on = sequenceKeysMarkup({ turn: 1, forward: 2 }, 'move', true);
  assert.match(on, /data-sequence="turn-first" aria-pressed="true"/); assert.ok(!/disabled/.test(on));
  assert.match(sequenceKeysMarkup({ turn: 1, forward: 2, turnAfter: true }, 'move', true), /data-sequence="run-first" aria-pressed="true"/);
  for (const [a, k] of [[{ turn: 0, forward: 3 }, 'move'], [{ turn: 2, forward: 0 }, 'move'], [{ turn: 0, forward: 0 }, 'hold']])
    assert.equal((sequenceKeysMarkup(a, k, true).match(/disabled/g) || []).length, 2, JSON.stringify(a));
  assert.equal((sequenceKeysMarkup({ turn: 1, forward: 2 }, 'move', false).match(/disabled/g) || []).length, 2, 'a recorded picture is read-only');
  assert.ok(!/<input|checkbox/.test(on), 'keys with pictograms, not a form control');
});

console.log(`\nPlaytest console: ${passed} checks passed.`);
