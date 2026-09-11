// Read-only rules preflight, not the reel scenario or a presentation projection.
// Run: node arena/prototype-3d/check-reel-legality.mjs
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {buildShip} from '../../src/tactical/ship.js';
import {createBattleFromFleets, previewOrders, stepTurn} from '../../src/tactical/resolver.js';
import {distance, shieldFacing} from '../../src/tactical/hex.js';
import {makePrng, seedFromString} from '../../src/prng.js';

const root = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const tuning = JSON.parse(read('data/tactical-tuning.json'));
const loadouts = JSON.parse(read('data/loadouts.json'));
const expected = {EAR:'laser-cannon', KRE:'blaster-beam', VRA:'heavy-blaster'};
const seed = 'pre-alpha-reel-rules-preflight';
const rng = makePrng(seedFromString(seed));
const ships = Object.keys(expected).map(f => buildShip(`${f}-FF-1`, f, 'frigate', tuning, loadouts, rng));
const [earth,krelath,vraygon] = ships;
// A mixed-faction side is only a diagnostic harness, not proposed game fiction.
Object.assign(earth, {pos:{q:-3,r:-1}, facing:0});
Object.assign(krelath, {pos:{q:3,r:0}, facing:3});
Object.assign(vraygon, {pos:{q:0,r:3}, facing:4});
const battle = createBattleFromFleets([[earth,vraygon],[krelath]], tuning, rng);
const orders = Object.fromEntries(ships.map(s => [s.id, {
  reserve:0.3, target:s===krelath?earth.id:krelath.id,
  plan:[{forward:1,turn:0},{forward:0,turn:1},{forward:0,turn:0}]
}]));
const rows = ships.map(s => {
  assert.equal(s.mounts.length,1);
  assert.equal(s.mounts[0].type,expected[s.faction]);
  assert.equal(s.mounts.filter(m=>m.kind==='missile').length,0);
  assert.equal(s.magazine,0);
  const before=rng.state, forecast=previewOrders(battle,s.id,orders[s.id]);
  assert.equal(rng.state,before,'Forecast must not consume battle randomness');
  assert.equal(distance(forecast.actions[0].start,forecast.actions[0].end),1);
  assert.equal(forecast.actions[1].end.facing,(s.facing+1)%6);
  for(const a of forecast.actions.slice(0,2)) {
    assert.ok(a.mounts.every(m=>!m.eligible&&m.reason==='Maneuver action'));
  }
  assert.ok(forecast.actions[2].mounts.some(m=>m.eligible&&m.kind==='beam'));
  return {id:s.id,beam:s.mounts[0].type,beamMaxRange:s.mounts[0].maxRange,
    faces:s.mounts[0].arc,missileMounts:0,magazine:0,
    movementPowerPerHex:s.movementPointRatio,
    actions:forecast.actions.map(a=>({round:a.round,start:a.start,end:a.end,
      power:a.power,mounts:a.mounts}))};
});
const shots=[],logs=[];
stepTurn(battle,orders,{log:m=>logs.push(m),onShot:e=>shots.push(structuredClone(e))});
assert.equal(shots.length,3);
assert.ok(shots.every(s=>s.round===3&&s.kind==='beam'));
assert.equal(battle.inFlight.length,0);
assert.ok(!logs.some(s=>/clamped|refused/.test(s)));
for(const e of shots) {
  const ship=ships.find(s=>s.id===e.shooterId),target=ships.find(s=>s.id===e.targetId),mount=ship.mounts[0];
  assert.ok(distance(ship.pos,target.pos)<=mount.maxRange);
  assert.ok(mount.arc.includes(shieldFacing(ship,target.pos)));
}
const sources=['data/loadouts.json','data/tactical-tuning.json','src/construction/legacy.js',
  'src/tactical/hex.js','src/tactical/resolver.js','src/tactical/missiles.js'];
const result={format:'pre-alpha-reel-preflight/1',status:'blocked-by-brief-conflicts',seed,
  notes:['This is a diagnostic execution, not an approved reel scenario.',
    'Advance and turn-only actions each exclude firing in their round.',
    'All three stock frigates have one beam, zero missile mounts, and zero magazine.',
    'Missile arrival is at the beginning of the next turn, never the launch round.',
    'No rules, loadouts, tuning or source models were modified.'],
  sourceHashes:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(read(p)).digest('hex')])),
  roundsPerTurn:battle.rounds,ships:rows,actualExecution:{shots,logs,inFlight:battle.inFlight.length,
    survivors:ships.map(s=>({id:s.id,destroyed:s.destroyed,superstructure:s.superstructure}))}};
const out=new URL('./evidence/pre-alpha-reel/',import.meta.url);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(new URL('legality-preflight.json',out),JSON.stringify(result,null,2)+'\n');
console.log('PASS: stock construction, preview and actual resolver agree: three beams in round 3; no missiles.');
console.log('BLOCKED: requested advance/turn/fire in one round, and missiles on these stock frigates.');
console.log(fileURLToPath(new URL('legality-preflight.json',out)));
