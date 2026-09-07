// Condition rings drawn on the map, in the schematic's own vocabulary.
//
// INFORMATION BOUNDARY. Own ships carry a full per-face shield reading, so the
// six-face ring is real state. A contact carries no shield reading at all - the
// reports panel says "Engineering and shield points: unknown" and that is the
// truth - so the contact ring shows the DISCLOSED HULL condition and is
// labelled hull. Nothing here infers a shield value for an enemy, and the two
// rings never share a colour or a shape.
import {escapeHTML as esc} from './command-model.js';
import {OFFSET_OF_FACE, FACE_NAMES} from './command-model.js';
import {shieldFaces} from './console-instruments.js';

const TRACK='#43535d', DOWN='#ffafa2', OWN='#7bc6ec', HULL='#efb773', GAP_DEG=7;
const num=n=>Number.isFinite(Number(n))?Number(n):0;
// Direction 0 is screen right and directions increase counter-clockwise, the
// same convention the weapon labels use for arc anchors.
const point=(cx,cy,r,deg)=>({x:cx+Math.cos(deg*Math.PI/180)*r,y:cy-Math.sin(deg*Math.PI/180)*r});
function arcPath(cx,cy,r,from,to){
  const a=point(cx,cy,r,from),b=point(cx,cy,r,to);
  const large=Math.abs(to-from)>180?1:0;
  // Sweep 0: angles increase counter-clockwise, y grows downward on screen.
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)}A${r.toFixed(2)},${r.toFixed(2)} 0 ${large} 0 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

// Six faces of an OWN ship at its marker, each arc filled by remaining/capacity.
export function shieldArcMarkup(ship,{project,scale,at=null,radius=null,width=null}={}){
  if(!ship||ship.destroyed||!Array.isArray(ship.shields)||!ship.shields.length)return '';
  const centre=at||project(ship.pos);
  const r=num(radius)||scale*1.15, w=num(width)||Math.max(1.5,scale*.16);
  if(!(r>0))return '';
  const faces=shieldFaces(ship);
  const body=faces.map(f=>{
    const dir=(num(ship.facing)+(OFFSET_OF_FACE[f.face]??0))%6;
    const centreDeg=-60*dir, half=30-GAP_DEG/2;
    const from=centreDeg-half, to=centreDeg+half;
    const ratio=f.capacity>0?Math.max(0,Math.min(1,f.remaining/f.capacity)):0;
    const title=`Face ${f.face} · ${FACE_NAMES[f.face]} · ${f.down?'DOWN':`${Math.round(ratio*100)}% · ${f.remaining} of ${f.capacity}`}`;
    return `<g data-shield-face="${f.face}" data-shield-down="${f.down?'true':'false'}"><title>${esc(title)}</title>`
      +`<path d="${arcPath(centre.x,centre.y,r,from,to)}" fill="none" stroke="${TRACK}" stroke-opacity=".55" stroke-width="${w.toFixed(2)}"/>`
      +(f.down||ratio<=0?'':`<path d="${arcPath(centre.x,centre.y,r,from,from+(to-from)*ratio)}" fill="none" stroke="${OWN}" stroke-width="${w.toFixed(2)}" stroke-linecap="butt"/>`)
      +(f.down?`<path d="${arcPath(centre.x,centre.y,r,from,to)}" fill="none" stroke="${DOWN}" stroke-opacity=".85" stroke-width="${w.toFixed(2)}" stroke-dasharray="${Math.max(1,w).toFixed(2)} ${Math.max(1,w*1.6).toFixed(2)}"/>`:'')
      +`</g>`;
  }).join('');
  return `<g class="shield-arcs" data-shield-ring="${esc(String(ship.id))}" pointer-events="none" role="img" aria-label="Own shield faces at this heading">${body}</g>`;
}

// What a report actually discloses, in the engine's own three detail levels.
export function conditionReading(contact){
  const d=contact?.observedDamage;if(!d)return null;
  if(d.detail==='interval'){
    const min=Math.max(0,Math.min(1,num(d.remainingFraction?.min)));
    const max=Math.max(min,Math.min(1,num(d.remainingFraction?.max)));
    return {detail:'interval',min,max,label:`hull ${Math.round(min*100)}–${Math.round(max*100)}%`};
  }
  // Brackets are ordinal, never a percentage: they are drawn as lit segments.
  const ladder=d.detail==='bracket'?['critical','heavily-damaged','damaged','intact']:['damaged','intact'];
  const index=ladder.indexOf(d.condition);
  return {detail:d.detail,segments:ladder.length,lit:index<0?0:index+1,
    label:`hull ${String(d.condition).replaceAll('-',' ')}`};
}

// A CONTACT's disclosed hull condition. Never shields: a report carries none.
export function conditionArcMarkup(contact,{project,scale,at=null,radius=null,width=null}={}){
  const reading=conditionReading(contact);if(!reading)return '';
  const centre=at||project(contact.pos);
  const r=num(radius)||scale*1.15, w=num(width)||Math.max(1.5,scale*.16);
  if(!(r>0))return '';
  const title=`${esc(String(contact.id))} · ${reading.label} · shield points unknown`;
  const track=`<circle cx="${centre.x.toFixed(2)}" cy="${centre.y.toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="${TRACK}" stroke-opacity=".5" stroke-width="${w.toFixed(2)}"/>`;
  let body;
  if(reading.detail==='interval'){
    // Solid to the floor of the disclosed band, faint across the uncertainty.
    const span=deg=>-90+360*deg;
    body=(reading.min>0?`<path data-hull-known="true" d="${arcPath(centre.x,centre.y,r,span(0),span(reading.min))}" fill="none" stroke="${HULL}" stroke-width="${w.toFixed(2)}"/>`:'')
      +(reading.max>reading.min?`<path data-hull-uncertain="true" d="${arcPath(centre.x,centre.y,r,span(reading.min),span(reading.max))}" fill="none" stroke="${HULL}" stroke-opacity=".38" stroke-width="${w.toFixed(2)}"/>`:'');
  } else {
    const step=360/reading.segments, gap=Math.min(GAP_DEG,step*.25);
    body=Array.from({length:reading.segments},(_,i)=>{
      const from=-90+360*(i/reading.segments)+gap/2, to=from+step-gap;
      return i<reading.lit?`<path data-hull-segment="${i}" d="${arcPath(centre.x,centre.y,r,from,to)}" fill="none" stroke="${HULL}" stroke-width="${w.toFixed(2)}"/>`:'';
    }).join('');
  }
  return `<g class="condition-arc" data-condition-detail="${esc(reading.detail)}" data-condition-ring="${esc(String(contact.id))}" pointer-events="none" role="img" aria-label="${title}"><title>${title}</title>${track}${body}</g>`;
}
