// Vessel registers: reproducible draws, isolated randomness, and genuinely opt-in recorded state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : fileURLToPath(new URL('../', import.meta.url)));
const mod = p => import(pathToFileURL(path.join(root, p)));
const { drawShipName, drawShipNames, normaliseRegisters, nameShips } = await mod('src/tactical/ship-registry.js');
const { registerSpace, drawCaptain } = await mod('src/tactical/captain-roster.js');
const { makePrng, seedFromString } = await mod('src/prng.js');
const { createBattle, createBattleFromFleets, buildScenario, stepTurn } = await mod('src/tactical/resolver.js');
const { fullState } = await mod('src/captains/trusted.js');
const { enableContacts } = await mod('src/tactical/contacts.js');
const { SENSING_PROFILE } = await mod('src/tactical/sensing.js');
const { sideView } = await mod('src/captains/observation.js');
const { shipLabel } = await mod('arena/command-model.js');
const { createCommandSession } = await mod('arena/command-host.js');
const { buildShipNames, parseRegister } = await mod('scripts/build-ship-names.mjs');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const tuning = JSON.parse(read('data/tactical-tuning.json'));
const loadouts = JSON.parse(read('data/loadouts.json'));
const nameFile = JSON.parse(read('data/ship-names.json'));
const registers = nameFile.registers;
const prefixes = { EAR: 'EDS', KRE: 'IKS', VRA: 'TWS' };
const rosters = Object.entries(tuning.rosters).filter(([, roster]) => Array.isArray(roster));
const fleet = (faction, className, n, prefix = 'S') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, faction, className }));
const scenario = (a = 'EAR', b = 'KRE') => ({ name: 'Vessel names', seed: 'vessel-test',
  map: { widthHexes: 72, heightHexes: 40 }, maxTurns: 4, terrain: [],
  sides: [a, b].map((faction, side) => ({ faction, ships: Array.from({ length: 5 }, (_, i) =>
    ({ className: 'destroyer', q: side ? 8 : -8, r: i - 2, facing: side ? 3 : 0 })) })) });
const battleFor = (s, options = {}) => createBattle(structuredClone(s), structuredClone(tuning), structuredClone(loadouts), s.seed, options);
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };

for (const [faction, roster] of rosters) {
  check(faction === 'ZAN' ? 'ZAN explicitly has no source register: every roster hull remains unnamed' : `${faction}: every roster class draws from its own source class with the correct prefix`, () => {
    if (faction === 'ZAN') {
      assert.equal(registers.ZAN, undefined);
      const ships = roster.map((className, i) => ({ id: `Z-${i}`, faction, className }));
      const before = structuredClone(ships);
      for (const ship of ships) assert.equal(drawShipName(ship.id, 7, faction, ship.className, registers), null);
      assert.deepEqual(drawShipNames(ships, 7, registers), {});
      assert.deepEqual(nameShips(ships, 7, registers), {});
      assert.deepEqual(ships, before);
      return;
    }
    assert.ok(Object.hasOwn(prefixes, faction), `${faction} must have names or an explicit missing-register test`);
    assert.deepEqual(Object.keys(registers[faction].classes).sort(), [...roster].sort());
    for (const className of roster) {
      const record = registers[faction].classes[className];
      assert.ok(record.sourceClass && record.names.length);
      const drawn = drawShipName('A-1', 7, faction, className, registers);
      assert.ok(record.names.includes(drawn.name));
      assert.deepEqual(drawn, { prefix: prefixes[faction], name: drawn.name, full: `${prefixes[faction]} ${drawn.name}` });
    }
  });
}

check('unknown powers, unmapped classes and absent or empty registers invent no names', () => {
  for (const [faction, className, data] of [['SETHYR','frigate',registers], ['EAR','carrier',registers],
    ['EAR','frigate',null], ['EAR','frigate',{}], ['EAR','frigate',{ EAR: { classes: { frigate: { names: [] } } } }]]) {
    assert.equal(drawShipName('S-1', 5, faction, className, data), null);
  }
});

check('same seed and hull give the same name; changing the seed changes the fleet', () => {
  const ships = fleet('EAR', 'frigate', 12);
  assert.deepEqual(drawShipNames(ships, 1, registers), drawShipNames(ships, 1, registers));
  assert.notDeepEqual(drawShipNames(ships, 1, registers), drawShipNames(ships, 2, registers));
  assert.deepEqual(drawShipName('S-1', 7, 'EAR', 'frigate', registers), drawShipName('S-1', 7, 'EAR', 'frigate', registers));
});

check('the hull id reaches the private stream and collisions probe forward exactly as captains do', () => {
  const record = registers.EAR.classes.frigate, taken = new Set();
  const expected = makePrng(seedFromString('11:S-1')).int(registerSpace(record).size);
  assert.equal(drawShipName('S-1', 11, 'EAR', 'frigate', registers, { taken }).name, record.names[expected]);
  assert.equal(drawShipName('S-1', 11, 'EAR', 'frigate', registers, { taken }).name, record.names[(expected + 1) % record.names.length]);
  const captains = { EAR: { title: 'Capt.', names: record.names } }, takenCaptain = new Set(), takenShip = new Set();
  for (const ship of fleet('EAR', 'frigate', record.names.length + 3)) {
    assert.equal(drawShipName(ship.id, 3, 'EAR', 'frigate', registers, { taken: takenShip }).name,
      drawCaptain(ship.id, 3, 'EAR', captains, { taken: takenCaptain }).personalName);
  }
});

check('the draw never advances the battle generator or changes its next value', () => {
  const rng = makePrng(12345);
  rng.next(); rng.next();
  const state = rng.state;
  drawShipNames(fleet('VRA', 'frigate', 30), 99, registers);
  assert.equal(rng.state, state);
  assert.equal(rng.next(), makePrng(state).next());
});

check('every registered fleet has unique names across all classes, including Ranger and Starwing', () => {
  for (const faction of Object.keys(prefixes)) {
    const ships = Object.entries(registers[faction].classes).flatMap(([className, r]) => fleet(faction, className, r.names.length + 2, className));
    const drawn = drawShipNames(ships, 5, registers), names = Object.values(drawn).map(n => n.full);
    assert.equal(names.length, ships.length);
    assert.equal(new Set(names).size, names.length, `${faction} has a duplicate vessel`);
    assert.deepEqual(drawn, drawShipNames([...ships].reverse(), 5, registers));
  }
});

check('small registers overflow with Roman ordinals, including beyond the tenth pass', () => {
  const ships = fleet('VRA', 'frigate', 128);
  const names = Object.values(drawShipNames(ships, 3, registers)).map(n => n.name);
  assert.equal(names.length, 128);
  assert.equal(new Set(names).size, 128);
  assert.ok(names.includes('Shard II'));
  assert.ok(names.includes('Shard XI'));
  assert.ok(names.includes('Shard XXXII'));
});

check('each power draws from its own register in a mixed fleet', () => {
  const ships = Object.keys(prefixes).flatMap(faction => fleet(faction, 'frigate', 3, faction));
  const drawn = drawShipNames(ships, 4, registers);
  for (const ship of ships) assert.equal(drawn[ship.id].prefix, prefixes[ship.faction]);
});

check('drawing is pure; nameShips attaches exactly the draw and preserves Drydock design names', () => {
  const ships = fleet('EAR', 'frigate', 3).map(s => ({ ...s, displayName: 'Custom design' }));
  const before = structuredClone(ships), sourceBefore = structuredClone(registers);
  const drawn = drawShipNames(ships, 7, registers);
  assert.deepEqual(ships, before);
  assert.deepEqual(nameShips(ships, 7, registers), drawn);
  for (const ship of ships) {
    assert.equal(ship.displayName, 'Custom design');
    assert.deepEqual(ship.vesselName, drawn[ship.id]);
    assert.equal(ship.captain, undefined);
  }
  const named = structuredClone(ships);
  nameShips(ships, 7, registers);
  assert.deepEqual(ships, named);
  assert.deepEqual(registers, sourceBefore);
});

check('shipLabel prefers the vessel without a hull number and retains existing unnamed labels', () => {
  const ship = { id: 'A-frigate-1', className: 'frigate', displayName: 'Custom design' };
  assert.equal(shipLabel(ship), 'Custom design 01');
  ship.vesselName = { prefix: 'EDS', name: 'Monoceros', full: 'EDS Monoceros' };
  assert.equal(shipLabel(ship), 'EDS Monoceros');
  delete ship.vesselName; delete ship.displayName;
  assert.equal(shipLabel(ship), 'Frigate 01');
});

check('the default creation path adds no name field and matches fleet construction in fullState', () => {
  const s = scenario(), rng = makePrng(seedFromString(s.seed));
  const built = buildScenario(structuredClone(s), structuredClone(tuning), structuredClone(loadouts), rng);
  const direct = createBattleFromFleets(built.fleets, built.tuning, rng, { terrain: built.terrain, maxTurns: s.maxTurns });
  const bare = battleFor(s);
  assert.equal(JSON.stringify(fullState(bare)), JSON.stringify(fullState(direct)));
  assert.equal(JSON.stringify(fullState(bare)), JSON.stringify(fullState(battleFor(s, { shipNames: null }))));
  assert.ok(bare.fleets.flat().every(ship => !Object.hasOwn(ship, 'vesselName')));
});

check('opted-in names change only vesselName in full recorded states and leave the live PRNG untouched', () => {
  const stripNames = value => JSON.stringify(value, (key, v) => key === 'vesselName' ? undefined : v);
  for (const [a, b] of [['EAR','KRE'], ['VRA','ZAN']]) {
    const s = scenario(a, b), bare = battleFor(s), named = battleFor(s, { shipNames: registers });
    const verify = () => {
      assert.equal(bare.rng.state, named.rng.state);
      assert.equal(stripNames(fullState(named)), JSON.stringify(fullState(bare)));
      for (const ship of named.fleets.flat()) assert.equal(Object.hasOwn(ship, 'vesselName'), ship.faction !== 'ZAN');
    };
    verify();
    while (!bare.done) { stepTurn(bare); stepTurn(named); verify(); }
    assert.equal(bare.rng.next(), named.rng.next());
  }
});

check('own observations clone vesselName; enemy contacts do not disclose it', () => {
  const battle = battleFor(scenario(), { shipNames: registers });
  enableContacts(battle, { profile: SENSING_PROFILE });
  const view = sideView(battle, 'A'), own = view.own[0], ship = battle.A.find(s => s.id === own.id);
  assert.deepEqual(own.vesselName, ship.vesselName);
  assert.notEqual(own.vesselName, ship.vesselName);
  assert.ok(Object.isFrozen(own.vesselName));
  assert.ok(view.contacts.every(c => !Object.hasOwn(c, 'vesselName')));
  const bare = battleFor(scenario()); enableContacts(bare, { profile: SENSING_PROFILE });
  assert.ok(sideView(bare, 'A').own.every(s => !Object.hasOwn(s, 'vesselName')));
});

check('PLAY names both commanded sides only on explicit opt-in, including deterministic restarts', () => {
  const input = { mode: 'bundled', side: 'A', scenario: scenario() }, options = { shipNames: registers };
  const bare = createCommandSession(input, tuning, loadouts).session.view();
  assert.deepEqual(createCommandSession(input, tuning, loadouts, options).session.view(), bare);
  assert.deepEqual(createCommandSession({ ...input, nameShips: false }, tuning, loadouts, options).session.view(), bare);
  assert.throws(() => createCommandSession({ ...input, nameShips: 'true' }, tuning, loadouts, options), /Invalid command setup/);
  assert.throws(() => createCommandSession({ ...input, nameShips: true }, tuning, loadouts), /registers unavailable/);
  for (const side of ['A', 'B']) {
    const setup = { ...input, side, nameShips: true };
    const view = createCommandSession(setup, tuning, loadouts, options).session.view();
    assert.ok(view.observation.own.every(ship => ship.vesselName?.full));
    assert.deepEqual(createCommandSession(setup, tuning, loadouts, options).session.view(), view);
  }
  const zan = createCommandSession({ ...input, scenario: scenario('ZAN','EAR'), nameShips: true }, tuning, loadouts, options);
  assert.ok(zan.session.view().observation.own.every(s => !Object.hasOwn(s, 'vesselName')));
});

check('register metadata and names are plain ASCII, populated and deduplicated within each class', () => {
  assert.doesNotMatch(read('data/ship-names.json'), /[^\x09\x0a\x0d\x20-\x7e]/);
  for (const [faction, r] of Object.entries(registers)) {
    assert.equal(r.prefix, prefixes[faction]); assert.ok(r.prefixName && r.navy);
    for (const c of Object.values(r.classes)) {
      assert.equal(new Set(c.names).size, c.names.length);
      assert.ok(c.names.every(n => typeof n === 'string' && n.trim() === n && n.length));
    }
  }
});

check('generation reproduces the checked-in JSON and reports the one within-class duplicate', () => {
  const warnings = [];
  assert.equal(JSON.stringify(buildShipNames(root, { warn: m => warnings.push(m) }), null, 2) + '\n', read('data/ship-names.json'));
  assert.equal(warnings.length, 1); assert.match(warnings[0], /duplicate "Hero" in Swift; keeping first position/);
  assert.deepEqual(registers.KRE.classes.destroyer.names, ['Swift','Valiant','Hero','Ranger','Gladiator','Glory','Honor']);
  assert.equal(registers.KRE.classes['strike-cruiser'].sourceClass, 'Lightning');
  assert.equal(registers.VRA.classes.monitor.sourceClass, 'Bastion');
  assert.equal(registers.VRA.classes['missile-destroyer'].sourceClass, 'Avalanche');
  assert.equal(registers.KRE.classes.carrier.sourceClass, 'Bladestar');
  // Ruled by Chris 2026-09-09: the class is Bladestar, the model filename's spelling, not the
  // names file's Starblade. The lead vessel then completes the grid the rest of the class uses -
  // {Star, Fire, Ice} against {blade, sword, wing} - so the source's 'Starbade' was a dropped
  // letter and is corrected. That correction is Fable's inference, not Chris's ruling.
  assert.equal(registers.KRE.classes.carrier.names[0], 'Starblade');
  assert.deepEqual(registers.KRE.classes.carrier.names.slice(0, 3), ['Starblade', 'Fireblade', 'Iceblade']);
});

check('unrecognised class headings, empty classes and incomplete metadata fail loudly', () => {
  const source = read('data/source/ear-ship-names.txt'), opts = { source: 'ear-source', warn: () => {} };
  for (const heading of ['*New Class*', '*New* Class', 'New Class']) {
    assert.throws(() => parseRegister(source.replace('*Monoceros Class*', heading), 'EAR', opts), /ear-source:\d+: Unrecognised class heading/);
  }
  assert.throws(() => parseRegister(source.replace('Prefix: EDS (Earth Defense Ship)', ''), 'EAR', opts), /incomplete header/);
  assert.throws(() => parseRegister(source.replace('EDS (Earth Defense Ship)', 'TWS (Earth Defense Ship)'), 'EAR', opts), /Expected prefix EDS/);
  assert.throws(() => parseRegister(source.replace(/\*Yamato Class\*[\s\S]*/, '*Yamato Class*\n'), 'EAR', opts), /missing or empty Yamato Class/);
});

check('a clean source copy rebuilds idempotently from any working directory, with no partial write on error', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-register-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.mkdirSync(path.join(temp, 'data/source'), { recursive: true });
    const files = ['scripts/build-ship-names.mjs', 'data/tactical-tuning.json',
      ...['ear','kre','vra'].map(f => `data/source/${f}-ship-names.txt`)];
    for (const file of files) fs.copyFileSync(path.join(root, file), path.join(temp, file));
    const run = () => execFileSync(process.execPath, [path.join(temp, 'scripts/build-ship-names.mjs')], { cwd: os.tmpdir(), stdio: 'pipe' });
    run();
    const output = path.join(temp, 'data/ship-names.json'), first = fs.readFileSync(output);
    run(); assert.deepEqual(fs.readFileSync(output), first);
    assert.deepEqual(first, fs.readFileSync(path.join(root, 'data/ship-names.json')));
    for (const file of files) assert.deepEqual(fs.readFileSync(path.join(temp, file)), fs.readFileSync(path.join(root, file)));
    const source = path.join(temp, 'data/source/ear-ship-names.txt');
    fs.appendFileSync(source, '\n*Unmapped Class*\nUnmapped\n');
    assert.throws(run, /Unrecognised class heading/);
    assert.deepEqual(fs.readFileSync(output), first, 'failure must not replace the last good generated file');
  } finally {
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('ship-register-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// Exercise the real worker path with local fetches, keeping the browser's trusted host boundary.
for (const enabled of [false, true]) {
  const fetched = [], messages = [];
  const context = vm.createContext({ createCommandSession, self: { postMessage: value => messages.push(value) },
    fetch: async url => { fetched.push(url); return { ok: true, json: async () => JSON.parse(read(url.replace('../', ''))) }; } });
  vm.runInContext(read('arena/command-worker.js').replace(/^import .*;\r?\n/, ''), context);
  await context.self.onmessage({ data: { id: 1, type: 'start', setup: {
    mode: 'bundled', side: 'A', scenario: scenario(), ...(enabled ? { nameShips: true } : {}) } } });
  check(`PLAY worker ${enabled ? 'loads and attaches names when requested' : 'does not even load the register by default'}`, () => {
    assert.equal(messages.length, 1); assert.equal(messages[0].ok, true, messages[0].error);
    assert.equal(fetched.includes('../data/ship-names.json'), enabled);
    assert.ok(messages[0].value.frame.observation.own.every(s => Object.hasOwn(s, 'vesselName') === enabled));
  });
}


check('either shape of register file is accepted, and an unusable one is refused', () => {
  // A shape mismatch used to name NOTHING and say nothing: no error, no names, a silently unnamed
  // fleet. That is the failure mode that looks exactly like a deploy that never shipped, and it
  // cost Chris an evening on 10 September 2026.
  const ships = [{ id: 'A-1', faction: 'EAR', className: 'frigate' }];
  const whole = drawShipNames(ships, 7, nameFile);
  const inner = drawShipNames(ships, 7, nameFile.registers);
  assert.deepEqual(whole, inner, 'the whole file and its registers must draw the same');
  assert.ok(whole['A-1'].full.startsWith('EDS '));
  for (const bad of [null, undefined, {}, { registers: {} }, { EAR: {} }, 'nonsense'])
    assert.throws(() => drawShipNames(ships, 7, bad), /unusable/, `${JSON.stringify(bad)} should be refused`);
});

console.log(`\nShip registry: ${passed} checks passed.`);
