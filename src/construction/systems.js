// Reusable engineering definitions. No DOM, browser storage or combat state.
export const SYSTEMS_VERSION = 2;
export const SYSTEMS_PROFILE = 'six-face-components-v2';
export const LEGACY_ENGINEERING_FIELDS = ['cores','corePower','maxShieldPower','shieldPointRatio'];
export const componentKey = ref => `${ref.id}@${ref.revision}`;
const fail=message=>{throw new Error(message);};
function keys(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label}: expected object`);for(const k of Object.keys(value))if(!allowed.includes(k))fail(`${label}: unsupported field ${k}`);}
function id(value,label){if(typeof value!=='string'||value.length>100||!/^[a-z0-9][a-z0-9:._-]*$/.test(value))fail(`${label}: invalid ID`);}
function number(value,label,min=0,max=10000,integer=false){if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))fail(`${label}: expected ${integer?'integer':'number'} ${min}–${max}`);}
function ref(value){keys(value,['id','revision'],'System reference');id(value.id,'System reference');number(value.revision,'System revision',1,1000000,true);}
export function validateSystem(system) {
  keys(system,['id','revision','name','spec'],'System');id(system.id,'System ID');number(system.revision,'System revision',1,1000000,true);
  if(typeof system.name!=='string'||!system.name.trim()||system.name.length>100)fail('System name: expected nonempty text up to 100 characters');
  const spec=system.spec;
  if(spec?.kind==='reactor'){keys(spec,['kind','power'],'Reactor');number(spec.power,'Reactor output');}
  else if(spec?.kind==='shield'){keys(spec,['kind','capacity','powerPerDamage'],'Shield generator');number(spec.capacity,'Shield capacity');number(spec.powerPerDamage,'Shield power per damage',.01);}
  else fail('Unsupported system family');
}
export function checkEngineering(pack) {
  if(!Array.isArray(pack.systems)||pack.systems.length>128)fail('System catalogue: expected at most 128 entries');
  const catalogue=new Map();
  for(const system of pack.systems){validateSystem(system);const key=componentKey(system);if(catalogue.has(key))fail(`Duplicate system revision: ${key}`);catalogue.set(key,system);}
  const e=pack.design.engineering;keys(e,['reactors','shields'],'Engineering');
  if(!Array.isArray(e.reactors)||!e.reactors.length||e.reactors.length>32)fail('Install 1–32 reactors');
  if(!Array.isArray(e.shields)||e.shields.length!==6)fail('Install exactly one shield generator for each of six faces');
  const ids=new Set(),faces=new Set();
  const resolve=(installation,kind)=>{ref(installation.component);const c=catalogue.get(componentKey(installation.component));if(!c)fail(`Missing system: ${componentKey(installation.component)}`);if(c.spec.kind!==kind)fail(`Expected ${kind}, not ${c.spec.kind}`);};
  for(const r of e.reactors){keys(r,['id','component'],'Reactor installation');id(r.id,'Reactor installation ID');if(ids.has(r.id))fail(`Duplicate reactor installation: ${r.id}`);ids.add(r.id);resolve(r,'reactor');}
  for(const s of e.shields){keys(s,['face','component'],'Shield installation');number(s.face,'Shield face',1,6,true);if(faces.has(s.face))fail(`Duplicate shield face: ${s.face}`);faces.add(s.face);resolve(s,'shield');}
  return catalogue;
}
export function compileEngineering(pack) {
  const catalogue=checkEngineering(pack),e=pack.design.engineering;
  const named=i=>{const c=catalogue.get(componentKey(i.component));return {component:structuredClone(i.component),displayName:c.name,...c.spec};};
  return {
    reactors:e.reactors.map(r=>{const c=named(r);return {id:r.id,component:c.component,displayName:c.displayName,power:c.power};}),
    shieldGenerators:Object.fromEntries(e.shields.map(s=>{const c=named(s);return [s.face,{component:c.component,displayName:c.displayName,capacity:c.capacity,powerPerDamage:c.powerPerDamage}];}))
  };
}
export function migrateEngineering(pack) {
  const next=structuredClone(pack);if(next.version===SYSTEMS_VERSION)return next;
  const h=next.design.hull;
  // New definitions are pinned to this ship's exact effective V1 values, not
  // looked up from today's faction catalogue on a later import/replay.
  // Migration is an explicit authoring operation, like Fork variant. Fresh IDs
  // prevent two differently edited V1 drafts from redefining one catalogue key.
  const reactor={id:`local:${crypto.randomUUID()}`,revision:1,name:'Inherited reactor',spec:{kind:'reactor',power:h.corePower}};
  const shield={id:`local:${crypto.randomUUID()}`,revision:1,name:'Inherited shield generator',spec:{kind:'shield',capacity:h.maxShieldPower,powerPerDamage:h.shieldPointRatio}};
  const reference=c=>({id:c.id,revision:c.revision});
  next.systems=[reactor,shield];next.design.engineering={reactors:Array.from({length:h.cores},(_,i)=>({id:`reactor-${i+1}`,component:reference(reactor)})),shields:[1,2,3,4,5,6].map(face=>({face,component:reference(shield)}))};
  for(const key of LEGACY_ENGINEERING_FIELDS)delete h[key];
  next.version=SYSTEMS_VERSION;next.profile=SYSTEMS_PROFILE;return next;
}
