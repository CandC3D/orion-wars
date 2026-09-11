// Strict exhibition-only input. No imports from the simulation.
const exact=(v,keys)=>{if(!v||Object.keys(v).some(k=>!keys.includes(k)))throw Error('Unexpected projection field');};
const finite=n=>{if(!Number.isFinite(n))throw Error('Nonfinite projection number');};
const hex=(p,facing=false)=>{exact(p,facing?['q','r','facing']:['q','r']);finite(p.q);finite(p.r);if(facing&&(!Number.isInteger(p.facing)||p.facing<0||p.facing>5))throw Error('Invalid facing');};
export function validateReel(input){
 const p=structuredClone(input);exact(p,['format','durationMs','units','events','projectiles']);
 if(p.format!=='pre-alpha-reel/1'||p.durationMs!==38000||p.units.length!==3)throw Error('Not the approved exhibition');
 const ids=new Set();const expected={EAR:'ear-victory',KRE:'kre-swift',VRA:'vra-point'};
 for(const u of p.units){exact(u,['id','faction','asset','poses']);if(expected[u.faction]!==u.asset||ids.has(u.id)||u.poses.length!==3)throw Error('Unrecognised unit');ids.add(u.id);u.poses.forEach(p=>hex(p,true));}
 for(const e of p.events){exact(e,['kind','source','target','weapon','turn','round','mount','hit','face','absorbed','missileId','defenders','intercepted']);
  if(!ids.has(e.source)||!ids.has(e.target)||!['beam','launch','missile'].includes(e.kind)||!['laser-cannon','blaster-beam','heavy-blaster','neutronic-missile','plasma-torpedo'].includes(e.weapon))throw Error('Unobserved endpoint or weapon');
  if(!Number.isInteger(e.mount)||e.mount<0||e.mount>2)throw Error('Unknown mount');
  if(e.kind!=='launch'){if(e.hit!==true||e.face<1||e.face>6)throw Error('Unconfirmed impact');finite(e.absorbed);}
  if(e.defenders?.some(id=>!ids.has(id)))throw Error('Unobserved defender');
 }
 for(const m of p.projectiles){exact(m,['id','source','target','midpoint']);if(!ids.has(m.source)||!ids.has(m.target)||typeof m.id!=='string')throw Error('Unobserved course');hex(m.midpoint);}
 const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};return freeze(p);
}
