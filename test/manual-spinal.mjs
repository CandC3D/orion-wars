import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildShip,fullPower} from '../src/tactical/ship.js';
import {createBattleFromFleets,stepTurn} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {enableContacts} from '../src/tactical/contacts.js';
import {SENSING_PROFILE} from '../src/tactical/sensing.js';
import {captainObservation} from '../src/captains/observation.js';
import {validateOrders} from '../src/captains/orders.js';
import {previewContactOrders} from '../src/captains/preview.js';
import {advanceManualSpinal} from '../src/tactical/spinal-control.js';
import {spinalPanel} from '../arena/spinal-panel.js';
import {movementRange} from '../arena/contact-movement-range.js';
const tuning=JSON.parse(fs.readFileSync('data/tactical-tuning.json')),loadouts=JSON.parse(fs.readFileSync('data/loadouts.json'));
const idle=()=>({turn:0,forward:0});
const order=(spinal,plan=[idle(),idle(),idle()])=>({plan,target:'B-target',reserve:.3,...(spinal?{spinal}:{})});
function world(gap=10){
  const t=structuredClone(tuning),rng=makePrng(712);t.explosion.enabled=false;
  const a=buildShip('A-gunstar','EAR','gunstar-battlecruiser',t,loadouts,rng),b=buildShip('B-target','KRE','battleship',t,loadouts,rng);
  a.pos={q:0,r:0};a.facing=0;a.mounts=a.mounts.filter(m=>m.kind==='spinal');
  b.pos={q:gap,r:0};b.facing=3;b.mounts=[];b.superstructure=b.superstructureMax=10000;
  const battle=createBattleFromFleets([[a],[b]],t,rng,{maxTurns:20,terrain:[]});enableContacts(battle,{profile:SENSING_PROFILE});
  return {a,b,battle};
}
function run(w,o){const shots=[],log=[];stepTurn(w.battle,{[w.a.id]:o,[w.b.id]:{plan:[idle(),idle(),idle()],target:'auto',reserve:1}},{onShot:e=>shots.push(e),log:s=>log.push(s)});return {shots,log};}
let groups=0;const check=(name,fn)=>{fn();console.log('PASS '+name);groups++;};
check('cold near enemy stays mobile; preview and execution agree',()=>{
  const w=world(),o=order(null,[{turn:0,forward:2},idle(),idle()]);
  const view=captainObservation(w.battle,'A'),p=previewContactOrders(view,w.a.id,o);
  run(w,o);assert.equal(w.a.spinal.charge,0);assert.deepEqual(w.a.pos,{q:2,r:0});
  assert.deepEqual(p.actions[2].end,{...w.a.pos,facing:w.a.facing});assert.equal(p.actions[2].powerCeiling,w.a.power);
});
check('explicit charge works without proximity; cold omission does not',()=>{
  const w=world(30),o={...order('charge'),target:'auto'},v=captainObservation(w.battle,'A');
  const p=previewContactOrders(v,w.a.id,o);run(w,o);
  assert.equal(w.a.spinal.charge,20);assert.equal(w.a.power,fullPower(w.a)-20);assert.equal(w.a.reserve,Math.round(w.a.power*.3));
  assert.deepEqual(w.a.pos,{q:0,r:0});assert.equal(p.actions[2].powerCeiling,w.a.power);
});
check('one preparation continues, fires once at readiness, cools without rearming',()=>{
  const w=world();let shots=[];
  for(let i=0;i<4;i++)shots.push(...run(w,order(i===0?'charge':null)).shots);
  assert.equal(shots.filter(s=>s.kind==='spinal').length,1);assert.equal(w.a.spinal.charge,0);assert.equal(w.a.spinal.cooldown,2);
  for(let i=0;i<4;i++)assert.equal(run(w,order()).shots.length,0);
  assert.equal(w.a.spinal.charge,0);assert.equal(w.a.spinal.state,'charging');
});
check('charging prevents translation but allows turning; no hold-cold exploit',()=>{
  const w=world();run(w,order('charge'));run(w,order(null,[{turn:1,forward:2},idle(),idle()]));
  assert.deepEqual(w.a.pos,{q:0,r:0});assert.equal(w.a.facing,1);assert.equal(w.a.spinal.charge,40);
});
check('abort before action 1 allows turning away from a moon and movement; preview matches',()=>{
  const w=world();run(w,order('charge'));w.battle.terrain=w.battle.tuning.battle.terrain=[{type:'moon',q:1,r:0}];
  const o={...order('vent',[{turn:1,forward:1},idle(),idle()]),target:'auto'};
  const v=captainObservation(w.battle,'A'),p=previewContactOrders(v,w.a.id,o);run(w,o);
  assert.equal(w.a.spinal.charge,0);assert.equal(w.a.spinal.cooldown,2);assert.equal(w.a.spinal.state,'cooldown');
  assert.deepEqual(w.a.pos,{q:1,r:-1});assert.deepEqual(p.actions[2].end,{...w.a.pos,facing:w.a.facing});assert.equal(p.actions[2].powerCeiling,w.a.power);
});
check('repeated vent while cooling does not restart cooldown; cold vent has no cost',()=>{
  const w=world();run(w,order('vent'));assert.equal(w.a.power,fullPower(w.a));
  run(w,order('charge'));run(w,order('vent'));run(w,order('vent'));assert.equal(w.a.spinal.cooldown,1);
  run(w,order('charge'));assert.equal(w.a.spinal.cooldown,0);assert.equal(w.a.spinal.charge,0);
});
check('ready hold and vent costs, insufficient power, offline bank reset',()=>{
  const w=world(),weapon=w.a.mounts[0].weapon??tuning.weapons[w.a.spinal.type];
  w.a.spinal.state='ready';w.a.spinal.charge=80;w.a.power=63;advanceManualSpinal(w.a,weapon);
  assert.equal(w.a.power,59);advanceManualSpinal(w.a,weapon,'vent');assert.equal(w.a.power,59);assert.equal(w.a.spinal.cooldown,2);
  w.a.spinal.state='charging';w.a.power=3;advanceManualSpinal(w.a,weapon,'charge');assert.equal(w.a.spinal.charge,3);assert.equal(w.a.power,0);
  w.a.mounts[0].inop=true;advanceManualSpinal(w.a,weapon);assert.equal(w.a.spinal.charge,0);assert.equal(w.a.spinal.state,'wrecked');
});
check('strict validator preserves intent and rejects malformed whole decisions; direct refusal atomic',()=>{
  const w=world(),v=captainObservation(w.battle,'A');
  for(const intent of ['charge','vent'])assert.equal(validateOrders(v,{[w.a.id]:order(intent)}).orders[w.a.id].spinal,intent);
  for(const intent of [false,true,'auto','hold-cold',0,null,{},['charge']]){
    const o={...order(),spinal:intent};assert.equal(validateOrders(v,{[w.a.id]:o}).ok,false);
    const before=JSON.stringify(w.battle);assert.throws(()=>run(w,o),/Invalid spinal/);assert.equal(JSON.stringify(w.battle),before);
  }
  const enemy=captainObservation(w.battle,'B');assert.equal(validateOrders(enemy,{[w.b.id]:{...order('charge'),target:'auto'}}).ok,false);
});
check('own-only indicators distinguish cold, active, queued abort and history-safe source values',()=>{
  const w=world(),v=captainObservation(w.battle,'A'),s=v.own[0],before=JSON.stringify(v);
  assert.match(spinalPanel(s,order(),v,true),/MOBILE.*COLD/);
  assert.ok(movementRange(s,.3,undefined,true).hexes>0);
  assert.equal(movementRange(s,.3,'charge',true).hexes,0);
  run(w,order('charge'));const a=captainObservation(w.battle,'A');
  assert.match(spinalPanel(a.own[0],order('vent'),a,true),/IMMOBILE.*CHARGING/);
  assert.match(spinalPanel(a.own[0],order('vent'),a,true),/all charge lost/);
  assert.ok(movementRange(a.own[0],.3,'vent',true).hexes>0);assert.equal(JSON.stringify(v),before);
});
console.log(`${groups} groups passed`);
