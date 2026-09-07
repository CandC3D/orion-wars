import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildShip,fullPower,weaponFor} from '../src/tactical/ship.js';
import {makePrng} from '../src/prng.js';
import {weaponRangeBands,weaponRangeKey,weaponArcMarkup} from '../arena/contact-weapon-arcs.js';
import {movementRange,movementRangeMarkup} from '../arena/contact-movement-range.js';
import {distance} from '../src/tactical/hex.js';
const t=JSON.parse(readFileSync(new URL('../data/tactical-tuning.json',import.meta.url))),l=JSON.parse(readFileSync(new URL('../data/loadouts.json',import.meta.url)));
let ships=0,mounts=0;
for(const f of ['EAR','KRE','VRA','ZAN'])for(const c of t.rosters[f]){
  const s=buildShip('map',f,c,t,l,makePrng(1));s.fullPower=fullPower(s);
  // Supply the own-observation weapon field; raw engine mounts omit it.
  s.mounts.forEach(m=>m.weapon=weaponFor(s,m.type,t));
  for(const m of s.mounts){
    const rows=weaponRangeBands(m);assert.ok(rows.length);assert.equal(rows[0].from,1);assert.equal(rows.at(-1).to,m.maxRange);
    for(let i=0;i<rows.length;i++){if(i)assert.equal(rows[i].from,rows[i-1].to+1);assert.ok(rows[i].from<=rows[i].to);}
    for(let h=0;h<6;h++){
      const text=weaponArcMarkup({...s,facing:h},m,{scale:1,project:p=>({x:p.q+p.r/2,y:p.r*Math.sqrt(3)/2})});
      assert.deepEqual([...text.matchAll(/data-arc-face="(\d)"/g)].map(x=>+x[1]),m.arc);
      assert.ok(!/NaN|Infinity/.test(text));
    }
    const key=weaponRangeKey(m);assert.ok(key.includes(String(m.maxRange)));if(m.kind==='missile')assert.ok(!key.includes('accuracy'));
    mounts++;
  }
  const v=movementRange(s,.3);if(!s.cloaked)assert.ok(v.hexes>=0);ships++;
}
const s={pos:{q:3,r:-2},fullPower:28,movementPointRatio:2,mounts:[]};
assert.equal(movementRange(s,.3).hexes,10);assert.equal(movementRange(s,.5).hexes,7);assert.equal(movementRange(s,1).hexes,0);
const vertices=[];movementRangeMarkup(s,movementRange(s,.3),p=>{vertices.push(p);return {x:p.q,y:p.r};});assert.equal(vertices.length,6);vertices.forEach(p=>assert.equal(distance(s.pos,p),10));
const planted={...s,mounts:[{kind:'spinal',weapon:{immobileWhileCharging:true}}],spinal:{state:'charging',charge:20}};
assert.equal(movementRange(planted,0).hexes,0);assert.equal(movementRange({...planted,spinal:{state:'ready',charge:72}},0).hexes,0);
assert.equal(movementRange({...planted,spinal:{state:'charging',charge:0}},.3).hexes,null);
assert.equal(movementRange({...planted,mounts:[{kind:'spinal',inop:true,weapon:{immobileWhileCharging:true}}]},.3).hexes,null);
assert.equal(movementRange({...s,destroyed:true},0).hexes,0);assert.equal(movementRange({...s,cloaked:true},0).hexes,null);
const collapsed=weaponRangeBands({maxRange:2,bands:[{to:1},{to:1},{to:3}]});assert.deepEqual(collapsed.map(b=>[b.from,b.to]),[[1,1],[2,2]]);
console.log(`PASS: ${ships} hulls, ${mounts} mounts at six headings; effective bands, ordinary movement ceiling, six hex-distance vertices, reserve, planting and cloak guards.`);
