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

// The straight warp. Chris, 10 September 2026: "travel UP TO 8 hexes in a straight line, no turning,
// same restrictions to landing on non-play spaces." The fixture ship sits at (6,-8) heading 3 (-q).
const W=(forward=6)=>({turn:0,forward,warp:true});
check('Warp jumps straight down the heading, keeps it, pays the flat cost, and the forecast agrees',()=>{
  const f=fixture();const r=run(f,order(W(6),1,f.b.id));reconcile(r);
  assert.deepEqual(r.frames[0].pos,{q:0,r:-8});assert.equal(r.frames[0].facing,3);
  assert.equal(r.frames[0].power,fullPower(f.a)-Math.round(fullPower(f.a)*f.t.warpJump.powerCostFraction));
  assert.equal(r.preview.actions[0].special.executed,true);assert.equal(r.preview.route.filter(p=>p.warp).length,1);
  assert.equal(courseReadings(r.preview,order(W(6)))[0].special,'warp');
});
check('The target order plays no part: the same jump with any target, or none',()=>{
  for(const target of ['auto','B-target','B-gone']){const f=fixture();run(f,order(W(3),0,target));assert.deepEqual(f.a.pos,{q:3,r:-8},target);}
});
for(const mode of ['enemy','moon','planet','asteroid','field','nebula','friendly'])check('Warp landing: '+mode,()=>{
  const f=fixture(),dest={q:0,r:-8};
  if(mode==='enemy'){const s=clone(f.b);s.id='B-block';s.pos=dest;f.battle.B.push(s);}
  else if(mode==='friendly'){const s=clone(f.a);s.id='A-mate';s.pos=dest;f.battle.A.push(s);}
  else f.t.battle.terrain=f.battle.terrain=[{type:mode==='field'?'asteroids':mode,...dest}];
  const r=run(f,order(W(6),0,f.b.id)),allowed=['field','nebula','friendly'].includes(mode);reconcile(r);
  assert.equal(r.frames[0].warpedThisTurn,true);
  // "Up to": an illegal landing hex brings the ship out at the farthest legal hex short of it.
  // A planet fills seven hexes, so the ship comes out one hex further back than for a moon.
  const short=mode==='planet'?4:5;
  assert.deepEqual(r.frames[0].pos,allowed?dest:{q:6-short,r:-8});
  if(!allowed)assert.ok(r.log.some(s=>s.includes('ordered 6, landed '+short)));
});
for(const mode of ['used','power','range','zero','unsupported','turning','nowhere'])check('Warp refusal: '+mode,()=>{
  const f=fixture(),o=order(W(6),0,f.b.id);
  if(mode==='used')o.plan[1]=W(1);
  if(mode==='power')f.t.warpJump.powerCostFraction=2;
  if(mode==='range')o.plan[0]=W(f.t.warpJump.rangeHexes+1);
  if(mode==='zero')o.plan[0]=W(0);
  if(mode==='unsupported')f.a.faction='EAR';
  if(mode==='turning')o.plan[0]={...W(6),turn:1};
  if(mode==='nowhere'){o.plan[0]=W(1);f.t.battle.terrain=f.battle.terrain=[{type:'moon',q:5,r:-8}];}
  const r=run(f,o);reconcile(r);assert.ok(r.log.some(s=>s.includes('warp refused')),mode);
  if(mode==='used')assert.equal(r.frames[1].power,r.frames[0].power);
  else {assert.equal(f.a.warpedThisTurn,false);assert.equal(f.a.power,fullPower(f.a));assert.deepEqual(f.a.pos,{q:6,r:-8});}
});
check('No fleet quota: every ordered jumper jumps',()=>{
  const f=fixture();for(let i=1;i<4;i++){const mate=clone(f.a);mate.id='A-mate-'+i;mate.pos={q:6,r:-8+2*i};f.battle.A.push(mate);}
  const orders={[f.b.id]:order(hold(),1)};for(const a of f.battle.A)orders[a.id]=order(W(4));
  stepTurn(f.battle,orders);assert.equal(f.battle.A.filter(s=>s.warpedThisTurn).length,4);
});
check('The scripted helm jumps down its bow to just outside its preferred range, and never taxis',()=>{
  // Preferred range 4, landing offset 2: it comes out 6 hexes short of the contact.
  for(const [gap,expect] of [[12,6],[10,4],[14,8],[9,null],[16,null]]){
    const f=fixture();f.a.pos={q:gap,r:0};f.a.facing=3;f.b.pos={q:0,r:0};
    // Read the ship after the first action: later actions may close further by ordinary movement.
    let first;stepTurn(f.battle,{[f.b.id]:order(hold(),1)},{onRound:(_,r)=>{if(r===1)first=clone(f.a);}});
    if(expect===null)assert.equal(first.warpedThisTurn,false,'gap '+gap);
    else{assert.equal(first.warpedThisTurn,true,'gap '+gap);assert.deepEqual(first.pos,{q:gap-expect,r:0},'gap '+gap);}
  }
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
    const action=kind==='warp'?W(2):{turn:1,forward:0,burst:1};
    const r=run(f,order(action));assert.equal(r.shots.filter(s=>s.round===1&&s.shooterId===f.a.id).length,0);
  }
});
check('Captain validation clamps burst resources and rejects malformed or unsupported specials atomically',()=>{
  const f=fixture('burst');enableContacts(f.battle);const view=captainObservation(f.battle,'A'),orders={[f.a.id]:order({turn:0,forward:0,burst:99})};
  const good=validateOrders(view,orders);assert.equal(good.ok,true);assert.equal(good.orders[f.a.id].plan[0].burst,5);assert.equal(good.adjustments[0].requested,99);
  let getters=0;const evil={turn:0,forward:0};Object.defineProperty(evil,'burst',{enumerable:true,get(){getters++;return 1;}});
  for(const action of [W(2),{turn:0,forward:0,burst:'2'},{turn:0,forward:0,burst:1.5},{turn:0,forward:0,burst:Infinity},{turn:0,forward:0,burst:{count:1}},evil]){
    const r=validateOrders(view,{[f.a.id]:order(action)});assert.equal(r.ok,false);assert.deepEqual(r.orders,allHoldOrders(view));
  }assert.equal(getters,0);
  const w=fixture();enableContacts(w.battle);const wv=captainObservation(w.battle,'A');
  for(const action of [{...W(2),turn:1},W(0),W(9),W(1.5),W('2'),{turn:0,forward:0,warp:false},{turn:0,forward:2,warp:'true'},{...W(2),burst:0}])assert.equal(validateOrders(wv,{[w.a.id]:order(action)}).ok,false,JSON.stringify(action));
  for(const d of [1,4,8])assert.equal(validateOrders(wv,{[w.a.id]:order(W(d))}).ok,true,'distance '+d);
});
check('Reviewed special-proof captains produce reproducible packets; default pilot gate stays shut',()=>{
  for(const kind of ['warp','burst']){
    const a=fixture(kind),b=fixture(kind),captain=view=>({orders:Object.fromEntries(view.own.map(s=>[s.id,order(kind==='warp'?W(3):{turn:0,forward:0,burst:3})])),memory:null});
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
