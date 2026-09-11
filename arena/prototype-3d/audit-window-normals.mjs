import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {readGLB} from './glb-data.mjs';
const here=new URL('./',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,here)));
const manifest=read('fleet-assets.json'),baseline=read('evidence/revision-12/baseline.json');
const args=process.argv.slice(2),angle=args.find(a=>a.startsWith('--candidate='))?.split('=')[1];
const chosen=args.filter(a=>!a.startsWith('--')),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),norm=a=>a.map(v=>v/length(a));
// Export seam duplicates retain identical float32 positions. Do not quantise:
// merging nearby points can invent an edge between separate inset surfaces.
const key=p=>p.join(',');
function data(p){const g=readGLB(new URL(p,here)),primitive=g.json.meshes[0].primitives[0];return {p:g.attribute(primitive.attributes.POSITION),n:g.attribute(primitive.attributes.NORMAL),c:g.attribute(primitive.attributes.COLOR_0),i:g.attribute(primitive.indices).flat()};}
export function compareNormals(oldFile,newFile){
 const a=data(oldFile),b=data(newFile);assert.equal(a.i.length,b.i.length,'Triangle count changed');
 let maxPositionDelta=0,maxColourDelta=0,changed=0,maxNormalAngle=0;const edges=new Map(),faceNormals=[];
 // Export may split vertices at a crease, but triangle/corner order and all art stay fixed.
 for(let j=0;j<a.i.length;j++){
  const ai=a.i[j],bi=b.i[j];maxPositionDelta=Math.max(maxPositionDelta,length(sub(a.p[ai],b.p[bi])));maxColourDelta=Math.max(maxColourDelta,...sub(a.c[ai],b.c[bi]).map(Math.abs));
  const difference=Math.acos(Math.min(1,Math.max(-1,dot(norm(a.n[ai]),norm(b.n[bi])))))*180/Math.PI;if(difference>1)changed++;maxNormalAngle=Math.max(maxNormalAngle,difference);
 }
 assert.equal(maxPositionDelta,0,'Positions or corner order changed');assert.equal(maxColourDelta,0,'Authored colours changed');
 for(let j=0;j<b.i.length;j+=3){const ids=b.i.slice(j,j+3),points=ids.map(i=>b.p[i]),normal=cross(sub(points[1],points[0]),sub(points[2],points[0]));
  if(length(normal)<1e-10){faceNormals.push(null);continue;}const f=faceNormals.length;faceNormals.push(norm(normal));
  for(let k=0;k<3;k++){const ia=ids[k],ib=ids[(k+1)%3],ka=key(b.p[ia]),kb=key(b.p[ib]),e=[ka,kb].sort().join('|');if(!edges.has(e))edges.set(e,[]);edges.get(e).push({f,ends:{[ka]:ia,[kb]:ib}});}
 }
 const histogram=Array(18).fill(0);let hard=0,smooth=0,smoothContinuous=0,sharpSplit=0,nonManifold=0;
 for(const [k,pair]of edges){if(pair.length!==2){nonManifold++;continue;}const [u,v]=pair,angle=Math.acos(Math.min(1,Math.max(-1,dot(faceNormals[u.f],faceNormals[v.f]))))*180/Math.PI;histogram[Math.min(17,Math.floor(angle/10))]++;
  const delta=Math.max(...k.split('|').map(k=>length(sub(b.n[u.ends[k]],b.n[v.ends[k]]))));
  if(angle<30){smooth++;if(delta<1e-4)smoothContinuous++;}if(angle>60){hard++;if(delta>.1)sharpSplit++;}
 }
 return {triangles:a.i.length/3,corners:a.i.length,maxPositionDelta,maxColourDelta,normalCornersChangedOver1Degree:changed,maxNormalAngle,
   dihedralHistogram10Degrees:histogram,smoothEdgesBelow30:smooth,smoothContinuous,sharpEdgesAbove60:hard,sharpSplit,nonManifoldEdges:nonManifold};
}
const results=[];
for(const h of manifest.hulls.filter(h=>h.faction!=='VRA'&&(!chosen.length||chosen.includes(h.id)))){
 const after=angle?'evidence/revision-12/candidates/'+angle+'/'+h.id+'.glb':'prepared/fleet/'+h.id+'.glb';
 const stats=compareNormals('evidence/revision-12/baseline/'+h.id+'.glb',after);
 if(!angle){const current=read('prepared/fleet/'+h.id+'-preparation.json'),prior=read('evidence/revision-12/baseline/'+h.id+'-preparation.json'),policy=current.normalPolicy;
  for(const field of ['ratio','outputTriangles','sourceComponentCount','outputComponentCount','maximumVertexToSurfaceErrorMm','sourceComponents','outputComponents'])assert.deepEqual(current[field],prior[field],h.id+' geometry report changed: '+field);
  assert.deepEqual(read('prepared/fleet/'+h.id+'-regions.json'),read('evidence/revision-12/baseline/'+h.id+'-regions.json'),h.id+' region/attachment map changed');
  assert.equal(policy.creaseAngleDegrees,40);assert.match(policy.weighting,/face area and corner angle/);
  assert.ok(stats.smoothContinuous/stats.smoothEdgesBelow30>.999,'Smooth surface discontinuity: '+h.id);
  assert.ok(stats.sharpSplit/stats.sharpEdgesAbove60>.999,'Unsplit sharp crease: '+h.id);
 }
 const regions=read('evidence/revision-12/baseline/'+h.id+'-regions.json'),white=regions.patches.filter(p=>p.region==='fafafa');
 results.push({id:h.id,whitePatches:white.length,...stats});console.log(h.id+': geometry/colours exact; '+stats.normalCornersChangedOver1Degree+' changed normal corners; '+stats.smoothContinuous+'/'+stats.smoothEdgesBelow30+' smooth edges continuous');
}
const board=[];if(!angle&&!chosen.length)for(const name of ['monoceros','sparrowhawk']){
 const current=read('prepared/'+name+'-preparation.json'),prior=read('evidence/revision-12/baseline/board-'+name+'-preparation.json');
 for(const field of ['ratio','outputTriangles','sourceComponentCount','outputComponentCount','maximumVertexToSurfaceErrorMm','sourceComponents','outputComponents'])assert.deepEqual(current[field],prior[field],name+' board geometry report changed: '+field);
 assert.deepEqual(read('prepared/'+name+'-regions.json'),read('evidence/revision-12/baseline/board-'+name+'-regions.json'),name+' board region/attachment map changed');
 board.push({id:name,...compareNormals('evidence/revision-12/baseline/board-'+name+'.glb','prepared/'+name+'.glb')});
}
for(const [p,expected]of Object.entries(baseline.protected))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(p,here))).digest('hex'),expected,'Protected source/Vraygon changed: '+p);
fs.writeFileSync(new URL('evidence/revision-12/normal-audit'+(angle?'-'+angle:'')+'.json',here),JSON.stringify({protectedFiles:Object.keys(baseline.protected).length,results,board},null,2)+'\n');
