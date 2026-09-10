// September 10 playtest engine contracts. Real resolution, restricted frames,
// independent geometry/roll assertions, and no browser implementation changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildShip, fullPower } from '../src/tactical/ship.js';
import { createBattleFromFleets, stepTurn, previewOrders, previewPublicStep, publicWeaponGeometry } from '../src/tactical/resolver.js';
import { enableContacts, sideContacts } from '../src/tactical/contacts.js';
import { SENSING_PROFILE, acquireScanLock } from '../src/tactical/sensing.js';
import { createMissileFlight, missilePosition } from '../src/tactical/missiles.js';
import { appraiseContact } from '../src/tactical/ship-command.js';
import { makePrng } from '../src/prng.js';
import { sideView } from '../src/captains/observation.js';
import { validateOrders } from '../src/captains/orders.js';
import { previewContactOrders } from '../src/captains/preview.js';
import { playerFrame, playerShot } from '../src/captains/player-view.js';
import { bindPlayerSession } from '../src/captains/player-session.js';
import { fullState, createTrustedSession, stepTrusted, executePacket } from '../src/captains/trusted.js';
import { approachCaptain } from '../src/captains/fixtures.js';
const T=JSON.parse(fs.readFileSync(new URL('../data/tactical-tuning.json',import.meta.url)));
const L=JSON.parse(fs.readFileSync(new URL('../data/loadouts.json',import.meta.url)));
const copy=structuredClone, idle=()=>({turn:0,forward:0});
const order=(action=idle(),extra={})=>({plan:[action,idle(),idle()],target:'auto',reserve:0,...extra});
let groups=0;
function check(name,fn){fn();groups++;console.log('ok: '+name);}
function world({finite=true,faction='EAR',hull='light-cruiser',gap=8}={}){
  const t=copy(T),rng=makePrng(41);
  t.battle.map={shape:'rect',widthHexes:100,heightHexes:100};t.battle.terrain=[];
  t.explosion.enabled=false;t.screening.maxChance=0;t.pointDefence.maxChance=0;
  t.toHit.target=-100;t.toHit.missileClassInteraction.enabled=false;
  t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};
  t.cloak.evadeChance=0;t.helm.enabled=false;t.formation.enabled=false;t.doctrine.dynamic.enabled=false;
  const a=buildShip('A-ship',faction,hull,t,L,rng),b=buildShip('B-ship','EAR','destroyer',t,L,rng);
  a.pos={q:0,r:0};a.facing=0;b.pos={q:gap,r:0};b.facing=3;
  for(const s of [a,b]){s.mounts.forEach(m=>m.inop=true);s.superstructure=s.superstructureMax=10000;s.reserve=0;}
  const battle=createBattleFromFleets([[a],[b]],t,rng,{terrain:[],maxTurns:5});
  enableContacts(battle,finite?{profile:SENSING_PROFILE}:{});
  return {t,rng,a,b,battle};
}
function addShip(w,side,id,pos,hull='destroyer'){
  const s=buildShip(id,'EAR',hull,w.t,L,makePrng(2));s.side=side;s.pos=pos;s.facing=side==='A'?0:3;
  s.mounts.forEach(m=>m.inop=true);s.superstructure=s.superstructureMax=10000;
  w.battle[side].push(s);return s;
}
const holdAll=w=>Object.fromEntries(w.battle.fleets.flat().filter(s=>!s.destroyed).map(s=>[s.id,order()]));
function armed(ship,kind){const m=ship.mounts.find(m=>m.kind===kind);assert.ok(m);m.inop=false;m.arc=[1,2,3,4,5,6];return m;}
function queue(w,target,source,damage=1){
  const missile={missileId:`missile:0:${w.battle.inFlight.length+1}`,targetId:target.id,shooterId:source.id,side:source.side,
    shooterPos:{...source.pos},shooterFacing:source.facing,weapon:'neutronic-missile',damage,spread:0,shooterPoints:0,
    flight:createMissileFlight(source.pos,target.pos,source.facing,0,3)};
  w.battle.inFlight.push(missile);return missile;
}
function killNext(w,target,source){target.superstructure=1;target.power=0;target.hull.pointDefence=0;queue(w,target,source,100000);}

check('Turn-after is strict and exclusive of scan/warp; invalid packets do not advance or draw',()=>{
  const w=world({faction:'KRE'}),view=sideView(w.battle,'A');
  for(const value of [false,0,1,'true',null,{},[]]){
    const packet={[w.a.id]:order({turn:1,forward:2,turnAfter:value})};
    assert.equal(validateOrders(view,packet).ok,false);
    const before=fullState(w.battle);assert.throws(()=>stepTurn(w.battle,packet),/turn-after/);assert.deepEqual(fullState(w.battle),before);
  }
  for(const special of ['scan','warp'])assert.equal(validateOrders(view,{[w.a.id]:order({turn:0,forward:0,turnAfter:true,[special]:special==='scan'?2:true})}).ok,false);
  const accepted=validateOrders(view,{[w.a.id]:order({turn:1,forward:2,turnAfter:true})});
  assert.equal(accepted.ok,true);assert.equal(accepted.orders[w.a.id].plan[0].turnAfter,true);
  assert.ok(!Object.hasOwn(accepted.orders[w.a.id].plan[1],'turnAfter'));
});
check('Turn-after moves on the old heading, rotates on arrival, and agrees with both previews',()=>{
  for(const after of [false,true])for(const forward of [0,3]){
    const w=world(),action={turn:1,forward,...(after?{turnAfter:true}:{})},o=order(action);
    const start=fullState(w.battle),publicPreview=previewContactOrders(sideView(w.battle,'A'),w.a.id,o);
    const ownPreview=previewPublicStep({...copy(w.a),turnRate:2},action,sideContacts(w.battle,'A'),w.t);
    assert.deepEqual(fullState(w.battle),start);
    let actual;stepTurn(w.battle,{...holdAll(w),[w.a.id]:o},{onRound:(_t,r)=>{if(r===1)actual=copy(w.a);}});
    const expected=after?{q:forward,r:0}:{q:forward,r:-forward||0};
    assert.deepEqual(actual.pos,expected);assert.equal(actual.facing,1);
    assert.deepEqual(publicPreview.actions[0].end,{...expected,facing:1});
    assert.deepEqual(ownPreview.ship.pos,expected);assert.equal(ownPreview.ship.facing,1);
    assert.equal(actual.power,fullPower(w.a)-forward*w.a.movementPointRatio);
    const legacy=world({finite:false}),forecast=previewOrders(legacy.battle,legacy.a.id,o);
    assert.deepEqual(forecast.actions[0].end,{...expected,facing:1});
  }
});
check('Clamps, blocked endpoints, planted keels and bursts retain the end turn',()=>{
  for(const mode of ['power','edge','body','enemy','keel','burst']){
    const w=world({faction:mode==='burst'?'ZAN':'EAR',hull:mode==='keel'?'gunstar-battlecruiser':'light-cruiser'});
    const action={turn:1,forward:3,turnAfter:true};
    if(mode==='power')w.a.reserve=w.a.power;
    if(mode==='edge')w.a.pos={q:50,r:0};
    if(mode==='body')w.t.battle.terrain=[{type:'moon',q:1,r:0}];
    if(mode==='enemy')w.b.pos={q:3,r:0};
    if(mode==='keel'){w.a.spinal.state='charging';w.a.spinal.charge=1;}
    if(mode==='burst'){action.forward=0;action.burst=1;}
    const p=previewPublicStep(w.a,action,[w.b],w.t);
    assert.equal(p.ship.facing,1,mode);
    if(mode==='power'||mode==='edge'||mode==='body'||mode==='keel')assert.deepEqual(p.ship.pos,w.a.pos,mode);
    if(mode==='enemy')assert.deepEqual(p.ship.pos,{q:2,r:0});
    if(mode==='burst'){assert.deepEqual(p.ship.pos,{q:1,r:0});assert.equal(p.ship.emergencyUsed,true);}
  }
});
check('Mount orders validate contact and mount identities, preserve the packet and reject atomically',()=>{
  const w=world(),m=w.a.mounts[0],view=sideView(w.battle,'A');
  for(const bad of [null,[],false,'hold',{missing:'hold'},{[m.id]:false},{[m.id]:0},{[m.id]:{}},{[m.id]:'auto'},{[m.id]:'hidden'}]){
    const packet={[w.a.id]:order(idle(),{mountOrders:bad})},before=fullState(w.battle);
    assert.equal(validateOrders(view,packet).ok,false);
    assert.throws(()=>stepTurn(w.battle,packet));assert.deepEqual(fullState(w.battle),before);
  }
  const packet={[w.a.id]:order(idle(),{mountOrders:{[m.id]:w.b.id}})},accepted=validateOrders(view,packet);
  assert.equal(accepted.ok,true,JSON.stringify(accepted.faults));assert.deepEqual(accepted.orders[w.a.id],packet[w.a.id]);
  accepted.orders[w.a.id].mountOrders[m.id]='hold';assert.equal(packet[w.a.id].mountOrders[m.id],w.b.id);
  assert.equal(validateOrders(view,{[w.a.id]:order(idle(),{mountOrders:{}})}).ok,true);
});
check('Beams and tubes split targets; held mounts spend no power, rounds or magazine',()=>{
  const w=world(),other=addShip(w,'B','B-other',{q:7,r:1});
  const beam=armed(w.a,'beam'),tube=armed(w.a,'missile');
  const extra=w.a.mounts.find(m=>m.kind==='beam'&&m!==beam);assert.ok(extra);extra.inop=false;extra.arc=[1,2,3,4,5,6];
  const orders=holdAll(w);orders[w.a.id]=order(idle(),{target:other.id,mountOrders:{[beam.id]:w.b.id,[tube.id]:other.id,[extra.id]:'hold'}});
  const magazine=w.a.magazine,events=[];
  stepTurn(w.battle,orders,{onShot:e=>events.push(e)});
  assert.deepEqual(events.filter(e=>e.shooterId===w.a.id).map(e=>[e.kind,e.targetId]),[['beam',w.b.id],['launch',other.id]]);
  assert.equal(w.a.magazine,magazine-1);assert.equal(extra.firedThisTurn,false);
  const held=world();for(const m of held.a.mounts){m.inop=false;m.arc=[1,2,3,4,5,6];}
  const reserve=held.a.magazine,orders2=holdAll(held);orders2[held.a.id].mountOrders=Object.fromEntries(held.a.mounts.map(m=>[m.id,'hold']));
  const shots=[];stepTurn(held.battle,orders2,{onShot:e=>shots.push(e)});
  assert.equal(shots.length,0);assert.equal(held.a.magazine,reserve);assert.equal(held.a.power,fullPower(held.a));
});
check('An illegal mount target falls back to the ship target, then doctrine; a lost contact is never fired on',()=>{
  for(const mode of ['arc','range','terrain','lost','destroyed']){
    const w=world(),other=addShip(w,'B','B-assigned',{q:6,r:0}),beam=armed(w.a,'beam');
    const orders=holdAll(w);orders[w.a.id]=order(idle(),{target:w.b.id,mountOrders:{[beam.id]:other.id}});
    let changed=false;const shots=[];
    stepTurn(w.battle,orders,{onState:(_t,_r,phase)=>{
      if(changed||phase!=='power')return;changed=true;
      if(mode==='arc'){beam.arc=[2];other.pos={q:-6,r:0};}
      if(mode==='range')other.pos={q:40,r:0};
      if(mode==='terrain'){other.pos={q:0,r:-6};w.t.battle.terrain=w.battle.terrain=[{type:'moon',q:0,r:-3}];}
      if(mode==='lost')other.cloaked=true;
      if(mode==='destroyed')other.destroyed=true;
    },onShot:e=>shots.push(e)});
    assert.equal(shots.find(e=>e.shooterId===w.a.id)?.targetId,w.b.id,mode);
    assert.ok(!shots.some(e=>e.targetId===other.id),mode);
  }
});
check('Keel mount assignment overrides ship target and light-target discipline, while hold preserves the bank',()=>{
  for(const hold of [false,true]){
    const w=world({hull:'gunstar-battlecruiser'}),mount=armed(w.a,'spinal'),capital=addShip(w,'B','B-capital',{q:7,r:0},'heavy-cruiser');
    w.a.spinal.state='ready';w.a.spinal.charge=w.t.weapons[w.a.spinal.type].chargeRequired;w.a.spinal.readyTurns=0;
    const orders=holdAll(w);orders[w.a.id]=order(idle(),{target:capital.id,mountOrders:{[mount.id]:hold?'hold':w.b.id}});
    const shots=[];stepTurn(w.battle,orders,{onShot:e=>shots.push(e)});
    const shot=shots.find(e=>e.kind==='spinal');
    if(hold){assert.equal(shot,undefined);assert.equal(w.a.spinal.state,'ready');assert.equal(mount.firedThisTurn,false);}
    else assert.equal(shot?.targetId,w.b.id);
  }
});
check('Mount holds expire with the packet; empty and absent mount maps produce identical full state',()=>{
  const a=world(),b=world();armed(a.a,'beam');armed(b.a,'beam');
  const orders=holdAll(a),empty=copy(orders);empty[a.a.id].mountOrders={};
  stepTurn(a.battle,orders);stepTurn(b.battle,empty);assert.deepEqual(fullState(a.battle),fullState(b.battle));
  const w=world(),beam=armed(w.a,'beam');
  const held=holdAll(w);held[w.a.id].mountOrders={[beam.id]:'hold'};stepTurn(w.battle,held);assert.equal(beam.firedThisTurn,false);
  stepTurn(w.battle,holdAll(w));assert.equal(beam.firedThisTurn,true);assert.ok(!Object.hasOwn(w.a,'mountOrders'));
});
check('Torpedoes expose only the own/visible-launcher course, follow homing, and leave warnings unchanged',()=>{
  const w=world(),tube=armed(w.a,'missile'),orders=holdAll(w);
  orders[w.b.id].plan=[idle(),{turn:1,forward:2},idle()];
  const frames=[];stepTurn(w.battle,orders,{onRound:()=>frames.push(sideView(w.battle,'A'))});
  const missile=w.battle.inFlight[0];assert.ok(missile);
  const outgoing=sideView(w.battle,'A').torpedoes[0],incoming=sideView(w.battle,'B').torpedoes[0];
  assert.deepEqual(outgoing,{id:missile.missileId,targetId:w.b.id,direction:'outgoing',arrival:'before-next-refill',launchPos:{q:0,r:0},pos:missilePosition(missile.flight)});
  assert.deepEqual(incoming,{...outgoing,direction:'incoming'});
  assert.ok(frames.some(f=>f.torpedoes[0]?.pos.r!==0));
  assert.deepEqual(sideView(w.battle,'B').incoming,[{targetId:w.b.id,arrival:'before-next-refill'}]);
  w.a.cloaked=true;const safe=sideView(w.battle,'B');
  assert.deepEqual(safe.torpedoes,[{id:missile.missileId,targetId:w.b.id,direction:'incoming',arrival:'before-next-refill'}]);
  missile.shooterPos={q:987,r:654};missile.flight.position.q+=456;w.a.pos={q:30,r:9};w.a.vesselName={full:'SECRET'};
  assert.deepEqual(sideView(w.battle,'B'),safe);
  assert.ok(Object.isFrozen(safe.torpedoes[0]));assert.ok(!('source' in safe.torpedoes[0]));
  tube.inop=true;stepTurn(w.battle,holdAll(w));assert.deepEqual(sideView(w.battle,'B').torpedoes,[]);
});
check('Visible losses persist as immutable wrecks, reject targets/appraisal, and reach the tape by vessel name',()=>{
  const w=world(),survivor=addShip(w,'B','B-survivor',{q:40,r:0});
  w.b.vesselName={prefix:'ISS',name:'Remembered',full:'ISS Remembered'};
  killNext(w,w.b,w.a);
  const result=bindPlayerSession(w.battle,'A').step({[w.a.id]:order()});assert.equal(result.ok,true);
  const wreck=result.frame.observation.contacts.find(c=>c.id===w.b.id);
  assert.deepEqual(wreck,{id:w.b.id,faction:w.b.faction,className:w.b.className,vesselName:w.b.vesselName,pos:{q:8,r:0},facing:3,destroyed:true,wreckedTurn:1});
  assert.equal(w.b.wreckedTurn,1);assert.ok(Object.isFrozen(wreck.pos));
  const losses=result.timeline.flatMap(t=>t.events).filter(e=>e.kind==='destruction');
  assert.deepEqual(losses,[{kind:'destruction',shipId:w.b.id,name:'ISS Remembered',turn:1,own:false}]);
  const view=result.frame.observation;
  assert.equal(validateOrders(view,{[w.a.id]:order(idle(),{target:w.b.id})}).ok,false);
  assert.equal(validateOrders(view,{[w.a.id]:order(idle(),{mountOrders:{[w.a.mounts[0].id]:w.b.id}})}).ok,false);
  assert.throws(()=>appraiseContact(wreck,view.rules.hullPoints),/wreck/);
  assert.equal(publicWeaponGeometry(w.a,w.a.mounts[0],wreck,w.t),'Destroyed');
  assert.equal(approachCaptain(view,null).orders[w.a.id].target,'auto');
  w.b.pos={q:900,r:800};w.b.facing=5;w.b.vesselName.full='CHANGED';w.a.systems.sensors=99;
  assert.deepEqual(sideContacts(w.battle,'A').find(c=>c.id===w.b.id),wreck);
  assert.ok(!JSON.stringify(sideContacts(w.battle,'A')).includes('CHANGED'));
  const observation=sideView(w.battle,'A'),before=fullState(w.battle);
  const preview=previewContactOrders(observation,w.a.id,order({turn:0,forward:8}));
  assert.deepEqual(fullState(w.battle),before);assert.equal(preview.actions[0].end.q,8,'wreck does not occupy a hostile movement endpoint');
  assert.equal(survivor.destroyed,false);
});
check('Unseen destruction discloses neither identity, position, wreck nor tape; own loss survives last-observer death',()=>{
  for(const previouslySeen of [false,true]){
    const w=world({gap:previouslySeen?8:40});addShip(w,'B','B-survivor',{q:41,r:1});
    if(previouslySeen){sideView(w.battle,'A');w.b.pos={q:40,r:0};}
    killNext(w,w.b,w.a);const result=bindPlayerSession(w.battle,'A').step({[w.a.id]:order()});
    assert.ok(w.b.destroyed);assert.deepEqual(result.frame.observation.contacts,[]);
    assert.ok(!result.timeline.flatMap(t=>t.events).some(e=>e.kind==='destruction'));
  }
  const w=world({gap:40});w.a.vesselName={full:'ISS Last Observer'};killNext(w,w.a,w.b);
  const result=bindPlayerSession(w.battle,'A').step({[w.a.id]:order()});
  assert.equal(result.frame.observation.own[0].wreckedTurn,1);
  assert.deepEqual(result.timeline.flatMap(t=>t.events).filter(e=>e.kind==='destruction'),[{kind:'destruction',shipId:w.a.id,name:'ISS Last Observer',turn:1,own:true}]);
  assert.equal(result.frame.result.victor,'B');
});
check('Scan-visible cloaked destruction is remembered after lock revocation; mere contact loss is not death',()=>{
  const w=world();w.a.hull.sensorRating=3;w.b.cloaked=true;w.b.canCloak=true;
  assert.equal(acquireScanLock(w.battle,w.a,w.b,2),true);killNext(w,w.b,w.a);
  stepTurn(w.battle,holdAll(w));assert.equal(w.battle.contacts.locks.A.length,0);
  assert.equal(sideContacts(w.battle,'A')[0].destroyed,true);
  const v=world();sideView(v.battle,'A');v.b.cloaked=true;assert.deepEqual(sideContacts(v.battle,'A'),[]);assert.equal(v.b.wreckedTurn,undefined);
});
check('Explosion victims and burst-stress deaths use the same observed destruction boundary',()=>{
  const w=world();w.t.explosion.enabled=true;w.t.explosion.radiusHexes=3;w.t.explosion.divisor=1;
  const dead=addShip(w,'B','B-bomb',{q:7,r:0});dead.destroyed=true;dead.power=100000;
  w.b.superstructure=1;w.b.power=0;
  const result=bindPlayerSession(w.battle,'A').step({[w.a.id]:order()});
  assert.equal(w.b.wreckedTurn,1);assert.ok(result.timeline.flatMap(t=>t.events).some(e=>e.kind==='destruction'&&e.shipId===w.b.id));
  const burst=world({faction:'ZAN'});burst.a.superstructure=1;
  const response=bindPlayerSession(burst.battle,'A').step({[burst.a.id]:order({turn:1,forward:0,burst:1,turnAfter:true})});
  assert.equal(burst.a.wreckedTurn,1);assert.equal(burst.a.facing,1);
  assert.ok(response.timeline.flatMap(t=>t.events).some(e=>e.kind==='destruction'&&e.own));
});
check('Beam, spinal and strike-craft kills report the same wreck and loss; crippling alone reports neither',()=>{
  for(const kind of ['beam','spinal','strike']){
    const w=world({hull:kind==='spinal'?'gunstar-battlecruiser':kind==='strike'?'carrier':'light-cruiser',faction:kind==='strike'?'KRE':'EAR'});
    w.b.superstructure=1;w.b.power=0;for(let face=1;face<=6;face++)w.b.shieldDown[face]=true;
    if(kind==='strike'){
      w.t.strikeCraft.types.interceptor.hitChance=1;w.t.strikeCraft.pdMaxKillChance=0;w.t.strikeCraft.tubeThreat=0;
    }else armed(w.a,kind);
    if(kind==='spinal'){w.a.spinal.state='ready';w.a.spinal.charge=w.t.weapons[w.a.spinal.type].chargeRequired;w.a.spinal.readyTurns=100;}
    const result=bindPlayerSession(w.battle,'A').step({[w.a.id]:order(idle(),{target:w.b.id})});
    assert.equal(w.b.wreckedTurn,1,kind);
    assert.equal(result.timeline.flatMap(t=>t.events).filter(e=>e.kind==='destruction'&&e.shipId===w.b.id).length,1,kind);
    assert.equal(result.frame.observation.contacts.find(c=>c.id===w.b.id)?.destroyed,true,kind);
  }
  const w=world();w.t.damage.crippling.enabled=true;w.t.damage.crippling.damageControlChance=0;
  killNext(w,w.b,w.a);const session=bindPlayerSession(w.battle,'A'),first=session.step({[w.a.id]:order()});
  assert.equal(w.b.crippled,true);assert.equal(w.b.destroyed,false);assert.equal(w.b.wreckedTurn,undefined);
  assert.ok(!first.timeline.flatMap(t=>t.events).some(e=>e.kind==='destruction'));
  queue(w,w.b,w.a,100000);const second=session.step({[w.a.id]:order()});
  assert.equal(w.b.wreckedTurn,2);assert.equal(second.timeline.flatMap(t=>t.events).filter(e=>e.kind==='destruction').length,1);
});
check('PD radius four is inclusive; one pooled draw names the living uncloaked defenders and spends no weapons',()=>{
  const w=world(),escort=addShip(w,'A','A-escort',{q:4,r:0}),far=addShip(w,'A','A-far',{q:5,r:0});
  const cloaked=addShip(w,'A','A-cloaked',{q:1,r:0}),dead=addShip(w,'A','A-dead',{q:1,r:1});
  w.a.hull.pointDefence=0;cloaked.cloaked=true;dead.destroyed=true;
  escort.hull.pointDefence=far.hull.pointDefence=cloaked.hull.pointDefence=dead.hull.pointDefence=1;
  escort.vesselName={full:'ISS Guardian'};w.t.pointDefence.maxChance=1;w.t.pointDefence.chancePerPoint=1;
  queue(w,w.a,w.b);let calls=0;const next=w.rng.next.bind(w.rng);w.rng.next=()=>{calls++;return next();};
  let interception;const power=escort.power,magazine=escort.magazine;
  stepTurn(w.battle,holdAll(w),{onShot:e=>{if(e.kind==='missile')interception={e,calls,power:escort.power,magazine:escort.magazine};}});
  assert.deepEqual(interception.e.defenderIds,[escort.id]);assert.equal(interception.calls,1);
  assert.equal(interception.power,power);assert.equal(interception.magazine,magazine);
  const frame=playerFrame(w.battle,'A'),safe=playerShot(interception.e,frame,frame);
  assert.deepEqual(safe.defenders,[{shipId:escort.id,name:'ISS Guardian'}]);assert.ok(!('source' in safe));
});
check('Enemy PD names require current contacts; hidden defenders cannot leak through an outgoing interception',()=>{
  const w=world({gap:17});w.a.hull.sensorRating=1;w.b.hull.pointDefence=0;
  const near=addShip(w,'B','B-known',{q:16,r:1}),hidden=addShip(w,'B','B-secret',{q:20,r:0});
  near.vesselName={full:'Seen Escort'};hidden.vesselName={full:'SECRET DEFENDER'};
  w.t.pointDefence.maxChance=1;w.t.pointDefence.chancePerPoint=1;
  queue(w,w.b,w.a);const events=[];let before;
  stepTurn(w.battle,holdAll(w),{onBeforeShot:()=>{before=playerFrame(w.battle,'A');},onShot:e=>events.push(playerShot(e,before,playerFrame(w.battle,'A')))});
  const safe=events.find(e=>e?.outcome==='intercepted');assert.deepEqual(safe.defenders,[{shipId:near.id,name:'Seen Escort'}]);
  assert.ok(!JSON.stringify(events).includes('SECRET'));assert.ok(!JSON.stringify(events).includes(hidden.id));assert.ok(!('source' in safe));
});
check('No cover draws nothing; CAP-only interception draws once and does not invent a PD defender',()=>{
  for(const cap of [false,true]){
    const w=world({faction:'KRE',hull:'carrier'});w.a.hull.pointDefence=0;
    w.t.strikeCraft.missileScreenPerCraft=1;w.t.strikeCraft.missileScreenMax=1;
    for(const q of w.a.squadrons){q.launched=cap;q.stance='defence';}
    queue(w,w.a,w.b);let calls=0,arrival;const next=w.rng.next.bind(w.rng);w.rng.next=()=>{calls++;return next();};
    stepTurn(w.battle,holdAll(w),{onShot:e=>{if(e.kind==='missile')arrival={e,calls};}});
    assert.equal(arrival.calls,cap?1:0);
    if(cap)assert.deepEqual(arrival.e.defenderIds,[]);else assert.ok(!Object.hasOwn(arrival.e,'defenderIds'));
  }
});
check('Trusted replay preserves new orders, all combat state, flight state and seeded draws',()=>{
  const a=world({finite:false}),b=world({finite:false});armed(a.a,'beam');armed(b.a,'beam');
  const controllers={A:view=>({orders:{[a.a.id]:order({turn:1,forward:1,turnAfter:true},{mountOrders:{[a.a.mounts[0].id]:'hold'}})},memory:null}),B:()=>({orders:{[a.b.id]:order()},memory:null})};
  const session=createTrustedSession(a.battle,controllers);
  for(let i=0;i<2;i++){const result=stepTrusted(session),replayed=executePacket(b.battle,result.packet);assert.deepEqual(replayed.state,result.state);assert.deepEqual(replayed.shots,result.shots);}
});
console.log(`Playtest engine: ${groups} groups passed.`);
