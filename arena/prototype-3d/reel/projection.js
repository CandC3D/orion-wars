// Strict exhibition-only input. No imports from the simulation.
const exact=(v,keys)=>{if(!v||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unexpected projection field');};
const finite=n=>{if(!Number.isFinite(n))throw Error('Nonfinite projection number');};
const hex=(p,facing=false)=>{exact(p,facing?['q','r','facing']:['q','r']);finite(p.q);finite(p.r);if(facing&&(!Number.isInteger(p.facing)||p.facing<0||p.facing>5))throw Error('Invalid facing');};
export function validateReel(input){
 const p=structuredClone(input);exact(p,['format','durationMs','units','events','projectiles']);
 if(p.format!=='pre-alpha-reel/2'||p.durationMs!==38000/1.2||p.units.length!==3)throw Error('Not the approved reel');
 const ids=new Set();const expected={EAR:'ear-victory',KRE:'kre-swift',VRA:'vra-point'};
 for(const u of p.units){exact(u,['id','faction','asset','poses']);if(expected[u.faction]!==u.asset||ids.has(u.id)||u.poses.length!==2)throw Error('Unrecognised unit');ids.add(u.id);u.poses.forEach(p=>hex(p,true));}
 for(const e of p.events){exact(e,['kind','source','target','weapon','turn','round','mount','hit','face','absorbed','missileId','defenders','intercepted']);
  if(!ids.has(e.source)||!ids.has(e.target)||!['beam','launch','missile'].includes(e.kind)||!['laser-cannon','blaster-beam','heavy-blaster','neutronic-missile','plasma-torpedo'].includes(e.weapon))throw Error('Unobserved endpoint or weapon');
  if(!Number.isInteger(e.mount)||e.mount<0||e.mount>2)throw Error('Unknown mount');
  if(e.source===e.target)throw Error('Friendly fire');
  if(e.kind!=='launch'){if((e.hit!==true&&!(e.kind==='missile'&&e.intercepted===true&&e.hit===false))||e.face<1||e.face>6)throw Error('Unconfirmed outcome');finite(e.absorbed);}
  if(e.kind==='missile'&&(e.defenders?.length!==1||e.defenders[0]!==e.target))throw Error('Cross-faction PD support');
  if(e.defenders?.some(id=>!ids.has(id)))throw Error('Unobserved defender');
 }
 for(const m of p.projectiles){exact(m,['id','source','target','midpoint','samples']);if(!ids.has(m.source)||!ids.has(m.target)||typeof m.id!=='string'||m.samples?.length!==2)throw Error('Unobserved course');hex(m.midpoint);m.samples.forEach(p=>hex(p));}
 const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};return freeze(p);
}
