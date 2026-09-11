// Rebuild only approved Earth/Krelath derivatives, at their existing ratios.
import fs from 'node:fs';import {spawnSync} from 'node:child_process';
const root='arena/prototype-3d/',manifest=JSON.parse(fs.readFileSync(root+'fleet-assets.json'));
const selected=process.argv.slice(2),ids=manifest.hulls.filter(h=>h.faction!=='VRA'&&(!selected.length||selected.includes(h.id)));
if(selected.some(id=>!ids.some(h=>h.id===id)))throw Error('Select only active Earth/Krelath hull IDs');
for(const h of ids){
 const prior=JSON.parse(fs.readFileSync(root+'evidence/revision-12/baseline/'+h.id+'-preparation.json'));
 const args=['--background','--python-exit-code','1','--python',root+'prepare-models.py','--',h.faction,'--fleet',h.id,'--ratio',String(prior.ratio)];
 const r=spawnSync(process.env.PROTOTYPE_BLENDER||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',args,{encoding:'utf8',maxBuffer:32e6,windowsHide:true});
 fs.writeFileSync(root+'evidence/revision-12/'+h.id+'-rebuild.log',r.stdout+r.stderr);if(r.status!==0)throw Error(h.id+' rebuild failed; see log');
 const maps=spawnSync(process.execPath,[root+'inspect-regions.mjs',h.faction,'--fleet',h.id],{encoding:'utf8',maxBuffer:8e6});if(maps.status!==0)throw Error(h.id+' region validation: '+maps.stdout+maps.stderr);
 console.log(h.id+' rebuilt at unchanged reduction '+prior.ratio);
}
if(!selected.length)for(const [f,name]of [['EAR','monoceros'],['KRE','sparrowhawk']]){
 const prior=JSON.parse(fs.readFileSync(root+'evidence/revision-12/baseline/board-'+name+'-preparation.json'));
 const r=spawnSync(process.env.PROTOTYPE_BLENDER||'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',['--background','--python-exit-code','1','--python',root+'prepare-models.py','--',f,'--ratio',String(prior.ratio)],{encoding:'utf8',maxBuffer:32e6,windowsHide:true});
 fs.writeFileSync(root+'evidence/revision-12/board-'+name+'-rebuild.log',r.stdout+r.stderr);if(r.status!==0)throw Error('Board '+name+' rebuild failed');
 const maps=spawnSync(process.execPath,[root+'inspect-regions.mjs',f],{encoding:'utf8',maxBuffer:8e6});if(maps.status!==0)throw Error('Board '+name+' regions: '+maps.stdout+maps.stderr);console.log('Board '+name+' corrected at unchanged reduction');
}
