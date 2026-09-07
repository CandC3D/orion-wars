// Executable rulings, with a frozen-root old-behaviour reproduction mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const arg=process.argv.indexOf('--source'),root=arg<0?fileURLToPath(new URL('..',import.meta.url)):path.resolve(process.argv[arg+1]);
const expectOld=process.argv.includes('--expect-old'),moduleAt=p=>import(pathToFileURL(path.join(root,p)));
const {buildShip,applyDamage,startRound,shieldAbsorbable,fullPower}=await moduleAt('src/tactical/ship.js');
const {createBattleFromFleets,previewOrders,stepTurn,battleView}=await moduleAt('src/tactical/resolver.js');
const {stockPack,upgradeEngineering,compileDesign}=await moduleAt('src/construction/index.js');
const {snapshotShip}=await moduleAt('arena/record.js');
const {shields}=await moduleAt('arena/command-model.js');
const {engineering}=await moduleAt('drydock/model.js');
const {systemsSpecification}=await moduleAt('drydock/specifications.js');
const {makePrng}=await moduleAt('src/prng.js');
const {add}=await moduleAt('src/tactical/hex.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const T=read('data/tactical-tuning.json'),L=read('data/loadouts.json'),copy=v=>structuredClone(v);
const hold=()=>({turn:0,forward:0}),order=(target='auto',reserve=0)=>({plan:[hold(),hold(),hold()],target,reserve});
const checks=[];function check(name,fn){fn();checks.push(name);console.log('ok: '+name);}
function fixture(){
  const t=copy(T),rng=makePrng(991);t.battle.terrain=[];t.battle.map={shape:'rect',widthHexes:100,heightHexes:100};
  t.explosion.enabled=false;t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};
  t.doctrine.dynamic.enabled=false;t.helm.enabled=false;t.formation.enabled=false;
  const a=buildShip('A-gunstar','EAR','gunstar-battlecruiser',t,L,rng);
  const selected=buildShip('B-selected','EAR','frigate',t,L,rng),heavy=buildShip('B-heavy','EAR','battleship',t,L,rng);
  a.pos={q:0,r:0};a.facing=0;selected.pos={q:8,r:-1};heavy.pos={q:12,r:1};
  for(const s of [a,selected,heavy]){s.superstructure=s.superstructureMax=10000;s.mounts.forEach(m=>{m.inop=true;});}
  a.mounts.find(m=>m.kind==='spinal').inop=false;
  a.spinal.state='ready';a.spinal.charge=72;a.spinal.readyTurns=0;
  const battle=createBattleFromFleets([[a],[selected,heavy]],t,rng);
  return {t,rng,a,selected,heavy,battle};
}
function execute(f,o=order(f.selected.id)){
  const before=JSON.stringify(f.battle),preview=previewOrders(f.battle,f.a.id,o);
  assert.equal(JSON.stringify(f.battle),before,'forecast mutated live state/RNG');
  assert.deepEqual(preview,previewOrders(f.battle,f.a.id,o));
  const orders=Object.fromEntries(f.battle.fleets.flat().map(s=>[s.id,order('auto',1)]));orders[f.a.id]=o;
  const shots=[],log=[],frames=[];
  stepTurn(f.battle,orders,{onShot:e=>shots.push(copy(e)),log:m=>log.push(m),onRound:()=>frames.push(copy(f.a))});
  const fired=shots.filter(s=>s.kind==='spinal'&&s.shooterId===f.a.id);
  const forecast=preview.actions.flatMap(a=>a.mounts.filter(m=>m.kind==='spinal'&&m.eligible));
  assert.deepEqual(fired.map(s=>s.targetId),forecast.map(s=>s.targetId),'actual and forecast target mismatch');
  frames.forEach((s,i)=>assert.equal(s.power,preview.actions[i].power,'forecast allocation differs'));
  return {fired,forecast,log,preview,frames};
}
check('A legal selected picket overrides the heavier target and the capital-hold preference',()=>{
  const f=fixture(),r=execute(f),expected=expectOld?f.heavy.id:f.selected.id;
  assert.deepEqual(r.fired.map(s=>s.targetId),[expected]);assert.equal(f.a.spinal.shots,1);assert.equal(f.a.spinal.state,'cooldown');
  assert.equal(r.preview.weapons,f.t.weapons['photonic-cannon'].firePower);
});
check('A selected light target fires immediately even when no capital target is available',()=>{
  const f=fixture();f.heavy.destroyed=true;const r=execute(f);
  assert.equal(r.fired.length,expectOld?0:1);assert.equal(r.log.some(s=>s.includes('holds the photonic charge')),expectOld);
});
check('Automatic targeting still chooses the heaviest legal hull and holds for capitals as before',()=>{
  const f=fixture();assert.deepEqual(execute(f,order()).fired.map(s=>s.targetId),[f.heavy.id]);
  const g=fixture();g.heavy.destroyed=true;assert.equal(execute(g,order()).fired.length,0);
});
for(const mode of ['missing','friendly','destroyed','hidden','arc','range','same-hex','body','nebula'])check('Invalid selected target retains legal doctrine fallback: '+mode,()=>{
  const f=fixture();let id=f.selected.id;
  if(mode==='missing')id='B-missing';if(mode==='friendly')id=f.a.id;
  if(mode==='destroyed')f.selected.destroyed=true;
  if(mode==='hidden'){f.selected.cloaked=true;f.selected.detected=false;}
  if(mode==='arc')f.selected.pos={q:0,r:-8};
  if(mode==='range')f.selected.pos={q:70,r:0};
  if(mode==='same-hex')f.selected.pos={q:0,r:0};
  if(mode==='body'){f.selected.pos={q:8,r:0};f.heavy.pos={q:8,r:2};f.t.battle.terrain=[{type:'moon',q:4,r:0}];}
  if(mode==='nebula')f.t.battle.terrain=[{type:'nebula',...f.selected.pos}];
  assert.deepEqual(execute(f,order(id)).fired.map(s=>s.targetId),[f.heavy.id]);
});
for(const mode of ['charging','offline','cooldown','power','movement'])check('An explicit target cannot bypass firing restrictions: '+mode,()=>{
  const f=fixture(),o=order(f.selected.id);
  if(mode==='charging'){f.a.spinal.state='charging';f.a.spinal.charge=1;}
  if(mode==='offline')f.a.mounts.find(m=>m.kind==='spinal').inop=true;
  if(mode==='cooldown'){f.a.spinal.state='cooldown';f.a.spinal.cooldown=3;}
  if(mode==='power')o.reserve=1;
  if(mode==='movement')o.plan=[{turn:1,forward:0},{turn:-1,forward:0},{turn:1,forward:0}];
  assert.equal(execute(f,o).fired.length,0);
});
check('Target obedience rotates with the ship and does not change canonical beam arcs',()=>{
  for(let heading=0;heading<6;heading++){
    const f=fixture();f.a.facing=heading;f.selected.pos=add(f.a.pos,heading,8);f.heavy.pos=add(f.a.pos,heading,12);
    assert.deepEqual(execute(f).fired.map(s=>s.targetId),[expectOld?f.heavy.id:f.selected.id]);
  }
});
check('An omitted target on the following turn clears the previous target preference',()=>{
  const f=fixture();execute(f);f.a.spinal.state='ready';f.a.spinal.charge=72;f.a.spinal.readyTurns=0;
  assert.deepEqual(execute(f,order()).fired.map(s=>s.targetId),[f.heavy.id]);assert.equal(f.a.orderTarget,null);
});

function packFor(version,capacity,cost){
  let p=stockPack('EAR','frigate',T,L);p.design.hull.maxShieldPower=capacity;p.design.hull.shieldPointRatio=cost;p.design.mounts=[];
  if(version===2)p=upgradeEngineering(p,T);
  return p;
}
const hitRng={pick:()=> 'hull',int:()=>{throw new Error('No system consequence in isolated shield fixture');}};
let matrixCases=0;
for(const version of [1,2])check(`V${version}: cap and power constrain whole-point absorption across fractional capacities and costs`,()=>{
  for(const cap of [0,.5,1,1.5,3.75,8])for(const cost of [.25,.6,1.19,1.2]){
    const p=packFor(version,cap,cost),raw=JSON.stringify(p);
    for(const pool of [0,.24,.25,.59,1.19,2.4,9])for(const amount of [1,2,7]){
      const s=buildShip('A-shield','EAR','frigate',T,L,makePrng(33),p);s.power=pool;s.reserve=pool;
      const expected=expectOld?Math.min(cap,Math.floor(pool/cost)):Math.floor(Math.min(cap,pool/cost));
      assert.equal(shieldAbsorbable(s,2),expected);const hp=s.superstructure;
      const absorbed=expectOld?Math.min(amount,expected):Math.floor(Math.min(amount,expected));
      assert.deepEqual(applyDamage(s,2,amount,T,hitRng),{absorbed,internal:amount-absorbed});
      assert.equal(s.power,pool-absorbed*cost);assert.equal(s.shieldCap[2],cap-absorbed);assert.equal(s.superstructure,hp-amount+absorbed);
      if(!expectOld){assert.ok(Number.isInteger(absorbed));assert.ok(Number.isInteger(s.superstructure));}
      assert.equal(JSON.stringify(p),raw);matrixCases++;
    }
  }
});
check('Sub-point residual caps are not spendable and do not accumulate across hits or round resets',()=>{
  const p=packFor(2,1.5,.6),s=buildShip('A-shield','EAR','frigate',T,L,makePrng(1),p);s.power=10;
  applyDamage(s,2,1,T,hitRng);assert.equal(s.shieldCap[2],.5);
  const power=s.power;const result=applyDamage(s,2,1,T,hitRng);
  assert.deepEqual(result,expectOld?{absorbed:.5,internal:.5}:{absorbed:0,internal:1});
  assert.equal(s.power,power-(expectOld?.3:0));startRound(s);assert.equal(s.shieldCap[2],1.5);
  assert.equal(shieldAbsorbable(s,2),expectOld?1.5:1);
});
check('Down generators and shield bypass never spend power; fractional incoming damage is not rounded away',()=>{
  for(const bypass of [false,true]){
    const s=buildShip('A-shield','EAR','frigate',T,L,makePrng(1),packFor(2,4.5,.6));
    s.power=10;s.shieldDown[2]=!bypass;assert.deepEqual(applyDamage(s,2,3,T,hitRng,null,0,bypass),{absorbed:0,internal:3});assert.equal(s.power,10);
  }
  const s=buildShip('A-shield','EAR','frigate',T,L,makePrng(1),packFor(2,4.5,.6));
  assert.deepEqual(applyDamage(s,2,2.5,T,hitRng),expectOld?{absorbed:2.5,internal:0}:{absorbed:2,internal:.5});
});
check('Command readouts and engineering forecasts share the absorption rule without rewriting authored values',()=>{
  const p=packFor(2,.5,.6),r=engineering(p,T,L,{face:2,reserve:0,move:0}),s=systemsSpecification(p,r);
  assert.equal(r.shieldAbsorbable,expectOld?.5:0);assert.equal(s.shields[1].capacity,.5);assert.equal(s.shields[1].absorbable,expectOld?.5:0);
  const view=snapshotShip(r.ship),face=shields(view)[1];assert.equal(face.remaining,.5);assert.equal(face.absorbable,expectOld?.5:0);
  assert.equal(face.status,expectOld?'INTACT':'EXHAUSTED');
  for(const flag of ['destroyed','shieldsBypassed'])assert.equal(shields({...view,[flag]:true})[1].absorbable,0);
  assert.equal(compileDesign(p,T).shieldGenerators[2].capacity,.5);
});
check('An actual beam hit on a fractional shield uses the ruled absorption and preserves pinned recording values',()=>{
  const t=copy(T),rng=makePrng(59);t.explosion.enabled=false;t.toHit.target=-100;
  t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};t.screening.maxChance=0;
  const a=buildShip('A-beam','EAR','frigate',t,L,rng),p=packFor(2,1.5,.6),b=buildShip('B-shield','EAR','frigate',t,L,rng,p);
  a.pos={q:0,r:0};a.facing=0;b.pos={q:6,r:0};b.facing=3;a.mounts.forEach((m,i)=>{m.inop=i!==0;});
  const battle=createBattleFromFleets([[a],[b]],t,rng),hp=b.superstructure,shots=[],frames=[];
  stepTurn(battle,{[a.id]:order(b.id),[b.id]:order('auto',1)},{onShot:e=>shots.push(e),onRound:()=>frames.push(snapshotShip(b))});
  const shot=shots.find(s=>s.kind==='beam');assert.ok(shot?.hit);const absorbed=expectOld?1.5:1;
  assert.equal(b.superstructure,hp-shot.damage+absorbed);assert.equal(b.power,fullPower(b)-absorbed*.6);
  assert.equal(frames[0].shieldCap[2],1.5-absorbed);assert.deepEqual(frames[0].design,p);
});
console.log(JSON.stringify({source:root,expectOld,groups:checks.length,matrixCases,passed:true,checks},null,2));
