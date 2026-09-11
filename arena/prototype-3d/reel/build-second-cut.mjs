import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildShip,startTurn,startRound,shieldAbsorbable} from '../../../src/tactical/ship.js';
import {add,distance,shieldFacing,inArc} from '../../../src/tactical/hex.js';
import {advanceMissileFlights,missileGeometry,missileImpactFace} from '../../../src/tactical/missiles.js';
import {makePrng,seedFromString} from '../../../src/prng.js';
import {rules,resolverHash} from './rule-access.mjs';
const root=new URL('../../../',import.meta.url),here=new URL('./',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8'),tuning=JSON.parse(read('data/tactical-tuning.json')),loadouts=JSON.parse(read('data/loadouts.json'));
const assets=['ear-victory','kre-swift','vra-point'];
const sources=['data/loadouts.json','data/tactical-tuning.json','src/construction/legacy.js','src/tactical/ship.js','src/tactical/hex.js','src/tactical/resolver.js','src/tactical/missiles.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(read(p)).digest('hex')])),sourceHashes=hashes();
function run(seed){
 const rng=makePrng(seedFromString(seed)),rolls=[],next=rng.next.bind(rng);
 rng.next=()=>{const before=rng.state,value=next();rolls.push({before,after:rng.state,value});return value;};
 const ships=['EAR','KRE','VRA'].map(f=>buildShip(f+'-DD-1',f,'destroyer',tuning,loadouts,rng)),[ear,kre,vra]=ships;
 const finals=[{q:-2,r:-3},{q:-5,r:1},{q:4,r:1}],headings=[0,0,3],turns=[1,1,-1];
 ships.forEach((s,i)=>{Object.assign(s,{pos:add(finals[i],(headings[i]+3)%6),facing:(headings[i]-turns[i]+6)%6,side:s.faction});startTurn(s,tuning);s.reserve=0;});
 const pose=s=>({...s.pos,facing:s.facing}),units=ships.map((s,i)=>({id:s.id,faction:s.faction,asset:assets[i],poses:[pose(s)]}));
 const construction=ships.map(s=>({id:s.id,magazine:s.magazine,mounts:structuredClone(s.mounts),structure:s.superstructure,pointDefence:s.hull.pointDefence}));
 assert.deepEqual(ships.map(s=>s.mounts.map(m=>m.type)),[['laser-cannon','laser-cannon','neutronic-missile'],['blaster-beam','blaster-beam','plasma-torpedo'],['heavy-blaster','heavy-blaster','neutronic-missile']]);
 const foes=s=>ships.filter(t=>t!==s),logs=[],movement=[];
 ships.forEach((s,i)=>{
  startRound(s);const action={turn:turns[i],forward:1},before=JSON.stringify(s),state=rng.state;
  const preview=rules.previewPublicStep(s,action,foes(s),tuning);assert.equal(JSON.stringify(s),before);assert.equal(rng.state,state);
  const moved=rules.moveOrdered(s,action,foes(s),tuning,m=>logs.push(m));
  assert.equal(moved,1);assert.deepEqual(s,preview.ship);assert.deepEqual(s.pos,finals[i]);assert.equal(s.facing,headings[i]);
  units[i].poses.push(pose(s));movement.push({id:s.id,turn:1,round:1,action,turnBudget:s.turnRate??tuning.movement.turnRatePerRound[s.className],preview});
 });
 const stats=Object.fromEntries(ships.map(s=>[s.id,{shots:0,hits:0,launches:0,damage:0,internal:0,screened:0,hitsForward:0,hitsRear:0}]));
 const events=[],raw=[],checks=[],inFlight=[];let prior;
 const onShot=e=>{
  const s=ships.find(s=>s.id===e.shooterId),target=ships.find(s=>s.id===e.targetId),old=prior.find(v=>v.id===s.id),victim=prior.find(v=>v.id===(e.victimId??e.targetId));
  const mount=s.mounts.findIndex((m,i)=>m.firedThisTurn&&!old.mounts[i].firedThisTurn),m=old.mounts[mount];assert.ok(m);
  assert.equal(rules.publicWeaponGeometry(old,m,victim,tuning),null);assert.ok(m.arc.some(f=>inArc(old,f,victim.pos)));assert.ok(distance(old.pos,victim.pos)<=m.maxRange);
  checks.push({source:s.id,target:target.id,mount,face:shieldFacing(old,victim.pos),range:distance(old.pos,victim.pos),arc:m.arc,maxRange:m.maxRange,powerBefore:old.power,powerAfter:s.power,magazineBefore:old.magazine,magazineAfter:s.magazine,canonicalGeometry:null});
  const event={kind:e.kind,source:s.id,target:target.id,weapon:e.weapon,turn:1,round:2,mount};
  if(e.kind==='beam')Object.assign(event,{hit:e.hit,face:e.face??shieldFacing(victim,old.pos),absorbed:e.hit?Math.min(e.damage,shieldAbsorbable(victim,e.face)):0});
  if(e.missileId)event.missileId=e.missileId;events.push(event);raw.push(e);
 };onShot.before=()=>prior=structuredClone(ships);
 // Chosen legal action order, NOT a new initiative or multiplayer resolver.
 ships.forEach(startRound);
 for(const s of [kre,ear,vra]){s.orderTarget=s===vra?ear.id:vra.id;rules.fire(s,foes(s),[s],tuning,rng,inFlight,stats[s.id],m=>logs.push(m),onShot,null,{turn:1,round:2});}
 advanceMissileFlights(inFlight,ships.map(s=>[s]),1,2,3);
 ships.forEach(startRound); // Round 3: mounts remain spent; hulls hold.
 const countBeforeHold=events.length;
 for(const s of [kre,ear,vra])rules.fire(s,foes(s),[s],tuning,rng,inFlight,stats[s.id],m=>logs.push(m),onShot,null,{turn:1,round:3});
 assert.equal(events.length,countBeforeHold,'No extra eligible shots during round 3');
 advanceMissileFlights(inFlight,ships.map(s=>[s]),1,3,3);
 const flight=structuredClone(inFlight),pd=[];
 const projectiles=flight.map(m=>({id:m.missileId,source:m.shooterId,target:m.targetId,midpoint:missileGeometry(m).approachPos,samples:m.flight.path.filter(p=>p.phase==='course').map(p=>p.pos)}));
 for(const m of inFlight){
  const target=ships.find(s=>s.id===m.targetId);if(target.destroyed)continue;
  const MC=tuning.toHit.missileClassInteraction;assert.ok(!MC?.enabled||m.shooterPoints<MC.heavyThresholdPoints,'No unimplemented class evasion branch');
  const state=rng.state,rollIndex=rolls.length,intercepted=rules.intercepted(target,[target],tuning,rng),face=missileImpactFace(m,target);
  pd.push({missileId:m.missileId,weapon:m.weapon,target:target.id,defenders:[target.id],before:state,after:rng.state,rolls:rolls.slice(rollIndex),chance:Math.min(tuning.pointDefence.maxChance,target.hull.pointDefence*tuning.pointDefence.chancePerPoint),intercepted});
  const absorbed=intercepted?0:Math.min(m.damage,shieldAbsorbable(target,face));
  if(!intercepted)rules.resolveHit(m.shooterPos,target,m.damage,[target],tuning,rng,stats[m.shooterId],x=>logs.push(x),m.spread,undefined,m);
  events.push({kind:'missile',source:m.shooterId,target:m.targetId,weapon:m.weapon,turn:2,round:0,mount:2,missileId:m.missileId,defenders:[target.id],intercepted,hit:!intercepted,face,absorbed});
 }
 const survivors=ships.map(s=>({id:s.id,structure:s.superstructure,destroyed:s.destroyed,crippled:!!s.crippled}));
 const beams=events.filter(e=>e.kind==='beam'),launches=events.filter(e=>e.kind==='launch');
 const accepted=beams.length===5&&beams.every(e=>e.hit)&&launches.length===3&&pd.length===3&&pd[0].intercepted&&!pd[1].intercepted&&pd[2].intercepted&&survivors.every(s=>!s.destroyed&&!s.crippled)&&!logs.some(s=>/clamped|refused/.test(s));
 return {accepted,projection:{format:'pre-alpha-reel/2',durationMs:38000/1.2,units,events,projectiles},audit:{seed,standard:'Individual canonical rule checks; not a three-sided stepTurn execution',hostility:Object.fromEntries(ships.map(s=>[s.id,foes(s).map(t=>t.id)])),construction,movement,actionOrder:[kre.id,ear.id,vra.id],checks,raw,flight,pd,rolls,logs,survivors,stats}};
}
let result;
if(process.argv.includes('--search')){for(let i=0;i<100000;i++){const r=run('pre-alpha-second-cut-'+i);if(r.accepted){result=r;break;}}}
else result=run('pre-alpha-second-cut-1375');
assert.ok(result?.accepted,'No legal accepted seed');assert.deepEqual(result,run(result.audit.seed));assert.deepEqual(hashes(),sourceHashes);
fs.writeFileSync(new URL('scenario.json',here),JSON.stringify(result.projection,null,2)+'\n');
fs.writeFileSync(new URL('legality.json',here),JSON.stringify({format:'pre-alpha-legality/3',sourceHashes,resolverHash,adapter:'Relative import URLs relocated; unchanged private helper bodies exported only in memory',deterministicReplay:true,previewReadOnly:true,...result.audit},null,2)+'\n');
console.log(JSON.stringify({seed:result.audit.seed,events:result.projection.events,pd:result.audit.pd,survivors:result.audit.survivors},null,2));
