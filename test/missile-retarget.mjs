// Torpedo retargeting (EXPERIMENT, Chris 2026-09-11): an orphaned torpedo takes the nearest living,
// uncloaked enemy within radiusHexes of where it is; otherwise it is lost as before.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { retargetOrphan, retargetOrphans, createMissileFlight } from '../src/tactical/missiles.js';
import { createBattleFromFleets, stepTurn } from '../src/tactical/resolver.js';
import { buildShip } from '../src/tactical/ship.js';
import { makePrng } from '../src/prng.js';
import { fullState } from '../src/captains/trusted.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const T = read('../data/tactical-tuning.json'), L = read('../data/loadouts.json');
let passed = 0; const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };
const ON = { enabled: true, radiusHexes: 3 };
const ship = (id, side, q, r, extra = {}) => ({ id, side, pos: { q, r }, destroyed: false, cloaked: false, ...extra });
const torpedo = (targetId, at) => ({ missileId: 'm1', side: 'A', targetId, flight: createMissileFlight(at, at, 0, 1, 1) });

check('an orphan takes the nearest enemy inside the radius, ties by id', () => {
  const fleets = [[ship('A-1', 'A', 0, 0)], [ship('B-dead', 'B', 5, 0, { destroyed: true }), ship('B-far', 'B', 9, 0), ship('B-z', 'B', 7, 0), ship('B-a', 'B', 3, 0)]];
  const m = torpedo('B-dead', { q: 5, r: 0 });
  assert.equal(retargetOrphan(m, fleets, ON), true);
  assert.equal(m.targetId, 'B-a', 'B-a and B-z are both 2 hexes away: the lower id wins');
  assert.deepEqual(m.retargets, [{ from: 'B-dead', to: 'B-a' }]);
});

check('nothing inside the radius: the torpedo stays orphaned and is lost as before', () => {
  const fleets = [[ship('A-1', 'A', 0, 0)], [ship('B-dead', 'B', 5, 0, { destroyed: true }), ship('B-far', 'B', 9, 0)]];
  const m = torpedo('B-dead', { q: 5, r: 0 });
  assert.equal(retargetOrphan(m, fleets, ON), false); assert.equal(m.targetId, 'B-dead');
});

check('never a cloaked hull, never a friend, never while the target lives, never when disabled', () => {
  const fleets = [[ship('A-1', 'A', 5, 1)], [ship('B-dead', 'B', 5, 0, { destroyed: true }), ship('B-cloak', 'B', 6, 0, { cloaked: true }), ship('B-live', 'B', 8, 0)]];
  const m = torpedo('B-dead', { q: 5, r: 0 });
  assert.equal(retargetOrphan(m, fleets, ON), true); assert.equal(m.targetId, 'B-live', 'skips the cloaked hull and the friend');
  const alive = torpedo('B-live', { q: 5, r: 0 }); assert.equal(retargetOrphan(alive, fleets, ON), false);
  const off = torpedo('B-dead', { q: 5, r: 0 }); retargetOrphans([off], fleets, { enabled: false, radiusHexes: 99 }); assert.equal(off.targetId, 'B-dead');
});

check('in a real battle, switched off is identical to the block being absent', () => {
  const run = rule => {
    const t = structuredClone(T); t.missileRetarget = rule; const rng = makePrng(4242);
    const A = [buildShip('A-bb', 'EAR', 'battleship', t, L, rng)], B = [buildShip('B-dd', 'KRE', 'destroyer', t, L, rng), buildShip('B-dd2', 'KRE', 'destroyer', t, L, rng)];
    A[0].pos = { q: 0, r: 0 }; A[0].facing = 0; B[0].pos = { q: 8, r: 0 }; B[0].facing = 3; B[1].pos = { q: 9, r: 1 }; B[1].facing = 3;
    const battle = createBattleFromFleets([A, B], t, rng, { maxTurns: 4 });
    const shots = []; while (!battle.done) stepTurn(battle, {}, { onShot: e => shots.push(e) });
    return { battle, shots };
  };
  const off = run({ enabled: false, radiusHexes: 3 }), absent = run(undefined);
  assert.equal(JSON.stringify(fullState(off.battle)), JSON.stringify(fullState(absent.battle)), 'disabled equals absent');
  const on = run({ enabled: true, radiusHexes: 3 });
  assert.ok(on.shots.filter(e => e.kind === 'missile').length > 0, 'the fixture really fires torpedoes');
});

console.log(`\nMissile retargeting: ${passed} checks passed.`);
