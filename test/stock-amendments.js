// September 6 amendments use the new exports, with the September 5 returns
// retained as independent historical inputs. No downloads or snapshots needed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,copy,compileDesign} from '../src/construction/index.js';
import {legacySpec} from '../src/construction/legacy.js';
import {currentStock,appendRevision,pinStockRevisions,LIBRARY_KEY} from '../src/construction/stock-library.js';
import {STOCK_REFERENCES} from '../src/construction/design-references.js';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets,previewOrders,stepTurn} from '../src/tactical/resolver.js';
import {recordScenario} from '../arena/record.js';
import {trialScenario} from '../drydock/model.js';
import {add,faceFor} from '../src/tactical/hex.js';
import {makePrng} from '../src/prng.js';
import {originalApproved,amendments,approved} from './fixtures/stock-approvals.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tuning=read('../data/tactical-tuning.json'),loadouts=read('../data/loadouts.json');
const previousTuning=copy(tuning),previousLoadouts=copy(loadouts);
previousTuning.hullClasses.monitor.missileArcs.push('a');
previousLoadouts.VRA.battleship.missileArcs.push('a','pa');
previousLoadouts.VRA.destroyer.missileMounts=2;
previousLoadouts.VRA['heavy-cruiser'].beamArcs.pop();
previousTuning.hullClasses.frigate.superstructure=8;delete previousTuning.hullClasses.frigate._structureNote;
delete previousLoadouts._publishedStock.revisions;delete previousLoadouts._publishedStock.amended;
for(const e of originalApproved){const [f,c]=e.key.split('/');previousLoadouts[f][c].mounts=e.pack.design.mounts.map(m=>({type:m.weapon.id.slice(6),faces:copy(m.faces),position:copy(m.position),orientation:m.orientation}));}
const untouched=JSON.stringify({tuning,loadouts,originalApproved,amendments});
const identityFree=p=>{const n=copy(p);for(const k of ['id','revision','name','notes'])delete n.design[k];return n;};
let groups=0;const check=(name,fn)=>{fn();groups++;console.log('ok: '+name);};

check('Only the nine approved amended ships advance revision; all catalogue identities and other 20 packs stay exact',()=>{
  // Includes Chris's September 7 gunstar turret-1 face-3 amendment, and his
  // September 7 Vraygon battleship correction: mount-6 bore on faces 3, 4 and 6,
  // a disconnected arc with a gap at dead astern, and face 6 was removed. Also
  // his September 8 frigate structure amendment: the class envelope rose from 8
  // to 9.2, which moves one frigate for each of the four powers and nothing else.
  assert.deepEqual(amendments.map(e=>e.key).sort(),['EAR/frigate','EAR/gunstar-battlecruiser','EAR/light-cruiser','KRE/frigate','VRA/battleship','VRA/destroyer','VRA/frigate','VRA/heavy-cruiser','ZAN/frigate']);
  for(const e of approved){
    const [f,c]=e.key.split('/'),now=stockPack(f,c,tuning,loadouts),old=stockPack(f,c,previousTuning,previousLoadouts);
    assert.ok(STOCK_REFERENCES[now.design.id]);assert.equal(now.design.id,old.design.id);
    if(amendments.some(a=>a.key===e.key))assert.equal(now.design.revision,old.design.revision+1);
    else assert.deepEqual(now,old,e.key);
    assert.deepEqual(identityFree(now),identityFree(e.pack),e.key);
  }
});
check('Heavy cruiser has a dead-astern fifth beam; destroyer keeps exactly one centered tube and six rounds',()=>{
  const hc=stockPack('VRA','heavy-cruiser',tuning,loadouts),dd=stockPack('VRA','destroyer',tuning,loadouts);
  assert.deepEqual(hc.design.mounts[4].faces,[5]);assert.deepEqual(hc.design.mounts[4].position,{x:0,y:-1,z:0});
  const tubes=dd.design.mounts.filter(m=>m.weapon.id==='stock:neutronic-missile');
  assert.equal(tubes.length,1);assert.deepEqual(tubes[0].faces,[2]);assert.deepEqual(tubes[0].position,{x:0,y:0.85,z:0});assert.equal(dd.design.hull.magazine,6);
  for(const c of ['destroyer','heavy-cruiser']){
    const before=stockPack('VRA',c,previousTuning,previousLoadouts),now=stockPack('VRA',c,tuning,loadouts);
    assert.deepEqual(now.design.hull,before.design.hull);assert.deepEqual(now.weapons,before.weapons);
  }
});

function fireTrial(className,heading,direction,old=false){
  const t=copy(tuning),l=old?previousLoadouts:loadouts,rng=makePrng(773);
  t.battle.terrain=[];t.explosion.enabled=false;t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};
  const a=buildShip('A-probe','VRA',className,t,l,rng),b=buildShip('B-target','EAR','heavy-cruiser',t,l,rng);
  a.pos={q:0,r:0};a.facing=heading;b.pos=add(a.pos,direction,6);b.facing=(direction+3)%6;
  b.superstructure=b.superstructureMax=10000;b.mounts.forEach(m=>{m.inop=true;});
  a.mounts.forEach(m=>{m.inop=className==='heavy-cruiser'?m.id!==5:m.kind!=='missile';});
  const battle=createBattleFromFleets([[a],[b]],t,rng),hold=target=>({plan:Array.from({length:3},()=>({turn:0,forward:0})),reserve:0,target});
  const order=hold(b.id),preview=previewOrders(battle,a.id,order),shots=[],magazine=a.magazine;
  stepTurn(battle,{[a.id]:order,[b.id]:hold(a.id)},{onShot:e=>shots.push(e)});
  return {a,b,battle,preview,shots,spentMagazine:magazine-a.magazine};
}
check('Heavy-cruiser fifth beam forecast and actual fire agree on all six bearings under all six headings',()=>{
  for(let heading=0;heading<6;heading++)for(let direction=0;direction<6;direction++){
    const f=fireTrial('heavy-cruiser',heading,direction),expected=faceFor(heading,direction)===5?1:0;
    assert.equal(f.shots.filter(e=>e.kind==='beam'&&e.shooterId===f.a.id).length,expected,`${heading}/${direction}`);
    assert.equal(f.preview.weapons,expected*tuning.weapons['heavy-blaster'].maxPower);
  }
});
check('A real destroyer turn launches and spends one round, with the old two-tube fit as positive control',()=>{
  const now=fireTrial('destroyer',0,0),old=fireTrial('destroyer',0,0,true);
  assert.equal(now.shots.filter(e=>e.kind==='launch').length,1);assert.equal(now.spentMagazine,1);assert.equal(now.a.magazine,5);
  assert.equal(old.shots.filter(e=>e.kind==='launch').length,2);assert.equal(old.spentMagazine,2);
  assert.equal(now.preview.weapons,tuning.weapons['neutronic-missile'].powerToArm);
});
check('Trimming only unused missile entries preserves mount output, apart from the ruled battleship arc',()=>{
  for(const c of ['battleship','monitor']){
    const before=legacySpec('VRA',c,previousTuning,previousLoadouts),now=legacySpec('VRA',c,tuning,loadouts);
    if(c==='battleship'){
      // Chris's 2026-09-07 correction: mount 6 bore on faces 3, 4 and 6 - a
      // disconnected arc, with a gap at dead astern - and face 6 was removed.
      // Exempt that one mount and no other, so this check still proves what it
      // is for: trimming the unused missile entries moved nothing else.
      const i=before.mounts.findIndex(m=>String(m.arc)==='3,4,6');
      assert.ok(i>=0,'the pinned battleship must still carry the pre-correction arc');
      assert.deepEqual(now.mounts[i].arc,[3,4],'the corrected mount keeps the starboard broadside');
      assert.deepEqual(now.mounts.filter((_,k)=>k!==i),before.mounts.filter((_,k)=>k!==i));
    } else assert.deepEqual(now.mounts,before.mounts);
    const oldL=copy(previousLoadouts),newL=copy(loadouts);delete oldL.VRA[c].mounts;delete newL.VRA[c].mounts;
    assert.deepEqual(legacySpec('VRA',c,tuning,newL).mounts,legacySpec('VRA',c,previousTuning,oldL).mounts);
  }
  assert.deepEqual(tuning.hullClasses.monitor.beamArcs,previousTuning.hullClasses.monitor.beamArcs);
  assert.equal(tuning.hullClasses.monitor.beamArcs.length,6);assert.equal(tuning.hullClasses.monitor.beamMounts,7);
  assert.deepEqual(loadouts.VRA['light-cruiser'],previousLoadouts.VRA['light-cruiser']);
});
check('Both old r2 stock revisions stay pinned through library adoption, restoration and recorded battles',()=>{
  for(const c of ['destroyer','heavy-cruiser']){
    const old=stockPack('VRA',c,previousTuning,previousLoadouts),now=stockPack('VRA',c,tuning,loadouts),raw=JSON.stringify([old]);
    assert.deepEqual(currentStock('VRA',c,tuning,loadouts,[old]),old);
    const storage={value:raw,getItem:k=>{assert.equal(k,LIBRARY_KEY);return storage.value;},setItem:(k,v)=>{assert.equal(k,LIBRARY_KEY);storage.value=v;}};
    const scenario=pinStockRevisions(trialScenario(old,previousTuning),[old]);scenario.maxTurns=3;
    const saved=appendRevision(storage,now,tuning,raw,{allowStock:true});
    assert.equal(saved.pack.design.revision,4,'local save appends beyond both the local r2 and supplied r3');assert.deepEqual(saved.library[0],old);assert.equal(saved.library.length,2);
    assert.deepEqual(pinStockRevisions(scenario,saved.library),scenario);
    assert.deepEqual(recordScenario(scenario,tuning,loadouts),recordScenario(scenario,previousTuning,previousLoadouts));
    assert.deepEqual(compileDesign(old,tuning),compileDesign(old,previousTuning));
  }
});
check('Verification does not mutate supplied tables or either generation of returned content',()=>assert.equal(JSON.stringify({tuning,loadouts,originalApproved,amendments}),untouched));
console.log(`Stock amendments: ${groups} groups passed; 36 rotated firing trials, one-/two-tube controls and two pinned-history comparisons.`);
