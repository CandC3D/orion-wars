import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,forkPack,upgradeEngineering,copy} from '../src/construction/index.js';
import {LIBRARY_KEY,readLibrary,appendRevision,renameVariant,deleteVariant,restoreVariant,pinStockRevisions} from '../src/construction/stock-library.js';
import {trialScenario} from '../drydock/model.js';
import {createBattle} from '../src/tactical/resolver.js';
import {recordScenario} from '../arena/record.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json'),source=JSON.stringify({t,l});
const stock=stockPack('EAR','frigate',t,l),variant=forkPack(stock,'local:variant-test'),other=forkPack(stock,'local:unrelated');
const storage={value:null,getItem:key=>{assert.equal(key,LIBRARY_KEY);return storage.value;},setItem:(key,value)=>{assert.equal(key,LIBRARY_KEY);storage.value=value;}};
let count=0;const check=(name,fn)=>{fn();count++;console.log('ok: '+name);};
let first,renamed,unrelated,stockSaved,deleted;
check('rename saves a new immutable revision, trims the name, and keeps stable design identity',()=>{
  first=appendRevision(storage,variant,t,null);const old=copy(first.pack);renamed=renameVariant(storage,first.pack,'  Asterion Arrow  ',t,first.raw);
  assert.equal(renamed.pack.design.name,'Asterion Arrow');assert.equal(renamed.pack.design.id,variant.design.id);assert.equal(renamed.pack.design.revision,2);assert.deepEqual(renamed.library[0],old);
  assert.ok(Array.isArray(JSON.parse(storage.value)));assert.deepEqual(renamed.trash,[]);
});
check('blank, excessive, stale and stock renames cannot alter stored data',()=>{
  const original=storage.value;
  for(const name of ['', '   ', 'x'.repeat(101),null])assert.throws(()=>renameVariant(storage,renamed.pack,name,t,original));
  assert.throws(()=>renameVariant(storage,stock,'bad',t,original),/stock/);assert.throws(()=>renameVariant(storage,renamed.pack,'stale',t,first.raw),/another tab/);assert.equal(storage.value,original);
});
check('deletion atomically archives all revisions and an unsaved V2 draft, not other designs',()=>{
  unrelated=appendRevision(storage,other,t,storage.value);stockSaved=appendRevision(storage,stock,t,storage.value,{allowStock:true});
  const draft=upgradeEngineering(renamed.pack,t);draft.design.name='Unsaved final name';draft.design.mounts[0].position.y=1.5;
  const original=copy(draft);deleted=deleteVariant(storage,draft,t,storage.value);
  assert.deepEqual(draft,original);assert.deepEqual(deleted.library,[unrelated.pack,stockSaved.pack]);assert.equal(deleted.trash.length,1);
  assert.deepEqual(deleted.trash[0].revisions,[first.pack,renamed.pack]);assert.deepEqual(deleted.trash[0].draft,draft);assert.equal(deleted.trash[0].draft.version,2);
  assert.equal(JSON.parse(storage.value).format,'orion-drydock-library');assert.deepEqual(readLibrary(storage,t).trash,deleted.trash);
});
check('new saves preserve the archive, while stale or refreshed deleted identities cannot resurrect',()=>{
  const original=storage.value;assert.throws(()=>appendRevision(storage,renamed.pack,t,original),/deleted/);assert.throws(()=>appendRevision(storage,renamed.pack,t,first.raw),/another tab/);
  assert.throws(()=>deleteVariant(storage,stock,t,original),/Stock/);assert.throws(()=>deleteVariant(storage,variant,t,original),/already/);assert.equal(storage.value,original);
  const result=renameVariant(storage,unrelated.pack,'Other ship renamed',t,original);assert.deepEqual(result.trash,deleted.trash);
});
check('restoration restores original saved revisions and returns the unsaved draft separately',()=>{
  const before=readLibrary(storage,t),result=restoreVariant(storage,variant.design.id,t,before.raw);
  assert.deepEqual(result.library.filter(p=>p.design.id===variant.design.id),[first.pack,renamed.pack]);assert.deepEqual(result.pack,deleted.deleted.draft);assert.deepEqual(result.trash,[]);
  assert.ok(Array.isArray(JSON.parse(storage.value)));assert.equal(result.library.some(p=>p.design.name==='Unsaved final name'),false);
  assert.equal(appendRevision(storage,result.pack,t,result.raw).pack.design.revision,3);
});
check('never-saved variants can be deleted and recovered without inventing a saved revision',()=>{
  const draft=forkPack(stock,'local:never-saved'),result=deleteVariant(storage,draft,t,storage.value);assert.deepEqual(result.deleted.revisions,[]);
  const restored=restoreVariant(storage,draft.design.id,t,result.raw);assert.deepEqual(restored.pack,draft);assert.equal(restored.library.some(p=>p.design.id===draft.design.id),false);
});
check('deletion and rename do not alter pinned scenarios, runtime ships or recordings',()=>{
  const p=copy(renamed.pack),scenario=trialScenario(p,t);scenario.maxTurns=2;const battle=createBattle(scenario,t,l,1),record=recordScenario(scenario,t,l),before=JSON.stringify({scenario,record,design:battle.A[0].design});
  deleteVariant(storage,p,t,storage.value);assert.equal(JSON.stringify({scenario,record,design:battle.A[0].design}),before);
  const read=readLibrary(storage,t);assert.deepEqual(pinStockRevisions(scenario,read.library).sides[0].ships[0].designPack,p);
});
check('quota failures leave both archive and active library unchanged',()=>{
  const raw=storage.value,denied={getItem:()=>raw,setItem:()=>{throw new Error('quota');}};
  assert.throws(()=>deleteVariant(denied,other,t,raw),/quota/);assert.throws(()=>restoreVariant(denied,variant.design.id,t,raw),/quota/);assert.throws(()=>renameVariant(denied,other,'new',t,raw),/quota/);assert.equal(storage.value,raw);
});
check('corrupt, conflicting and unsupported archive envelopes fail closed',()=>{
  const valid=JSON.parse(storage.value),bad=[];assert.equal(valid.version,2);
  for(const mutate of [v=>v.version=3,v=>v.script='x',v=>delete v.trash,v=>v.trash.push(copy(v.trash[0])),v=>v.designs.push(copy(v.trash[0].draft)),v=>v.trash[0].id='local:wrong',v=>v.trash[0].draft=copy(stock),v=>v.trash[0].revisions=[copy(other)],v=>v.trash[0].draft.systems='bad',v=>v.trash[0].deletedAt='invalid',v=>v.trash[0].extra=true]){const v=copy(valid);mutate(v);bad.push(JSON.stringify(v));}
  for(const raw of bad){const denied={getItem:()=>raw,setItem:()=>{throw new Error('must not write');}};assert.throws(()=>readLibrary(denied,t));assert.throws(()=>deleteVariant(denied,other,t,raw));}
});
check('stock data unchanged',()=>assert.equal(JSON.stringify({t,l}),source));
console.log(`Variant library passed: ${count} groups.`);
