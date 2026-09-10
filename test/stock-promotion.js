// The oracle is Chris's frozen return content, not a reconstruction from the
// promoted tables. Historical stock remains a separate regression fixture.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockPack,compileDesign,copy,parsePack} from '../src/construction/index.js';
import {legacySpec} from '../src/construction/legacy.js';
import {currentStock,pinStockRevisions,appendRevision,LIBRARY_KEY} from '../src/construction/stock-library.js';
import {STOCK_REFERENCES} from '../src/construction/design-references.js';
import {buildShip} from '../src/tactical/ship.js';
import {createBattle,battleView,stepTurn} from '../src/tactical/resolver.js';
import {snapshotShip,recordScenario} from '../arena/record.js';
import {trialScenario} from '../drydock/model.js';
import {makePrng} from '../src/prng.js';
import {approved,suppliedRevision} from './fixtures/stock-approvals.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json');
const folder='../docs/drydock/stock-promotion-2026-09-05/';
const beforeT=read(folder+'baseline/tactical-tuning.json'),beforeL=read(folder+'baseline/loadouts.json');
const untouched=JSON.stringify({t,l,beforeT,beforeL,approved});
const identityFree=p=>{const n=copy(p);for(const k of ['id','revision','name','notes'])delete n.design[k];return n;};
const layout=m=>({arc:m.arc,position:m.position,orientation:m.orientation,kind:m.kind,maxRange:m.maxRange,bands:m.bands});
const expectedLayout=s=>compileDesign(approved.find(e=>e.key===s.faction+'/'+s.className).pack,t).mounts.map(layout);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('ok: '+name);};
check('Every roster entry has exactly one approved return and keeps its canonical number',()=>{
  assert.equal(approved.length,29);
  assert.deepEqual(approved.map(e=>e.key).sort(),['EAR','KRE','VRA','ZAN'].flatMap(f=>t.rosters[f].map(c=>f+'/'+c)).sort());
  assert.deepEqual(Object.values(STOCK_REFERENCES).sort((a,b)=>a-b),Array.from({length:29},(_,i)=>i+1));
});
check('All 29 current stock packs equal the latest approved returns, apart from canonical identity and label',()=>{
  for(const {key,pack} of approved){
    const [f,c]=key.split('/'),p=stockPack(f,c,t,l);
    assert.equal(p.design.id,`stock:${f.toLowerCase()}:${c}`);assert.equal(p.design.revision,suppliedRevision(key));
    assert.notEqual(p.design.id,pack.design.id);assert.ok(STOCK_REFERENCES[p.design.id]);
    assert.deepEqual(identityFree(parsePack(JSON.stringify(p),t)),identityFree(pack),key);
  }
});
check('Non-layout changes are limited to the monitor, September 6 legacy tables, approved unused laser metadata, the September 7 arc presets and the September 8 frigate profile and structure',()=>{
  const restored=copy(t),m=restored.hullClasses.monitor,old=beforeT.hullClasses.monitor;
  assert.equal(m.points,24);assert.equal(m.magazine,32);assert.equal(Math.round(m.superstructure*t.factionModifiers.VRA.superstructure),220);
  assert.deepEqual(m.missileArcs,old.missileArcs.slice(0,5));m.missileArcs=old.missileArcs;
  delete m._publication;for(const k of ['points','magazine','superstructure'])m[k]=old[k];
  const laser=restored.weapons['laser-cannon'];
  assert.equal(Object.hasOwn(laser,'overcharge'),false);
  assert.equal(laser._note,'Accurate, long, consistent. EAR and ZAN.');
  laser.overcharge=beforeT.weapons['laser-cannon'].overcharge;
  laser._note=beforeT.weapons['laser-cannon']._note;
  // Shield-capacitor experiment added 2026-09-07 (Chris), disabled by default.
  assert.equal(typeof restored.damage.shieldCapacitor, 'object', 'capacitor block');
  assert.equal(restored.damage.shieldCapacitor.enabled, false, 'capacitor must ship disabled');
  assert.equal(Object.hasOwn(beforeT.damage, 'shieldCapacitor'), false, 'capacitor must be new, not a rewrite');
  delete restored.damage.shieldCapacitor;
  // Crippling block added 2026-09-07 (ruling: Chris), disabled by default so no
  // recorded battle changes. Asserted new and off, then reverted for the compare.
  assert.equal(typeof restored.damage.crippling, 'object', 'crippling block');
  assert.equal(restored.damage.crippling.enabled, false, 'crippling must ship disabled');
  assert.equal(Object.hasOwn(beforeT.damage, 'crippling'), false, 'crippling must be new, not a rewrite');
  delete restored.damage.crippling;
  // Five arc presets named 2026-09-07 (ruling: Chris). A survey found six
  // face-sets in use with no preset behind them, which the interface could only
  // render as "custom (1,2,6)". Additive: no existing preset was touched.
  for(const code of ['pfwd','sfwd','broad','pb','sb']){
    assert.ok(Array.isArray(restored.arcs[code]),'new preset '+code);
    assert.equal(Object.hasOwn(beforeT.arcs,code),false,'preset '+code+' must be new, not a rewrite');
    delete restored.arcs[code];
  }
  // Target profile added 2026-09-08 (ruling: Chris), disabled by default so no
  // recorded battle changes, and the frigate structure amendment that ships live
  // beside it - the only live tuning change of the day, and the reason four
  // frigate packs advance a revision. Both asserted, then reverted to compare.
  assert.equal(typeof restored.toHit.hullProfile,'object','hull profile block');
  assert.equal(restored.toHit.hullProfile.enabled,false,'hull profile must ship disabled');
  assert.equal(Object.hasOwn(beforeT.toHit,'hullProfile'),false,'hull profile must be new, not a rewrite');
  delete restored.toHit.hullProfile;
  assert.equal(restored.hullClasses.frigate.superstructure,9.2);
  assert.equal(beforeT.hullClasses.frigate.superstructure,8);
  restored.hullClasses.frigate.superstructure=beforeT.hullClasses.frigate.superstructure;
  delete restored.hullClasses.frigate._structureNote;
  assert.deepEqual(restored,beforeT);
  const stripped=copy(l);delete stripped._publishedStock;
  assert.equal(stripped.VRA.destroyer.missileMounts,1);stripped.VRA.destroyer.missileMounts=beforeL.VRA.destroyer.missileMounts;
  assert.deepEqual(stripped.VRA['heavy-cruiser'].beamArcs,[...beforeL.VRA['heavy-cruiser'].beamArcs,'a']);stripped.VRA['heavy-cruiser'].beamArcs=beforeL.VRA['heavy-cruiser'].beamArcs;
  assert.deepEqual(stripped.VRA.battleship.missileArcs,beforeL.VRA.battleship.missileArcs.slice(0,5));stripped.VRA.battleship.missileArcs=beforeL.VRA.battleship.missileArcs;
  for(const f of ['EAR','KRE','VRA','ZAN'])for(const c of t.rosters[f]){
    assert.ok(Array.isArray(stripped[f][c].mounts),f+'/'+c);delete stripped[f][c].mounts;
    if(!Object.hasOwn(beforeL[f],c)){assert.deepEqual(stripped[f][c],beforeL[f]._default);delete stripped[f][c];}
  }
  assert.deepEqual(stripped,beforeL);
});
check('Headless ships, live battle views and both recorder paths retain all exact installations',()=>{
  for(const {key,pack} of approved){
    const [f,c]=key.split('/'),expected=compileDesign(pack,t),ship=buildShip('test',f,c,t,l,makePrng(1));
    assert.deepEqual(ship.mounts.map(layout),expected.mounts.map(layout),key);
    assert.deepEqual(ship.mounts.map(m=>m.type),pack.design.mounts.map(m=>m.weapon.id.slice('stock:'.length)));
    for(const k of ['superstructure','magazine','movementPointRatio','shieldPointRatio','canCloak'])assert.equal(ship[k],expected[k],key+'/'+k);
    assert.equal(ship.points,pack.design.hull.points);
    assert.deepEqual(snapshotShip(ship).mounts.map(layout),expected.mounts.map(layout));
    const scenario=trialScenario(pack,t);delete scenario.sides[0].ships[0].designPack;scenario.maxTurns=2;
    const battle=createBattle(scenario,t,l,scenario.seed);
    for(const s of battleView(battle).ships)assert.deepEqual(s.mounts.map(layout),expectedLayout(s));
    stepTurn(battle,{});
    for(const s of battleView(battle).ships)assert.deepEqual(s.mounts.map(layout),expectedLayout(s));
    const replay=recordScenario(scenario,t,l);
    for(const frame of replay.rounds)for(const s of frame.ships)assert.deepEqual(s.mounts.map(layout),expectedLayout(s));
    const snap=snapshotShip(ship);snap.mounts[0].arc.push(9);snap.mounts[0].position.x=99;
    assert.deepEqual(ship.mounts.map(layout),expected.mounts.map(layout),'snapshot isolation');
  }
});
check('Old pinned stock packs remain exact under new defaults, including the original monitor',()=>{
  for(const {key}of approved){
    const [f,c]=key.split('/'),old=stockPack(f,c,beforeT,beforeL),saved=JSON.stringify(old);
    const scenario=trialScenario(old,beforeT);scenario.maxTurns=2;
    for(const side of scenario.sides)for(const entry of side.ships)entry.designPack=stockPack(side.faction,entry.className,beforeT,beforeL);
    const a=recordScenario(scenario,beforeT,beforeL),b=recordScenario(scenario,t,l);
    assert.deepEqual(b,a,'fully pinned historical replay '+key);
    assert.equal(JSON.stringify(old),saved);
    for(const s of b.rounds[0].ships)assert.deepEqual(s.design,stockPack(s.faction,s.className,beforeT,beforeL));
  }
});
check('Browser-local stock takes precedence regardless of supplied revision; restore is append-only',()=>{
  const old=stockPack('VRA','monitor',beforeT,beforeL);old.design.revision=2;
  const raw=JSON.stringify([old]),storage={value:raw,getItem(k){assert.equal(k,LIBRARY_KEY);return this.value;},setItem(k,v){assert.equal(k,LIBRARY_KEY);this.value=v;}};
  assert.deepEqual(currentStock('VRA','monitor',t,l,[old]),old);
  const scenario=trialScenario(old,beforeT),pinned=pinStockRevisions(scenario,[old]);
  assert.deepEqual(pinned.sides[1].ships[0].designPack,old);
  const restored=appendRevision(storage,stockPack('VRA','monitor',t,l),t,raw,{allowStock:true});
  assert.equal(restored.pack.design.revision,3);assert.equal(restored.library.length,2);
  assert.deepEqual(restored.library[0],old);assert.equal(restored.pack.design.hull.superstructure,220);
  assert.deepEqual(pinStockRevisions(pinned,restored.library),pinned);
  assert.equal(createBattle(pinned,t,l,'old').B[0].superstructure,198);
});
check('Explicit stock mount errors fail closed; empty batteries and disconnected arcs remain legal',()=>{
  const mutations=[m=>m.faces=[],m=>m.faces=[1,1],m=>m.faces=[0],m=>m.faces=[7],m=>m.faces=[1.5],
    m=>m.type='unknown',m=>m.position.x=Infinity,m=>m.position.x=2.1,m=>m.position.extra=0,
    m=>m.orientation=181,m=>m.script='unexpected'];
  for(const change of mutations){const bad=copy(l);change(bad.EAR.frigate.mounts[0]);assert.throws(()=>legacySpec('EAR','frigate',t,bad));assert.throws(()=>stockPack('EAR','frigate',t,bad));}
  const bad=copy(l);bad.EAR.frigate.mounts=Array(65).fill(bad.EAR.frigate.mounts[0]);assert.throws(()=>legacySpec('EAR','frigate',t,bad));
  const spinal=copy(l);spinal.EAR['gunstar-battlecruiser'].mounts.push(copy(spinal.EAR['gunstar-battlecruiser'].mounts.find(m=>t.weapons[m.type].kind==='spinal')));assert.throws(()=>legacySpec('EAR','gunstar-battlecruiser',t,spinal));
  const valid=copy(l);valid.EAR.frigate.mounts[0].faces=[1,4];assert.deepEqual(legacySpec('EAR','frigate',t,valid).mounts[0].arc,[1,4]);
  valid.EAR.frigate.mounts=[];assert.deepEqual(legacySpec('EAR','frigate',t,valid).mounts,[]);
});
check('Construction, recording and validation did not mutate any supplied or historical content',()=>assert.equal(JSON.stringify({t,l,beforeT,beforeL,approved}),untouched));
console.log(`Stock promotion passed: ${checks} groups, all 29 returns, 29 default recordings and 29 exact historical pinned comparisons.`);
