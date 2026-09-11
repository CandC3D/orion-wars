// Chris's returned pack is the oracle; the former r2 return remains immutable.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,copy,compileDesign,parsePack} from '../src/construction/index.js';
import {currentStock,appendRevision,LIBRARY_KEY} from '../src/construction/stock-library.js';
import {STOCK_REFERENCES} from '../src/construction/design-references.js';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets,previewOrders,stepTurn,battleView} from '../src/tactical/resolver.js';
import {recordScenario,snapshotShip} from '../arena/record.js';
import {trialScenario} from '../drydock/model.js';
import {add} from '../src/tactical/hex.js';
import {makePrng} from '../src/prng.js';
import {originalApproved,approved,beforeMagazineRuling} from './fixtures/stock-approvals.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
// Judged with the September 11 magazine ruling undone: that amendment is proved in stock-promotion.js.
const {tuning,loadouts}=beforeMagazineRuling(read('../data/tactical-tuning.json'),read('../data/loadouts.json'));
const original=originalApproved.find(e=>e.key==='EAR/light-cruiser').pack;
const supplied=read('../docs/drydock/earth-light-cruiser-amendment-2026-09-06/approved-designs.json').designs[0].pack;
const previous=copy(loadouts);previous.EAR['light-cruiser'].mounts[0].faces=copy(original.design.mounts[0].faces);
delete previous._publishedStock.revisions['EAR/light-cruiser'];
const before=stockPack('EAR','light-cruiser',tuning,previous),now=stockPack('EAR','light-cruiser',tuning,loadouts);
const identityFree=p=>{const n=copy(p);for(const k of ['id','revision','name','notes'])delete n.design[k];return n;};
const untouched=JSON.stringify({tuning,loadouts,original,supplied});
let groups=0;const check=(name,fn)=>{fn();groups++;console.log('ok: '+name);};

check('The returned content changes only beam 1: removes face 3, retains faces 1, 2, 6 and exact placement',()=>{
  assert.deepEqual(original.design.mounts[0].faces,[1,2,3,6]);
  assert.deepEqual(supplied.design.mounts[0].faces,[1,2,6]);
  const expected=identityFree(original);expected.design.mounts[0].faces=[1,2,6];
  assert.deepEqual(identityFree(supplied),expected);
  assert.deepEqual(identityFree(parsePack(JSON.stringify(now),tuning)),identityFree(supplied));
  assert.equal(now.design.id,before.design.id);assert.equal(now.design.revision,3);assert.equal(before.design.revision,2);
  assert.equal(STOCK_REFERENCES[now.design.id],STOCK_REFERENCES[before.design.id]);
});
check('All 28 other stock packs, including the Vraygon amendments, stay byte-exact',()=>{
  for(const {key}of approved){if(key==='EAR/light-cruiser')continue;
    const [f,c]=key.split('/');assert.equal(JSON.stringify(stockPack(f,c,tuning,loadouts)),JSON.stringify(stockPack(f,c,tuning,previous)),key);
  }
});

function trial(heading,direction,old=false){
  const t=copy(tuning),l=old?previous:loadouts,rng=makePrng(731);
  t.battle.terrain=[];t.explosion.enabled=false;t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};
  const a=buildShip('A-probe','EAR','light-cruiser',t,l,rng),b=buildShip('B-target','EAR','heavy-cruiser',t,l,rng);
  a.pos={q:0,r:0};a.facing=heading;b.pos=add(a.pos,direction,6);b.facing=(direction+3)%6;
  b.superstructure=b.superstructureMax=10000;b.mounts.forEach(m=>{m.inop=true;});a.mounts.forEach(m=>{m.inop=m.id!==1;});
  const battle=createBattleFromFleets([[a],[b]],t,rng),hold=target=>({plan:Array.from({length:3},()=>({turn:0,forward:0})),reserve:0,target});
  const order=hold(b.id),preview=previewOrders(battle,a.id,order),shots=[];
  stepTurn(battle,{[a.id]:order,[b.id]:hold(a.id)},{onShot:e=>shots.push(e)});
  return {a,battle,preview,fired:shots.filter(e=>e.kind==='beam'&&e.shooterId===a.id).length};
}
check('Forecast and real beam fire match the three approved faces in all 36 heading/bearing combinations',()=>{
  // Ruling text: forward 2, then CCW 1, 6, 5, 4, 3. Independent of engine faceFor.
  const faces=[2,1,6,5,4,3];
  for(let heading=0;heading<6;heading++)for(let direction=0;direction<6;direction++){
    const f=trial(heading,direction),expected=[1,2,6].includes(faces[(direction-heading+6)%6])?1:0;
    assert.equal(f.fired,expected,`${heading}/${direction}`);
    assert.equal(f.preview.weapons,expected*tuning.weapons['laser-cannon'].maxPower);
    assert.deepEqual(battleView(f.battle).ships.find(s=>s.id===f.a.id).mounts[0].arc,[1,2,6]);
    assert.deepEqual(snapshotShip(f.a).mounts[0].arc,[1,2,6]);
  }
});
check('The removed forward-starboard face really fired under r2, for all six ship headings',()=>{
  for(let heading=0;heading<6;heading++){
    const direction=(heading+5)%6;assert.equal(trial(heading,direction,true).fired,1);assert.equal(trial(heading,direction).fired,0);
  }
});
check('Pinned r2 designs and recordings survive; adopting r3 is append-only and never automatic',()=>{
  const raw=JSON.stringify([before]),storage={value:raw,getItem:k=>{assert.equal(k,LIBRARY_KEY);return storage.value;},setItem:(k,v)=>{assert.equal(k,LIBRARY_KEY);storage.value=v;}};
  assert.deepEqual(currentStock('EAR','light-cruiser',tuning,loadouts,[before]),before);
  assert.deepEqual(currentStock('EAR','light-cruiser',tuning,loadouts,[]),now);
  const saved=appendRevision(storage,now,tuning,raw,{allowStock:true});
  assert.equal(saved.pack.design.revision,4);assert.deepEqual(saved.library[0],before);assert.equal(saved.library.length,2);
  assert.deepEqual(compileDesign(before,tuning).mounts[0].arc,[1,2,3,6]);
  const scenario=trialScenario(before,tuning);scenario.maxTurns=2;
  for(const side of scenario.sides)for(const s of side.ships)s.designPack=stockPack(side.faction,s.className,tuning,previous);
  assert.deepEqual(recordScenario(scenario,tuning,loadouts),recordScenario(scenario,tuning,previous));
});
check('Validation, forecasts and execution never mutate authored content or stock tables',()=>assert.equal(JSON.stringify({tuning,loadouts,original,supplied}),untouched));
console.log(`Earth light-cruiser amendment: ${groups} groups passed; 36 rotated firing cases, six historical positive controls, 28 preserved stock packs.`);
