// Emits reviewed source patches; apply with apply_patch. Never edits returns.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/dispatch/fable-stock-promotion-2026-09-05/input-v2.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const inventoryBytes=fs.readFileSync(path.join(manifest.returnEvidence,'return-inventory.json'));
if(hash(inventoryBytes)!==manifest.returnInventorySha256)throw new Error('Return inventory changed');
const inventory=JSON.parse(inventoryBytes),packs=inventory.map(f=>{const b=fs.readFileSync(path.join(manifest.returns,f.path));if(hash(b)!==f.sha256)throw new Error(f.path);return {entry:f,pack:JSON.parse(b)};});
if(packs.length!==29||manifest.approved.monitor.superstructure!==220)throw new Error('Approved inputs incomplete');
const file=process.argv[2];let before='',after='',target;
if(file==='loadouts'){
  target='data/loadouts.json';before=fs.readFileSync(path.join(root,target),'utf8').replaceAll('\r\n','\n');
  const baseline=fs.readFileSync(path.join(manifest.source,target),'utf8').replaceAll('\r\n','\n');if(before!==baseline)throw new Error('Live loadouts changed since freeze');
  const next=JSON.parse(before);
  for(const {pack:p}of packs){const d=p.design,f=next[d.faction];f[d.className]??=structuredClone(f._default);
    f[d.className].mounts=d.mounts.map(m=>({type:m.weapon.id.replace(/^stock:/,''),faces:m.faces,position:m.position,orientation:m.orientation}));
  }
  next._publishedStock={revision:2,date:'2026-09-05',source:'Chris-authored faction layouts; all 29 classes. Explicit mounts supersede envelope/cyclic arcs. Monitor stat ruling is in tactical-tuning.json.'};
  after=JSON.stringify(next,null,2)+'\n';
}else if(file==='manifest'){
  target='docs/drydock/stock-promotion-2026-09-05/approved-designs.json';if(fs.existsSync(path.join(root,target)))throw new Error('Approved fixture already exists');
  after=JSON.stringify({date:'2026-09-05',approval:'All 29 returned layouts; monitor 24 points / 32 magazine / 220 structure explicitly confirmed by Chris.',designs:packs.map(({entry,pack})=>({key:entry.key,sourceFile:path.basename(entry.original),sourceSha256:entry.sha256,pack}))},null,2)+'\n';
}else if(['baseline-tuning','baseline-loadouts'].includes(file)){
  const name=file==='baseline-tuning'?'tactical-tuning.json':'loadouts.json';
  target='docs/drydock/stock-promotion-2026-09-05/baseline/'+name;if(fs.existsSync(path.join(root,target)))throw new Error('Baseline already preserved');
  after=fs.readFileSync(path.join(manifest.source,'data',name),'utf8').replaceAll('\r\n','\n');
}else throw new Error('Choose loadouts, manifest, baseline-tuning or baseline-loadouts');
const abs=path.join(root,target).replaceAll('\\','/');
console.log('*** Begin Patch\n'+(before?`*** Update File: ${abs}\n@@\n`+before.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n':`*** Add File: ${abs}\n`)+after.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch');
