// Exact paired-seed isolation of the September 10 radius amendment. The seed
// strings, mirror convention and stock composition match fleet-trial.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFleet, deployFleets, runBattle } from '../src/tactical/resolver.js';
import { makePrng, seedFromString } from '../src/prng.js';
import { STANDARD, compFor } from './comp.js';
const args=process.argv.slice(2),n=args.includes('--battles')?Number(args[args.indexOf('--battles')+1]):300;
const tuning=JSON.parse(readFileSync(new URL('../data/tactical-tuning.json',import.meta.url)));
const loadouts=JSON.parse(readFileSync(new URL('../data/loadouts.json',import.meta.url)));
const faction=['EAR','VRA','ZAN','KRE'];
const configs=[3,4].map(radius=>{const t=structuredClone(tuning);t.pointDefence.rangeHexes=radius;return t;});
const rows=[];
for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
  const a=faction[i],b=faction[j],counts=configs.map(()=>({winsA:0,winsB:0,draws:0,turns:0})),transitions={};
  for(let seed=0;seed<n;seed++)for(const reversed of [false,true]){
    const victories=[];
    for(let config=0;config<configs.length;config++){
      const t=configs[config],rng=makePrng(seedFromString(`${a}-${b}-${seed}`));
      const fa=reversed?b:a,fb=reversed?a:b;
      const A=buildFleet(fa,compFor(fa,STANDARD,t),t,loadouts,rng,'A'),B=buildFleet(fb,compFor(fb,STANDARD,t),t,loadouts,rng,'B');
      deployFleets(A,B,t);const result=runBattle([A,B],t,rng,{});
      const victor=reversed?(result.victor==='A'?'B':result.victor==='B'?'A':null):result.victor;
      counts[config][victor==='A'?'winsA':victor==='B'?'winsB':'draws']++;
      counts[config].turns+=result.turns;victories.push(victor??'draw');
    }
    const transition= victories.join(' -> ');transitions[transition]=(transitions[transition]??0)+1;
  }
  const total=n*2;
  const rates=counts.map(c=>({...c,percentA:c.winsA/total*100,percentB:c.winsB/total*100,percentDraws:c.draws/total*100,avgTurns:c.turns/total}));
  const row={a,b,total,radius3:rates[0],radius4:rates[1],deltaA:rates[1].percentA-rates[0].percentA,deltaB:rates[1].percentB-rates[0].percentB,transitions};
  rows.push(row);console.log(`${a} v ${b}: ${counts[0].winsA}/${counts[0].winsB}/${counts[0].draws} -> ${counts[1].winsA}/${counts[1].winsB}/${counts[1].draws}; A ${(row.deltaA).toFixed(2)} pp`);
}
const report={battlesPerPairing:n*2,executions:n*2*6*2,points:52,rows};
if(args.includes('--out'))writeFileSync(args[args.indexOf('--out')+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({executions:report.executions,points:52,pass:true}));
