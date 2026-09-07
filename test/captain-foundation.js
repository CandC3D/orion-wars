import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePrng } from '../src/prng.js';
import { buildShip, fullPower, shieldCost, shieldCapacity, weaponFor } from '../src/tactical/ship.js';
import { createBattleFromFleets, createBattle, stepTurn } from '../src/tactical/resolver.js';
import { enableContacts, sideContacts, grantScanContact, loseContact } from '../src/tactical/contacts.js';
import { stockPack, upgradeEngineering } from '../src/construction/index.js';
import { captainObservation, sideView } from '../src/captains/observation.js';
import { jsonCopy, canonicalJSON } from '../src/captains/json.js';
import { allHoldOrders, validateOrders, acceptDecision } from '../src/captains/orders.js';
import { createTrustedSession, stepTrusted, executePacket, fullState } from '../src/captains/trusted.js';
import { holdCaptain, approachCaptain } from '../src/captains/fixtures.js';
import { compFor, compositionCost, SCALES, STANDARD, sixthFor } from './comp.js';

const t = JSON.parse(readFileSync(new URL('../data/tactical-tuning.json', import.meta.url)));
const l = JSON.parse(readFileSync(new URL('../data/loadouts.json', import.meta.url)));
const clone = structuredClone;
let count = 0;
function check(name, fn) { fn(); count++; console.log(`ok ${count}: ${name}`); }
function pair(faction = 'EAR', className = 'destroyer', pack = null) {
  const a = buildShip('A-one', faction, className, t, l, makePrng(1), pack);
  const b = buildShip('B-one', 'EAR', 'destroyer', t, l, makePrng(1));
  a.pos = { q: -12, r: 0 }; b.pos = { q: 12, r: 0 }; b.facing = 3;
  const battle = createBattleFromFleets([[a], [b]], clone(t), makePrng(123), { maxTurns: 4 });
  enableContacts(battle);
  return battle;
}

check('all real factions/scales are cost-neutral; VRA option A is exactly 52', () => {
  for (const faction of ['EAR','VRA','ZAN','KRE']) for (const [price, comp] of Object.entries(SCALES)) {
    assert.equal(compositionCost(compFor(faction, comp, t), t), Number(price));
    assert.equal(compositionCost(compFor(faction, comp, t, [faction]), t), Number(price));
  }
  assert.deepEqual(compFor('VRA', STANDARD, t), { 'light-cruiser': 2, destroyer: 2, monitor: 1 });
  for (const spec of Object.values(sixthFor(t))) for (const o of spec.options ?? []) assert.equal(o.cost, t.hullClasses[o.hull].points);
  assert.throws(() => compFor('_note', STANDARD, t));
});
check('caller repricing, floors, limits and historical opt-in fail closed', () => {
  for (const [faction, hull] of [['VRA','monitor'], ['ZAN','corvette'], ['EAR','gunstar-battlecruiser'], ['KRE','carrier']]) {
    const changed = clone(t); changed.hullClasses[hull].points += 2;
    assert.throws(() => compFor(faction, STANDARD, changed), /Non-neutral/);
  }
  const changed = clone(t); changed.hullClasses.monitor.minFleetPoints = 100;
  assert.equal(compFor('VRA', STANDARD, changed).monitor, undefined);
  assert.throws(() => compFor('VRA', { monitor: 2, frigate: 2 }, t, ['VRA']), /limit/);
  assert.throws(() => compFor('KRE', { 'heavy-cruiser': 1 }, t, null, { policy: 'carrier' }), /requires/);
  assert.deepEqual(compFor('KRE', { 'heavy-cruiser': 1 }, t, null, { policy: 'carrier', historicalFloorOverride: true }), { carrier: 1 });
  assert.throws(() => compositionCost({ frigate: -1 }, t));
});
check('all 29 V1 and V2 hulls expose accurate own weapons, reactors and six shields', () => {
  let hulls = 0;
  for (const f of ['EAR','VRA','ZAN','KRE']) for (const c of t.rosters[f]) {
    hulls++;
    for (const pack of [null, stockPack(f,c,t,l), upgradeEngineering(stockPack(f,c,t,l),t)]) {
      const b = pair(f,c,pack), original = clone(b.A[0]), rng = b.rng.state;
      const view = captainObservation(b,'A'), own = view.own[0], live = b.A[0];
      assert.equal(own.fullPower, fullPower(live));
      for (const m of live.mounts) {
        const shown = own.mounts.find(x => x.id === m.id); assert.ok(shown);
        assert.deepEqual(shown.bands, m.bands); assert.deepEqual(shown.arc, m.arc);
        assert.equal(shown.maxRange, m.maxRange);
        for (const [k,v] of Object.entries(shown.weapon)) assert.deepEqual(v, weaponFor(live,m.type,t)[k]);
      }
      for (const sh of own.shields) { assert.equal(sh.capacity, shieldCapacity(live,sh.face)); assert.equal(sh.powerPerDamage, shieldCost(live,sh.face)); }
      assert.deepEqual(own.cores.map(x => [x.power,x.alive]), live.cores.map(x => [x.power,x.alive]));
      assert.deepEqual(b.A[0], original); assert.equal(b.rng.state, rng);
      assert.ok(Object.isFrozen(own.shields)); assert.notEqual(own.pos, live.pos);
    }
  }
  assert.equal(hulls,29);
});
check('hidden worlds serialize identically; no raw battle, pack, objectives or RNG', () => {
  const b = pair(), enemy = b.B[0]; enemy.cloaked = true; enemy.detected = true;
  const before = canonicalJSON(captainObservation(b,'A'));
  enemy.power = 999; enemy.reserve = 500; enemy.pos = { q: 18, r: 4 }; enemy.facing = 5;
  enemy.systems.sensors = 99; enemy.magazine = 31; enemy.design = { secret: 'do-not-leak' };
  b.victory = { secret: 'objective' }; b.seed = 'private'; b.rng.state = 42;
  assert.equal(canonicalJSON(captainObservation(b,'A')), before);
  enemy.cloaked = false; enemy.superstructure = enemy.superstructureMax;
  const contact = captainObservation(b,'A').contacts[0];
  assert.deepEqual(Object.keys(contact).sort(), ['className','facing','faction','id','observedDamage','pos']);
  assert.equal(captainObservation, sideView);
});
check('contacts belong to observer; sensors/damage, scan, loss, destruction and public terrain', () => {
  const b = pair(); b.A[0].hull = { ...b.A[0].hull, sensorRating: 3 };
  b.B[0].cloaked = true; b.B[0].detected = true; // legacy flag alone is NOT a contact
  assert.equal(sideContacts(b,'A').length, 0);
  grantScanContact(b,b.A[0],b.B[0]); assert.equal(sideContacts(b,'A').length, 1);
  assert.deepEqual(b.contacts.locks.B, []);
  assert.equal(sideContacts(b,'A')[0].observedDamage.detail, 'interval');
  b.A[0].hull.sensorRating = 2; assert.equal(sideContacts(b,'A')[0].observedDamage.detail,'bracket');
  b.A[0].hull.sensorRating = 1; assert.equal(sideContacts(b,'A')[0].observedDamage.detail,'condition');
  b.A[0].systems.sensors = t.damage.systemHitsToInoperative; assert.equal(sideContacts(b,'A').length,0);
  b.A[0].systems.sensors = 0; loseContact(b,b.B[0]); assert.equal(sideContacts(b,'A').length,0);
  b.B[0].cloaked = false; b.B[0].destroyed = true; assert.equal(sideContacts(b,'A').length,0);
  b.terrain = [{ type:'nebula',q:1,r:2,secret:'not-a-terrain-field' }];
  assert.deepEqual(captainObservation(b,'A').terrain,[{ type:'nebula',q:1,r:2 }]);
});
check('real engine scan and evade hooks acquire and revoke an observer lock', () => {
  const b = pair(); b.A[0].hull = { ...b.A[0].hull, sensorRating: 2 }; b.A[0].mounts = [];
  b.B[0].pos = { q:-10,r:0 }; b.B[0].cloaked = true; b.B[0].detected = false;
  // Pin the hidden ship in the decloaking phase so it cannot move before scan.
  b.B[0].decloaking = true; b.tuning.cloak.evadeChance = 0;
  const a = allHoldOrders(captainObservation(b,'A')), other = allHoldOrders(captainObservation(b,'B'));
  const log = []; stepTurn(b,{ ...a,...other },{ log:m=>log.push(m) });
  assert.ok(log.some(x => x.includes('contact(s)'))); assert.ok(b.contacts.locks.A.includes('B-one'));
  b.B[0].cloaked = true; b.B[0].decloaking = true; b.B[0].detected = true;
  b.A[0].hull.sensorRating = 0; b.tuning.cloak.evadeChance = 1;
  stepTurn(b,{ ...a,...other }); assert.deepEqual(b.contacts.locks.A,[]);
});
check('empty/partial orders always cover every own living ship with fixed reserve', () => {
  const b = pair(); const second = clone(b.A[0]); second.id = 'A-two'; b.A.push(second);
  const o = captainObservation(b,'A');
  for (const packet of [{}, { 'A-one': allHoldOrders(o)['A-one'] }]) {
    const result = validateOrders(o,packet); assert.equal(result.ok,true);
    assert.deepEqual(Object.keys(result.orders),['A-one','A-two']);
    assert.equal(result.orders['A-two'].reserve,0.3); assert.equal(result.orders['A-two'].plan.length,3);
  }
});
check('resource clamp is recorded; structural and hidden-target violations are atomic', () => {
  const o = captainObservation(pair(),'A'), packet = allHoldOrders(o);
  packet['A-one'].reserve = 9; packet['A-one'].plan[0] = { turn:999,forward:99999 };
  packet['A-one'].plan[1].forward = -5;
  const v = validateOrders(o,packet); assert.equal(v.ok,true); assert.equal(v.adjustments.length,4);
  assert.equal(v.orders['A-one'].reserve,1); assert.equal(v.orders['A-one'].plan[1].forward,0);
  const invalid = [p=>p['A-one'].plan.pop(),p=>p['B-one']=p['A-one'],p=>p['A-one'].extra=1,
    p=>p['A-one'].plan[0].turn=0.5,p=>p['A-one'].plan[0].forward='3',p=>p['A-one'].reserve=NaN,
    p=>p['A-one'].target='hidden',p=>p['A-one'].plan[0].forward=Infinity,p=>delete p['A-one'].target];
  for (const mutate of invalid) { const p = allHoldOrders(o); mutate(p); const result = validateOrders(o,p);
    assert.equal(result.ok,false); assert.deepEqual(result.orders,allHoldOrders(o)); }
});
check('strict JSON rejects coercion, getters, cycles, sparse arrays, pollution and byte overflow', () => {
  const cyclic = {}; cyclic.self=cyclic;
  let reads = 0; const accessor = {}; Object.defineProperty(accessor,'x',{enumerable:true,get(){reads++;return 1;}});
  for (const v of [undefined,NaN,Infinity,()=>0,1n,Symbol(),new Date(),cyclic,accessor,Array(2),
    JSON.parse('{"__proto__":{"polluted":true}}'), {toJSON(){return null;}}, '船'.repeat(30000)]) assert.throws(()=>jsonCopy(v));
  assert.equal(reads,0); assert.equal({}.polluted,undefined);
  const shared = {x:1}; assert.deepEqual(jsonCopy([shared,shared]),[{x:1},{x:1}]);
  const memory = { turns:1 }, o = captainObservation(pair(),'A');
  assert.deepEqual(acceptDecision(o,null,memory).memory,memory); assert.equal(Object.isFrozen(memory),false);
});
check('resource exhaustion is clamped at real execution, not against stale residual power', () => {
  const b = pair(); b.A[0].power=0;
  const view = captainObservation(b,'A'), p = allHoldOrders(view);
  p['A-one'].reserve=0; p['A-one'].plan[0].forward=100;
  const v = validateOrders(view,p); assert.equal(v.ok,true); assert.equal(v.orders['A-one'].plan[0].forward,100);
  const log=[]; stepTurn(b,{...v.orders,...allHoldOrders(captainObservation(b,'B'))},{log:m=>log.push(m)});
  assert.ok(b.A[0].movedThisTurn>0); assert.ok(b.A[0].power>=0);
  assert.ok(log.some(m=>m.includes('order clamped: power exhausted')));
});
check('null/throw/mutating controllers fault to hold, retaining isolated memory', () => {
  for (const controller of [()=>null,()=>{throw Error('private');},v=>{v.own[0].pos.q=9;}]) {
    const b=pair(), session=createTrustedSession(b,{A:controller,B:holdCaptain}), start=clone(b.A[0].pos);
    const result=stepTrusted(session); assert.equal(result.packet.decisions.A.ok,false);
    assert.deepEqual(b.A[0].pos,start); assert.equal(session.memory.A,null);
  }
  assert.throws(()=>createTrustedSession(pair('KRE'),{A:holdCaptain,B:holdCaptain}),/parity/);
});
check('both observations precede decisions; accepted packets reproduce full state/RNG/events every turn', () => {
  for (let seed=1;seed<=8;seed++) {
    const b=pair(), replay=pair(); b.rng.state=replay.rng.state=seed;
    let observedB;
    const session=createTrustedSession(b,{A:approachCaptain,B:(v,m)=>{observedB=v;return holdCaptain(v,m);}});
    while(!b.done) {
      const before=canonicalJSON(captainObservation(b,'B'));
      const run=stepTrusted(session); assert.equal(canonicalJSON(observedB),before);
      const rerun=executePacket(replay,clone(run.packet));
      assert.deepEqual(rerun.state,run.state); assert.deepEqual(rerun.shots,run.shots);
      assert.deepEqual(rerun.log,run.log); assert.deepEqual(rerun.frames,run.frames);
    }
  }
});
check('corrupt packet resimulation fails before changing either side', () => {
  const b=pair(), before=fullState(b), view=captainObservation(b,'A'), other=captainObservation(b,'B');
  const packet={turn:b.turn,decisions:{A:{orders:allHoldOrders(view)},B:{orders:allHoldOrders(other)}}};
  delete packet.decisions.A.orders['A-one'];
  assert.throws(()=>executePacket(b,packet),/Corrupt/); assert.deepEqual(fullState(b),before);
});
check('contact tracking does not alter combat or consume RNG (12 seeded full-state controls)', () => {
  for(let seed=1;seed<=12;seed++) {
    const a=pair(),b=pair(); delete a.contacts; a.rng.state=b.rng.state=seed;
    while(!a.done) {
      stepTurn(a); stepTurn(b);
      const old=fullState(a),tracked=fullState(b); delete old.contacts; delete tracked.contacts;
      assert.deepEqual(tracked,old);
    }
  }
});
console.log(`Captain foundation: ${count} groups passed.`);
