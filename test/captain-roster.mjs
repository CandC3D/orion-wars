// Dealing out the officers. Two properties carry the whole file:
//
//   THE BATTLE PRNG IS UNTOUCHED. If a draw advanced it, every roll after it would move and every
//   recorded battle and the whole balance corpus would become unreproducible.
//   A NAME CHANGES NOTHING. Commissioning a fleet assigns identity only; the drawn posture is the
//   one an unofficered ship already behaves as, so naming is safe to look at before it is safe to
//   act on.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { drawCaptain, drawCaptains, commissionCaptains } = await mod('src/tactical/captain-roster.js');
const { captainOf, DEFAULT_POSTURE } = await mod('src/tactical/ship-command.js');
const { makePrng } = await mod('src/prng.js');
const registers = JSON.parse(fs.readFileSync(path.join(root, 'data/captain-names.json'), 'utf8')).registers;

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };
const fleet = (faction, n, prefix = 'S') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, faction }));

check('every power in the register deals a titled officer', () => {
  for (const faction of ['EAR', 'KRE', 'VRA', 'ZAN']) {
    const c = drawCaptain('A-1', 7, faction, registers);
    assert.ok(c, `${faction} drew nothing`);
    assert.equal(c.faction, faction);
    assert.equal(c.name, `${c.title} ${c.personalName}`);
    assert.ok(registers[faction].names.includes(c.personalName), `${c.personalName} is not in the ${faction} register`);
  }
});

check('an unknown power draws nobody rather than inventing one', () => {
  assert.equal(drawCaptain('A-1', 7, 'SETHYR', registers), null);
  assert.equal(drawCaptain('A-1', 7, 'EAR', {}), null);
});

check('the same ship and seed always produce the same officer', () => {
  const a = drawCaptain('A-light-cruiser-3', 40213, 'EAR', registers);
  const b = drawCaptain('A-light-cruiser-3', 40213, 'EAR', registers);
  assert.deepEqual(a, b);
});

check('a different seed produces a different wardroom', () => {
  const ships = fleet('EAR', 12);
  const one = Object.values(drawCaptains(ships, 1, registers)).map(c => c.name);
  const two = Object.values(drawCaptains(ships, 2, registers)).map(c => c.name);
  assert.notDeepEqual(one, two, 'the seed must actually reach the draw');
});

check('the draw never advances the battle generator', () => {
  // The whole determinism guarantee rests on this. A draw that consumed the shared stream would
  // move every roll after it in every battle that ever named a captain.
  const rng = makePrng(12345);
  rng.next(); rng.next();
  const state = rng.state;
  drawCaptains(fleet('ZAN', 20), 99, registers);
  assert.equal(rng.state, state, 'the shared generator moved');
  assert.equal(rng.next(), makePrng(state).next(), 'and its next value must be unchanged');
});

check('a fleet gets no two officers of the same name', () => {
  const drawn = drawCaptains(fleet('KRE', 25), 5, registers);
  const names = Object.values(drawn).map(c => c.name);
  assert.equal(new Set(names).size, names.length, `duplicate in ${names.join(', ')}`);
});

check('a register that runs out keeps going with ordinals rather than repeating', () => {
  const size = registers.ZAN.names.length;
  const drawn = drawCaptains(fleet('ZAN', size + 6), 3, registers);
  const names = Object.values(drawn).map(c => c.name);
  assert.equal(names.length, size + 6);
  assert.equal(new Set(names).size, names.length, 'still no duplicates past the end of the register');
  assert.ok(names.some(n => / II$/.test(n)), 'the overflow must be visibly a second of that name');
});

check('the wardroom does not depend on the order the fleet is listed in', () => {
  const ships = fleet('VRA', 15);
  const forward = drawCaptains(ships, 8, registers);
  const backward = drawCaptains([...ships].reverse(), 8, registers);
  assert.deepEqual(forward, backward);
});

check('two powers in one battle draw from their own registers and do not collide', () => {
  const drawn = drawCaptains([...fleet('EAR', 6, 'A'), ...fleet('KRE', 6, 'B')], 11, registers);
  for (const [id, c] of Object.entries(drawn)) {
    const expected = id.startsWith('A-') ? 'EAR' : 'KRE';
    assert.equal(c.faction, expected);
    assert.ok(registers[expected].names.includes(c.personalName));
  }
});

check('a drawn officer changes no behaviour, because posture is the standing default', () => {
  const c = drawCaptain('A-1', 7, 'EAR', registers);
  assert.equal(c.posture, DEFAULT_POSTURE);
  const withRecord = captainOf({ captain: c }, null), without = captainOf({}, null);
  assert.deepEqual(withRecord.profile, without.profile, 'a name must not move a threshold');
});

check('a posture can be asked for, per fleet or per ship', () => {
  assert.equal(drawCaptain('A-1', 7, 'EAR', registers, { posture: 'bold' }).posture, 'bold');
  const drawn = drawCaptains(fleet('EAR', 4), 7, registers, { postureFor: s => s.id === 'S-2' ? 'cautious' : 'bold' });
  assert.equal(drawn['S-2'].posture, 'cautious');
  assert.equal(drawn['S-0'].posture, 'bold');
});

check('drawing is pure; commissioning is the one line that attaches', () => {
  const ships = fleet('EAR', 3);
  drawCaptains(ships, 7, registers);
  assert.ok(ships.every(s => !s.captain), 'a draw must not touch the ships');
  const drawn = drawCaptains(ships, 7, registers);
  commissionCaptains(ships, 7, registers);
  assert.ok(ships.every(s => s.captain?.name), 'commissioning must attach every record');
  assert.deepEqual(ships.map(s => s.captain), ships.map(s => drawn[s.id]), 'and attach exactly what the draw returned');
});

check('the ids are stable and carry the power, for a campaign layer to inherit', () => {
  const c = drawCaptain('A-1', 7, 'EAR', registers);
  assert.match(c.id, /^cap-EAR-\d+$/);
  assert.deepEqual(drawCaptain('A-1', 7, 'EAR', registers).id, c.id);
});

// ---------------------------------------------------------------- the registers themselves
check('every register is populated, titled and free of duplicates', () => {
  for (const [faction, r] of Object.entries(registers)) {
    assert.ok(r.title, `${faction} has no title`);
    assert.ok(r.register, `${faction} has no note saying what the register is`);
    assert.ok(r.names.length >= 30, `${faction} has only ${r.names.length} names`);
    assert.equal(new Set(r.names).size, r.names.length, `${faction} repeats a name`);
    assert.ok(r.names.every(n => typeof n === 'string' && n.trim() === n && n.length), `${faction} has a malformed name`);
  }
});

check('the named characters are not dealt out as ship captains', () => {
  // Archon Vezder and Supreme Leader Stratan Valdar are people, not a name pool. The Valdar Cannon
  // is theirs too, and there is only ever one.
  const krelath = registers.KRE.names.join(' ');
  assert.ok(!/\bValdar\b/.test(krelath), 'Valdar belongs to the Supreme Leader');
  assert.ok(!/\bVezder\b/.test(krelath), 'Vezder belongs to the deposed Archon');
});

check('each register keeps its own morphology', () => {
  assert.ok(registers.ZAN.names.every(n => n.includes("'")), 'Zandrax names click and carry apostrophes');
  assert.ok(registers.KRE.names.every(n => n.split(' ').length === 2), 'Krelath names are two-part');
  assert.ok(registers.EAR.names.every(n => n.split(' ').length === 2), 'the phone book lists a given name and a surname');
  assert.ok(['Scott Ridley', 'Marvin Kaminski'].every(n => registers.EAR.names.includes(n)), 'the two Chris supplied must be in the Federation register');
  assert.ok(['Stalactar', 'Geos', 'Hydron'].every(n => registers.VRA.names.includes(n)), 'the three Chris supplied must be in the Vraygon register');
});

console.log(`\nCaptain roster: ${passed} checks passed.`);
