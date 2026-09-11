import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three-r180/build/three.module.min.js';
import {validateReel} from './projection.js';
import {readGLB} from '../glb-data.mjs';
import {distance,shieldFacing} from '../../../src/tactical/hex.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),packet=read('./scenario.json'),audit=read('./legality.json'),attachments=read('./attachments.json');let count=0;
const check=(name,f)=>{f();count++;console.log('ok:',name);};
check('strict frozen public projection; raw state and unknown endpoints rejected',()=>{
 const p=validateReel(packet);assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.units[0].poses[0]));
 for(const mutate of [p=>p.rng={state:4},p=>p.units[0].power=16,p=>p.events[0].source='hidden',p=>p.events[0].damage=5,p=>p.projectiles[0].midpoint.q=NaN]){const bad=structuredClone(packet);mutate(bad);assert.throws(()=>validateReel(bad));}
});
check('stock mounts and real execution agree; aft mounts are never invented',()=>{
 assert.deepEqual(packet.events.filter(e=>e.kind==='beam').map(e=>[e.source,e.mount]),[['EAR-DD-1',0],['KRE-DD-1',0],['KRE-DD-1',1],['VRA-DD-1',0]]);
 for(const e of packet.events.filter(e=>e.kind!=='missile')){const s=packet.units.find(u=>u.id===e.source),t=packet.units.find(u=>u.id===e.target),mount=audit.construction.find(u=>u.id===s.id).mounts[e.mount],a=s.poses[2],b=t.poses[2];assert.ok(mount.arc.includes(shieldFacing({pos:a,facing:a.facing},b)));assert.ok(distance(a,b)<=mount.maxRange);assert.equal(e.round,3);}
});
check('every ship advances one legal hex, turns once, then fires',()=>{
 for(const u of packet.units){assert.equal(distance(u.poses[0],u.poses[1]),1);assert.equal(distance(u.poses[1],u.poses[2]),0);const d=(u.poses[2].facing-u.poses[1].facing+6)%6;assert.ok(d===1||d===5);}
});
check('next-turn arrivals, real shields and nonlethal outcomes',()=>{
 const impacts=packet.events.filter(e=>e.kind==='missile');assert.equal(impacts.length,3);assert.ok(impacts.every(e=>e.turn===2&&e.hit&&!e.intercepted&&e.defenders.length));assert.deepEqual(packet.events.filter(e=>e.absorbed>0).map(e=>e.absorbed),[4,4]);assert.ok(audit.survivors.every(s=>!s.destroyed&&!s.crippled&&s.structure>0));
});
check('point defence is the real eligible pool, including Swift support of Victory',()=>{
 assert.equal(audit.pointDefence.rangeHexes,3);assert.deepEqual(packet.events.filter(e=>e.kind==='missile').map(e=>e.defenders),[['VRA-DD-1'],['VRA-DD-1'],['EAR-DD-1','KRE-DD-1']]);
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
