import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shipSide, fleetSummary, sideLabel, resultLabel, replayCoverage } from '../arena/replay-status.js';
import { recordScenario, recordBuiltBattle, createPlayRecord } from '../arena/record.js';
import { buildFleet, deployFleets, createBattle, battleView, stepTurn, runBattle } from '../src/tactical/resolver.js';
import { makePrng } from '../src/prng.js';
import { frigateTrial } from './fixtures/drydock-frigate.js';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const t = read('../data/tactical-tuning.json'), l = read('../data/loadouts.json');
let checks = 0;
const test = (name, f) => { f(); checks++; console.log(`ok: ${name}`); };

test('Bundled archive gaps are visible without changing any recording', () => {
  for (const file of ['replay.json', 'replays/ear-kre-24.json', 'replays/ear-kre-32.json', 'replays/vra-zan-32.json', 'replays/coverage.json']) {
    const r = read('../arena/' + file), before = JSON.stringify(r), c = replayCoverage(r);
    assert.equal(c.incomplete, file === 'replay.json', file);
    if (c.incomplete) { assert.equal(c.shots.length, 2); assert.equal(c.log.length, 1); assert.match(c.log[0].message, /destroyed/); }
    assert.equal(JSON.stringify(r), before);
  }
});
test('Explicit side, opening side, engine ID and distinct faction are ordered fallbacks', () => {
  const r = { meta: { factions: { A: 'EAR', B: 'KRE' } }, rounds: [{ ships: [{ id: 'A-conflict', side: 'B' }] }] };
  assert.equal(shipSide(r, { id: 'A-conflict', side: 'A', faction: 'KRE' }), 'A');
  assert.equal(shipSide(r, { id: 'A-conflict', faction: 'EAR' }), 'B');
  assert.equal(shipSide(r, { id: 'B-old', faction: 'EAR' }), 'B');
  assert.equal(shipSide(r, { id: 'named', faction: 'EAR' }), 'A');
  r.meta.factions.B = 'EAR';
  assert.equal(shipSide(r, { id: 'named', faction: 'EAR' }), null);
  const frame = { ships: [{ id: 'named', faction: 'EAR', points: 2 }, { id: 'dead', destroyed: true, points: 9 }] };
  assert.deepEqual(fleetSummary(r, frame).unknown, ['named']);
  assert.equal(sideLabel(r, 'B'), 'EAR / B');
});
test('Draws, wins and in-progress exports are distinguished', () => {
  const r = { meta: { factions: { A: 'EAR', B: 'EAR' } }, result: { victor: 'A' } };
  assert.equal(resultLabel(r), 'EAR / A VICTORY');
  r.result.victor = 'B'; assert.equal(resultLabel(r), 'EAR / B VICTORY');
  r.result.victor = null; assert.equal(resultLabel(r), 'BATTLE DRAWN');
  r.result.reason = 'battle in progress'; assert.match(resultLabel(r), /IN PROGRESS/);
  assert.doesNotMatch(resultLabel(r), /DRAWN/);
});
test('Missing middle frames and contradictory final counts are also detected', () => {
  const r = recordScenario(frigateTrial(t, l), t, l);
  assert.equal(replayCoverage(r).incomplete, false);
  const gap = structuredClone(r), event = gap.shots.find(e => e.turn > 0);
  gap.rounds = gap.rounds.filter(f => f.turn !== event.turn || f.round !== event.round);
  assert.ok(replayCoverage(gap).shots.length);
  const mismatch = structuredClone(r); mismatch.result.survivorsA += 1;
  assert.match(replayCoverage(mismatch).reasons.join(' '), /survivors/);
  // Unknown old ownership must not produce false mismatches against zero.
  for (const f of mismatch.rounds) for (const s of f.ships) { delete s.side; s.id = 'legacy-' + s.id; }
  assert.equal(replayCoverage(mismatch).incomplete, false);
});
test('New headless same-faction frames carry side even for non-engine IDs', () => {
  const rng = makePrng(44), fleets = ['A', 'B'].map(side => buildFleet('EAR', { frigate: 1 }, t, l, rng, side));
  fleets[0][0].id = 'Enterprise'; fleets[1][0].id = 'Reliant';
  deployFleets(...fleets, t);
  assert.equal(fleets[0][0].side, undefined);
  const r = recordBuiltBattle({ fleets, tuning: t, rng, maxTurns: 3, meta: { factions: { A: 'EAR', B: 'EAR' } } });
  for (const frame of r.rounds) for (const s of frame.ships) assert.equal(s.side, s.id === 'Enterprise' ? 'A' : 'B');
  assert.equal(replayCoverage(r).incomplete, false);
});
test('Recording remains combat- and PRNG-neutral; 32 fresh trials have no coverage gaps', () => {
  for (let i = 0; i < 32; i++) {
    const s = frigateTrial(t, l); s.seed = `replay-status-${i}`;
    const r = recordScenario(s, t, l), b = createBattle(s, t, l, s.seed);
    const partial = createPlayRecord(s, battleView(b));
    assert.equal(replayCoverage(partial).incomplete, false);
    assert.match(resultLabel(partial), /IN PROGRESS/);
    while (!b.done) stepTurn(b);
    assert.deepEqual(r.result, b.result);
    assert.equal(replayCoverage(r).incomplete, false, s.seed);
    assert.ok(r.rounds.every(f => f.ships.every(ship => ['A', 'B'].includes(ship.side))));
  }
  // Direct fleets let the test inspect the actual recorder PRNG after running.
  const run = () => {
    const rng = makePrng(712), fleets = [buildFleet('EAR', {frigate: 2}, t, l, rng, 'A'), buildFleet('KRE', {frigate: 2}, t, l, rng, 'B')];
    deployFleets(...fleets, t);
    return { rng, fleets };
  };
  const a = run(), b = run();
  recordBuiltBattle({ ...a, tuning: t, maxTurns: 5, meta: {factions:{A:'EAR',B:'KRE'}} });
  // runBattle uses precisely the same supplied fleet and PRNG route.
  runBattle(b.fleets, t, b.rng, { maxTurns: 5 });
  assert.deepEqual(a.fleets, b.fleets); assert.equal(a.rng.next(), b.rng.next());
});
console.log(`Replay status: ${checks} groups passed.`);
