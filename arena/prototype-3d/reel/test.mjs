import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three-r180/build/three.module.min.js';
import {validateReel} from './projection.js';
import {readGLB} from '../glb-data.mjs';
import {timeline,DURATION,FRAMES,FPS} from './timeline.js';
import {distance,shieldFacing} from '../../../src/tactical/hex.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),packet=read('./scenario.json'),audit=read('./legality.json'),attachments=read('./attachments.json');let count=0;
const check=(name,f)=>{f();count++;console.log('ok:',name);};
check('strict frozen public projection; raw state and unknown endpoints rejected',()=>{
 const p=validateReel(packet);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.units[0].poses[0]));
 for(const mutate of [p=>p.rng={state:4},p=>p.units[0].power=16,p=>p.events[0].source='hidden',p=>p.events[0].damage=5,p=>p.projectiles[0].midpoint.q=NaN]){const bad=structuredClone(packet);mutate(bad);assert.throws(()=>validateReel(bad));}
});
check('stock mount arcs, range and individual execution agree',()=>{
 assert.deepEqual(packet.events.filter(e=>e.kind==='beam').map(e=>[e.source,e.mount]),[['KRE-DD-1',0],['KRE-DD-1',1],['EAR-DD-1',0],['EAR-DD-1',1],['VRA-DD-1',0]]);
 for(const e of packet.events.filter(e=>e.kind!=='missile')){const s=packet.units.find(u=>u.id===e.source),t=packet.units.find(u=>u.id===e.target),mount=audit.construction.find(u=>u.id===s.id).mounts[e.mount],a=s.poses[1],b=t.poses[1];assert.ok(mount.arc.includes(shieldFacing({pos:a,facing:a.facing},b)));assert.ok(distance(a,b)<=mount.maxRange);assert.equal(e.round,2);}
});
check('all factions attack and receive fire, with no allied defence',()=>{
 for(const u of packet.units){assert.ok(packet.events.some(e=>e.source===u.id));assert.ok(packet.events.some(e=>e.target===u.id));assert.equal(audit.hostility[u.id].length,2);}
 for(const e of packet.events){assert.notEqual(e.source,e.target);if(e.defenders)assert.deepEqual(e.defenders,[e.target]);}
});
check('one combined turn-and-forward order, canonical preview and no clamp',()=>{
 for(const u of packet.units){assert.equal(distance(u.poses[0],u.poses[1]),1);const d=(u.poses[1].facing-u.poses[0].facing+6)%6;assert.ok(d===1||d===5);}
 for(const m of audit.movement){assert.equal(m.action.forward,1);assert.ok(Math.abs(m.action.turn)<=m.turnBudget);}
 assert.ok(!audit.logs.some(s=>/clamped|refused/.test(s)));
});
check('next-turn impacts, genuine random PD outcomes and no destruction',()=>{
 const impacts=packet.events.filter(e=>e.kind==='missile');assert.equal(impacts.length,3);assert.ok(impacts.every(e=>e.turn===2&&e.round===0));assert.deepEqual(impacts.map(e=>e.intercepted),[true,false,true]);
 for(const p of audit.pd){assert.equal(p.chance,.18);assert.equal(p.intercepted,p.rolls[0].value<p.chance);}
 assert.ok(audit.survivors.every(s=>!s.destroyed&&!s.crippled&&s.structure>0));
 for(const f of audit.flight){assert.deepEqual(f.flight.path.filter(p=>p.phase==='course').map(p=>p.round),[2,3]);}
});
check('frame-aligned timeline is 1.2x pace and uses existing six cue roles',()=>{
 assert.equal(FRAMES,950);assert.equal(DURATION,38/1.2);const t=timeline(packet);assert.equal(t.beams.length,5);assert.equal(t.missiles.length,3);
 for(const c of t.cues){assert.ok(Math.abs(c.time*FPS-Math.round(c.time*FPS))<1e-8);assert.ok(['beam','impact','engage','spinal','launch','intercept'].includes(c.cue));}
});
check('surface sockets sit on mapped triangles of the exact approved derivatives',()=>{
 for(const [id,h] of Object.entries(attachments.units)){
  const file=new URL('../prepared/fleet/'+id+'.glb',import.meta.url),sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex');assert.equal(sha,h.preparedSha256);
  if(id!=='vra-point')assert.equal(h.normalPolicy.creaseAngleDegrees,40);
  const g=readGLB(file),p=g.json.meshes[0].primitives[0],pos=g.attribute(p.attributes.POSITION),idx=g.attribute(p.indices).flat(),map=read('../prepared/fleet/'+id+'-regions.json');
  for(const s of Object.values(h.sockets)){const vertices=idx.slice(s.face*3,s.face*3+3).map(i=>new THREE.Vector3(...pos[i])),tri=new THREE.Triangle(...vertices),point=new THREE.Vector3(...s.surface);assert.ok(tri.closestPointToPoint(point,new THREE.Vector3()).distanceTo(point)<1e-5);assert.ok(map.patches.some(p=>p.region===s.region&&p.faces.includes(s.face)));assert.ok(new THREE.Vector3(...s.socket).distanceTo(point)<.013);}
 }
 assert.equal(attachments.units['vra-point'].sockets.beam0.emissiveDesignated,false,'clear green remains physical and nonemitting');
});
check('read-only rule source hashes and two-run replay evidence remain current',()=>{
 for(const [p,sha] of Object.entries(audit.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../../'+p,import.meta.url))).digest('hex'),sha);
 assert.equal(audit.deterministicReplay,true);assert.equal(audit.previewReadOnly,true);
});
console.log(`${count} pre-alpha reel checks passed`);
