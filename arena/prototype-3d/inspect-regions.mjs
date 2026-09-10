import fs from 'node:fs';
import {readGLB,colourKey} from './glb-data.mjs';
const here=new URL('./',import.meta.url);
const source=readGLB(new URL('./source/Krelath KFG-01 _Sparrowhawk_ Class Frigate.glb',here));
const sp=source.json.meshes[0].primitives[0],sc=source.attribute(sp.attributes.COLOR_0);
const palette=[];
for(const c of sc){const key=colourKey(c);let p=palette.find(p=>p.key===key);if(!p){p={key,rgb:c.slice(0,3),sourceVertices:0};palette.push(p);}p.sourceVertices++;}
const glb=readGLB(new URL('./prepared/sparrowhawk.glb',here)),p=glb.json.meshes[0].primitives[0];
const positions=glb.attribute(p.attributes.POSITION),colours=glb.attribute(p.attributes.COLOR_0),indices=glb.attribute(p.indices).flat();
const nearest=c=>palette.reduce((best,p,i)=>{const d=p.rgb.reduce((n,x,k)=>n+(x-c[k])**2,0);return d<best.d?{i,d}:best;},{d:Infinity}).i;
const key=v=>v.map(n=>Math.round(n*1e6)).join(','),edges=new Map(),faces=[];
for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),region=nearest(colours[ids[0]]);
 if(ids.some(id=>nearest(colours[id])!==region))throw Error('Mixed triangle');
 const f={ids,region,neighbours:[]};faces.push(f);for(let j=0;j<3;j++){const e=[key(positions[ids[j]]),key(positions[ids[(j+1)%3]])].sort().join('|'),other=edges.get(e);
 if(other!==undefined&&faces[other].region===region){f.neighbours.push(other);faces[other].neighbours.push(faces.length-1);}else edges.set(e,faces.length-1);}
}
const seen=new Set(),patches=[];
for(let i=0;i<faces.length;i++){if(seen.has(i))continue;const todo=[i],ids=[];seen.add(i);while(todo.length){const n=todo.pop();ids.push(n);for(const k of faces[n].neighbours)if(!seen.has(k)){seen.add(k);todo.push(k);}}
 const pts=ids.flatMap(n=>faces[n].ids.map(id=>positions[id]));patches.push({region:palette[faces[i].region].key,triangles:ids.length,min:[0,1,2].map(k=>Math.min(...pts.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...pts.map(p=>p[k]))),faces:ids});
}
patches.sort((a,b)=>a.region.localeCompare(b.region)||b.triangles-a.triangles);
// The v2 plate identifies a vertical orange stern exhaust and the larger yellow
// dorsal dome. Each selector must match one actual connected source-colour patch.
const select=(label,predicate)=>{const found=patches.filter(predicate);if(found.length!==1)throw Error('Re-author semantic region: '+label);return {...found[0],register:'energetic',anatomy:label};};
const features={
  exhaust:select('vertical stern exhaust',p=>p.region==='f5831f'&&p.max[0]<-2.9&&p.min[1]>.1),
  beamEmitter:select('larger dorsal emitter',p=>p.region==='ffdd1a'&&p.min[0]>.2&&p.min[1]>.6)
};
function coverage(glb){
  const primitive=glb.json.meshes[0].primitives[0],p=glb.attribute(primitive.attributes.POSITION),c=glb.attribute(primitive.attributes.COLOR_0),ids=glb.attribute(primitive.indices).flat(),areas=Array(7).fill(0);
  for(let i=0;i<ids.length;i+=3){const [a,b,d]=ids.slice(i,i+3).map(i=>p[i]),u=b.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);
    const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
    areas[nearest(c[ids[i]])]+=area;
  }
  const total=areas.reduce((a,b)=>a+b,0);return Object.fromEntries(palette.map((p,i)=>[p.key,areas[i]/total]));
}
const sourceCoverage=coverage(source),derivativeCoverage=coverage(glb);
for(const p of palette)p.register='physical';
for(const p of patches)p.register='physical';
fs.writeFileSync(new URL('./prepared/regions.json',here),JSON.stringify({format:'tabletop-colour-regions/1',palette,patches,features,sourceCoverage,derivativeCoverage},null,2)+'\n');
console.log(JSON.stringify({palette,patches:patches.map(({faces,...p})=>p)},null,2));
