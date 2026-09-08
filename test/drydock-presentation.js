import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arcPresets, matchingArc, arcLabel } from '../arena/arc-labels.js';
import { FACE_NAMES } from '../arena/command-model.js';
import { GRID_STEPS, snapPosition, mirroredMount } from '../drydock/placement.js';
const t=JSON.parse(readFileSync(new URL('../data/tactical-tuning.json',import.meta.url),'utf8'));
const expected={fwd:[1,2,3],aft:[4,5,6],p:[6,1],s:[3,4],fs:[2,3],fp:[1,2],sa:[4,5],pa:[5,6],f:[2],a:[5],bow:[6,1,2,3,4],stern:[3,4,5,6,1],all:[1,2,3,4,5,6],pfwd:[6,1,2],sfwd:[2,3,4],broad:[6,1,3,4],pb:[1],sb:[3]};
assert.deepEqual(FACE_NAMES,{1:'forward-port',2:'forward',3:'forward-starboard',4:'aft-starboard',5:'aft',6:'aft-port'});
assert.deepEqual(Object.fromEntries(arcPresets(t.arcs).map(p=>[p.code,p.faces])),expected);
for(const [code,faces] of Object.entries(expected)){
  assert.equal(matchingArc([...faces].reverse(),t.arcs)?.code,code);
  assert.equal(arcLabel(faces,t.arcs),arcLabel([...faces].reverse(),t.arcs));
}
assert.equal(arcLabel([4,1],t.arcs),'custom (1,4)');assert.equal(arcLabel([],t.arcs),'no firing faces');
assert.equal(arcLabel([3,4],t.arcs),'starboard broadside (3,4)');
assert.equal(arcLabel([6,1],t.arcs),'port broadside (6,1)');
assert.equal(arcLabel([1,2,6],t.arcs),'port bow 180° (6,1,2)');
assert.equal(arcLabel([2,3,4],t.arcs),'starboard bow 180° (2,3,4)');
assert.equal(arcLabel([1,3,4,6],t.arcs),'two-turret broadside (6,1,3,4)');
assert.equal(arcLabel([1],t.arcs),'port bow only (1)');
assert.equal(arcLabel([3],t.arcs),'starboard bow only (3)');
assert.equal(arcLabel([2,3],t.arcs),'starboard fore (2,3)');
assert.equal(arcLabel([1,2],t.arcs),'port fore (1,2)');
assert.equal(matchingArc([1,1,2],t.arcs),null);
let checks=0;
for(const step of GRID_STEPS)for(let i=0;i<=400;i++){
  const value=i/200,positive=snapPosition({x:value,y:value,z:.317},{step,axis:false}),negative=snapPosition({x:-value,y:-value,z:.317},{step,axis:false});
  assert.ok(Math.abs(positive.x/step-Math.round(positive.x/step))<1e-8);
  assert.ok(Math.abs(negative.x+positive.x)<1e-8);assert.ok(Math.abs(negative.y+positive.y)<1e-8);
  assert.equal(positive.z,.317);assert.deepEqual(snapPosition(positive,{step,axis:false}),positive);checks++;
}
assert.deepEqual(snapPosition({x:.024,y:.276,z:.13},{step:.05}),{x:0,y:.3,z:.13});
assert.deepEqual(snapPosition({x:.013,y:-.217,z:.13},{snap:false,axis:false}),{x:.013,y:-.217,z:.13});
assert.deepEqual(snapPosition({x:3,y:-3,z:0}),{x:2,y:-2,z:0});
assert.throws(()=>snapPosition({x:NaN,y:0,z:0}));assert.throws(()=>snapPosition({x:0,y:0,z:0},{step:0}));
const source={id:'mount-1',weapon:{id:'local:beam',revision:1},faces:[1,2,6],position:{x:-.275,y:.4,z:.18},orientation:30};
const before=structuredClone(source),mirror=mirroredMount(source,'mount-2');
assert.deepEqual(mirror.position,{x:.275,y:.4,z:.18});assert.deepEqual(mirror.faces,[2,3,4]);assert.equal(mirror.orientation,-30);assert.equal(mirror.id,'mount-2');
mirror.weapon.revision=2;assert.deepEqual(source,before);
console.log(`Drydock presentation passed: ${Object.keys(expected).length} named arcs, 6 face names, ${checks} symmetric grid checks, independent mirrored placements.`);
