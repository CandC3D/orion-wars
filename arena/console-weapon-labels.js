// Display-only labels. Reserve ship/name/course boxes first; never alter arcs.
import {intersects} from './contact-map-layout.js';
import {effectiveBand} from './contact-weapon-arcs.js';
export function weaponLabelLayout(ship,mounts,{project,scale,font,measure,occupied=[]}){
  const taken=[...occupied],labels=[],deferred=[];
  const offsets={2:0,1:1,6:2,5:3,4:4,3:5},origin=project(ship.pos),h=font*1.5;
  for(const m of mounts){
    const dirs=m.arc.map(f=>(ship.facing+offsets[f])%6);
    const x=dirs.reduce((n,d)=>n+Math.cos(d*Math.PI/3),0),y=dirs.reduce((n,d)=>n+Math.sin(d*Math.PI/3),0),angle=Math.atan2(y,x);
    const anchor={x:Math.max(4,Math.min(896,origin.x+Math.cos(angle)*(m.maxRange+1.6)*scale)),y:Math.max(4,Math.min(516,origin.y-Math.sin(angle)*(m.maxRange+1.6)*scale))};
    // Maximum reach alone reads as the range to fight at. Where the mount
    // falls off, name the band that carries the better modifier as well.
    const eff=effectiveBand(m);
    const reach=eff&&eff.graded?`BEST ${eff.to} · MAX ${m.maxRange}`:`${m.maxRange} HEX`;
    const full=`${ship.mounts.indexOf(m)+1} · ${(m.displayName||m.type).replaceAll('-',' ').toUpperCase()} · ${reach}`;
    let text=full;while(measure(text)+8>890&&text.length>12)text=text.slice(0,-2)+'…';
    const w=measure(text)+8,candidates=[];
    // Start at the arc edge, then use a bounded full-map sweep. Nearest clear
    // slot wins. Dense cases defer to the numbered schematic, never overlap.
    const add=(x,y)=>{const box={x:Math.max(4,Math.min(896-w,x)),y:Math.max(4,Math.min(516-h,y)),w,h};
      if(w<=892&&!taken.some(b=>intersects(b,box)))candidates.push(box);};
    add(anchor.x-w/2,anchor.y-h/2);
    if(!candidates.length)for(let py=4;py+h<=516;py+=h+4)for(let px=4;px+w<=896;px+=Math.max(12,font*2))add(px,py);
    candidates.sort((a,b)=>Math.hypot(a.x+w/2-anchor.x,a.y+h/2-anchor.y)-Math.hypot(b.x+w/2-anchor.x,b.y+h/2-anchor.y));
    const box=candidates[0];if(!box){deferred.push(m.id);continue;}
    taken.push(box);labels.push({mount:m,text,full,box,anchor});
  }
  return {labels,deferred};
}
