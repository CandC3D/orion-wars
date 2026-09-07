// Portable, DOM-free construction boundary. A pack is a complete pinned dependency
// bundle: importing it never changes tuning, stock content, or another design.
import { legacySpec } from './legacy.js';
import { SYSTEMS_VERSION, SYSTEMS_PROFILE, LEGACY_ENGINEERING_FIELDS, compileEngineering, checkEngineering, migrateEngineering } from './systems.js';
export { validateSystem, SYSTEMS_VERSION, SYSTEMS_PROFILE } from './systems.js';
export const FORMAT = 'orion-drydock';
export const VERSION = 1;
export const PROFILE = 'six-face-residual-power-v1';
export const copy = value => structuredClone(value);
export const weaponKey = ref => `${ref.id}@${ref.revision}`;
const clean = value => JSON.parse(JSON.stringify(value, (k,v) => k.startsWith('_') ? undefined : v));
const hullNumbers = ['points','cores','corePower','impulsePower','magazine','superstructure','maxShieldPower','shieldPointRatio','movementPointRatio','screen','pointDefence','sensorRating','weaponReach','explosionYield','commandRadius','commandToHit','commandDetectionBonus'];
// Counts/arcs come only from explicit installations. Roster limits come from the
// class's construction policy, not an editable field that simulation would ignore.
const hullKeys = [...hullNumbers,'hangar'];
const weaponCommon = ['kind','maxRange','rangeBands'];
const weaponFields = {
  beam: [...weaponCommon,'maxPower'],
  missile: [...weaponCommon,'powerToArm','damage','spreadPer'],
  spinal: [...weaponCommon,'damage','spreadPer','firePower','chargeRequired','chargeDrawPerTurn','holdDrawPerTurn','cooldownTurns','toHitBonus','vsLightPenalty','evasionMultiplier','capitalPoints','holdForCapitalTurns','aimWeight','bypassShield','battleLinePoints','vsMediumPenalty','immobileWhileCharging','chargeStartRangeHexes']
};
const fail = message => { throw new Error(message); };
function object(v,label) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${label}: expected an object`); }
function keys(v,allowed,label) { object(v,label); for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(`${label}: unsupported field ${k}`); }
function num(v,label,min=0,max=10000,integer=false) { if (!Number.isFinite(v) || v<min || v>max || (integer&&!Number.isInteger(v))) fail(`${label}: expected ${integer?'integer':'number'} ${min}–${max}`); }
function str(v,label,max=100) { if (typeof v!=='string'||!v.trim()||v.length>max) fail(`${label}: expected nonempty text (at most ${max} characters)`); }
function id(v,label) { str(v,label); if (!/^[a-z0-9][a-z0-9:._-]*$/.test(v)) fail(`${label}: use lowercase letters, numbers, colon, dot, underscore or hyphen`); }
function list(v,label,min=0,max=64) { if (!Array.isArray(v)||v.length<min||v.length>max) fail(`${label}: expected ${min}–${max} entries`); }
function safeTree(v,depth=0) {
  if (depth>16) fail('Content nesting is too deep');
  if (v && typeof v==='object') for (const [k,x] of Object.entries(v)) {
    if (['__proto__','prototype','constructor'].includes(k)) fail(`Unsafe property: ${k}`);
    safeTree(x,depth+1);
  }
}
export function validateWeapon(w) {
  keys(w,['id','revision','name','spec'],'Weapon'); id(w.id,'Weapon ID'); num(w.revision,'Weapon revision',1,1000000,true); str(w.name,'Weapon name');
  const s=w.spec; object(s,'Weapon specification');
  if (!weaponFields[s.kind]) fail('Unsupported weapon family');
  keys(s,weaponFields[s.kind],'Weapon specification'); num(s.maxRange,'Weapon range',1,200,true);
  const bools=['bypassShield','immobileWhileCharging'];
  for (const [k,v] of Object.entries(s)) {
    if (bools.includes(k)) { if (typeof v!=='boolean') fail(`${k}: expected boolean`); }
    else if (!weaponCommon.includes(k)) num(v,k,k.includes('Penalty')||k==='toHitBonus'?-20:0);
  }
  for (const k of s.kind==='beam'?['maxPower']:s.kind==='missile'?['powerToArm','damage']:['damage','firePower','chargeRequired','chargeDrawPerTurn','cooldownTurns']) num(s[k],k, k==='maxPower'||k==='chargeRequired'?1:0);
  list(s.rangeBands,'Range bands',1,20); let previous=0;
  for (const b of s.rangeBands) {
    keys(b,s.kind==='missile'?['to','damageMod']:['to','damageBonus','toHitMod'],'Range band');
    num(b.to,'Band endpoint',1,s.maxRange,true); if(b.to<=previous) fail('Band endpoints must increase'); previous=b.to;
    for (const [k,v] of Object.entries(b)) if(k!=='to') num(v,`Band ${k}`,-100,100);
  }
  if(previous!==s.maxRange) fail('Last range band must end at maximum range');
}
function checkPack(pack,tuning,expected={}) {
  if (JSON.stringify(pack).length>300000) fail('Content pack exceeds 300 KB'); safeTree(pack);
  const systems=pack?.version===SYSTEMS_VERSION&&pack?.profile===SYSTEMS_PROFILE;
  keys(pack,['format','version','profile','design','weapons',...(systems?['systems']:[])],'Pack');
  if(pack.format!==FORMAT||(!systems&&(pack.version!==VERSION||pack.profile!==PROFILE))) fail('Unsupported construction format, version or combat profile');
  const d=pack.design;
  keys(d,['id','revision','name','notes','faction','className','hull','turnRate','canCloak','detectionBonusAgainst','mounts',...(systems?['engineering']:[])],'Design');
  id(d.id,'Design ID'); num(d.revision,'Design revision',1,1000000,true); str(d.name,'Design name');
  if(d.notes!==undefined && (typeof d.notes!=='string'||d.notes.length>4000)) fail('Notes must be at most 4000 characters');
  if(!['EAR','KRE','VRA','ZAN'].includes(d.faction)) fail('Unknown design faction');
  if(!tuning.hullClasses[d.className]) fail('Unknown hull template');
  if(d.id.startsWith('stock:') && (d.id!==`stock:${d.faction.toLowerCase()}:${d.className}` || !tuning.rosters[d.faction]?.includes(d.className))) fail('Stock identity must match its faction and roster class');
  for (const k of ['faction','className']) if(expected[k] && d[k]!==expected[k]) fail(`Design ${k} differs from scenario entry`);
  keys(d.hull,systems?hullKeys.filter(k=>!LEGACY_ENGINEERING_FIELDS.includes(k)):hullKeys,'Hull');
  for(const k of hullNumbers) if(d.hull[k]!==undefined) num(d.hull[k],`Hull ${k}`);
  for(const k of ['points','cores','corePower','impulsePower','magazine','superstructure','maxShieldPower','shieldPointRatio','movementPointRatio','screen','pointDefence','sensorRating'].filter(k=>!systems||!LEGACY_ENGINEERING_FIELDS.includes(k))) num(d.hull[k],`Hull ${k}`,['points','superstructure','shieldPointRatio','movementPointRatio'].includes(k)?0.01:0);
  if(systems)checkEngineering(pack);else num(d.hull.cores,'Core count',1,32,true);
  num(d.hull.magazine,'Magazine',0,10000,true);
  num(d.hull.weaponReach,'Weapon reach multiplier',0.1,4);
  if(d.hull.hangar) {
    keys(d.hull.hangar,['interceptor','bomber'],'Hangar');
    for(const h of Object.values(d.hull.hangar)) {keys(h,['squadrons','strength'],'Squadron');num(h.squadrons,'Squadrons',0,16,true);num(h.strength,'Strength',1,100,true);}
  }
  num(d.turnRate,'Turn rate',0,6,true); num(d.detectionBonusAgainst,'Detection modifier',0,100);
  if(typeof d.canCloak!=='boolean') fail('Cloak capability must be boolean');
  list(pack.weapons,'Weapon catalogue',0,64); const catalogue=new Map();
  for(const w of pack.weapons) {validateWeapon(w);const key=weaponKey(w);if(catalogue.has(key)) fail(`Duplicate component revision: ${key}`); catalogue.set(key,w);}
  list(d.mounts,'Mounts',0,64); const ids=new Set(); let spinal=0;
  for(const m of d.mounts) {
    keys(m,['id','weapon','position','orientation','faces'],'Mount'); id(m.id,'Mount ID');
    if(ids.has(m.id)) fail(`Duplicate mount ID: ${m.id}`); ids.add(m.id);
    keys(m.weapon,['id','revision'],'Weapon reference'); id(m.weapon.id,'Referenced component ID');num(m.weapon.revision,'Referenced revision',1,1000000,true);
    const w=catalogue.get(weaponKey(m.weapon)); if(!w) fail(`Missing component: ${weaponKey(m.weapon)}`);
    if(w.spec.kind==='spinal') spinal++;
    list(m.faces,'Firing faces',1,6); if(new Set(m.faces).size!==m.faces.length) fail('Duplicate firing faces'); m.faces.forEach(f=>num(f,'Face',1,6,true));
    keys(m.position,['x','y','z'],'Position'); for(const axis of ['x','y','z']) num(m.position[axis],`Position ${axis}`,-2,2);
    num(m.orientation,'Mount orientation',-180,180);
  }
  if(spinal>1) fail('This combat profile supports at most one spinal mount');
  return catalogue;
}
export function validatePack(pack,tuning,expected) { try {checkPack(pack,tuning,expected);return [];} catch(e) {return [e.message];} }
export function parsePack(text,tuning) {
  if(typeof text!=='string'||text.length>300000) fail('Content pack exceeds 300 KB');
  const pack=JSON.parse(text); checkPack(pack,tuning); return copy(pack);
}
export function compileDesign(pack,tuning,expected) {
  const catalogue=checkPack(pack,tuning,expected), d=pack.design, hull=copy(d.hull), weaponDefinitions={};
  for(const [key,w] of catalogue) weaponDefinitions[key]=copy(w.spec);
  const mounts=d.mounts.map(m=>{
    const w=catalogue.get(weaponKey(m.weapon)), reach=hull.weaponReach;
    return {id:m.id,type:weaponKey(m.weapon),displayName:w.name,kind:w.spec.kind,arc:[...m.faces],arcName:`faces ${m.faces.join('/')}`,
      maxRange:Math.max(1,Math.round(w.spec.maxRange*reach)),bands:w.spec.rangeBands.map(b=>({...b,to:Math.max(1,Math.round(b.to*reach))})),
      position:copy(m.position),orientation:m.orientation,inop:false,firedThisTurn:false};
  });
  return {hull,mounts,weaponDefinitions,...(pack.version===SYSTEMS_VERSION?compileEngineering(pack):{}),magazine:hull.magazine,spinalType:mounts.find(m=>m.kind==='spinal')?.type??null,
    canCloak:d.canCloak,superstructure:hull.superstructure,shieldPointRatio:hull.shieldPointRatio,movementPointRatio:hull.movementPointRatio,
    detectionBonusAgainst:d.detectionBonusAgainst,turnRate:d.turnRate};
}
export function upgradeEngineering(pack,tuning) {checkPack(pack,tuning);const next=migrateEngineering(pack);checkPack(next,tuning);return next;}
export function stockWeapons(tuning) {
  return Object.entries(tuning.weapons).filter(([,v])=>v && typeof v==='object' && v.kind).map(([id,spec])=>({id:`stock:${id}`,revision:1,name:id.replaceAll('-',' '),spec:Object.fromEntries(Object.entries(clean(spec)).filter(([k])=>weaponFields[spec.kind].includes(k)))}));
}
export function stockSystems(tuning,loadouts) {
  return ['EAR','KRE','VRA','ZAN'].flatMap(faction=>tuning.rosters[faction].flatMap(className=>{
    const spec=legacySpec(faction,className,tuning,loadouts),prefix=`stock:${faction.toLowerCase()}:${className}`,name=`${faction} ${className.replaceAll('-',' ')}`;
    return [{id:`${prefix}:reactor`,revision:1,name:`${name} reactor`,spec:{kind:'reactor',power:spec.hull.corePower}},
      {id:`${prefix}:shield`,revision:1,name:`${name} shield`,spec:{kind:'shield',capacity:spec.hull.maxShieldPower,powerPerDamage:spec.shieldPointRatio}}];
  }));
}
export function stockPack(faction,className,tuning,loadouts) {
  const s=legacySpec(faction,className,tuning,loadouts);
  const weapons=stockWeapons(tuning).filter(w=>s.mounts.some(m=>`stock:${m.type}`===w.id));
  const revision=loadouts._publishedStock?.revisions?.[`${faction}/${className}`]??loadouts._publishedStock?.revision??1;
  return {format:FORMAT,version:VERSION,profile:PROFILE,weapons,design:{id:`stock:${faction.toLowerCase()}:${className}`,revision,name:`${faction} ${className.replaceAll('-',' ')}`,notes:'',faction,className,
    hull:{...Object.fromEntries(Object.entries(clean(s.hull)).filter(([k])=>hullKeys.includes(k))),magazine:s.magazine,superstructure:s.superstructure,shieldPointRatio:s.shieldPointRatio,movementPointRatio:s.movementPointRatio},
    canCloak:s.canCloak,detectionBonusAgainst:s.detectionBonusAgainst,turnRate:tuning.movement.turnRatePerRound?.[className]??2,
    mounts:s.mounts.map((m,i)=>({id:`mount-${i+1}`,weapon:{id:`stock:${m.type}`,revision:1},faces:[...m.arc],position:m.position?copy(m.position):{x:Math.round((i%2===0?-0.3:0.3)*100)/100,y:Number((0.65-Math.floor(i/2)*0.22).toFixed(2)),z:0},orientation:m.orientation??0}))}};
}
export function forkPack(pack,newId) { const next=copy(pack); id(newId,'New design ID'); if(newId.startsWith('stock:')) fail('Stock namespace is read-only');next.design.id=newId;next.design.revision=1;next.design.name+=' variant';return next; }
export function designWarnings(pack) {
  const d=pack.design,covered=new Set(d.mounts.flatMap(m=>m.faces));const blind=[1,2,3,4,5,6].filter(f=>!covered.has(f));
  return [...(blind.length?[`Blind sectors: faces ${blind.join(', ')}. Intentional asymmetry is allowed.`]:[]),
    'Experimental design; point cost is designer-assigned, not a balance rating.',
    'Mount position/orientation is model metadata. Combat arcs originate at the ship hex.',
    'Shields spend the shared power pool; the six face limits are not six independent reserves.'];
}
