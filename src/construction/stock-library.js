// Browser-library policy, separate from combat. Only an explicit save promotes
// a stock draft. Scenarios receive copies, never a reference to a live library.
import { copy, stockPack, validatePack } from './index.js';
import { sameContent } from './content.js';

export const LIBRARY_KEY = 'orion-wars:drydock:library:v1';
export const stockId = (faction, className) => `stock:${faction.toLowerCase()}:${className}`;
export const isStock = pack => pack.design.id.startsWith('stock:');

const fail=message=>{throw new Error(message);};
function exactKeys(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail(`Invalid ${label}`);}
function checkPacks(packs,tuning){
  if(!Array.isArray(packs))fail('Saved design library is not an array');
  const seen=new Set();
  for(const pack of packs){const errors=validatePack(pack,tuning);if(errors.length)fail(`Saved design library: ${errors.join('; ')}`);const key=`${pack.design.id}@${pack.design.revision}`;if(seen.has(key))fail(`Duplicate saved revision: ${key}`);seen.add(key);}
}
// Legacy libraries are arrays. A library with recoverable deletions uses one
// versioned envelope, so removing revisions and saving their backup is atomic.
function writeLibrary(storage,library,trash){
  const raw=JSON.stringify(trash.length?{format:'orion-drydock-library',version:2,designs:library,trash}:library);
  storage.setItem(LIBRARY_KEY,raw);return {library,trash,raw};
}
const checkRaw=(raw,expectedRaw)=>{if(raw!==expectedRaw)fail('The library changed in another tab. Your draft remains open; export it before reloading to review the new library');};

export function readLibrary(storage, tuning) {
  const raw = storage.getItem(LIBRARY_KEY);
  const stored=JSON.parse(raw||'[]');let library,trash;
  if(Array.isArray(stored)){library=stored;trash=[];}
  else {
    exactKeys(stored,['format','version','designs','trash'],'saved library envelope');
    if(stored.format!=='orion-drydock-library'||stored.version!==2||!Array.isArray(stored.trash))fail('Unsupported saved library format');
    library=stored.designs;trash=stored.trash;
  }
  checkPacks(library,tuning);const ids=new Set(library.map(p=>p.design.id));
  for(const entry of trash){
    exactKeys(entry,['id','deletedAt','revisions','draft'],'deleted variant');
    checkPacks(entry.revisions,tuning);checkPacks([entry.draft],tuning);
    if(isStock(entry.draft)||entry.id!==entry.draft.design.id||entry.revisions.some(p=>p.design.id!==entry.id)||ids.has(entry.id))fail('Deleted variant identity conflicts with the library');
    if(typeof entry.deletedAt!=='string'||!Number.isFinite(Date.parse(entry.deletedAt)))fail('Invalid variant deletion date');
    ids.add(entry.id);
  }
  return { raw, library, trash };
}

export function stockRevision(faction, className, library) {
  const id = stockId(faction, className);
  return library.filter(p => p.design.id === id).reduce((latest, p) =>
    !latest || p.design.revision > latest.design.revision ? p : latest, null);
}

export function currentStock(faction, className, tuning, loadouts, library) {
  return copy(stockRevision(faction, className, library) || stockPack(faction, className, tuning, loadouts));
}

export function nextSavedRevision(pack, library, { allowStock = false } = {}) {
  if (isStock(pack) && !allowStock) throw new Error('Unlock and review the stock revision before saving');
  const next = copy(pack);
  next.design.revision = Math.max(isStock(pack) ? pack.design.revision : 0,
    ...library.filter(p => p.design.id === pack.design.id).map(p => p.design.revision)) + 1;
  return next;
}

// Call under the browser's same-origin Web Lock when available. The raw check
// also rejects stale/corrupt storage instead of overwriting another workbench.
export function appendRevision(storage, pack, tuning, expectedRaw, options) {
  const { raw, library, trash } = readLibrary(storage, tuning);
  checkRaw(raw,expectedRaw);
  if(trash.some(entry=>entry.id===pack.design.id))fail('This variant was deleted. Restore it from Deleted variants or fork a new variant before saving');
  const next = nextSavedRevision(pack, library, options);
  const errors = validatePack(next, tuning);
  if (errors.length) throw new Error(errors.join('; '));
  return { pack:copy(next),...writeLibrary(storage,[...library,next],trash) };
}

export function renameVariant(storage,pack,name,tuning,expectedRaw){
  if(isStock(pack))fail('Use stock authoring to rename a stock ship');
  if(typeof name!=='string'||!name.trim()||name.trim().length>100)fail('Variant name must contain 1–100 characters');
  const renamed=copy(pack);renamed.design.name=name.trim();
  return appendRevision(storage,renamed,tuning,expectedRaw);
}

export function deleteVariant(storage,pack,tuning,expectedRaw){
  if(isStock(pack))fail('Stock ships cannot be deleted');
  const errors=validatePack(pack,tuning);if(errors.length)fail(errors.join('; '));
  const {raw,library,trash}=readLibrary(storage,tuning);checkRaw(raw,expectedRaw);
  if(trash.some(entry=>entry.id===pack.design.id))fail('This variant is already in Deleted variants');
  const entry={id:pack.design.id,deletedAt:new Date().toISOString(),revisions:library.filter(p=>p.design.id===pack.design.id),draft:copy(pack)};
  return {deleted:copy(entry),...writeLibrary(storage,library.filter(p=>p.design.id!==entry.id),[...trash,entry])};
}

export function restoreVariant(storage,id,tuning,expectedRaw){
  const {raw,library,trash}=readLibrary(storage,tuning);checkRaw(raw,expectedRaw);
  const entry=trash.find(e=>e.id===id);if(!entry)fail('Deleted variant not found');
  // Recover the working draft separately: it may contain unsaved changes and must
  // not silently replace any archived saved revision of the same number.
  return {pack:copy(entry.draft),...writeLibrary(storage,[...library,...entry.revisions],trash.filter(e=>e.id!==id))};
}

export function pinStockRevisions(scenario, library) {
  const next = copy(scenario);
  for (const side of next.sides || []) for (const ship of side.ships || []) {
    // Authored variants, imported snapshots and previously pinned stock win.
    if (ship.designPack !== undefined) continue;
    const pack = stockRevision(side.faction, ship.className, library);
    if (pack) ship.designPack = copy(pack);
  }
  return next;
}

export function stockChanges(before, after) {
  const changes = [], old = before.design, next = after.design;
  const describeHull=(design,key)=>{
    if(Object.hasOwn(design.hull,key))return JSON.stringify(design.hull[key])??'not set';
    if(design.engineering&&['cores','corePower'].includes(key))return 'component profile (individual reactors)';
    if(design.engineering&&['maxShieldPower','shieldPointRatio'].includes(key))return 'component profile (per-face generators)';
    return 'not set';
  };
  for (const m of next.mounts) {
    const previous = old.mounts.find(p => p.id === m.id);
    if (!previous) { changes.push(`${m.id}: installation added`); continue; }
    if (!sameContent(previous.weapon,m.weapon)) changes.push(`${m.id}: weapon replaced`);
    if (JSON.stringify([...previous.faces].sort()) !== JSON.stringify([...m.faces].sort())) changes.push(`${m.id}: faces ${previous.faces.join(',')} → ${m.faces.join(',')}`);
    if (!sameContent(previous.position,m.position)) changes.push(`${m.id}: position (${previous.position.x}, ${previous.position.y}, ${previous.position.z}) → (${m.position.x}, ${m.position.y}, ${m.position.z})`);
    if (previous.orientation !== m.orientation) changes.push(`${m.id}: orientation ${previous.orientation}° → ${m.orientation}°`);
  }
  for (const m of old.mounts) if (!next.mounts.some(n => n.id === m.id)) changes.push(`${m.id}: installation removed`);
  for (const key of new Set([...Object.keys(old.hull), ...Object.keys(next.hull)])) {
    if (!sameContent(old.hull[key],next.hull[key])) changes.push(`Hull ${key}: ${describeHull(old,key)} → ${describeHull(next,key)}`);
  }
  for (const key of ['name','notes','turnRate','canCloak','detectionBonusAgainst']) {
    if (old[key] !== next[key]) changes.push(`${key}: ${JSON.stringify(old[key])} → ${JSON.stringify(next[key])}`);
  }
  if (!sameContent(before.weapons,after.weapons)) changes.push('Pinned weapon catalogue changed');
  if(before.profile!==after.profile)changes.push(`Engineering profile: ${before.profile} → ${after.profile}`);
  const systemName=(pack,ref)=>{const c=pack.systems?.find(c=>c.id===ref?.id&&c.revision===ref?.revision);return c?`${c.name} (${c.spec.kind==='reactor'?`${c.spec.power} P`:`${c.spec.capacity} cap / ${c.spec.powerPerDamage} P per damage`})`:'none';};
  if(!sameContent(old.engineering?.reactors,next.engineering?.reactors))changes.push(`Reactors: ${old.engineering?.reactors.map(r=>systemName(before,r.component)).join(', ')||'legacy bank'} → ${next.engineering?.reactors.map(r=>systemName(after,r.component)).join(', ')||'legacy bank'}`);
  for(const face of [1,2,3,4,5,6]){const a=old.engineering?.shields.find(s=>s.face===face),b=next.engineering?.shields.find(s=>s.face===face);if(!sameContent(a,b))changes.push(`Shield ${face}: ${systemName(before,a?.component)} → ${systemName(after,b?.component)}`);}
  if(!sameContent(before.systems,after.systems))changes.push('Pinned engineering catalogue changed');
  return changes;
}
