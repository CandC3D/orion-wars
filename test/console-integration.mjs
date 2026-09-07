import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildShip} from '../src/tactical/ship.js';
import {createBattleFromFleets} from '../src/tactical/resolver.js';
import {makePrng} from '../src/prng.js';
import {enableContacts} from '../src/tactical/contacts.js';
import {SENSING_PROFILE} from '../src/tactical/sensing.js';
import {captainObservation} from '../src/captains/observation.js';
import {previewContactOrders} from '../src/captains/preview.js';
import {consolePower,schematicMarkup,headingRoseMarkup,powerBarMarkup,mountState,spinalReading} from '../arena/console-instruments.js';
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
console.log('PASS owned instruments, power states, action-relative rose, all hulls and lamps');
