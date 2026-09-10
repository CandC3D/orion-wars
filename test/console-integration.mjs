import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {enableContacts} from '../src/tactical/contacts.js';
import {SENSING_PROFILE} from '../src/tactical/sensing.js';
import {captainObservation} from '../src/captains/observation.js';
import {previewContactOrders} from '../src/captains/preview.js';
import {consolePower,schematicMarkup,headingRoseMarkup,powerBarMarkup,mountState,spinalReading,hullPlan,lampLayout} from '../arena/console-instruments.js';
import {weaponLabelLayout} from '../arena/console-weapon-labels.js';
import {intersects} from '../arena/contact-map-layout.js';
const tuning=JSON.parse(fs.readFileSync('data/tactical-tuning.json')),loadouts=JSON.parse(fs.readFileSync('data/loadouts.json'));
const idle=()=>({turn:0,forward:0});
const order=()=>({plan:[idle(),idle(),idle()],target:'auto',reserve:.3});
let hulls=0,mounts=0;const closeLamps=[];
for(const faction of ['EAR','KRE','VRA','ZAN'])for(const cls of tuning.rosters[faction]){
  const rng=makePrng(901),a=buildShip('A-ship',faction,cls,tuning,loadouts,rng),b=buildShip('B-ship','EAR','frigate',tuning,loadouts,rng);
  a.pos={q:-10,r:0};b.pos={q:10,r:0};
  const battle=createBattleFromFleets([[a],[b]],tuning,rng,{terrain:[]});enableContacts(battle,{profile:SENSING_PROFILE});
  const view=captainObservation(battle,'A'),s=view.own[0],html=schematicMarkup(s),o=order();hulls++;mounts+=s.mounts.length;
  assert.equal((html.match(/data-face=/g)||[]).length,6);
  assert.equal((html.match(/data-mount-index=/g)||[]).length,s.mounts.length);
  assert.ok(!/NaN|undefined|Infinity/.test(html));
  for(const font of [9,16,30]){
    const labels=weaponLabelLayout(s,s.mounts,{project:()=>({x:895,y:515}),scale:40,font,measure:t=>t.length*font*.6,occupied:[{x:500,y:300,w:100,h:30}]}).labels;
    for(const [i,l] of labels.entries()){
      const b=l.box;assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=900&&b.y+b.h<=520);
      assert.ok(labels.slice(0,i).every(p=>!intersects(p.box,b)));
    }
  }
  const lamps=html.split('<g class="lamp').slice(1).map(p=>p.match(/cx="([\d.]+)" cy="([\d.]+)"/).slice(1).map(Number));
  for(let i=0;i<lamps.length;i++)for(let j=i+1;j<lamps.length;j++)if(Math.hypot(lamps[i][0]-lamps[j][0],lamps[i][1]-lamps[j][1])<14)closeLamps.push([faction,cls,i+1,j+1]);
  const forecast=previewContactOrders(view,s.id,o),p=consolePower(s,o,forecast);
  assert.equal(p.charge,0,cls+' cold bank charge');assert.equal(p.reserve,Math.round(s.fullPower*.3));
  assert.ok(!powerBarMarkup(p).includes('role="slider"'));
  const wreck=structuredClone(s);wreck.destroyed=true;
  assert.ok(wreck.mounts.every(m=>mountState(m,wreck).state==='destroyed'));
  assert.equal(consolePower(wreck,o,forecast).pool,0);
  if(s.spinal){
    const m=s.mounts.find(m=>m.kind==='spinal');assert.equal(mountState(m,s).label,'COLD');assert.equal(spinalReading(wreck).label,'UNAVAILABLE');
    const charging={...o,spinal:'charge'},prep=previewContactOrders(view,s.id,charging),q=consolePower(s,charging,prep);
    assert.equal(q.charge,20);assert.equal(q.reserve,Math.round((s.fullPower-20)*.3));
    const active=structuredClone(s);active.spinal.charge=40;
    assert.equal(consolePower(active,o,forecast).charge,20);
    assert.equal(consolePower(active,{...o,spinal:'vent'},forecast).charge,0);
    active.spinal.state='ready';active.spinal.charge=80;
    assert.equal(consolePower(active,o,forecast).charge,4);
    active.spinal.state='cooldown';active.spinal.cooldown=2;
    assert.equal(consolePower(active,charging,forecast).charge,0);
  }
}
for(let start=0;start<6;start++){
  const rose=headingRoseMarkup({facing:0,startFacing:start,turnRate:1});
  for(let dir=0;dir<6;dir++){
    const block=rose.split('<polygon').find(p=>p.includes(`data-heading-dir="${dir}"`));
    assert.equal(block.includes('reachable'),Math.min((dir-start+6)%6,(start-dir+6)%6)<=1);
  }
}
assert.equal(consolePower({fullPower:20,power:20},order(),{actions:[{powerCeiling:14}]}).helm,6);
assert.equal(consolePower({fullPower:20,power:20},order(),{actions:[{powerCeiling:null}]}).helm,null);
console.log(JSON.stringify({hulls,mounts,closeLamps},null,2));
assert.deepEqual(closeLamps,[],'Mount hit centres must not cover another lamp centre');

// HULL PLAN. The art and the turret lamps share one frame, so the numbers
// below are what keep a mount authored in Drydock on the same part of the
// hull in the console. The glyphs are generated with their ink at 96.3% of a
// 100-unit viewBox, so ink height is predictable and everything follows from
// it. Ring geometry: centre 150,150, radius 118, width 12 - inner edge 112.
// Furniture: the BOW label ends at y 72, the keel-gun bar runs y 206 to 224.
for (const [label, ship] of [["no keel gun", {}], ["keel gun", { spinal: { charge: 0 } }]]) {
  const plan = hullPlan(ship);
  const ink = plan.size * 0.963, halfInk = ink / 2;
  assert.ok(plan.size > 120, `${label}: the plan must be larger than the fixed 120 box it replaced, got ${plan.size}`);
  assert.ok(plan.cy - halfInk >= 72, `${label}: hull art runs under the BOW label`);
  if (ship.spinal) assert.ok(plan.cy + halfInk <= 206, `${label}: hull art runs under the keel-gun bar`);
  // Widest traced glyph is 58.5% of its viewBox, so the ink corners are the
  // extremes; they must stay inside the ring rather than merely the centre.
  const halfWide = plan.size * 0.585 / 2;
  const corner = Math.hypot(halfWide, Math.abs(plan.cy - 150) + halfInk);
  assert.ok(corner <= 112, `${label}: hull art reaches ${corner.toFixed(1)} past the ring at 112`);
  // A mount at the bow tip lands on the bow, not beyond it.
  assert.ok(Math.abs(plan.unit * 1.3 - halfInk) < 0.5,
    `${label}: a mount at the hull extent must land on the hull edge`);
  // Every lamp, hit circle included, stays inside the ring.
  const far = lampLayout([{ position: { x: 2, y: 2 } }, { position: { x: -2, y: -2 } }], plan);
  for (const lamp of far) {
    const reach = Math.hypot(plan.cx + lamp.x - 150, plan.cy + lamp.y - 150) + 14;
    assert.ok(reach <= 112 + 1e-9, `${label}: a clamped lamp reaches ${reach.toFixed(1)} past the ring at 112`);
  }
}
console.log('PASS owned instruments, power states, action-relative rose, all hulls, lamps and the shared hull plan');
