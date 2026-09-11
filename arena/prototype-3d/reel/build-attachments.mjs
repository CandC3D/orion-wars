import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../vendor/three-r180/build/three.module.min.js';
import {readGLB,colourKey} from '../glb-data.mjs';
const here=new URL('./',import.meta.url),prepared=new URL('../prepared/fleet/',import.meta.url);
const specs={
 'ear-victory':[
  ['beam0','e91d2d',[1.6867,1.163,0],'confirmed: Victory v4 schematic L1, forward laser aperture'],
  ['beam1','e91d2d',[-1.8155,.934,0],'confirmed: Victory v4 schematic L2, aft laser aperture; out of arc in reel'],
  ['missile',null,[2.9,.166,0],'confirmed housing: Victory v4 schematic M1 bow missile tube; seated on actual inner aperture',true],
  ['pd','e91d2d',[1.6867,1.163,0],'nearest honest defensive attachment: forward laser; specific PD battery not model-labelled']
 ],
 'kre-swift':[
  ['beam0','ffdd1a',[.38,.596,-.5156],'confirmed: Swift schematic B1 dorsal beam crystal with red ring'],
  ['beam1','ffdd1a',[.38,.596,.5156],'confirmed: Swift schematic B2 dorsal beam crystal with red ring'],
  ['missile','ffdd1a',[2.4269,.014,0],'confirmed: Swift schematic P1 flattened hexagonal plasma projector, three painted red warnings'],
  ['pd','ffdd1a',[-.2195,.3749,0],'confirmed: existing pointDefenceEmitter energy-map feature; Chris dome ruling']
 ],
 'vra-point':[
  ['beam0','46b749',[1.974,.78,0],'nearest honest weapon crystal: forward dorsal green component; heavy-blaster role unconfirmed'],
  ['beam1','46b749',[.124,.78,0],'nearest honest weapon crystal: aft dorsal green component; stern heavy-blaster role unconfirmed, not fired'],
  ['missile','46b749',[2.648,.001,0],'nearest honest weapon crystal: axial bow green component; missile-launcher role unconfirmed'],
  ['pd','46b749',[1.974,.78,0],'nearest honest defensive weapon crystal; exact PD battery unconfirmed']
 ]
};
const result={format:'reel-surface-attachments/1',units:{}};
for(const [id,rows] of Object.entries(specs)){
 const file=new URL(id+'.glb',prepared),data=readGLB(file),p=data.json.meshes[0].primitives[0],pos=data.attribute(p.attributes.POSITION),col=data.attribute(p.attributes.COLOR_0),idx=data.attribute(p.indices).flat(),regions=JSON.parse(fs.readFileSync(new URL(id+'-regions.json',prepared)));
 const prep=JSON.parse(fs.readFileSync(new URL(id+'-preparation.json',prepared))),sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex');assert.equal(sha,prep.outputSha256);
 if(id.startsWith('ear')||id.startsWith('kre'))assert.equal(prep.normalPolicy.creaseAngleDegrees,40,'must use corrected window derivative');
 const sockets={},faceRegions=new Map(regions.patches.flatMap(p=>p.faces.map(f=>[f,p.region])));
 for(const [role,key,aim,evidence,ray] of rows){
  const wanted=new THREE.Vector3(...aim),tri=new THREE.Triangle(),hit=new THREE.Vector3();let best=null;
  const pdFaces=role==='pd'&&id==='kre-swift'?new Set(regions.features.pointDefenceEmitter.faces):null;
  for(let f=0;f<idx.length/3;f++){
   const ids=idx.slice(f*3,f*3+3),k=faceRegions.get(f);if(key&&k!==key||pdFaces&&!pdFaces.has(f))continue;
   tri.set(...ids.map(i=>new THREE.Vector3(...pos[i])));
   if(ray){if(!new THREE.Ray(wanted,new THREE.Vector3(-1,0,0)).intersectTriangle(tri.a,tri.b,tri.c,false,hit))continue;}else tri.closestPointToPoint(wanted,hit);
   const d=hit.distanceTo(wanted);if(!best||d<best.distance){const normal=tri.getNormal(new THREE.Vector3());best={face:f,region:k,surface:hit.toArray(),normal:normal.toArray(),socket:hit.clone().addScaledVector(normal,.012).toArray(),distance:d,evidence};}
  }
  assert.ok(best&&best.distance<.8,`${id}/${role}: cannot seat requested feature`);
  best.emissiveDesignated=regions.energyAttachments[best.region]?.designated??false;
  sockets[role]=best;
 }
 result.units[id]={preparedSha256:sha,normalPolicy:prep.normalPolicy??'approved Vraygon faceted derivative, untouched',sockets};
}
fs.writeFileSync(new URL('attachments.json',here),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.units).map(([id,u])=>[id,Object.fromEntries(Object.entries(u.sockets).map(([k,s])=>[k,{face:s.face,region:s.region,surface:s.surface,distance:s.distance}]))])),null,2));
