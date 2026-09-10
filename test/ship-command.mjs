// Ship captain decision layer: the declared rules, and the boundaries they must not cross.
import assert from 'node:assert/strict';
import { DEFAULT_PROFILES, DEFAULT_POSTURE, profilesFrom, captainOf, refusesStep, ventsUnderFire, captainReview } from '../src/tactical/ship-command.js';

let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('ok:', name); };

const hex = (q, r) => ({ q, r });
const ship = (over = {}) => ({
  id: 'own-1', points: 8, pos: hex(0, 0), superstructure: 20, superstructureMax: 50,
  mounts: [{ kind: 'beam' }], damageLastTurn: 0, hullLostLastTurn: 0, ...over
});
const foe = (over = {}) => ({ id: 'foe-1', points: 12, pos: hex(6, 0), superstructure: 50, superstructureMax: 50, ...over });

check('an absent captain record is a standard posture, not an error', () => {
  const c = captainOf(ship(), null);
  assert.equal(c.posture, DEFAULT_POSTURE);
  assert.equal(c.profile.minRangeHexes, DEFAULT_PROFILES.standard.minRangeHexes);
  assert.equal(c.id, null);
  assert.equal(c.name, null);
});

check('an unknown posture falls back to standard rather than throwing', () => {
  assert.equal(captainOf(ship({ captain: { posture: 'reckless' } }), null).posture, DEFAULT_POSTURE);
});

check('tuning overrides a profile field without replacing the profile', () => {
  const p = profilesFrom({ captainProfiles: { cautious: { minRangeHexes: 9 } } });
  assert.equal(p.cautious.minRangeHexes, 9);
  assert.equal(p.cautious.holdBelowHull, DEFAULT_PROFILES.cautious.holdBelowHull);
  assert.equal(p.standard.minRangeHexes, DEFAULT_PROFILES.standard.minRangeHexes);
});

// ---------------------------------------------------------------- will not close
check('a hurt ship refuses to close inside the line on a heavier intact enemy', () => {
  const s = ship({ captain: { posture: 'cautious', name: 'Capt. Renard' } });   // 40% hull
  const r = refusesStep(s, hex(0, 0), hex(3, 0), [foe()], null);
  assert.ok(r, 'expected a refusal');
  assert.equal(r.rule, 'will-not-close');
  assert.equal(r.enemyId, 'foe-1');
  assert.match(r.reason, /Capt\. Renard will not close inside 5 hexes at 40% hull/);
});

check('a healthy ship closes without comment', () => {
  const s = ship({ superstructure: 50, captain: { posture: 'cautious' } });
  assert.equal(refusesStep(s, hex(0, 0), hex(3, 0), [foe()], null), null);
});

check('a bold captain never refuses', () => {
  const s = ship({ superstructure: 1, captain: { posture: 'bold' } });
  assert.equal(refusesStep(s, hex(0, 0), hex(5, 0), [foe()], null), null);
});

check('a lighter enemy is not a reason to break off', () => {
  const s = ship({ captain: { posture: 'cautious' } });
  assert.equal(refusesStep(s, hex(0, 0), hex(3, 0), [foe({ points: 4 })], null), null);
});

check('an already-mauled enemy is not a reason to break off', () => {
  const s = ship({ captain: { posture: 'cautious' } });
  assert.equal(refusesStep(s, hex(0, 0), hex(3, 0), [foe({ superstructure: 10 })], null), null);
});

check('opening the range is always allowed, even inside the line', () => {
  const s = ship({ pos: hex(4, 0), captain: { posture: 'cautious' } });
  assert.equal(refusesStep(s, hex(4, 0), hex(3, 0), [foe()], null), null, 'moving away from a foe at (6,0)');
});

check('manoeuvring at constant range inside the line is allowed', () => {
  const s = ship({ pos: hex(4, 0), captain: { posture: 'cautious' } });
  // (4,0) and (5,-1) are both two hexes from (6,0): the range does not shorten.
  assert.equal(refusesStep(s, hex(4, 0), hex(5, -1), [foe()], null), null);
});

check('a destroyed enemy is ignored', () => {
  const s = ship({ captain: { posture: 'cautious' } });
  assert.equal(refusesStep(s, hex(0, 0), hex(3, 0), [foe({ destroyed: true })], null), null);
});

// ---------------------------------------------------------------- breaks off a charge
const planted = (over = {}) => ship({
  spinal: { state: 'charging', charge: 40 },
  mounts: [{ kind: 'spinal' }],
  hullLostLastTurn: 10,        // 20% of 50, ACTUALLY LOST - absorbed fire does not count
  ...over
});

check('a planted ship under fire breaks off the charge', () => {
  const v = ventsUnderFire(planted({ captain: { posture: 'standard', name: 'Capt. Ibarra' } }), null);
  assert.ok(v);
  assert.equal(v.rule, 'breaks-charge');
  assert.match(v.reason, /Capt\. Ibarra breaks off the charge: 20% hull lost while planted/);
});

check('a cold bank is not planted, so there is nothing to break off', () => {
  assert.equal(ventsUnderFire(planted({ spinal: { state: 'charging', charge: 0 } }), null), null);
});

check('a ship taking light fire holds its charge', () => {
  assert.equal(ventsUnderFire(planted({ hullLostLastTurn: 2 }), null), null);
});

check('fire the shields absorbed is not a reason to throw the charge away', () => {
  // Astra, 2026-09-09: reading the incoming-damage counter made a hull at 53 of 53 vent a
  // 40-point charge because one hit was fully absorbed, and then report "9% hull lost".
  // The rule is about being killed sitting still; a shield that held means nobody is dying.
  assert.equal(ventsUnderFire(planted({ damageLastTurn: 40, hullLostLastTurn: 0 }), null), null);
});

check('a bold captain rides it out', () => {
  assert.equal(ventsUnderFire(planted({ captain: { posture: 'bold' } }), null), null);
});

check('a held ready bank counts as planted', () => {
  assert.ok(ventsUnderFire(planted({ spinal: { state: 'ready', charge: 72 } }), null));
});

check('a wrecked spinal mount is not a charge to break', () => {
  assert.equal(ventsUnderFire(planted({ mounts: [{ kind: 'spinal', inop: true }] }), null), null);
});

check('a ship with no spinal is unaffected', () => {
  assert.equal(ventsUnderFire(ship({ hullLostLastTurn: 30 }), null), null);
});

// ---------------------------------------------------------------- the declaration
check('the review declares the first refusal along the plan and stops there', () => {
  const s = ship({ captain: { posture: 'cautious' } });
  const notes = captainReview(s, [hex(2, 0), hex(3, 0), hex(4, 0)], [foe()], null);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].rule, 'will-not-close');
});

check('a compliant plan declares nothing at all', () => {
  const s = ship({ superstructure: 50, captain: { posture: 'cautious' } });
  assert.deepEqual(captainReview(s, [hex(1, 0), hex(2, 0)], [foe()], null), []);
});

check('both rules can fire on the same ship', () => {
  const s = planted({ captain: { posture: 'cautious' }, pos: hex(0, 0) });
  const notes = captainReview(s, [hex(3, 0)], [foe()], null);
  assert.deepEqual(notes.map(n => n.rule), ['will-not-close', 'breaks-charge']);
});

// ---------------------------------------------------------------- determinism and purity
check('identical inputs give byte-identical output', () => {
  const s = ship({ captain: { posture: 'cautious' } });
  const a = JSON.stringify(captainReview(s, [hex(3, 0)], [foe()], null));
  const b = JSON.stringify(captainReview(s, [hex(3, 0)], [foe()], null));
  assert.equal(a, b);
});

check('a review does not mutate the ship or the enemies it is given', () => {
  const s = planted({ captain: { posture: 'cautious' } });
  const f = foe();
  const before = JSON.stringify({ s, f });
  captainReview(s, [hex(3, 0)], [f], null);
  assert.equal(JSON.stringify({ s, f }), before);
});

console.log(`\nShip captains: ${checks} checks passed.`);
