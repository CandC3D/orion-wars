// Per-mount reasons against the preferred contact, over a REAL restricted
// observation. Proves the console's reason agrees with the engine's own
// geometry and never reads a field the observation does not carry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {enableContacts} from '../src/tactical/contacts.js';
import {SENSING_PROFILE} from '../src/tactical/sensing.js';
import {captainObservation} from '../src/captains/observation.js';
import {fireSolution,batterySolutions,shotCost,tuningFromObservation} from '../arena/fire-solution.js';
const tuning=JSON.parse(fs.readFileSync('data/tactical-tuning.json')),loadouts=JSON.parse(fs.readFileSync('data/loadouts.json'));
let groups=0;const check=(name,fn)=>{fn();console.log('PASS '+name);groups++;};

function world({gap=6,facing=0,terrain=[]}={}){
  const t=structuredClone(tuning),rng=makePrng(9);t.explosion.enabled=false;
  const a=buildShip('A-1','EAR','heavy-cruiser',t,loadouts,rng),b=buildShip('B-1','KRE','battleship',t,loadouts,rng);
  a.pos={q:0,r:0};a.facing=facing;b.pos={q:gap,r:0};b.facing=3;
  const battle=createBattleFromFleets([[a],[b]],t,rng,{maxTurns:12,terrain});
  enableContacts(battle,{profile:SENSING_PROFILE});
  const view=captainObservation(battle,'A');
  return {view,own:view.own[0],contact:view.contacts[0]};
}

check('a contact dead ahead and in range bears on a forward mount',()=>{
  const {view,own,contact}=world({gap:6,facing:0});
  assert.ok(contact,'the battleship must be a current report');
  const forward=own.mounts.find(m=>m.kind==='beam'&&m.arc.includes(2));
  assert.ok(forward,'a forward-bearing beam');
  const f=fireSolution(own,forward,contact,view,999);
  assert.equal(f.state,'bears');assert.equal(f.short,'TARGET LOCKED');assert.equal(f.locked,true);assert.equal(f.target,contact.id);assert.match(f.full,/current position/);
  assert.match(f.full,/not a guaranteed hit/);
});

check('a contact outside the arc reports NO ARC, in the engine\'s own words',()=>{
  const {view,own,contact}=world({gap:6,facing:3});   // stern-on
  const forwardOnly=own.mounts.find(m=>m.kind==='beam'&&!m.arc.includes(5)&&!m.arc.includes(4));
  assert.ok(forwardOnly,'the heavy cruiser must carry a beam with no aft bearing');
  const f=fireSolution(own,forwardOnly,contact,view,999);
  assert.equal(f.short,'NO ARC');assert.equal(f.full,'Outside bearing arc');assert.equal(f.state,'blocked');
});

check('a contact beyond reach reports RANGE',()=>{
  const {view,own,contact}=world({gap:20,facing:0});
  assert.ok(contact,'20 hexes is inside passive sensing, so there is a contact to ask about');
  const beam=own.mounts.find(m=>m.kind==='beam'&&m.arc.includes(2));
  assert.ok(beam.maxRange<20,`the beam must fall short: reach ${beam.maxRange}`);
  const f=fireSolution(own,beam,contact,view,999);
  assert.equal(f.short,'RANGE');assert.equal(f.full,'Out of range');
});

check('no preferred target yields no annotation at all',()=>{
  const {view,own}=world();
  const f=fireSolution(own,own.mounts[0],null,view,999);
  assert.equal(f.short,'');assert.equal(f.state,'none');
});

check('readiness beats geometry: a spent mount says so before any arc test',()=>{
  const {view,own,contact}=world({gap:6,facing:0});
  const beam=structuredClone(own.mounts.find(m=>m.kind==='beam'));beam.firedThisTurn=true;
  assert.equal(fireSolution(own,beam,contact,view,999).short,'FIRED');
  const dead=structuredClone(beam);dead.firedThisTurn=false;dead.inop=true;
  assert.equal(fireSolution(own,dead,contact,view,999).short,'OFFLINE');
});

check('shot cost follows the engine: beam floor 1, tube powerToArm, cannon firePower',()=>{
  const {own}=world();
  for(const m of own.mounts){
    const need=shotCost(m);
    if(m.kind==='beam')assert.equal(need,1);
    else if(m.kind==='spinal')assert.equal(need,m.weapon.firePower??0);
    else assert.equal(need,m.weapon.powerToArm??0);
  }
});

check('POWER appears only when the plan cannot afford one shot',()=>{
  const {view,own,contact}=world({gap:6,facing:0});
  const beam=own.mounts.find(m=>m.kind==='beam'&&m.arc.includes(2));
  assert.equal(fireSolution(own,beam,contact,view,1).state,'bears');   // exactly affordable
  const poor=fireSolution(own,beam,contact,view,0);
  assert.equal(poor.short,'POWER');assert.match(poor.full,/one shot needs 1 P/);
  assert.equal(fireSolution(own,beam,contact,view,null).state,'bears'); // no budget given, no power claim
});

check('the tuning rebuilt for geometry carries only observation-derived fields',()=>{
  const {view}=world();
  const t=tuningFromObservation(view);
  assert.deepEqual(Object.keys(t),['battle']);
  assert.deepEqual(new Set(Object.keys(t.battle)),new Set(['map','mapRadiusHexes','terrain','terrainRules','sameHexNoFire']));
  assert.deepEqual(t.battle.terrain,view.terrain);
  assert.equal(t.battle.sameHexNoFire,view.rules.movement.sameHexNoFire);
});

check('the whole battery resolves, one entry per mount, never throwing',()=>{
  const {view,own,contact}=world({gap:6,facing:0});
  const all=batterySolutions(own,contact,view,999);
  assert.equal(all.size,own.mounts.length);
  for(const m of own.mounts)assert.ok(all.get(m.id).short.length>0);
  assert.equal(batterySolutions({...own,destroyed:true},contact,view,999).size,0);
});

console.log(`Fire solution: ${groups} groups passed.`);
