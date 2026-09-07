// Source-root-parameterized, real resolver tests for the explicit commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const arg=process.argv.indexOf('--source'),root=arg<0?fileURLToPath(new URL('..',import.meta.url)):path.resolve(process.argv[arg+1]);
const moduleAt=p=>import(pathToFileURL(path.join(root,p)));
const {buildShip,fullPower}=await moduleAt('src/tactical/ship.js');
const {createBattleFromFleets,previewOrders,stepTurn}=await moduleAt('src/tactical/resolver.js');
const {makePrng}=await moduleAt('src/prng.js');
const {enableContacts}=await moduleAt('src/tactical/contacts.js');
const {captainObservation}=await moduleAt('src/captains/observation.js');
const {validateOrders,allHoldOrders}=await moduleAt('src/captains/orders.js');
const {createTrustedSession,stepTrusted,executePacket,fullState}=await moduleAt('src/captains/trusted.js');
const {courseReadings}=await moduleAt('arena/command-model.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const T=read('data/tactical-tuning.json'),L=read('data/loadouts.json');
const clone=v=>structuredClone(v),hold=()=>({turn:0,forward:0});
const order=(action=hold(),reserve=0,target='auto')=>({plan:[action,hold(),hold()],reserve,target});
const rows=[];function check(name,fn){fn();rows.push(name);console.log('ok: '+name);}
function fixture(kind='warp'){
  const t=clone(T),rng=makePrng(181);t.battle.terrain=[];t.battle.map={shape:'rect',widthHexes:100,heightHexes:50};
  t.explosion.enabled=false;t.formation.enabled=false;t.helm.enabled=false;t.doctrine.dynamic.enabled=false;
  const a=buildShip('A-probe',kind==='warp'?'KRE':'ZAN','destroyer',t,L,rng),b=buildShip('B-target','EAR','destroyer',t,L,rng);
  a.pos=kind==='warp'?{q:6,r:-8}:{q:0,r:0};a.facing=kind==='warp'?3:0;b.pos=kind==='warp'?{q:0,r:0}:{q:30,r:0};b.facing=0;
  for(const s of [a,b])s.mounts.forEach(m=>{m.inop=true;});
  const battle=createBattleFromFleets([[a],[b]],t,rng);return {t,a,b,battle};
}
function run(f,o){
  const saved=JSON.stringify(f.battle),preview=previewOrders(f.battle,f.a.id,o);assert.equal(JSON.stringify(f.battle),saved,'forecast is read-only');
  const orders=Object.fromEntries(f.battle.fleets.flat().map(s=>[s.id,order(hold(),1)]));orders[f.a.id]=o;
  const log=[],shots=[],frames=[];stepTurn(f.battle,orders,{log:m=>log.push(m),onShot:e=>shots.push(e),onRound:()=>frames.push(clone(f.a))});
  return {preview,log,shots,frames};
}
function reconcile(r){for(let i=0;i<r.frames.length;i++){
  const frame=r.frames[i],p=r.preview.actions[i];assert.deepEqual(frame.pos,{q:p.end.q,r:p.end.r});assert.equal(frame.facing,p.end.facing);
  assert.equal(frame.power,p.power);assert.equal(frame.magazine,p.magazine);
  if(p.special){assert.equal(frame.superstructure,p.special.superstructure);assert.equal(frame.toHitPenalty,p.special.toHitPenalty);}
}}

check('Explicit warp uses the same insertion, heading, cost and reserve-spending rules as automatic warp',()=>{
  const f=fixture(),g=fixture();f.a.movementPointRatio=g.a.movementPointRatio=999;
  const r=run(f,order({turn:0,forward:0,warp:true},1,f.b.id));reconcile(r);
  let automatic;stepTurn(g.battle,{[g.b.id]:order(hold(),1)},{onRound:(_,round)=>{if(round===1)automatic=clone(g.a);}});
  assert.deepEqual(r.frames[0].pos,{q:-4,r:0});assert.deepEqual(r.frames[0].pos,automatic.pos);assert.equal(r.frames[0].facing,automatic.facing);
  assert.equal(r.frames[0].power,fullPower(f.a)-Math.round(fullPower(f.a)*f.t.warpJump.powerCostFraction));assert.equal(r.frames[0].power,automatic.power);
  assert.equal(r.preview.actions[0].special.executed,true);assert.equal(r.preview.route.filter(p=>p.warp).length,1);
  assert.equal(courseReadings(r.preview,order({turn:0,forward:0,warp:true}))[0].special,'warp');
});
for(const mode of ['enemy','moon','planet','asteroid','field','nebula','friendly'])check('Warp landing: '+mode,()=>{
  const f=fixture(),dest={q:-4,r:0};
  if(mode==='enemy'){const s=clone(f.b);s.id='B-block';s.pos=dest;f.battle.B.push(s);}
  else if(mode==='friendly'){const s=clone(f.a);s.id='A-mate';s.pos=dest;f.battle.A.push(s);}
  else f.t.battle.terrain=f.battle.terrain=[{type:mode==='field'?'asteroids':mode,...dest}];
  const r=run(f,order({turn:0,forward:0,warp:true},0,f.b.id)),allowed=['field','nebula','friendly'].includes(mode);reconcile(r);
  assert.equal(r.frames[0].warpedThisTurn,allowed);
  if(!allowed){assert.equal(r.frames[0].power,fullPower(f.a));assert.deepEqual(r.frames[0].pos,{q:6,r:-8});assert.ok(r.log.some(s=>s.includes('warp refused')));}
});
check('Warp target order is respected; a missing target never falls back to another enemy',()=>{
  const f=fixture(),b=clone(f.b);b.id='B-selected';b.pos={q:1,r:0};f.battle.B.push(b);
  const r=run(f,order({turn:0,forward:0,warp:true},0,b.id));reconcile(r);assert.deepEqual(f.a.pos,{q:-3,r:0});
  const missing=fixture(),r2=run(missing,order({turn:0,forward:0,warp:true},0,'B-gone'));reconcile(r2);assert.equal(missing.a.warpedThisTurn,false);
});
for(const mode of ['used','power','range','gain','near','unsupported','malformed'])check('Warp refusal: '+mode,()=>{
  const f=fixture(),o=order({turn:0,forward:0,warp:true},0,f.b.id);
  if(mode==='used')o.plan[1]={turn:0,forward:0,warp:true};
  if(mode==='power')f.t.warpJump.powerCostFraction=2;
  if(mode==='range')f.t.warpJump.rangeHexes=1;
  if(mode==='gain')f.t.warpJump.minGain=99;
  if(mode==='near')f.a.pos={q:3,r:0};
  if(mode==='unsupported')f.a.faction='EAR';
  if(mode==='malformed')o.plan[0].forward=2;
  const r=run(f,o);reconcile(r);assert.ok(r.log.some(s=>s.includes('warp refused')));
  if(mode==='used')assert.equal(r.frames[1].power,r.frames[0].power);
  else {assert.equal(f.a.warpedThisTurn,false);assert.equal(f.a.power,fullPower(f.a));}
});
check('Real shared fleet quota applies to simultaneous ordered jumpers, not one allowance each',()=>{
  const f=fixture();for(let i=1;i<4;i++){const mate=clone(f.a);mate.id='A-mate-'+i;f.battle.A.push(mate);}
  const orders={[f.b.id]:order(hold(),1)};for(const a of f.battle.A)orders[a.id]=order({turn:0,forward:0,warp:true});
  stepTurn(f.battle,orders);assert.equal(f.battle.A.filter(s=>s.warpedThisTurn).length,Math.floor(4*f.t.warpJump.fleetFraction));
});
check('Burst adds chosen free hexes to paid movement, with exactly one stress and penalty debit',()=>{
  const f=fixture('burst'),hp=f.a.superstructure;f.a.movementPointRatio=1;
  const r=run(f,order({turn:0,forward:2,burst:3}));reconcile(r);
  assert.deepEqual(f.a.pos,{q:5,r:0});assert.equal(f.a.power,fullPower(f.a)-2);assert.equal(f.a.superstructure,hp-f.t.emergencyManoeuvre.stressDamage);
  assert.equal(r.preview.route.filter(p=>p.burst).length,3);assert.equal(r.preview.actions[0].special.burstHexes,3);assert.equal(f.a.emergencyUsed,true);
});
for(const mode of ['power','moon','enemy-suffix','paid-then-enemy','transit','field','edge'])check('Burst path and zero-cost rule: '+mode,()=>{
  const f=fixture('burst'),hp=f.a.superstructure;f.a.movementPointRatio=1;let extra=3,forward=0,expected=3,free=3;
  if(mode==='power'){forward=2;}
  if(mode==='moon'){f.t.battle.terrain=[{type:'moon',q:1,r:0}];expected=free=0;}
  if(mode==='enemy-suffix'){f.b.pos={q:1,r:0};f.t.battle.terrain=[{type:'moon',q:2,r:0}];expected=free=0;}
  if(mode==='paid-then-enemy'){forward=1;f.b.pos={q:2,r:0};f.t.battle.terrain=[{type:'moon',q:3,r:0}];expected=1;free=0;}
  if(mode==='transit')f.b.pos={q:1,r:0};
  if(mode==='field')f.t.battle.terrain=[{type:'asteroids',q:1,r:0}];
  if(mode==='edge'){f.t.battle.map.widthHexes=2;expected=free=1;}
  f.battle.terrain=f.t.battle.terrain;
  const r=run(f,order({turn:0,forward,burst:extra},mode==='power'?1:0));reconcile(r);
  assert.deepEqual(f.a.pos,{q:expected,r:0});assert.equal(f.a.emergencyUsed,free>0);
  assert.equal(f.a.superstructure,hp-(free?f.t.emergencyManoeuvre.stressDamage:0));assert.equal(f.a.toHitPenalty,free?f.t.emergencyManoeuvre.toHitPenalty:0);
  assert.equal(f.a.power,fullPower(f.a)-(mode==='paid-then-enemy'?1:0));
});
check('Burst is once per turn, resets next turn, and death makes later forecast actions unavailable',()=>{
  const f=fixture('burst'),o=order({turn:0,forward:0,burst:2});o.plan[1]={turn:0,forward:0,burst:2};const r=run(f,o);reconcile(r);
  assert.deepEqual(f.a.pos,{q:2,r:0});assert.ok(r.log.some(s=>s.includes('already used')));
  run(f,order({turn:0,forward:0,burst:2}));assert.deepEqual(f.a.pos,{q:4,r:0});
  const doomed=fixture('burst');doomed.a.superstructure=1;const d=run(doomed,o);assert.equal(doomed.a.destroyed,true);assert.equal(d.preview.actions[1].unavailable,true);
});
check('Special actions never fire, including refused and turn-only actions',()=>{
  for(const kind of ['warp','burst']){const f=fixture(kind);f.a.mounts.forEach(m=>{m.inop=false;});f.b.pos={q:3,r:0};
    const action=kind==='warp'?{turn:0,forward:0,warp:true}:{turn:1,forward:0,burst:1};
    const r=run(f,order(action));assert.equal(r.shots.filter(s=>s.round===1&&s.shooterId===f.a.id).length,0);
  }
});
check('Captain validation clamps burst resources and rejects malformed or unsupported specials atomically',()=>{
  const f=fixture('burst');enableContacts(f.battle);const view=captainObservation(f.battle,'A'),orders={[f.a.id]:order({turn:0,forward:0,burst:99})};
  const good=validateOrders(view,orders);assert.equal(good.ok,true);assert.equal(good.orders[f.a.id].plan[0].burst,5);assert.equal(good.adjustments[0].requested,99);
  let getters=0;const evil={turn:0,forward:0};Object.defineProperty(evil,'burst',{enumerable:true,get(){getters++;return 1;}});
  for(const action of [{turn:0,forward:0,warp:true},{turn:0,forward:0,burst:'2'},{turn:0,forward:0,burst:1.5},{turn:0,forward:0,burst:Infinity},{turn:0,forward:0,burst:{count:1}},evil]){
    const r=validateOrders(view,{[f.a.id]:order(action)});assert.equal(r.ok,false);assert.deepEqual(r.orders,allHoldOrders(view));
  }assert.equal(getters,0);
  const w=fixture();enableContacts(w.battle);const wv=captainObservation(w.battle,'A');
  for(const action of [{turn:1,forward:0,warp:true},{turn:0,forward:2,warp:true},{turn:0,forward:0,warp:false},{turn:0,forward:0,warp:'true'},{turn:0,forward:0,warp:true,burst:0}])assert.equal(validateOrders(wv,{[w.a.id]:order(action)}).ok,false);
});
check('Reviewed special-proof captains produce reproducible packets; default pilot gate stays shut',()=>{
  for(const kind of ['warp','burst']){
    const a=fixture(kind),b=fixture(kind),captain=view=>({orders:Object.fromEntries(view.own.map(s=>[s.id,order(kind==='warp'?{turn:0,forward:0,warp:true}:{turn:0,forward:0,burst:3})])),memory:null});
    const passive=view=>({orders:allHoldOrders(view),memory:null});
    assert.throws(()=>createTrustedSession(a.battle,{A:captain,B:passive}));
    const session=createTrustedSession(a.battle,{A:captain,B:passive},{mode:'special-command-proof'});enableContacts(b.battle);
    const result=stepTrusted(session),replay=executePacket(b.battle,result.packet);
    assert.equal(result.packet.decisions.A.faults.length,0);assert.deepEqual(replay,result.state?{shots:result.shots,log:result.log,frames:result.frames,state:result.state}:result);
    assert.deepEqual(fullState(b.battle),fullState(a.battle));
    const c=fixture(kind);enableContacts(c.battle);const bad=clone(result.packet);bad.decisions.A.orders[c.a.id].plan[0].warp='yes';const before=fullState(c.battle);
    assert.throws(()=>executePacket(c.battle,bad));assert.deepEqual(fullState(c.battle),before);
  }
});
console.log(JSON.stringify({source:root,passed:true,groups:rows.length,checks:rows},null,2));
