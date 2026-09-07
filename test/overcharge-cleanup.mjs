// Removing unused laser metadata is not a weapon rule or stock revision.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const args=process.argv.slice(2),i=args.indexOf('--source');
const root=i<0?fileURLToPath(new URL('../',import.meta.url)):resolve(args[i+1]);
const old=args.includes('--expect-old'),moduleAt=p=>import(pathToFileURL(resolve(root,p)));
const tuning=JSON.parse(readFileSync(resolve(root,'data/tactical-tuning.json'))),loadouts=JSON.parse(readFileSync(resolve(root,'data/loadouts.json')));
const {stockPack,upgradeEngineering,compileDesign,validateWeapon}=await moduleAt('src/construction/index.js');
const {buildShip}=await moduleAt('src/tactical/ship.js');
const {createBattle,stepTurn}=await moduleAt('src/tactical/resolver.js');
const {fullState}=await moduleAt('src/captains/trusted.js');
const {makePrng}=await moduleAt('src/prng.js');
const copy=structuredClone,checks=[];
function check(name,fn){fn();checks.push(name);console.log('ok: '+name);}
check(old?'Old catalogue advertises an unimplemented laser overcharge':'Laser catalogue no longer advertises an unimplemented mode',()=>{
  assert.equal(Object.hasOwn(tuning.weapons['laser-cannon'],'overcharge'),old);
  assert.equal(/overcharg/i.test(tuning.weapons['laser-cannon']._note),old);
});
const withFlag=copy(tuning);withFlag.weapons['laser-cannon'].overcharge=true;
withFlag.weapons['laser-cannon']._note='Accurate, long, consistent. May be overcharged to twice max power for two shots at half each. EAR and ZAN.';
const without=copy(tuning);delete without.weapons['laser-cannon'].overcharge;without.weapons['laser-cannon']._note='Accurate, long, consistent. EAR and ZAN.';
check('All 29 stock packs, compiled V1/V2 definitions and built ships are identical',()=>{
  let n=0;
  for(const [faction,roster] of Object.entries(tuning.rosters))if(Array.isArray(roster))for(const cls of roster){
    const a=stockPack(faction,cls,withFlag,loadouts),b=stockPack(faction,cls,without,loadouts);assert.deepEqual(a,b);
    for(const v2 of [false,true]){
      // Conversion allocates local component IDs. Compare one identical pinned
      // V2 input under both tunings, not two independently generated designs.
      const ap=v2?upgradeEngineering(a,withFlag):a,bp=v2?copy(ap):b;
      assert.deepEqual(compileDesign(ap,withFlag),compileDesign(bp,without));
      assert.deepEqual(buildShip('A-proof',faction,cls,withFlag,loadouts,makePrng(1),ap),buildShip('A-proof',faction,cls,without,loadouts,makePrng(1),bp));
    }
    assert.deepEqual(buildShip('A-proof',faction,cls,withFlag,loadouts,makePrng(1)),buildShip('A-proof',faction,cls,without,loadouts,makePrng(1)));n++;
  }
  assert.equal(n,29);
});
check('Authored weapons still reject an overcharge field rather than imply a new capability',()=>{
  const w=stockPack('EAR','frigate',without,loadouts).weapons.find(w=>w.spec.kind==='beam');
  w.spec.overcharge=true;assert.throws(()=>validateWeapon(w),/unsupported field overcharge/);
});
check('Twelve paired six-turn controls retain full state, PRNG, events, logs and frames',()=>{
  const s={name:'Unused metadata control',maxTurns:6,map:{widthHexes:72,heightHexes:40},terrain:[],sides:[
    {faction:'EAR',ships:[{className:'light-cruiser',q:-6,r:0,facing:0},{className:'destroyer',q:-7,r:2,facing:0}]},
    {faction:'KRE',ships:[{className:'light-cruiser',q:6,r:0,facing:3},{className:'destroyer',q:7,r:-2,facing:3}]}]};
  function run(t,seed){const battle=createBattle(copy(s),copy(t),copy(loadouts),seed),shots=[],log=[],frames=[];while(!battle.done)stepTurn(battle,{},
    {onShot:e=>shots.push(copy(e)),log:m=>log.push(m),onRound:()=>frames.push(fullState(battle))});return {state:fullState(battle),shots,log,frames};}
  for(let seed=0;seed<12;seed++)assert.deepEqual(run(withFlag,`flag-${seed}`),run(without,`flag-${seed}`));
});
console.log(JSON.stringify({source:root,mode:old?'old-metadata-control':'cleaned',passed:true,groups:checks.length,checks},null,2));
