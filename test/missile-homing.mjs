import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const index=process.argv.indexOf('--source');
const root=index<0?fileURLToPath(new URL('..',import.meta.url)):path.resolve(process.argv[index+1]);
const old=process.argv.includes('--expect-old'),mod=p=>import(pathToFileURL(path.join(root,p)));
const {buildShip}=await mod('src/tactical/ship.js');
const {createBattleFromFleets,stepTurn,previewOrders}=await mod('src/tactical/resolver.js');
const {stepTurn:playStep}=await mod('arena/play-engine.js');
const {makePrng}=await mod('src/prng.js');
const {snapshotShip,recordBuiltBattle}=await mod('arena/record.js');
const {eventShips}=await mod('arena/replay-geometry.js');
const {createTrustedSession,stepTrusted,executePacket,fullState}=await mod('src/captains/trusted.js');
const {captainObservation}=await mod('src/captains/observation.js');
const {enableContacts}=await mod('src/tactical/contacts.js');
const T=JSON.parse(fs.readFileSync(path.join(root,'data/tactical-tuning.json')));
const L=JSON.parse(fs.readFileSync(path.join(root,'data/loadouts.json')));
const copy=structuredClone,hold=()=>({turn:0,forward:0});
const order=(plan=[hold(),hold(),hold()],target='auto',reserve=0)=>({plan,target,reserve});
const checks=[];
function check(name,fn){fn();checks.push(name);console.log('ok: '+name);}
function fixture(seed=145,faction='EAR'){
  const t=copy(T),rng=makePrng(seed);
  t.battle.terrain=[];t.battle.map={shape:'rect',widthHexes:100,heightHexes:100};
  t.explosion.enabled=false;t.damage.facingTables={forward:['hull'],flank:['hull'],rear:['hull']};
  t.screening.maxChance=0;t.pointDefence.maxChance=0;t.toHit.missileClassInteraction.enabled=false;
  t.doctrine.dynamic.enabled=false;t.helm.enabled=false;t.formation.enabled=false;
  const a=buildShip('A-launcher',faction,'destroyer',t,L,rng),b=buildShip('B-target','EAR','destroyer',t,L,rng);
  a.cloaked=false;a.canCloak=false;
  a.pos={q:-8,r:0};a.facing=0;b.pos={q:0,r:0};b.facing=2;
  for(const s of [a,b]){s.superstructure=s.superstructureMax=10000;s.mounts.forEach(m=>m.inop=true);s.reserve=0;}
  const tube=a.mounts.find(m=>m.kind==='missile');assert.ok(tube);tube.inop=false;tube.arc=[1,2,3,4,5,6];
  const battle=createBattleFromFleets([[a],[b]],t,rng);
  return {t,rng,a,b,tube,battle};
}
const plans={a:order(),b:order([hold(),{turn:0,forward:6},{turn:1,forward:3}])};
function run(f,pa=plans.a,pb=plans.b){
  const events=[],frames=[];
  stepTurn(f.battle,{[f.a.id]:pa,[f.b.id]:pb},{onShot:e=>events.push(copy(e)),onRound:(turn,round,fleets,missiles)=>frames.push({turn,round,ships:fleets.flat().map(snapshotShip),missiles:copy(missiles??[])})});
  return {events,frames};
}
// Independent angular oracle; exact seam families are assigned to the CCW
// sector explicitly by the tiny angular tie offset, not the engine's table sort.
function face(victim,from){
  const q=from.q-victim.pos.q,r=from.r-victim.pos.r;
  let degrees=Math.atan2(-Math.sqrt(3)*r,2*q+r)*180/Math.PI;
  if(degrees<0)degrees+=360;
  const direction=Math.floor((degrees+30)/60+1e-10)%6;
  return [2,1,6,5,4,3][(direction-victim.facing+6)%6];
}
function moving(){
  const f=fixture(),r=run(f),launch=r.events.find(e=>e.kind==='launch');assert.ok(launch);
  const queued=copy(f.battle.inFlight[0]),victim=copy(f.b);
  f.a.mounts.forEach(m=>m.inop=true);
  const arrivals=run(f,order(),order()).events.filter(e=>e.kind==='missile');assert.equal(arrivals.length,1);
  return {f,r,launch,queued,victim,hit:arrivals[0]};
}
check('A moving target is struck from the missile approach, not the launch hex; impact is next turn',()=>{
  const {r,launch,victim,hit}=moving();
  assert.ok(!r.events.some(e=>e.kind==='missile'));assert.equal(hit.turn,launch.turn+1);assert.equal(hit.outcome,'hit');
  if(old){assert.equal(hit.flight,undefined);assert.equal(hit.face,face(victim,launch.shooterPos));return;}
  assert.equal(hit.flight.profile,'timed-homing/1');assert.notEqual(face(victim,hit.approachPos),face(victim,launch.shooterPos));
  assert.equal(hit.face,face(victim,hit.approachPos));assert.deepEqual(hit.shooterPos,launch.shooterPos);
});
if(old){console.log(JSON.stringify({source:root,expectOld:true,groups:checks.length,passed:true}));process.exit(0);}
const {createMissileFlight,advanceMissileFlights,missileImpactFace,missilePosition,snapshotMissiles}=await mod('src/tactical/missiles.js');
const {missileTrack,sampleMissileTrack,courseLegs}=await mod('arena/missile-tracks.js');
check('Every launch action uses the remaining course samples plus one final impact leg',()=>{
  for(const rounds of [1,2,3,4,6])for(let launchRound=1;launchRound<=rounds;launchRound++){
    const flight=createMissileFlight({q:0,r:0},{q:24,r:0},0,1,launchRound);
    const m={targetId:'target',flight},target={id:'target',pos:{q:24,r:0}};
    const steps=rounds-launchRound+2;
    for(let round=launchRound;round<=rounds;round++){
      advanceMissileFlights([m],[[target]],1,round,rounds);
      assert.equal(missilePosition(flight).q,24*(round-launchRound+1)/steps);
      assert.ok(missilePosition(flight).q<24);
    }
    assert.equal(flight.path.length,steps);
  }
});
check('Real launches in A1, A2 and A3 arrive at the same next-turn IMPACTS phase, never early',()=>{
  for(let launchRound=1;launchRound<=3;launchRound++){
    const f=fixture();const plan=[hold(),hold(),hold()];
    for(let r=0;r<launchRound-1;r++)plan[r]={turn:r===0?1:-1,forward:0};
    const r=run(f,order(plan),order());const launch=r.events.find(e=>e.kind==='launch');assert.equal(launch.round,launchRound);
    assert.equal(f.battle.inFlight[0].flight.path.length,5-launchRound);
    assert.equal(r.events.filter(e=>e.kind==='missile').length,0);
    f.a.mounts.forEach(m=>m.inop=true);const before=f.b.power;
    let atHit;
    stepTurn(f.battle,{[f.a.id]:order(),[f.b.id]:order()}, {onShot:e=>{if(e.kind==='missile')atHit={e,power:f.b.power};}});
    assert.equal(atHit.e.turn,2);assert.ok(atHit.power<=before,'impact occurs before any refill');
  }
});
check('Both stock missile families use the same timed course, without changing their own arming cost or damage',()=>{
  const types=new Set();
  for(const faction of ['EAR','KRE','VRA','ZAN']){
    const f=fixture(145,faction),magazine=f.a.magazine,beforePower=f.a.power;
    const first=run(f,order(),order()),launch=first.events.find(e=>e.kind==='launch');assert.ok(launch);types.add(launch.weapon);
    const weapon=f.a.weaponDefinitions?.[launch.weapon]??f.t.weapons[launch.weapon];
    assert.equal(f.a.power,beforePower-weapon.powerToArm);assert.equal(f.a.magazine,magazine-1);
    assert.deepEqual(f.battle.inFlight[0].flight.path.map(p=>p.pos),[{q:-8,r:0},{q:-6,r:0},{q:-4,r:0},{q:-2,r:0}]);
    f.a.mounts.forEach(m=>m.inop=true);const arrival=run(f,order(),order()).events.find(e=>e.kind==='missile');
    assert.equal(arrival.weapon,launch.weapon);assert.equal(arrival.damage,launch.damage);
  }
  assert.deepEqual([...types].sort(),['neutronic-missile','plasma-torpedo']);
});
check('Recorded course vertices equal an independently recomputed weighted pursuit of each action-end target',()=>{
  const {r,launch,hit}=moving();let pos=copy(launch.shooterPos);
  for(const frame of r.frames){
    const target=frame.ships.find(s=>s.id===launch.targetId),segments=5-frame.round;
    pos={q:pos.q+(target.pos.q-pos.q)/segments,r:pos.r+(target.pos.r-pos.r)/segments};
    const actual=frame.missiles.find(m=>m.missileId===launch.missileId);
    assert.ok(Math.abs(actual.pos.q-pos.q)<1e-10);assert.ok(Math.abs(actual.pos.r-pos.r)<1e-10);
    assert.deepEqual(actual.flight.path,hit.flight.path.slice(0,frame.round+1));
  }
  assert.deepEqual(hit.approachPos,r.frames.at(-1).missiles[0].pos);
});
check('Exact seam faces survive six rotations, translated launches and rational course positions',()=>{
  const rotate=p=>({q:p.q+p.r,r:-p.q});let cases=0;
  for(const initial of [{q:2,r:-1},{q:1,r:1},{q:1,r:-2},{q:3,r:1},{q:-5,r:3}]){
    let source=initial;
    for(let rotation=0;rotation<6;rotation++,source=rotate(source))for(const shift of [{q:0,r:0},{q:17,r:-23},{q:-100,r:81}]){
      const victim={id:'v',pos:shift,facing:rotation},from={q:source.q+shift.q,r:source.r+shift.r};
      const m={targetId:'v',flight:createMissileFlight(from,shift,rotation,1,1)};
      for(let round=1;round<=3;round++){
        advanceMissileFlights([m],[[victim]],1,round,3);
        assert.equal(missileImpactFace(m,victim),face({pos:{q:0,r:0},facing:rotation},source));cases++;
      }
    }
  }
  assert.equal(cases,270);
});
check('Moving or destroying the launcher after launch cannot change the final approach',()=>{
  const a=fixture(),b=fixture();run(a);run(b);b.a.pos={q:30,r:20};b.a.facing=5;
  // Keep an allied survivor so destroying the launcher does not end the battle.
  const escort=buildShip('A-survivor','EAR','frigate',b.t,L,b.rng);escort.pos={q:-20,r:20};escort.mounts.forEach(m=>m.inop=true);escort.side='A';b.battle.A.push(escort);
  b.a.destroyed=true;a.a.mounts.forEach(m=>m.inop=true);
  const hitA=run(a,order(),order()).events.find(e=>e.kind==='missile');
  const shots=[];stepTurn(b.battle,{[b.a.id]:order(),[b.b.id]:order(),[escort.id]:order()},{onShot:e=>shots.push(e)});
  const hitB=shots.find(e=>e.kind==='missile');assert.equal(hitB.face,hitA.face);assert.deepEqual(hitB.flight,hitA.flight);assert.deepEqual(hitB.approachPos,hitA.approachPos);
});
check('A coincident impact uses the last nonzero approach, with launch heading only for a coincident launch',()=>{
  const victim={id:'v',pos:{q:0,r:0},facing:0};
  const m={targetId:'v',flight:createMissileFlight({q:-8,r:0},victim.pos,0,1,1)};
  advanceMissileFlights([m],[[victim]],1,1,3);victim.pos=missilePosition(m.flight);
  assert.equal(missileImpactFace(m,victim),5);
  const colocated={flight:createMissileFlight(victim.pos,victim.pos,2,1,1)};
  assert.equal(missileImpactFace(colocated,victim),3);
});
check('Screening uses the actual victim position and heading, preserving the intended target',()=>{
  const f=fixture();f.t.screening.maxChance=1;f.t.screening.chancePerScreenPoint=1;
  const escort=buildShip('B-screen','EAR','frigate',f.t,L,f.rng);escort.pos={q:0,r:1};escort.facing=4;escort.mounts.forEach(m=>m.inop=true);escort.side='B';
  // The existing rule screens a target without its own screening rating.
  f.b.hull.screen=0;f.battle.B.push(escort);
  const orders={[f.a.id]:order(),[f.b.id]:order(),[escort.id]:order()};
  stepTurn(f.battle,orders);assert.ok(f.battle.inFlight.length);f.a.mounts.forEach(m=>m.inop=true);
  const shots=[];stepTurn(f.battle,orders,{onShot:e=>shots.push(e)});const hit=shots.find(e=>e.kind==='missile');
  assert.equal(hit.targetId,f.b.id);assert.equal(hit.victimId,escort.id);assert.equal(hit.face,face(escort,hit.approachPos));
  assert.deepEqual(eventShips(hit,()=>null).target.pos,escort.pos);
});
check('Dedicated point defence rolls once at arrival and never consumes an anti-ship beam mount',()=>{
  const f=fixture();f.t.pointDefence.maxChance=1;f.t.pointDefence.chancePerPoint=1;
  const first=run(f,order(),order());assert.equal(first.events.filter(e=>e.kind==='missile').length,0);
  f.a.mounts.forEach(m=>m.inop=true);const beam=f.b.mounts.find(m=>m.kind==='beam');beam.inop=false;beam.arc=[1,2,3,4,5,6];
  let calls=0,atArrival;const random=f.rng.next.bind(f.rng);f.rng.next=()=>{calls++;return random();};
  const events=[];stepTurn(f.battle,{[f.a.id]:order(),[f.b.id]:order()},{onShot:e=>{events.push(e);if(e.kind==='missile')atArrival={calls,power:f.b.power,fired:beam.firedThisTurn};}});
  assert.equal(atArrival.calls,1);assert.equal(atArrival.fired,false);assert.equal(events.find(e=>e.kind==='missile').outcome,'intercepted');
  assert.ok(events.some(e=>e.kind==='beam'&&e.shooterId===f.b.id));assert.equal(beam.firedThisTurn,true);
});
check('Existing evasion and dead-target outcomes retain their priority and next-turn timing',()=>{
  for(const kind of ['evaded','dead-target']){
    const f=fixture();run(f,order(),order());
    if(kind==='evaded'){
      f.t.toHit.missileClassInteraction.enabled=true;f.t.toHit.missileClassInteraction.heavyVsLightEvadeChance=1;
      f.battle.inFlight[0].shooterPoints=100;
    }else{
      const survivor=buildShip('B-survivor','EAR','frigate',f.t,L,f.rng);survivor.pos={q:10,r:10};survivor.mounts.forEach(m=>m.inop=true);survivor.side='B';f.battle.B.push(survivor);f.b.destroyed=true;
    }
    f.a.mounts.forEach(m=>m.inop=true);const orders=Object.fromEntries(f.battle.fleets.flat().map(s=>[s.id,order()])),shots=[];
    stepTurn(f.battle,orders,{onShot:e=>shots.push(e)});const arrival=shots.find(s=>s.kind==='missile');
    assert.equal(arrival.outcome,kind);assert.equal(arrival.damage,0);assert.equal(arrival.turn,2);assert.equal(arrival.face,undefined);assert.ok(arrival.flight.path.length>=2);
  }
});
check('Homing introduces no post-launch range, cloak, terrain-path or early interception check',()=>{
  const f=fixture();const launch=run(f,order(),order()).events.find(e=>e.kind==='launch');
  f.a.mounts.forEach(m=>m.inop=true);
  f.b.pos={q:35,r:-30};f.b.cloaked=true;f.b.detected=false;
  f.t.battle.terrain=[{type:'moon',q:8,r:-10}];
  const events=run(f,order(),order()).events;const arrival=events.find(e=>e.kind==='missile');
  assert.equal(arrival.outcome,'hit');assert.equal(arrival.damage,launch.damage);assert.equal(arrival.turn,2);
  assert.equal(arrival.face,face({pos:arrival.victimPos,facing:arrival.victimFacing},arrival.approachPos));
});
check('Flight is RNG-free, callbacks own their data, previews are read-only and incoming warnings reveal no course',()=>{
  const a=fixture(),b=fixture();enableContacts(a.battle);enableContacts(b.battle);
  const before=JSON.stringify(a.battle);previewOrders(a.battle,a.a.id,plans.a);assert.equal(JSON.stringify(a.battle),before);
  const orders={[a.a.id]:plans.a,[a.b.id]:plans.b};
  stepTurn(a.battle,orders);stepTurn(b.battle,orders,{onShot:e=>{if(e.flight)e.flight.path.length=0;},onRound:(_t,_r,_f,missiles)=>{if(missiles.length)missiles[0].flight.path[0].pos.q=999;}});
  assert.deepEqual(fullState(a.battle),fullState(b.battle));
  const baseline=JSON.stringify(captainObservation(a.battle,'B'));
  a.battle.inFlight[0].flight.position.q+=123;a.battle.inFlight[0].flight.path[0].pos.q+=321;
  assert.equal(JSON.stringify(captainObservation(a.battle,'B')),baseline);
  const snapshots=snapshotMissiles(a.battle.inFlight);snapshots[0].pos.q=777;assert.notEqual(missilePosition(a.battle.inFlight[0].flight).q,777);
});
check('Trusted packets resimulate complete flight state, outcomes and PRNG without rerunning the captains',()=>{
  const a=fixture(),b=fixture();
  const controllers={A:()=>({orders:{[a.a.id]:plans.a},memory:null}),B:()=>({orders:{[a.b.id]:plans.b},memory:null})};
  const session=createTrustedSession(a.battle,controllers);createTrustedSession(b.battle,controllers);
  for(let turn=0;turn<3;turn++){
    const actual=stepTrusted(session),replayed=executePacket(b.battle,actual.packet);
    assert.deepEqual(replayed.state,actual.state);assert.deepEqual(replayed.shots,actual.shots);assert.deepEqual(replayed.frames,actual.frames);
  }
});
check('Interactive frames preserve engine course snapshots; headless records identify the additive flight profile',()=>{
  const a=fixture(),b=fixture();const raw=run(a),recorded=playStep(b.battle,{[b.a.id]:plans.a,[b.b.id]:plans.b});
  assert.deepEqual(recorded.shots,raw.events);assert.deepEqual(recorded.rounds,raw.frames);
  const f=fixture(),record=recordBuiltBattle({fleets:f.battle.fleets,tuning:f.t,rng:f.rng,maxTurns:3,meta:{seed:'flight-proof'}});
  assert.equal(record.meta.missileFlight,'timed-homing/1');assert.equal(record.meta.version,3);
  const launches=record.shots.filter(s=>s.kind==='launch');assert.ok(launches.length);
  assert.equal(new Set(launches.map(s=>s.missileId)).size,launches.length);
  for(const hit of record.shots.filter(s=>s.kind==='missile')){assert.ok(launches.some(s=>s.missileId===hit.missileId));assert.ok(hit.flight.path.length>=2);}
});
check('A terminal impact records the full course without inventing an extra action; arrival in fog bypasses shields',()=>{
  const f=fixture();run(f,order(),order());f.b.superstructure=1;f.b.power=0;f.a.mounts.forEach(m=>m.inop=true);
  const terminal=playStep(f.battle,{[f.a.id]:order(),[f.b.id]:order()});
  assert.equal(terminal.result.victor,'A');assert.equal(terminal.rounds.length,1);assert.equal(terminal.rounds[0].terminal,true);assert.equal(terminal.rounds[0].phase,'impacts');
  const hit=terminal.shots.find(s=>s.kind==='missile');assert.equal(hit.flight.path.length,4);assert.deepEqual(hit.victimPos,{q:0,r:0});
  const losses=[];
  for(const fog of [false,true]){
    const g=fixture();if(fog)g.t.battle.terrain=[{type:'nebula',q:-3,r:-6}];
    run(g);const hp=g.b.superstructure;g.a.mounts.forEach(m=>m.inop=true);
    const arrivals=run(g,order(),order()).events;const arrival=arrivals.find(s=>s.kind==='missile');
    assert.equal(arrival.outcome,'hit');losses.push(hp-g.b.superstructure);
    if(fog)assert.equal(losses.at(-1),arrival.damage);
  }
  assert.ok(losses[1]>losses[0]);
});
check('Viewer tracks use recorded vertices, keep partial flights unfinished and preserve legacy fallback',()=>{
  const {r,launch,hit}=moving(),rounds=[{turn:0,round:0},...r.frames,{turn:2,round:1,terminal:true}];
  const effect={launch,arrival:hit,launchIndex:1,arrivalIndex:4};
  const track=missileTrack(effect,rounds);assert.deepEqual(track.map(p=>p.pos),[...hit.flight.path.map(p=>p.pos),hit.victimPos]);
  for(const p of track)assert.deepEqual(sampleMissileTrack(track,p.at).pos,p.pos);
  const partial=missileTrack({...effect,arrival:null,arrivalIndex:4},rounds.slice(0,4));
  assert.deepEqual(sampleMissileTrack(partial,1000).pos,hit.approachPos);assert.notDeepEqual(partial.at(-1).pos,hit.victimPos);
  const legacy={...effect,launch:{...launch,missileId:undefined},arrival:{...hit,flight:undefined}};assert.equal(missileTrack(legacy,rounds),null);
  for(const frame of r.frames){const leg=courseLegs(frame)[0];assert.deepEqual(leg.to,frame.missiles[0].pos);}
  assert.deepEqual(courseLegs({...r.frames.at(-1),round:99}),[]);
  track[0].pos.q=999;assert.equal(hit.flight.path[0].pos.q,launch.shooterPos.q);
});
console.log(JSON.stringify({source:root,groups:checks.length,passed:true,checks},null,2));
