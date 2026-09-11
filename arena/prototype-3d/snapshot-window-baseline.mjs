import fs from 'node:fs';
import {createHash} from 'node:crypto';
const here=new URL('./',import.meta.url),out=new URL('evidence/revision-12/',here);
const manifest=JSON.parse(fs.readFileSync(new URL('fleet-assets.json',here)));
fs.mkdirSync(new URL('baseline/',out),{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,here))).digest('hex');
const baseline={head:'120ea9f',hulls:{},protected:{}};
for(const h of manifest.hulls){
 const files=[...['.glb','-regions.json','-preparation.json'].map(s=>'prepared/fleet/'+h.id+s),
   ...['quarter','side','strip'].map(v=>'evidence/fleet/images/'+h.id+'-'+v+'.png')];
 if(h.faction==='VRA'){for(const p of files)baseline.protected[p]=hash(p);continue;}
 baseline.hulls[h.id]={};
 for(const p of files){baseline.hulls[h.id][p]=hash(p);const dest=new URL('baseline/'+p.split('/').at(-1),out);if(!fs.existsSync(dest))fs.copyFileSync(new URL(p,here),dest);}
}
for(const name of ['monoceros','sparrowhawk'])for(const suffix of ['.glb','-regions.json','-preparation.json']){
 const p='prepared/'+name+suffix,dest=new URL('baseline/board-'+name+suffix,out);if(!fs.existsSync(dest))fs.copyFileSync(new URL(p,here),dest);
}
for(const p of ['fleet-sheets/vraygon.html','fleet-sheets/vraygon.png','fleet-sheets/vraygon-strip.png','fleet-sheets/vraygon-overview.png','fleet-sheets/sheets.css',
 ...['shard','crystal'].flatMap(n=>['.glb','-regions.json','-preparation.json'].map(s=>'prepared/'+n+s))])baseline.protected[p]=hash(p);
for(const directory of ['source/edf/','source/ksn/','source/vtw/'])for(const file of fs.readdirSync(new URL(directory,here)))if(file.endsWith('.glb'))baseline.protected[directory+file]=hash(directory+file);
const record=new URL('baseline.json',out);if(fs.existsSync(record))throw Error('Historical baseline already exists; refusing to replace it');
fs.writeFileSync(record,JSON.stringify(baseline,null,2)+'\n');
for(const p of ['evidence/fleet/captures.json','evidence/fleet/scores.json'])fs.copyFileSync(new URL(p,here),new URL('baseline/'+p.split('/').at(-1),out));
console.log('Preserved 18 active hull baselines, both board frigates, and fingerprints of Vraygon/source files.');
