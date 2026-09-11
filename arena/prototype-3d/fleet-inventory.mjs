import fs from 'node:fs';
import crypto from 'node:crypto';
import {readGLB,colourKey} from './glb-data.mjs';
import {validateFactionPalette} from './faction-palettes.js';
const root=new URL('./',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('fleet-assets.json',root)));
const actual=['edf','ksn','vtw'].flatMap(d=>fs.readdirSync(new URL('source/'+d+'/',root)).filter(f=>f.endsWith('.glb')).map(f=>d+'/'+f));
const listed=[...manifest.hulls.map(h=>h.source),...manifest.excluded,...manifest.retired.map(h=>h.source)];
if(JSON.stringify(actual.sort())!==JSON.stringify(listed.sort()))throw Error('Incomplete or duplicate library manifest');
const report=[];
for(const hull of manifest.hulls){
 if(!Object.hasOwn(hull,'code')||(!hull.code&&hull.codeStatus!=='pending Chris'))throw Error('Missing explicit class code decision: '+hull.id);
 const file=new URL('source/'+hull.source,root),{json,attribute}=readGLB(file);
 if(json.meshes.length!==1||json.meshes[0].primitives.length!==1)throw Error('Inspect changed export: '+hull.source);
 const p=json.meshes[0].primitives[0],positions=attribute(p.attributes.POSITION),colours=attribute(p.attributes.COLOR_0),indices=attribute(p.indices).flat();
 const regions={};for(let i=0;i<colours.length;i++){const k=colourKey(colours[i]),r=regions[k]??={vertices:0,area:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};r.vertices++;for(let a=0;a<3;a++){r.min[a]=Math.min(r.min[a],positions[i][a]);r.max[a]=Math.max(r.max[a],positions[i][a]);}}
 validateFactionPalette(hull.faction,Object.keys(regions),{context:hull.source});
 for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),keys=ids.map(j=>colourKey(colours[j]));if(new Set(keys).size!==1)throw Error('Mixed source triangle '+hull.id);
  const [a,b,c]=ids.map(j=>positions[j]),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);regions[keys[0]].area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
 }
 const a=json.accessors[p.attributes.POSITION],axis=hull.nativeBow.endsWith('Y')?1:0,length=a.max[axis]-a.min[axis],total=Object.values(regions).reduce((s,r)=>s+r.area,0);
 for(const r of Object.values(regions))r.areaShare=r.area/total;
 const lengthMm=manifest.scale.referenceMiniatureMm*Math.pow(length/manifest.scale.referenceSourceLength,manifest.scale.exponent);
 const config={...hull,output:hull.id,lengthMm,ratio:Math.min(.6,26000/(indices.length/3)),colours:Object.fromEntries(Object.entries(regions).map(([k,r])=>[k,r.vertices])),orientationNote:'Source longitudinal '+hull.nativeBow+' normalized to +X; source Z up. No rules facing or new system anatomy inferred.'};
 if(hull.faction==='EAR')config.materialBounds={e1ad34:{sourceMin:regions.e1ad34.min.map(n=>n-.002),sourceMax:regions.e1ad34.max.map(n=>n+.002),role:'source gold region (sensor dish, per faction contract; visually inspected on sheet)'}};
 report.push({id:hull.id,source:hull.source,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sourceTriangles:indices.length/3,sourceExtent:a.max.map((v,i)=>v-a.min[i]),sourceLongitudinalLength:length,calibratedLengthM:length*205/manifest.scale.referenceSourceLength,miniatureLengthMm:lengthMm,regions,config});
 console.log(hull.id+': '+length.toFixed(3)+' units / '+(length*205/manifest.scale.referenceSourceLength).toFixed(2)+' m / '+lengthMm.toFixed(2)+' mm / '+Object.keys(regions).length+' regions');
}
fs.mkdirSync(new URL('prepared/fleet/',root),{recursive:true});
fs.writeFileSync(new URL('prepared/fleet/inventory.json',root),JSON.stringify({format:'complete-library-inventory/1',count:report.length,excluded:manifest.excluded,calibrationMetresPerUnit:205/manifest.scale.referenceSourceLength,hulls:report},null,2)+'\n');
