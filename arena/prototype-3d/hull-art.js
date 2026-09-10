// Keys identify LINEAR COLOR_0 tuples, not sRGB swatches. Meanings belong to hulls.
// Chris's faction sets: mailbox 20260910T105522Z; metal ruling 105112Z.
const region=(key,classification,role,extra={})=>Object.freeze({key,classification,role,...extra,
  metallicPaint:classification==='metal',rgb:[0,2,4].map(i=>parseInt(key.slice(i,i+2),16)/255)});
export const METAL_FINISH=Object.freeze({metalness:.52,roughness:.67,edgeRoughness:.53,flakePitchMm:.12});
export const ART_PROFILES=Object.freeze({
 EAR:Object.freeze({name:'Monoceros',palette:[
  region('bfc7cc','metal','silver / steel hull', {metal:'steel'}),
  region('009fd7','paint','bright blue panelling'),
  region('e91d2d','emissive-designated','red across multiple parts; nav, collector, muzzle and outlet; not a global function'),
  region('0076a9','paint','deep blue panelling'),
  region('f5831f','paint','orange weapons-warning paint at the actual laser housing'),
  region('e1ad34','paint','gold-coloured lower dish; brass versus paint unresolved', {uncertainty:'Colour and geometry do not establish metallic substance; retained as paint pending Chris.'}),
  region('fafafa','emissive-designated','white windows and fittings; individual functions not all assigned'),
  region('61676a','paint','dark grey aft nacelle outlet surround'),
  region('46b749','emissive-designated','small starboard nav fitting; 3888 source corners')
 ],confirmedEffects:['beamEmitter','exhaust']}),
 KRE:Object.freeze({name:'Sparrowhawk',palette:[
  region('126936','paint','painted hull green A'),region('46b749','paint','painted hull green B; meaning of distinction unresolved'),
  region('a97b50','metal','metallic bronze hull', {metal:'bronze'}),
  region('f5831f','emissive-designated','orange collector, vertical exhaust and horizontal radiators'),
  region('fafafa','emissive-designated','white windows'),
  region('ffdd1a','emissive-designated','yellow including both domes; only larger dome is a confirmed weapon'),
  region('e91d2d','paint','red warning rings')
 ],confirmedEffects:['beamEmitter','exhaust']}),
 VRA:Object.freeze({name:'Shard',palette:[
  region('d3bfe5','emissive-designated','lavender; individual system functions unassigned'),
  region('e1ad34','metal','actual metallic gold hull', {metal:'gold'}),
  region('7e3f98','emissive-designated','purple; individual system functions unassigned'),
  region('ffdd1a','paint','yellow hull surfaces; explicitly not in Vraygon emissive set'),
  region('f5831f','paint','orange paint; no inferred system'),
  region('46b749','paint','green fixtures; no inferred function from geometry alone', {variant:{classification:'moulded transparent',material:'green styrene',fiction:'grown crystal weapon components; no specific mount assignment'}}),
  region('e91d2d','emissive-designated','small red fixture; no inferred system')
 ],confirmedEffects:[]})
});
export function artProfile(faction){const profile=ART_PROFILES[faction];if(!profile)throw Error('Missing hull-specific art profile: '+faction);return profile;}
