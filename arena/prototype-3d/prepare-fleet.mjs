import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root='arena/prototype-3d/',inventory=JSON.parse(fs.readFileSync(root+'prepared/fleet/inventory.json'));
fs.mkdirSync(root+'evidence/fleet',{recursive:true});
const selected=process.argv.slice(2),results=[];
for(const h of inventory.hulls.filter(h=>!selected.length||selected.includes(h.id))){
 let ok=false;
 for(const ratio of [...new Set([h.config.ratio,Math.max(h.config.ratio,.25),.5,.8])]){
  const args=['--background','--python-exit-code','1','--python',root+'prepare-models.py','--',h.config.faction,'--fleet',h.id,'--ratio',String(ratio)];
  const r=spawnSync(process.env.PROTOTYPE_BLENDER||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',args,{encoding:'utf8',maxBuffer:32e6,windowsHide:true});
  fs.writeFileSync(root+'evidence/fleet/'+h.id+'-preparation.log',r.stdout+r.stderr);
  if(r.status===0){ok=true;break;}console.log(h.id+' reduction '+ratio.toFixed(3)+' rejected; increasing retained detail');
 }
 if(!ok)throw Error('Preparation withheld: '+h.id+'; inspect its log');
 const p=JSON.parse(fs.readFileSync(root+'prepared/fleet/'+h.id+'-preparation.json'));
 const map=spawnSync(process.execPath,[root+'inspect-regions.mjs',h.config.faction,'--fleet',h.id],{encoding:'utf8',maxBuffer:8e6});
 if(map.status!==0)throw Error(h.id+' regions: '+map.stderr+map.stdout);
 results.push({id:h.id,triangles:p.outputTriangles,bytes:p.outputBytes,errorMm:p.maximumVertexToSurfaceErrorMm,ratio:p.ratio});
 console.log(h.id+': '+p.outputTriangles+' triangles, '+p.outputBytes+' bytes, '+p.maximumVertexToSurfaceErrorMm.toFixed(4)+' mm maximum measured deviation');
}
// Keep a complete resume-safe summary, not just the last selected subset.
const complete=inventory.hulls.flatMap(h=>{const file=root+'prepared/fleet/'+h.id+'-preparation.json';if(!fs.existsSync(file))return [];const p=JSON.parse(fs.readFileSync(file));if(p.sourceSha256!==h.sha256||Math.abs(p.miniatureLengthMm-h.miniatureLengthMm)>1e-8)return [];return [{id:h.id,triangles:p.outputTriangles,bytes:p.outputBytes,errorMm:p.maximumVertexToSurfaceErrorMm,ratio:p.ratio}];});
fs.writeFileSync(root+'evidence/fleet/preparation-run.json',JSON.stringify(complete,null,2)+'\n');
