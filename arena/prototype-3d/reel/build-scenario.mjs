import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildShip,shieldAbsorbable} from '../../../src/tactical/ship.js';
import {createBattleFromFleets,previewOrders,stepTurn} from '../../../src/tactical/resolver.js';
import {add,distance,shieldFacing} from '../../../src/tactical/hex.js';
import {makePrng,seedFromString} from '../../../src/prng.js';
const root=new URL('../../../',import.meta.url),here=new URL('./',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8'),tuning=JSON.parse(read('data/tactical-tuning.json')),loadouts=JSON.parse(read('data/loadouts.json'));
const seed='pre-alpha-destroyers-192',assets=['ear-victory','kre-swift','vra-point'];
const sources=['data/loadouts.json','data/tactical-tuning.json','src/construction/legacy.js','src/tactical/ship.js','src/tactical/hex.js','src/tactical/resolver.js','src/tactical/missiles.js'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(read(p)).digest('hex')]));
const beforeHashes=hashes();
function run(){
 const rng=makePrng(seedFromString(seed)),ships=['EAR','KRE','VRA'].map(f=>buildShip(f+'-DD-1',f,'destroyer',tuning,loadouts,rng)),[ear,kre,vra]=ships;
 const final=[{q:-5,r:-2},{q:-6,r:0},{q:4,r:2}],headings=[5,5,4];
 ships.forEach((s,i)=>Object.assign(s,{pos:add(final[i],(headings[i]+3)%6),facing:headings[i]}));
 const pose=s=>({q:s.pos.q,r:s.pos.r,facing:s.facing});
 const units=ships.map((s,i)=>({id:s.id,faction:s.faction,asset:assets[i],poses:[pose(s)]}));
 const construction=ships.map(s=>({id:s.id,magazine:s.magazine,mounts:structuredClone(s.mounts),structure:s.superstructure,pointDefence:s.hull.pointDefence}));
 for(const s of ships){assert.equal(s.mounts.filter(m=>m.kind==='beam').length,2);assert.equal(s.mounts.filter(m=>m.kind==='missile').length,1);assert.ok(s.magazine>0);}
 assert.deepEqual(ships.map(s=>s.mounts.map(m=>m.type)),[['laser-cannon','laser-cannon','neutronic-missile'],['blaster-beam','blaster-beam','plasma-torpedo'],['heavy-blaster','heavy-blaster','neutronic-missile']]);
 const battle=createBattleFromFleets([[ear,kre],[vra]],tuning,rng);
 const orders=Object.fromEntries(ships.map(s=>[s.id,{reserve:0,target:s===vra?ear.id:vra.id,plan:[{forward:1,turn:0},{forward:0,turn:s===vra?-1:1},{forward:0,turn:0}]}]));
 const forecasts=ships.map(s=>{const prev=JSON.stringify(battle),state=rng.state,f=previewOrders(battle,s.id,orders[s.id]);assert.equal(rng.state,state);assert.equal(JSON.stringify(battle),prev);assert.equal(distance(f.actions[0].start,f.actions[0].end),1);assert.ok(f.actions.slice(0,2).every(a=>a.mounts.every(m=>!m.eligible)));return f;});
 const events=[],raw=[],logs=[],courses=[];let before,turn2Power=false;
 const hooks={log:m=>logs.push(m),onBeforeShot:()=>{before=structuredClone(ships);},onState:(turn,round,phase)=>{if(turn===2&&phase==='power')turn2Power=true;},onRound:(turn,round,fleets,missiles)=>{
  if(turn===1&&round<=2)ships.forEach((s,i)=>units[i].poses.push(pose(s)));
  if(turn===1&&round===3)courses.push(...structuredClone(missiles??[]));
 },onShot:e=>{
  raw.push(structuredClone(e));const s=ships.find(s=>s.id===e.shooterId),target=ships.find(s=>s.id===e.targetId),prior=before.find(s=>s.id===(e.victimId??e.targetId));
  const ev={kind:e.kind,source:e.shooterId,target:e.targetId,weapon:e.weapon,turn:e.turn,round:e.round};
  if(e.kind!=='missile'){
   const old=before.find(v=>v.id===s.id),fired=s.mounts.find((m,i)=>m.firedThisTurn&&!old.mounts[i].firedThisTurn);assert.ok(fired,'exact fired mount');
   ev.mount=s.mounts.indexOf(fired);assert.ok(fired.arc.includes(shieldFacing(s,target.pos)));assert.ok(distance(s.pos,target.pos)<=fired.maxRange);assert.equal(e.turn,1);assert.equal(e.round,3);
  }else{
   assert.equal(e.turn,2);assert.equal(turn2Power,false,'impact before next-turn power reset');assert.equal(e.outcome,'hit');
   ev.mount=2;ev.defenders=ships.filter(d=>d.side===target.side&&!d.destroyed&&!d.cloaked&&d.hull.pointDefence>0&&distance(d.pos,target.pos)<=tuning.pointDefence.rangeHexes).map(d=>d.id);
   ev.intercepted=false;
  }
  if(e.kind!=='launch'){
   assert.ok(e.hit===true||e.outcome==='hit');ev.hit=true;ev.face=e.face??e.shieldFace;ev.absorbed=Math.min(e.damage,shieldAbsorbable(prior,ev.face));
  }
  if(e.missileId)ev.missileId=e.missileId;
  events.push(ev);
 }};
 stepTurn(battle,orders,hooks);
 assert.equal(events.length,7);assert.equal(events.filter(e=>e.kind==='beam').length,4);assert.equal(battle.inFlight.length,3);
 for(let i=0;i<3;i++){assert.deepEqual(ships[i].pos,final[i]);assert.equal(ships[i].facing,[0,0,3][i]);assert.equal(units[i].poses.length,3);}
 const flight=structuredClone(battle.inFlight);
 const hold=Object.fromEntries(ships.map(s=>[s.id,{reserve:1,plan:Array.from({length:3},()=>({forward:0,turn:0}))}]));
 stepTurn(battle,hold,hooks);assert.equal(events.length,10);assert.equal(battle.inFlight.length,0);
 const survivors=ships.map(s=>({id:s.id,structure:s.superstructure,destroyed:s.destroyed,crippled:!!s.crippled}));
 assert.deepEqual(survivors.map(s=>s.structure),[1,13,1]);assert.ok(survivors.every(s=>!s.destroyed&&!s.crippled));assert.ok(!logs.some(s=>/clamped|refused/.test(s)));
 // End-of-round projectile positions are copied from the observed resolver snapshot,
 // not a second simulation in the browser.
 const projectiles=courses.map(m=>({id:m.missileId,source:m.shooterId,target:m.targetId,midpoint:m.pos}));
 return {projection:{format:'pre-alpha-reel/1',durationMs:38000,units,events,projectiles},audit:{seed,sideA:[ear.id,kre.id],sideB:[vra.id],construction,orders,forecasts,raw,courses,flight,logs,survivors,pointDefence:tuning.pointDefence}};
}
const a=run(),b=run();assert.deepEqual(a,b,'repeat execution must be identical');assert.deepEqual(hashes(),beforeHashes);
fs.writeFileSync(new URL('scenario.json',here),JSON.stringify(a.projection,null,2)+'\n');
fs.writeFileSync(new URL('legality.json',here),JSON.stringify({format:'pre-alpha-legality/2',sourceHashes:beforeHashes,deterministicReplay:true,previewReadOnly:true,...a.audit},null,2)+'\n');
console.log(JSON.stringify({events:a.projection.events,projectiles:a.projection.projectiles,survivors:a.audit.survivors,pointDefence:a.audit.pointDefence},null,2));
