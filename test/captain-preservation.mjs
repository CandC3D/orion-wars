import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as current from '../src/tactical/resolver.js';
import { makePrng } from '../src/prng.js';
import { enableContacts } from '../src/tactical/contacts.js';
import { fullState } from '../src/captains/trusted.js';
import { canonicalJSON } from '../src/captains/json.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const index=process.argv.indexOf('--baseline');
if(index<0 || !process.argv[index+1]) throw new Error('Pass --baseline <frozen-source-root>');
const baseline=resolve(process.argv[index+1]);
const old=await import(pathToFileURL(join(baseline,'src/tactical/resolver.js')));
const read=(dir,p)=>JSON.parse(readFileSync(join(dir,p),'utf8'));
const hash=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const cells=[];
for(const faction of ['EAR','VRA','ZAN','KRE'])for(let seed=1;seed<=6;seed++) {
  const create=(engine,dir)=>{
    const t=read(dir,'data/tactical-tuning.json'),l=read(dir,'data/loadouts.json'),rng=makePrng(seed);
    const list={'heavy-cruiser':1,'light-cruiser':2,destroyer:2,frigate:4};
    const A=engine.buildFleet(faction,list,t,l,rng,'A'), B=engine.buildFleet('EAR',list,t,l,rng,'B');
    engine.deployFleets(A,B,t); return engine.createBattleFromFleets([A,B],t,rng,{maxTurns:6});
  };
  const a=create(old,baseline),b=create(current,root);enableContacts(b);
  const digestTurns=[];
  while(!a.done) {
    const captured=[];
    for(const [engine,battle] of [[old,a],[current,b]]) {
      const shots=[],log=[],frames=[];
      engine.stepTurn(battle,{}, {onShot:e=>shots.push(structuredClone(e)),log:m=>log.push(m),onRound:()=>{
        const state=fullState(battle);delete state.contacts;frames.push(state);
      }});
      const state=fullState(battle); delete state.contacts;
      captured.push({state,shots,log,frames});
    }
    assert.deepEqual(captured[1],captured[0],`${faction} seed ${seed}: legacy combat changed`);
    digestTurns.push(hash(captured[1]));
  }
  cells.push({faction,seed,turns:a.turnsRun,digests:digestTurns});
}
const report={source:root,baseline,matches:cells.length,combatExecutions:cells.length*2,
  comparison:'All ship fields, RNG, missiles, stats, result, per-round state, shots and logs. Only new contact bookkeeping excluded.',pass:true,cells};
const out=process.argv.indexOf('--out');
if(out>=0)writeFileSync(resolve(process.argv[out+1]),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({matches:report.matches,combatExecutions:report.combatExecutions,pass:true}));
