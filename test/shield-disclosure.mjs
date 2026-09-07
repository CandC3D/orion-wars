// Enemy shield disclosure through a sector scan (RULING 2026-09-07, Chris:
// the scan action is the lock, the reading is then free, all six facings come
// together, and it is marked stale once its turn has passed).
//
// The boundary is the point of the whole exercise: nothing but the shields of a
// ship already held as a current report, swept in the named arc, may appear.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets,stepTurn} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {enableContacts,sideContacts} from '../src/tactical/contacts.js';
import {SENSING_PROFILE,observedShields} from '../src/tactical/sensing.js';
const baseT=JSON.parse(fs.readFileSync('data/tactical-tuning.json')),baseL=JSON.parse(fs.readFileSync('data/loadouts.json'));
let groups=0;const check=(n,f)=>{f();console.log('PASS '+n);groups++;};
const idle=()=>({turn:0,forward:0});
const plan=(...p)=>({plan:[p[0]??idle(),p[1]??idle(),p[2]??idle()],target:'auto',reserve:1});

function world({rating=3,gap=6,r=0}={}){
  const t=structuredClone(baseT),rng=makePrng(61);
  t.explosion.enabled=false;t.toHit.target=-100;
  const a=buildShip('A-1','EAR','heavy-cruiser',t,baseL,rng),b=buildShip('B-1','KRE','battleship',t,baseL,rng);
  a.pos={q:0,r:0};a.facing=0;a.hull.sensorRating=rating;
  b.pos={q:gap,r};b.facing=3;b.mounts=[];b.turnRate=0;
  a.superstructure=a.superstructureMax=b.superstructure=b.superstructureMax=4000;
  const battle=createBattleFromFleets([[a],[b]],t,rng,{maxTurns:8,terrain:[]});
  enableContacts(battle,{profile:SENSING_PROFILE});
  return {battle,a,b};
}
const step=(w,face)=>stepTurn(w.battle,{[w.a.id]:plan(face?{...idle(),scan:face}:idle()),[w.b.id]:plan()},{});
const contact=w=>sideContacts(w.battle,'A').find(c=>c.id==='B-1');

check('a reported contact carries no shield reading until something sweeps it',()=>{
  const w=world();
  const c=contact(w);
  assert.ok(c,'the battleship is a current report');
  assert.equal(c.shields,undefined,'no reading before any scan');
  assert.ok(c.observedDamage,'hull condition is disclosed as before');
});

check('a sweep of the arc the contact lies in discloses all six facings',()=>{
  const w=world();step(w,2);
  const c=contact(w);
  assert.ok(c.shields,'a reading is present after the sweep');
  assert.equal(c.shields.faces.length,6,'all six facings, not the swept one');
  assert.deepEqual(c.shields.faces.map(f=>f.face),[1,2,3,4,5,6]);
  assert.equal(c.shields.sweptFace,2);
  assert.equal(c.shields.observerId,'A-1');
});

check('a sweep of the wrong arc reads nothing',()=>{
  const w=world();step(w,5);            // astern, the contact is ahead
  assert.equal(contact(w).shields,undefined);
});

check('rating 3 gives points, rating 2 gives a band',()=>{
  const three=world({rating:3});step(three,2);
  const t3=contact(three).shields;
  assert.equal(t3.detail,'points');assert.equal(t3.rating,3);
  for(const f of t3.faces){assert.equal(typeof f.remaining,'number');assert.equal(typeof f.capacity,'number');
    assert.ok(f.remaining<=f.capacity);assert.equal(f.remainingFraction,undefined);}
  const two=world({rating:2});step(two,2);
  const t2=contact(two).shields;
  assert.equal(t2.detail,'band');assert.equal(t2.rating,2);
  for(const f of t2.faces){assert.ok(f.remainingFraction,'a band, not a number');
    assert.equal(f.remaining,undefined,'no exact points at rating 2');
    assert.ok(f.remainingFraction.min<=f.remainingFraction.max);}
});

check('the reading is current while planning the next turn, stale after that',()=>{
  const w=world();step(w,2);
  // A sweep during turn N is read while planning N+1, when nothing has moved.
  const fresh=contact(w).shields;
  assert.equal(fresh.ageTurns,1,'one turn of age is the freshest the board can show');
  assert.equal(fresh.stale,false);
  const took=fresh.takenTurn;
  step(w,null);                          // a turn with no scan: the target has acted
  const old=contact(w).shields;
  assert.equal(old.stale,true,'stale once the target has had a turn since the sweep');
  assert.equal(old.ageTurns,2);
  assert.equal(old.takenTurn,took,'the turn it was taken does not drift');
  step(w,null);
  assert.equal(contact(w).shields.ageTurns,3,'age keeps counting');
});

check('a fresh sweep replaces a stale reading',()=>{
  const w=world();step(w,2);step(w,null);
  assert.equal(contact(w).shields.stale,true);
  step(w,2);
  assert.equal(contact(w).shields.stale,false);
  assert.equal(contact(w).shields.ageTurns,1);
});

check('the disclosure ladder reports a damaged face honestly',()=>{
  const ship={shieldDown:{1:false,2:true,3:false,4:false,5:false,6:false},
    shieldCap:{1:10,2:0,3:5,4:10,5:10,6:10},hull:{maxShieldPower:10}};
  const points=observedShields(ship,3);
  assert.equal(points.faces.find(f=>f.face===2).down,true);
  assert.equal(points.faces.find(f=>f.face===2).remaining,0);
  assert.equal(points.faces.find(f=>f.face===3).remaining,5);
  const band=observedShields(ship,2);
  const half=band.faces.find(f=>f.face===3).remainingFraction;
  assert.ok(half.min<=0.5&&half.max>=0.5,`a half face must bracket 0.5, got ${JSON.stringify(half)}`);
  const state=observedShields(ship,1);
  assert.equal(state.detail,'state');
  assert.equal(state.faces.find(f=>f.face===2).up,false);
  assert.equal(state.faces.find(f=>f.face===1).up,true);
});

check('the reading discloses shields and nothing else',()=>{
  const w=world();step(w,2);
  const s=contact(w).shields;
  assert.deepEqual(new Set(Object.keys(s)),
    new Set(['detail','faces','takenTurn','sweptFace','observerId','rating','ageTurns','stale']));
  for(const f of s.faces)for(const k of Object.keys(f))
    assert.ok(['face','down','remaining','capacity','remainingFraction','up'].includes(k),`unexpected field ${k}`);
  assert.equal(JSON.stringify(s).includes('pos'),false,'no position leaks through the reading');
});

console.log(`Shield disclosure: ${groups} groups passed.`);
