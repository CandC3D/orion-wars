// Dealing out the officers. Two properties carry the whole file:
//
//   THE BATTLE PRNG IS UNTOUCHED. If a draw advanced it, every roll after it would move and every
//   recorded battle and the whole balance corpus would become unreproducible.
//   A NAME CHANGES NOTHING - BUT COMMISSIONING DOES. The drawn NAME moves no threshold, and that
//   is all the original version of this file tested. Attaching the first captain RECORD arms every
//   guarded rule on that hull, so a fleet's behaviour changes the moment it is officered. I claimed
//   the opposite in writing until Astra reproduced it on 2026-09-09; the check below now proves the
//   real thing, so nobody reads the neutral one as a licence to skip re-measuring balance.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { drawCaptain, drawCaptains, commissionCaptains, registerSpace } = await mod('src/tactical/captain-roster.js');
const { captainOf, DEFAULT_POSTURE } = await mod('src/tactical/ship-command.js');
const { makePrng } = await mod('src/prng.js');
const { buildShip } = await mod('src/tactical/ship.js');
const { createBattleFromFleets, stepTurn } = await mod('src/tactical/resolver.js');
const tuning = JSON.parse(fs.readFileSync(path.join(root, 'data/tactical-tuning.json'), 'utf8'));
const loadouts = JSON.parse(fs.readFileSync(path.join(root, 'data/loadouts.json'), 'utf8'));
const registers = JSON.parse(fs.readFileSync(path.join(root, 'data/captain-names.json'), 'utf8')).registers;

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };
const fleet = (faction, n, prefix = 'S') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, faction }));
// A register is either a written-out list or two pools that combine, so membership is asked of the
// index space rather than of one shape's array.
const inRegister = (faction, personalName) => {
  const space = registerSpace(registers[faction]);
  for (let i = 0; i < space.size; i++) if (space.at(i) === personalName) return true;
  return false;
};
const COMBINING = ['EAR', 'KRE'], WRITTEN_OUT = ['VRA', 'ZAN'];

check('every power in the register deals a titled officer', () => {
  for (const faction of ['EAR', 'KRE', 'VRA', 'ZAN']) {
    const c = drawCaptain('A-1', 7, faction, registers);
    assert.ok(c, `${faction} drew nothing`);
    assert.equal(c.faction, faction);
    assert.equal(c.name, `${c.title} ${c.personalName}`);
    assert.ok(inRegister(faction, c.personalName), `${c.personalName} is not in the ${faction} register`);
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
    assert.ok(inRegister(expected, c.personalName));
  }
});

check('the NAME is neutral: it moves no threshold', () => {
  // This is all the original version of this check tested, and I read far more into it than it
  // says. A drawn officer takes the standing posture, so his profile is the default profile - but
  // a ship with no record at all is not running the rules under a default profile, it is not
  // running them. See the next check, which is the one that matters.
  const c = drawCaptain('A-1', 7, 'EAR', registers);
  assert.equal(c.posture, DEFAULT_POSTURE);
  assert.deepEqual(captainOf({ captain: c }, null).profile, captainOf({}, null).profile);
});

check('but COMMISSIONING changes behaviour, and saying otherwise was wrong', () => {
  // Astra, 2026-09-09. I told Chris more than once that officers could be switched on and read
  // before any ship behaved differently, and that no re-measurement was needed. That is false.
  // Attaching the first record arms every guarded rule on that hull: standard posture still holds
  // a hurt ship outside three hexes. The balance corpus must be re-measured before captains are
  // switched on, and this check exists so nobody is comforted by the one above again.
  const t = structuredClone(tuning), L = loadouts;
  const run = commission => {
    const tune = structuredClone(t), rng = makePrng(11);
    tune.toHit.target = -100; tune.explosion.enabled = false;
    const a = buildShip('A-1', 'EAR', 'light-cruiser', tune, L, rng);
    const b = buildShip('B-1', 'KRE', 'heavy-cruiser', tune, L, rng);
    a.pos = { q: 0, r: 0 }; a.facing = 0; a.superstructure = Math.round(a.superstructureMax * 0.3);
    b.pos = { q: 6, r: 0 }; b.facing = 3; b.mounts = []; b.turnRate = 0;
    if (commission) commissionCaptains([a], 7, registers);
    const battle = createBattleFromFleets([[a], [b]], tune, rng, { terrain: [], maxTurns: 4 });
    const idle = { turn: 0, forward: 0 };
    stepTurn(battle, { 'A-1': { plan: [{ turn: 0, forward: 4 }, idle, idle], target: 'auto', reserve: 0 },
      'B-1': { plan: [idle, idle, idle], target: 'auto', reserve: 1 } });
    return a.movedThisTurn;
  };
  const bare = run(false), officered = run(true);
  assert.equal(bare, 4, 'an unofficered hurt cruiser closes as ordered');
  assert.ok(officered < bare, `commissioning must be visible in the outcome: ${officered} vs ${bare}`);
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
    const space = registerSpace(r);
    assert.ok(space && space.size >= 30, `${faction} offers only ${space?.size} officers`);
    for (const pool of [r.names, r.given, r.family].filter(Boolean)) {
      assert.equal(new Set(pool).size, pool.length, `${faction} repeats an entry`);
      assert.ok(pool.every(n => typeof n === 'string' && n.trim() === n && n.length), `${faction} has a malformed entry`);
    }
  }
});

check('the registers are plain ASCII, as ruled', () => {
  // Chris, 8 September 2026. One fewer thing to go wrong between the JSON, the browser console and
  // Windows; a name that wants a diacritic is spelled the way it is spelled without one.
  for (const [faction, r] of Object.entries(registers))
    for (const pool of [r.names, r.given, r.family].filter(Boolean))
      for (const n of pool) assert.ok(/^[ -~]+$/.test(n), `${faction} carries a non-ASCII entry: ${n}`);
});

check('the two peoples with family names combine; the two with one name do not', () => {
  for (const faction of COMBINING) {
    const r = registers[faction];
    assert.ok(r.given?.length && r.family?.length, `${faction} should carry two pools`);
    assert.ok(!r.names, `${faction} should not also carry a written-out list`);
    assert.equal(registerSpace(r).size, r.given.length * r.family.length);
  }
  for (const faction of WRITTEN_OUT) {
    const r = registers[faction];
    assert.ok(r.names?.length, `${faction} should carry a written-out list`);
    assert.ok(!r.given && !r.family, `${faction} names are not assembled from parts`);
  }
});

check('a combined draw takes each half from its own pool', () => {
  for (const faction of COMBINING) {
    const r = registers[faction];
    for (let i = 0; i < 40; i++) {
      const c = drawCaptain(`hull-${i}`, 909, faction, registers);
      const [given, family, ...rest] = c.personalName.split(' ');
      assert.equal(rest.length, 0, `${c.personalName} is not two parts`);
      assert.ok(r.given.includes(given), `${given} is not in the ${faction} given pool`);
      assert.ok(r.family.includes(family), `${family} is not in the ${faction} family pool`);
    }
  }
});

check('the crossing is real: one pool alone does not decide the officer', () => {
  // If the family name moved with the given name, a fleet would only ever field the pairs that were
  // written down, and there would have been no point splitting the pools.
  const drawn = Object.values(drawCaptains(fleet('EAR', 60), 2026, registers));
  const pairs = new Set(drawn.map(c => c.personalName));
  const givens = new Set(drawn.map(c => c.personalName.split(' ')[0]));
  const families = new Set(drawn.map(c => c.personalName.split(' ')[1]));
  assert.equal(pairs.size, 60, 'every officer is distinct');
  assert.ok(givens.size > 20 && families.size > 20, `pools look stuck: ${givens.size} given, ${families.size} family`);
});

check('a large fleet still fields no two officers of the same name', () => {
  const names = Object.values(drawCaptains(fleet('EAR', 200), 44, registers)).map(c => c.name);
  assert.equal(names.length, 200);
  assert.equal(new Set(names).size, 200);
  assert.ok(!names.some(n => / II$/.test(n)), 'ten thousand combinations should never need an ordinal');
});

check('the named characters are not dealt out as ship captains', () => {
  // Archon Zeltus and Supreme Leader Stratan Valdar are people, not a name pool. The Valdar Cannon
  // is theirs too, and there is only ever one.
  const krelath = [...registers.KRE.given, ...registers.KRE.family].join(' ');
  assert.ok(!/\bValdar\b/.test(krelath), 'Valdar belongs to the Supreme Leader');
  assert.ok(!/\bZeltus\b/.test(krelath), 'Zeltus belongs to the deposed Archon');
  // Renamed from Vezder on 9 September 2026: it read too close to Valdar, and those two men are the
  // whole political quarrel of the setting. Hold the retired name out as well - a pool entry that
  // revived it would quietly undo the reason for the change.
  assert.ok(!/\bVezder\b/.test(krelath), 'Vezder was the Archon and is not free to reuse');
});

check('each register keeps its own morphology', () => {
  assert.ok(registers.ZAN.names.every(n => n.includes("'")), 'Zandrax names click and carry apostrophes');
  for (const faction of COMBINING)
    for (const pool of [registers[faction].given, registers[faction].family])
      assert.ok(pool.every(n => !n.includes(' ')), `${faction} pool entries are single words`);
  assert.ok(inRegister('EAR', 'Scott Ridley') && inRegister('EAR', 'Marvin Kaminski'), 'the two Chris supplied must still be drawable');
  assert.ok(inRegister('KRE', 'Stratan Rukk'), 'and the Krelath pools must still cross');
  assert.ok(['Stalactar', 'Geos', 'Hydron'].every(n => registers.VRA.names.includes(n)), 'the three Chris supplied must be in the Vraygon register');
});

console.log(`\nCaptain roster: ${passed} checks passed.`);
