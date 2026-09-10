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
  assert.equal(d.rule, 'may-refuse-to-close');
  assert.equal(d.certain, false, 'a judgement about the enemy is an appraisal, never a certainty');
  // The wording matters as much as the flag. Astra, 2026-09-09: "will not close ... ending (1,0)"
  // makes a commitment the implementation cannot keep, and certain:false does not qualify that
  // sentence for a player who never sees the flag.
  assert.match(d.reason, /Capt\. Renard may refuse to close inside 5 hexes at 40% hull/);
  assert.ok(!/will not close/.test(JSON.stringify(p)), 'the flat verdict must not reach the console');
  assert.ok(p.actions[0].notes.some(n => n.startsWith('Captain: ')), 'the player must see it on the action');
});

check('the declaration is what the engine then does', () => {
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } });
  const d = forecast(w).captain.declared[0];
  const log = execute(w);
  const said = log.find(l => / captain: /.test(l));
  assert.ok(said, 'the engine must report the same refusal');
  // The engine has truth and says so flatly; the console has a picture and says "may". They must
  // still agree on the substance, so compare everything after the verb.
  const grounds = /inside \d+ hexes at \d+% hull.*$/.exec(d.reason)[0];
  assert.ok(said.includes(grounds), `engine said "${said}", preview declared "${d.reason}"`);
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
  assert.ok(p.captain.declared.every(d => d.certain === false), 'both are estimates');
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
  a.hullLostThisTurn = a.hullLostLastTurn = Math.round(a.superstructureMax * damage);
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
  const d = r.p.captain.declared.find(x => x.rule === 'may-break-charge');
  assert.ok(d, 'the break-off must be declared');
  // It was declared certain until Astra showed the console reads a counter the engine replaces
  // before it decides, and that a missile arriving this turn lands before both.
  assert.equal(d.certain, false, 'the bank decision rests on an uncertain turn counter');
  assert.match(d.reason, /Capt\. Ibarra may break off the charge: 25% hull lost while planted/);
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

// ---------------------------------------------------------------- the admiral insists
// Clause 3 of the ruling: a direct order is obeyed regardless, with the objection logged. The
// player is never trapped by their own crew - and the crew are never silently overruled either.
const insisted = { ...close, insist: true };

check('a direct order is obeyed, and the objection is still declared first', () => {
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } });
  const p = previewContactOrders(captainObservation(w.battle, 'A'), 'A-own', insisted);
  assert.equal(p.captain.insisted, true);
  assert.equal(p.captain.declared.length, 1);
  const d = p.captain.declared[0];
  assert.equal(d.rule, 'closes-under-protest');
  assert.equal(d.insisted, true);
  assert.equal(d.hexes, 4, 'he goes the whole way');
  assert.match(d.reason, /Capt\. Renard closes under protest: would not close inside 5 hexes at 40% hull/);
  assert.deepEqual(d.holdAt, bare.actions[0].end, 'and ends where an unofficered ship would');
});

check('the engine obeys the direct order and logs the same protest', () => {
  const w = world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } });
  const d = previewContactOrders(captainObservation(w.battle, 'A'), 'A-own', insisted).captain.declared[0];
  const log = []; stepTurn(w.battle, { 'A-own': insisted, 'B-foe': hold }, { log: l => log.push(l) });
  const said = log.find(l => / captain: /.test(l));
  assert.ok(said?.includes(d.reason), `engine said "${said}"`);
  assert.equal(w.a.movedThisTurn, 4, 'the order stands');
  assert.deepEqual(w.a.pos, { q: 4, r: 0 });
});

check('the objection is reported once, not once per refused step', () => {
  const w = world({ captain: { id: 'c1', posture: 'cautious' } });
  const log = []; stepTurn(w.battle, { 'A-own': insisted, 'B-foe': hold }, { log: l => log.push(l) });
  assert.equal(log.filter(l => / captain: /.test(l)).length, 1);
});

check('a direct order keeps the charge, under protest, and the ship stays planted', () => {
  const t = structuredClone(tuning), rng = makePrng(712); t.explosion.enabled = false;
  const a = buildShip('A-gunstar', 'EAR', 'gunstar-battlecruiser', t, loadouts, rng);
  const b = buildShip('B-far', 'KRE', 'destroyer', t, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0; a.spinal.state = 'charging'; a.spinal.charge = 40;
  a.hullLostThisTurn = a.hullLostLastTurn = Math.round(a.superstructureMax * 0.25);
  a.captain = { id: 'c3', name: 'Capt. Ibarra', posture: 'cautious' };
  b.pos = { q: 30, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0;
  const battle = createBattleFromFleets([[a], [b]], t, rng, { terrain: [], maxTurns: 6 });
  enableContacts(battle, { profile: SENSING_PROFILE });
  const order = { plan: [{ turn: 0, forward: 2 }, idle(), idle()], target: 'auto', reserve: 0, insist: true };
  const p = previewContactOrders(captainObservation(battle, 'A'), 'A-gunstar', order);
  const d = p.captain.declared.find(x => x.rule === 'holds-charge-under-protest');
  assert.ok(d, 'the objection must be declared even though it is overruled');
  assert.match(d.reason, /Capt\. Ibarra holds the charge under protest: 25% hull lost while planted/);
  assert.equal(d.certain, false);
  assert.ok(p.actions[0].notes.some(n => /plants the ship/.test(n)), 'and the bank still plants the hull');
  const log = []; stepTurn(battle, { 'A-gunstar': order, 'B-far': hold }, { log: l => log.push(l) });
  assert.equal(a.spinal.state, 'charging', 'the charge is kept');
  assert.ok(a.spinal.charge > 0);
  assert.deepEqual(a.pos, { q: 0, r: 0 }, 'and the ship does not move');
  assert.ok(log.find(l => /captain: Capt\. Ibarra holds the charge under protest/.test(l)));
});

check('insist is strict: omit it rather than saying no, and never insist at nobody', () => {
  const w = world({ captain: { id: 'c1', posture: 'cautious' } });
  const view = captainObservation(w.battle, 'A');
  assert.equal(previewContactOrders(view, 'A-own', { ...close, insist: false }).valid, false);
  assert.equal(previewContactOrders(view, 'A-own', { ...close, insist: 1 }).valid, false);
  const unofficered = captainObservation(world().battle, 'A');
  const refused = previewContactOrders(unofficered, 'A-own', insisted);
  assert.equal(refused.valid, false, 'there is nobody to overrule');
  assert.match(refused.faults[0].detail, /officered ship/);
});

// ------------------------------------------------- what Astra found on 9 September 2026
// Three reproductions, kept as tests because each one broke a claim I had made in writing.

check('the bank is judged on the worse of the two turn counters, not on one of them', () => {
  // FINDING 1. The console reads a counter startTurn replaces before the resolver decides. Setting
  // both counters together - which every earlier fixture did - hid it. Set only the this-turn
  // counter, as a hull holed this turn actually has, and the forecast must still see it coming.
  const build = () => {
    const t = structuredClone(tuning), rng = makePrng(712); t.explosion.enabled = false;
    const a = buildShip('A-gunstar', 'EAR', 'gunstar-battlecruiser', t, loadouts, rng);
    const b = buildShip('B-far', 'KRE', 'destroyer', t, loadouts, rng);
    a.pos = { q: 0, r: 0 }; a.facing = 0; a.spinal.state = 'charging'; a.spinal.charge = 40;
    a.captain = { id: 'c3', name: 'Capt. Ibarra', posture: 'cautious' };
    b.pos = { q: 30, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0;
    const battle = createBattleFromFleets([[a], [b]], t, rng, { terrain: [], maxTurns: 6 });
    enableContacts(battle, { profile: SENSING_PROFILE });
    return { a, battle };
  };
  const order = { plan: [{ turn: 0, forward: 2 }, idle(), idle()], target: 'auto', reserve: 0 };
  for (const [name, apply] of [
    ['this turn only', a => { a.hullLostThisTurn = Math.round(a.superstructureMax * 0.25); a.hullLostLastTurn = 0; }],
    ['last turn only', a => { a.hullLostThisTurn = 0; a.hullLostLastTurn = Math.round(a.superstructureMax * 0.25); }]
  ]) {
    const w = build(); apply(w.a);
    const p = previewContactOrders(captainObservation(w.battle, 'A'), 'A-gunstar', order);
    assert.ok(p.captain.declared.some(d => d.rule === 'may-break-charge'), `${name}: no declaration`);
    assert.deepEqual(p.actions[0].end, { q: 2, r: 0, facing: 0 },
      `${name}: the ceiling must assume the bank is vented, or it is short by two hexes`);
  }
});

check('a captain-free route that dies cannot bound one that has a captain', () => {
  // FINDING 2. The forecast killed the hull on burst stress and called the later actions
  // unavailable. At execution the captain refuses the burst, pays no stress, lives, and travels
  // further than the forecast ever showed. Unresolved is the only honest answer.
  const t = structuredClone(tuning), rng = makePrng(5); t.explosion.enabled = false; t.toHit.target = -100;
  const a = buildShip('A-own', 'ZAN', 'light-cruiser', t, loadouts, rng);
  const b = buildShip('B-foe', 'KRE', 'heavy-cruiser', t, loadouts, rng);
  a.pos = { q: 0, r: 0 }; a.facing = 0; a.superstructure = 1;
  a.captain = { id: 'c1', name: 'Capt. Renard', posture: 'cautious' };
  b.pos = { q: 5, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0;
  const battle = createBattleFromFleets([[a], [b]], t, rng, { terrain: [], maxTurns: 6 });
  enableContacts(battle, { profile: SENSING_PROFILE });
  const view = captainObservation(battle, 'A');
  if (!view.own[0].specials?.burst) return;                 // hull cannot burst; nothing to prove
  const order = { plan: [{ turn: 0, forward: 0, burst: 2 }, { turn: 2, forward: 1 }, { turn: 1, forward: 2 }], target: 'auto', reserve: 0 };
  const p = previewContactOrders(view, 'A-own', order);
  if (!p.valid) return;
  const later = p.actions.slice(1).flatMap(x => x.notes).join(' ');
  assert.ok(!/later actions unavailable/.test(later),
    'a forecast that killed the hull must not claim the rest of the plan is settled');
  assert.ok(/Course unresolved/.test(later), 'it must say the course is unresolved instead');
});

check('a live range rule says so, because silence from it is not consent', () => {
  // FINDING 3. The appraisal reads nominal class points and only the contacts in hand, so an enemy
  // the sensors have not found, or a refit priced far above its class, stops the ship at execution
  // with nothing declared. The forecast cannot see either; it can at least say what it judged on.
  const hurt = forecast(world({ captain: { id: 'c1', name: 'Capt. Renard', posture: 'cautious' } }));
  assert.equal(hurt.captain.armed, true);
  assert.ok(hurt.actions[0].notes.some(n => /line is live at 40% hull, judged from current contacts only/.test(n)));
  const whole = forecast(world({ captain: { id: 'c1', posture: 'cautious' }, hull: 1 }));
  assert.equal(whole.captain.armed, false, 'a healthy hull is not under the rule');
  assert.ok(!whole.actions.flatMap(a => a.notes).some(n => /line is live/.test(n)));
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
