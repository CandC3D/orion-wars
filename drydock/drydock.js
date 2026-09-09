import { copy, stockPack, stockWeapons, forkPack, compileDesign, parsePack, validatePack, validateWeapon, weaponKey, designWarnings } from '../src/construction/index.js';
import { history, newId, importDraft, trialScenario, engineering, DRAFT_KEY, LIBRARY_KEY, SESSION_KEY } from './model.js';
import { isStock, readLibrary, currentStock, stockRevision, appendRevision, stockChanges, renameVariant, deleteVariant, restoreVariant } from '../src/construction/stock-library.js';
import { FACE_NAMES, escapeHTML as esc, format } from '../arena/command-model.js';
import { arcPresets, matchingArc, arcLabel } from '../arena/arc-labels.js';
import { GRID_STEPS, snapPosition, mirroredMount } from './placement.js';
import { createSystemsPanel } from './systems-panel.js';
import { formFeedback } from './form-feedback.js';
import { createReferencePanel } from './reference-panel.js';
import { exportDesignCSV, parseDesignCSV, CSV_LIMIT } from '../src/construction/csv.js';
import { shieldCapacity, shieldCost, shieldAbsorbable } from '../src/tactical/ship.js';
import { weaponSpecification } from './specifications.js';
import { sameContent } from '../src/construction/content.js';
import { renderSpecificationPanel, weaponDossier } from './specification-panel.js';
const $=s=>document.querySelector(s), svg=$('#schematic');
let tuning,loadouts,doc,library=[],trash=[],libraryRaw=null,selected=null,tab='hull',pendingImport=null,weaponDraft=null,drag=null,libraryWritable=true,stockUnlocked=false,pendingStock=null,pendingVariant=null;
let importReview=null;
// PLAN ART. The placement grid exists so a turret can be put where it
// actually sits on the ship, which was hard while the plan drew one generic
// hull for Earth and another for everyone else. Where a traced class glyph
// exists it is drawn instead, at the same ship-local scale the console uses,
// so a mount dragged onto the port nacelle here lands on the port nacelle in
// the console's paper doll. Classes still on placeholder art keep the
// generic outline rather than a misleading silhouette.
let planArt=null;
// The traced glyphs put 96.3% of their viewBox to ink and a hull spans about
// +/-1.3 ship-local units, which is 95px per unit on this plan.
const PLAN_INK=0.963, PLAN_EXTENT=1.3, PLAN_UNIT=95;
const planArtHref=design=>{
  const entry=planArt?.[`${design.faction}/${design.className}`];
  return entry&&entry.framed?`../assets/icons/${entry.file}`:null;
};
const pack=()=>doc.pack,design=()=>pack().design,mount=()=>design().mounts.find(m=>m.id===selected),stock=()=>isStock(pack()),locked=()=>stock()&&!stockUnlocked;
const official=(f,c)=>currentStock(f,c,tuning,loadouts,library);
const systemsPanel=createSystemsPanel({getPack:pack,getLibrary:()=>library,change,locked,getTuning:()=>tuning,getLoadouts:()=>loadouts});
const weaponFeedback=formFeedback($('#weapon-form'),$('#weapon-error'));
const designPower=p=>{const s=compileDesign(p,tuning);return (s.reactors?s.reactors.reduce((n,c)=>n+c.power,0):s.hull.cores*s.hull.corePower)+s.hull.impulsePower;};
const component=ref=>pack().weapons.find(w=>weaponKey(w)===weaponKey(ref));
const catalogue=()=>{
  const all=new Map();
  // Saved components can be reused by another ship. The current pack wins a
  // same-ID collision, without rewriting either pack's pinned dependency.
  for(const w of [...stockWeapons(tuning),...library.flatMap(p=>p.weapons),...pack().weapons])all.set(weaponKey(w),w);
  return [...all.values()];
};
const status=message=>{$('#status').textContent=message;};
const referencePanel=createReferencePanel({onError:message=>{status(message);$('#reference-error').textContent=message;},onReady:()=>{$('#reference-error').textContent='';}});
const referenceLabel=id=>`<span data-design-reference="${esc(id)}">…</span>`;
// Read-only dossiers are outside the disabled stock-authoring fieldset.
$('#edit-fields').insertAdjacentHTML('beforebegin','<section id="weapon-specification" aria-label="Selected weapon specification" hidden></section>');
$('.install-tools').insertAdjacentHTML('beforeend','<details id="catalogue-specification"><summary>Preview catalogue weapon specification</summary><div id="catalogue-dossier"></div></details>');
function catalogueDossier(){const definition=catalogue().find(w=>weaponKey(w)===$('#component-picker').value);$('#catalogue-dossier').innerHTML=definition?weaponDossier(weaponSpecification(pack(),tuning,{definition}),{compact:true}):'No catalogue weapon selected.';}
// Keep the recoverable deletion list in the library, separate from stock controls.
$('#saved-list').insertAdjacentHTML('afterend','<details id="deleted-variants"><summary>Deleted variants (<span id="deleted-count">0</span>)</summary><div id="deleted-list"></div></details>');
const placement=()=>({snap:$('#grid-snap').checked,step:Number($('#grid-step').value),axis:$('#axis-snap').checked});
function positionReadout(position=mount()?.position) {
  $('#placement-readout').textContent=position?`${selected} · X ${format(position.x)} / Y ${format(position.y)} / Z ${format(position.z)}${position.x===0?' · ON 2–5 AXIS':''}`:'Select a weapon installation to place it.';
}
function autoSave() {
  try {localStorage.setItem(DRAFT_KEY,JSON.stringify({pack:pack(),past:doc.past,future:doc.future,selected,placement:placement()}));return true;}
  catch{status('Browser storage unavailable or full. Export your pack now; this draft is not safely stored.');return false;}
}
function load(next,message='Design opened.') {stockUnlocked=false;doc=history(next);selected=design().mounts[0]?.id??null;$('#faction').value=design().faction;render();if(autoSave())status(message);}
function savedDraft() {
  return library.some(p=>sameContent(p,pack())) ||
    (stock()&&sameContent(pack(),stockPack(design().faction,design().className,tuning,loadouts)));
}
function openLibrary(next,message) {
  if(!savedDraft() &&
    !confirm('Leave this unsaved draft? Opening another design replaces its recovery copy. Cancel to save a revision or export it first.'))return;
  load(next,message);
}
function change(fn,message='Draft updated; recovery copy stored in this browser.') {
  if(locked())return status('Unlock this stock ship, or fork a variant, before editing.');
  const next=copy(pack());fn(next);const errors=validatePack(next,tuning);
  if(errors.length){render();return status(`Change not applied: ${errors.join('; ')}`);}
  doc.change(next);render();if(autoSave())status(message);
}
function options(items,value) {return items.map(([id,name])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(name)}</option>`).join('');}
function numField(key,label,value,step='1',min='0',max='10000') {return `<label>${esc(label)}<input data-hull="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;}
function renderLibrary() {
  const f=$('#faction').value;
  $('#stock-list').innerHTML=tuning.rosters[f].map(cls=>{const p=official(f,cls),custom=stockRevision(f,cls,library);return `<button data-stock="${cls}" aria-pressed="${stock()&&design().className===cls&&design().faction===f}">${esc(cls.replaceAll('-',' '))}<small>${p.design.hull.points} PT / ${f} / ${custom?`LOCAL R${p.design.revision}`:'SUPPLIED'} / ${referenceLabel(p.design.id)}</small></button>`;}).join('');
  $('#stock-list').querySelectorAll('button').forEach(b=>b.onclick=()=>openLibrary(official(f,b.dataset.stock),'Stock master opened, locked. Unlock to author it directly, or fork a separate variant.'));
  const groups=new Map();
  library.forEach((p,i)=>{if(p.design.faction!==f)return;const items=groups.get(p.design.id)||[];items.push({p,i});groups.set(p.design.id,items);});
  const savedButton=({p,i})=>`<button data-saved="${i}" aria-pressed="${p.design.id===design().id&&p.design.revision===design().revision}">${esc(p.design.name)}<small>R${p.design.revision} / ${p.design.hull.points} PT / ${referenceLabel(p.design.id)}</small></button>`;
  const expanded=new Set([...$('#saved-list').querySelectorAll('details[open]')].map(el=>el.dataset.history));
  $('#saved-list').innerHTML=[...groups.values()].sort((a,b)=>b.at(-1).i-a.at(-1).i).map(items=>{
    items.sort((a,b)=>b.p.design.revision-a.p.design.revision);const latest=items[0];
    return `<div class="variant-group">${savedButton(latest)}${items.length>1?`<details class="variant-history" data-history="${esc(latest.p.design.id)}" ${expanded.has(latest.p.design.id)?'open':''}><summary>Earlier revisions (${items.length-1})</summary>${items.slice(1).map(savedButton).join('')}</details>`:''}</div>`;
  }).join('')||'<p class="footnote">No saved designs for this faction.</p>';
  $('#saved-list').querySelectorAll('[data-saved]').forEach(b=>b.onclick=()=>openLibrary(library[Number(b.dataset.saved)],'Saved revision opened as a working draft. Save creates the next revision.'));
  $('#variant-actions').hidden=stock();$('#variant-action-name').textContent=design().name;
  for(const id of ['rename-variant','delete-variant'])$('#'+id).disabled=!libraryWritable;
  const deleted=trash.filter(e=>e.draft.design.faction===f);
  $('#deleted-count').textContent=String(deleted.length);
  $('#deleted-list').innerHTML=deleted.map(e=>`<div class="deleted-entry"><span>${esc(e.draft.design.name)}<small>${e.revisions.length} saved revision(s) + working draft / ${referenceLabel(e.id)}</small></span><button data-restore-variant="${esc(e.id)}" ${libraryWritable?'':'disabled'} aria-label="Restore ${esc(e.draft.design.name)}">Restore variant</button></div>`).join('')||'<p>No deleted variants for this faction.</p>';
  $('#deleted-list').querySelectorAll('[data-restore-variant]').forEach(b=>b.onclick=()=>restoreDeletedVariant(b.dataset.restoreVariant,b));
  referencePanel.render();
}
function renderHull() {
  const d=design(),h=d.hull;
  $('#hull-fields').innerHTML=`<label>Design name<input id="name" maxlength="100" value="${esc(d.name)}"></label><div class="fields">${[
    ['points','Assigned points',h.points,'0.5','0.5'],['superstructure','Hull structure',h.superstructure,'1','1'],
    ['cores','Reactor count',h.cores,'1','1','32'],['corePower','Power / reactor',h.corePower],['impulsePower','Impulse output',h.impulsePower],
    ['movementPointRatio','Power / hex (effective)',h.movementPointRatio,'0.01','0.01'],['maxShieldPower','Shield cap / face (damage)',h.maxShieldPower,'0.5'],
    ['shieldPointRatio','Power / damage (effective)',h.shieldPointRatio,'0.01','0.01'],['magazine','Shared missile magazine',h.magazine],['weaponReach','Weapon reach multiplier',h.weaponReach,'0.01','0.1','4'],
    ['sensorRating','Sensor rating',h.sensorRating],['pointDefence','Point defence',h.pointDefence],['screen','Screening capacity',h.screen]
  ].filter(args=>!d.engineering||!['cores','corePower','maxShieldPower','shieldPointRatio'].includes(args[0])).map(args=>numField(...args)).join('')}<label>Turns / action<input id="turn-rate" type="number" min="0" max="6" value="${d.turnRate}"></label><label class="wide">Design notes<textarea id="notes" rows="2" maxlength="4000">${esc(d.notes||'')}</textarea></label></div><p class="footnote">${d.engineering?'Reactors and shield generators are installed in the Engineering tab. ':''}Effective values already include the source faction’s modifiers. Changing them does not apply the modifier again. Other inherited systems remain as authored in the hull template.</p>`;
  $('#name').onchange=e=>change(p=>p.design.name=e.target.value);
  $('#notes').onchange=e=>change(p=>p.design.notes=e.target.value);
  $('#turn-rate').onchange=e=>change(p=>p.design.turnRate=Number(e.target.value));
  $('#hull-fields').querySelectorAll('[data-hull]').forEach(el=>el.onchange=()=>{const value=el.value===''?NaN:Number(el.value);change(p=>p.design.hull[el.dataset.hull]=value);});
}
function renderMount() {
  const m=mount();
  if(!m){$('#mount-fields').innerHTML='<p>No mount selected. Install a weapon from the catalogue below.</p>';return;}
  $('#mount-fields').innerHTML=`<div class="eyebrow">${esc(m.id)}</div><label>Installed component / pinned revision<select id="replace-weapon">${options(catalogue().map(w=>[weaponKey(w),`${w.name} / r${w.revision}`]),weaponKey(m.weapon))}</select></label><h3>FIRING FACES / EXACT COVERAGE</h3><label>Arc preset<select id="arc-preset"><option value="">Custom face set</option>${options(arcPresets(tuning.arcs).map(p=>[p.code,`${arcLabel(p.faces,tuning.arcs)} · ${p.code}`]),matchingArc(m.faces,tuning.arcs)?.code||'')}</select></label><div class="face-checks">${[1,2,3,4,5,6].map(f=>`<label><input data-face="${f}" type="checkbox" ${m.faces.includes(f)?'checked':''}>${f} / ${FACE_NAMES[f]}</label>`).join('')}</div><h3>SHIP-LOCAL POSITION</h3><div class="fields">${['x','y','z'].map(axis=>`<label>${axis.toUpperCase()} / ${axis==='x'?'starboard':axis==='y'?'forward':'dorsal'}<input data-axis="${axis}" type="number" step="${axis==='z'?0.01:placement().snap?placement().step:0.001}" min="-2" max="2" value="${m.position[axis]}"></label>`).join('')}<label>Orientation / degrees<input id="orientation" type="number" step="1" min="-180" max="180" value="${m.orientation}"></label></div><p class="footnote">Position and orientation are presentation metadata. Only the exact face set determines tactical bearing in this profile.</p><button type="button" id="delete-mount" class="danger">Remove installation</button>`;
  const alter=(fn,message)=>change(p=>fn(p.design.mounts.find(x=>x.id===selected),p),message);
  $('#replace-weapon').onchange=e=>{const w=catalogue().find(w=>weaponKey(w)===e.target.value);alter((m,p)=>{if(!p.weapons.some(x=>weaponKey(x)===weaponKey(w)))p.weapons.push(copy(w));m.weapon={id:w.id,revision:w.revision};});};
  $('#arc-preset').onchange=e=>{if(e.target.value)alter(m=>m.faces=[...tuning.arcs[e.target.value]]);};
  $('#mount-fields').querySelectorAll('[data-face]').forEach(el=>el.onchange=()=>alter(m=>{const f=Number(el.dataset.face);m.faces=el.checked?[...m.faces,f].sort((a,b)=>a-b):m.faces.filter(x=>x!==f);}));
  $('#mount-fields').querySelectorAll('[data-axis]').forEach(el=>el.onchange=()=>{
    const axis=el.dataset.axis,value=el.value===''?NaN:Number(el.value);
    if(!Number.isFinite(value)||value < -2||value > 2){render();return status('Position must be a number from −2 to 2.');}
    alter(m=>{m.position[axis]=value;if(axis!=='z'){const snapped=snapPosition(m.position,placement());m.position[axis]=snapped[axis];}});
  });
  $('#orientation').onchange=e=>alter(m=>m.orientation=Number(e.target.value));
  $('#delete-mount').onclick=()=>{change(p=>p.design.mounts=p.design.mounts.filter(m=>m.id!==selected),'Installation removed. Undo restores its identity, component and position.');};
}
function render() {
  const active=document.activeElement;
  const focusAttribute=['data-hull','data-axis','data-face','data-mount','data-reactor','data-shield-face','data-spec-mount'].find(key=>active?.hasAttribute(key));
  const focusKey=active?.id?`#${CSS.escape(active.id)}`:
    focusAttribute?`[${focusAttribute}="${CSS.escape(active.getAttribute(focusAttribute))}"]`:null;
  const d=design(); if(!mount())selected=d.mounts[0]?.id??null;
  document.body.dataset.faction=d.faction;$('#design-title').textContent=d.name;$('#design-meta').textContent=`${d.faction} / ${d.className.toUpperCase()} / REVISION ${d.revision}`;$('#design-number').dataset.designReference=d.id;
  $('#design-state').textContent=stock()?(locked()?'STOCK MASTER / LOCKED':'STOCK AUTHORING / UNLOCKED'):'WORKING VARIANT / EXPERIMENTAL';
  $('#edit-fields').disabled=locked();$('#lock-note').textContent=stock()?(locked()?'Stock editing is locked. Unlock to adjust weapons, arcs, positions and hull settings.':'Editing a stock draft. Review & save stock revision makes it the default for new battles in this browser. Unlocking or locking alone does not publish.'):'Editing a variant. Saved revisions and stock ships stay unchanged.';
  $('#stock-lock').hidden=!stock();$('#stock-lock').setAttribute('aria-pressed',String(stockUnlocked));$('#stock-lock').innerHTML=`<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${stockUnlocked?'M7 9V6a4 4 0 0 1 8 0':'M6 9V6a4 4 0 0 1 8 0v3'}"/><rect x="4" y="9" width="12" height="9"/><path d="M10 12v3"/></svg>${locked()?'Unlock stock':'Lock stock'}`;
  $('#restore-stock').hidden=!stock();$('#restore-stock').disabled=locked();
  $('#save').textContent=stock()?'Review & save stock revision':'Save revision';
  $('#undo').disabled=locked()||!doc.past.length;$('#redo').disabled=locked()||!doc.future.length;
  for(const id of ['save','add-mount','new-weapon','mirror','center-mount'])$('#'+id).disabled=locked()||(['mirror','center-mount'].includes(id)&&!mount())||(id==='mirror'&&mount()?.position.x===0);
  $('#save').disabled ||= !libraryWritable;
  for(const name of ['hull','systems','mount']){$('#tab-'+name).setAttribute('aria-pressed',String(tab===name));$('#'+name+'-fields').hidden=tab!==name;}
  $('#weapon-specification').hidden=tab!=='mount';
  renderLibrary();renderHull();renderMount();systemsPanel.render();
  $('#mount-list').innerHTML=d.mounts.map((m,i)=>`<button data-mount="${m.id}" aria-pressed="${m.id===selected}"><span class="mount-no">${String(i+1).padStart(2,'0')}</span><span>${esc(component(m.weapon).name)}<small>${esc(arcLabel(m.faces,tuning.arcs))} · ${esc(m.id)}</small></span></button>`).join('')||'<p class="footnote">No weapons installed.</p>';
  $('#mount-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.mount;tab='mount';render();autoSave();$('#weapon-specification').scrollIntoView({block:'nearest'});});
  const choice=$('#component-picker').value;$('#component-picker').innerHTML=options(catalogue().map(w=>[weaponKey(w),`${w.name} / ${w.spec.kind} / r${w.revision}`]),choice);
  draw();readout();positionReadout();referencePanel.render();catalogueDossier();
  if(focusKey&&!active.isConnected)document.querySelector(focusKey)?.focus({preventScroll:true});
}
const angle={1:-150,2:-90,3:-30,4:30,5:90,6:150};
function polar(deg,r) {const a=deg*Math.PI/180;return [300+Math.cos(a)*r,285+Math.sin(a)*r];}
function wedge(face,r) {const a=polar(angle[face]-30,r),b=polar(angle[face]+30,r);return `M300 285 L${a.join(' ')} A${r} ${r} 0 0 1 ${b.join(' ')} Z`;}
function draw() {
  if(!doc)return;const d=design(),zoom=Number($('#zoom').value),mode=$('#overlay').value,chosen=mount();
  const covered=mode==='placement'?[]:mode==='shields'?[1,2,3,4,5,6]:mode==='battery'?[...new Set(d.mounts.flatMap(m=>m.faces))]:chosen?.faces||[];
  $('#coverage-caption').textContent=mode==='placement'?'Mount placement · grid anchored to the hull · centerline X = 0':mode==='shields'?`Shield faces · 1–6${d.engineering?' · rated cap / power per damage':''}`:`${mode==='battery'?'Combined battery':chosen?.id||'Selected mount'} · ${arcLabel(covered,tuning.arcs)}`;
  let markup=`<defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="var(--edge)" stroke-opacity=".22" stroke-width=".6"/></pattern></defs><rect width="600" height="580" fill="url(#grid)"/><g transform="translate(300 285) scale(${zoom}) translate(-300 -285)">`;
  if(mode!=='placement')for(const f of [1,2,3,4,5,6]) {const on=covered.includes(f),p=polar(angle[f],236);markup+=`<path d="${wedge(f,207)}" fill="${on?'var(--accent)':'none'}" fill-opacity="${mode==='shields'?'.07':'.15'}" stroke="var(--edge)" stroke-width="1"/><text x="${p[0]}" y="${p[1]}" text-anchor="middle" fill="${on?'var(--accent)':'var(--muted)'}" font-size="11">${f} / ${FACE_NAMES[f].toUpperCase().replace('STARBOARD','STBD')}</text>`;}
  if(mode!=='placement')markup+='<path d="M70 285H530" stroke="var(--edge)" stroke-dasharray="3 6"/><circle cx="300" cy="285" r="207" fill="none" stroke="var(--accent)" stroke-width="1.5"/>';
  // Ratings stay in screen-space type beside the drawing. SVG/viewBox scaling
  // otherwise shrinks a 10-unit label to 4–5 pixels on a short drafting pane.
  $('#schematic-shields').hidden=mode!=='shields'||!d.engineering;
  $('#schematic-shields').innerHTML=mode==='shields'&&d.engineering?d.engineering.shields.toSorted((a,b)=>a.face-b.face).map(installation=>{
    const c=pack().systems.find(c=>weaponKey(c)===weaponKey(installation.component));
    return `<div><span>${installation.face} / ${esc(FACE_NAMES[installation.face])}</span><strong data-shield-rating="${installation.face}">${format(c.spec.capacity)} CAP / ${format(c.spec.powerPerDamage)} P</strong></div>`;
  }).join(''):'';
  const hullArt=planArtHref(d);
  if(hullArt){
    const box=2*PLAN_EXTENT*PLAN_UNIT/PLAN_INK;
    markup+=`<image href="${esc(hullArt)}" x="${(300-box/2).toFixed(2)}" y="${(285-box/2).toFixed(2)}" width="${box.toFixed(2)}" height="${box.toFixed(2)}" preserveAspectRatio="xMidYMid meet" opacity=".9" pointer-events="none"/>`;
  }
  else if(d.faction==='EAR')markup+='<path d="M282 255 L318 255 L322 367 L278 367 Z M282 303 L220 330 L214 414 L233 414 L243 344 L280 332 M318 303 L380 330 L386 414 L367 414 L357 344 L320 332" fill="var(--panel)" stroke="var(--accent)"/><ellipse cx="300" cy="218" rx="90" ry="58" fill="var(--panel)" stroke="var(--accent)" stroke-width="2"/><ellipse cx="300" cy="218" rx="65" ry="39" fill="none" stroke="var(--edge)"/><path d="M300 168V269 M223 218H377" stroke="var(--edge)"/>';
  else markup+='<path d="M300 154 L328 231 L348 269 L416 344 L395 387 L334 333 L320 395 L280 395 L266 333 L205 387 L184 344 L252 269 L272 231 Z" fill="var(--panel)" stroke="var(--accent)" stroke-width="2"/><path d="M300 170V390 M255 275L345 275 M221 342L278 306 M379 342L322 306" fill="none" stroke="var(--edge)"/>';
  const spacing=placement().step*95;
  markup+=`<defs><pattern id="mount-grid" x="300" y="285" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse"><path d="M${spacing} 0H0V${spacing}" fill="none" stroke="var(--accent)" stroke-opacity=".22" stroke-width=".45"/></pattern><pattern id="mount-major-grid" x="300" y="285" width="47.5" height="47.5" patternUnits="userSpaceOnUse"><path d="M47.5 0H0V47.5" fill="none" stroke="var(--accent)" stroke-opacity=".4" stroke-width=".6"/></pattern></defs><rect x="110" y="95" width="380" height="380" fill="url(#mount-grid)" pointer-events="none"/><rect x="110" y="95" width="380" height="380" fill="url(#mount-major-grid)" pointer-events="none"/><path id="mount-centerline" d="M300 86V488" stroke="var(--amber)" stroke-dasharray="6 4" stroke-width="1" pointer-events="none"/><text x="307" y="480" fill="var(--amber)" font-size="9">2–5 AXIS / X = 0</text>`;
  d.mounts.forEach((m,i)=>{const x=300+m.position.x*95,y=285-m.position.y*95,active=m.id===selected;markup+=`<g class="mount" data-mount="${m.id}" transform="translate(${x} ${y})"><circle r="${active?15:11}" fill="${active?'var(--amber)':'var(--paper)'}" stroke="${active?'var(--amber)':'var(--accent)'}" stroke-width="2"/><text text-anchor="middle" y="4" font-size="11" fill="${active?'#162027':'var(--ink)'}">${i+1}</text><title>${esc(m.id)} / ${esc(component(m.weapon).name)} / faces ${m.faces.join(',')} / X ${m.position.x}, Y ${m.position.y}, Z ${m.position.z}</title></g>`;});
  const contact=Number($('#contact-face').value)||2,pt=polar(angle[contact],185);if(mode!=='placement')markup+=`<g transform="translate(${pt[0]} ${pt[1]})"><path d="M0 -7L7 0L0 7L-7 0Z" fill="none" stroke="var(--amber)" stroke-width="2"/><text y="-13" text-anchor="middle" fill="var(--amber)" font-size="10">TEST / ${$('#contact-range').value} HEX</text></g>`;markup+='</g>';svg.innerHTML=markup;
}
function readout() {
  try {
    const reading=engineering(pack(),tuning,loadouts,{face:Number($('#contact-face').value),range:Number($('#contact-range').value),reserve:Number($('#reserve').value)/100,move:Number($('#move').value)}),f=reading.forecast;
    const face=Number($('#contact-face').value);
    renderSpecificationPanel({pack:pack(),tuning,reading,selected});
    const values=[['RATED OUTPUT',f.fullPower],['HELM SPEND',f.movement],['WEAPON SPEND',f.weapons],['FLIGHT DECK',f.deck],['POWER REMAINING',f.remaining],[design().engineering?`SHIELD CAP / FACE ${face}`:'SHIELD CAP / FACE',shieldCapacity(reading.ship,face)]];
    $('#power-ledger').innerHTML=values.map(([label,value])=>`<div class="reading"><span>${label}</span><strong>${format(value)}</strong></div>`).join('');
    $('#fire-readout').innerHTML=`<p>Three-action forecast · ${format(f.reserve)} power reserved · ${format(f.overhead)} overhead · shield absorption at remaining power: up to ${format(reading.shieldAbsorbable)} damage on an intact face. Not additive across faces.</p><table><thead><tr><th>INSTALLATION / PINNED COMPONENT</th><th>ACTION 1</th><th>ACTION 2</th><th>ACTION 3</th></tr></thead><tbody>${design().mounts.map(m=>`<tr><td>${esc(m.id)} / ${esc(component(m.weapon).name)}</td>${f.actions.map(a=>{const r=a.mounts.find(r=>r.mountId===m.id);return `<td>${esc(r?.reason||'Unavailable')}${r?.eligible?` / ${format(r.power)} P`:''}</td>`;}).join('')}</tr>`).join('')}</tbody></table><p>${esc(f.caveat)} The arena trial uses this same pinned pack. Fleet-floor escorts, when required, are included in the trial.</p>`;
    $('#diagnostics').innerHTML=designWarnings(pack()).map((m,i)=>`<p class="${i===0?'warning':''}">${esc(m)}</p>`).join('');$('#trial').disabled=false;
    if(design().engineering)$('#fire-readout').insertAdjacentHTML('beforeend',`<h3>SHIELD ENGINEERING / SHARED RESIDUAL POWER</h3><table class="shield-engineering"><thead><tr><th>FACE / GENERATOR</th><th>CAP / DAMAGE</th><th>POWER / DAMAGE</th><th>ABSORBABLE AT FORECAST POWER</th></tr></thead><tbody>${[1,2,3,4,5,6].map(n=>`<tr data-engineering-face="${n}"><td>${n} / ${FACE_NAMES[n]} · ${esc(reading.ship.shieldGenerators[n].displayName)}</td><td>${format(shieldCapacity(reading.ship,n))}</td><td>${format(shieldCost(reading.ship,n))}</td><td>${format(shieldAbsorbable({...reading.ship,power:f.remaining},n))}</td></tr>`).join('')}</tbody></table><p>Each row assumes this face is struck next. These absorption figures are not additive. Capacities reset each action unless that generator is down.</p>`);
  } catch(e) {$('#trial').disabled=true;$('#power-ledger').innerHTML='';$('#fire-readout').textContent='Trial unavailable';$('#diagnostics').textContent=e.message;for(const id of ['spec-power-map','spec-shield-grid','spec-battery','spec-weapon-detail'])$('#'+id).replaceChildren();$('#spec-equation').textContent=`Forecast unavailable: ${e.message}`;$('#power-relationship').textContent='Forecast unavailable.';}
}
$('#component-picker').onchange=catalogueDossier;
const specControlPairs=[['spec-face','contact-face'],['spec-range','contact-range'],['spec-reserve','reserve'],['spec-move','move']];
$('#open-specifications').onclick=()=>{for(const [to,from] of specControlPairs){if(from==='contact-face')$('#'+to).innerHTML=$('#'+from).innerHTML;$('#'+to).value=$('#'+from).value;}readout();$('#specifications-dialog').showModal();};
$('#close-specifications').onclick=()=>$('#specifications-dialog').close();
for(const [from,to] of specControlPairs)$('#'+from).onchange=()=>{const input=$('#'+from);if(!input.checkValidity()||input.value===''){input.reportValidity();return;}$('#'+to).value=input.value;draw();readout();};
$('#spec-battery').onclick=e=>{const button=e.target.closest('[data-spec-mount]');if(!button)return;selected=button.dataset.specMount;tab='mount';render();autoSave();};
$('#spec-edit-mount').onclick=()=>{$('#specifications-dialog').close();tab='mount';render();$('#tab-mount').focus();$('#weapon-specification').scrollIntoView({block:'nearest'});};
$('#arc-reference').onclick=()=>{ $('#arc-glossary').innerHTML=arcPresets(tuning.arcs).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.faces.join(', ')}</td><td><code>${p.code}</code></td></tr>`).join(''); $('#arc-dialog').showModal(); };
$('#arc-close').onclick=()=>$('#arc-dialog').close();
$('#faction').onchange=renderLibrary;
$('#fork').onclick=()=>load(forkPack(pack(),newId()),'Variant forked. The stock master is untouched.');
$('#undo').onclick=()=>{if(locked())return;doc.undo();render();if(autoSave())status('Undo applied to the draft only; saved revisions are unchanged.');};
$('#redo').onclick=()=>{if(locked())return;doc.redo();render();if(autoSave())status('Redo applied to the draft only; saved revisions are unchanged.');};
for(const name of ['hull','systems','mount'])$('#tab-'+name).onclick=()=>{tab=name;render();};
async function saveRevision(next,allowStock=false,variantName=null) {
  const submitted=JSON.stringify(pack());
  const write=()=>{if(!libraryWritable)throw new Error('The existing library could not be fully validated; refusing to overwrite it');return variantName===null?appendRevision(localStorage,next,tuning,libraryRaw,{allowStock}):renameVariant(localStorage,next,variantName,tuning,libraryRaw);};
  try {
    const result=navigator.locks?await navigator.locks.request('orion-drydock-library',write):write();
    library=result.library;trash=result.trash;libraryRaw=result.raw;
    if(JSON.stringify(pack())!==submitted){render();autoSave();status(`Saved ${result.pack.design.name} revision ${result.pack.design.revision}. Your newer working draft has been retained.`);return true;}
    doc.change(result.pack);if(allowStock)stockUnlocked=false;render();
    if(autoSave())status(`Saved ${design().name}, revision ${design().revision}.${allowStock?' Stock relocked; new tactical battles in this browser use this revision. Running battles are unchanged.':' Earlier revisions remain pinned.'} Export for a durable backup.`);
    return true;
  } catch(e){const message=`Save failed: ${e.message}. Export the draft to keep it.`;status(message);if(allowStock)$('#stock-save-error').textContent=message;return false;}
}
$('#rename-variant').onclick=()=>{
  if(stock())return;pendingVariant=copy(pack());$('#variant-name').value=design().name;
  $('#rename-error').textContent='';$('#rename-summary').textContent=`Rename “${design().name}”. This saves your current draft as a new revision; earlier revisions keep their historical names and configurations.`;
  $('#rename-dialog').showModal();$('#variant-name').select();
};
$('#rename-cancel').onclick=()=>$('#rename-dialog').close();
$('#rename-form').onsubmit=async event=>{
  event.preventDefault();if(stock()||JSON.stringify(pack())!==JSON.stringify(pendingVariant))return $('#rename-error').textContent='The draft changed. Close this dialog and review it before renaming.';
  const name=$('#variant-name').value.trim();if(!name)return $('#rename-error').textContent='Enter a name containing 1–100 characters.';
  $('#rename-confirm').disabled=true;
  try{if(await saveRevision(copy(pack()),false,name))$('#rename-dialog').close();else $('#rename-error').textContent=$('#status').textContent;}
  finally{$('#rename-confirm').disabled=false;}
};
$('#delete-variant').onclick=()=>{
  if(stock())return;pendingVariant=copy(pack());const revisions=library.filter(p=>p.design.id===design().id).length;
  $('#delete-summary').textContent=`${design().name}\n${design().id}\n\nMove all ${revisions} saved revision(s) and this working draft to Deleted variants?`;
  $('#delete-error').textContent='';$('#delete-dialog').showModal();
};
$('#delete-cancel').onclick=()=>$('#delete-dialog').close();
$('#delete-confirm').onclick=async()=>{
  if(stock()||JSON.stringify(pack())!==JSON.stringify(pendingVariant))return $('#delete-error').textContent='The draft changed. Close this dialog and review it before deleting.';
  const submitted=copy(pendingVariant),expectedRaw=libraryRaw;$('#delete-confirm').disabled=true;
  const write=()=>{if(!libraryWritable)throw new Error('The library cannot be validated');if(JSON.stringify(pack())!==JSON.stringify(submitted))throw new Error('The working draft changed');return deleteVariant(localStorage,submitted,tuning,expectedRaw);};
  try{
    const result=navigator.locks?await navigator.locks.request('orion-drydock-library',write):write();
    library=result.library;trash=result.trash;libraryRaw=result.raw;$('#delete-dialog').close();
    // The archive already holds the current draft in the same atomic write that
    // removed its revisions. If recovery storage fails, init will not reopen it.
    load(official(submitted.design.faction,submitted.design.className),`Deleted ${submitted.design.name} from the active library. Its ${result.deleted.revisions.length} revision(s) and draft are recoverable in Deleted variants. Battles and replays are unchanged.`);
    $('#deleted-variants').open=true;
  }catch(error){$('#delete-error').textContent=`Delete failed: ${error.message}. The draft remains open; export it for backup.`;status($('#delete-error').textContent);}
  finally{$('#delete-confirm').disabled=false;}
};
async function restoreDeletedVariant(id,button){
  if(!savedDraft()&&!confirm('Restore this variant and leave the current unsaved draft? Cancel to save or export your current work first.'))return;
  const submitted=JSON.stringify(pack()),expectedRaw=libraryRaw;button.disabled=true;
  const write=()=>{if(!libraryWritable)throw new Error('The library cannot be validated');if(JSON.stringify(pack())!==submitted)throw new Error('The working draft changed');return restoreVariant(localStorage,id,tuning,expectedRaw);};
  try{const result=navigator.locks?await navigator.locks.request('orion-drydock-library',write):write();library=result.library;trash=result.trash;libraryRaw=result.raw;load(result.pack,'Variant restored with all saved revisions and its working draft. Unsaved draft changes remain unsaved.');}
  catch(error){button.disabled=false;status(`Restore failed: ${error.message}. Your current draft remains open.`);}
}
$('#stock-lock').onclick=()=>{if(!stock())return;stockUnlocked=!stockUnlocked;render();status(stockUnlocked?'Stock authoring unlocked. Changes remain a draft until you review and save a stock revision.':'Stock locked. Draft retained; locking does not save or apply it.');};
$('#restore-stock').onclick=()=>{if(locked())return;if(!confirm('Replace this working draft with the supplied stock design? Saved revisions are retained. Review & save is still required to make it the default.'))return;change(p=>{const revision=p.design.revision,next=stockPack(design().faction,design().className,tuning,loadouts);for(const key of Object.keys(p))delete p[key];Object.assign(p,next);p.design.revision=revision;},'Supplied stock restored to the draft. Undo is available; review & save to apply it.');};
$('#save').onclick=()=>{
  if(locked())return;
  if(!stock())return saveRevision(copy(pack()));
  pendingStock=copy(pack());const before=official(design().faction,design().className);
  $('#stock-save-error').textContent='';
  const changes=stockChanges(before,pendingStock);
  $('#stock-summary').textContent=`${design().faction} / ${design().className}\nCurrent default: revision ${before.design.revision}\n\n${changes.length?changes.join('\n'):'No content changes from the current default.'}`;
  $('#stock-dialog').showModal();
};
$('#stock-cancel').onclick=()=>{pendingStock=null;$('#stock-dialog').close();};
$('#stock-confirm').onclick=async()=>{if(!pendingStock||locked())return;$('#stock-confirm').disabled=true;try{if(await saveRevision(pendingStock,true)){$('#stock-dialog').close();pendingStock=null;}}finally{$('#stock-confirm').disabled=false;}};
function downloadDesign(text,type,filename){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
const exportName=d=>`${d.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-r${d.revision}`;
$('#export').onclick=()=>{downloadDesign(JSON.stringify(pack(),null,2)+'\n','application/json',`${exportName(design())}.drydock.json`);status('Complete JSON pack exported. CSV export additionally carries the numerical design reference.');};
$('#export-csv').onclick=async()=>{
  const captured=copy(pack());$('#export-csv').disabled=true;
  try{const number=await referencePanel.ensure(captured.design.id);downloadDesign(exportDesignCSV(captured,number,tuning),'text/csv;charset=utf-8',`ship-${number}-${exportName(captured.design)}.drydock.csv`);status(`Design #${number} exported as editable CSV, including all pinned components. Keep the text-cell apostrophes when editing in a spreadsheet.`);}
  catch(error){status(`CSV export failed: ${error.message}. JSON export remains available.`);}finally{$('#export-csv').disabled=false;}
};
$('#import').onclick=()=>$('#import-file').click();
function showImportReview(){
  const d=pendingImport.design,r=importReview;
  $('#import-summary').textContent=`CURRENT → IMPORT\n${design().name} → ${d.name}\nHull: ${design().className} → ${d.className}\nMounts: ${design().mounts.length} → ${d.mounts.length}\nRated power: ${designPower(pack())} → ${designPower(pendingImport)}\nComponents: ${pendingImport.weapons.length} weapons / ${pendingImport.systems?.length||0} systems\nProfile: ${pendingImport.profile}\nCanonical ID: ${d.id} / revision ${d.revision}\nNumerical design reference: ${r.preferred===null?'not supplied (JSON)':`#${r.preferred}`} → #${r.plan.number}\n${r.resolved.design.id!==d.id?`Content identity collision: opens as a new variant (${r.resolved.design.id}). Earlier content is retained.\n`:''}${r.plan.note}`;
}
$('#import-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
    const csv=/\.csv$/i.test(file.name);if(file.size>(csv?CSV_LIMIT:300000))throw new Error(csv?'CSV exceeds 2 MB':'Content pack exceeds 300 KB');
    const text=await file.text(),parsed=csv?parseDesignCSV(text,tuning):{pack:parsePack(text,tuning),shipNumber:null};
    const saved=readLibrary(localStorage,tuning);pendingImport=parsed.pack;
    const deleted=saved.trash.some(entry=>entry.id===pendingImport.design.id),resolved=deleted?forkPack(pendingImport,newId()):importDraft(pendingImport,pack(),saved.library);
    importReview={resolved,preferred:parsed.shipNumber,plan:referencePanel.preview(resolved.design.id,parsed.shipNumber),current:JSON.stringify(pack()),libraryRaw:saved.raw};
    $('#import-error').textContent='';showImportReview();$('#import-dialog').showModal();
  }catch(error){pendingImport=null;importReview=null;status(`Import rejected: ${error.message}`);}
};
$('#import-cancel').onclick=()=>{pendingImport=null;importReview=null;$('#import-dialog').close();};
$('#import-confirm').onclick=async()=>{
  if(!pendingImport||!importReview)return;const review=importReview;$('#import-confirm').disabled=true;
  try{
    if(JSON.stringify(pack())!==review.current)throw new Error('The working draft changed. Cancel and review the import again');
    const saved=readLibrary(localStorage,tuning);if(saved.raw!==review.libraryRaw)throw new Error('The library changed in another tab. Cancel and review the import again');
    const result=await referencePanel.accept(review.resolved.design.id,review.preferred,review.plan.number);
    if(result.changed){review.plan=result.plan;showImportReview();$('#import-error').textContent='The number registry changed. Review the updated numerical reference, then confirm again.';return;}
    if(JSON.stringify(pack())!==review.current||localStorage.getItem(LIBRARY_KEY)!==review.libraryRaw)throw new Error('The draft or library changed while confirming. No design was replaced; review again');
    library=saved.library;trash=saved.trash;libraryRaw=saved.raw;
    load(review.resolved,`Imported as design #${result.plan.number}. Saved revisions, stock defaults and existing battles are unchanged.${review.resolved.design.id!==pendingImport.design.id?' A separate variant preserves the conflicting or deleted identity.':''}`);
    pendingImport=null;importReview=null;$('#import-dialog').close();
  }catch(error){$('#import-error').textContent=`Import not applied: ${error.message}`;}
  finally{$('#import-confirm').disabled=false;}
};
$('#trial').onclick=()=>{try{const scenario=trialScenario(pack(),tuning,{face:Number($('#contact-face').value),range:Number($('#contact-range').value)});sessionStorage.setItem(SESSION_KEY,JSON.stringify({meta:{version:3,scenario},rounds:[]}));autoSave();location.assign('../arena/play.html?drydock=session');}catch(e){status(`Trial could not launch: ${e.message}`);}};
$('#add-mount').onclick=()=>{const w=catalogue().find(w=>weaponKey(w)===$('#component-picker').value);const id=`mount-${crypto.randomUUID().slice(0,8)}`;change(p=>{if(!p.weapons.some(x=>weaponKey(x)===weaponKey(w)))p.weapons.push(copy(w));p.design.mounts.push({id,weapon:{id:w.id,revision:w.revision},faces:[2],position:{x:0,y:0,z:0},orientation:0});});if(design().mounts.some(m=>m.id===id)){selected=id;tab='mount';render();autoSave();}};
$('#mirror').onclick=()=>{
  const m=mount();if(!m||m.position.x===0)return;
  const id=`mount-${crypto.randomUUID().slice(0,8)}`;
  change(p=>p.design.mounts.push(mirroredMount(m,id)),'Mirrored position, orientation and firing faces. The copy is independent; centerline mounts need no duplicate.');
};
$('#center-mount').onclick=()=>{if(mount())change(p=>p.design.mounts.find(m=>m.id===selected).position.x=0,'Mount centered on the 2–5 axis (X = 0). Y, Z and firing faces are unchanged.');};
for(const id of ['contact-face','contact-range','reserve','move'])$('#'+id).onchange=()=>{const el=$('#'+id);if(el.type==='number'){el.value=String(Math.max(Number(el.min),Math.min(Number(el.max),Number(el.value)||0)));}draw();readout();};
for(const id of ['grid-snap','grid-step','axis-snap'])$('#'+id).onchange=()=>{renderMount();draw();autoSave();status('Placement settings updated. Existing mount positions are unchanged.');};
$('#overlay').onchange=()=>{$('#zoom').value=$('#overlay').value==='placement'?'2':'1';draw();};$('#zoom').oninput=draw;
function point(event){
  const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
  const v=p.matrixTransform(svg.getScreenCTM().inverse()),z=Number($('#zoom').value);
  return {x:(v.x-300)/z/95,y:(285-v.y)/z/95};
}
function dragPosition(event){
  const now=point(event),candidate={...drag.origin,x:drag.origin.x+now.x-drag.start.x,y:drag.origin.y+now.y-drag.start.y};
  drag.moved ||= Math.hypot(now.x-drag.start.x,now.y-drag.start.y)>0.00001;
  return snapPosition(candidate,event.altKey?{...placement(),snap:false,axis:false}:placement());
}
svg.onpointerdown=e=>{
  const g=e.target.closest('[data-mount]');if(!g)return;
  selected=g.dataset.mount;tab='mount';render();svg.focus({preventScroll:true});
  if(!locked()){drag={id:selected,start:point(e),origin:copy(mount().position),last:copy(mount().position),moved:false};svg.setPointerCapture(e.pointerId);}
};
svg.onpointermove=e=>{
  if(!drag)return;drag.last=dragPosition(e);
  svg.querySelector(`[data-mount="${drag.id}"]`)?.setAttribute('transform',`translate(${300+drag.last.x*95} ${285-drag.last.y*95})`);
  for(const axis of ['x','y']){const input=$(`[data-axis="${axis}"]`);if(input)input.value=drag.last[axis];}
  positionReadout(drag.last);
};
svg.onpointerup=e=>{
  if(!drag)return;drag.last=dragPosition(e);const {id,last,moved}=drag;drag=null;
  if(moved)change(p=>p.design.mounts.find(m=>m.id===id).position=last,'Weapon position saved on the hull. Firing faces are unchanged.');
  else{renderMount();draw();positionReadout();}
};
svg.onpointercancel=()=>{drag=null;renderMount();draw();positionReadout();};
svg.onkeydown=e=>{
  if(locked()||!mount()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||e.ctrlKey||e.metaKey)return;
  e.preventDefault();const step=placement().step*(e.shiftKey?5:1),axis=e.key==='ArrowLeft'||e.key==='ArrowRight'?'x':'y',sign=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:1;
  change(p=>{const m=p.design.mounts.find(m=>m.id===selected);m.position[axis]+=step*sign;m.position=snapPosition(m.position,e.altKey?{...placement(),snap:false,axis:false}:placement());},'Weapon nudged in ship-local coordinates.');
};
function weaponForm() {
  weaponFeedback.clear();
  $('#weapon-name').value=weaponDraft.name;
  $('#weapon-stats').innerHTML=Object.entries(weaponDraft.spec).filter(([k,v])=>typeof v==='number').map(([k,v])=>`<label>${esc(k.replace(/([A-Z])/g,' $1'))}<input data-stat="${k}" type="number" step="any" value="${v}" required></label>`).join('');
  $('#weapon-stats').querySelectorAll('input').forEach(el=>el.onchange=()=>weaponDraft.spec[el.dataset.stat]=Number(el.value));
  bandsForm();
}
function bandsForm(){
  const s=weaponDraft.spec,keys=s.kind==='missile'?['to','damageMod']:['to','damageBonus','toHitMod'];
  $('#weapon-bands').innerHTML=s.rangeBands.map((b,i)=>`<div class="band-row">${keys.map(k=>`<label>${k}<input type="number" data-band="${i}" data-key="${k}" value="${b[k]??0}" step="1" required></label>`).join('')}<button type="button" data-remove-band="${i}" aria-label="Remove range band ${i+1}">×</button></div>`).join('');
  $('#weapon-bands').querySelectorAll('input').forEach(el=>el.onchange=()=>s.rangeBands[Number(el.dataset.band)][el.dataset.key]=Number(el.value));
  $('#weapon-bands').querySelectorAll('button').forEach(el=>el.onclick=()=>{s.rangeBands.splice(Number(el.dataset.removeBand),1);bandsForm();});
  weaponFeedback.refresh();
}
$('#new-weapon').onclick=()=>{weaponDraft=copy(catalogue().find(w=>weaponKey(w)===$('#component-picker').value));weaponDraft.id=newId();weaponDraft.revision=1;weaponDraft.name+=' custom';weaponForm();$('#weapon-error').textContent='';$('#weapon-dialog').showModal();};
$('#weapon-cancel').onclick=()=>$('#weapon-dialog').close();
$('#add-band').onclick=()=>{weaponDraft.spec.rangeBands.push({to:weaponDraft.spec.maxRange,...(weaponDraft.spec.kind==='missile'?{damageMod:0}:{damageBonus:0,toHitMod:0})});bandsForm();};
$('#weapon-form').onsubmit=e=>{e.preventDefault();weaponDraft.name=$('#weapon-name').value;try{validateWeapon(weaponDraft);const key=weaponKey(weaponDraft);change(p=>p.weapons.push(copy(weaponDraft)),'New component created. Choose Install weapon or replace a selected mount to use it.');if(!pack().weapons.some(w=>weaponKey(w)===key))return;$('#component-picker').value=key;$('#weapon-dialog').close();}catch(e){weaponFeedback.show(e.message);}};
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.target.closest('input,textarea,select')&&!document.querySelector('dialog[open]')){if(e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'#redo':'#undo').click();}}});
async function init() {
  try {
    [tuning,loadouts]=await Promise.all(['tactical-tuning','loadouts'].map(async name=>{const r=await fetch(`../data/${name}.json`,{cache:'no-store'});if(!r.ok)throw new Error('Catalogue fetch failed');return r.json();}));
    $('#contact-face').innerHTML=options([1,2,3,4,5,6].map(f=>[String(f),`${f} / ${FACE_NAMES[f]}`]),'2');
    // Fire and forget: the plan draws with generic outlines until this lands,
    // and keeps them for good if it never does.
    fetch('../assets/icons/manifest.json',{cache:'no-store'})
      .then(r=>r.ok?r.json():null).then(m=>{if(m?.icons){planArt=m.icons;if(doc)draw();}})
      .catch(()=>{});
    let storageNotice='';
    try {const saved=readLibrary(localStorage,tuning);library=saved.library;trash=saved.trash;libraryRaw=saved.raw;}
    catch {libraryWritable=false;storageNotice=' Saved library could not be read. It will not be overwritten. Export your work before closing.';}
    let recovered=null;
    try {const raw=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(raw?.pack){parsePack(JSON.stringify(raw.pack),tuning);recovered=raw;}}
    catch{storageNotice+=' Recovery copy could not be loaded; it has not been erased.';}
    if(recovered&&trash.some(e=>e.id===recovered.pack.design.id)){recovered=null;storageNotice+=' The previous variant is in Deleted variants. Restore it there; reloading does not undelete it.';}
    doc=history(recovered?.pack||official('EAR','light-cruiser'));
    if(recovered){doc.past=(recovered.past||[]).slice(-30).filter(p=>!validatePack(p,tuning).length);doc.future=(recovered.future||[]).slice(-30).filter(p=>!validatePack(p,tuning).length);selected=recovered.selected;}
    if(recovered?.placement){const prefs=recovered.placement;if(GRID_STEPS.includes(prefs.step))$('#grid-step').value=String(prefs.step);if(typeof prefs.snap==='boolean')$('#grid-snap').checked=prefs.snap;if(typeof prefs.axis==='boolean')$('#axis-snap').checked=prefs.axis;}
    $('#faction').value=design().faction;render();status((recovered?'Recovered your working draft and undo history. Stock editing always starts locked.':'Ready. Unlock a stock design to author it, or Fork variant for a separate design.')+storageNotice);
  }catch(e){status(`Drydock could not initialize: ${e.message}`);document.querySelectorAll('button').forEach(b=>b.disabled=true);}
}
// Read-only diagnostics for browser acceptance checks; all editing goes through UI.
window.__drydock={get pack(){return copy(pack());},get library(){return copy(library);}};
init();
