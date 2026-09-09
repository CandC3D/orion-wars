// The declaration: a captain must say what he will do BEFORE the player commits, and what he says
// must be what he then does. That is the hard constraint from the ruling
// (docs/consultations/fable-ship-captains-2026-09-07/recommendation.md, section 4) and it is the
// reason the feature is allowed to exist at all - a ship that silently does something else would
// make every genuine engine bug look like captain initiative.
//
// Two properties are checked over and over here, because between them they are the whole contract:
//   AGREEMENT   what the preview declares is what the engine logs and does.
//   THE CEILING the forecast route stays an UPPER bound on where the hull can be. A declaration may
//               never quietly shorten it, because the player reads it as "at most this far".
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { createBattleFromFleets, stepTurn } = await mod('src/tactical/resolver.js');
const { buildShip } = await mod('src/tactical/ship.js');
const { enableContacts } = await mod('src/tactical/contacts.js');
const { SENSING_PROFILE } = await mod('src/tactical/sensing.js');
const { captainObservation } = await mod('src/captains/observation.js');
const { previewContactOrders } = await mod('src/captains/preview.js');
const { appraiseContact } = await mod('src/tactical/ship-command.js');
const { makePrng } = await mod('src/prng.js');
const tuning = JSON.parse(fs.readFileSync(path.join(root, 'data/tactical-tuning.json')));
const loadouts = JSON.parse(fs.readFileSync(path.join(root, 'data/loadouts.json')));

const idle = () => ({ turn: 0, forward: 0 });
const hold = { plan: [idle(), idle(), idle()], target: 'auto', reserve: 1 };
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };

// A hurt light cruiser (10 pts) six hexes from a fresh heavy cruiser (16 pts): heavier, intact, and
// inside the cautious profile's five-hex line the moment the ship takes a second step.
function world({ captain = null, hull = 0.4, enemyHull = 1, rating = 2, gap = 6, seed = 21 } = {}) {
  const t = structuredClone(tuning), rng = makePrng(seed);
  t.toHit.target = -100; t.explosion.enabled = false;          // nobody hits anybody; this is about the helm
  const a = buildShip('A-own', 'EAR', 'light-cruiser', t, loadouts, rng);
  const b = buildShip('B-foe', 'KRE', 'heavy-cruiser', t, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0; a.hull.sensorRating = rating;
  a.superstructure = Math.round(a.superstructureMax * hull);
  if (captain) a.captain = captain;
  b.pos = { q: gap, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0; b.hull.sensorRating = 0;
  b.superstructure = Math.round(b.superstructureMax * enemyHull);
  const battle = createBattleFromFleets([[a], [b]], t, rng, { terrain: [], maxTurns: 6 });
  enableContacts(battle, { profile: SENSING_PROFILE });
  return { battle, a, b };
}
const close = { plan: [{ turn: 0, forward: 4 }, idle(), idle()], target: 'auto', reserve: 0 };
const forecast = w => previewContactOrders(captainObservation(w.battle, 'A'), 'A-own', close);
const execute = w => { const log = []; stepTurn(w.battle, { 'A-own': close, 'B-foe': hold }, { log: l => log.push(l) }); return log; };

const bare = forecast(world());

check('an unofficered ship declares nothing, and the forecast is untouched', () => {
  assert.equal(bare.captain, null);
  assert.equal(bare.actions.flatMap(a => a.notes).filter(n => /Captain:/.test(n)).length, 0);
});

check('a captain who has nothing to say leaves the forecast byte-identical', () => {
  // Healthy hull: the range rule is dormant, so the presence of an officer must change nothing.
  const p = forecast(world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' }, hull: 1 }));
  const plain = forecast(world({ hull: 1 }));
  assert.deepEqual(p.captain.declared, []);
  assert.deepEqual(p.route, plain.route);
  assert.deepEqual(p.actions, plain.actions);
});

check('a refusal is declared before Execute, naming the officer and the reason', () => {
  const p = forecast(world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } }));
  assert.equal(p.captain.name, 'Capt. Renard');
  assert.equal(p.captain.posture, 'cautious');
  assert.equal(p.captain.declared.length, 1);
  const d = p.captain.declared[0];
  assert.equal(d.rule, 'will-not-close');
  assert.equal(d.certain, false, 'a judgement about the enemy is an appraisal, never a certainty');
  assert.match(d.reason, /Capt\. Renard will not close inside 5 hexes at 40% hull/);
  assert.ok(p.actions[0].notes.some(n => n.startsWith('Captain: ')), 'the player must see it on the action');
});

check('the declaration is what the engine then does', () => {
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } });
  const d = forecast(w).captain.declared[0];
  const log = execute(w);
  const said = log.find(l => / captain: /.test(l));
  assert.ok(said, 'the engine must report the same refusal');
  assert.ok(said.includes(d.reason), `engine said "${said}", preview declared "${d.reason}"`);
  assert.deepEqual(w.a.pos, { q: d.holdAt.q, r: d.holdAt.r }, 'the ship must stop where the declaration said');
  assert.equal(w.a.movedThisTurn, d.hexes);
});

check('the forecast route stays an upper bound, not the shortened one', () => {
  // The route is read as "at most this far". A declaration that is only an appraisal must never
  // shorten it, or a captain who turns out not to object would carry the ship past its own ceiling.
  const p = forecast(world({ captain: { id: 'c1', posture: 'cautious' } }));
  assert.deepEqual(p.route, bare.route);
  assert.deepEqual(p.actions[0].end, bare.actions[0].end);
  assert.ok(p.captain.declared[0].hexes < 4, 'and the intended hold is still reported separately');
});

check('after holding short, later actions are judged from where he will be', () => {
  // The ceiling reaches (4,0) in action 1; the captain stops at (1,0). Action 2 must be judged from
  // HIS hex, not the ceiling's, or the declaration describes a ship at a position it never reaches.
  const plan = { plan: [{ turn: 0, forward: 4 }, { turn: 0, forward: 1 }, idle()], target: 'auto', reserve: 0 };
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } });
  const p = previewContactOrders(captainObservation(w.battle, 'A'), 'A-own', plan);
  assert.equal(p.captain.declared.length, 2, 'both actions are refused');
  assert.deepEqual(p.captain.declared[0].holdAt, { q: 1, r: 0, facing: 0 });
  assert.deepEqual(p.captain.declared[1].holdAt, { q: 1, r: 0, facing: 0 }, 'action 2 starts from his hex');
  assert.equal(p.captain.declared[1].hexes, 0);
  assert.deepEqual(p.actions[1].end, { q: 5, r: 0, facing: 0 }, 'while the ceiling runs on ahead');
  const log = []; stepTurn(w.battle, { 'A-own': plan, 'B-foe': hold }, { log: l => log.push(l) });
  assert.deepEqual(w.a.pos, { q: 1, r: 0 }, 'and the engine ends where the declaration said');
  assert.equal(log.filter(l => / captain: /.test(l)).length, 2);
});

check('a contact the sensors report as wrecked is not something to break off from', () => {
  const w = world({ captain: { id: 'c1', posture: 'cautious' }, enemyHull: 0.2 });
  assert.deepEqual(forecast(w).captain.declared, []);
  assert.equal(execute(w).filter(l => / captain: /.test(l)).length, 0, 'and the engine agrees');
  assert.equal(w.a.movedThisTurn, 4);
});

check('a coarse report is read generously, so the objection is raised rather than sprung', () => {
  // Rating 1 sees only intact/damaged. A ship at 70% reads "damaged" and nothing rules out a whole
  // hull, so the captain speaks - and the engine, which can see 70%, refuses too.
  const w = world({ captain: { id: 'c1', posture: 'cautious' }, enemyHull: 0.7, rating: 1 });
  const view = captainObservation(w.battle, 'A');
  assert.equal(view.contacts[0].observedDamage.detail, 'condition');
  assert.equal(view.contacts[0].observedDamage.condition, 'damaged');
  assert.equal(forecast(w).captain.declared.length, 1);
  assert.equal(execute(w).filter(l => / captain: /.test(l)).length, 1);
});

check('the appraisal reads the top of the interval and the class ladder', () => {
  const points = { 'heavy-cruiser': 16 };
  const at = c => appraiseContact({ id: 'x', className: 'heavy-cruiser', pos: { q: 1, r: 1 }, facing: 0, observedDamage: c }, points);
  assert.equal(at({ detail: 'condition', condition: 'intact' }).superstructure, 1000);
  assert.equal(at({ detail: 'condition', condition: 'damaged' }).superstructure, 1000);
  assert.equal(at({ detail: 'bracket', condition: 'heavily-damaged' }).superstructure, 500);
  assert.equal(at({ detail: 'bracket', condition: 'critical' }).superstructure, 250);
  assert.equal(at({ detail: 'interval', remainingFraction: { min: 0.3, max: 0.4 } }).superstructure, 400);
  assert.equal(at({ detail: 'condition', condition: 'intact' }).points, 16);
  assert.equal(at(null).points, 16, 'an unreadable condition is not a reason to assume a wreck');
  assert.equal(appraiseContact({ id: 'x', className: 'unknown-hull', pos: { q: 0, r: 0 }, facing: 0 }, points).points, 0);
});

// ---------------------------------------------------------------- the bank, which is certain
// Breaking off a charge is read from own state alone, so the console knows it exactly. It is
// therefore folded into the forecast: a planted ship the engine is about to set free must not be
// shown as planted, or the ceiling is wrong in the one direction that matters.
function charging({ captain = null, damage = 0 } = {}) {
  const t = structuredClone(tuning), rng = makePrng(712); t.explosion.enabled = false;
  const a = buildShip('A-gunstar', 'EAR', 'gunstar-battlecruiser', t, loadouts, rng);
  const b = buildShip('B-far', 'KRE', 'destroyer', t, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0;
  a.spinal.state = 'charging'; a.spinal.charge = 40;
  a.damageThisTurn = a.damageLastTurn = Math.round(a.superstructureMax * damage);
  if (captain) a.captain = captain;
  b.pos = { q: 30, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0;
  const battle = createBattleFromFleets([[a], [b]], t, rng, { terrain: [], maxTurns: 6 });
  enableContacts(battle, { profile: SENSING_PROFILE });
  const order = { plan: [{ turn: 0, forward: 2 }, idle(), idle()], target: 'auto', reserve: 0 };
  const p = previewContactOrders(captainObservation(battle, 'A'), 'A-gunstar', order);
  const log = []; stepTurn(battle, { 'A-gunstar': order, 'B-far': hold }, { log: l => log.push(l) });
  return { p, log, a };
}

check('a planted bank without a captain stays planted, and the forecast says so', () => {
  const r = charging({ damage: 0.25 });
  assert.equal(r.p.captain, null);
  assert.ok(r.p.actions[0].notes.some(n => /plants the ship/.test(n)));
  assert.deepEqual(r.a.pos, { q: 0, r: 0 });
});

check('a captain who will vent frees the ship, and the forecast is corrected before Execute', () => {
  const r = charging({ captain: { id: 'c3', name: 'Capt. Ibarra', posture: 'cautious' }, damage: 0.25 });
  const d = r.p.captain.declared.find(x => x.rule === 'breaks-charge');
  assert.ok(d, 'the break-off must be declared');
  assert.equal(d.certain, true, 'own state is known exactly, so this one is not an appraisal');
  assert.match(d.reason, /Capt\. Ibarra breaks off the charge: 25% hull lost while planted/);
  assert.ok(r.p.actions[0].notes.some(n => n.startsWith('Captain: ')));
  assert.ok(!r.p.actions[0].notes.some(n => /plants the ship/.test(n)), 'the ship is no longer planted');
  assert.deepEqual(r.p.actions[0].end, { q: 2, r: 0, facing: 0 }, 'the forecast must show the freed move');
  assert.deepEqual(r.a.pos, { q: 2, r: 0 }, 'and the engine must make it');
  assert.equal(r.a.spinal.state, 'cooldown');
});

check('a scratch is not a reason to throw the charge away, in the forecast or the engine', () => {
  const r = charging({ captain: { id: 'c3', posture: 'cautious' }, damage: 0.02 });
  assert.deepEqual(r.p.captain.declared, []);
  assert.deepEqual(r.a.pos, { q: 0, r: 0 });
  assert.notEqual(r.a.spinal.state, 'cooldown');
});

// ---------------------------------------------------------------- the boundary
check('the declaration leaks nothing the plot does not already carry', () => {
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' }, enemyHull: 0.63 });
  const text = JSON.stringify(forecast(w));
  // The true hull fraction is 0.63 and the true hull points are known only to the engine.
  assert.ok(!/0\.63|63%/.test(text), 'the enemy true condition must not appear in the forecast');
  assert.ok(!text.includes(String(w.b.superstructure)), 'nor its true superstructure');
});

check('the forecast is frozen and repeatable', () => {
  const w = world({ captain: { id: 'c1', posture: 'cautious' } });
  const view = captainObservation(w.battle, 'A');
  const a = previewContactOrders(view, 'A-own', close), b = previewContactOrders(view, 'A-own', close);
  assert.deepEqual(a, b);
  assert.ok(Object.isFrozen(a.captain));
  assert.ok(Object.isFrozen(a.captain.declared));
});

console.log(`\nCaptain declarations: ${passed} checks passed.`);
