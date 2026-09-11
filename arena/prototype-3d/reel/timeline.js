// Frame-aligned presentation times, shared by deterministic images and audio.
export const FPS=30,FRAMES=950,DURATION=FRAMES/FPS;
export const frameTime=t=>Math.round(t*FPS)/FPS;
export function timeline(packet){
 const starts=[6.6,6.733333333,9.9,10.033333333,13.2];
 const beams=packet.events.filter(e=>e.kind==='beam').map((e,i)=>({...e,start:frameTime(starts[i]),end:frameTime(starts[i]+2.5)}));
 const missiles=packet.events.filter(e=>e.kind==='launch').map((e,i)=>({...e,index:i,start:[8.1,11.4,14.7][i],end:[24.3,25.3,27.5][i],course:packet.projectiles.find(p=>p.id===e.missileId),impact:packet.events.find(p=>p.kind==='missile'&&p.missileId===e.missileId)}));
 const cues=[];
 for(const b of beams){cues.push({time:b.start,role:'beam',cue:'beam'});cues.push({time:b.start,role:'hit',cue:'impact'});if(b.absorbed)cues.push({time:b.start,role:'shield',cue:'engage'});}
 for(const m of missiles){cues.push({time:m.start,role:m.weapon==='plasma-torpedo'?'torpedo':'missile',cue:m.weapon==='plasma-torpedo'?'spinal':'launch'});
  for(let i=0;i<4;i++)cues.push({time:frameTime(m.end-1+i*.2),role:'point-defence',cue:'intercept'});
  cues.push({time:m.end,role:m.impact.intercepted?'interception':'hit',cue:'impact'});if(m.impact.absorbed)cues.push({time:m.end,role:'shield',cue:'engage'});
 }
 cues.sort((a,b)=>a.time-b.time);return {beams,missiles,cues};
}
