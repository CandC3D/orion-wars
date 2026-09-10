import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readGLB,colourKey} from './glb-data.mjs';
import {validateFactionPalette} from './faction-palettes.js';
const here=fileURLToPath(new URL('./',import.meta.url)),source=path.join(here,'source');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.toLowerCase().endsWith('.glb')?[path.join(d,e.name)]:[]);
const files=walk(source).sort(),hulls=[];
for(const file of files){
 const name=path.basename(file),faction=name.startsWith('Earth')?'EAR':name.startsWith('Krelath')?'KRE':name.startsWith('Vraygon')?'VRA':null;
 if(!faction)throw Error('Unassigned source faction: '+name);
 const g=readGLB(file),regions={};let triangles=0,primitives=0;
 for(const mesh of g.json.meshes)for(const p of mesh.primitives){
  if(p.attributes.COLOR_0===undefined)throw Error('Missing COLOR_0: '+name);
  if(p.mode!==undefined&&p.mode!==4)throw Error('Non-triangle source primitive: '+name);
  const c=g.attribute(p.attributes.COLOR_0),pos=g.attribute(p.attributes.POSITION),ids=p.indices===undefined?pos.map((_,i)=>i):g.attribute(p.indices).flat();
  if(c.length!==pos.length)throw Error('Incomplete COLOR_0: '+name);
  for(let i=0;i<c.length;i++){
   if(c[i].some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Invalid colour: '+name);
   const k=colourKey(c[i]);const r=regions[k]??={vertices:0,area:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};r.vertices++;
   for(let j=0;j<3;j++){r.min[j]=Math.min(r.min[j],pos[i][j]);r.max[j]=Math.max(r.max[j],pos[i][j]);}
  }
  validateFactionPalette(faction,Object.keys(regions),{context:name});
  for(let i=0;i<ids.length;i+=3){
   const keys=ids.slice(i,i+3).map(j=>colourKey(c[j]));if(new Set(keys).size!==1)throw Error('Triangle crosses colour regions: '+name);
   const [a,b,d]=ids.slice(i,i+3).map(j=>pos[j]),u=b.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);
   regions[keys[0]].area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;
  }
  triangles+=ids.length/3;primitives++;
 }
 const area=Object.values(regions).reduce((s,r)=>s+r.area,0);
 for(const r of Object.values(regions)){r.areaFraction=r.area/area;delete r.area;}
 hulls.push({file:path.relative(source,file).replaceAll('\\','/'),faction,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),triangles,primitives,regions});
}
const report={format:'tabletop-library-audit/1',files:hulls.length,distinctFiles:new Set(hulls.map(h=>h.sha256)).size,scope:'Every GLB actually staged under prototype source/, including duplicate working copies; no originals outside worktree accessed.',validation:'All primitives have COLOR_0, single-region triangles and faction-allowed colours; missing optional colours are reported, not synthesised. Per-hull expected palettes remain enforced during preparation.',hulls};
fs.writeFileSync(path.join(here,'evidence/library-audit.json'),JSON.stringify(report,null,2)+'\n');
const rows=['# Staged library palette audit - revision 06','','Generated with `node arena/prototype-3d/audit-library.mjs`. Reads only staged working copies; no asset intake or scene changes.','','| Source file | Regions | Extended colour | Result |','|---|---:|---|---|',...hulls.map(h=>`| ${h.file} | ${Object.keys(h.regions).length} | ${['a7adb1','c8e4bd','75cedb'].filter(k=>h.regions[k]).map(k=>'#'+k).join(', ')||'none'} | Allowed faction palette |`),'',`${report.files} GLB files, ${report.distinctFiles} distinct contents. Root Monoceros and Shard duplicate their library copies. Only Sparrowhawk and Swift are staged for Krelath; the carrier, flagship, combined fleet and fighters were not inspected. Their supplied exceptions are encoded but are not claimed as validated. Zandrax remains recorded only.`, '', 'These are palette/export checks, not a visual review of every hull, anatomical verification of every part, or a full-board performance test. Full counts, source-local bounds, area shares and hashes are in evidence/library-audit.json.', ''];
fs.writeFileSync(path.join(here,'LIBRARY-AUDIT.md'),rows.join('\n'));console.log(JSON.stringify({files:report.files,distinctFiles:report.distinctFiles,factions:Object.fromEntries(['EAR','KRE','VRA'].map(f=>[f,hulls.filter(h=>h.faction===f).length]))}));
