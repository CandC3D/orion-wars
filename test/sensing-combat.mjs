// C1b real-resolution tests. Fixture shaping is explicit and never edits stock.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const root=path.resolve(option('--source',fileURLToPath(new URL('../',import.meta.url))));
const mod=p=>import(pathToFileURL(path.join(root,p)));
const E=await mod('src/tactical/resolver.js'),S=await mod('src/tactical/ship.js'),C=await mod('src/tactical/contacts.js');
const N=await mod('src/tactical/sensing.js'),O=await mod('src/captains/observation.js'),T=await mod('src/captains/trusted.js');
const {makePrng}=await mod('src/prng.js');
const {allHoldOrders,validateOrders}=await mod('src/captains/orders.js');
const data=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const baseT=data('data/tactical-tuning.json'),baseL=data('data/loadouts.json'),clone=structuredClone;
const checks=[];let assertions=0;
const equal=(actual,expected,label)=>{assertions++;assert.deepEqual(actual,expected,label);};
const ok=(condition,label)=>{assertions++;assert.ok(condition,label);};
function check(name,fn){const details=fn();checks.push({name,...details});console.log(`ok: ${name}`);}
function world({faction='EAR',type='destroyer',enemyType='destroyer',gap=6,rating,finite=true,seed=61}={}){
  const tuning=clone(baseT),loadouts=clone(baseL),rng=makePrng(seed);
  tuning.explosion.enabled=false;tuning.toHit.target=-100;
  const a=S.buildShip('A-main',faction,type,tuning,loadouts,rng),b=S.buildShip('B-main','KRE',enemyType,tuning,loadouts,rng);
  a.pos={q:0,r:0};a.facing=0;b.pos={q:gap,r:0};b.facing=3;
  a.superstructure=a.superstructureMax=b.superstructure=b.superstructureMax=1000;
  if(rating!==undefined)a.hull.sensorRating=rating;
  const battle=E.createBattleFromFleets([[a],[b]],tuning,rng,{maxTurns:5,terrain:[]});
  if(finite)C.enableContacts(battle,{profile:N.SENSING_PROFILE});
  return {battle,a,b,tuning:battle.tuning,loadouts};
}
function add(w,id,rating,pos,side='A'){
  const ship=S.buildShip(id,'EAR','destroyer',w.tuning,w.loadouts,makePrng(1));
  ship.side=side;ship.pos=pos;ship.hull.sensorRating=rating;ship.superstructure=ship.superstructureMax=1000;
  w.battle[side].push(ship);return ship;
}
const action=(forward=0,turn=0)=>({turn,forward});
const hold=(plan=[action(),action(),action()],target='auto',reserve=0)=>({plan,target,reserve});
const orders=w=>Object.fromEntries(w.battle.fleets.flat().filter(s=>!s.destroyed).map(s=>[s.id,hold()]));
const beams=s=>{s.mounts=s.mounts.filter(m=>m.kind==='beam');};
const disable=s=>{s.mounts=[];if(s.squadrons)for(const q of s.squadrons)q.strength=0;};
function run(w,packet=orders(w),opts={}){
  const shots=[],log=[],frames=[];
  E.stepTurn(w.battle,packet,{onShot:e=>{shots.push(clone(e));opts.onShot?.(e);},log:m=>log.push(m),
    onRound:(turn,round)=>{frames.push({turn,round,state:T.fullState(w.battle),contacts:C.sideContacts(w.battle,'A')});opts.onRound?.(turn,round);}});
  return {shots,log,frames,state:T.fullState(w.battle)};
}
check('ordinary weapons require side support, including a blind receiver using another observer',()=>{
  for(const finite of [false,true]){
    const w=world({rating:0,finite});disable(w.b);beams(w.a);
    if(!finite)C.enableContacts(w.battle);
    const result=run(w);equal(result.shots.filter(e=>e.shooterId===w.a.id).length>0,!finite);
  }
  const w=world({rating:0});disable(w.b);beams(w.a);
  const observer=add(w,'A-spotter',1,{q:0,r:1});disable(observer);
  ok(run(w).shots.some(e=>e.shooterId===w.a.id),'blind gun uses friendly report');
});
check('range is finite and refreshed after real movement; a hidden selected target is not a firing oracle',()=>{
  const w=world({rating:1,gap:19});disable(w.b);beams(w.a);
  for(const m of w.a.mounts){m.maxRange=50;m.bands=[{to:50,toHitMod:0,damageBonus:0}];}
  const packet=orders(w);packet[w.a.id]=hold([action(),action(1),action()],w.b.id);
  equal(C.sideContacts(w.battle,'A').length,0);
  const r=run(w,packet);
  equal(r.shots.filter(s=>s.shooterId===w.a.id).map(s=>s.round),w.a.mounts.filter(m=>m.arc.includes(2)).map(()=>3));
  equal(r.frames[0].contacts.length,0);equal(r.frames[1].contacts.length,1);
  equal(w.a.pos,{q:1,r:0});
});
check('shared contact does not waive shooter line of fire or nebula engagement limits',()=>{
  for(const terrain of [[{type:'moon',q:3,r:0}],[{type:'asteroids',q:3,r:0}],[{type:'nebula',q:0,r:0}]]){
    const w=world({rating:0});disable(w.b);beams(w.a);
    const observer=add(w,'A-spotter',1,{q:6,r:-1});disable(observer);
    w.battle.terrain=terrain;w.tuning.battle.terrain=terrain;
    equal(C.sideContacts(w.battle,'A').length,1);
    equal(run(w).shots.filter(e=>e.shooterId===w.a.id).length,0);
  }
});
check('hidden hulls cannot start scripted keel charging; a supported legal ordered target still overrides doctrine',()=>{
  for(const visible of [false,true]){
    const w=world({type:'gunstar-battlecruiser',rating:visible?2:0,gap:12});disable(w.b);
    const packet=orders(w);delete packet[w.a.id]; // Scripted helm still uses proximity; commanded ships now require Prepare.
    const r=run(w,packet);
    equal(w.a.spinal.charge>0,visible);equal(r.log.some(l=>l.includes('capacitors cold')),!visible);
  }
  const w=world({type:'gunstar-battlecruiser',rating:0,gap:12});disable(w.b);
  const observer=add(w,'A-spotter',1,{q:6,r:1});disable(observer);
  w.a.spinal.state='ready';w.a.spinal.charge=999;w.a.spinal.readyTurns=0;
  const packet=orders(w);packet[w.a.id].target=w.b.id;
  const r=run(w,packet);ok(r.shots.some(e=>e.kind==='spinal'&&e.targetId===w.b.id));
});
check('warp acquisition uses the same contacts; hidden endpoints remain physical occupancy',()=>{
  for(const supported of [false,true]){
    const w=world({faction:'KRE',rating:0});disable(w.b);
    w.a.pos={q:6,r:-8};w.a.facing=3;w.b.pos={q:0,r:0};w.b.facing=0;
    w.tuning.helm.enabled=false;
    if(supported){const observer=add(w,'A-spotter',1,{q:0,r:1});disable(observer);}
    const packet=orders(w);packet[w.a.id]=hold([{turn:0,forward:0,warp:true},action(),action()],w.b.id,1);
    const r=run(w,packet);equal(w.a.warpedThisTurn,supported);
    if(!supported){equal(w.a.pos,{q:6,r:-8});ok(r.log.some(l=>l.includes('no visible contact')));}
  }
});
check('deck launch and raid acquisition ignore unsupported hulls',()=>{
  for(const supported of [false,true]){
    const w=world({faction:'KRE',type:'carrier',rating:0,gap:6});disable(w.b);
    if(supported){const observer=add(w,'A-spotter',1,{q:0,r:1});disable(observer);}
    const r=run(w);equal(w.a.squadrons.some(q=>q.launched),supported);
    equal(r.shots.some(e=>e.kind==='strike'&&e.shooterId===w.a.id),supported);
  }
});
check('a real beam destruction removes the sole observer before subsequent gun decisions',()=>{
  const w=world({rating:0});beams(w.a);beams(w.b);
  const observer=add(w,'A-spotter',1,{q:0,r:1});disable(observer);
  observer.superstructure=1;for(let f=1;f<=6;f++)observer.shieldDown[f]=true;
  const packet=orders(w);packet[w.b.id].target=observer.id;
  let deathIndex=null;const r=run(w,packet,{onShot(e){if(observer.destroyed&&deathIndex===null)deathIndex=e;}});
  ok(observer.destroyed);ok(deathIndex);
  const idx=r.shots.findIndex(e=>e.targetId===observer.id&&e.hit);
  ok(idx>=0);equal(r.shots.slice(idx+1).filter(e=>e.shooterId===w.a.id).length,0);
  equal(C.sideContacts(w.battle,'A'),[]);
});
check('normal beam damage disables spotting sensors before subsequent gun decisions',()=>{
  for(let seed=1;seed<=128;seed++){
    const w=world({rating:0,seed});beams(w.a);beams(w.b);
    const observer=add(w,'A-spotter',1,{q:0,r:1});disable(observer);
    observer.systems.sensors=w.tuning.damage.systemHitsToInoperative-1;
    for(let f=1;f<=6;f++)observer.shieldDown[f]=true;
    const packet=orders(w);packet[w.b.id].target=observer.id;
    let lostAt=-1,events=0;
    const r=run(w,packet,{onShot(){if(lostAt<0&&C.sensorAbility(observer,w.tuning)===0)lostAt=events;events++;}});
    if(lostAt<0)continue;
    equal(observer.destroyed,false);equal(C.sideContacts(w.battle,'A'),[]);
    equal(r.shots.slice(lostAt+1).filter(e=>e.shooterId===w.a.id).length,0);
    return {seed,searchCap:128,sensorHits:observer.systems.sensors};
  }
  assert.fail('No normal-fire sensor-disable fixture within 128 seeds');
});
check('no-contact scripted search depends on public map geometry, not concealed positions',()=>{
  const results=[];
  for(const pos of [{q:30,r:5},{q:-30,r:-5}]){
    const w=world({rating:1,gap:30});w.a.pos={q:-10,r:0};w.a.facing=0;w.b.pos=pos;disable(w.b);
    const r=run(w,{[w.b.id]:hold(undefined,'auto',1)});
    equal(r.shots.filter(e=>e.shooterId===w.a.id).length,0);
    results.push({own:clone(w.a),rng:w.battle.rng.state});
    ok(w.a.pos.q>-10,'public search makes progress');
  }
  equal(results[0],results[1]);
});
check('lock loss along a committed transit remains lost even after returning to range',()=>{
  const w=world({rating:2,gap:6});disable(w.a);disable(w.b);
  w.tuning.cloak.evadeChance=0; // isolate movement loss, not turn-start evasion
  w.b.canCloak=true;w.b.cloaked=true;w.b.detected=false;
  // Cloaked uncommanded helm is currently the legacy cloak-control path. Pin
  // it with a full reserve, no weapons and a six-hex separation (decloak at 4).
  equal(N.acquireScanLock(w.battle,w.a,w.b,2),true);
  const packet=orders(w);packet[w.b.id].reserve=1;
  packet[w.a.id]=hold([action(17),action(17,3),action()]);
  // Give this fixture a three-face turn rate and enough pool for the round trip.
  w.a.turnRate=3;w.a.movementPointRatio=0.1;
  const r=run(w,packet);equal(w.a.pos,{q:0,r:0});
  equal(w.battle.contacts.locks.A,[]);equal(C.sideContacts(w.battle,'A'),[]);
  equal(r.frames[0].contacts.length,0);
});
check('free burst steps and a field warp landing revoke the acquiring observer contribution',()=>{
  const w=world({faction:'ZAN',rating:2,gap:6});disable(w.a);disable(w.b);
  w.tuning.cloak.evadeChance=0;
  w.b.canCloak=true;w.b.cloaked=true;w.b.detected=false;
  equal(N.acquireScanLock(w.battle,w.a,w.b,2),true);
  w.a.turnRate=3;w.a.movementPointRatio=0.1;
  const packet=orders(w);packet[w.b.id].reserve=1;
  packet[w.a.id]=hold([{turn:0,forward:12,burst:5},action(17,3),action()]);
  run(w,packet);equal(w.a.pos,{q:0,r:0});equal(w.battle.contacts.locks.A,[]);equal(w.a.emergencyUsed,true);
  const x=world({faction:'KRE',rating:2});disable(x.b);x.tuning.helm.enabled=false;
  x.tuning.cloak.evadeChance=0;
  x.a.pos={q:6,r:-8};x.a.facing=3;x.b.pos={q:0,r:0};x.b.facing=0;
  x.b.canCloak=true;x.b.cloaked=true;x.b.detected=false;
  x.b.turnRate=0; // pin rear insertion geometry despite legacy cloak helm control
  // The target is off the forward-starboard sector of this approach.
  let acquired=false;for(let face=1;face<=6;face++)acquired=N.acquireScanLock(x.battle,x.a,x.b,face)||acquired;
  ok(acquired);
  x.battle.terrain=x.tuning.battle.terrain=[{type:'asteroids',q:-4,r:0}];
  const p=orders(x);p[x.b.id].reserve=1;p[x.a.id]=hold([{turn:0,forward:0,warp:true},action(),action()],x.b.id,1);
  const jumped=run(x,p);equal(x.a.warpedThisTurn,true,jumped.log.join('\n'));equal(x.a.pos,{q:-4,r:0});equal(x.battle.contacts.locks.A,[]);
});
check('missiles already launched still arrive after spotting sensors are lost',()=>{
  const w=world();disable(w.b);w.a.mounts=w.a.mounts.filter(m=>m.kind==='missile');
  w.tuning.pointDefence.chancePerPoint=0;w.tuning.toHit.missileClassInteraction.enabled=false;
  const first=run(w);ok(first.shots.some(e=>e.kind==='launch'));
  w.a.systems.sensors=w.tuning.damage.systemHitsToInoperative;
  equal(C.sideContacts(w.battle,'A'),[]);
  const second=run(w);ok(second.shots.some(e=>e.kind==='missile'&&e.outcome==='hit'));
  equal(second.shots.filter(e=>e.kind==='launch'&&e.shooterId===w.a.id).length,0);
});
check('finite observations are simultaneous and accepted packets resimulate state, RNG, shots and contacts',()=>{
  const create=()=>world({gap:24});const left=create(),right=create();
  // Existing special-proof pilot gate, not permission for uploaded controllers.
  const captain=view=>({orders:Object.fromEntries(view.own.filter(s=>!s.destroyed).map(s=>[s.id,
    hold([action(2),action(),action()],view.contacts[0]?.id??'auto')])),memory:{seen:view.contacts.map(c=>c.id)}});
  const session=T.createTrustedSession(left.battle,{A:captain,B:captain},{mode:'special-command-proof'});
  let turns=0;
  while(!left.battle.done){const a=T.stepTrusted(session),b=T.executePacket(right.battle,clone(a.packet));
    for(const key of ['state','shots','log','frames'])equal(a[key],b[key],key);turns++;}
  ok(turns>1);equal(session.packets.flatMap(p=>[...p.decisions.A.faults,...p.decisions.B.faults]),[]);
  return {turns,executions:turns*2};
});
check('contact observation callbacks are RNG-neutral and do not alias simulation state',()=>{
  const a=world(),b=world();const packet=orders(a);
  E.stepTurn(a.battle,clone(packet));
  E.stepTurn(b.battle,clone(packet),{onShot(){O.sideView(b.battle,'A');O.sideView(b.battle,'B');},
    onRound(){O.sideView(b.battle,'B');O.sideView(b.battle,'A');},log(){C.sideContacts(b.battle,'A');}});
  equal(T.fullState(a.battle),T.fullState(b.battle));
});
console.log(JSON.stringify({source:root,pass:true,groups:checks.length,assertions,checks},null,2));
