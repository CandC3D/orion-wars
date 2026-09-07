import assert from 'node:assert/strict';
import {createPlayback} from '../arena/contact-playback.js';
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
function rig(){let now=0;const raf=[];return {clock:createPlayback({now:()=>now,raf:f=>raf.push(f)}),advance:async dt=>{now+=dt;raf.shift()?.();await flush();},wall:dt=>now+=dt};}
for(const finish of ['resume','skip','cancel']){
  const h=rig(),positions=[],frames=[],events=[];
  const items=Object.freeze([{events:[{kind:'beam'}]},{events:[]}]);
  const run=h.clock.run(items,{frameBeat:420,durationFor:()=>1000,
    onFrame:async(i,c)=>{await c.hold(520,p=>positions.push(p));if(c.alive())frames.push(i);},onEvent:e=>events.push(e.kind)});
  await flush();await h.advance(104);assert.equal(positions.at(-1),.2);
  h.clock.pause();await h.advance(0);h.wall(2000);await flush();assert.equal(positions.at(-1),.2);assert.deepEqual(frames,[]);
  if(finish==='resume'){
    h.clock.resume();await flush();assert.equal(positions.at(-1),.2);await h.advance(104);assert.equal(positions.at(-1),.4);
    h.clock.skip();await h.advance(0);assert.equal((await run).finished,true);assert.deepEqual(frames,[0,1]);assert.deepEqual(events,['beam']);
  }else if(finish==='skip'){
    h.clock.skip();await flush();assert.equal((await run).finished,true);assert.deepEqual(frames,[0,1]);
  }else{
    const n=positions.length;h.clock.cancel();await flush();assert.equal((await run).finished,false);assert.equal(positions.length,n);assert.deepEqual(frames,[]);assert.deepEqual(events,[]);
  }
  console.log('PASS async frame motion: pause + '+finish);
}
{
  const h=rig(),phases=[];const r=h.clock.run([{events:[]}],{frameBeat:0,onFrame:(_,c)=>c.hold(0,p=>phases.push(p))});await flush();assert.equal((await r).finished,true);assert.deepEqual(phases,[1]);
  console.log('PASS zero-duration frame hook stays finite');
}
