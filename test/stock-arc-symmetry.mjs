// Chris's 2026-09-07 coverage requirement. Count installations, not symmetric
// individual mounts: face 1 mirrors 3; face 6 mirrors 4; faces 2/5 are on-axis.
// Deliberately fails until authored exceptions are resolved; not in fast suite.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildShip} from '../src/tactical/ship.js';
import {makePrng} from '../src/prng.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const t=read('../data/tactical-tuning.json'),l=read('../data/loadouts.json');
const failures=[];let checked=0;
for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of t.rosters[faction]){
  const ship=buildShip('symmetry',faction,cls,t,l,makePrng(1));
  const n=face=>ship.mounts.filter(m=>m.arc.includes(face)).length;
  checked++;
  for(const [port,starboard] of [[1,3],[6,4]])if(n(port)!==n(starboard)){
    const line=`${faction}/${cls}: face ${port} = ${n(port)}, face ${starboard} = ${n(starboard)}`;
    failures.push(line);console.error(line);
  }
}
console.log(`${checked} stock hulls checked; ${failures.length} unequal mirrored face pairs.`);
assert.equal(failures.length,0,'Stock coverage is not fully left/right symmetric; review authored layouts before changing them.');
