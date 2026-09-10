export function fleetHull(manifest,id){
 const h=manifest.hulls.find(h=>h.id===id);if(!h)throw Error('Missing explicit asset entry: '+id);
 if(!['+X','-X','+Y','-Y'].includes(h.nativeBow))throw Error('Missing explicit presentation axis: '+id);
 if(!Object.hasOwn(h,'code')||!(typeof h.code==='string'&&/^[A-Z]{3}-\d{2}$/.test(h.code)||h.code===null&&h.codeStatus==='pending Chris'))throw Error('Missing class-code decision: '+id);
 return h;
}
export function validateFleetManifest(m){
 if(m.format!=='tabletop-complete-library/1'||m.hulls.length!==26||new Set(m.hulls.map(h=>h.id)).size!==26||new Set(m.hulls.map(h=>h.source)).size!==26)throw Error('Incomplete fleet contract');
 for(const h of m.hulls)fleetHull(m,h.id);return m;
}
export const BOARD_FLEET_IDS=Object.freeze({'EAR/frigate':'ear-monoceros','KRE/frigate':'kre-sparrowhawk','VRA/frigate':'vra-shard'});
export const boardCodeTable=m=>Object.fromEntries(Object.entries(BOARD_FLEET_IDS).map(([key,id])=>[key,fleetHull(m,id).code]));
