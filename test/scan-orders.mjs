// Executed C1b Scan contract. All fixture shaping is local; no stock edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const root=path.resolve(option('--source',fileURLToPath(new URL('../',import.meta.url))));
const mod=p=>import(pathToFileURL(path.join(root,p)));
const E=await mod('src/tactical/resolver.js'),S=await mod('src/tactical/ship.js'),C=await mod('src/tactical/contacts.js');
const N=await mod('src/tactical/sensing.js'),O=await mod('src/captains/observation.js'),T=await mod('src/captains/trusted.js');
const V=await mod('src/captains/orders.js');
const {makePrng}=await mod('src/prng.js');
const data=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const baseT=data('data/tactical-tuning.json'),baseL=data('data/loadouts.json'),clone=structuredClone;
const checks=[];let assertions=0,executions=0;
const equal=(actual,expected,label)=>{assertions++;assert.deepEqual(actual,expected,label);};
const ok=(condition,label)=>{assertions++;assert.ok(condition,label);};
function check(name,fn){checks.push({name,...fn()});console.log(`ok: ${name}`);}
const idle=()=>({turn:0,forward:0}),scan=face=>({...idle(),scan:face});
const hold=(plan=[idle(),idle(),idle()],reserve=0)=>({plan,target:'auto',reserve});
function world({finite=true,cloaked=true,rating=2,gap=6,type='destroyer',faction='EAR'}={}){
  const tuning=clone(baseT),rng=makePrng(61);
  tuning.explosion.enabled=false;tuning.toHit.target=-100;tuning.cloak.evadeChance=0;
  const a=S.buildShip('A-main',faction,type,tuning,baseL,rng),b=S.buildShip('B-main','KRE','destroyer',tuning,baseL,rng);
  a.pos={q:0,r:0};a.facing=0;a.hull.sensorRating=rating;
  b.pos={q:gap,r:0};b.facing=3;b.hull.sensorRating=0;b.mounts=[];
  b.canCloak=cloaked;b.cloaked=cloaked;b.detected=!cloaked;b.turnRate=0;
  a.superstructure=a.superstructureMax=b.superstructure=b.superstructureMax=1000;
  const battle=E.createBattleFromFleets([[a],[b]],tuning,rng,{maxTurns:5,terrain:[]});
  C.enableContacts(battle,finite?{profile:N.SENSING_PROFILE}:{});
  return {battle,a,b,tuning:battle.tuning};
}
const packet=w=>({[w.a.id]:hold(),[w.b.id]:hold(undefined,1)});
function run(w,p=packet(w),options={}){
  const frames=[],log=[],shots=[];executions++;
  E.stepTurn(w.battle,p,{onShot:e=>{shots.push(clone(e));options.onShot?.(e);},
    log:message=>{log.push({round:frames.length+1,message});options.log?.(message);},
    onRound:(turn,round)=>{
      frames.push({turn,round,state:T.fullState(w.battle),contacts:clone(C.sideContacts(w.battle,'A'))});
      options.onRound?.(turn,round);
    }});
  return {frames,log,shots,state:T.fullState(w.battle)};
}
const sweeps=(r,id='A-main')=>r.log.filter(l=>l.message.startsWith(id+' sweeps arc'));
const ownShots=(r,id='A-main')=>r.shots.filter(s=>s.shooterId===id);
const terrain=(w,items)=>{w.battle.terrain=w.tuning.battle.terrain=items;};

check('six single-sector actions at all six headings; no implicit omnidirectional scan',()=>{
  // Independent axial vectors in face order, bow east. Rotation is an integer
  // cube transform, not the engine bearing/face tables used by the implementation.
  const vectors=[{q:6,r:-6},{q:6,r:0},{q:0,r:6},{q:-6,r:6},{q:-6,r:0},{q:0,r:-6}];
  for(let heading=0;heading<6;heading++)for(let face=1;face<=6;face++){
    const w=world();w.a.mounts=[];w.a.facing=heading;
    let v=clone(vectors[face-1]);for(let i=0;i<heading;i++)v={q:v.q+v.r,r:-v.q};
    w.a.pos={q:3,r:-2};w.b.pos={q:3+v.q,r:-2+v.r};
    const p=packet(w);p[w.a.id]=hold([scan(face%6+1),scan(face),scan(face)]);
    const r=run(w,p);
    equal(r.frames.map(f=>f.contacts.length),[0,1,1],`heading ${heading}, face ${face}`);
    equal(w.battle.contacts.locks.A,[{observerId:w.a.id,targetId:w.b.id}]);
    equal(w.b.detected,false,'finite scan never sets legacy global detected');
    equal(w.a.pos,{q:3,r:-2});equal(w.a.facing,heading);
    equal(w.a.power,S.fullPower(w.a));equal(ownShots(r),[]);
    equal(sweeps(r).map(l=>l.round),[1,2,3]);
  }
});
check('scan uses execution heading, consumes an action even with a legal shot, then enables later fire',()=>{
  const w=world();w.a.mounts=w.a.mounts.filter(m=>m.kind==='beam');
  const p=packet(w);p[w.a.id]=hold([scan(2),idle(),idle()]);
  const r=run(w,p);ok(ownShots(r).length>0);equal([...new Set(ownShots(r).map(s=>s.round))],[2]);
  equal(r.frames[0].state.fleets[0][0].power,S.fullPower(w.a));
  const x=world();x.a.mounts=[];
  const xp=packet(x);xp[x.a.id]=hold([{turn:1,forward:0},scan(2),scan(3)]);
  equal(run(x,xp).frames.map(f=>f.contacts.length),[0,0,1]);
  const visible=world({cloaked:false});const vp=packet(visible);vp[visible.a.id]=hold([scan(2),idle(),idle()]);
  const vr=run(visible,vp);equal(ownShots(vr).some(s=>s.round===1),false);ok(ownShots(vr).some(s=>s.round===2));
});
check('executed scans obey exact range, passive cap, terrain shadow and nebula; power reserve is not a fee',()=>{
  for(const row of [
    {gap:10,yes:true},{gap:11,yes:false},
    {gap:6,items:[{type:'moon',q:3,r:0}],yes:false},
    {gap:6,items:[{type:'asteroids',q:3,r:0}],yes:false},
    {gap:6,items:[{type:'asteroids',q:0,r:0}],yes:false},
    {gap:6,items:[{type:'nebula',q:3,r:0}],yes:false},
    {gap:3,items:[{type:'nebula',q:3,r:0}],yes:true},
    {gap:4,items:[{type:'nebula',q:4,r:0}],yes:false},
    {gap:6,passive:5,yes:false}
  ]){
    const w=world({gap:row.gap});w.a.mounts=[];
    if(row.items)terrain(w,row.items);
    if(row.passive){
      // Rebuild only this fixture before any execution; never replace a live profile.
      const profile=clone(N.DEFAULT_SENSING_PROFILE);profile.passiveRadiusHexes[2]=row.passive;
      w.battle.contacts=N.createSensingState(w.battle,profile);
    }
    const p=packet(w);p[w.a.id]=hold([scan(2),scan(2),scan(2)],1);
    const r=run(w,p);equal(r.frames[0].contacts.length>0,row.yes,JSON.stringify(row));
    equal(w.a.power,S.fullPower(w.a));equal(w.a.reserve,w.a.power);
    equal(sweeps(r).length,3);
  }
});
check('observation and human plan expose finite Scan availability; legacy shape and warp:false stay strict',()=>{
  const w=world(),view=O.sideView(w.battle,'A');
  equal(view.rules.orderContract,V.SENSING_ORDER_VERSION);equal(view.rules.scan.contract,'sector-scan/1');
  equal(view.rules.scan.faces,[1,2,3,4,5,6]);equal(view.rules.scan.powerCost,0);equal(view.rules.scan.actionCost,1);
  equal(view.own[0].sensors.scan,{available:true,reason:null});
  equal(E.shipPlan(w.battle,w.a.id).scan,view.own[0].sensors.scan);ok(Object.isFrozen(view.rules.scan.faces));
  for(const state of ['rating-one','damaged','cloaked','decloaking','destroyed']){
    const x=world();
    if(state==='rating-one')x.a.hull.sensorRating=1;
    if(state==='damaged')x.a.systems.sensors=x.tuning.damage.systemHitsToInoperative;
    if(state==='cloaked')x.a.cloaked=true;
    if(state==='decloaking')x.a.decloaking=true;
    if(state==='destroyed')x.a.destroyed=true;
    equal(O.sideView(x.battle,'A').own[0].sensors.scan.available,false,state);
  }
  const old=world({finite:false}),ov=O.sideView(old.battle,'A');
  equal(ov.contract,'captain-observation/2');equal(Object.hasOwn(ov.rules,'scan'),false);
  equal(Object.hasOwn(ov.own[0],'sensors'),false);equal(Object.hasOwn(E.shipPlan(old.battle,old.a.id),'scan'),false);
  const p=V.allHoldOrders(ov);p[old.a.id].plan[0]=scan(2);equal(V.validateOrders(ov,p).ok,false);
  const kre=world({faction:'KRE'}),kv=O.sideView(kre.battle,'A'),kp=V.allHoldOrders(kv);
  kp[kre.a.id].plan[0]={...idle(),warp:false};equal(V.validateOrders(kv,kp).ok,false);
});
check('packet structural failures are atomic, face enums are never resource-clamped, valid faces roundtrip',()=>{
  const w=world(),view=O.sideView(w.battle,'A'),before=T.fullState(w.battle);
  const invalid=[...[-1,0,7,2.5,'2',false,true,null,{},[]].map(scan),
    {...scan(2),forward:1},{...scan(2),forward:-1},{...scan(2),turn:1},
    {...scan(2),warp:true},{...scan(2),warp:false},{...scan(2),burst:0},
    {...scan(2),extra:1},{scan:2,turn:0},{scan:2,forward:0}];
  for(const action of invalid){
    const p=V.allHoldOrders(view);p[w.a.id].plan[1]=action;
    const result=V.validateOrders(view,p);equal(result.ok,false,JSON.stringify(action));
    equal(result.adjustments,[]);equal(result.orders,V.allHoldOrders(view));
    equal(T.fullState(w.battle),before);
    const accepted={turn:w.battle.turn,decisions:{A:{orders:p},B:{orders:V.allHoldOrders(O.sideView(w.battle,'B'))}}};
    assertions++;assert.throws(()=>T.executePacket(w.battle,accepted),/Corrupt/);
    equal(T.fullState(w.battle),before);
  }
  for(let face=1;face<=6;face++){
    const p=V.allHoldOrders(view);p[w.a.id].plan[0]=scan(face);p[w.a.id].reserve=2;
    const result=V.validateOrders(view,p);equal(result.ok,true);equal(result.orders[w.a.id].plan[0],scan(face));
    equal(result.orders[w.a.id].reserve,1);equal(result.adjustments.length,1);
  }
});
check('refused direct and stale scans never fall through to movement, warp, fire or automatic helm',()=>{
  for(const variant of ['legacy','rating-one','damaged','cloaked','decloaking','move','warp','burst','bad-face']){
    const w=world({cloaked:false,finite:variant!=='legacy'});let a=scan(2);
    if(variant==='rating-one')w.a.hull.sensorRating=1;
    if(variant==='damaged')w.a.systems.sensors=w.tuning.damage.systemHitsToInoperative;
    if(variant==='cloaked'){w.a.cloaked=true;w.a.hull.sensorRating=0;}
    if(variant==='decloaking')w.a.decloaking=true;
    if(variant==='move')a.forward=2;
    if(variant==='warp')a.warp=true;
    if(variant==='burst')a.burst=0;
    if(variant==='bad-face')a.scan=7;
    const p=packet(w);p[w.a.id]=hold([clone(a),clone(a),clone(a)]);
    const r=run(w,p);equal(w.a.pos,{q:0,r:0},variant);equal(ownShots(r),[]);equal(sweeps(r),[]);
    equal(r.log.filter(l=>l.message.startsWith('A-main scan refused:')).length,3,variant);
    equal(w.a.warpedThisTurn,false);equal(w.a.emergencyUsed,false);
  }
  // Accepted before the turn, but operational damage is rechecked when the
  // later action executes. Callback injection isolates the availability race.
  const w=world(),view=O.sideView(w.battle,'A'),p=packet(w);p[w.a.id]=hold([scan(2),scan(2),scan(2)]);
  equal(V.validateOrders(view,{[w.a.id]:p[w.a.id]}).ok,true);
  const r=run(w,p,{onRound(_turn,round){if(round===1)w.a.systems.sensors=w.tuning.damage.systemHitsToInoperative;}});
  equal(sweeps(r).length,1);equal(r.frames.map(f=>f.contacts.length),[1,0,0]);
  equal(w.battle.contacts.locks.A,[]);equal(ownShots(r),[]);
});
check('explicit reacquisition and independent observer ownership survive loss correctly',()=>{
  const w=world();w.a.mounts=[];
  const friend=S.buildShip('A-other','EAR','destroyer',w.tuning,baseL,makePrng(3));
  friend.side='A';friend.pos={q:0,r:0};friend.facing=0;friend.hull.sensorRating=2;friend.mounts=[];
  w.battle.A.push(friend);
  const p=packet(w);p[w.a.id]=hold([scan(2),scan(2),scan(2)]);p[friend.id]=hold([scan(2),idle(),idle()]);
  const r=run(w,p,{onRound(_turn,round){if(round===1)w.a.systems.sensors=w.tuning.damage.systemHitsToInoperative;}});
  equal(r.frames[0].contacts[0].observers.map(o=>o.observerId),['A-main','A-other']);
  equal(r.frames[1].contacts[0].observers.map(o=>o.observerId),['A-other']);
  equal(w.battle.contacts.locks.A,[{observerId:friend.id,targetId:w.b.id}]);
  const x=world();x.a.mounts=[];
  const xp=packet(x);xp[x.a.id]=hold([scan(2),idle(),scan(2)]);
  const xr=run(x,xp,{onRound(_turn,round){if(round===1)N.revokeTargetLocks(x.battle,x.b.id);}});
  equal(xr.frames.map(f=>f.contacts.length),[1,0,1]);
  // The same loss/reacquisition through actual turn-start cloak evasion.
  x.tuning.cloak.evadeChance=1;
  xp[x.a.id]=hold([idle(),idle(),scan(2)]);
  const evaded=run(x,xp);equal(evaded.frames.map(f=>f.contacts.length),[0,0,1]);
  ok(evaded.log.some(l=>l.message.includes('evades, contact lost')));
});
check('normal hostile fire disables the scanner and its later Scan actions refuse',()=>{
  for(let seed=1;seed<=128;seed++){
    const w=world({cloaked:false});w.battle.rng=makePrng(seed);
    const armed=S.buildShip('fixture','KRE','destroyer',w.tuning,baseL,makePrng(1));
    w.b.mounts=clone(armed.mounts.filter(m=>m.kind==='beam'));w.b.hull.sensorRating=2;
    w.a.systems.sensors=w.tuning.damage.systemHitsToInoperative-1;
    for(let face=1;face<=6;face++)w.a.shieldDown[face]=true;
    const p=packet(w);p[w.a.id]=hold([scan(2),scan(2),scan(2)]);p[w.b.id]=hold();p[w.b.id].target=w.a.id;
    const r=run(w,p);if(N.operationalSensorRating(w.a,w.tuning)!==0)continue;
    equal(w.a.destroyed,false);ok(r.shots.some(s=>s.shooterId===w.b.id&&s.hit));
    ok(r.log.some(l=>l.message.startsWith('A-main scan refused: operational')));
    equal(ownShots(r),[]);equal(sweeps(r).filter(l=>l.round===3),[]);
    return {seed,searchCap:128,sensorHits:w.a.systems.sensors};
  }
  assert.fail('No normal-fire sensor disable within bounded 128-seed fixture search');
});
check('AI scan cadence is action 3 only, ordered holds never auto-scan, hidden presence is not a trigger',()=>{
  const results=[];
  for(const cloaked of [false,true]){
    const w=world({cloaked,gap:40});w.a.mounts=[];w.a.pos={q:-10,r:0};
    const r=run(w,{[w.b.id]:hold(undefined,1)});
    equal(sweeps(r).map(l=>l.round),[3]);ok(sweeps(r)[0].message.includes('arc 2: 0 contact(s)'));
    results.push({ship:clone(w.a),sweeps:sweeps(r)});
  }
  equal(results[0],results[1]);
  for(const rounds of [2,3,4]){
    const w=world({gap:40});w.a.mounts=[];w.battle.rounds=rounds;
    const r=run(w,{[w.b.id]:hold(Array.from({length:rounds},idle),1)});
    equal(sweeps(r).map(l=>l.round),rounds>=3?[3]:[]);
  }
  const held=world();held.a.mounts=[];equal(sweeps(run(held)),[]);equal(C.sideContacts(held.battle,'A'),[]);
  const low=world({rating:1});low.a.mounts=[];equal(sweeps(run(low,{[low.b.id]:hold(undefined,1)})),[]);
  // Real blind sweep acquires forward contact on action 3, without an order.
  const hit=world();hit.a.mounts=[];const hr=run(hit,{[hit.b.id]:hold(undefined,1)});
  equal(hr.frames.map(f=>f.contacts.length),[0,0,1]);
});
check('action-3 firing legality includes magazine, power, offline state, spent mounts, geometry and keel readiness',()=>{
  const cases=['legal-beam','legal-missile','empty-magazine','insufficient-arm-power','zero-power','offline','spent','out-of-range','wrong-arc','no-band','body','same-hex','nebula','charging-keel','ready-keel'];
  for(const kind of cases){
    const keel=kind.endsWith('keel'),w=world({cloaked:false,type:keel?'gunstar-battlecruiser':'destroyer'});
    const mounts=clone(w.a.mounts);w.a.mounts=[];
    const r=run(w,{[w.b.id]:hold(undefined,1)},{onRound(_turn,round){if(round!==2)return;
      // Pin the action-3 decision fixture after two real earlier actions.
      w.a.pos={q:0,r:0};w.a.facing=0;w.b.pos={q:6,r:0};w.a.power=100;w.a.reserve=0;
      const family=keel?'spinal':kind.includes('missile')||kind.includes('magazine')||kind.includes('arm-power')?'missile':'beam';
      w.a.mounts=[clone(mounts.find(m=>m.kind===family))];const m=w.a.mounts[0];
      m.arc=[1,2,3,4,5,6];m.inop=false;m.firedThisTurn=false;m.maxRange=30;
      m.bands=[{to:30,toHitMod:0,damageBonus:0,damageMod:0}];w.a.magazine=10;
      if(kind==='empty-magazine')w.a.magazine=0;
      if(kind==='insufficient-arm-power')w.a.power=0.5;
      if(kind==='zero-power')w.a.power=0;
      if(kind==='offline')m.inop=true;
      if(kind==='spent')m.firedThisTurn=true;
      if(kind==='out-of-range')m.maxRange=5;
      if(kind==='wrong-arc')m.arc=[5];
      if(kind==='no-band')m.bands=[];
      if(kind==='body')terrain(w,[{type:'moon',q:3,r:0}]);
      if(kind==='same-hex')w.b.pos={q:0,r:0};
      if(kind==='nebula')terrain(w,[{type:'nebula',q:0,r:0}]);
      if(keel){w.a.spinal.state=kind==='ready-keel'?'ready':'charging';w.a.spinal.readyTurns=999;}
    }});
    const fires=['legal-beam','legal-missile','ready-keel'].includes(kind);
    equal(ownShots(r).some(s=>s.round===3),fires,kind);equal(sweeps(r).length,fires?0:1,kind);
    equal(w.a.pos,{q:0,r:0},kind+' neither scan nor shot moves');
    if(!fires)equal(w.a.power,kind==='zero-power'?0:kind==='insufficient-arm-power'?0.5:100,kind+' scan spends no power');
  }
});
check('AI selects from known reports rather than concealed centroid; a clear observer does not waive gun shadow',()=>{
  const w=world();w.a.mounts=[];
  const contact=S.buildShip('B-known','KRE','destroyer',w.tuning,baseL,makePrng(3));
  contact.side='B';contact.pos={q:-6,r:0};contact.facing=0;contact.mounts=[];contact.hull.sensorRating=0;
  w.battle.B.push(contact);
  const r=run(w,{[w.b.id]:hold(undefined,1),[contact.id]:hold(undefined,1)},
    {onRound(_turn,round){if(round===2){w.a.pos={q:0,r:0};w.a.facing=0;}}});
  equal(sweeps(r).map(l=>l.message),['A-main sweeps arc 5: 0 contact(s)']);
  equal(C.sideContacts(w.battle,'A').map(c=>c.id),[contact.id]);
  const x=world({cloaked:false});
  const observer=S.buildShip('A-spotter','EAR','destroyer',x.tuning,baseL,makePrng(1));
  observer.side='A';observer.pos={q:6,r:-1};observer.hull.sensorRating=2;observer.mounts=[];x.battle.A.push(observer);
  const mounts=clone(x.a.mounts.filter(m=>m.kind==='beam'));x.a.mounts=[];
  const xr=run(x,{[x.b.id]:hold(undefined,1),[observer.id]:hold()},
    {onRound(_turn,round){if(round!==2)return;
      x.a.pos={q:0,r:0};x.a.facing=0;x.a.mounts=mounts;for(const m of mounts)m.firedThisTurn=false;
      terrain(x,[{type:'moon',q:3,r:0}]);
      equal(C.sideContacts(x.battle,'A').map(c=>c.id),[x.b.id],'clear friendly spotter supports contact');
    }});
  equal(ownShots(xr),[]);equal(sweeps(xr).map(l=>l.message),['A-main sweeps arc 2: 0 contact(s)']);
});
check('full accepted Scan packets resimulate without controller execution; observer callbacks are inert',()=>{
  const left=world(),right=world();left.a.mounts=[];right.a.mounts=[];
  for(let turn=0;turn<3;turn++){
    const view=O.sideView(left.battle,'A'),orders=V.allHoldOrders(view);
    orders[left.a.id]=hold([scan(1),scan(2),idle()]);
    const accepted=V.validateOrders(view,orders);equal(accepted.ok,true);equal(accepted.adjustments,[]);
    const packet={turn:left.battle.turn,decisions:{A:accepted,B:V.validateOrders(O.sideView(left.battle,'B'),{[left.b.id]:hold(undefined,1)})}};
    const a=T.executePacket(left.battle,clone(packet)),b=T.executePacket(right.battle,clone(packet));executions+=2;
    equal(a,b);equal(C.sideContacts(left.battle,'A').length,1);
  }
  // Existing trusted pilot gate stays closed to cloaking hulls. Exercise its
  // controller/acceptance seam separately on supported ships, not by relaxing it.
  const x=world({cloaked:false}),y=world({cloaked:false});x.a.mounts=[];y.a.mounts=[];
  const controller=view=>({orders:Object.fromEntries(view.own.filter(s=>!s.destroyed).map(s=>[s.id,
    s.sensors.scan.available?hold([scan(2),idle(),scan(5)]):hold()])),memory:{turn:view.turn}});
  const session=T.createTrustedSession(x.battle,{A:controller,B:controller},{mode:'special-command-proof'});
  const actual=T.stepTrusted(session),replay=T.executePacket(y.battle,clone(actual.packet));executions+=2;
  equal(actual.state,replay.state);equal(actual.frames,replay.frames);equal(actual.log,replay.log);equal(actual.shots,replay.shots);
  equal(actual.packet.decisions.A.faults,[]);equal(actual.packet.decisions.B.faults,[]);
  const q=world(),z=world();q.a.mounts=[];z.a.mounts=[];
  const p=packet(q);p[q.a.id]=hold([scan(2),scan(1),scan(2)]);
  const a=run(q,clone(p)),b=run(z,clone(p),{log(){O.sideView(z.battle,'A');O.sideView(z.battle,'B');},onRound(){C.sideContacts(z.battle,'A');}});
  equal(a,b);
});
console.log(JSON.stringify({source:root,pass:true,groups:checks.length,assertions,executions,checks},null,2));
