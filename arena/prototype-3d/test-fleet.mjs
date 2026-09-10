import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {validateFleetManifest,fleetHull,boardCodeTable} from './fleet-contract.js';
import {factionRegion,validateFactionPalette} from './faction-palettes.js';
import {validateRegionMap} from './contract.js';
const root=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex');
const manifest=validateFleetManifest(read('fleet-assets.json')),inventory=read('prepared/fleet/inventory.json'),captures=read('evidence/fleet/captures.json');let passed=0;
function check(label,f){f();passed++;console.log('ok: '+label);}
check('exactly every staged individual GLB, excluding only the three named composites',()=>{
 const actual=['edf','ksn','vtw'].flatMap(d=>fs.readdirSync(new URL('source/'+d+'/',root)).filter(f=>f.endsWith('.glb')).map(f=>d+'/'+f));
 assert.deepEqual(actual.sort(),[...manifest.hulls.map(h=>h.source),...manifest.excluded].sort());
 assert.deepEqual(['EAR','KRE','VRA'].map(f=>manifest.hulls.filter(h=>h.faction===f).length),[7,12,7]);
 assert.equal(manifest.hulls.filter(h=>h.code===null).length,4);assert.ok(manifest.hulls.every(h=>h.faction!=='ZAN'));
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
 validateRegionMap(r,h.faction,{palette:sourceKeys.map(k=>factionRegion(h.faction,k)),confirmedEffects:[]});
 for(const key of sourceKeys){assert.ok(r.sourceCoverage[key]>0&&r.derivativeCoverage[key]>0);assert.ok(Math.abs(r.sourceCoverage[key]-r.derivativeCoverage[key])<.002);const a=r.energyAttachments[key];assert.equal(a.enabledByDefault,false);assert.equal(a.designated,factionRegion(h.faction,key).classification==='emissive-designated');assert.equal(a.faces.length>0,a.designated);}
 assert.equal(c.blackout,0);
 const length=55*Math.sqrt(i.sourceLongitudinalLength/manifest.scale.referenceSourceLength);assert.ok(Math.abs(length-p.miniatureLengthMm)<1e-8);
 for(const v of Object.values(c.views)){
  assert.ok(Math.abs(v.miniatureLengthMm-length)<.005);assert.ok(Math.abs(v.postExposedMm-30)<.001&&Math.abs(v.postBaseGapMm)<.001&&v.postHullGapMm!==null&&v.postHullGapMm<.001);
  assert.equal(v.code,h.code);assert.equal(v.energyObjects,0);assert.equal(v.clearVariant,false);assert.ok(v.camera.position[1]>=24&&v.camera.pitch>=32);
  assert.ok(v.triangles<1200000);assert.ok(v.regions.every(p=>p.physicalEmission===0));
  const b=v.bounds;assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=1000&&b.y+b.height<=720);
 }
 if(h.code)assert.ok(Math.max(...c.views.side.rimCapPixels)>=12);
 assert.equal(c.views.strip.camera.orthographic,true);const camera=JSON.stringify(c.views.strip.camera);if(stripCamera===null)stripCamera=camera;else assert.equal(camera,stripCamera);
});
check('flagship files remain distinct; fighter length follows the actual fore-aft axis',()=>{
 const a=inventory.hulls.find(h=>h.id==='kre-intrallus'),b=inventory.hulls.find(h=>h.id==='kre-boss');assert.notEqual(a.sha256,b.sha256);assert.notEqual(a.sourceTriangles,b.sourceTriangles);
 for(const id of ['kre-bomber','kre-interceptor']){const h=fleetHull(manifest,id),i=inventory.hulls.find(h=>h.id===id);assert.equal(h.nativeBow,'-X');assert.equal(i.sourceLongitudinalLength,i.sourceExtent[0]);}
});
console.log('\nComplete fleet: '+passed+' checks passed.');
