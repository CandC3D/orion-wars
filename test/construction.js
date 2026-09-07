import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stockPack, compileDesign, forkPack, validatePack, parsePack, stockWeapons, weaponKey, copy } from '../src/construction/index.js';
import { buildShip, applyDamage, weaponFor } from '../src/tactical/ship.js';
import { createBattle, previewOrders, stepTurn, battleView } from '../src/tactical/resolver.js';
import { makePrng } from '../src/prng.js';
import { faceFor, DIRS } from '../src/tactical/hex.js';
import { validateScenario, scenarioForSave, fleetPoints } from '../arena/editor-core.js';
import { recordScenario, createPlayRecord } from '../arena/record.js';
import { history, nextRevision, trialScenario, engineering } from '../drydock/model.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json');
let count=0;const check=(name,fn)=>{fn();count++;console.log(`ok: ${name}`);};
const stock=()=>stockPack('EAR','light-cruiser',t,l),variant=()=>forkPack(stock(),'local:fixture');
const source=JSON.stringify({t,l});
check('29 legacy combinations compile to equivalent effective engineering and mounts',()=>{
  for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of t.rosters[faction]){
    const p=stockPack(faction,cls,t,l),a=buildShip('test-1',faction,cls,t,l,makePrng(1)),s=compileDesign(p,t);
    assert.deepEqual(validatePack(p,t),[]);
    for(const k of ['superstructure','magazine','canCloak','shieldPointRatio','movementPointRatio','detectionBonusAgainst'])assert.deepEqual(s[k],a[k],`${faction}/${cls}/${k}`);
    assert.equal(s.mounts.length,a.mounts.length);
    s.mounts.forEach((m,i)=>{for(const k of ['arc','kind','maxRange','bands'])assert.deepEqual(m[k],a.mounts[i][k]);assert.deepEqual(s.weaponDefinitions[m.type],JSON.parse(JSON.stringify(t.weapons[a.mounts[i].type],(k,v)=>k.startsWith('_')||['overcharge','interceptable'].includes(k)?undefined:v)));});
  }
});
check('stock normalization and compiler never mutate tuning or loadouts',()=>assert.equal(JSON.stringify({t,l}),source));
check('all 29 compiled hulls can launch legal trials and finish two engine turns',()=>{
  for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of t.rosters[faction]){
    const p=forkPack(stockPack(faction,cls,t,l),`local:${faction.toLowerCase()}:${cls}`),s=trialScenario(p,t),b=createBattle(s,t,l,7);
    assert.deepEqual(validateScenario(s,t,l),[]);stepTurn(b,{});stepTurn(b,{});assert.ok(b.turn>=2);assert.ok(b.fleets.flat().every(x=>Number.isFinite(x.power)));
  }
});
check('two same-class variants, mixed beam types, 9 explicit mounts and disconnected arcs',()=>{
  const p=variant(),w=stockWeapons(t).find(w=>w.id==='stock:heavy-blaster');p.weapons.push(w);
  p.design.mounts[1].weapon={id:w.id,revision:w.revision};p.design.mounts[1].faces=[1,4];
  while(p.design.mounts.length<9)p.design.mounts.push({...copy(p.design.mounts[1]),id:`extra-${p.design.mounts.length}`});
  const b=copy(p);b.design.id='local:second';b.design.hull.corePower=50;b.design.name='Second';
  const scenario=trialScenario(p,t);scenario.sides[0].ships.push({className:p.design.className,designPack:b,q:20,r:24});
  const battle=createBattle(scenario,t,l,'twins');const a=battle.A.find(s=>s.designId===p.design.id),c=battle.A.find(s=>s.designId===b.design.id);
  assert.equal(a.mounts.length,9);assert.deepEqual(a.mounts[1].arc,[1,4]);assert.notEqual(a.mounts[0].type,a.mounts[1].type);assert.notEqual(a.power,c.power);assert.equal(a.className,c.className);assert.notEqual(a.id,c.id);
  assert.equal(fleetPoints(scenario.sides[0],t),p.design.hull.points+b.design.hull.points);
});
check('designer output, shield limits, movement efficiency and turns reach actual runtime',()=>{
  const p=variant();Object.assign(p.design.hull,{cores:3,corePower:17,impulsePower:5,maxShieldPower:18,shieldPointRatio:.25,movementPointRatio:1});p.design.turnRate=1;
  const {ship,forecast,shieldAbsorbable}=engineering(p,t,l,{move:3,reserve:0});assert.equal(ship.power,56);assert.equal(ship.shieldCap[4],18);assert.equal(ship.shieldPointRatio,.25);assert.equal(forecast.movement,3);assert.equal(shieldAbsorbable,18);
  const b=createBattle(trialScenario(p,t),t,l,1);const id=b.A[0].id;const f=previewOrders(b,id,{reserve:0,target:'auto',plan:[{turn:3,forward:1},{turn:0,forward:0},{turn:0,forward:0}]});assert.equal(f.actions[0].end.facing,1);assert.equal(battleView(b).ships.find(s=>s.id===id).turnRate,1);
});
check('custom component power is spent by engine and forecast, not editor-only math',()=>{
  const p=variant(),w=copy(p.weapons[0]);w.id='local:beam';w.name='Needle';w.spec.maxPower=2;p.weapons.push(w);p.design.mounts=[{...p.design.mounts[0],weapon:{id:w.id,revision:1},faces:[2]}];
  const scenario=trialScenario(p,t),b=createBattle(scenario,t,l,1),a=b.A[0];const o={reserve:0,target:b.B[0].id,plan:Array.from({length:3},()=>({turn:0,forward:0}))};
  const f=previewOrders(b,a.id,o);assert.equal(f.weapons,2);b.B[0].mounts.forEach(m=>m.inop=true);const shots=[];stepTurn(b,{[a.id]:o,[b.B[0].id]:o},{onShot:e=>shots.push(e)});assert.equal(a.mounts[0].firedThisTurn,true);assert.equal(a.power,a.cores.reduce((n,c)=>n+c.power,0)+a.impulse-2);assert.ok(shots.some(e=>e.weapon==='local:beam@1'));
});
check('all 36 heading / face pairs use explicit authored arcs',()=>{
  const p=variant();p.design.mounts=[{...p.design.mounts[0],faces:[1,4]}];
  for(let heading=0;heading<6;heading++)for(let direction=0;direction<6;direction++){
    const s=trialScenario(p,t),a=s.sides[0].ships[0],b=s.sides[1].ships[0];a.facing=heading;b.q=a.q+DIRS[direction].q*4;b.r=a.r+DIRS[direction].r*4;
    const battle=createBattle(s,t,l,1),ship=battle.A[0];const f=previewOrders(battle,ship.id,{reserve:0,target:battle.B[0].id,plan:Array.from({length:3},()=>({turn:0,forward:0}))});
    assert.equal(f.actions[0].mounts[0].eligible,[1,4].includes(faceFor(heading,direction)));
  }
});
check('component edits, runtime damage and ammo do not change saved designs or old battles',()=>{
  const p=variant(),before=JSON.stringify(p),scenario=trialScenario(p,t),b=createBattle(scenario,t,l,1),s=b.A[0];
  p.weapons[0].spec.maxPower=99;assert.notEqual(weaponFor(s,s.mounts[0].type,t).maxPower,99);
  s.magazine--;s.mounts[0].inop=true;s.cores[0].alive=false;applyDamage(s,2,5,t,makePrng(1));
  assert.equal(JSON.stringify(s.design),before);assert.equal(JSON.stringify(scenario.sides[0].ships[0].designPack),before);
});
check('scenario save and replay pin entire custom content through future catalogue changes',()=>{
  const p=variant();p.design.name='Pinned experiment';const scenario=trialScenario(p,t);assert.deepEqual(validateScenario(scenario,t,l),[]);assert.deepEqual(scenarioForSave(scenario).sides[0].ships[0].designPack,p);
  scenario.maxTurns=2;const r=recordScenario(scenario,t,l);assert.deepEqual(r.meta.scenario.sides[0].ships[0].designPack,p);for(const frame of r.rounds)assert.deepEqual(frame.ships.find(s=>s.designId===p.design.id).design,p);
  const b=createBattle(scenario,t,l,1),record=createPlayRecord(scenario,battleView(b));assert.deepEqual(record.rounds[0].ships.find(s=>s.designId===p.design.id).design,p);
  assert.deepEqual(record.rounds[0].ships.find(s=>s.designId===p.design.id).mounts[0].position,p.design.mounts[0].position);
});
check('export/import roundtrip plus removal undo/redo preserve IDs and pinned components',()=>{
  const p=variant(),h=history(p),next=copy(p);next.design.mounts.splice(0,1);h.change(next);h.undo();assert.deepEqual(h.pack,p);h.redo();assert.deepEqual(h.pack,next);assert.deepEqual(parsePack(JSON.stringify(p),t),p);
  const saved=nextRevision(p,[]),second=nextRevision(p,[saved]);assert.equal(saved.design.revision,1);assert.equal(second.design.revision,2);assert.equal(p.design.revision,1);
});
check('invalid and hostile packs fail closed at import, editor and simulation boundaries',()=>{
  const mutations=[p=>p.version=2,p=>p.design.hull.corePower=-1,p=>p.design.hull.corePower=Infinity,p=>p.design.hull.cores=2.5,
    p=>p.design.hull.shieldPointRatio=0,p=>p.design.mounts[0].faces=[7],p=>p.design.mounts[0].faces=[],p=>p.design.mounts[0].faces=[2,2],
    p=>p.design.mounts[0].position.x=NaN,p=>p.design.mounts.push(copy(p.design.mounts[0])),p=>p.weapons.push(copy(p.weapons[0])),p=>p.weapons=[],
    p=>p.weapons[0].spec.script='alert(1)',p=>p.design.assetUrl='https://example.com/model.glb',p=>p.weapons[0].spec.rangeBands[0].to=100,
    p=>p.design.mounts[0].weapon.revision=777,p=>p.design.className='fake-hull'];
  for(const mutate of mutations){const p=variant();mutate(p);assert.ok(validatePack(p,t).length);assert.throws(()=>compileDesign(p,t));assert.throws(()=>parsePack(JSON.stringify(p),t));const scenario=trialScenario(variant(),t);scenario.sides[0].ships[0].designPack=p;assert.ok(validateScenario(scenario,t,l).length);assert.throws(()=>createBattle(scenario,t,l,1));}
  const malicious=JSON.stringify(variant()).replace('"format":','"__proto__":{"polluted":true},"format":');assert.throws(()=>parsePack(malicious,t));assert.equal({}.polluted,undefined);
  const mismatch=trialScenario(variant(),t);mismatch.sides[0].faction='KRE';assert.throws(()=>createBattle(mismatch,t,l,1));
});
check('stock files still untouched after all construction tests',()=>assert.equal(JSON.stringify({t,l}),source));
console.log(`Construction checks passed: ${count} groups (29 hulls, 36 face cases, 17 hostile/invalid mutations).`);
