// Bookkeeping after direct visual review. Criterion scores are manually authored;
// this script only checks the gate, computes totals and fingerprints the evidence.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const here=new URL('./',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,here)));
const manifest=await read('fleet-assets.json'),review=await read('evidence/revision-12/scores.json');
const hulls=manifest.hulls.filter(h=>h.faction!=='VRA');
assert.deepEqual(Object.keys(review.hulls).sort(),hulls.map(h=>h.id).sort());
assert.deepEqual(Object.keys(review.sheets).sort(),['EAR','KRE']);
assert.equal(review.canSeeCapturedFrames,true);
const total=(s,w)=>{assert.equal(s.criteria.length,w.length);assert.ok(s.criteria.every(v=>v>=90&&v<=100));return Math.round(s.criteria.reduce((sum,v,i)=>sum+v*Math.round(w[i]*100),0)/10)/10;};
const fingerprints=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await fs.readFile(new URL(p,here))).digest('hex')])));
for(const h of hulls){
 const s=review.hulls[h.id];s.total=total(s,review.hullWeights);
 const paths=['.glb','-regions.json','-preparation.json'].map(s=>'prepared/fleet/'+h.id+s);
 for(const v of ['side','quarter','strip'])for(const prefix of ['evidence/fleet/images/','evidence/revision-12/baseline/'])paths.push(prefix+h.id+'-'+v+'.png');
 for(const v of ['side','port','quarter','top',...(['ear-acamar','kre-sparrowhawk'].includes(h.id)?['detail']:[])])for(const m of ['before','after'])paths.push('evidence/revision-12/neutral/'+h.id+'-'+m+'-'+v+'.png');
 s.evidence=await fingerprints(paths);
}
for(const s of Object.values(review.sheets))s.total=total(s,review.sheetWeights);
const hullTable=['| Hull | N | G | M | I | Weighted /100 | Checked detail and remaining limits |','|---|---:|---:|---:|---:|---:|---|',...hulls.map(h=>{const s=review.hulls[h.id];return '| ['+h.name+' · '+h.code+'](WINDOW-COMPARISONS.html#'+h.id+'/neutral-side) | '+s.criteria.join(' | ')+' | **'+s.total.toFixed(1)+'** | '+s.note+' |';})].join('\n');
const sheetTable=['| Sheet | Inventory | Windows/curvature | Comparison/scale | Layout/evidence | Weighted /100 |','|---|---:|---:|---:|---:|---:|',...Object.entries(review.sheets).map(([f,s])=>'| '+(f==='EAR'?'Earth':'Krelath')+' | '+s.criteria.join(' | ')+' | **'+s.total.toFixed(1)+'** |')].join('\n');
let report=await fs.readFile(new URL('REVISION-12-REVIEW.md',here),'utf8');
for(const [marker,table]of [['HULL-SCORES',hullTable],['SHEET-SCORES',sheetTable]]){
 const start='<!-- '+marker+' -->',end='<!-- END-'+marker+' -->',from=report.indexOf(start);assert.ok(from>=0);
 const to=report.indexOf(end,from),after=to<0?from+start.length:to+end.length;
 report=report.slice(0,from)+start+'\n\n'+table+'\n\n'+end+report.slice(after);
}
await fs.writeFile(new URL('REVISION-12-REVIEW.md',here),report);
review.fileEvidence=await fingerprints([
 'REVISION-12-RUBRIC.md','REVISION-12-REVIEW.md','prepare-models.py','rebuild-window-normals.mjs',
 'normal-study.js','normal-study.html','capture-normal-study.mjs','audit-window-normals.mjs',
 'verify-window-captures.mjs','build-window-comparisons.mjs','WINDOW-COMPARISONS.html','seal-window-review.mjs',
 'build-fleet-sheets.mjs','capture-fleet-sheets.mjs','capture-fleet.mjs',
 'fleet-assets.json','fleet-contract.js','faction-palettes.json','faction-palettes.js',
 'hull-paint.js','hull-art.js','paint-edges.js','fleet-studio.js','fleet-mount.js',
 'evidence/fleet/captures.json','evidence/revision-12/baseline.json',
 'evidence/revision-12/normal-audit.json','evidence/revision-12/matched-captures.json',
 'evidence/revision-12/neutral/cameras-all-earth-krelath-before_after.json',
 ...['monoceros','sparrowhawk'].flatMap(n=>['.glb','-regions.json','-preparation.json'].map(s=>'prepared/'+n+s))
]);
await fs.writeFile(new URL('evidence/revision-12/scores.json',here),JSON.stringify(review,null,2)+'\n');
console.log(JSON.stringify({hullMinimum:Math.min(...Object.values(review.hulls).map(h=>h.total)),criterionMinimum:Math.min(...Object.values(review.hulls).flatMap(h=>h.criteria)),sheets:review.sheets}));
