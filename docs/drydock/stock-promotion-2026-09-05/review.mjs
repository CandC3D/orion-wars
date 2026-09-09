// Inspect Chris's explicitly supplied return directories. Originals are read-only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parsePack,stockPack} from '../../../src/construction/index.js';
import {sameContent} from '../../../src/construction/content.js';
import {stockChanges} from '../../../src/construction/stock-library.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const tuning=read('data/tactical-tuning.json'),loadouts=read('data/loadouts.json');
const sources=[['EAR','Earth Defense Force (EDF)'],['KRE','Krelath Star Navy (KSN)'],['VRA','Vraygon Topaz Warshard (VTW)'],['ZAN','Zandrax Horde Swarmfleet (ZHS)']];
const hash=b=>createHash('sha256').update(b).digest('hex'),entries=[],seen=new Set(),issues=[];
function changes(a,b,p=''){
  if(sameContent(a,b))return [];
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return [{path:p,before:a,after:b}];
  return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>changes(a[k],b[k],p+'/'+k));
}
for(const [faction,label]of sources){
  const dir=path.join('C:/Users/chorr/Downloads',label+' stock ships with corrected firing arcs');
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(!e.isFile()||!e.name.endsWith('.drydock.json')){issues.push({file:path.join(dir,e.name),reason:'Unexpected entry; not inspected'});continue;}
    const source=path.join(dir,e.name),bytes=fs.readFileSync(source);let p;
    try{p=parsePack(bytes.toString('utf8'),tuning);}catch(error){issues.push({source,reason:error.message});continue;}
    const key=p.design.faction+'/'+p.design.className;
    if(p.design.faction!==faction||!tuning.rosters[faction].includes(p.design.className))issues.push({source,reason:'Faction/class does not match supplied folder roster'});
    if(seen.has(key))issues.push({source,reason:'Duplicate faction/class return'});seen.add(key);
    const baseline=stockPack(p.design.faction,p.design.className,tuning,loadouts),diff=changes(baseline,p);
    const identity=diff.filter(d=>['/design/id','/design/revision','/design/name','/design/notes'].includes(d.path));
    const layout=diff.filter(d=>/^\/design\/mounts\/\d+\/(faces|position|orientation)(\/|$)/.test(d.path));
    const other=diff.filter(d=>!identity.includes(d)&&!layout.includes(d));
    entries.push({source,sha256:hash(bytes),bytes:bytes.length,key,profile:p.profile,revision:p.design.revision,designId:p.design.id,name:p.design.name,mountCount:p.design.mounts.length,baselineMountCount:baseline.design.mounts.length,identity,layout,other,review:stockChanges(baseline,p)});
  }
}
const missing=sources.flatMap(([f])=>tuning.rosters[f].filter(c=>!seen.has(f+'/'+c)).map(c=>f+'/'+c));
const report={at:new Date().toISOString(),mode:'review-only; no defaults or original exports changed',baselineHashes:Object.fromEntries(['data/tactical-tuning.json','data/loadouts.json'].map(p=>[p,hash(fs.readFileSync(path.join(root,p)))])),counts:{files:entries.length,expected:29,withLayoutChanges:entries.filter(e=>e.layout.length).length,withOtherChanges:entries.filter(e=>e.other.length).length},missing,issues,entries};
fs.writeFileSync(path.join(here,'review.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,missing,issues,entries:entries.map(({key,name,mountCount,baselineMountCount,layout,other})=>({key,name,mountCount,baselineMountCount,layoutFields:layout.length,other}))},null,2));
