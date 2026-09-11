import contract from './faction-palettes.json' with {type:'json'};
const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
export const FACTION_PALETTES=freeze(contract);
export function factionRegion(faction,key){
 const r=contract.factions[faction]?.regions[key];
 if(!r)throw Error(`Faction palette export fault: ${faction}/#${key} is not allowed`);
 if(!['metal','paint','emissive-designated','moulded transparent'].includes(r.classification))throw Error('Missing faction material classification: '+faction+'/'+key);
 if(r.classification==='metal'&&!r.metal)throw Error('Missing metal substance: '+faction+'/'+key);
 return Object.freeze({key,...r,metallicPaint:r.classification==='metal',rgb:[0,2,4].map(i=>parseInt(key.slice(i,i+2),16)/255)});
}
export function validateFactionPalette(faction,keys,{expectedKeys,context='hull'}={}){
 if(!contract.factions[faction])throw Error('Missing faction palette contract: '+faction);
 if(!Array.isArray(keys)||!keys.length)throw Error('Missing COLOR_0 palette: '+context);
 for(const key of keys)factionRegion(faction,key);
 if(expectedKeys&&[...new Set(keys)].sort().join(',')!==[...new Set(expectedKeys)].sort().join(','))throw Error('Changed per-hull palette: '+context+'; report the export before preparing');
 return keys;
}
