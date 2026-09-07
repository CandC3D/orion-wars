import { copy, stockSystems, upgradeEngineering, validateSystem, weaponKey } from '../src/construction/index.js';
import { FACE_NAMES, escapeHTML as esc, format } from '../arena/command-model.js';
import { formFeedback } from './form-feedback.js';
const $=s=>document.querySelector(s),ref=c=>({id:c.id,revision:c.revision});
const describe=c=>`${c.name} · ${c.spec.kind==='reactor'?`${format(c.spec.power)} P`:`${format(c.spec.capacity)} cap / ${format(c.spec.powerPerDamage)} P per damage`} · r${c.revision}`;
const options=(items,value)=>items.map(c=>`<option value="${esc(weaponKey(c))}" ${weaponKey(c)===value?'selected':''}>${esc(describe(c))}</option>`).join('');
export function systemsCatalogue(pack,library,supplied) {
  const all=new Map();for(const c of [...supplied,...library.flatMap(p=>p.systems||[]),...(pack.systems||[])])all.set(weaponKey(c),c);return [...all.values()];
}
export function createSystemsPanel({getPack,getLibrary,change,locked,getTuning,getLoadouts}) {
  let supplied=null,componentDraft=null;
  const feedback=formFeedback($('#system-form'),$('#system-error'));
  const catalogue=()=>systemsCatalogue(getPack(),getLibrary(),supplied??=stockSystems(getTuning(),getLoadouts()));
  const lookup=key=>catalogue().find(c=>weaponKey(c)===key);
  const pin=(pack,c)=>{if(!pack.systems.some(s=>weaponKey(s)===weaponKey(c)))pack.systems.push(copy(c));return ref(c);};
  function render() {
    const pack=getPack(),e=pack.design.engineering;
    if(!e){$('#systems-fields').innerHTML=`<h3>ENGINEERING / LEGACY PROFILE</h3><p>Identical cores and one shield rating for all faces. Your saved V1 packs remain supported.</p><p class="footnote">Convert this draft to individually installed reactors and six shield generators. Current outputs and effective efficiencies are preserved. Conversion is undoable; it does not save or apply a stock revision.</p><button type="button" id="upgrade-engineering">Enable component engineering</button>`;$('#upgrade-engineering').onclick=()=>change(p=>Object.assign(p,upgradeEngineering(p,getTuning())),'Draft upgraded to component engineering. Existing reactor outputs and shield values are preserved; earlier saved revisions are unchanged.');return;}
    const all=catalogue(),reactors=all.filter(c=>c.spec.kind==='reactor'),shields=all.filter(c=>c.spec.kind==='shield');
    $('#systems-fields').innerHTML=`<div class="eyebrow">COMPONENT ENGINEERING / V2</div><p class="footnote">Definitions are reusable and pinned. Replacing one installation never updates another. Create/fork to change a component’s numbers.</p><h3>INDIVIDUAL REACTORS</h3><div class="reactor-installations">${e.reactors.map((r,i)=>`<div class="system-install"><label>${String(i+1).padStart(2,'0')} / ${esc(r.id)}<select data-reactor="${esc(r.id)}">${options(reactors,weaponKey(r.component))}</select></label><button type="button" data-remove-reactor="${esc(r.id)}" aria-label="Remove reactor ${i+1}" ${e.reactors.length===1?'disabled':''}>Remove</button></div>`).join('')}</div><label>Additional reactor<select id="reactor-picker">${options(reactors)}</select></label><button type="button" id="add-reactor" ${e.reactors.length>=32?'disabled':''}>Install reactor</button><h3>SIX SHIELD GENERATORS</h3><p class="footnote">Capacity is damage absorbed per face per action. Power per damage is a cost: lower is more efficient. All faces spend the same remaining power pool.</p>${e.shields.toSorted((a,b)=>a.face-b.face).map(s=>`<label class="shield-install">${s.face} / ${FACE_NAMES[s.face]}<select data-shield-face="${s.face}">${options(shields,weaponKey(s.component))}</select></label>`).join('')}<label>Whole-grid template<select id="shield-bank-picker">${options(shields,weaponKey(e.shields[0].component))}</select></label><button type="button" id="fit-shield-bank">Fit selected to all six faces</button><h3>COMPONENT DESIGN OFFICE</h3><button type="button" id="new-system">Create / fork system…</button><p class="footnote">Core losses remove the destroyed reactor’s actual output. The existing last-core immunity rule is unchanged. Impulse and movement settings remain in Hull.</p>`;
    $('#systems-fields').querySelectorAll('[data-reactor]').forEach(el=>el.onchange=()=>{const c=lookup(el.value);change(p=>p.design.engineering.reactors.find(r=>r.id===el.dataset.reactor).component=pin(p,c));});
    $('#systems-fields').querySelectorAll('[data-remove-reactor]').forEach(el=>el.onclick=()=>change(p=>p.design.engineering.reactors=p.design.engineering.reactors.filter(r=>r.id!==el.dataset.removeReactor)));
    $('#add-reactor').onclick=()=>{const c=lookup($('#reactor-picker').value);change(p=>p.design.engineering.reactors.push({id:`reactor-${crypto.randomUUID()}`,component:pin(p,c)}));};
    $('#systems-fields').querySelectorAll('[data-shield-face]').forEach(el=>el.onchange=()=>{const c=lookup(el.value);change(p=>p.design.engineering.shields.find(s=>s.face===Number(el.dataset.shieldFace)).component=pin(p,c));});
    $('#fit-shield-bank').onclick=()=>{const c=lookup($('#shield-bank-picker').value);change(p=>{const component=pin(p,c);p.design.engineering.shields=p.design.engineering.shields.map(s=>({...s,component:copy(component)}));},'Selected generator fitted to all six faces in this draft. Undo restores the previous grid.');};
    $('#new-system').onclick=()=>{$('#system-kind').value='reactor';templates();$('#system-error').textContent='';$('#system-dialog').showModal();};
  }
  function templates(){const items=catalogue().filter(c=>c.spec.kind===$('#system-kind').value);$('#system-template').innerHTML=options(items);fillTemplate();}
  function fillTemplate(){feedback.clear();componentDraft=copy(lookup($('#system-template').value));componentDraft.id=`local:${crypto.randomUUID()}`;componentDraft.revision=1;componentDraft.name+=' custom';if(componentDraft.name.length>100)componentDraft.name=componentDraft.name.slice(0,100);$('#system-name').value=componentDraft.name;
    const fields=componentDraft.spec.kind==='reactor'?[['power','Rated power output',0]]:[['capacity','Absorption cap / face',0],['powerPerDamage','Power per damage / lower is more efficient',.01]];
    $('#system-stats').innerHTML=fields.map(([key,label,min])=>`<label>${label}<input data-system-stat="${key}" type="number" step="any" min="${min}" max="10000" value="${componentDraft.spec[key]}" required></label>`).join('');
  }
  $('#system-kind').onchange=templates;$('#system-template').onchange=fillTemplate;$('#system-cancel').onclick=()=>$('#system-dialog').close();
  $('#system-form').onsubmit=event=>{event.preventDefault();if(locked())return;componentDraft.name=$('#system-name').value;$('#system-stats').querySelectorAll('input').forEach(el=>componentDraft.spec[el.dataset.systemStat]=el.value===''?NaN:Number(el.value));
    try{validateSystem(componentDraft);const key=weaponKey(componentDraft);change(p=>p.systems.push(copy(componentDraft)),'New system definition created. Choose an installation to adopt it; existing installations stay pinned.');if(!getPack().systems.some(c=>weaponKey(c)===key)){$('#system-error').textContent='Component could not be added. Check the draft diagnostic.';return;}$(componentDraft.spec.kind==='reactor'?'#reactor-picker':'#shield-bank-picker').value=key;$('#system-dialog').close();}
    catch(error){feedback.show(error.message);}
  };
  return {render};
}
