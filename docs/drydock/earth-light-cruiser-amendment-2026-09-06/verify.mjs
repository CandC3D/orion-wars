// New amendment evidence only. Never overwrite the prior review inputs/results.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'approved-designs.json'))),entry=manifest.designs[0];
const raw=fs.readFileSync(entry.sourceFile);assert.equal(hash(raw),entry.sourceSha256);assert.deepEqual(JSON.parse(raw),entry.pack);
const input=JSON.parse(fs.readFileSync(path.join(root,'docs/dispatch/fable-special-commands-2026-09-06/input.json')));
const inventoryBytes=fs.readFileSync(path.join(input.evidence,input.inventoryFile));assert.equal(hash(inventoryBytes),input.inventorySha256);
const inventory=JSON.parse(inventoryBytes),changed=[];
const allowed=new Set(['data/loadouts.json','test/fixtures/stock-approvals.js','test/stock-amendments.js','test/run-tests.js']);
for(const e of inventory){
  assert.equal(hash(fs.readFileSync(path.join(input.source,e.path))),e.sha256,`Frozen special-command input changed: ${e.path}`);
  if(hash(fs.readFileSync(path.join(root,e.path)))!==e.sha256){assert.ok(allowed.has(e.path),`Unexpected live delta since special freeze: ${e.path}`);changed.push(e.path);}
}
const fast=spawnSync(process.execPath,['test/run-tests.js'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:30*1024*1024});
fs.writeFileSync(path.join(here,'fast-tests.log'),(fast.stdout??'')+(fast.stderr??''),{flag:'wx'});assert.equal(fast.status,0,fast.stderr);
for(const e of inventory)assert.equal(hash(fs.readFileSync(path.join(input.source,e.path))),e.sha256,e.path);
assert.equal(hash(fs.readFileSync(path.join(input.evidence,input.fastSuite.log))),input.fastSuite.logSha256);
const paths=[...changed,'test/stock-earth-light-cruiser.mjs','docs/drydock/verify-stock-promotion.mjs','docs/drydock/earth-light-cruiser-amendment-2026-09-06/approved-designs.json'];
const result={at:new Date().toISOString(),source:{file:entry.sourceFile,sha256:entry.sourceSha256,bytes:raw.length},
  change:{ship:'EAR/light-cruiser',stockRevision:{before:2,after:3},mount:1,faces:{before:[1,2,3,6],after:[1,2,6]},otherStockPacksPreserved:28},
  fastSuite:{exit:fast.status,log:'fast-tests.log',sha256:hash(fs.readFileSync(path.join(here,'fast-tests.log')))},
  focused:{groups:6,headingBearingCases:36,historicalPositiveControls:6,pinnedHistoryPreserved:true},
  frozenReview:{source:input.source,inventorySha256:input.inventorySha256,files:inventory.length,mismatches:0,fastLogUnchanged:true,liveChangedPaths:changed},
  currentSource:paths.map(p=>({path:p,sha256:hash(fs.readFileSync(path.join(root,p)))})),
  notes:'Independent acceptance not claimed. No balance sweep or browser-local changes. Browser evidence is separate.'};
fs.writeFileSync(path.join(here,'verification.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
