// Known authoring inputs only. No live engine, battle view or recorder here.
import { readLibrary, stockRevision, pinStockRevisions } from '../src/construction/stock-library.js';
import { jsonCopy } from '../src/captains/json.js';
import { escapeHTML as esc } from './command-model.js';
const $=s=>document.querySelector(s);
const SESSION_KEY='orion-wars:scenario-replay:v3';
const scenarios=[['asterion-line.json','The Asterion Line'],['asterion-line-battleship.json','The Asterion Line — Battleship'],['formation-column.json','Formation: column'],
  ['formation-echelon.json','Formation: echelon'],['formation-loose.json','Formation: loose'],
  ['small-action.json','Small action'],['first-obstacles.json','First obstacles'],['twin-moons.json','Twin moons']];
const bounded=v=>jsonCopy(v,{bytes:8*1024*1024,depth:40,nodes:200000});
export async function installCommandSetup(){
  const response=await fetch('../data/tactical-tuning.json');if(!response.ok)throw new Error('Tactical catalogue unavailable');
  const tuning=await response.json();let imported=null;
  const label=s=>s.replaceAll('-',' ');
  function library(){return readLibrary(localStorage,tuning).library;}
  function price(faction,cls,packs){return stockRevision(faction,cls,packs)?.design.hull.points??tuning.hullClasses[cls].points;}
  function totals(){try{const packs=library();for(const side of ['a','b']){
    const total=[...$(`#roster-${side}`).querySelectorAll('input')].reduce((n,input)=>n+(Number(input.value)||0)*price($(`#faction-${side}`).value,input.dataset.class,packs),0);
    $(`#total-${side}`).textContent=total+' points';
  }}catch(error){$('#setup-note').textContent=error.message;}}
  function roster(side){
    const faction=$(`#faction-${side}`).value,packs=library();
    $(`#roster-${side}`).innerHTML=tuning.rosters[faction].map(cls=>{
      const h=tuning.hullClasses[cls];return `<label>${esc(label(cls))}<small>${price(faction,cls,packs)} PT${h.minFleetPoints?' · fleet ≥ '+h.minFleetPoints:''}</small><input aria-label="Side ${side.toUpperCase()} ${esc(label(cls))} count" data-class="${esc(cls)}" type="number" required min="0" max="${h.limit??40}" step="1" value="${cls==='light-cruiser'||cls==='destroyer'?1:0}"></label>`;
    }).join('');$(`#roster-${side}`).oninput=totals;totals();
  }
  for(const side of ['a','b']){
    $(`#faction-${side}`).innerHTML=['EAR','KRE','VRA','ZAN'].map(f=>`<option>${f}</option>`).join('');
    $(`#faction-${side}`).value=side==='a'?'EAR':'KRE';$(`#faction-${side}`).onchange=()=>roster(side);roster(side);
  }
  $('#bundled-scenario').innerHTML=scenarios.map(([file,name])=>`<option value="${file}">${name}</option>`).join('');
  const mode=()=>$('#setup-mode').value;
  function show(){for(const m of ['quick','bundled','authored'])$(`#setup-${m}`).hidden=mode()!==m;}
  $('#setup-mode').onchange=show;show();
  function readEditor(){
    const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)throw new Error('No editor or Drydock scenario in this tab.');
    if(raw.length>16*1024*1024)throw new Error('Stored handoff is too large; export its scenario JSON in the editor.');
    const scenario=JSON.parse(raw)?.meta?.scenario;if(!scenario)throw new Error('The handoff contains no scenario.');
    imported=bounded(scenario);$('#import-note').textContent=`Ready: ${imported.name||'authored engagement'}. Supplied configurations stay pinned.`;
  }
  $('#read-editor').onclick=()=>{try{readEditor();}catch(e){$('#import-note').textContent=e.message;}};
  $('#scenario-file').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{if(file.size>8*1024*1024)throw new Error('Scenario file exceeds 8 MiB');const value=JSON.parse(await file.text());
      if(value.format==='orion-side-record/1')throw new Error('A side record is a history, not a resumable scenario.');
      imported=bounded(value.meta?.scenario??value);$('#import-note').textContent=`Ready: ${imported.name||file.name}. Supplied configurations stay pinned.`;
    }catch(e){imported=null;$('#import-note').textContent=`Import refused: ${e.message}`;}
  };
  const auto=new URLSearchParams(location.search).has('drydock')||new URLSearchParams(location.search).has('scenario');
  if(auto){$('#setup-mode').value='authored';show();try{readEditor();}catch(e){$('#import-note').textContent=e.message;}}
  return {autoStart:new URLSearchParams(location.search).get('drydock')==='session'&&!!imported,
    async build(){
      for(const input of document.querySelectorAll('#trial-setup input:not([type=file])'))if(!input.closest('[hidden]')&&!input.reportValidity())throw new Error('Correct the highlighted setup value.');
      let scenario;
      if(mode()==='quick'){
        scenario={name:`${$('#faction-a').value} vs ${$('#faction-b').value}`,seed:$('#command-seed').value||'orion',
          map:{widthHexes:Number($('#map-width').value),heightHexes:Number($('#map-height').value)},terrain:[],startDistanceHexes:Number($('#start-gap').value),
          sides:['a','b'].map(side=>({faction:$(`#faction-${side}`).value,ships:[...$(`#roster-${side}`).querySelectorAll('input')].flatMap(input=>Array.from({length:Number(input.value)},()=>({className:input.dataset.class})))}))};
      }else if(mode()==='bundled'){
        const file=$('#bundled-scenario').value;if(!scenarios.some(([p])=>p===file))throw new Error('Unknown bundled scenario');
        const r=await fetch('./scenarios/'+file);if(!r.ok)throw new Error('Scenario unavailable');scenario=await r.json();
      }else{if(!imported)throw new Error('Choose a scenario file or read the editor handoff.');scenario=bounded(imported);}
      if($('#command-seed').value)scenario.seed=$('#command-seed').value;
      if(mode()!=='authored')scenario=pinStockRevisions(scenario,library());
      // Vessels are always named. The engine's naming is opt-in and stays that way - it protects
      // determinism and keeps a name out of the recorded state of battles nobody asked to name -
      // but that opt-in belongs at the ENGINE boundary, where the caller decides. Fleet Command is
      // a caller, and it decides yes. It was briefly a checkbox on this screen, which was wrong
      // twice over: a vessel name changes nothing, so offering it as a setting implies consequences
      // it does not have, and a form control is the opposite of the instrument direction.
      return bounded({mode:mode(),side:$('#command-side').value,scenario,nameShips:true});
    }};
}
