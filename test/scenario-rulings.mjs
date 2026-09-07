import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const args=process.argv.slice(2), at=args.indexOf('--source');
const root=at<0?fileURLToPath(new URL('../',import.meta.url)):resolve(args[at+1]);
const old=args.includes('--expect-old');
const mod=p=>import(pathToFileURL(resolve(root,p)));
const json=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const engine=await mod('src/tactical/resolver.js'), editor=await mod('arena/editor-core.js'), record=await mod('arena/record.js');
const rules=await mod('src/tactical/fleet-rules.js'), {makePrng}=await mod('src/prng.js');
const {stockPack,upgradeEngineering}=await mod('src/construction/index.js');
const {compFor}=await mod('test/comp.js');
const tuning=json('data/tactical-tuning.json'), loadouts=json('data/loadouts.json'), copy=structuredClone;
const warn={fleetFloorPolicy:'warn'}, checks=[];
function test(name,fn){fn();checks.push(name);console.log('ok: '+name);}
function scenario(cls='frigate') { return {name:'Authored floor / deployment proof',seed:'scenario-rulings',maxTurns:2,map:{widthHexes:100,heightHexes:80},terrain:[],sides:[
  {faction:'EAR',ships:[{className:cls,q:-8,r:0,facing:0}]},{faction:'KRE',ships:[{className:'frigate',q:8,r:0,facing:3}]}]}; }
function build(s,options={},t=copy(tuning)) {return engine.buildScenario(s,t,copy(loadouts),makePrng(9),options);}
function create(s,options={}) {return engine.createBattle(s,copy(tuning),copy(loadouts),s.seed,options);}
const low=scenario('gunstar-battlecruiser');

if(old){
  test('Old authored loader refuses a below-floor engagement',()=>assert.throws(()=>record.recordScenario(low,copy(tuning),loadouts),/at least 52/));
  test('Old fallback deployment silently occupies a moon',()=>{const s=scenario();delete s.sides[0].ships[0].q;delete s.sides[0].ships[0].r;const p=build(s).fleets[0][0].pos;s.terrain=[{type:'moon',...p}];assert.deepEqual(build(s).fleets[0][0].pos,p);});
  test('Old direct-fleet entry accepts a planet under a ship',()=>{const b=build(scenario());assert.doesNotThrow(()=>engine.createBattleFromFleets(b.fleets,b.tuning,makePrng(1),{terrain:[{type:'planet',...b.fleets[0][0].pos}]}));});
}else{
  test('Strict core APIs and fleet builder still reject the floor',()=>{
    assert.throws(()=>build(low),/at least 52/);assert.throws(()=>create(low),/at least 52/);
    assert.match(editor.validateScenario(low,tuning,loadouts).join(' '),/at least 52/);
    assert.throws(()=>record.recordFleetBattle({factionA:'EAR',factionB:'KRE',compA:{'gunstar-battlecruiser':1},compB:{frigate:1},seed:'floor',tuning,loadouts}),/at least 52/);
    assert.throws(()=>compFor('EAR',{'gunstar-battlecruiser':1},tuning),/at least 52/);
  });
  test('Warn mode retains an authored roster and reports the precise floor',()=>{
    const before=JSON.stringify(low),b=build(low,warn),issues=editor.scenarioIssues(low,tuning,loadouts,warn);
    assert.deepEqual(issues.errors,[]);assert.deepEqual(issues.warnings,b.warnings);assert.equal(b.warnings.length,1);
    assert.match(b.warnings[0],/Side 1.*52 points \(currently 16\)/);assert.equal(b.fleets[0].length,1);assert.equal(b.fleets[0][0].points,16);
    assert.deepEqual(b.fleets[0][0].pos,{q:-8,r:0});assert.equal(JSON.stringify(low),before);
  });
  test('JSON cannot select the host policy; unknown host modes fail closed',()=>{
    for(const flags of [{fleetFloorPolicy:'warn'},{historicalFloorOverride:true},{warnings:[]}])assert.throws(()=>build({...low,...flags}),/at least 52/);
    assert.throws(()=>build(low,{fleetFloorPolicy:'ignore'}),/Unknown fleet floor policy/);
  });
  test('Warn mode never waives ship limits, faction roster, objective or pinned validation',()=>{
    const invalid=[];
    let s=copy(low);s.sides[0].ships.push(copy(s.sides[0].ships[0]));invalid.push([s,/limit is 1/]);
    s=scenario('carrier');invalid.push([s,/cannot be fielded by EAR/]);
    s=copy(low);s.victory={type:'flagship',protectedClass:{A:'carrier',B:'carrier'}};invalid.push([s,/exactly one/]);
    s=copy(low);s.sides[0].ships[0].designPack=stockPack('EAR','gunstar-battlecruiser',tuning,loadouts);s.sides[0].ships[0].designPack.design.hull.unrecognised=1;invalid.push([s,/unsupported/]);
    for(const [raw,pattern] of invalid){assert.throws(()=>build(raw,warn),pattern);assert.match(editor.validateScenario(raw,tuning,loadouts,warn).join(' '),pattern);assert.throws(()=>record.recordScenario(raw,tuning,loadouts),pattern);}
  });
  test('Pinned V1 and V2 prices are used without rewriting either pack',()=>{
    for(const v2 of [false,true]){
      let p=stockPack('EAR','gunstar-battlecruiser',tuning,loadouts);if(v2)p=upgradeEngineering(p,tuning);p.design.hull.points=7;
      const s=copy(low);s.sides[0].ships[0].designPack=p;const before=JSON.stringify(s),b=build(s,warn);
      assert.match(b.warnings[0],/currently 7/);assert.equal(b.fleets[0][0].points,7);assert.deepEqual(b.fleets[0][0].design,p);assert.equal(JSON.stringify(s),before);
      assert.throws(()=>build(s),/currently 7/);
    }
  });
  test('Warnings survive engine, view, live recording and headless recording without aliases',()=>{
    const b=create(low,warn),v=engine.battleView(b),r=record.createPlayRecord(low,v),headless=record.recordScenario(low,copy(tuning),loadouts);
    assert.deepEqual(r.meta.warnings,b.warnings);assert.deepEqual(headless.meta.warnings,b.warnings);assert.deepEqual(headless.meta.scenario,low);
    v.warnings[0]='edited view';r.meta.warnings[0]='edited record';assert.match(b.warnings[0],/at least 52/);
    assert.throws(()=>record.recordScenario(low,copy(tuning),loadouts,{fleetFloorPolicy:'strict'}),/at least 52/);
  });
  test('Save / reload preserves content; policy and warnings are not persisted into scenario JSON',()=>{
    const saved=editor.scenarioForSave({...low,fleetFloorPolicy:'warn',warnings:['fake']});
    assert.deepEqual(saved,low);assert.deepEqual(editor.scenarioIssues(saved,tuning,loadouts,warn).warnings,build(saved,warn).warnings);
  });
  test('Valid scenarios produce byte-identical recordings in strict and warn modes (12 paired seeds)',()=>{
    for(let seed=0;seed<12;seed++){
      const s=scenario('destroyer');s.seed=`floor-neutral-${seed}`;s.maxTurns=4;
      s.terrain=seed%3===0?[{type:'planet',q:0,r:6}]:seed%3===1?[{type:'nebula',q:0,r:0}]:[{type:'asteroids',q:0,r:0}];
      const a=record.recordScenario(s,copy(tuning),loadouts,{fleetFloorPolicy:'strict'}),b=record.recordScenario(s,copy(tuning),loadouts,warn);
      assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(b.meta.warnings,undefined);
      assert.equal(JSON.stringify(create(s)),JSON.stringify(create(s,warn)));
    }
  });
  for(const type of ['moon','planet','asteroid','asteroids','nebula'])test(`Explicit, fallback and direct-fleet deployment: ${type}`,()=>{
    const allowed=['asteroids','nebula'].includes(type);
    for(const fallback of [false,true]){
      const s=scenario();if(fallback){delete s.sides[0].ships[0].q;delete s.sides[0].ships[0].r;}
      const point=build(s).fleets[0][0].pos;s.terrain=[{type,...point}];
      if(allowed){const b=create(s,warn);assert.deepEqual(b.A[0].pos,point);assert.deepEqual(editor.validateScenario(s,tuning,loadouts,warn),[]);engine.stepTurn(b,{});}
      else {assert.throws(()=>build(s,warn),/placed on terrain/);assert.match(editor.validateScenario(s,tuning,loadouts,warn).join(' '),/on terrain/);assert.throws(()=>record.recordScenario(s,copy(tuning),loadouts),/placed on terrain/);}
    }
    const b=build(scenario()),opts={terrain:[{type,...b.fleets[0][0].pos}]},rng=makePrng(42);
    b.fleets[0][0]._helm={keep:true};b.fleets[0][0].hadContact=true;b.fleets[0][0].gatherHeld=true;
    const before=JSON.stringify({b,rng});
    if(allowed)assert.doesNotThrow(()=>engine.createBattleFromFleets(b.fleets,b.tuning,rng,opts));
    else {assert.throws(()=>engine.createBattleFromFleets(b.fleets,b.tuning,rng,opts),/placed on terrain/);assert.equal(JSON.stringify({b,rng}),before);}
  });
  test('All seven planet cells reject deployment, not only its centre',()=>{
    for(const p of [{q:0,r:0},{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}]){
      const s=scenario();Object.assign(s.sides[0].ships[0],p);s.terrain=[{type:'planet',q:0,r:0}];
      assert.throws(()=>build(s,warn),/placed on terrain/);assert.match(editor.validateScenario(s,tuning,loadouts,warn).join(' '),/on terrain/);
      const b=build(scenario());b.fleets[0][0].pos=p;assert.throws(()=>engine.createBattleFromFleets(b.fleets,b.tuning,makePrng(1),{terrain:s.terrain}),/placed on terrain/);
    }
  });
  test('Mixed deployment validates final positions, not overridden provisional ones',()=>{
    const s=scenario();delete s.sides[1].ships[0].q;delete s.sides[1].ships[0].r;
    const both=copy(s);delete both.sides[0].ships[0].q;delete both.sides[0].ships[0].r;
    const defaultA=build(both).fleets[0][0].pos;s.terrain=[{type:'moon',...defaultA}];assert.doesNotThrow(()=>build(s,warn));
    s.terrain=[{type:'moon',...build({...s,terrain:[]}).fleets[1][0].pos}];assert.throws(()=>build(s,warn),/placed on terrain/);
  });
  test('Direct-fleet validation uses the actual terrain source, including an explicit empty override',()=>{
    const b=build(scenario());b.tuning.battle.terrain=[{type:'moon',...b.fleets[0][0].pos}];const before=JSON.stringify(b);
    assert.throws(()=>engine.createBattleFromFleets(b.fleets,b.tuning,makePrng(1)),/placed on terrain/);assert.equal(JSON.stringify(b),before);
    const battle=engine.createBattleFromFleets(b.fleets,b.tuning,makePrng(1),{terrain:[]});assert.deepEqual(battle.terrain,[]);assert.deepEqual(battle.tuning.battle.terrain,[]);
  });
  test('Validation neither spends random state nor rewrites authored content or tuning',()=>{
    const s=copy(low),t=copy(tuning),l=copy(loadouts),before=JSON.stringify({s,t,l}),rng=makePrng(91);
    engine.buildScenario(s,t,l,rng,warn);editor.scenarioIssues(s,t,l,warn);assert.equal(rng.state,91);assert.equal(JSON.stringify({s,t,l}),before);
  });
}
console.log(JSON.stringify({source:root,mode:old?'old-behaviour-controls':'fixed-expectations',pass:true,groups:checks.length,checks},null,2));
