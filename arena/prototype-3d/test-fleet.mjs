import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {validateFleetManifest,fleetHull,boardCodeTable} from './fleet-contract.js';
import {factionRegion,validateFactionPalette} from './faction-palettes.js';
import {validateRegionMap,cameraPose} from './contract.js';
import {readGLB} from './glb-data.mjs';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
const manifest=validateFleetManifest(read('fleet-assets.json')),inventory=read('prepared/fleet/inventory.json'),captures=read('evidence/fleet/captures.json');let passed=0;
function check(label,f){f();passed++;console.log('ok: '+label);}
check('exactly every staged individual GLB, excluding the three composites and retired Boss',()=>{
 const actual=['edf','ksn','vtw'].flatMap(d=>fs.readdirSync(new URL('source/'+d+'/',root)).filter(f=>f.endsWith('.glb')).map(f=>d+'/'+f));
 assert.deepEqual(actual.sort(),[...manifest.hulls.map(h=>h.source),...manifest.excluded,...manifest.retired.map(h=>h.source)].sort());
 assert.deepEqual(['EAR','KRE','VRA'].map(f=>manifest.hulls.filter(h=>h.faction===f).length),[7,11,7]);
 assert.equal(manifest.hulls.filter(h=>h.code===null).length,0);assert.ok(manifest.hulls.every(h=>h.faction!=='ZAN'));
});
check('missing class decisions fail; explicit corrected codes reach the board without filename parsing',()=>{
 const broken=structuredClone(manifest);delete broken.hulls[0].code;assert.throws(()=>validateFleetManifest(broken),/class-code/);
 broken.hulls[0].code=null;assert.throws(()=>validateFleetManifest(broken),/class-code/);
 assert.equal(fleetHull(manifest,'vra-point').code,'VDD-03');assert.equal(fleetHull(manifest,'vra-cluster').code,'VBB-01');
 assert.deepEqual(boardCodeTable(manifest),{'EAR/frigate':'EFG-03','KRE/frigate':'KFG-01','VRA/frigate':'VFG-04'});
 const rename=structuredClone(manifest);rename.hulls[0].source='edf/not-a-designation.glb';assert.equal(fleetHull(rename,'ear-monoceros').code,'EFG-03');
});
check('foreign palette keys and missing per-region material classification fail',()=>{
 assert.throws(()=>validateFactionPalette('EAR',['126936']),/export fault/);
 const r=read('prepared/fleet/ear-monoceros-regions.json'),profile={palette:r.palette.map(p=>factionRegion('EAR',p.key)),confirmedEffects:[]};
 delete r.palette[0].classification;assert.throws(()=>validateRegionMap(r,'EAR',profile));
 assert.equal(factionRegion('EAR','e91d2d').classification,'emissive-designated');assert.equal(factionRegion('KRE','e91d2d').classification,'paint');
 assert.equal(factionRegion('VRA','ffdd1a').classification,'paint');assert.equal(factionRegion('KRE','c8e4bd').finish,'dead-flat');
});
let stripCamera=null;
for(const h of manifest.hulls)check(h.id+' source integrity, complete regions, faithful reduction, inert renders and mounted scale',()=>{
 const i=inventory.hulls.find(r=>r.id===h.id),p=read('prepared/fleet/'+h.id+'-preparation.json'),r=read('prepared/fleet/'+h.id+'-regions.json'),c=captures.hulls.find(c=>c.id===h.id);
 assert.equal(hash('source/'+h.source),i.sha256);assert.equal(p.sourceSha256,i.sha256);assert.equal(hash('prepared/fleet/'+h.id+'.glb'),p.outputSha256);
 assert.equal(p.outputComponentCount,p.sourceComponentCount);assert.ok(p.maximumVertexToSurfaceErrorMm<.35);assert.ok(p.outputTriangles<p.sourceTriangles);assert.equal(p.physicalEmission,false);
 const sourceKeys=Object.keys(i.regions).sort();assert.deepEqual(r.palette.map(p=>p.key).sort(),sourceKeys);assert.deepEqual(Object.keys(p.sourcePalette).sort(),sourceKeys);
 validateRegionMap(r,h.faction,{palette:sourceKeys.map(k=>factionRegion(h.faction,k)),confirmedEffects:h.pointDefence?['pointDefenceEmitter']:[]});
 for(const key of sourceKeys){assert.ok(r.sourceCoverage[key]>0&&r.derivativeCoverage[key]>0);assert.ok(Math.abs(r.sourceCoverage[key]-r.derivativeCoverage[key])<.002);const a=r.energyAttachments[key];assert.equal(a.enabledByDefault,false);assert.equal(a.designated,factionRegion(h.faction,key).classification==='emissive-designated');assert.equal(a.faces.length>0,a.designated);}
 assert.equal(c.blackout,0);
 const length=55*Math.sqrt(i.sourceLongitudinalLength/manifest.scale.referenceSourceLength);assert.ok(Math.abs(length-p.miniatureLengthMm)<1e-8);
 for(const v of Object.values(c.views)){
  assert.ok(Math.abs(v.miniatureLengthMm-length)<.005);assert.ok(Math.abs(v.postExposedMm-30)<.001&&Math.abs(v.postBaseGapMm)<.001&&v.postHullGapMm!==null&&v.postHullGapMm<.001);
  assert.equal(v.code,h.code);assert.equal(v.energyObjects,0);assert.equal(v.clearVariant,false);assert.equal(v.clearPosts,true);assert.equal(v.clearCrystals,h.faction==='VRA'?1:0);assert.equal(v.flightCount,h.flight?.count??1);assert.equal(v.brush.omittedReferences,0);assert.equal(v.brush.inkWidthMm,.24);assert.ok(v.camera.position[1]>=24&&v.camera.pitch>=32);
  assert.ok(v.triangles<1200000);assert.ok(v.regions.every(p=>p.physicalEmission===0));
  const b=v.bounds;assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1000&&b.y+b.height<=720);
 }
 if(h.code)assert.ok(Math.max(...c.views.side.rimCapPixels)>=12);
 assert.equal(c.views.strip.camera.orthographic,true);const camera=JSON.stringify(c.views.strip.camera);if(stripCamera===null)stripCamera=camera;else assert.equal(camera,stripCamera);
});
check('only Intrallus remains; both fighter flights and explicit new codes are approved',()=>{
 assert.ok(!manifest.hulls.some(h=>h.id==='kre-boss'));assert.equal(fleetHull(manifest,'kre-intrallus').code,'KDN-0000');assert.equal(fleetHull(manifest,'kre-bomber').code,'KFB-03');assert.equal(fleetHull(manifest,'kre-interceptor').code,'KFY-02');assert.equal(manifest.scale.status,'approved');
 for(const id of ['kre-bomber','kre-interceptor']){const h=fleetHull(manifest,id),i=inventory.hulls.find(h=>h.id===id);assert.equal(h.nativeBow,'-X');assert.equal(h.flight.count,6);assert.equal(i.sourceLongitudinalLength,i.sourceExtent[0]);}
});

check('all Vraygon prepared window facets keep face normals instead of smoothed inset normals',()=>{
 for(const h of manifest.hulls.filter(h=>h.faction==='VRA')){
  const glb=readGLB(new URL('prepared/fleet/'+h.id+'.glb',root));let checked=0;
  for(const mesh of glb.json.meshes)for(const primitive of mesh.primitives){
   const p=glb.attribute(primitive.attributes.POSITION),n=glb.attribute(primitive.attributes.NORMAL),ix=primitive.indices===undefined?p.map((_,i)=>i):glb.attribute(primitive.indices).flat();
   for(let i=0;i<ix.length;i+=3){const [a,b,c]=ix.slice(i,i+3).map(k=>p[k]),u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);if(length<1e-12)continue;
    for(const k of ix.slice(i,i+3)){assert.ok(Math.hypot(...n[k].map((x,j)=>x-n[ix[i]][j]))<1e-6,h.id+' interpolated facet');
     // Near-collinear export triangles have an ill-conditioned cross product after float32 quantisation. Their three corner normals must still agree.
     if(length/Math.max(u.reduce((s,x)=>s+x*x,0),v.reduce((s,x)=>s+x*x,0))>1e-4)assert.ok(normal.reduce((sum,x,j)=>sum+x*n[k][j],0)/length>Math.cos(Math.PI/180),h.id+' averaged inset normal');}checked++;
   }
  }assert.ok(checked>1000);
 }
});
check('only four positively matched smaller Krelath domes receive point-defence sockets',()=>{
 assert.deepEqual(manifest.hulls.filter(h=>h.pointDefence).map(h=>h.id).sort(),['kre-ballista','kre-raptor','kre-sparrowhawk','kre-swift']);
 for(const h of manifest.hulls.filter(h=>h.faction==='KRE')){
  const r=read('prepared/fleet/'+h.id+'-regions.json'),feature=r.features.pointDefenceEmitter;
  assert.equal(!!feature,!!h.pointDefence);if(!feature)continue;
  assert.equal(feature.region,'ffdd1a');assert.equal(feature.role,'point-defence');assert.equal(feature.enabledByDefault,false);
  const i=inventory.hulls.find(i=>i.id===h.id),factor=(i.miniatureLengthMm/10)/i.sourceLongitudinalLength,diameter=(feature.max[0]-feature.min[0])/factor;
  assert.ok(diameter>2.15&&diameter<2.25);assert.ok(feature.faces.every(f=>r.energyAttachments.ffdd1a.faces.includes(f)));assert.ok(feature.socket[1]>feature.max[1]);
 }
});
check('game camera makes a deliberate high-planning to macro-resolution move within both floors',()=>{
 const start=cameraPose(0),end=cameraPose(1);assert.ok(start.fov<15&&start.blur===0);assert.ok(Math.atan2(start.y-start.targetY,Math.hypot(start.x,start.z))*180/Math.PI>70);assert.ok(start.y-end.y>100&&end.fov>start.fov*3&&end.blur===4);
 for(let i=0;i<=1200;i++){const p=cameraPose(i/1200);assert.ok(p.y>=24&&Math.atan2(p.y-p.targetY,Math.hypot(p.x,p.z))*180/Math.PI>=32);}
});

console.log('\nComplete fleet: '+passed+' checks passed.');
