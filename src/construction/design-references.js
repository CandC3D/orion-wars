// Human-sized catalogue numbers, separate from immutable design/battle keys.
// This registry is browser-local metadata. It never mutates a content pack.
export const REFERENCE_KEY='orion-wars:drydock:references:v1';
export const REFERENCE_LOCK='orion-drydock-references';
export const MAX_REFERENCE=999999999;
const common=['frigate','destroyer','missile-destroyer','light-cruiser','heavy-cruiser','battleship'];
// Published allocation: append only. Do not derive numbering from tuning order.
export const STOCK_REFERENCES=Object.freeze(Object.fromEntries([
  ['EAR',1,[...common,'gunstar-battlecruiser']],
  ['KRE',8,[...common,'strike-cruiser','carrier']],
  ['VRA',16,[...common,'monitor']],['ZAN',23,[...common,'corvette']]
].flatMap(([f,start,classes])=>classes.map((c,i)=>[`stock:${f.toLowerCase()}:${c}`,start+i]))));
const fail=message=>{throw new Error(message);};
const validId=id=>typeof id==='string'&&id.length<=100&&/^[a-z0-9][a-z0-9:._-]*$/.test(id);
export const validReference=n=>Number.isInteger(n)&&n>=1&&n<=MAX_REFERENCE;
const keys=(v,allowed)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===allowed.length&&Object.keys(v).every(k=>allowed.includes(k));
export function readReferences(storage){
  const raw=storage.getItem(REFERENCE_KEY);
  if(raw!==null&&raw.length>2000000)fail('Design reference registry is too large');
  const registry=raw===null?{format:'orion-drydock-references',version:1,next:1000,entries:[]}:JSON.parse(raw);
  if(!keys(registry,['format','version','next','entries'])||registry.format!=='orion-drydock-references'||registry.version!==1||!Array.isArray(registry.entries)||registry.entries.length>10000||!Number.isInteger(registry.next)||registry.next<1000||registry.next>MAX_REFERENCE+1)fail('Invalid design reference registry; existing data will not be overwritten');
  const ids=new Set(),numbers=new Set();
  for(const entry of registry.entries){
    if(!keys(entry,['id','number'])||!validId(entry.id)||entry.id.startsWith('stock:')||!validReference(entry.number)||entry.number<1000||entry.number>=registry.next||ids.has(entry.id)||numbers.has(entry.number))fail('Conflicting or invalid design references; existing data will not be overwritten');
    ids.add(entry.id);numbers.add(entry.number);
  }
  return {raw,registry};
}
export function referenceFor(id,registry){return Object.hasOwn(STOCK_REFERENCES,id)?STOCK_REFERENCES[id]:registry.entries.find(e=>e.id===id)?.number??null;}
export function planReference(registry,id,preferred=null){
  if(!validId(id))fail('Invalid design key for numerical reference');
  if(preferred!==null&&!validReference(preferred))fail(`Design number must be an integer from 1 to ${MAX_REFERENCE}`);
  const existing=referenceFor(id,registry);
  if(existing!==null)return {id,number:existing,create:false,note:preferred!==null&&preferred!==existing?`Imported #${preferred} maps to existing local design #${existing}; its number is retained.`:''};
  if(id.startsWith('stock:'))fail('Stock design has no published numerical reference');
  const used=registry.entries.find(e=>e.number===preferred);
  const adopt=preferred!==null&&preferred>=1000&&!used;
  const number=adopt?preferred:registry.next;
  if(number>MAX_REFERENCE||registry.entries.length>=10000)fail('Design reference registry is full');
  return {id,number,create:true,note:preferred===null||adopt?'':`Imported #${preferred} is ${preferred<1000?'reserved for stock':`already assigned to ${used.id}`}; this design will use #${number}.`};
}
// Caller holds REFERENCE_LOCK where available. A stale raw value also fails
// before setItem, so callers cannot silently replace a changed registry.
export function assignReference(storage,id,preferred,expectedRaw){
  const {raw,registry}=readReferences(storage);
  if(raw!==expectedRaw)fail('Design references changed in another tab; review again');
  const plan=planReference(registry,id,preferred);
  if(!plan.create)return {...plan,raw,registry};
  registry.entries.push({id,number:plan.number});registry.next=Math.max(registry.next,plan.number+1);
  const nextRaw=JSON.stringify(registry);storage.setItem(REFERENCE_KEY,nextRaw);
  return {...plan,raw:nextRaw,registry};
}
