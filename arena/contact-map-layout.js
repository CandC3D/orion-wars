// Layout consumes projected CURRENT reports only. Visual offsets never alter hex
// positions. Markers, name labels and grouped course tags share one occupancy
// list, and nothing is ever placed on top of something already placed: a name
// that cannot find clear space near its marker is DEFERRED (not drawn) and the
// marker keeps its title, focus label and list entry. Priority names (selected,
// priority target, focused or hovered) search the widest area and are drawn
// first, so they win space; the selected ship's course tags come next.
export const intersects=(a,b,pad=3)=>a.x<b.x+b.w+pad&&a.x+a.w+pad>b.x&&a.y<b.y+b.h+pad&&a.y+a.h+pad>b.y;
export const DEFAULT_MEASURE=font=>text=>text.length*font*.58;

export function layoutContactMap(ships,actions,{project,width=900,height=520,font=16,icon=26,label,measure=null,priority={}}={}){
  const occupied=[],markers=[],labels=[],course=[],deferred=[];
  const textWidth=measure||DEFAULT_MEASURE(font);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const inside=b=>b.x>=2&&b.y>=2&&b.x+b.w<=width-2&&b.y+b.h<=height-2;
  const free=b=>inside(b)&&!occupied.some(o=>intersects(o,b));
  const pad=Math.max(2,font*.25);
  // Candidate boxes around an anchor: eight directions per ring, nearest first.
  function around(anchor,w,h,step,rings,gap){
    const out=[];
    for(let ring=1;ring<=rings;ring++)for(const [dx,dy] of [[0,1],[0,-1],[1,1],[-1,1],[1,0],[-1,0],[1,-1],[-1,-1]]){
      const cx=anchor.x+dx*(gap+ring*step),cy=anchor.y+dy*(gap*.8+ring*step*.8);
      out.push({x:clamp(cx-w/2,2,width-w-2),y:clamp(cy-h/2,2,height-h-2),w,h});
    }
    return out;
  }
  // Markers: prefer the true hex; displace only far enough to stop icon overlap.
  for(const ship of ships){
    const anchor=project(ship.pos);
    if(!(anchor.x>=0&&anchor.x<=width&&anchor.y>=0&&anchor.y<=height))continue;
    const w=icon,h=icon;const own={x:anchor.x-w/2,y:anchor.y-h/2,w,h};
    let box=free(own)?own:around(anchor,w,h,icon*.55,6,icon*.15).find(free);
    // Genuinely no clear space (a pile of hulls): stack outward along one axis
    // rather than hiding a selectable marker; still never on top of a label.
    if(!box){let k=1;while(!box&&k<40){const b={x:clamp(anchor.x-w/2,2,width-w-2),y:clamp(anchor.y-h/2+k*icon*.6,2,height-h-2),w,h};if(!occupied.some(o=>intersects(o,b)))box=b;k++;}box??=own;}
    occupied.push(box);markers.push({ship,anchor,x:box.x+w/2,y:box.y+h/2,box,displaced:Math.hypot(box.x+w/2-anchor.x,box.y+h/2-anchor.y)>1});
  }
  const rank=m=>m.ship.id===priority.selected?0:m.ship.id===priority.target?1:(m.ship.id===priority.focus||m.ship.id===priority.hover)?2:3;
  const ordered=[...markers].sort((a,b)=>rank(a)-rank(b));
  // Free-slot sweep within a radius of the marker (secondary) or the whole map
  // (priority), nearest first. Never returns an occupied slot.
  function sweep(anchor,w,h,radius){
    const step=Math.max(4,font*.6),found=[];
    for(let y=2;y+h<=height-2;y+=step)for(let x=2;x+w<=width-2;x+=step){const b={x,y,w,h};const d=Math.hypot(x+w/2-anchor.x,y+h/2-anchor.y);if(d<=radius&&!occupied.some(o=>intersects(o,b)))found.push({b,d});}
    found.sort((a,b)=>a.d-b.d);return found[0]?.b??null;
  }
  for(const marker of ordered){
    const primary=rank(marker)<3;let text=label(marker.ship),truncated=false;
    const h=Math.ceil(font+pad*1.5);
    // The reserved box must hold the measured text; a name wider than the map cannot be placed and falls to the truncation or deferral policy.
    const attempt=t=>{const w=Math.ceil(textWidth(t))+pad*2;if(w>width-8)return null;return around(marker,w,h,font*1.05,primary?7:5,icon*.55).find(free)||sweep(marker,w,h,primary?Infinity:font*7);};
    let box=attempt(text);
    // A priority name must be shown: shorten it with an ellipsis only when no
    // full-width slot exists anywhere on the map (identity stays in the panel).
    if(!box&&primary){let n=text.length-1;while(!box&&n>=12){text=label(marker.ship).slice(0,n)+'…';truncated=true;box=attempt(text);n-=4;}}
    if(box){occupied.push(box);labels.push({id:marker.ship.id,text,box,primary,truncated,leader:Math.hypot(box.x+box.w/2-marker.x,box.y+box.h/2-marker.y)>icon*1.1});}
    else deferred.push({id:marker.ship.id,text:label(marker.ship),primary});
  }
  // Grouped course endpoints for the selected ship: same policy, never stacked.
  const grouped=new Map();
  for(const action of actions||[])if(action.end){const key=`${action.end.q},${action.end.r}`;if(!grouped.has(key))grouped.set(key,{pos:action.end,actions:[]});grouped.get(key).actions.push(action);}
  for(const group of grouped.values()){
    const anchor=project(group.pos);if(!(anchor.x>=0&&anchor.x<=width&&anchor.y>=0&&anchor.y<=height))continue;
    const text=group.actions.map(a=>`A${a.round}${a.kind==='scan'?' S'+a.scan:a.kind==='hold'?' F':''}`).join(' / ');
    const w=Math.ceil(textWidth(text))+pad*2,h=Math.ceil(font+pad*1.5);
    const box=w>width-8?null:around(anchor,w,h,font*1.05,6,icon*.35).find(free);
    if(box){occupied.push(box);course.push({anchor,text,box});}else deferred.push({id:`course:${group.pos.q},${group.pos.r}`,text,primary:true,course:true});
  }
  return {markers,labels,course,deferred};
}

// Hex grid segments for the visible window only. Pointy-top axial geometry:
// x = pitch * (q + r/2), y = pitch * .866 * r; a pointy-top cell of horizontal
// pitch p has circumradius p / sqrt(3) with vertices at 30, 90, ... degrees, so
// neighbouring cells share edges exactly (the same geometry as the engine's hexes). Returns the
// list of cells and one path string; callers bound the count before drawing.
export function hexGridCells(map,{center,scale,width=900,height=520}){
  const half={q:map.widthHexes/2,r:map.heightHexes/2};
  const rMin=Math.floor(center.r+(-height/2)/(scale*.866))-1,rMax=Math.ceil(center.r+(height/2)/(scale*.866))+1;
  const cells=[];
  // Cells are integer axial coordinates; the map bound |r| <= H/2 may be fractional for odd heights, so start at the first integer inside it.
  for(let r=Math.max(Math.ceil(-half.r),rMin);r<=Math.min(Math.floor(half.r),rMax);r++){
    const qMin=Math.floor(center.q+(-width/2)/scale-(r-center.r)/2)-1,qMax=Math.ceil(center.q+(width/2)/scale-(r-center.r)/2)+1;
    for(let q=qMin;q<=qMax;q++){if(Math.abs(q+r/2)<=half.q)cells.push({q,r});}
  }
  return cells;
}
export const HEX_CIRCUMRADIUS=scale=>scale/Math.sqrt(3);
export function hexGridPath(cells,project,scale){
  const r=scale/Math.sqrt(3),corner=Array.from({length:6},(_,i)=>{const a=Math.PI/6+i*Math.PI/3;return [Math.cos(a)*r,Math.sin(a)*r];});
  let d='';
  for(const cell of cells){const p=project(cell);d+='M'+corner.map(([dx,dy],i)=>`${(p.x+dx).toFixed(1)},${(p.y+dy).toFixed(1)}`).join('L')+'Z';}
  return d;
}

export function reportCamera(ships,map,{width=900,height=520}={}){
  if(!ships.length)return {zoom:1,center:{q:0,r:0}};
  const xs=ships.map(s=>s.pos.q+s.pos.r/2),rs=ships.map(s=>s.pos.r);
  const x=(Math.min(...xs)+Math.max(...xs))/2,r=(Math.min(...rs)+Math.max(...rs))/2;
  const base=Math.min(width/(map.widthHexes+8),height/(map.heightHexes+6));
  return {center:{q:x-r/2,r},zoom:Math.max(1,Math.min(12,
    width/(base*(Math.max(...xs)-Math.min(...xs)+12)),height/(base*.866*(Math.max(...rs)-Math.min(...rs)+12))))};
}
