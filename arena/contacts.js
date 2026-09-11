import { previewContactOrders } from '../src/captains/preview.js';
import { allHoldOrders } from '../src/captains/orders.js';
import { FACE_NAMES, shipLabel, escapeHTML as esc, format } from './command-model.js';
import { terrainFootprint } from '../src/tactical/deployment.js';
import { layoutContactMap, reportCamera, hexGridCells, hexGridPath } from './contact-map-layout.js';
import { terrainArt, terrainArtDefs, terrainSwatch, TERRAIN_LEGEND } from './contact-terrain-art.js';
import { formationOrders, FORMATION_PRESETS } from './formation-orders.js';
import { effectDefs, effectMarkup, announcement, effectDuration } from './contact-effects.js';
import { createPlayback } from './contact-playback.js';
import { weaponArcMarkup, weaponRangeKey, batteryArcMarkup, batteryRangeKey } from './contact-weapon-arcs.js';
import { DIRS, distance } from '../src/tactical/hex.js';
import { movementRange, movementRangeMarkup } from './contact-movement-range.js';
import { pointDefenceMarkup, pointDefenceUmbrellas, pointDefenceKey } from './contact-point-defence.js';
import { rotationMarkup } from './contact-rotation.js';
import { warpCourseMarkup } from './contact-warp.js';
import { reticleMarkup } from './contact-reticle.js';
import { readinessChanges } from './weapon-readiness.js';
import { debrisMarkup } from './contact-debris.js';
import { torpedoMarkup, torpedoSummary } from './contact-torpedoes.js';
import { HOLD, mountAssignment, setMountAssignment, pruneMountOrders, mountSolutions } from './mount-orders-ui.js';
import { spinalPanel } from './spinal-panel.js';
import { sequenceKeysMarkup } from './console-sequence.js';
import { weaponLabelLayout } from './console-weapon-labels.js';
import { shieldArcMarkup, conditionArcMarkup, contactShieldArcMarkup } from './contact-condition-arcs.js';
import { shadowMarkup, shadowCache } from './terrain-shadow.js';
import { schematicMarkup, headingRoseMarkup, powerBarMarkup, consolePower, mountState, WEAPON_COLOURS } from './console-instruments.js';
const $ = selector => document.querySelector(selector);
const commandMode=document.body.dataset.command==='true';
const consoleMode=commandMode&&!!document.querySelector('#schematic');
// Keep the displayed mount selectable beside the helm, not only in Vessel.
if(!document.querySelector('#arc-mount'))$('#contact-map').insertAdjacentHTML('beforebegin','<div class="map-weapon-controls"><label class="arc-picker">Coverage <select id="arc-mount" aria-label="Weapon arc displayed on map"></select></label><span id="arc-caption" class="instrument-note"></span></div>');
if(!document.querySelector('#range-disclosure'))$('#contact-map').insertAdjacentHTML('beforebegin','<details id="range-disclosure"><summary id="range-summary">Weapon range bands</summary><div id="weapon-range-key" aria-label="Selected weapon range bands"></div></details><p id="movement-range-caption" class="instrument-note"></p>');
const compactRange=matchMedia('(max-width:760px)');
if(!$('#spinal-control'))$('#action-program').insertAdjacentHTML('beforebegin','<section id="spinal-control" aria-label="Spinal cannon controls" hidden></section>');
$('#range-disclosure').open=false;
compactRange.addEventListener('change',e=>{if(e.matches)$('#range-disclosure').open=false;});
let setupReady=null,lastSetup=null,mission=null;
let worker = null, requestId = 0, generation = 0, sessionReady = false;
let icons = {};
const pending = new Map();
const state = { latest:null,current:null,selected:null,orders:{},tape:[],index:0,busy:false,zoom:1,center:{q:0,r:0},mount:null,grid:true,hover:null,focus:null,action:0,actionShip:null };
// Combat presentation: a value-only effects renderer over the supplied projection, and a presentation clock that never touches the engine.
const playback=createPlayback();
const resetPlaybackControls=()=>{const p=$('#playback-pause'),k=$('#playback-skip');if(!p||!k)return;p.disabled=true;k.disabled=true;p.setAttribute('aria-pressed','false');p.textContent='Pause';};
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const nameOf=(frame,id)=>{const v=frame?.observation;const s=v?.own.find(x=>x.id===id)||v?.contacts.find(x=>x.id===id);return s?shipLabel(s):(id||'unknown');};
function announce(text,weight){const el=$('#combat-announce');if(!el)return;el.textContent=text;el.hidden=!text;el.dataset.weight=weight||'minor';}
function liveEffects(markup){const map=$('#contact-map');let g=map.querySelector('#fx-live');if(!g){g=document.createElementNS('http://www.w3.org/2000/svg','g');g.id='fx-live';g.setAttribute('pointer-events','none');map.appendChild(g);}g.innerHTML=markup||'';}
function factionFor(frame,event){const v=frame?.observation;if(!v||!event?.shooterId)return null;const s=v.own.find(x=>x.id===event.shooterId)||v.contacts.find(x=>x.id===event.shooterId);return s?.faction||null;}
function victimFor(frame,event){const own=frame?.observation?.own.find(s=>s.id===event.targetId);return own?{id:own.id,pos:own.pos,facing:own.facing}:null;}
// Text extents measured once per (text, font) on the real SVG, so layout uses actual glyph widths.
const textExtent=new Map();
function measureText(map,font){return text=>{const key=font+'|'+text;if(textExtent.has(key))return textExtent.get(key);let w=text.length*font*.58;try{const t=document.createElementNS('http://www.w3.org/2000/svg','text');t.setAttribute('font-size',font);t.textContent=text;map.appendChild(t);w=t.getComputedTextLength()||w;map.removeChild(t);}catch{}textExtent.set(key,w);return w;};}
const currentShip = () => state.current?.observation.own.find(s=>s.id===state.selected);
// Enemy wrecks stay in the report list as observed debris (destroyed: true). Nothing that targets,
// appraises or reads a live sensor track may see them.
// The size of a ship symbol, in map units: the one figure the hull art, its shield and condition
// rings and the layout footprint all scale from (Chris, 10 September: "ship icons still teeny at
// max zoom ... scale the icons up and down with zoom"). The old rule grew at 1.5 hexes a symbol and
// then stopped dead at a ceiling: rings sprawled over neighbouring hexes at middle zoom, and hulls
// froze small at the top. This grows at every zoom: the legible floor dominates zoomed out, and it
// converges on 0.35 of the hex pitch zoomed in - the most that keeps the outermost ring (a
// contact's scanned-shield ring, at 1.3 symbols) inside its own hex.
const symbolSize=(scale,font)=>Math.hypot(font*1.7,scale*0.35);
// The hull fills its ring: a class of size 1 spans most of the inner ring's diameter (1.9 symbols
// less the ring's width). At 1.0 a hull sat at half the ring's width and read as a dot inside a halo.
const HULL_FILL=1.6;
const liveContacts = view => (view?.contacts??[]).filter(c=>!c.destroyed);
const editable = () => sessionReady && !state.busy && state.index===state.tape.length-1 && !state.latest?.result;
const editableOrder = (ship=currentShip()) => editable() && ship && !ship.destroyed ? state.orders[ship.id] : null;
const idle = () => ({turn:0,forward:0});
const helmWords=t=>t>0?`Port ${t}`:t<0?`Stbd ${-t}`:'Ahead';
const turnWords=(t,long=false)=>t>0?`Port ${t} face${t===1?'':'s'}`:t<0?`Starboard ${-t} face${t===-1?'':'s'}`:long?'Straight ahead':'Ahead';
// A Maneuver starts as a turn in place with nothing set yet (Chris, 10 September), which is the same
// numbers as Hold & fire - so the choice itself is remembered here, on the action object, where the
// engine never sees it. The packet stays exactly the engine's shape.
const maneuvering=new WeakSet();
const planKind=p=>p.scan?'scan':p.warp?'warp':p.turn||p.forward||p.burst||maneuvering.has(p)?'move':'hold';
const planWords=p=>{const k=planKind(p);return k==='scan'?`Scan face ${p.scan}`:k==='warp'?`Warp ${p.forward} hex ahead`:k==='move'?(p.turnAfter&&p.turn?`${p.forward} hex${p.burst?' +'+p.burst+' burst':''} · then ${turnWords(p.turn).toLowerCase()}`:`${turnWords(p.turn)} · ${p.forward} hex${p.burst?' +'+p.burst+' burst':''}`):'Hold & fire';};
const KIND_NAMES={hold:'Hold & fire',move:'Maneuver',scan:'Scan',warp:'Warp'};
const status = text => { $('#trial-status').textContent=text; };
let refusedAt=0;
const orderFeedback = (text='') => { $('#order-feedback').textContent=text;$('#order-feedback').hidden=!text; };
const recentRefusal=()=>performance.now()-refusedAt<1500;
let executePressAt=-1e9,holdExecute=false;
function request(type,payload={}) {
  const id=++requestId;
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({id,type,...payload});});
}
function startWorker() {
  sessionReady=false;
  worker?.terminate();for(const task of pending.values())task.reject(new Error('Session replaced'));pending.clear();
  worker=new Worker(new URL(commandMode?'./command-worker.js':'./contact-worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;pending.delete(data.id);data.ok?task.resolve(data.value):task.reject(new Error(data.error));};
  worker.onerror=()=>{sessionReady=false;for(const task of pending.values())task.reject(new Error('Contact worker unavailable'));pending.clear();render();status('Contact worker unavailable. Start a new engagement.');};
}
async function begin(restart=false) {
  playback.cancel();resetPlaybackControls();liveEffects('');announce('');
  const token=++generation;state.busy=true;$('#begin').disabled=true;
  try {
    const payload=commandMode?{setup:restart?structuredClone(lastSetup):await (await setupReady).build()}:{faction:$('#faction').value,opponent:$('#opponent').value};
    if(token!==generation)return;
    startWorker();status('Establishing a side-bound contact session…');
    const result=await request('start',payload);
    if(token!==generation)return;
    sessionReady=true;
    state.latest=state.current=result.frame;state.tape=[{frame:result.frame,events:[]}];state.index=0;
    state.orders=allHoldOrders(result.frame.observation);
    state.selected=(result.frame.observation.own.find(s=>s.sensors.scan.available)||result.frame.observation.own[0])?.id;
    state.mount=null;state.zoom=1;state.center={q:0,r:0};$('#zoom').value=1;state.busy=false;
    if(commandMode){lastSetup=structuredClone(payload.setup);mission=result.mission;renderMission();}
    document.body.dataset.faction=result.frame.observation.own[0]?.faction||'EAR';$('#trial-setup').hidden=true;$('#contact-station').hidden=false;
    frameReports();
    status('Planning · positions and enemy condition require current reports.');render();
  } catch(error) { if(token===generation){state.busy=false;render();status(error.message);} }
  finally { $('#begin').disabled=false; }
}
function renderMission(){
  if(!commandMode||!mission)return;
  $('#mission-name').textContent=`${mission.name} · ${mission.faction} / Side ${mission.side}`;
  $('#mission-objective').textContent=mission.objective;
  const line=$('#mission-line');if(line)line.textContent=`${mission.name} · ${mission.objective}`;
  $('#command-briefing').hidden=!mission.briefing.length;
  $('#briefing-text').replaceChildren(...mission.briefing.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  $('#mission-warnings').hidden=!mission.warnings.length;
  $('#mission-warnings').textContent=mission.warnings.length?'Authored fleet exception · '+mission.warnings.join(' '):'';
}
function frameReports(){
  const v=state.current?.observation;if(!v)return;
  const camera=reportCamera([...v.own.filter(s=>!s.destroyed),...liveContacts(v)],v.map);
  state.center=camera.center;state.zoom=camera.zoom;$('#zoom').max=12;$('#zoom').value=state.zoom;
}
function picture(index) { state.index=index;state.current=state.tape[index].frame;render(); }
function resetOrders() {
  const fresh=allHoldOrders(state.latest.observation);state.orders=fresh;state.action=0;state.actionShip=null;
  if(!state.latest.observation.own.some(s=>s.id===state.selected&&!s.destroyed))state.selected=state.latest.observation.own.find(s=>!s.destroyed)?.id??state.latest.observation.own[0]?.id;
}
// What a sweep read, in the console's own vocabulary. Never shown without a
// reading: absence of a reading is not "shields up".
function shieldWords(reading){
  const faces=reading.faces.map(f=>{
    if(reading.detail==='points')return `${f.face}: ${f.down?'DOWN':`${Math.round(f.remaining)}/${Math.round(f.capacity)}`}`;
    if(reading.detail==='band')return `${f.face}: ${f.down?'DOWN':`${Math.round(f.remainingFraction.min*100)}-${Math.round(f.remainingFraction.max*100)}%`}`;
    return `${f.face}: ${f.up?'UP':'DOWN'}`;
  }).join(' · ');
  return `Shields ${faces} · read turn ${reading.takenTurn}${reading.stale?` · ${reading.ageTurns} turn(s) old`:' · current'}`;
}
function damageText(report) {
  const d=report.observedDamage;
  return d.detail==='interval'?`${Math.round(d.remainingFraction.min*100)}–${Math.round(d.remainingFraction.max*100)}% hull band`:d.condition.replaceAll('-',' ');
}
function render() {
  if(!state.current)return;const frame=state.current,view=frame.observation;
  $('#clock').textContent=`TURN ${frame.turn} · ${frame.phase==='planning'?'PLANNING':frame.phase.toUpperCase()+(frame.round?' '+frame.round:'')}`;
  const live=liveContacts(view),wrecks=view.contacts.filter(c=>c.destroyed);
  $('#contact-count').textContent=`${live.length} current report${live.length===1?'':'s'}`;
  $('#contacts-list').innerHTML=(live.length?live.map(c=>`<article class="contact-report"><b>${esc(shipLabel(c))} · ${esc(c.faction)}</b><span>${esc(damageText(c))}</span><small>${esc(c.id)} · ${c.pos.q}, ${c.pos.r} · heading ${c.facing}</small><small>Observers: ${c.observers.map(o=>esc(o.observerId)+` / rating ${o.rating} ${o.kind}`).join(', ')}</small><small>${c.shields?esc(shieldWords(c.shields)):'Engineering and shield points: unknown · scan a sector to read shields'}</small></article>`).join(''):'<p>No current enemy reports. Absence is not confirmation of destruction.</p>')
    +wrecks.map(c=>`<article class="contact-report wreck-report"><b>${esc(shipLabel(c))} · ${esc(c.faction)}</b><span>Destroyed · turn ${c.wreckedTurn}</span><small>Debris at ${c.pos.q}, ${c.pos.r}</small></article>`).join('');
  $('#own-vessel').innerHTML=view.own.map(s=>`<option value="${esc(s.id)}">${esc(shipLabel(s))}${s.destroyed?' · DESTROYED':''}</option>`).join('');
  if(!view.own.some(s=>s.id===state.selected))state.selected=view.own[0]?.id;
  $('#own-vessel').value=state.selected;
  renderVessel();renderOrders();drawMap();
  $('#tape').max=Math.max(0,state.tape.length-1);$('#tape').value=state.index;
  $('#tape-label').textContent=`${state.index+1} / ${state.tape.length}`;
  $('#resolve-orders').disabled=!editable();$('#export-contact').disabled=state.busy;
  const scope=$('#execute-scope');if(scope){const living=view.own.filter(s=>!s.destroyed).length;scope.textContent=`Executes the retained plans of all ${living} vessel${living===1?'':'s'}`;}
  if(commandMode){
    $('#restart-command').disabled=state.busy||!lastSetup;
    document.querySelectorAll('[data-command-formation]').forEach(b=>b.disabled=!editable());
    const ownAsset=view.own.find(s=>s.className===mission?.ownProtectedClass);
    $('#mission-own-asset').textContent=ownAsset?`Protect ${shipLabel(ownAsset)} · ${ownAsset.destroyed?'DESTROYED':format(ownAsset.superstructure)+' / '+format(ownAsset.superstructureMax)+' hull'}`:'';
  }
  $('#incoming').textContent=torpedoSummary(view);
  if(frame.result)status(frame.result.victor===view.side?'Battle concluded · YOUR SIDE WINS':frame.result.victor?'Battle concluded · OPPOSING SIDE WINS':'Battle concluded · DRAW');
  const entries=state.tape.slice(0,state.index+1).flatMap((item,index)=>item.events.map(event=>({index,event,frame:item.frame})));
  // The console tape shows three lines. A kill in the turn just resolved stays on it even when later
  // fire would push it off (Chris, 10 September: "enemy destruction is not in the game log").
  let shown=entries.slice(consoleMode?-3:-100);
  if(consoleMode){
    let turnStart=-1;for(let k=state.index-1;k>=0;k--)if(state.tape[k].frame.phase==='planning'){turnStart=k;break;}
    const pinned=new Set(entries.filter(x=>x.event.kind==='destruction'&&x.index>turnStart).slice(-3));
    const room=3-pinned.size,rest=room>0?entries.filter(x=>!pinned.has(x)).slice(-room):[];
    if(pinned.size)shown=entries.filter(x=>pinned.has(x)||rest.includes(x));
  }
  $('#events').innerHTML=shown.map(({event:e,frame:f,index})=>{
    const text=e.kind==='weapon-ready'?`${nameOf(f,e.shipId)} · ${e.weapon} ${e.detail}`:e.kind==='contact-acquired'?`Contact acquired: ${nameOf(f,e.contactId)}`:e.kind==='contact-lost'?`Contact lost: ${nameOf(state.tape[index-1]?.frame??f,e.contactId)}; current position unknown`:
      (()=>{const a=announcement(e,{label:id=>nameOf(f,id)});return `${a.title} · ${a.detail}`;})();
    const weight=e.kind==='weapon-ready'?'ready':['contact-acquired','contact-lost'].includes(e.kind)?'minor':announcement(e,{label:id=>nameOf(f,id)}).weight;
    return `<li data-weight="${weight}">T${f.turn}${f.round?' / A'+f.round:''} · ${esc(text)}</li>`;
  }).join('')||'<li>No side-visible combat events recorded.</li>';
  if(consoleMode){
    $('#history-prev').disabled=state.busy||state.index===0;
    $('#history-next').disabled=state.busy||state.index===state.tape.length-1;
    $('#shield-readouts').innerHTML=currentShip().shields.map(f=>{
      const s=currentShip(),fog=view.terrain.some(t=>t.type==='nebula'&&t.q===s.pos.q&&t.r===s.pos.r)&&view.rules.terrain.nebula.shieldsUseless!==false;
      const absorb=s.destroyed||f.down||fog?0:Math.max(0,Math.floor(Math.min(f.remaining,s.power/f.powerPerDamage)));
      return `<span title="${FACE_NAMES[f.face]} · ${f.powerPerDamage} P per damage">${f.face}: <b>${s.destroyed?'—':f.down?'OFF':format(f.remaining)+'/'+format(f.capacity)}</b><small>${absorb} now</small></span>`;
    }).join('');
  }
}
function renderFleetOrders(){
  if(!commandMode||!state.current)return;
  const historical=state.index!==state.tape.length-1;
  $('#command-fleet-orders').innerHTML=state.current.observation.own.map(s=>`<button data-order-ship="${esc(s.id)}" aria-pressed="${state.selected===s.id}">${esc(shipLabel(s))} · ${s.destroyed?'DESTROYED':historical?'Recorded picture':(state.orders[s.id]?.plan||[]).map((p,i)=>`A${i+1} ${planWords(p)}`).join(' / ')}</button>`).join('');
  $('#command-fleet-orders').querySelectorAll('[data-order-ship]').forEach(b=>b.onclick=()=>{flushPending();state.selected=b.dataset.orderShip;state.mount=null;render();});
}
function renderConsole(s){
  if(!consoleMode)return;
  const view=state.current.observation,order=state.orders[s.id];
  // ship keys: one console key per own vessel
  $('#ship-keys').innerHTML=view.own.map(o=>`<button type="button" class="console-key ship-key" data-ship-key="${esc(o.id)}" aria-pressed="${o.id===state.selected}" ${o.destroyed?'data-lost="true"':''}>${esc(shipLabel(o))}${o.destroyed?' ✕':''}</button>`).join('');
  $('#ship-keys').querySelectorAll('[data-ship-key]').forEach(b=>b.onclick=()=>{if(b.dataset.shipKey===state.selected)return;flushPending();state.selected=b.dataset.shipKey;state.mount=null;render();$('#ship-keys').querySelector(`[data-ship-key="${CSS.escape(state.selected)}"]`)?.focus({preventScroll:true});});
  const cls=$('#vessel-class');if(cls)cls.textContent=`${s.className.replaceAll('-',' ').toUpperCase()} · HDG ${s.facing} · ${s.pos.q}, ${s.pos.r}`;
  // schematic with clickable mount lamps: click isolates that weapon's arc on the map, click again shows the whole battery
  const inFog=view.terrain.some(t=>t.type==='nebula'&&t.q===s.pos.q&&t.r===s.pos.r)&&view.rules.terrain.nebula.shieldsUseless!==false;
  const art=icons[`${s.faction}/${s.className}`]?.file;
  $('#schematic').innerHTML=schematicMarkup(s,{size:300,selectedMount:state.mount,iconHref:art?`../assets/icons/${art}`:null,nebula:inFog});
  $('#schematic').querySelectorAll('[data-mount]').forEach(g=>{g.setAttribute('tabindex','0');g.setAttribute('role','button');const pick=()=>{const m=s.mounts.find(x=>String(x.id)===g.dataset.mount);if(!m)return;state.mount=state.mount===m.id?null:m.id;renderVessel();renderOrders();drawMap();$('#schematic').querySelector(`[data-mount="${CSS.escape(g.dataset.mount)}"]`)?.focus({preventScroll:true});};g.onclick=pick;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};});
  const shown=s.mounts.find(m=>m.id===state.mount);
  $('#range-disclosure').hidden=!shown||s.destroyed;
  $('#arc-caption').textContent=s.destroyed?'Vessel lost':shown?`${shown.displayName||shown.type.replaceAll('-',' ')} · faces ${shown.arc.join(', ')} · ${shown.maxRange} hex · ${mountState(shown,s).label}`:'Whole battery on map · touch a lamp to isolate one weapon';
  // condition readouts
  const cores=s.cores||[],alive=cores.filter(c=>c.alive).length,offline=s.mounts.filter(m=>m.inop).length,down=s.shields.filter(f=>f.down).length;
  const bank=s.spinal?`<div><span>Cannon</span><b>${s.destroyed?'—':s.spinal.state==='ready'?'READY':s.spinal.state==='cooldown'?'VENT '+s.spinal.cooldown:s.spinal.charge>0?'CHG '+format(s.spinal.charge):'COLD'}</b></div>`:'';
  const deck=s.squadrons?`<div><span>Deck</span><b>${s.squadrons.map(q=>format(q.strength)+'/'+format(q.max)).join(' ')}</b></div>`:'';
  // Hull alarms at half and at a quarter (Chris, 10 September 2026). A glyph, a colour and a word, so
  // the state reads without relying on colour alone.
  const hullFrac=Number(s.superstructureMax)>0?Number(s.superstructure)/Number(s.superstructureMax):1;
  const hullAlarm=s.destroyed?null:hullFrac<.25?{cls:'hull-critical',tag:'▲▲ CRITICAL'}:hullFrac<.5?{cls:'hull-damaged',tag:'▲ DAMAGED'}:null;
  $('#condition-readouts').innerHTML=`<div class="${hullAlarm?hullAlarm.cls:''}" ${hullAlarm?`role="alert" aria-label="Hull ${hullAlarm.tag.replace(/▲/g,'').trim().toLowerCase()}: ${format(s.superstructure)} of ${format(s.superstructureMax)}"`:''}><span>Hull${hullAlarm?` <em class="hull-alarm">${hullAlarm.tag}</em>`:''}</span><b>${format(s.superstructure)}<small>/${format(s.superstructureMax)}</small></b></div><div><span>Power</span><b>${format(s.power)}<small>/${format(s.ratedPower)}</small></b></div><div><span>Cores</span><b>${alive}<small>/${cores.length}</small></b></div><div><span>Magazine</span><b>${format(s.magazine)}</b></div><div><span>Sensors</span><b>${s.sensors.operationalRating}<small> ${s.sensors.passiveRadiusHexes}h</small></b></div><div><span>Shields</span><b>${down?down+' DOWN':inFog?'BYPASSED':'UP'}</b></div>${bank}${deck}${offline?`<div><span>Mounts</span><b>${offline} OFF</b></div>`:''}${Object.keys(s.systems||{}).length?`<div><span>Hits</span><b>${Object.entries(s.systems).map(([k,v])=>k+' '+v).join(' ')}</b></div>`:''}`;
  if(s.destroyed)$('#condition-readouts').innerHTML='<strong>VESSEL DESTROYED</strong><span>All systems unavailable</span>';
}
function renderVessel() {
  const s=currentShip();if(!s)return;
  if($('#arc-mount').dataset.coverageOwner!==s.id){$('#arc-mount').dataset.coverageOwner=s.id;$('#range-disclosure').open=false;}
  $('#vessel-title').textContent=shipLabel(s);
  const summary=$('#vessel-summary');if(summary)summary.textContent=s.destroyed?`${shipLabel(s)} · DESTROYED · no orders`:`Hull ${format(s.superstructure)} / ${format(s.superstructureMax)} · power ${format(s.power)} of ${format(s.ratedPower)} rated${s.spinal?'':` · sensors ${s.sensors.operationalRating}`}${s.squadrons?' · flight deck':''}`;
  const dock=$('#dock-ship');if(dock)dock.textContent=shipLabel(s)+(s.destroyed?' · destroyed':'');
  $('#own-telemetry').innerHTML=`<div class="telemetry-grid"><div>Hull<b>${format(s.superstructure)} / ${format(s.superstructureMax)}</b></div><div>Power now<b>${format(s.power)}</b></div><div>Rated output<b>${format(s.ratedPower)}</b></div><div>Magazine<b>${format(s.magazine)}</b></div></div><p class="instrument-note">Sensors: rating ${s.sensors.operationalRating} · ${s.sensors.passiveRadiusHexes} hex passive radius.<br>Scan: ${s.sensors.scan.available?'available':esc(s.sensors.scan.reason)}.<br>${s.destroyed?'VESSEL DESTROYED · all systems unavailable':`Reactor output: ${s.cores.map((c,i)=>`${esc(c.name||'Core '+(i+1))} ${c.alive?format(c.power)+' P':'LOST'}`).join(' · ')}<br>Systems hits: ${Object.entries(s.systems).map(([k,v])=>esc(k)+' '+v).join(', ')||'none'}`}</p>`;
  if(s.spinal)$('#own-telemetry').insertAdjacentHTML('beforeend',`<p class="instrument-note">Cannon bank · ${s.destroyed?'UNAVAILABLE':esc(s.spinal.state)} · charge ${format(s.spinal.charge)} · cooldown ${format(s.spinal.cooldown)} turn(s).</p>`);
  if(s.squadrons)$('#own-telemetry').insertAdjacentHTML('beforeend',`<p class="instrument-note">Flight deck · ${s.squadrons.map(q=>`${esc(q.type)} ${format(q.strength)} / ${format(q.max)} · ${s.destroyed?'UNAVAILABLE':q.launched?esc(q.stance||'launched'):'on deck'}`).join('<br>')}</p>`);
  $('#own-shields').innerHTML=s.shields.map(f=>{
    const absorb=s.destroyed||f.down?0:Math.max(0,Math.floor(Math.min(f.remaining,s.power/f.powerPerDamage)));
    const inFog=state.current.observation.terrain.some(t=>t.type==='nebula'&&t.q===s.pos.q&&t.r===s.pos.r)&&state.current.observation.rules.terrain.nebula.shieldsUseless!==false;
    return `<div class="shield-row"><span>${f.face} · ${FACE_NAMES[f.face]}<br>${f.powerPerDamage} P / damage</span><span>${s.destroyed?'DESTROYED':f.down?'OFFLINE':inFog?'BYPASSED':`${format(f.remaining)} / ${format(f.capacity)}`}<br>${inFog?0:absorb} affordable</span></div>`;
  }).join('');
  if(!s.mounts.some(m=>m.id===state.mount))state.mount=null;
  $('#arc-mount').innerHTML='<option value="">Whole battery · all mounts</option>'+s.mounts.map((m,i)=>`<option value="${esc(m.id)}">${i+1} · ${esc(m.displayName||m.type.replaceAll('-',' '))} · ${m.kind} · faces ${m.arc.join(',')}</option>`).join('');
  $('#arc-mount').value=String(state.mount??'');$('#arc-mount').disabled=s.destroyed||!s.mounts.length;
  if(consoleMode)renderConsole(s);
  const displayed=s.mounts.find(m=>m.id===state.mount);
  if(!consoleMode)$('#arc-caption').textContent=s.destroyed?'Destroyed vessel: no coverage shown.':displayed?`ONE mount: ${displayed.kind} · faces ${displayed.arc.join(', ')} · ${displayed.maxRange} hex · other weapons hidden${displayed.inop?' · OFFLINE':displayed.firedThisTurn?' · SPENT':''}.`:'WHOLE battery · blue beams / amber missiles / violet spinal. Select a mount for its bands.';
  $('#battery').innerHTML=s.mounts.map((m,i)=>`<div class="battery-entry"><button data-mount="${esc(m.id)}" aria-pressed="${state.mount===m.id}">${i+1} · ${esc(m.displayName||m.type.replaceAll('-',' '))}</button><small>${s.destroyed?'Destroyed':m.inop?'Offline':m.firedThisTurn?'Spent this turn':'Online'} · faces ${m.arc.join(',')} · ${m.maxRange} hex<br>${m.kind==='missile'?`${m.weapon.powerToArm} P / shot · shared magazine ${s.magazine}`:m.kind==='spinal'?`${m.weapon.firePower} P / shot · ${esc(s.spinal?.state)}`:`up to ${m.weapon.maxPower} P / shot`} · once per turn</small></div>`).join('');
  $('#battery').querySelectorAll('[data-mount]').forEach(b=>b.onclick=()=>{state.mount=s.mounts.find(m=>String(m.id)===b.dataset.mount)?.id??null;renderVessel();renderOrders();drawMap();});
}
function renderSpinalControls(s,order,enabled){
  $('#spinal-control').hidden=!s.spinal;
  $('#spinal-control').innerHTML=spinalPanel(s,order,state.current.observation,enabled);
  if(consoleMode){
    // The detailed explanation remains available on the trial page. The station
    // already has the live bank, power forecast and firing reason in instruments.
    $('#spinal-control details')?.remove();
    // Keep pending-command and blocked-fire explanations visible. A hover-only
    // reason would make an immobile READY cannon look unresponsive again.
    const note=[...$('#spinal-control').querySelectorAll('p')].map(p=>p.textContent.trim()).filter(Boolean).join(' ');
    $('#spinal-control').querySelectorAll('button').forEach(b=>{b.classList.add('console-key');if(note)b.title=note;});
  }
  $('#spinal-control').querySelectorAll('[data-spinal]').forEach(b=>b.onclick=()=>{
    if(!editableOrder())return;
    if(!flushPending())return;
    if(order.spinal===b.dataset.spinal)delete order.spinal;else order.spinal=b.dataset.spinal;
    renderOrders();drawMap();
    $('#spinal-control').querySelector(`[data-spinal="${b.dataset.spinal}"]`)?.focus();
  });
}
function renderOrders() {
  const s=currentShip();if(!s)return;
  renderFleetOrders();
  if(!recentRefusal())orderFeedback();
  if(state.actionShip!==s.id){state.action=0;state.actionShip=s.id;} // Action 1 only when a different vessel is selected
  const order=state.orders[s.id]??{plan:Array.from({length:state.current.observation.roundsPerTurn},idle),target:'auto',reserve:.3};
  const enabled=editable()&&!s.destroyed;
  renderSpinalControls(s,order,enabled);
  const map=state.current.observation.map,forwardCap=Math.ceil(map.widthHexes+2*map.heightHexes+2);
  // The distance control is capped at what the hull can actually move this turn, shared across its
  // actions - not at the map-geometry ceiling, which let the input run far past the power pool
  // (Chris, 10 September 2026). The engine would clamp it anyway; the control should never offer it.
  const turnCeiling=movementRange(s,order.reserve,order.spinal,true).hexes;
  const forwardMaxFor=i=>Number.isFinite(turnCeiling)
    ?Math.max(0,turnCeiling-order.plan.reduce((n,a,j)=>j===i?n:n+(Number(a.forward)||0),0)):forwardCap;
  $('#priority').innerHTML='<option value="auto">Automatic · current contacts</option>'+liveContacts(state.current.observation).map(c=>`<option value="${esc(c.id)}">${esc(shipLabel(c))} · ${esc(c.id)}</option>`).join('');
  $('#priority').value=liveContacts(state.current.observation).some(c=>c.id===order.target)?order.target:'auto';$('#priority').disabled=!enabled;
  $('#shield-reserve').value=order.reserve;$('#shield-reserve').disabled=!enabled;$('#reserve-readout').textContent=Math.round(order.reserve*100)+'%';
  const forecast=s.destroyed?{valid:false,caveat:'Vessel destroyed; actions unavailable.'}:previewContactOrders(state.current.observation,s.id,pruneMountOrders({...structuredClone(order),target:$('#priority').value},s,state.current.observation));
  $('#preview-caveat').textContent=forecast.caveat||'No valid course preview.';
  if(consoleMode)renderConsoleOrders(s,order,forecast,enabled);
  const active=document.activeElement,restore=active?.dataset.field?{field:active.dataset.field}:active?.dataset.actionTab!==undefined?{tab:true}:active?.dataset.helm?{helm:active.dataset.helm}:null;
  const program=$('#action-program');
  // The trial page has no tab strip or summary in its markup; give it the same controls without touching its HTML.
  if(!$('#action-tabs')){const t=document.createElement('div');t.id='action-tabs';t.setAttribute('role','tablist');program.before(t);}
  if(!$('#plan-summary')){const l=document.createElement('ol');l.id='plan-summary';program.after(l);}
  state.action=Math.min(Math.max(0,state.action),order.plan.length-1);
  $('#action-tabs').setAttribute('role',consoleMode?'group':'tablist');
  $('#action-tabs').innerHTML=order.plan.map((p,i)=>`<button type="button" role="${consoleMode?'button':'tab'}" data-action-tab="${i}" ${consoleMode?'aria-pressed':'aria-selected'}="${i===state.action}" ${enabled?'':'disabled'}><b>ACTION ${i+1}</b>${esc(planWords(p))}</button>`).join('');
  $('#action-tabs').querySelectorAll('[data-action-tab]').forEach(b=>b.onclick=()=>{if(state.action===Number(b.dataset.actionTab))return;flushPending();state.action=Number(b.dataset.actionTab);renderOrders();drawMap();});
  const i=state.action,p=order.plan[i],kind=planKind(p),f=forecast.actions?.[i];
  const attr=field=>`data-round="${i}" data-field="${field}" ${enabled?'':'disabled'}`;
  const helm=(name,label,title)=>`<button type="button" data-helm="${name}" title="${title}" ${enabled?'':'disabled'}>${label}</button>`;
  program.innerHTML=`<fieldset class="action-card"><legend>ACTION ${i+1} OF ${order.plan.length}</legend><label>Assignment <select ${attr('kind')} aria-label="Action ${i+1} assignment"><option value="hold">Hold &amp; fire</option><option value="move">Maneuver</option>${s.sensors.scan.available||p.scan?'<option value="scan">Scan one face</option>':''}${s.specials.warp?'<option value="warp">Warp insertion</option>':''}</select></label>${kind==='warp'?`<div class="helm-row warp-row"><span>Warp<output data-readout="forward">${p.forward} of ${s.specials.warp?.rangeHexes??0}</output></span>${helm('forward-dec','−','One hex less')}<input type="number" min="1" max="${s.specials.warp?.rangeHexes??1}" step="1" value="${p.forward}" ${attr('forward')} aria-label="Warp distance in hexes, straight ahead">${helm('forward-inc','+','One hex more')}</div>`:''}<div ${kind==='move'?'':'hidden'}><div class="helm-row"><span>Helm<output id="helm-heading" title="Up to ${s.turnRate} face${s.turnRate===1?'':'s'} per action">${esc(helmWords(p.turn))}</output></span>${helm('port','Port','Turn one face to port')}<input type="number" min="${-s.turnRate}" max="${s.turnRate}" step="1" value="${p.turn}" ${attr('turn')} aria-label="Turn in faces, positive is port">${helm('starboard','Stbd','Turn one face to starboard')}</div><div class="helm-row"><span>Distance<output data-readout="forward">${p.forward} of ${forwardMaxFor(i)}</output></span>${helm('forward-dec','−','One hex less')}<input type="number" min="0" max="${forwardMaxFor(i)}" step="1" value="${p.forward}" ${attr('forward')} aria-label="Forward distance in hexes">${helm('forward-inc','+','One hex more')}</div>${s.specials.burst?`<div class="helm-row"><span>Burst<output>${p.burst||0} of ${s.specials.burst.maxExtraHexes}</output></span>${helm('burst-dec','−','One burst hex less')}<input type="number" min="0" max="${s.specials.burst.maxExtraHexes}" step="1" value="${p.burst||0}" ${attr('burst')} aria-label="Free burst hexes">${helm('burst-inc','+','One burst hex more')}</div>`:''}</div><label ${kind==='scan'?'':'hidden'}>Scan sector <select ${attr('scan')}>${[1,2,3,4,5,6].map(face=>`<option value="${face}" ${p.scan===face?'selected':''}>${face} · ${FACE_NAMES[face]}</option>`).join('')}</select></label><p class="result">${f?.end?`End ≤ (${f.end.q}, ${f.end.r}) · heading ${f.end.facing}<br>Power ceiling ${format(f.powerCeiling)}`:'Course unresolved'}${kind==='scan'?`<br>Face ${p.scan} · 1 action · 0 extra power`:''}</p><p class="instrument-note">${esc(f?.notes.join(' ')||'')}${kind==='hold'&&f?`<br>${f.mounts.filter(m=>m.contacts.length).length} mounts with geometry to current reports; no hit or fire guarantee.`:''}</p></fieldset>`;
  program.querySelector('[data-field=kind]').value=kind;
  if(consoleMode){
    const kindSel=program.querySelector('[data-field=kind]');
    const keys=[['hold','Hold & fire'],['move','Maneuver'],...(s.sensors.scan.available||p.scan?[['scan','Scan']]:[]),...(s.specials.warp?[['warp','Warp']]:[])];
    kindSel.closest('label').insertAdjacentHTML('beforebegin',`<div class="key-row assign-keys" role="group" aria-label="Action ${i+1} assignment">${keys.map(([v,l])=>`<button type="button" class="console-key" data-assign="${v}" aria-pressed="${kind===v}" ${enabled?'':'disabled'}>${l}</button>`).join('')}</div>`);
    kindSel.closest('label').classList.add('compat');
    program.querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>{if(kindSel.value===b.dataset.assign)return;kindSel.value=b.dataset.assign;kindSel.onchange();$('#action-program [data-assign="'+b.dataset.assign+'"]')?.focus({preventScroll:true});});
    const scanSel=program.querySelector('[data-field=scan]');
    if(scanSel&&kind==='scan'){scanSel.closest('label').insertAdjacentHTML('beforebegin',`<div class="key-row scan-keys" role="group" aria-label="Scan face">${[1,2,3,4,5,6].map(face=>`<button type="button" class="console-key" data-scan-face="${face}" aria-pressed="${p.scan===face}" ${enabled?'':'disabled'} title="${FACE_NAMES[face]}">${face}</button>`).join('')}</div>`);scanSel.closest('label').classList.add('compat');program.querySelectorAll('[data-scan-face]').forEach(b=>b.onclick=()=>{scanSel.value=b.dataset.scanFace;scanSel.onchange();renderOrders();$('#action-program [data-scan-face="'+b.dataset.scanFace+'"]')?.focus({preventScroll:true});});}
  }
  const apply=input=>{
    const o=editableOrder(s);if(input.disabled||s.id!==state.selected||!o)return false;
    orderFeedback();
    const round=Number(input.dataset.round),field=input.dataset.field;
    if(input.type==='number'){
      if(!commitNumericOrder(input,o))return false;
    }
    else if(!input.reportValidity())return false;
    else if(field==='scan')o.plan[round].scan=Number(input.value);
    if(field==='kind'){o.plan[round]=input.value==='scan'?{...idle(),scan:2}:input.value==='warp'?{turn:0,forward:s.specials.warp?.rangeHexes??1,warp:true}:input.value==='move'?{turn:0,forward:0}:idle();if(input.value==='move')maneuvering.add(o.plan[round]);} // turn in place by default: a forced forward step made every turn a turn-and-move (Chris, 10 Sept)
    if(field==='kind')renderOrders();
    else refreshPreview(); // Keep the edited control in the DOM through Tab/blur.
    drawMap();return true;
  };
  program.querySelectorAll('[data-field]').forEach(input=>input.onchange=()=>apply(input));
  // Helm buttons drive the same numeric controls through the same validation path: no second order model.
  program.querySelectorAll('[data-helm]').forEach(b=>b.onclick=()=>{
    const [field,dir]={port:['turn',1],starboard:['turn',-1],'forward-dec':['forward',-1],'forward-inc':['forward',1],'burst-dec':['burst',-1],'burst-inc':['burst',1]}[b.dataset.helm];
    const input=program.querySelector(`[data-field=${field}]`);if(!input||input.disabled)return;
    const next=Math.max(Number(input.min),Math.min(Number(input.max),(Number.isFinite(input.valueAsNumber)?input.valueAsNumber:0)+dir));
    if(next===Number(input.value)&&Number.isFinite(input.valueAsNumber)){orderFeedback(`Action ${i+1}: ${field==='turn'?'turn':field} is already at its limit (${input.min} to ${input.max}).`);return;}
    input.value=String(next);if(apply(input))renderOrders(); // rerender keeps the same action; focus returns to the button
  });
  renderPlanSummary(order,forecast);
  if(restore?.field)program.querySelector(`[data-field="${restore.field}"]`)?.focus({preventScroll:true});
  else if(restore?.helm)program.querySelector(`[data-helm="${restore.helm}"]`)?.focus({preventScroll:true});
  else if(restore?.tab)$('#action-tabs').querySelector(`[data-action-tab="${state.action}"]`)?.focus({preventScroll:true});
}
function renderConsoleOrders(s,order,forecast,enabled){
  const view=state.current.observation;
  $('#power-well').innerHTML=powerBarMarkup({...consolePower(s,order,forecast),width:460})+`<div class="reserve-keys" role="group" aria-label="Defence reserve"><span>Reserve floor</span><button class="console-key" data-reserve-step="-1" aria-label="Reduce reserve by five percent" ${enabled?'':'disabled'}>−</button><output>${Math.round((order.reserve??0)*100)}%</output><button class="console-key" data-reserve-step="1" aria-label="Increase reserve by five percent" ${enabled?'':'disabled'}>+</button></div>`;
  $('#power-well').querySelectorAll('[data-reserve-step]').forEach(b=>b.onclick=()=>{
    const o=editableOrder(s);if(!o||!flushPending())return;
    o.reserve=Math.max(0,Math.min(20,Math.round(o.reserve*20)+Number(b.dataset.reserveStep)))/20;
    renderOrders();drawMap();$('#power-well [data-reserve-step="'+b.dataset.reserveStep+'"]')?.focus({preventScroll:true});
  });
  // heading rose: current heading, planned heading after the active action; petals within the turn rate set the turn
  const i=state.action,p=order.plan[i],f=forecast?.actions?.[i],planned=f?.end?.facing??null;
  const startFacing=f?.start?.facing??s.facing;
  $('#heading-rose').innerHTML=headingRoseMarkup({facing:s.facing,startFacing,plannedFacing:planned,turnRate:s.turnRate,size:150});
  $('#heading-rose').querySelectorAll('[data-heading-dir]').forEach(el=>{const dir=Number(el.dataset.headingDir);let turn=((dir-startFacing)%6+6)%6;if(turn>3)turn-=6;const ok=enabled&&Math.abs(turn)<=s.turnRate;el.setAttribute('tabindex',ok?'0':'-1');el.setAttribute('role','button');el.setAttribute('aria-disabled',String(!ok));const go=()=>{if(!ok)return;const kindSel=$('#action-program [data-field=kind]');if(kindSel&&kindSel.value!=='move'){kindSel.value='move';kindSel.onchange();}const input=$('#action-program [data-field=turn]');if(!input)return;input.value=String(turn);input.onchange();renderOrders();};el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
  // Sequence keys beside the rose: turn before or after the run (Chris, 10 September 2026). Strict in
  // the engine: only an ordinary maneuver carries it, and it is present-and-true or absent, never false.
  const seq=$('#sequence-keys');
  if(seq){seq.innerHTML=sequenceKeysMarkup(p,planKind(p),enabled);
    seq.querySelectorAll('[data-sequence]').forEach(b=>b.onclick=()=>{
      const o=editableOrder(s);if(!o||!flushPending())return;const a=o.plan[state.action];if(planKind(a)!=='move')return;
      if(b.dataset.sequence==='run-first')a.turnAfter=true;else delete a.turnAfter;
      renderOrders();drawMap();$('#sequence-keys [data-sequence="'+b.dataset.sequence+'"]')?.focus({preventScroll:true});});}
  // A warp reads as where it lands, or why it will not: a refused warp used to be silent (10 Sept).
  const warpNote=planKind(p)==='warp'?((f?.notes||[]).find(n=>/refused/.test(n))||''):'';
  $('#course-readout').innerHTML=planKind(p)==='warp'?`A${i+1} · <b>${esc(planWords(p))}</b><br>${warpNote?`<span class="warp-refused">${esc(warpNote)}</span>`:f?.end?`lands ${f.end.q}, ${f.end.r} · hdg ${f.end.facing} · ${s.specials.warp.powerCost} P`:''}`:f?.end?`A${i+1} · ${p.turnAfter&&p.turn?`<b>${p.forward} hex${p.burst?' +'+p.burst:''}</b> · then ${turnWords(p.turn).toLowerCase()}`:`<b>${turnWords(p.turn,true)}</b> · ${p.forward} hex${p.burst?' +'+p.burst:''}`}<br>ends ${f.end.q}, ${f.end.r} · hdg ${f.end.facing} · ceiling ${format(f.powerCeiling)} P`:`A${i+1} · <b>${esc(planWords(p))}</b><br>${esc((f?.notes||[]).find(n=>/clamped|unresolved/.test(n))||'')}`;
  // Target keys. With no weapon isolated they set the SHIP's priority, as before. With a weapon lamp
  // touched they assign THAT mount: its own contact, HOLD FIRE, or back to the ship's priority
  // (Chris, 10 September 2026: "per-weapon target assignment and hold fire"). Live reports only -
  // a wreck is debris, not a target.
  const live=liveContacts(view),well=$('#target-keys').closest('.instrument-well');
  const mount=s.mounts.find(m=>m.id===state.mount),mountName=m=>`${s.mounts.indexOf(m)+1} · ${m.displayName||m.type.replaceAll('-',' ')}`;
  const contactKey=(c,pressed)=>`<button type="button" class="console-key target-key" data-target-key="${esc(c.id)}" aria-pressed="${pressed}" ${enabled?'':'disabled'} title="${esc(damageText(c))}">${esc(shipLabel(c))}<small>${esc(c.faction)} · ${distance(s.pos,c.pos)} hex</small></button>`;
  if(mount){
    const assigned=mountAssignment(order,mount.id),pick=assigned===HOLD?HOLD:live.some(c=>c.id===assigned)?assigned:'auto';
    if(well){well.dataset.label=`TARGET · WEAPON ${mountName(mount).toUpperCase()}`;well.title='Touch the lamp again to return to the ship priority';}
    $('#target-keys').innerHTML=`<button type="button" class="console-key" data-target-key="auto" aria-pressed="${pick==='auto'}" ${enabled?'':'disabled'} title="This weapon engages the ship's priority target">Ship priority</button>`
      +`<button type="button" class="console-key hold-key" data-target-key="${HOLD}" aria-pressed="${pick===HOLD}" ${enabled?'':'disabled'} title="This weapon does not fire this turn">Hold fire</button>`
      +live.map(c=>contactKey(c,pick===c.id)).join('');
  }else{
    if(well){well.dataset.label='TARGET · PREFERENCE';well.title='Touch a weapon lamp to give that weapon its own target or hold its fire';}
    const target=live.some(c=>c.id===order.target)?order.target:'auto';
    $('#target-keys').innerHTML=`<button type="button" class="console-key" data-target-key="auto" aria-pressed="${target==='auto'}" ${enabled?'':'disabled'}>Auto</button>`+live.map(c=>contactKey(c,target===c.id)).join('')
      +(live.length?'':'<span class="instrument-note">No current reports</span>');
    // No caption: each weapon's own assignment already reads on the map (HOLD FIRE / TARGET LOCKED
    // beside the mount, a dotted line to its target) and in the range key.
  }
  $('#target-keys').querySelectorAll('[data-target-key]').forEach(b=>b.onclick=()=>{
    const o=editableOrder(s);if(!o)return;const key=b.dataset.targetKey;
    if(mount)setMountAssignment(o,mount.id,key==='auto'?null:key);
    else{o.target=key;$('#priority').value=o.target;}
    renderOrders();drawMap();$('#target-keys').querySelector(`[data-target-key="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  });
  $('#formation-note').textContent=$('#formation-note').textContent||'';
}
// Typed values that have not fired change yet are committed (or refused with feedback) before the active card is
// replaced by a ship or action switch, so a valid edit is never silently lost and a stale one never lingers.
function flushPending(){
  const s=currentShip(),o=editableOrder(s);if(!o)return true;let ok=true;
  for(const input of $('#action-program').querySelectorAll('input[type=number]')){
    if(input.disabled||input.closest('[hidden]'))continue;
    const round=Number(input.dataset.round),field=input.dataset.field,current=o.plan[round][field]??0;
    if(input.value===String(current))continue;
    if(!commitNumericOrder(input,o))ok=false;
  }
  return ok;
}
function renderPlanSummary(order,forecast){
  const list=$('#plan-summary');if(!list)return;
  list.innerHTML=order.plan.map((p,i)=>{const f=forecast?.actions?.[i];return `<li ${i===state.action?'aria-current="true"':''}><b>A${i+1} · ${esc(KIND_NAMES[planKind(p)])}</b> · ${esc(planWords(p))}${f?.end?` · ends ≤ (${f.end.q}, ${f.end.r}) hdg ${f.end.facing}`:planKind(p)==='hold'?'':' · unresolved'}</li>`;}).join('');
}
function commitNumericOrder(input,order) {
  const round=Number(input.dataset.round),field=input.dataset.field,n=input.valueAsNumber;
  if(!input.checkValidity()||!Number.isSafeInteger(n)){
    // Never leave a rejected draft displayed above a different accepted plan.
    // Restore in place, so blur/Tab does not replace the control or steal focus.
    input.value=String(order.plan[round][field]??0);
    const label={turn:'Turn',forward:'Forward',burst:'Free burst'}[field];
    const message=`Action ${round+1}: ${label} must be a whole number from ${input.min} to ${input.max}. Restored ${input.value}; orders unchanged.`;
    status(message);orderFeedback(message);refusedAt=performance.now();if(performance.now()-executePressAt<400)holdExecute=true;
    return false;
  }
  if(field==='burst'&&n===0)delete order.plan[round].burst;
  else order.plan[round][field]=n;
  return true;
}
function refreshPreview() {
  // Reserve and target changes must refresh the cannon's power explanation too.
  if(currentShip()?.spinal)renderSpinalControls(currentShip(),state.orders[state.selected],editable()&&!currentShip().destroyed);
  renderFleetOrders();
  const ship=currentShip(),order=state.orders[ship?.id];if(!ship||!order||ship.destroyed)return;
  const forecast=previewContactOrders(state.current.observation,ship.id,pruneMountOrders({...structuredClone(order),target:$('#priority').value},ship,state.current.observation));
  $('#preview-caveat').textContent=forecast.caveat||'No valid course preview.';
  const card=$('#action-program').querySelector('.action-card'),i=state.action,f=forecast.actions?.[i],p=order.plan[i];
  if(card){
    card.querySelector('.result').innerHTML=f?.end?`End ≤ (${f.end.q}, ${f.end.r}) · heading ${f.end.facing}<br>Power ceiling ${format(f.powerCeiling)}${f.kind==='scan'?`<br>Face ${f.scan} · 1 action · 0 extra power`:''}`:'Course unresolved';
    card.querySelector('.instrument-note').textContent=f?.notes.join(' ')||'';
    const heading=card.querySelector('#helm-heading');if(heading)heading.textContent=helmWords(p.turn);
    const dist=card.querySelector('[data-readout=forward]');if(dist)dist.textContent=`${p.forward} of ${card.querySelector('[data-field=forward]')?.max??p.forward}`;
  }
  $('#action-tabs')?.querySelectorAll('[data-action-tab]').forEach((b,k)=>{b.innerHTML=`<b>ACTION ${k+1}</b>${esc(planWords(order.plan[k]))}`;});
  renderPlanSummary(order,forecast);
  if(consoleMode)renderConsoleOrders(ship,order,forecast,editable()&&!ship.destroyed);
}
// Weapon names share the existing ship/course occupancy; coverage is unchanged.
function weaponLabels(ship,mounts,{project,scale,font,layout,solutions=null}){
  const occupied=[...layout.markers.map(m=>m.box),...layout.labels.map(l=>l.box),...layout.course.map(c=>c.box)];
  const placed=weaponLabelLayout(ship,mounts,{project,scale,font,measure:measureText($('#contact-map'),font*.9),occupied,annotate:m=>solutions?.get?.(m.id)?.short||'',arcs:state.current?.observation?.rules?.arcs||null});
  return placed.labels.map(({mount:m,text,full,box:b})=>{
    const colour=WEAPON_COLOURS[m.kind]||'#8ec6dc',st=mountState(m,ship);
    const fx=solutions?.get?.(m.id);
    return `<g class="weapon-label" data-weapon-label="${esc(m.id)}" data-fire-state="${esc(fx?.state||'none')}" pointer-events="none"><title>${esc(full+' · '+st.label+(fx&&fx.state!=='none'?' · '+fx.full:''))}</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#060e15" fill-opacity=".8"/><text x="${b.x+b.w/2}" y="${b.y+b.h*.72}" text-anchor="middle" font-size="${font*.9}" fill="${colour}">${esc(text)}</text></g>`;
  }).join('');
}
let shadowStore=null;
function drawMap() {
  const view=state.current?.observation;if(!view)return;
  const map=$('#contact-map'),w=900,h=520,scale=Math.min(w/(view.map.widthHexes+8),h/(view.map.heightHexes+6))*state.zoom;
  const xy=p=>({x:w/2+((p.q-state.center.q)+(p.r-state.center.r)/2)*scale,y:h/2+(p.r-state.center.r)*scale*.866});
  // Screen-scale typography: about 12 px on screen whatever the rendered width,
  // expressed in viewBox units. Icons follow the type size, never the board.
  const clientWidth=Math.max(240,map.clientWidth||900),font=Math.max(9,Math.min(30,12.5*w/clientWidth));
  // Type stays screen-scaled. Symbols do NOT: see symbolSize - a legible floor zoomed out, the hex
  // itself zoomed in.
  const icon=symbolSize(scale,font);
  let svg=terrainArtDefs(scale);
  const mapCells=hexGridCells(view.map,{center:state.center,scale,width:w,height:h});
  if(state.grid){
    const cells=mapCells;
    if(cells.length<=6000)svg+=`<path data-hex-grid="true" d="${hexGridPath(cells,xy,scale)}" fill="none" stroke="#8ec6dc" stroke-opacity="${scale<8?.08:.16}" stroke-width="${scale<8?.6:1}"/>`;
  }
  const own=currentShip(),order=state.orders[own?.id];let preview=null;
  // Terrain shadow for the SELECTED hull, drawn UNDER the terrain that casts it:
  // the bodies and fields are known and stay crisp, and only the space they
  // hide goes dark. Own ships still draw inside it - this says where no report
  // can come from, not where the board stops existing.
  if(own&&!own.destroyed&&mapCells.length<=6000){
    const key=`${own.pos.q},${own.pos.r}`;
    if(!shadowStore||shadowStore.from!==key)shadowStore=shadowCache(own.pos);
    svg+=shadowMarkup(own,view,mapCells,{project:xy,scale,cache:shadowStore});
  }
  svg+=terrainArt(view.terrain,{project:xy,scale,footprint:terrainFootprint});
  const movement=editable()&&own&&order?movementRange(own,order.reserve,order.spinal,true):null;
  $('#movement-range-caption').textContent=movement?(movement.label||movement.reason):'';
  $('#movement-range-caption').title=movement?.reason||'';
  if(movement)svg+=movementRangeMarkup(own,movement,xy,scale);
  // Every own umbrella, always - not just the selected hull's. The hulls that carry no point
  // defence are exactly the ones whose cover the player needs to see.
  const umbrellas=pointDefenceUmbrellas(view.own,view.rules.pointDefence?.rangeHexes);
  svg+=pointDefenceMarkup(view.own,{project:xy,scale,rangeHexes:view.rules.pointDefence?.rangeHexes,selectedId:own?.id??null});
  const shownMount=own?.mounts.find(m=>m.id===state.mount);
  $('#range-summary').textContent=(shownMount?`ONE mount ${shownMount.id} · ${shownMount.displayName||shownMount.type.replaceAll('-',' ')} · ${shownMount.kind} · ${shownMount.maxRange} hex · Range bands`:'WHOLE battery · blue beams / amber missiles / violet spinal · Weapons & ranges')+(mapCells.length>6000?' · zoom in for coverage':'');
  if(own&&order&&editable()&&!own.destroyed){
    const p=preview=previewContactOrders(view,own.id,pruneMountOrders({...structuredClone(order),target:liveContacts(view).some(c=>c.id===order.target)?order.target:'auto'},own,view));
    if(p.route?.length>1)svg+=`<polyline points="${p.route.map(p=>{const q=xy(p);return q.x+','+q.y;}).join(' ')}" fill="none" stroke="#efb773" stroke-width="2.5" stroke-dasharray="6 5"/>`;
    // A turn in place has no travel line to draw, so it gets its own mark.
    svg+=rotationMarkup(p.actions,{project:xy,scale});
    // A warp is a jump, not a track: its own mark, from where it leaves to the hex it lands in.
    svg+=warpCourseMarkup(p.actions,{project:xy,scale});
  }
  // Why each mount is dark against the CHOSEN contact. Own telemetry and the
  // current report only; never a firing solution. The budget is what the plan
  // leaves for weapons once refill, cannon charge, helm and the floor are met.
  const preferredContact=order?.target&&order.target!=='auto'?liveContacts(view).find(c=>c.id===order.target):null;
  let solutions=null;
  if(own&&!own.destroyed&&order){
    const p=consolePower(own,order,preview);
    const budget=Math.max(0,p.pool-p.charge-(p.helm??0)-p.reserve);
    // Each mount against the contact IT will engage: its own assignment, else the ship's priority.
    solutions=mountSolutions(own,order,view,budget);
  }
  $('#weapon-range-key').innerHTML=own?.destroyed?'':(shownMount?weaponRangeKey(shownMount):batteryRangeKey(own,solutions))+pointDefenceKey(own,umbrellas)+(view.rules.movement.sameHexNoFire?'<span class="range-limit">Same hex: no fire.</span>':'');
  if(mapCells.length<=6000)svg+=shownMount?weaponArcMarkup(own,shownMount,{project:xy,scale,cells:mapCells}):batteryArcMarkup(own,{project:xy,scale,cells:mapCells});
  if(own&&!own.destroyed){
    const a=xy(own.pos),d=DIRS[own.facing],b=xy({q:own.pos.q+d.q*.85,r:own.pos.r+d.r*.85});
    svg+=`<path class="leader" data-bow="${own.facing}" d="M${a.x},${a.y}L${b.x},${b.y}" stroke="#fff" stroke-width="2.5"><title>Bow / forward</title></path><circle class="leader" cx="${b.x}" cy="${b.y}" r="2.5" fill="#fff"/>`;
    // A weapon given its own target draws a thin line to it in the weapon's colour.
    if(order?.mountOrders)for(const [id,assigned] of Object.entries(order.mountOrders)){
      const m=own.mounts.find(x=>String(x.id)===id),c=assigned!==HOLD&&liveContacts(view).find(x=>x.id===assigned);if(!m||!c)continue;
      const t=xy(c.pos);svg+=`<line class="mount-assignment" data-mount-assignment="${esc(id)}" x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="${WEAPON_COLOURS[m.kind]||'#8ec6dc'}" stroke-opacity=".55" stroke-width="1.2" stroke-dasharray="1 3" pointer-events="none"/>`;
    }
  }
  // Torpedoes in flight, as far as this side may know them.
  svg+=torpedoMarkup(view,{project:xy,scale,icon});
  // Recorded events of the chosen frame as stable markers (the same renderer at rest), never geometry beyond the supplied endpoints.
  svg+=effectDefs();
  const frameNow=state.tape[state.index]?.frame;
  (state.tape[state.index]?.events||[]).forEach((event,i)=>{svg+=`<g class="fx-static" pointer-events="none">${effectMarkup(event,{project:xy,scale,icon,phase:1,reduced:true,victim:victimFor(frameNow,event),faction:factionFor(frameNow,event),seed:String(i)})}</g>`;});
  const priorityTarget=order?.target&&order.target!=='auto'?order.target:null;
  const layout=layoutContactMap([...view.own,...view.contacts],preview?.actions,{project:xy,width:w,height:h,font,icon,label:s=>shipLabel(s)+(s.destroyed?' / lost':s.spinal&&(s.spinal.charge>0||s.spinal.state==='ready')?' · LOCKED':''),measure:measureText(map,font),priority:{selected:state.selected,target:priorityTarget}});
  // Planning preference only, never a firing solution or a historical order.
  // Both endpoints must be current, visible markers from this projection.
  const preferred=editable()&&!own?.destroyed&&liveContacts(view).some(c=>c.id===priorityTarget)
    ?layout.markers.find(m=>m.ship.id===priorityTarget):null;
  const origin=preferred?layout.markers.find(m=>m.ship.id===own?.id):null;
  if(origin&&preferred){
    svg+=`<g class="target-preference" data-target-preference="${esc(priorityTarget)}" role="img" aria-label="Preferred target; not a firing solution"><title>Preferred target; not a firing solution</title><line x1="${origin.anchor.x}" y1="${origin.anchor.y}" x2="${preferred.anchor.x}" y2="${preferred.anchor.y}"/><circle cx="${preferred.x}" cy="${preferred.y}" r="${icon*.8}"/></g>`;
  }
  const liveNow=liveContacts(view),outside=liveNow.filter(s=>!layout.markers.some(m=>m.ship.id===s.id)).length;
  const deferredNames=layout.deferred.filter(d=>!d.course).length;
  $('#contact-count').textContent=`${liveNow.length} current report${liveNow.length===1?'':'s'}${outside?' · '+outside+' outside view — Frame reports':''}${deferredNames?' · '+deferredNames+' name'+(deferredNames===1?'':'s')+' deferred (focus or select a marker)':''}${origin&&preferred?' · Dashed link: preferred target, not a firing solution':''}`;
  // One pass for every ring, under all symbols and labels: at high zoom a
  // later ship's ring would otherwise cover an earlier ship's name.
  for(const marker of layout.markers){
    const s=marker.ship;if(s.destroyed)continue;
    const ring={project:xy,scale,at:{x:marker.x,y:marker.y},radius:icon*.95,width:Math.max(1.5,icon*.16)};
    if(view.own.some(o=>o.id===s.id))svg+=shieldArcMarkup(s,ring);
    // A contact shows hull always, and scanned shields on an outer ring when a
    // sweep has read them - dashed and dimmed once the reading is stale.
    else svg+=conditionArcMarkup(s,ring)+contactShieldArcMarkup(s,{...ring,radius:icon*1.3,width:Math.max(1.2,icon*.12)});
  }
  if(consoleMode&&own&&!own.destroyed&&mapCells.length<=6000)svg+=weaponLabels(own,shownMount?[shownMount]:own.mounts,{project:xy,scale,font,layout,solutions});
  const tag=(entry,kind,color)=>{const b=entry.box;return `<rect data-map-label="${kind}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2" fill="#060e15" fill-opacity=".92" stroke="${color}" stroke-opacity="${entry.primary?.7:.3}"/><text x="${b.x+b.w/2}" y="${b.y+b.h-Math.max(2,font*.28)}" fill="${color}" font-size="${font}" text-anchor="middle">${esc(entry.text)}</text>`;};
  // Own hull only: superstructure is own telemetry. A contact's condition is an
  // interval or an ordinal bracket and is drawn as its ring, never as a bar.
  const hullBar=(entry,ship)=>{
    const max=Number(ship.superstructureMax),now=Number(ship.superstructure);
    if(!(max>0)||!Number.isFinite(now))return '';
    const b=entry.box,ratio=Math.max(0,Math.min(1,now/max));
    const height=Math.max(2,font*.22),y=b.y+b.h+Math.max(1,font*.1);
    const colour=ratio<=.25?'#ffafa2':ratio<=.5?'#efb773':'#7bc6ec';
    return `<g class="hull-bar" data-hull-bar="${esc(ship.id)}" data-hull-ratio="${ratio.toFixed(3)}" pointer-events="none">`
      +`<title>Hull ${Math.round(now)} of ${Math.round(max)}</title>`
      +`<rect x="${b.x}" y="${y.toFixed(2)}" width="${b.w}" height="${height.toFixed(2)}" fill="#0b1620" stroke="#43535d" stroke-opacity=".5" stroke-width=".5"/>`
      +(ratio>0?`<rect x="${b.x}" y="${y.toFixed(2)}" width="${(b.w*ratio).toFixed(2)}" height="${height.toFixed(2)}" fill="${colour}"/>`:'')
      +`</g>`;
  };
  for(const marker of layout.markers){
    const s=marker.ship,p=marker,isOwn=view.own.some(o=>o.id===s.id),selected=s.id===state.selected;
    // The map token takes the _map variant where one exists: same silhouette, no
    // fold lines - invisible at 28px and roughly four times the file. Falls back to
    // the console art for every class still on a placeholder.
    const entry=icons[`${s.faction}/${s.className}`],art=entry?.mapFile??entry?.file;
    // A framed glyph is traced to fill its viewBox, so class scale is not in the
    // artwork and must be applied here. A placeholder already carries its own
    // scale - the ladder is the manifest's own size values - so it is drawn as-is.
    const artIcon=icon*HULL_FILL*(entry?.framed?(entry.size??1):1);
    // A destroyed hull leaves debris where it died, standing in for its living icon (Chris, 10 Sept).
    const symbol=s.destroyed?debrisMarkup(s,p,icon):art?`<image href="../assets/icons/${esc(art)}" x="${-artIcon/2}" y="${-artIcon/2}" width="${artIcon}" height="${artIcon}" transform="translate(${p.x} ${p.y}) rotate(${90-s.facing*60})" opacity="${s.destroyed?.4:1}"/>`:
      `<path d="M${-icon*.5},${-icon*.35}L${icon*.65},0L${-icon*.5},${icon*.35}L${-icon*.25},0Z" transform="translate(${p.x} ${p.y}) rotate(${-s.facing*60})" fill="${s.destroyed?'#63727a':isOwn?'#83c9e7':'#df9e66'}"/>`;
    const text=layout.labels.find(l=>l.id===s.id),b=text?.box;
    // Leaders and anchors are drawn but never capture pointer input, so a line crossing a neighbour's name cannot steal its click.
    const displacedLeader=marker.displaced?`<path class="leader" d="M${marker.anchor.x},${marker.anchor.y}L${p.x},${p.y}" stroke="#8ec6dc" stroke-dasharray="3 3"/>`:'';
    const labelLeader=text&&text.leader?`<path class="leader" d="M${p.x},${p.y}L${b.x+b.w/2},${b.y+b.h/2}" stroke="#496376" stroke-width="1"/>`:'';
    svg+=`<g data-ship="${esc(s.id)}" data-selected="${selected}" data-own="${isOwn}" data-wreck="${!!s.destroyed}" data-labelled="${!!text}" data-marker-x="${p.x.toFixed(1)}" data-marker-y="${p.y.toFixed(1)}" role="button" tabindex="0" aria-label="${esc(shipLabel(s))}${s.destroyed?' (lost)':''}"><title>${esc(shipLabel(s))} · ${s.destroyed?`destroyed${s.wreckedTurn?' turn '+s.wreckedTurn:''} · debris`:isOwn?'friendly':damageText(s)} · hex ${s.pos.q}, ${s.pos.r}</title>${displacedLeader}<circle class="leader" data-hex-anchor="true" cx="${marker.anchor.x}" cy="${marker.anchor.y}" r="${Math.max(1.5,scale*.08)}" fill="#8ec6dc" fill-opacity="${marker.displaced?1:.55}"/>${reticleMarkup(marker.anchor,scale)}${symbol}${labelLeader}${text?tag(text,'ship',selected?'#efb773':'#dfeaf1'):''}${text&&isOwn&&!s.destroyed?hullBar(text,s):''}</g>`;
  }
  for(const entry of layout.course){const b=entry.box;svg+=`<path d="M${entry.anchor.x},${entry.anchor.y}L${b.x+b.w/2},${b.y+b.h/2}" stroke="#efb773"/>${tag({...entry,primary:true},'course','#efb773')}`;}
  map.innerHTML=svg;
  map.querySelectorAll('[data-ship]').forEach(g=>{const select=()=>{
    if(mapDragged)return;
    const id=g.dataset.ship;
    if(g.dataset.own==='true'){flushPending();state.selected=id;state.mount=null;render();}
    // A wreck is debris, not a target. With a weapon isolated, the click assigns that weapon.
    else if(g.dataset.wreck!=='true'){const o=editableOrder();if(o){const m=currentShip()?.mounts.find(x=>x.id===state.mount);if(m)setMountAssignment(o,m.id,id);else o.target=id;renderOrders();drawMap();}}
    // Rendering replaces the SVG nodes; retain keyboard focus on the new control.
    [...map.querySelectorAll('[data-ship]')].find(node=>node.dataset.ship===id)?.focus({preventScroll:true});
  };g.onclick=select;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();mapDragged=false;select();}};
    // A deferred name is revealed on focus or hover as an overlay: no re-render, so the focused node stays live for the keyboard.
    const reveal=()=>{if(g.dataset.labelled==='true'||map.querySelector(`[data-reveal-for="${CSS.escape(g.dataset.ship)}"]`))return;const x=Number(g.dataset.markerX),y=Number(g.dataset.markerY),name=g.getAttribute('aria-label'),measure=measureText(map,font);let shown=name;while(shown.length>1&&Math.ceil(measure(shown))+font*.5>w-4)shown=shown.replace(/…$/u,'').slice(0,-1)+'…';const wpx=Math.min(w-4,Math.ceil(measure(shown))+font*.5);const bx=Math.max(2,Math.min(w-wpx-2,x-wpx/2));let by=y-icon*.9-font-4;if(by<2)by=Math.min(h-font-8,y+icon*.9);const o=document.createElementNS('http://www.w3.org/2000/svg','g');o.setAttribute('data-reveal-for',g.dataset.ship);o.setAttribute('pointer-events','none');o.innerHTML=`<rect data-map-label="reveal" x="${bx}" y="${by}" width="${wpx}" height="${font+6}" rx="2" fill="#060e15" fill-opacity=".95" stroke="#efb773" stroke-opacity=".8"/><text x="${bx+wpx/2}" y="${by+font+1}" fill="#efb773" font-size="${font}" text-anchor="middle">${esc(shown)}</text>`;map.appendChild(o);};
    const conceal=()=>{map.querySelector(`[data-reveal-for="${CSS.escape(g.dataset.ship)}"]`)?.remove();};
    g.onfocus=reveal;g.onblur=conceal;g.onmouseenter=reveal;g.onmouseleave=conceal;});
  if(state.focus){const node=[...map.querySelectorAll('[data-ship]')].find(n=>n.dataset.ship===state.focus);if(node&&document.activeElement!==node)node.focus({preventScroll:true});}
}
async function execute() {
  if(!editable())return;
  // Also cover activation without a preceding blur/change event. Validate all
  // visible numeric fields before posting; an invalid one restores and stops.
  if(holdExecute){holdExecute=false;status($('#order-feedback').textContent+' Check the value, then press Execute again.');return;}
  orderFeedback();const currentOrder=editableOrder(),order=currentOrder&&structuredClone(currentOrder);let valid=true;
  const inputs=[...$('#action-program').querySelectorAll('input[type=number]')].filter(input=>!input.disabled&&!input.closest('[hidden]'));
  if(order)for(const input of inputs){
    if(!commitNumericOrder(input,order))valid=false;
  }
  if(!valid){
    // Keep the final synchronization atomic if several controls bypass change.
    for(const input of inputs)input.value=String(currentOrder.plan[Number(input.dataset.round)][input.dataset.field]??0);
    refreshPreview();drawMap();return;
  }
  if(order)state.orders[state.selected]=order;
  for(const ship of state.latest.observation.own)if(state.orders[ship.id])pruneMountOrders(state.orders[ship.id],ship,state.latest.observation);
  state.busy=true;render();status('Resolving turn · receiving side-visible events only…');const token=generation;
  try{
    const result=await request('orders',{orders:structuredClone(state.orders)});if(token!==generation)return;
    if(!result.ok){status('Invalid orders. No turn advanced.');return;}
    const before=state.tape[state.tape.length-1]?.frame?.observation;
    const first=state.tape.length;for(const item of result.timeline)state.tape.push(item);
    // Weapons coming back online are news only across a turn boundary, so they are read from the
    // last planning picture against the new one and attached to the turn's final entry.
    const ready=readinessChanges(before,state.tape[state.tape.length-1]?.frame?.observation);
    if(ready.length)state.tape[state.tape.length-1].events.push(...ready);
    $('#playback-pause').disabled=false;$('#playback-skip').disabled=false;$('#playback-pause').setAttribute('aria-pressed','false');$('#playback-pause').textContent='Pause';
    const geometry=()=>{const v=state.current.observation,w=900,h=520,scale=Math.min(w/(v.map.widthHexes+8),h/(v.map.heightHexes+6))*state.zoom,clientWidth=Math.max(240,$('#contact-map').clientWidth||900),font=Math.max(9,Math.min(30,12.5*w/clientWidth));return {project:p=>({x:w/2+((p.q-state.center.q)+(p.r-state.center.r)/2)*scale,y:h/2+(p.r-state.center.r)*scale*.866}),scale,icon:symbolSize(scale,font),font};};
    const slideTo=async (index,clock)=>{
      if(index<=0||reducedMotion()||playback.skipping)return;
      const prev=state.tape[index-1]?.frame?.observation,next=state.tape[index]?.frame?.observation;if(!prev||!next)return;
      const moves=[];for(const s of [...next.own,...next.contacts]){
        const was=[...prev.own,...prev.contacts].find(x=>x.id===s.id);
        if(!was||s.destroyed||was.destroyed)continue;
        const moved=was.pos.q!==s.pos.q||was.pos.r!==s.pos.r;
        // Shortest way round the six faces, signed: the symbol rotates by
        // -60 degrees per face, matching the transform the marker is drawn with.
        let turn=((Number(s.facing)-Number(was.facing))%6+6)%6;if(turn>3)turn-=6;
        if(!moved&&!turn)continue;
        // A disappearing/reappearing report has no continuous visible track.
        // A warp is instantaneous, never drawn as ordinary flight: the warp effect shows it instead.
        if((state.tape[index].events||[]).some(e=>e.kind==='warp'&&e.shipId===s.id))continue;
        if(prev.own.some(o=>o.id===s.id)&&state.orders[s.id]?.plan[state.tape[index].frame.round-1]?.warp)continue;
        moves.push({id:s.id,from:was.pos,to:s.pos,turn,moved});
      }
      if(!moves.length)return;
      try{await clock.hold(520,phase=>{
        if(token!==generation)return;
        const g=geometry();
        const TURN_UNTIL=0.35;
        const spin=Math.min(1,phase/TURN_UNTIL),run=Math.max(0,(phase-TURN_UNTIL)/(1-TURN_UNTIL));
        const easeSpin=spin*spin*(3-2*spin),easeRun=run*run*(3-2*run);
        for(const move of moves){
          const node=$('#contact-map').querySelector(`[data-ship="${CSS.escape(move.id)}"]`);if(!node)continue;
          const a=g.project(move.from),b=g.project(move.to);
          node.dataset.sliding=String(phase);
          // Applied right to left: rotate about the hull's own hex, then run.
          const dx=move.moved?(b.x-a.x)*easeRun:0,dy=move.moved?(b.y-a.y)*easeRun:0;
          const deg=-move.turn*60*easeSpin;
          node.setAttribute('transform',`translate(${dx} ${dy}) rotate(${deg} ${a.x} ${a.y})`);
        }
      });}finally{
        if(token===generation)$('#contact-map').querySelectorAll('[data-sliding]').forEach(n=>{n.removeAttribute('transform');delete n.dataset.sliding;});
      }
    };
    const caption=(e,phase,g)=>{
      const at=e.destination?g.project(e.destination):null;if(!at||at.x<0||at.x>900||at.y<0||at.y>520)return '';const a=announcement(e,{label:id=>nameOf(state.current,id)});
      const text=(e.outcome==='resolved'?(e.face?`STRUCK FACE ${e.face}`:e.kind==='missile'?'ARRIVAL':e.kind==='strike'?'STRIKE RUN':e.kind==='spinal'?'CANNON FIRE':'FIRE'):String(e.outcome||'').toUpperCase())||a.title.toUpperCase();
      const colour=e.outcome==='resolved'?'#edb478':e.outcome==='unconfirmed'?'#8b9aaa':'#b3c4ce';const rise=phase*g.font*1.6,fade=phase<.15?phase/.15:phase>.8?(1-phase)/.2:1;
      const half=Math.min(440,measureText($('#contact-map'),g.font*1.05)(text)/2+text.length*.5+5),x=Math.max(half,Math.min(900-half,at.x));
      const y=Math.max(g.font*1.5,Math.min(514,at.y-g.icon*.9-rise));
      return `<text class="fx-caption" x="${x}" y="${y}" text-anchor="middle" font-size="${g.font*1.05}" font-family="Bahnschrift, 'Segoe UI', sans-serif" font-weight="bold" letter-spacing="1" fill="${colour}" fill-opacity="${fade.toFixed(2)}" stroke="#060e15" stroke-width="3" paint-order="stroke" pointer-events="none">${esc(text)}</text>`;
    };
    const run=await playback.run(result.timeline,{reduced:reducedMotion,durationFor:e=>Math.round(effectDuration(e,false)*1.7),frameBeat:420,
      onFrame:async (i,clock)=>{if(token!==generation)return;await slideTo(first+i,clock);if(token!==generation||!clock.alive())return;picture(first+i);},
      onEvent:(e,i)=>{if(token!==generation)return;const f=state.tape[first+i].frame;const a=announcement(e,{label:id=>nameOf(f,id)});announce(`T${f.turn}${f.round?' / A'+f.round:''} · ${a.title} · ${a.detail}`,a.weight);},
      onTick:(e,phase)=>{if(token!==generation)return;const g=geometry();liveEffects(effectMarkup(e,{...g,phase,reduced:false,victim:victimFor(state.current,e),faction:factionFor(state.current,e),seed:'live'})+caption(e,phase,g));},
      onEventEnd:()=>{if(token===generation)liveEffects('');}});
    if(token!==generation)return; // a superseded run must not touch a replacement run's controls
    $('#playback-pause').disabled=true;$('#playback-skip').disabled=true;
    if(!run.finished)return;
    picture(state.tape.length-1);announce('');
    state.latest=result.frame;resetOrders();status(result.adjustments.length?'Planning · resource limits adjusted during validation.':'Planning · contacts refreshed. Set the next three actions.');
  }catch(error){if(token===generation){if(commandMode)sessionReady=false;status(error.message+(commandMode?' Start or restart the engagement.':''));}}
  finally{if(token===generation){state.busy=false;render();}}
}
$('#begin').onclick=()=>begin();$('#resolve-orders').onclick=execute;$('#resolve-orders').onpointerdown=()=>{executePressAt=performance.now();holdExecute=false;};
$('#new-session').onclick=()=>{generation++;playback.cancel();resetPlaybackControls();liveEffects('');announce('');worker?.terminate();for(const task of pending.values())task.reject(new Error('Session replaced'));pending.clear();state.busy=false;$('#trial-setup').hidden=false;$('#contact-station').hidden=true;$('#resolve-orders').disabled=true;$('#export-contact').disabled=true;status('Awaiting new trial. Previous browser session was not saved.');};
$('#own-vessel').onchange=e=>{flushPending();state.selected=e.target.value;state.mount=null;renderVessel();renderOrders();drawMap();};
$('#arc-mount').onchange=e=>{const m=currentShip()?.mounts.find(m=>String(m.id)===e.target.value);state.mount=m?.id??null;$('#range-disclosure').open=!!m&&!compactRange.matches;renderVessel();renderOrders();drawMap();};
$('#priority').onchange=e=>{const o=editableOrder();if(o&&!e.target.disabled){o.target=e.target.value;renderOrders();drawMap();}};
$('#shield-reserve').oninput=e=>{const o=editableOrder();if(o&&!e.target.disabled){o.reserve=Number(e.target.value);renderOrders();drawMap();}};
$('#zoom').oninput=e=>{state.zoom=Number(e.target.value);drawMap();};
if(consoleMode)for(const [id,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]])$('#'+id).onclick=()=>{state.zoom=Math.max(.5,Math.min(12,state.zoom*factor));$('#zoom').value=state.zoom;drawMap();};
$('#playback-pause').onclick=()=>{if(!playback.running)return;if(playback.paused){playback.resume();$('#playback-pause').setAttribute('aria-pressed','false');$('#playback-pause').textContent='Pause';}else{playback.pause();$('#playback-pause').setAttribute('aria-pressed','true');$('#playback-pause').textContent='Resume';}};
$('#playback-skip').onclick=()=>{if(playback.running)playback.skip();};
$('#hex-grid').onclick=()=>{state.grid=!state.grid;$('#hex-grid').setAttribute('aria-pressed',String(state.grid));drawMap();};
$('#hex-grid').setAttribute('aria-pressed','true');
$('#map-legend-items').innerHTML=TERRAIN_LEGEND.map(t=>`<li>${terrainSwatch(t.type,18)}<b>${esc(t.label)}</b> <small>${esc(t.note)}</small></li>`).join('');
$('#fit-map').onclick=()=>{state.center={q:0,r:0};state.zoom=1;$('#zoom').value=1;drawMap();};
$('#frame-contacts').onclick=()=>{frameReports();drawMap();};
$('#tape').oninput=e=>{if(!state.busy)picture(Number(e.target.value));};$('#live-picture').onclick=()=>{if(!state.busy)picture(state.tape.length-1);};
if(consoleMode)for(const [id,delta] of [['history-prev',-1],['history-next',1]])$('#'+id).onclick=()=>{if(!state.busy)picture(Math.max(0,Math.min(state.tape.length-1,state.index+delta)));};
$('#export-contact').onclick=()=>{
  if(state.busy||!state.latest)return;
  const record={format:'orion-side-record/1',side:state.latest.observation.side,contactProfile:state.latest.observation.contactProfile,
    scope:'Restricted event-time contact tape; not an omniscient replay or resumable save',timeline:state.tape};
  const blob=new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=commandMode?'fleet-command-side-record.json':'first-contacts-side-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
let mapDrag=null,mapDragged=false;
const mapPoint=event=>new DOMPoint(event.clientX,event.clientY).matrixTransform($('#contact-map').getScreenCTM().inverse());
$('#contact-map').onselectstart=event=>event.preventDefault();
$('#contact-map').ondragstart=event=>event.preventDefault();
$('#contact-map').onpointerdown=event=>{
  if(!state.current||event.button!==0||mapDrag)return;
  // Prevent browser text/image dragging without swallowing the eventual ship
  // click. Explicit focus replaces the pointerdown default we just cancelled.
  event.preventDefault();event.target.closest('[data-ship]')?.focus({preventScroll:true});
  const selection=window.getSelection(),map=$('#contact-map');
  if(selection&&!selection.isCollapsed&&(map.contains(selection.anchorNode)||map.contains(selection.focusNode)))selection.removeAllRanges();
  mapDragged=false;mapDrag={pointerId:event.pointerId,point:mapPoint(event),center:{...state.center}};
};
$('#contact-map').onpointermove=event=>{
  if(!mapDrag||mapDrag.pointerId!==event.pointerId)return;
  if(event.pointerType==='mouse'&&!(event.buttons&1)){mapDrag=null;return;}
  const p=mapPoint(event),dx=p.x-mapDrag.point.x,dy=p.y-mapDrag.point.y;
  if(Math.hypot(dx,dy)<5&&!mapDragged)return;event.preventDefault();mapDragged=true;$('#contact-map').classList.add('is-panning');$('#contact-map').setPointerCapture(event.pointerId);
  const m=state.current.observation.map,k=Math.min(900/(m.widthHexes+8),520/(m.heightHexes+6))*state.zoom,dr=dy/(k*.866);
  state.center={q:mapDrag.center.q-dx/k+dr/2,r:mapDrag.center.r-dr};drawMap();
};
const endMapDrag=event=>{if(mapDrag&&mapDrag.pointerId!==event.pointerId)return;mapDrag=null;$('#contact-map').classList.remove('is-panning');};
$('#contact-map').onpointerup=endMapDrag;$('#contact-map').onpointercancel=endMapDrag;$('#contact-map').onlostpointercapture=endMapDrag;
$('#contact-map').onwheel=event=>{if(!state.current)return;event.preventDefault();state.zoom=Math.max(.5,Math.min(12,state.zoom*(event.deltaY<0?1.12:1/1.12)));$('#zoom').value=state.zoom;drawMap();};
$('#zoom').min=.5;$('#zoom').max=12;
if(commandMode){
  setupReady=import('./command-setup.js').then(m=>m.installCommandSetup());
  setupReady.then(setup=>{$('#begin').disabled=false;if(setup.autoStart)begin();}).catch(e=>status(`Setup unavailable: ${e.message}`));
  $('#restart-command').onclick=()=>{if(!state.busy&&lastSetup)begin(true);};
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const open=e.target.closest?.('details[open]')||[...document.querySelectorAll('.command-station details[open]')].at(-1);if(open){open.open=false;open.querySelector('summary')?.focus({preventScroll:true});e.preventDefault();}});
  document.querySelectorAll('[data-drawer]').forEach(key=>key.onclick=()=>{const name=key.dataset.drawer,open=key.getAttribute('aria-pressed')!=='true';document.querySelectorAll('[data-drawer]').forEach(k=>k.setAttribute('aria-pressed',String(open&&k===key)));document.querySelectorAll('[data-drawer-panel]').forEach(pn=>pn.hidden=!(open&&pn.dataset.drawerPanel===name));});
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const openKey=document.querySelector('[data-drawer][aria-pressed="true"]');if(openKey){openKey.click();openKey.focus({preventScroll:true});e.preventDefault();}});
  document.querySelectorAll('[data-station-tab]').forEach(tab=>tab.onclick=()=>{const name=tab.dataset.stationTab;document.querySelectorAll('[data-station-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)));document.querySelectorAll('[data-station-panel]').forEach(p=>p.hidden=p.dataset.stationPanel!==name);if(name==='vessel')renderVessel();});
  document.querySelectorAll('button[data-station-view]').forEach(b=>b.onclick=()=>{document.body.dataset.view=b.dataset.stationView;document.querySelectorAll('button[data-station-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(b.dataset.stationView==='map')drawMap();});
  document.querySelectorAll('[data-command-formation]').forEach(button=>button.onclick=()=>{
    if(!editable())return;const view=state.current.observation,name=button.dataset.commandFormation;
    const previous=state.orders;
    state.orders=formationOrders(view.own,view.roundsPerTurn,name,ship=>ship);
    for(const [id,o] of Object.entries(state.orders))if(previous[id]?.spinal)o.spinal=previous[id].spinal;
    $('#formation-note').textContent=`${FORMATION_PRESETS[name].label} assigned to each living vessel. It is a planning shortcut, not guaranteed movement or fire.`;
    render();
  });
}
window.addEventListener('resize',drawMap);
window.addEventListener('beforeunload',()=>worker?.terminate());
fetch('../assets/icons/manifest.json').then(r=>{if(!r.ok)throw new Error('No symbol manifest');return r.json();}).then(m=>{icons=m.icons||{};drawMap();}).catch(()=>{});
// No live battle, response cache, recorder, engine control or diagnostic global.
