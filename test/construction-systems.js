import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,stockSystems,upgradeEngineering,compileDesign,validatePack,parsePack,copy,forkPack} from '../src/construction/index.js';
import {buildShip,applyDamage,startRound,startTurn,fullPower,ratedPower,shieldAbsorbable} from '../src/tactical/ship.js';
import {createBattle,stepTurn,battleView,previewOrders} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {trialScenario,engineering,history} from '../drydock/model.js';
import {shields} from '../arena/command-model.js';
import {recordScenario,snapshotShip,createPlayRecord} from '../arena/record.js';
import {validateScenario,scenarioForSave} from '../arena/editor-core.js';
import {appendRevision,readLibrary,pinStockRevisions,stockChanges,LIBRARY_KEY} from '../src/construction/stock-library.js';
import {systemsCatalogue} from '../drydock/systems-panel.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json'),source=JSON.stringify({t,l});
const stock=(f='EAR',c='light-cruiser')=>stockPack(f,c,t,l),v1=()=>forkPack(stock(),'local:systems-test');
const v2=()=>upgradeEngineering(v1(),t),ref=c=>({id:c.id,revision:c.revision});
function add(p,id,spec){const c={id:`local:${id}`,revision:1,name:id,spec};p.systems.push(c);return ref(c);}
function custom(){const p=v2();p.design.engineering.reactors=[{id:'primary',component:add(p,'large-reactor',{kind:'reactor',power:17})},{id:'auxiliary',component:add(p,'small-reactor',{kind:'reactor',power:3})}];p.design.hull.impulsePower=2;
  p.design.engineering.shields=[1,2,3,4,5,6].map(face=>({face,component:add(p,`face-${face}`,{kind:'shield',capacity:face*2,powerPerDamage:face/2})}));return p;}
const ship=p=>buildShip('test-1',p.design.faction,p.design.className,t,l,makePrng(1),p);
let count=0;const check=(name,fn)=>{fn();count++;console.log('ok: '+name);};
check('explicit migration preserves all 29 effective stock profiles without modifying V1',()=>{
  for(const f of ['EAR','KRE','VRA','ZAN'])for(const c of t.rosters[f]){
    const a=stock(f,c),before=copy(a),b=upgradeEngineering(a,t),s=ship(b),old=ship(a);
    assert.deepEqual(a,before);assert.equal(a.version,1);assert.equal(b.version,2);assert.deepEqual(validatePack(b,t),[]);
    assert.deepEqual(s.cores.map(c=>c.power),old.cores.map(c=>c.power));assert.equal(fullPower(s),fullPower(old));assert.deepEqual(s.shieldCap,old.shieldCap);
    for(const face of [1,2,3,4,5,6])assert.equal(s.shieldGenerators[face].powerPerDamage,old.shieldPointRatio);
    for(const key of ['cores','corePower','maxShieldPower','shieldPointRatio'])assert.equal(Object.hasOwn(b.design.hull,key),false);
    assert.deepEqual(upgradeEngineering(b,t),b);assert.notEqual(upgradeEngineering(a,t).systems[0].id,b.systems[0].id);
  }
});
check('uniform migration preserves complete seeded combat events, logs and frame state on all 29 hulls',()=>{
  const normalize=record=>{const r=copy(record);for(const side of r.meta.scenario.sides)for(const entry of side.ships)delete entry.designPack;
    for(const frame of r.rounds)for(const s of frame.ships){delete s.design;delete s.shieldGenerators;delete s.shieldMax;delete s.shieldPointRatio;s.cores=s.cores.map(({power,alive})=>({power,alive}));}return r;};
  for(const f of ['EAR','KRE','VRA','ZAN'])for(const c of t.rosters[f]){
    const a=stock(f,c),b=upgradeEngineering(a,t),sa=trialScenario(a,t),sb=trialScenario(b,t);sa.maxTurns=sb.maxTurns=6;
    assert.deepEqual(normalize(recordScenario(sb,t,l)),normalize(recordScenario(sa,t,l)),`${f}/${c}`);
  }
});
check('supplied catalogue contains pinned faction-effective reactor and shield templates',()=>{
  const catalogue=stockSystems(t,l);assert.equal(catalogue.length,58);assert.equal(new Set(catalogue.map(c=>c.id)).size,58);
  const kre=catalogue.find(c=>c.id==='stock:kre:light-cruiser:shield');assert.equal(kre.spec.powerPerDamage,stock('KRE').design.hull.shieldPointRatio);
  const p=custom(),other=v2();const all=systemsCatalogue(other,[p],catalogue);assert.ok(all.some(c=>c.id==='local:large-reactor'));assert.ok(all.some(c=>c.id===kre.id));
  const collision=copy(p);collision.systems.at(-1).name='other pack';assert.equal(systemsCatalogue(p,[collision],catalogue).find(c=>c.id===p.systems.at(-1).id).name,p.systems.at(-1).name);
});
check('heterogeneous reactors and six real shield generators compile without aggregate fallback',()=>{
  const p=custom(),compiled=compileDesign(p,t),s=ship(p);assert.deepEqual(compiled.reactors.map(r=>r.power),[17,3]);assert.equal(compiled.hull.corePower,undefined);
  assert.equal(fullPower(s),22);assert.equal(ratedPower(s),22);assert.deepEqual(Object.values(s.shieldCap),[2,4,6,8,10,12]);
  assert.equal(s.shieldGenerators[1].powerPerDamage,.5);assert.equal(s.shieldGenerators[6].powerPerDamage,3);
  s.shieldGenerators[1].component.id='changed';s.cores[0].component.id='changed';assert.equal(p.design.engineering.reactors[0].component.id,'local:large-reactor');
});
check('core damage debits the destroyed reactor, clamps at zero and leaves last-core policy unchanged',()=>{
  for(const index of [0,1]){const s=ship(custom()),damageRng={pick:()=> 'core',int:()=>index};
    applyDamage(s,5,1,t,damageRng,null,0,true);assert.equal(s.cores[index].alive,false);assert.equal(s.power,22-[17,3][index]);assert.equal(fullPower(s),s.power);assert.equal(ratedPower(s),22);
    const remaining=s.power;applyDamage(s,5,1,t,{pick:()=> 'core',int:()=>{throw new Error('last core must not be rolled');}},null,0,true);assert.equal(s.power,remaining);assert.equal(s.cores.filter(c=>c.alive).length,1);
    startTurn(s,t);assert.equal(s.power,remaining);
  }
  const s=ship(custom());s.power=1;applyDamage(s,5,1,t,{pick:()=> 'core',int:()=>0},null,0,true);assert.equal(s.power,0);
});
check('each face spends its actual cost from one pool; round refill respects per-face outages',()=>{
  const s=ship(custom()),rng={pick:()=> 'hull',int:()=>0};
  assert.deepEqual(applyDamage(s,1,2,t,rng),{absorbed:2,internal:0});assert.equal(s.power,21);assert.equal(s.shieldCap[1],0);
  assert.deepEqual(applyDamage(s,6,8,t,rng),{absorbed:7,internal:1});assert.equal(s.power,0);assert.equal(s.shieldCap[6],5);assert.equal(shieldAbsorbable(s,2),0);
  s.shieldDown[3]=true;startRound(s);assert.deepEqual(Object.values(s.shieldCap),[2,4,0,8,10,12]);assert.equal(s.power,0);startTurn(s,t);assert.equal(s.power,22);
  applyDamage(s,2,1,t,{pick:()=> 'shield-2'},null,0,true);applyDamage(s,2,1,t,{pick:()=> 'shield-2'},null,0,true);startRound(s);assert.equal(s.shieldCap[2],0);
});
check('authored fractional capacities stay pinned but absorb only whole points; fractional power costs remain real',()=>{
  const p=custom();p.systems.find(c=>c.id==='local:face-1').spec.capacity=0;const s=ship(p);assert.equal(shieldAbsorbable(s,1),0);
  s.shieldGenerators[2].capacity=.5;s.shieldGenerators[2].powerPerDamage=.25;startRound(s);s.power=1;assert.equal(shieldAbsorbable(s,2),0);
  assert.deepEqual(applyDamage(s,2,1,t,{pick:()=> 'hull'}),{absorbed:0,internal:1});assert.equal(s.power,1);assert.equal(s.shieldCap[2],.5);
  s.power=.24;startRound(s);assert.equal(shieldAbsorbable(s,2),0);
});
check('live engineering forecast and command readouts use the selected face and actual power',()=>{
  const p=custom();p.design.mounts=[];const r=engineering(p,t,l,{face:6,reserve:0,move:0});assert.equal(r.forecast.fullPower,22);assert.equal(r.shieldAbsorbable,7);
  const b=createBattle(trialScenario(p,t),t,l,1),view=battleView(b).ships.find(s=>s.designId),faces=shields(view);
  assert.equal(view.ratedPower,22);assert.equal(view.fullPower,22);assert.equal(faces[0].max,2);assert.equal(faces[5].max,12);assert.equal(faces[5].absorbable,7);
  view.power=0;assert.ok(shields(view).every(f=>f.absorbable===0));view.power=22;view.shieldsBypassed=true;assert.ok(shields(view).every(f=>f.absorbable===0));
  view.cores[0].component.id='changed';view.shieldGenerators[1].capacity=999;assert.equal(b.A[0].cores[0].component.id,'local:large-reactor');assert.equal(b.A[0].shieldGenerators[1].capacity,2);
});
check('asymmetric AI reserve uses mean rated face budget and capacity-weighted threat memory',()=>{
  for(const damage of [0,100]){const tuning=copy(t),p=custom();p.design.mounts=[];p.systems.find(c=>c.id==='local:large-reactor').spec.power=1000;
    tuning.doctrine.EAR.reserveFraction=1;tuning.doctrine.dynamic={enabled:true,engagedFloor:1,threatMargin:100,absorbFacings:2,threatMemory:2};
    const b=createBattle(trialScenario(p,t),tuning,l,1),a=b.A[0],enemy=b.B[0];a.damageThisTurn=damage;
    const hold={plan:[{turn:0,forward:0},{turn:0,forward:0},{turn:0,forward:0}]},actual=[];
    stepTurn(b,{[a.id]:hold,[enemy.id]:{...hold,reserve:1}},{onRound:()=>actual.push(a.reserve)});
    // cap*cost sums to 91; six actions/facings cancel the six-face mean.
    const expected=Math.round(Math.max(91,damage*(91/42)*2));assert.equal(actual[0],expected);
    assert.ok(battleView(b).ships.every(s=>Number.isFinite(s.power)&&s.power>=0));
  }
});
check('scenarios, snapshots and both recording paths pin components without shared references',()=>{
  const p=custom(),scenario=trialScenario(p,t);scenario.maxTurns=2;assert.deepEqual(validateScenario(scenario,t,l),[]);assert.deepEqual(scenarioForSave(scenario).sides[0].ships[0].designPack,p);
  const b=createBattle(scenario,t,l,1),s=b.A[0],snap=snapshotShip(s),r=recordScenario(scenario,t,l),play=createPlayRecord(scenario,battleView(b));
  for(const rec of [r,play]){assert.deepEqual(rec.meta.scenario.sides[0].ships[0].designPack,p);for(const frame of rec.rounds){const entry=frame.ships.find(s=>s.designId);assert.deepEqual(entry.design,p);assert.equal(entry.shieldGenerators[6].capacity,12);assert.deepEqual(entry.cores.map(c=>c.power),[17,3]);}}
  snap.cores[0].component.id='changed';snap.shieldGenerators[1].component.id='changed';assert.equal(s.cores[0].component.id,'local:large-reactor');assert.equal(s.shieldGenerators[1].component.id,'local:face-1');
  p.systems.find(c=>c.id==='local:large-reactor').spec.power=999;assert.equal(s.cores[0].power,17);assert.equal(s.design.systems.find(c=>c.id==='local:large-reactor').spec.power,17);
  assert.deepEqual(parsePack(JSON.stringify(r.meta.scenario.sides[0].ships[0].designPack),t),scenario.sides[0].ships[0].designPack);
});
check('V1 and V2 library revisions coexist; stock promotion, pinning and undo stay explicit',()=>{
  const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)},a=stock(),b=upgradeEngineering(a,t),h=history(a);h.change(b);h.undo();assert.deepEqual(h.pack,a);h.redo();assert.deepEqual(h.pack,b);
  assert.throws(()=>appendRevision(storage,b,t,null));const first=appendRevision(storage,a,t,null,{allowStock:true});
  const previous=storage.getItem(LIBRARY_KEY);appendRevision(storage,b,t,previous,{allowStock:true});const {library}=readLibrary(storage,t);assert.equal(library.length,2);assert.equal(library[0].version,1);assert.equal(library[1].version,2);
  const scenario=trialScenario(a,t),pinned=pinStockRevisions(scenario,library);assert.equal(pinned.sides[0].ships[0].designPack.version,1);assert.equal(pinned.sides[1].ships[0].designPack.version,2);assert.equal(scenario.sides[1].ships[0].designPack,undefined);
  assert.throws(()=>appendRevision(storage,b,t,previous,{allowStock:true}),/changed/i);assert.ok(stockChanges(a,b).some(s=>/profile/.test(s)));assert.ok(stockChanges(a,b).some(s=>/Shield 6/.test(s)));assert.ok(first);
});
check('invalid engineering is rejected by pack, scenario and runtime boundaries without coercion',()=>{
  const mutations=[p=>p.profile='wrong',p=>p.version=1,p=>p.design.hull.corePower=10,p=>p.design.hull.maxShieldPower=5,p=>delete p.systems,p=>p.systems.push(copy(p.systems[0])),p=>p.systems[0].spec.power=Infinity,p=>p.systems[0].spec.power=-1,p=>p.systems[0].spec.script='x',p=>p.systems[0].spec.kind='code',p=>p.systems[0].revision=0,
    p=>p.design.engineering.reactors=[],p=>p.design.engineering.reactors.push(copy(p.design.engineering.reactors[0])),p=>p.design.engineering.reactors[0].component.revision=999,p=>p.design.engineering.reactors[0].component=ref(p.systems[1]),p=>p.design.engineering.shields.pop(),p=>p.design.engineering.shields[0].face=6,p=>p.design.engineering.shields[0].face=1.5,p=>p.design.engineering.shields[0].component=ref(p.systems[0]),p=>p.systems[1].spec.capacity=-1,p=>p.systems[1].spec.powerPerDamage=0,p=>p.systems[1].spec.powerPerDamage=NaN,p=>p.design.engineering.script='x',p=>p.systems=Array.from({length:129},()=>copy(p.systems[0])),p=>p.design.engineering.reactors=Array.from({length:33},(_,i)=>({...copy(p.design.engineering.reactors[0]),id:`r-${i}`}))];
  for(const mutate of mutations){const p=v2();mutate(p);assert.ok(validatePack(p,t).length);assert.throws(()=>compileDesign(p,t));assert.throws(()=>parsePack(JSON.stringify(p),t));const scenario=trialScenario(v2(),t);scenario.sides[0].ships[0].designPack=p;assert.ok(validateScenario(scenario,t,l).length);assert.throws(()=>createBattle(scenario,t,l,1));}
});
check('no stock tuning or loadouts changed during component engineering tests',()=>assert.equal(JSON.stringify({t,l}),source));
console.log(`Component engineering passed: ${count} groups, 29 full migration replays, 25 invalid packs.`);
