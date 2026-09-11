// Keys identify LINEAR COLOR_0 tuples, not sRGB swatches. Meanings belong to hulls.
// Substance is faction-wide; anatomy and feature locations remain hull-specific.
import {factionRegion,validateFactionPalette} from './faction-palettes.js';
const region=(f,key,role)=>Object.freeze({...factionRegion(f,key),role});
export const METAL_FINISH=Object.freeze({metalness:.58,roughness:.62,edgeRoughness:.53,flakePitchMm:.12});
export const ART_PROFILES=Object.freeze({
 EAR:Object.freeze({name:'Monoceros',palette:[
  region('EAR','bfc7cc','silver / steel hull'),
  region('EAR','009fd7','bright blue panelling'),
  region('EAR','e91d2d','red across multiple parts; nav, collector, muzzle and outlet; not a global function'),
  region('EAR','0076a9','deep blue panelling'),
  region('EAR','f5831f','orange weapons-warning paint at the actual laser housing'),
  region('EAR','e1ad34','metallic gold confined to the sensor dish'),
  region('EAR','fafafa','white windows and fittings; individual functions not all assigned'),
  region('EAR','61676a','dark grey aft nacelle outlet surround'),
  region('EAR','46b749','small starboard nav fitting; 3888 source corners')
 ],confirmedEffects:['beamEmitter','exhaust']}),
 KRE:Object.freeze({name:'Sparrowhawk',palette:[
  region('KRE','126936','painted hull green A'),region('KRE','46b749','painted hull green B; meaning of distinction unresolved'),
  region('KRE','a97b50','metallic bronze hull'),
  region('KRE','f5831f','orange collector, vertical exhaust and horizontal radiators'),
  region('KRE','fafafa','white windows'),
  region('KRE','ffdd1a','yellow weapon domes: larger beam emitter and smaller point-defence emitter'),
  region('KRE','e91d2d','red warning rings')
 ],confirmedEffects:['beamEmitter','exhaust','pointDefenceEmitter']}),
 VRA:Object.freeze({name:'Shard',palette:[
  region('VRA','d3bfe5','lavender; individual system functions unassigned'),
  region('VRA','e1ad34','actual metallic gold hull'),
  region('VRA','7e3f98','purple; individual system functions unassigned'),
  region('VRA','ffdd1a','yellow hull surfaces; explicitly not in Vraygon emissive set'),
  region('VRA','f5831f','orange paint; no inferred system'),
  region('VRA','46b749','approved clear green crystal weapon components'),
  region('VRA','e91d2d','small red fixture; no inferred system')
 ],confirmedEffects:[]})
});
export function artProfile(faction){const profile=ART_PROFILES[faction];if(!profile)throw Error('Missing hull-specific art profile: '+faction);validateFactionPalette(faction,profile.palette.map(p=>p.key));return profile;}
