// Art meanings are scoped to a hull, never inferred from a shared hex value.
// Keys identify linear COLOR_0 tuples; they are not sRGB values to decode again.
const region=(key,role,metallicPaint=false)=>Object.freeze({key,role,metallicPaint,rgb:[0,2,4].map(i=>parseInt(key.slice(i,i+2),16)/255)});
export const ART_PROFILES=Object.freeze({
 EAR:Object.freeze({name:'Monoceros',palette:[
  region('bfc7cc','pale hull paint'),region('009fd7','bright blue paint; no whole-region system meaning'),
  region('e91d2d','red paint across multiple parts; not a global warning or nav mask'),
  region('0076a9','deep blue paint; no whole-region system meaning'),region('f5831f','orange weapons-warning paint at the actual laser housing'),
  region('e1ad34','gold paint on the actual lower dish',true),region('fafafa','white paint on actual windows and fittings'),
  region('61676a','dark grey paint on the aft nacelle outlet'),region('46b749','small starboard nav fitting; 3888 source corners')
 ],confirmedEffects:['beamEmitter','exhaust']}),
 KRE:Object.freeze({name:'Sparrowhawk',palette:[
  region('126936','painted hull green A'),region('46b749','painted hull green B; distinction unresolved'),
  region('a97b50','metallic bronze paint',true),region('f5831f','orange collector, exhaust and radiator paint'),
  region('fafafa','white window paint'),region('ffdd1a','yellow paint including both domes'),region('e91d2d','red warning rings')
 ],confirmedEffects:['beamEmitter','exhaust']}),
 VRA:Object.freeze({name:'Shard',palette:[
  region('d3bfe5','pale violet paint; no inferred system'),region('e1ad34','gold-coloured paint; no inferred system',true),
  region('7e3f98','purple paint; no inferred system'),region('ffdd1a','yellow paint; no inferred system'),
  region('f5831f','orange paint; no inferred system'),region('46b749','green fixtures; no inferred function'),
  region('e91d2d','red fixture; no inferred function')
 ],confirmedEffects:[]})
});
export function artProfile(faction){const profile=ART_PROFILES[faction];if(!profile)throw Error('Missing hull-specific art profile: '+faction);return profile;}
