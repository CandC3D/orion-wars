// Terrain shadow: what the selected hull cannot see, and where it nonetheless
// has a clear line of fire. Observation-derived only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sensorPathClear} from '../src/tactical/sensing.js';
import {publicWeaponGeometry} from '../src/tactical/resolver.js';
import {distance} from '../src/tactical/hex.js';
import {classifyCell,shadowMask,shadowMarkup,shadowTuning,shadowCache} from '../arena/terrain-shadow.js';
const tuning=JSON.parse(fs.readFileSync('data/tactical-tuning.json'));
let groups=0;const check=(n,f)=>{f();console.log('PASS '+n);groups++;};
const scenarios=fs.readdirSync('arena/scenarios').filter(f=>f.endsWith('.json'))
  .map(f=>({name:f,terrain:JSON.parse(fs.readFileSync('arena/scenarios/'+f)).terrain||[]}))
  .filter(s=>s.terrain.length);
const viewFor=terrain=>({terrain,rules:{terrain:tuning.battle.terrainRules,movement:{sameHexNoFire:true}}});
const grid=(n=14)=>{const c=[];for(let q=-n;q<=n;q++)for(let r=-Math.round(n*.7);r<=Math.round(n*.7);r++)c.push({q,r});return c;};

check('a board with no terrain casts no shadow at all',()=>{
  const mask=shadowMask({pos:{q:0,r:0},mounts:[]},viewFor([]),grid());
  assert.equal(mask.shadow.length,0);assert.equal(mask.blind.length,0);
  assert.equal(shadowMarkup({pos:{q:0,r:0},mounts:[]},viewFor([]),grid(),{project:p=>({x:p.q,y:p.r}),scale:8}),'');
});

check('a planet casts a shadow, and the shadow lies behind it',()=>{
  const view=viewFor([{type:'planet',q:5,r:0}]);
  const from={q:0,r:0};
  const mask=shadowMask({pos:from,mounts:[]},view,grid(16));
  assert.ok(mask.shadow.length>0,'a body must cast a shadow');
  // Every shadowed hex must be at least as far as the body that casts it.
  for(const c of mask.shadow)assert.ok(distance(from,c)>=distance(from,{q:5,r:0})-1,
    `shadowed hex ${c.q},${c.r} is nearer than the body casting it`);
});

check('the classification agrees with the engine, cell by cell',()=>{
  for(const s of scenarios){
    const view=viewFor(s.terrain),from={q:0,r:0};
    const stand={terrain:s.terrain,tuning:{battle:{terrainRules:tuning.battle.terrainRules}}};
    const probe={kind:'beam',maxRange:4096,arc:[1,2,3,4,5,6],bands:[{to:4096,damageBonus:0}]};
    for(const cell of grid(12)){
      if(cell.q===from.q&&cell.r===from.r)continue;
      const verdict=classifyCell(from,cell,view);
      const sensorBlocked=!sensorPathClear(stand,from,cell);
      assert.equal(verdict==='clear',!sensorBlocked,`${s.name} ${cell.q},${cell.r}: sight verdict must follow sensorPathClear`);
      if(!sensorBlocked)continue;
      const reason=publicWeaponGeometry({pos:from,facing:0,mounts:[probe]},probe,{pos:cell,facing:0},shadowTuning(view));
      const fireBlocked=reason==='Line of fire blocked'||reason==='Nebula visibility';
      assert.equal(verdict,fireBlocked?'shadow':'blind',`${s.name} ${cell.q},${cell.r}`);
    }
  }
});

check('INVARIANT the cheap path depends on: fire-blocked implies sensor-blocked',()=>{
  // The overlay tests fire only where sight is already blocked. If this ever
  // fails, shadowMask under-reports blocked fire and must test every cell.
  const probe={kind:'beam',maxRange:4096,arc:[1,2,3,4,5,6],bands:[{to:4096,damageBonus:0}]};
  let checked=0;
  for(const s of scenarios){
    const view=viewFor(s.terrain);
    const stand={terrain:s.terrain,tuning:{battle:{terrainRules:tuning.battle.terrainRules}}};
    for(const from of [{q:0,r:0},{q:-8,r:2},{q:4,r:-8},{q:-4,r:7},{q:6,r:3}]){
      for(const cell of grid(14)){
        if(cell.q===from.q&&cell.r===from.r)continue;checked++;
        const reason=publicWeaponGeometry({pos:from,facing:0,mounts:[probe]},probe,{pos:cell,facing:0},shadowTuning(view));
        if(reason!=='Line of fire blocked'&&reason!=='Nebula visibility')continue;
        assert.equal(sensorPathClear(stand,from,cell),false,
          `${s.name} from ${from.q},${from.r} to ${cell.q},${cell.r}: fire blocked but sight clear`);
      }
    }
  }
  assert.ok(checked>10000,`the invariant must be exercised broadly, got ${checked}`);
});

check('a hull inside a nebula is blind almost everywhere',()=>{
  const view=viewFor([{type:'nebula',q:0,r:0}]);
  const cells=grid(12);
  const mask=shadowMask({pos:{q:0,r:0},mounts:[]},view,cells);
  const blindTotal=mask.shadow.length+mask.blind.length;
  assert.ok(blindTotal>cells.length*0.8,`fog must dominate, got ${blindTotal} of ${cells.length}`);
  // ...but not within the fog's own visibility radius.
  const near=cells.filter(c=>distance({q:0,r:0},c)>0&&distance({q:0,r:0},c)<=(tuning.battle.terrainRules.nebula.visibilityHexes??3));
  for(const c of near)assert.equal(classifyCell({q:0,r:0},c,view),'clear',`${c.q},${c.r} is inside the fog's own sight radius`);
});

check('the cache returns the same verdicts and is keyed to the observing hex',()=>{
  const view=viewFor(scenarios[0].terrain),cells=grid(10);
  const ship={pos:{q:0,r:0},mounts:[]};
  const cache=shadowCache(ship.pos);
  const first=shadowMask(ship,view,cells,cache);
  const second=shadowMask(ship,view,cells,cache);
  assert.deepEqual(second,first,'a cached pass must agree with the first');
  assert.ok(cache.cells.size>0,'the cache must actually fill');
  const moved={pos:{q:3,r:1},mounts:[]};
  const stale=shadowMask(moved,view,cells,cache);      // wrong key: cache ignored
  assert.deepEqual(stale,shadowMask(moved,view,cells,null),'a cache from another hex must not be consulted');
});

check('the markup carries counts and never NaN',()=>{
  const view=viewFor(scenarios[0].terrain);
  const g=shadowMarkup({pos:{q:0,r:0},mounts:[]},view,grid(10),{project:p=>({x:p.q*8,y:p.r*8}),scale:8});
  assert.match(g,/data-shadow-hexes="\d+"/);
  assert.match(g,/data-blind-hexes="\d+"/);
  assert.equal(/NaN|Infinity/.test(g),false);
  assert.match(g,/pointer-events="none"/);
});

console.log(`Terrain shadow: ${groups} groups passed.`);
