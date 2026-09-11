// Point-defence saturation (ruling, Chris 2026-09-11: "how many missiles PD may shoot down in a turn").
// Each point stops at most interceptsPerPoint torpedoes a turn; a spent battery leaves the pool.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBattleFromFleets, stepTurn } from '../src/tactical/resolver.js';
import { createMissileFlight } from '../src/tactical/missiles.js';
import { buildShip } from '../src/tactical/ship.js';
import { makePrng } from '../src/prng.js';
import { pointDefenceUmbrellas, pointDefenceKey } from '../arena/contact-point-defence.js';

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const T = read('../data/tactical-tuning.json'), L = read('../data/loadouts.json');
let passed = 0; const check = (name, fn) => { fn(); passed++; console.log('ok:', name); };

// Four torpedoes at one hull screened by one escort with point defence 2. Interception is made
// certain (chance 1 per point) so the only thing that can stop a kill is the escort running dry.
function salvo(perPoint, torpedoes = 4) {
  const t = structuredClone(T); t.battle.terrain = []; t.explosion.enabled = false;
  t.pointDefence.chancePerPoint = 1; t.pointDefence.maxChance = 1; t.pointDefence.interceptsPerPoint = perPoint;
  t.missileRetarget = { enabled: false, radiusHexes: 0 };
  const rng = makePrng(9);
  const shooter = buildShip('A-s', 'EAR', 'destroyer', t, L, rng), target = buildShip('B-t', 'KRE', 'battleship', t, L, rng), escort = buildShip('B-e', 'KRE', 'destroyer', t, L, rng);
  shooter.pos = { q: 0, r: 0 }; target.pos = { q: 10, r: 0 }; escort.pos = { q: 11, r: 0 };
  target.hull.pointDefence = 0; escort.hull.pointDefence = 2;
  for (const s of [shooter, target, escort]) s.mounts.forEach(m => { m.inop = true; });
  const battle = createBattleFromFleets([[shooter], [target, escort]], t, rng);
  for (let i = 0; i < torpedoes; i++) battle.inFlight.push({ missileId: `m${i}`, targetId: target.id, shooterId: shooter.id, side: 'A',
    shooterPos: { ...shooter.pos }, shooterFacing: 0, weapon: 'neutronic-missile', damage: 1, spread: 0, shooterPoints: 0,
    flight: createMissileFlight(shooter.pos, target.pos, 0, 0, 3) });
  const outcomes = []; stepTurn(battle, {}, { onShot: e => { if (e.kind === 'missile') outcomes.push(e.outcome); } });
  return outcomes;
}

check('one point stops one torpedo a turn: a PD-2 escort stops two of four, then the salvo gets through', () => {
  assert.deepEqual(salvo(1), ['intercepted', 'intercepted', 'hit', 'hit']);
});
check('two a point: the same escort stops all four', () => {
  assert.deepEqual(salvo(2), ['intercepted', 'intercepted', 'intercepted', 'intercepted']);
});
check('unset, the screen never runs dry (the old rule)', () => {
  assert.deepEqual(salvo(null, 6), new Array(6).fill('intercepted'));
});
check('the ledger is per turn: the live rule is one per point', () => {
  assert.equal(T.pointDefence.interceptsPerPoint, 1);
});

check('the console key says how many a hull can stop', () => {
  const ship = { id: 'A-cl', className: 'light-cruiser', pos: { q: 0, r: 0 }, destroyed: false, hull: { pointDefence: 2 } };
  const u = pointDefenceUmbrellas([ship], 3);
  assert.match(pointDefenceKey(ship, u, 1), /POINT DEFENCE 2 · 3 HEX UMBRELLA · STOPS ≤2\/TURN/);
  assert.doesNotMatch(pointDefenceKey(ship, u), /STOPS/, 'without the rule, no claim');
});

console.log(`\nPoint-defence saturation: ${passed} checks passed.`);
