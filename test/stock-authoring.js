import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stockPack, forkPack, validatePack, copy, upgradeEngineering } from '../src/construction/index.js';
import { readLibrary, currentStock, stockRevision, appendRevision, pinStockRevisions, stockChanges, LIBRARY_KEY } from '../src/construction/stock-library.js';
import { createBattle } from '../src/tactical/resolver.js';
import { recordScenario } from '../arena/record.js';
import { trialScenario } from '../drydock/model.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json'),source=JSON.stringify({t,l});
const storage={value:null,getItem(key){assert.equal(key,LIBRARY_KEY);return this.value;},setItem(key,value){assert.equal(key,LIBRARY_KEY);this.value=value;}};
const baseline=stockPack('EAR','frigate',t,l),draft=copy(baseline);
// Both directions must explain where engineering values now live, not imply
// that deleting the legacy aggregate keys deletes the actual ship equipment.
const v2=upgradeEngineering(baseline,t),unmodified=JSON.stringify({baseline,v2});
for(const [from,to] of [[baseline,v2],[v2,baseline]]){
  const changes=stockChanges(from,to),text=changes.join('\n');
  assert.doesNotMatch(text,/undefined/);
  for(const key of ['cores','corePower','maxShieldPower','shieldPointRatio'])assert.match(changes.find(line=>line.startsWith(`Hull ${key}:`)),/component profile/);
  assert.match(text,/individual reactors/);assert.match(text,/per-face generators/);
  assert.match(text,/Engineering profile:/);assert.match(text,/Reactors:/);
  for(const face of [1,2,3,4,5,6])assert.match(text,new RegExp(`Shield ${face}:`));
}
assert.equal(JSON.stringify({baseline,v2}),unmodified);
draft.design.mounts[0].faces=[1,4];draft.design.mounts[0].position={x:0,y:1.2,z:.15};draft.design.hull.points=3;
assert.equal(stockChanges(baseline,draft).length,3);
assert.throws(()=>appendRevision(storage,draft,t,null),/Unlock/);
assert.equal(storage.value,null);
const r2=appendRevision(storage,draft,t,null,{allowStock:true});
assert.equal(r2.pack.design.id,baseline.design.id);assert.equal(r2.pack.design.revision,baseline.design.revision+1);
assert.deepEqual(readLibrary(storage,t).library,[r2.pack]);
assert.deepEqual(currentStock('EAR','frigate',t,l,r2.library),r2.pack);
assert.deepEqual(currentStock('KRE','frigate',t,l,r2.library),stockPack('KRE','frigate',t,l));
const variant=forkPack(baseline,'local:preserved');
const scenario=trialScenario(variant,t),pinned=pinStockRevisions(scenario,r2.library);
assert.deepEqual(pinned.sides[0].ships[0].designPack,variant);
assert.deepEqual(pinned.sides[1].ships[0].designPack,r2.pack);
assert.equal(scenario.sides[1].ships[0].designPack,undefined);
const battle=createBattle(pinned,t,l,pinned.seed);
assert.deepEqual(battle.B[0].mounts[0].arc,[1,4]);assert.deepEqual(battle.B[0].mounts[0].position,{x:0,y:1.2,z:.15});assert.equal(battle.B[0].points,3);
const replay=recordScenario(pinned,t,l),before=JSON.stringify(replay);
const r3=appendRevision(storage,baseline,t,r2.raw,{allowStock:true});
assert.equal(r3.pack.design.revision,baseline.design.revision+2);assert.deepEqual(stockChanges(baseline,r3.pack),[]);
assert.deepEqual(stockRevision('EAR','frigate',[r3.pack,r2.pack]),r3.pack);
assert.deepEqual(pinStockRevisions(pinned,r3.library),pinned);
assert.deepEqual(battle.B[0].design,r2.pack);assert.equal(JSON.stringify(replay),before);
assert.equal(JSON.stringify({t,l}),source);
assert.throws(()=>appendRevision(storage,draft,t,r2.raw,{allowStock:true}),/another tab/);
assert.equal(storage.value,r3.raw);
for(const bad of [null,{},[r2.pack,r2.pack],[{...draft,design:{...draft.design,id:'stock:kre:frigate'}}]]) {
  storage.value=JSON.stringify(bad);assert.throws(()=>readLibrary(storage,t));
  const original=storage.value;assert.throws(()=>appendRevision(storage,draft,t,original,{allowStock:true}));assert.equal(storage.value,original);
}
storage.value=r3.raw;
const r4=appendRevision(storage,variant,t,r3.raw);assert.equal(r4.pack.design.revision,1);
assert.deepEqual(stockRevision('EAR','frigate',r4.library),r3.pack);
const wrong=copy(baseline);wrong.design.id='stock:ear:destroyer';assert.ok(validatePack(wrong,t).length);
const badFaces=copy(draft);badFaces.design.mounts[0].faces=[];assert.throws(()=>appendRevision(storage,badFaces,t,r4.raw,{allowStock:true}));assert.equal(storage.value,r4.raw);
const denied={getItem:()=>r4.raw,setItem:()=>{throw new Error('quota');}};
assert.throws(()=>appendRevision(denied,draft,t,r4.raw,{allowStock:true}),/quota/);
console.log('Stock authoring passed: explicit promotion, canonical identity, immutable revisions, stock restore, pinned scenarios/runtime/replays, faction isolation, stale/corrupt/quota rejection.');
