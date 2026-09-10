// Long, explicit comparison against a frozen pre-mount implementation at the
// SAME tuning. Run outside the fast suite: --baseline <root> [--out <report>].
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as current from '../src/tactical/resolver.js';
import { enableContacts } from '../src/tactical/contacts.js';
import { SENSING_PROFILE } from '../src/tactical/sensing.js';
import { fullState } from '../src/captains/trusted.js';
import { makePrng } from '../src/prng.js';
import { STANDARD, compFor } from './comp.js';
const args=process.argv.slice(2),option=key=>args[args.indexOf(key)+1];
if(!args.includes('--baseline'))throw new Error('Pass --baseline <frozen-source-root>');
const baseline=resolve(option('--baseline'));
const old=await import(pathToFileURL(join(baseline,'src/tactical/resolver.js')));
const oldContacts=await import(pathToFileURL(join(baseline,'src/tactical/contacts.js')));
const t=JSON.parse(readFileSync(new URL('../data/tactical-tuning.json',import.meta.url)));
const l=JSON.parse(readFileSync(new URL('../data/loadouts.json',import.meta.url)));
const normalize=value=>JSON.parse(JSON.stringify(value,(key,v)=>['wreckedTurn','wrecks','defenderIds'].includes(key)?undefined:v));
const hash=value=>createHash('sha256').update(value).digest('hex');
const cells=[];let rounds=0,turns=0;
const factions=['EAR','VRA','ZAN','KRE'];
for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)for(const profile of ['legacy','compatibility','finite'])for(const ordered of [false,true])for(let seed=1;seed<=4;seed++){
  const build=engine=>{
    const tuning=structuredClone(t),rng=makePrng(seed);
    const A=engine.buildFleet(factions[i],compFor(factions[i],STANDARD,tuning),tuning,l,rng,'A');
    const B=engine.buildFleet(factions[j],compFor(factions[j],STANDARD,tuning),tuning,l,rng,'B');
    engine.deployFleets(A,B,tuning);return engine.createBattleFromFleets([A,B],tuning,rng,{maxTurns:12});
  };
  const a=build(old),b=build(current);
  if(profile!=='legacy'){
    const opts=profile==='finite'?{profile:SENSING_PROFILE}:{};
    oldContacts.enableContacts(a,opts);enableContacts(b,opts);
  }
  const digests=[];
  while(!a.done){
    const captured=[];
    for(const [engine,battle] of [[old,a],[current,b]]){
      const orders=ordered?Object.fromEntries(battle.fleets.flat().filter(s=>!s.destroyed).map(s=>[s.id,{
        plan:[{turn:0,forward:1},{turn:0,forward:0},{turn:0,forward:0}],target:'auto',reserve:0.3
      }])):{};
      const shots=[],log=[],frames=[];
      engine.stepTurn(battle,orders,{onShot:e=>shots.push(structuredClone(e)),log:m=>log.push(m),onRound:()=>frames.push(fullState(battle))});
      captured.push(normalize({state:fullState(battle),shots,log,frames}));
    }
    const x=JSON.stringify(captured[0]),y=JSON.stringify(captured[1]);
    assert.equal(y,x,`${factions[i]}-${factions[j]} ${profile} ordered=${ordered} seed=${seed} turn=${a.turnsRun}`);
    turns++;rounds+=captured[0].frames.length;digests.push(hash(y));
  }
  cells.push({pairing:`${factions[i]}-${factions[j]}`,profile,ordered,seed,turns:a.turnsRun,digests});
}
const report={baseline,pass:true,battles:cells.length,executions:cells.length*2,turns,rounds,
  comparison:'Byte comparison of JSON for complete ship/PRNG/missile/lock/shield/stats/result state, per-round states, shots and narrative. Only additive wreckedTurn, wrecks and defenderIds removed.',cells};
if(args.includes('--out'))writeFileSync(option('--out'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,cells:undefined},null,2));
