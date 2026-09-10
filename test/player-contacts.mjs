import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const root=path.resolve(process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:fileURLToPath(new URL('../',import.meta.url)));
const mod=p=>import(pathToFileURL(path.join(root,p)));
const E=await mod('src/tactical/resolver.js'),S=await mod('src/tactical/ship.js'),C=await mod('src/tactical/contacts.js'),N=await mod('src/tactical/sensing.js');
const O=await mod('src/captains/observation.js'),T=await mod('src/captains/trusted.js'),V=await mod('src/captains/orders.js');
const P=await mod('src/captains/player-view.js'),B=await mod('src/captains/player-session.js'),F=await mod('src/captains/preview.js');
const {makePrng}=await mod('src/prng.js');
const tuning=JSON.parse(fs.readFileSync(path.join(root,'data/tactical-tuning.json'))),loadouts=JSON.parse(fs.readFileSync(path.join(root,'data/loadouts.json')));
let assertions=0;const checks=[];
const equal=(a,b,n)=>{assertions++;assert.deepEqual(a,b,n);},ok=(c,n)=>{assertions++;assert.ok(c,n);};
const check=(name,fn)=>{const detail=fn();checks.push({name,...detail});console.log('ok: '+name);};
const idle=()=>({turn:0,forward:0}),scan=face=>({...idle(),scan:face});
const hold=plan=>({plan:plan??[idle(),idle(),idle()],target:'auto',reserve:0});
function world({gap=6,finite=true,rating=2,cloaked=false,seed=1}={}){
  const t=structuredClone(tuning),rng=makePrng(seed);t.toHit.target=-100;t.explosion.enabled=false;t.cloak.evadeChance=0;
  const a=S.buildShip('A-own','EAR','light-cruiser',t,loadouts,rng),b=S.buildShip('B-hidden-secret','KRE','destroyer',t,loadouts,rng);
  a.pos={q:0,r:0};a.facing=0;a.hull.sensorRating=rating;b.pos={q:gap,r:0};b.facing=3;b.mounts=[];b.hull.sensorRating=0;
  b.cloaked=cloaked;b.canCloak=cloaked;b.detected=!cloaked;b.turnRate=0;
  a.superstructure=a.superstructureMax=b.superstructure=b.superstructureMax=10000;
  const battle=E.createBattleFromFleets([[a],[b]],t,rng,{terrain:[],maxTurns:6});
  if(finite)C.enableContacts(battle,{profile:N.SENSING_PROFILE});
  return {battle,a,b,t:battle.tuning};
}
check('side frames have no hidden ship or engineering even when hidden worlds differ; pure frozen queries',()=>{
  const left=world({gap:40}),right=world({gap:40});
  right.b.id='B-other-secret';right.b.pos={q:-40,r:0};right.b.power=76543;right.b.reserve=9876;right.b.displayName='PRIVATE NAME';
  right.b.magazine=45678;right.b.weaponDefinitions={private:'TOP SECRET'};
  const before=T.fullState(left.battle),a=P.playerFrame(left.battle,'A'),b=P.playerFrame(right.battle,'A');
  equal(a,b);equal(T.fullState(left.battle),before);ok(Object.isFrozen(a.observation.own[0].pos));
  equal(a.observation.contacts,[]);ok(!JSON.stringify(b).includes('PRIVATE'));ok(!JSON.stringify(b).includes('B-other'));
  equal(a.result,null);equal(Object.keys(a).sort(),['format','maxTurns','observation','phase','result','round','turn']);
  const enemy=world(),frame=P.playerFrame(enemy.battle,'A');
  equal(Object.keys(frame.observation.contacts[0]).sort(),['className','facing','faction','id','observedDamage','observers','pos']);   // unnamed fleet
  ok(!('power' in frame.observation.contacts[0]));ok(!('design' in frame.observation.contacts[0]));
});
check('event projection omits hidden launch positions, victim faces, flight paths and raw damage',()=>{
  const w=world({gap:40}),before=P.playerFrame(w.battle,'A');
  const raw={kind:'missile',shooterId:w.b.id,targetId:w.a.id,victimId:w.a.id,shooterPos:{q:567,r:891},approachPos:{q:29,r:18},
    victimPos:{q:0,r:0},face:5,damage:765432,outcome:'hit',missileId:'SECRET FLIGHT',weapon:'SECRET WEAPON',flight:{path:[{secret:42}]}};
  const event=P.playerShot(raw,before,before);
  equal(event,{kind:'missile',direction:'incoming',outcome:'resolved',targetId:w.a.id,destination:{q:0,r:0},face:5});
  const outgoing=P.playerShot({...raw,shooterId:w.a.id,targetId:w.b.id,victimId:w.b.id,victimPos:w.b.pos},before,before);
  equal(outgoing,{kind:'missile',direction:'outgoing',outcome:'unconfirmed',shooterId:w.a.id});
  equal(P.playerShot({...raw,shooterId:'B-one',targetId:'B-two',victimId:'B-two'},before,before),null);
  const seen=world(),f=P.playerFrame(seen.battle,'A');
  const beam=P.playerShot({kind:'beam',shooterId:seen.b.id,shooterPos:seen.b.pos,targetId:seen.a.id,targetPos:seen.a.pos,face:2,damage:99},f,f);
  equal(beam.source,seen.b.pos);equal(beam.destination,seen.a.pos);equal(beam.face,2);ok(!('damage' in beam));
  const missile=P.playerShot({...raw,shooterId:seen.b.id},f,f);ok(!('source' in missile));ok(!('shooterId' in missile));
});
check('later contact acquisition never retroactively reveals an earlier shot; lost contacts carry no position',()=>{
  const w=world({gap:40}),before=P.playerFrame(w.battle,'A');
  const event={kind:'beam',shooterId:w.b.id,targetId:w.a.id,shooterPos:w.b.pos,targetPos:w.a.pos,hit:true};
  w.b.pos={q:6,r:0};const revealed=P.playerFrame(w.battle,'A');
  const visible=P.playerShot(event,before,revealed);ok(!('source' in visible));ok(!('shooterId' in visible));
  w.b.pos={q:40,r:5};const lost=P.playerFrame(w.battle,'A');
  equal(P.contactChanges(revealed,lost),[{kind:'contact-lost',contactId:w.b.id}]);
  const safe=P.playerShot({...event,shooterId:w.a.id,targetId:w.b.id,targetPos:w.b.pos},revealed,lost);
  ok(!('destination' in safe));equal(safe.outcome,'unconfirmed');
});
check('observation-only preview is invariant under hidden occupancy and engineering mutations',()=>{
  const a=world({rating:0}),b=world({rating:0});b.b.pos={q:2,r:0};b.b.power=9999;
  const p=hold([{turn:0,forward:2},scan(2),{turn:0,forward:3}]);
  // Rating zero cannot Scan; use a normal sequence for the hidden-occupancy proof.
  p.plan[1]=idle();
  const av=O.sideView(a.battle,'A'),bv=O.sideView(b.battle,'A');equal(av,bv);
  const before=T.fullState(a.battle),pa=F.previewContactOrders(av,a.a.id,p),pb=F.previewContactOrders(bv,b.a.id,p);
  equal(pa,pb);equal(T.fullState(a.battle),before);equal(pa.mode,'movement-ceiling/1');
  equal(pa.actions[0].end,{q:2,r:0,facing:0});ok(pa.caveat.includes('unseen traffic'));
  assertions++;assert.throws(()=>F.previewContactOrders(av,a.b.id,p),/Owned/);
  equal(F.previewContactOrders(av,a.a.id,hold([{turn:0,forward:0,scan:7},idle(),idle()])).valid,false);
});
check('movement ceiling shares execution arithmetic for turn, terrain, edge, reserve and known endpoint controls',()=>{
  for(const variant of ['clear','field','body','edge','reserve','contact']){
    const w=world({gap:6});w.a.mounts=[];
    if(variant==='field'||variant==='body'){const terrain=[{type:variant==='field'?'asteroids':'moon',q:2,r:0}];w.battle.terrain=w.t.battle.terrain=terrain;}
    if(variant==='edge'){w.a.pos={q:34,r:0};}
    const order=hold([{turn:0,forward:variant==='contact'?6:3},{turn:1,forward:1},idle()]);if(variant==='reserve')order.reserve=1;
    const forecast=F.previewContactOrders(O.sideView(w.battle,'A'),w.a.id,order),frames=[];
    E.stepTurn(w.battle,{[w.a.id]:order,[w.b.id]:{...hold(),reserve:1}},{onRound(){frames.push(structuredClone(w.a));}});
    for(let i=0;i<3;i++){equal(forecast.actions[i].end,{...frames[i].pos,facing:frames[i].facing},variant);equal(forecast.actions[i].powerCeiling,frames[i].power,variant);}
  }
});
check('side-bound host rejects malformed orders atomically, fills own holds and never exposes battle methods',()=>{
  const w=world(),session=B.bindPlayerSession(w.battle,'A'),before=T.fullState(w.battle);
  equal(Object.keys(session).sort(),['step','view']);
  const bad=session.step({[w.a.id]:hold([{turn:0,forward:2,scan:2},idle(),idle()])});equal(bad.ok,false);equal(T.fullState(w.battle),before);
  const foreign=session.step({[w.b.id]:hold()});equal(foreign.ok,false);equal(T.fullState(w.battle),before);
  const result=session.step({});equal(result.ok,true);ok(result.adjustments.some(a=>a.field==='omitted-ship'));
  ok(!JSON.stringify(result).includes('weaponDefinitions'));ok(!('battle' in result));ok(!('stats' in result));
});
check('real Scan acquisition is stored at event time; safe transcript resists later world mutation',()=>{
  const w=world({cloaked:true});w.a.mounts=[];const session=B.bindPlayerSession(w.battle,'A');
  const initial=session.view(),result=session.step({[w.a.id]:hold([scan(2),idle(),scan(5)])});
  equal(initial.observation.contacts,[]);ok(result.timeline.some(t=>t.events.some(e=>e.kind==='contact-acquired')));
  const text=JSON.stringify(result);w.b.pos={q:40,r:12};w.b.power=90099;equal(JSON.stringify(result),text);
  equal(initial.observation.contacts,[]);ok(Object.isFrozen(result.timeline[0].frame.observation));
});
check('real observer destruction stops endpoint disclosure for the next mounts and reports loss without inferred death',()=>{
  const w=world({rating:0,seed:4});
  const observer=S.buildShip('A-observer','EAR','destroyer',w.t,loadouts,makePrng(1));
  observer.side='A';observer.pos={q:0,r:1};observer.hull.sensorRating=1;observer.superstructure=1;observer.mounts=[];
  for(let face=1;face<=6;face++)observer.shieldDown[face]=true;w.battle.A.push(observer);
  const armed=S.buildShip(w.b.id,'KRE','destroyer',w.t,loadouts,makePrng(1));w.b.mounts=armed.mounts.filter(m=>m.kind==='beam');w.b.hull.sensorRating=2;
  const frames=[],before=[];let prior;
  E.stepTurn(w.battle,{[w.a.id]:hold(),[observer.id]:hold(),[w.b.id]:{...hold(),target:observer.id}},
    {onBeforeShot(){prior=P.playerFrame(w.battle,'A','event',1);before.push(prior);},onShot(e){const after=P.playerFrame(w.battle,'A','event',1);frames.push({after,safe:P.playerShot(e,prior,after)});}});
  ok(observer.destroyed);ok(frames.length>0);ok(before.some(f=>f.observation.contacts.length===1));
  const loss=frames.find(f=>f.after.observation.contacts.length===0);ok(loss);if(loss.safe)ok(!('source' in loss.safe));
  equal(P.playerFrame(w.battle,'A').observation.contacts,[]);
});
check('instrumentation and player projection preserve full state, PRNG and results in finite and compatibility worlds',()=>{
  for(const finite of [false,true])for(let seed=1;seed<=4;seed++){
    const a=world({finite,seed}),b=world({finite,seed});
    const orders={[a.a.id]:hold([{turn:0,forward:1},idle(),idle()]),[a.b.id]:hold()};
    E.stepTurn(a.battle,structuredClone(orders));let beforeCalls=0,shots=0,states=0;
    E.stepTurn(b.battle,structuredClone(orders),{onBeforeShot(){beforeCalls++;if(finite)P.playerFrame(b.battle,'A','event');},onShot(){shots++;if(finite)P.playerFrame(b.battle,'B','event');},onState(){states++;if(finite)P.playerFrame(b.battle,'A','action');}});
    equal(T.fullState(a.battle),T.fullState(b.battle));equal(beforeCalls,shots);ok(states>0);
  }
  const a=world(),b=world();const orders={[a.a.id]:hold([scan(2),idle(),idle()])};
  const accepted=V.validateOrders(O.sideView(a.battle,'A'),orders);E.stepTurn(a.battle,accepted.orders);
  B.bindPlayerSession(b.battle,'A').step(orders);equal(T.fullState(a.battle),T.fullState(b.battle));
});
check('terminal projection carries verdict without hidden survivor totals, raw score or pending course',()=>{
  const w=world({gap:40});w.battle.done=true;w.battle.result={victor:'B',pointsB:98765,survivorsB:4321,stats:{secret:1}};
  const f=P.playerFrame(w.battle,'A');equal(f.result,{victor:'B',reason:'Battle concluded',turns:0});
  ok(!JSON.stringify(f).includes('98765'));ok(!('inFlight' in f));
});
console.log(JSON.stringify({source:root,pass:true,groups:checks.length,assertions,checks},null,2));
