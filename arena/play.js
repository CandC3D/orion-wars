import { createBattle, battleView, shipPlan, stepTurn } from "./play-engine.js?v=play1";
import { createPlayRecord } from "./record.js?v=play1";
import { HEX_DIRECTIONS as DIRS, axialToWorld, snapWorldToHex, terrainFootprint } from "./editor-core.js";

const $ = (s) => document.querySelector(s);
const SESSION_KEY = "orion-wars:scenario-replay:v3";
const SCENARIOS = [
  ["formation-column.json", "Formation — column"], ["formation-echelon.json", "Formation — echelon"],
  ["formation-loose.json", "Formation — loose"], ["small-action.json", "Small action"],
  ["first-obstacles.json", "First obstacles"], ["twin-moons.json", "Twin moons"]
];
const COLORS = { EAR: "#54a8ff", VRA: "#edc85e", ZAN: "#ec655d", KRE: "#62c98a" };
const FACE_OFFSETS = { 1: 1, 2: 0, 3: -1, 4: -2, 5: 3, 6: 2 };
const clone = (v) => JSON.parse(JSON.stringify(v));
const norm = (v) => ((v % 6) + 6) % 6;
const key = (p) => `${p.q},${p.r}`;
const canvas = $("#play-canvas"), ctx = canvas.getContext("2d");
const state = {
  tuning: null, loadouts: null, scenario: null, battle: null, view: null, record: null,
  humanSide: "A", selected: null, round: 0, orders: {}, phase: "setup", icons: new Map(),
  camera: { zoom: 1, x: 0, y: 0 }, displayShips: null, animation: null
};

function setStatus(message) { $("#setup-message").textContent = message; }
function label(name) { return name.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function geometry() {
  const rect = canvas.getBoundingClientRect(), map = state.view?.map || state.scenario?.map || { widthHexes: 72, heightHexes: 40 };
  const scale = Math.max(7, Math.min(rect.width / (Math.sqrt(3) * (map.widthHexes + 3)), rect.height / (1.5 * (map.heightHexes + 3))) * state.camera.zoom);
  return { width: rect.width, height: rect.height, scale, cx: rect.width / 2 + state.camera.x, cy: rect.height / 2 + state.camera.y };
}
function project(pos, geo = geometry()) { const p = axialToWorld(pos); return { x: geo.cx + p.x * geo.scale, y: geo.cy + p.y * geo.scale }; }
function eventHex(event) { const rect = canvas.getBoundingClientRect(), geo = geometry(); return snapWorldToHex((event.clientX - rect.left - geo.cx) / geo.scale, (event.clientY - rect.top - geo.cy) / geo.scale); }
function hexPath(x, y, radius) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
function inMap(pos, map) { return Math.abs(pos.q + pos.r / 2) <= map.widthHexes / 2 + 1e-9 && Math.abs(pos.r) <= map.heightHexes / 2 + 1e-9; }
function drawGrid(geo) {
  const map = state.view?.map || state.scenario?.map; if (!map) return;
  ctx.strokeStyle = "rgba(130,161,181,.12)"; ctx.lineWidth = 1;
  const halfR = Math.ceil(map.heightHexes / 2), halfW = Math.ceil(map.widthHexes / 2);
  for (let r = -halfR; r <= halfR; r++) for (let q = -halfW; q <= halfW; q++) if (inMap({ q, r }, map)) { const p = project({ q, r }, geo); hexPath(p.x, p.y, geo.scale); ctx.stroke(); }
}
function drawTerrain(geo) {
  for (const item of state.view?.terrain || state.scenario?.terrain || []) for (const cell of terrainFootprint(item)) {
    const p = project(cell, geo); hexPath(p.x, p.y, geo.scale * .88);
    const fill = { planet: "#816b4a", moon: "#9ca5a7", asteroid: "#765f4d", asteroids: "rgba(155,127,91,.35)", nebula: "rgba(89,74,137,.38)" }[item.type] || "#666";
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = item.type === "asteroids" ? "#bba273" : "#aaa8"; ctx.stroke();
    if (item.type === "asteroids") { ctx.fillStyle = "#baa078"; for (let i = 0; i < 6; i++) { const a = i * 2.4, rr = geo.scale * (.18 + (i % 3) * .12); ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, geo.scale * .07, 0, Math.PI * 2); ctx.fill(); } }
  }
}
function drawSector(center, inner, outer, direction, color) {
  const angle = -direction * Math.PI / 3;
  ctx.beginPath(); ctx.arc(center.x, center.y, outer, angle - Math.PI / 6, angle + Math.PI / 6); ctx.arc(center.x, center.y, inner, angle + Math.PI / 6, angle - Math.PI / 6, true); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function drawArcs(ship, geo) {
  const center = project(ship.pos, geo);
  for (const mount of ship.mounts) {
    const bands = mount.bands?.length ? mount.bands : [{ to: mount.maxRange }];
    let previous = 0;
    bands.forEach((band, bandIndex) => {
      const to = Math.min(mount.maxRange, band.to), alpha = Math.max(.025, .11 - bandIndex * .018) / Math.max(1, ship.mounts.length * .35);
      for (const face of mount.arc) drawSector(center, previous * Math.sqrt(3) * geo.scale, to * Math.sqrt(3) * geo.scale, norm(ship.facing + FACE_OFFSETS[face]), `rgba(228,194,117,${alpha})`);
      previous = to;
    });
  }
}
function drawShield(ship, geo) {
  const center = project(ship.pos, geo), radius = geo.scale * 1.15, max = Math.max(...Object.values(ship.shieldCap), 1);
  for (let face = 1; face <= 6; face++) {
    const direction = norm(ship.facing + FACE_OFFSETS[face]), a = -direction * Math.PI / 3, a1 = a - Math.PI / 6, a2 = a + Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius); ctx.lineTo(center.x + Math.cos(a2) * radius, center.y + Math.sin(a2) * radius); ctx.closePath();
    ctx.fillStyle = ship.shieldDown[face] ? "rgba(236,101,93,.38)" : `rgba(84,168,255,${.08 + .3 * ship.shieldCap[face] / max})`; ctx.fill();
    ctx.strokeStyle = ship.shieldDown[face] ? "#ec655d" : "rgba(120,200,255,.75)"; ctx.stroke();
    if (ship.shieldDown[face]) { ctx.fillStyle = "#ffd0cc"; ctx.font = `${Math.max(9, geo.scale * .28)}px sans-serif`; ctx.fillText("×", center.x + Math.cos(a) * radius * .72 - 3, center.y + Math.sin(a) * radius * .72 + 3); }
  }
}
function plannedRoute(ship) {
  const entries = state.orders[ship.id]?.plan || Array.from({ length: state.view.roundsPerTurn }, () => ({ turn: 0, forward: 0 }));
  const points = [{ ...ship.pos, facing: ship.facing, round: 0 }], terrain = new Map((state.view.terrain || []).map((t) => [key(t), t.type]));
  const blocked = new Set(); for (const item of state.view.terrain || []) if (!["asteroids","nebula"].includes(item.type)) for (const hex of terrainFootprint(item)) blocked.add(key(hex));
  let pos = { ...ship.pos }, facing = ship.facing, spent = 0;
  const reserve = (state.orders[ship.id]?.reserve ?? 0) * ship.fullPower, available = ship.fullPower - reserve;
  entries.forEach((entry, round) => {
    facing = norm(facing + entry.turn);
    let movedThisRound=false;
    for (let step = 0; step < entry.forward; step++) { const d = DIRS[facing], next = { q: pos.q + d.q, r: pos.r + d.r }; if (!inMap(next, state.view.map) || blocked.has(key(next))) break; const type=terrain.get(key(next)), cost=ship.movementPointRatio*(type==="asteroids"?2:1); if(spent+cost>available+1e-9) break; spent+=cost; pos = next; points.push({ ...pos, facing, round: round + 1, terrain: type, moved: true }); movedThisRound=true; }
    if (movedThisRound) points.at(-1).waypoint=true; else points.push({ ...pos, facing, round: round + 1, waypoint: true });
  });
  return points;
}
function drawPlan(ship, geo) {
  const route = plannedRoute(ship); ctx.strokeStyle = "#f3d88e"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]); ctx.beginPath(); route.forEach((pos, i) => { const p = project(pos, geo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke(); ctx.setLineDash([]);
  route.filter((p) => p.waypoint).forEach((pos) => { const p = project(pos, geo); ctx.fillStyle = "#e4c275"; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#17130b"; ctx.font = "bold 8px sans-serif"; ctx.fillText(String(pos.round), p.x - 2, p.y + 3); });
  const end = route.at(-1), p = project(end, geo), angle = -end.facing * Math.PI / 3; ctx.strokeStyle = "#fff1bd"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(angle) * geo.scale * 1.1, p.y + Math.sin(angle) * geo.scale * 1.1); ctx.stroke();
}
function drawTarget(ship, geo) {
  const id = state.orders[ship.id]?.target; if (!id || id === "auto") return;
  const target = state.view.ships.find((s) => s.id === id); if (!target) return;
  const a = project(ship.pos, geo), b = project(target.pos, geo); ctx.strokeStyle = "rgba(236,101,93,.85)"; ctx.lineWidth = 1.5; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); ctx.setLineDash([]);
}
function drawShip(ship, geo) {
  const p = project(ship.pos, geo), color = COLORS[ship.faction] || "#ddd", selected = ship.id === state.selected;
  if (selected && state.phase === "planning") { drawArcs(ship, geo); drawShield(ship, geo); drawPlan(ship, geo); drawTarget(ship, geo); }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-ship.facing * Math.PI / 3); if (selected) { ctx.strokeStyle = "#fff0b5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0,0,geo.scale*.66,0,Math.PI*2); ctx.stroke(); }
  const image = state.icons.get(`${ship.faction}/${ship.className}`); if (image) ctx.drawImage(image, -geo.scale*.52, -geo.scale*.52, geo.scale*1.04, geo.scale*1.04); else { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(geo.scale*.5,0); ctx.lineTo(-geo.scale*.35,-geo.scale*.3); ctx.lineTo(-geo.scale*.24,0); ctx.lineTo(-geo.scale*.35,geo.scale*.3); ctx.closePath(); ctx.fill(); }
  ctx.restore(); ctx.fillStyle = color; ctx.font = `${Math.max(9, geo.scale * .3)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(ship.id, p.x, p.y + geo.scale * .85);
}

// Polish (Fable, 2026-09-03): frame the living fleets - the camera used to
// open on the whole 72x40 map with the ships as six-pixel dots.
function frameFleets(margin = 4) {
  const ships = (state.view?.ships || []).filter((ship) => !ship.destroyed);
  if (!ships.length) return;
  const pts = ships.map((ship) => axialToWorld(ship.pos));
  const minX = Math.min(...pts.map((p) => p.x)) - margin * 1.8, maxX = Math.max(...pts.map((p) => p.x)) + margin * 1.8;
  const minY = Math.min(...pts.map((p) => p.y)) - margin * 1.5, maxY = Math.max(...pts.map((p) => p.y)) + margin * 1.5;
  const rect = canvas.getBoundingClientRect();
  const base = geometry.fit ? geometry.fit() : (function () { const g = { ...state.camera }; state.camera = { zoom: 1, x: 0, y: 0 }; const fit = geometry().scale; state.camera = g; return fit; })();
  const zoom = Math.max(0.65, Math.min(6, Math.min(rect.width / ((maxX - minX) * base), rect.height / ((maxY - minY) * base))));
  state.camera.zoom = zoom;
  const scale = base * zoom;
  state.camera.x = -((minX + maxX) / 2) * scale;
  state.camera.y = -((minY + maxY) / 2) * scale;
}
function draw() {
  const dpr = devicePixelRatio || 1, rect = canvas.getBoundingClientRect(); if (canvas.width !== rect.width*dpr || canvas.height !== rect.height*dpr) { canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; }
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,rect.width,rect.height); const geo=geometry(); drawGrid(geo); drawTerrain(geo);
  for (const ship of state.displayShips || state.view?.ships || []) if (!ship.destroyed) drawShip(ship,geo);
}
function ensureOrder(ship) {
  if (!state.orders[ship.id]) state.orders[ship.id] = { plan: Array.from({ length: state.view.roundsPerTurn }, () => ({ turn: 0, forward: 0 })), target: "auto", reserve: .3 };
  return state.orders[ship.id];
}
function selectedShip() { return state.view?.ships.find((ship) => ship.id === state.selected); }
function movementCost(ship) { return plannedRoute(ship).slice(1).reduce((sum, p) => sum + (p.moved ? ship.movementPointRatio * (p.terrain === "asteroids" ? 2 : 1) : 0), 0); }
function updateOrderPanel() {
  const ship = selectedShip(), panel = $("#orders-panel"); panel.hidden = !ship || ship.side !== state.humanSide; if (panel.hidden) return;
  const order = ensureOrder(ship), plan = shipPlan(state.battle, ship.id), entry = order.plan[state.round];
  $("#ship-name").textContent = `${ship.faction} ${label(ship.className)} · ${ship.id}`;
  $("#round-tabs").innerHTML = order.plan.map((_, i) => `<button data-round="${i}" class="${i===state.round?'active':''}">Round ${i+1}</button>`).join("");
  $("#round-tabs").querySelectorAll("button").forEach((b) => b.onclick=()=>{state.round=Number(b.dataset.round); updateOrderPanel(); draw();});
  $("#forward-value").textContent = `${entry.forward} hex${entry.forward===1?'':'es'} · turn ${entry.turn>0?'+':''}${entry.turn}`;
  $("#reserve").value=order.reserve; $("#reserve-value").textContent=`${Math.round(order.reserve*100)}%`;
  const move=movementCost(ship), reserve=ship.fullPower*order.reserve, guns=Math.max(0,ship.fullPower-reserve-move);
  $("#movement-cost").textContent=move.toFixed(1); $("#reserve-power").textContent=reserve.toFixed(1); $("#gun-power").textContent=guns.toFixed(1);
  $("#power-move").style.width=`${Math.min(100,move/ship.fullPower*100)}%`; $("#power-guns").style.width=`${guns/ship.fullPower*100}%`; $("#power-reserve").style.width=`${reserve/ship.fullPower*100}%`;
  $("#target-name").textContent=order.target==="auto"?"auto":order.target;
  $("#mount-list").innerHTML=ship.mounts.map((m)=>`<span>${m.kind} · ${label(m.type)} · ${m.arcName.toUpperCase()} · ${m.maxRange} hex</span>`).join("");
  $("#turn-left").disabled=entry.turn>=plan.turnRate; $("#turn-right").disabled=entry.turn<=-plan.turnRate;
}
function renderFleet() {
  if (!state.view) return; $("#ship-list").innerHTML=state.view.ships.map((ship)=>`<button class="ship-pick ${ship.id===state.selected?'active':''} ${ship.side===state.humanSide&&!state.orders[ship.id]?'scripted':''}" data-id="${ship.id}"><i style="color:${COLORS[ship.faction]}"></i><span>${ship.id}</span><small>${ship.side===state.humanSide?(state.orders[ship.id]?'ordered':'scripted'):'enemy'}</small></button>`).join("");
  $("#ship-list").querySelectorAll("button").forEach((button)=>button.onclick=()=>selectShip(button.dataset.id));
}
function selectShip(id) { const ship=state.view.ships.find((s)=>s.id===id); if (!ship) return; if (ship.side!==state.humanSide && state.selected) { ensureOrder(selectedShip()).target=id; updateOrderPanel(); draw(); return; } state.selected=id; renderFleet(); updateOrderPanel(); draw(); }
function adjustTurn(delta) { const ship=selectedShip(); if (!ship||ship.side!==state.humanSide||state.phase!=="planning") return; const order=ensureOrder(ship), limit=ship.turnRate; order.plan[state.round].turn=Math.max(-limit,Math.min(limit,order.plan[state.round].turn+delta)); renderFleet(); updateOrderPanel(); draw(); }
function adjustForward(delta) { const ship=selectedShip(); if (!ship||ship.side!==state.humanSide||state.phase!=="planning") return; const entry=ensureOrder(ship).plan[state.round]; entry.forward=Math.max(0,entry.forward+delta); renderFleet(); updateOrderPanel(); draw(); }
function refreshView() { state.view=battleView(state.battle); state.displayShips=null; $("#turn-label").textContent=`Turn ${state.view.turn} / Planning`; $("#phase-badge").textContent="Planning"; renderFleet(); updateOrderPanel(); draw(); }
function appendLog(entries) { state.record.log.push(...entries); $("#log-lines").innerHTML=state.record.log.slice(-80).map((entry)=>`<li>${entry.message}</li>`).join(""); $("#log-count").textContent=`${state.record.log.length} events`; $("#log-lines").scrollTop=$("#log-lines").scrollHeight; }
function animateFrame(frame) {
  const from = new Map((state.displayShips || state.view.ships).map((ship) => [ship.id, ship]));
  return new Promise((resolve) => { const began=performance.now(), duration=600; function tick(now){const t=Math.min(1,(now-began)/duration), eased=t*t*(3-2*t);state.displayShips=frame.ships.map((ship)=>{const old=from.get(ship.id)||ship;return{...ship,pos:{q:old.pos.q+(ship.pos.q-old.pos.q)*eased,r:old.pos.r+(ship.pos.r-old.pos.r)*eased}};});draw();if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick); });
}
async function playback(turn) {
  state.phase="playback"; $("#phase-badge").textContent="Playback"; $("#end-turn").disabled=true;
  for (const frame of turn.rounds) {
    $("#turn-label").textContent=`Turn ${frame.turn} / Round ${frame.round}`; await animateFrame(frame);
    appendLog(turn.log.filter((entry)=>entry.round===frame.round)); await new Promise((resolve)=>setTimeout(resolve,180));
  }
  state.phase=turn.result?"ended":"planning"; state.orders={}; state.selected=null; refreshView(); frameFleets(); draw();
  if (turn.result) { $("#verdict").hidden=false; $("#verdict").textContent=turn.result.victor?`${state.record.meta.factions[turn.result.victor]} VICTORY`:"BATTLE DRAWN"; $("#end-turn").disabled=true; }
  else $("#end-turn").disabled=false;
}
async function endTurn() {
  if (!state.battle||state.phase!=="planning") return; const submitted=clone(state.orders), turnNo=state.battle.turn;
  state.record.meta.orders.push({ turn:turnNo, side:state.humanSide, orders:submitted }); const result=stepTurn(state.battle,submitted);
  state.record.rounds.push(...clone(result.rounds)); state.record.shots.push(...clone(result.shots));
  state.record.result=result.result?clone(result.result):{victor:null,reason:"battle in progress"};
  await playback(result); $("#save-record").disabled=false; $("#open-viewer").disabled=false;
}
function saveRecord() { const blob=new Blob([JSON.stringify(state.record,null,2)+"\n"],{type:"application/json"}), a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`${state.scenario.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")||"battle"}-game.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),0); }
function openViewer() { sessionStorage.setItem(SESSION_KEY,JSON.stringify(state.record)); location.assign("./index.html?replay=session"); }
async function loadScenario(name) { const response=await fetch(`./scenarios/${name}`,{cache:"no-store"}); if(!response.ok) throw new Error(`Could not load ${name}`); return response.json(); }
async function start() {
  try { const option=$("#scenario-select").value; let scenario;
    if(option==="session") { const stored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null"); scenario=stored?.meta?.scenario; if(!scenario) throw new Error("The editor has not handed off a scenario in this tab."); }
    else scenario=await loadScenario(option);
    scenario=clone(scenario); scenario.seed=$("#seed-input").value||scenario.seed; state.scenario=scenario; state.humanSide=$("#side-select").value; state.battle=createBattle(scenario,state.tuning,state.loadouts,scenario.seed); state.view=battleView(state.battle); state.record=createPlayRecord(scenario,state.view); state.phase="planning";
    $("#setup-panel").hidden=true; $("#side-label").textContent=`Commanding ${state.record.meta.factions[state.humanSide]} · Side ${state.humanSide}`; $("#end-turn").disabled=false; $("#hint").textContent="Select a friendly ship. Click an enemy to target it. Q/E turn · W/S speed · Tab ship · Enter end turn."; refreshView(); frameFleets(); draw();
  } catch(error){setStatus(error.message);}
}
async function loadIcons() { try { const manifest=await (await fetch("../assets/icons/manifest.json")).json(); for(const [id,entry] of Object.entries(manifest.icons||{})){const image=new Image();image.onload=()=>{state.icons.set(id,image);draw();};image.src=`../assets/icons/${entry.file}`;} } catch(error){console.warn("Playfield icons unavailable",error);} }
async function init() {
  try { [state.tuning,state.loadouts]=await Promise.all([fetch("../data/tactical-tuning.json").then(r=>r.json()),fetch("../data/loadouts.json").then(r=>r.json())]);
    const select=$("#scenario-select"); select.innerHTML=SCENARIOS.map(([file,name])=>`<option value="${file}">${name}</option>`).join("");
    try { const stored=JSON.parse(sessionStorage.getItem(SESSION_KEY)||"null"); if(stored?.meta?.scenario) select.insertAdjacentHTML("afterbegin",`<option value="session">Editor hand-off — ${stored.meta.scenario.name}</option>`); } catch {}
    select.onchange=async()=>{try{const s=select.value==="session"?JSON.parse(sessionStorage.getItem(SESSION_KEY)).meta.scenario:await loadScenario(select.value);$("#seed-input").value=s.seed||"orion";$("#side-select").options[0].textContent=`Side A — ${s.sides[0].faction}`;$("#side-select").options[1].textContent=`Side B — ${s.sides[1].faction}`;}catch(error){setStatus(error.message);}}; await select.onchange();
  } catch(error){setStatus(`Tactical data could not load: ${error.message}`);}
}

$("#start-battle").onclick=start; $("#turn-left").onclick=()=>adjustTurn(1); $("#turn-right").onclick=()=>adjustTurn(-1); $("#forward-up").onclick=()=>adjustForward(1); $("#forward-down").onclick=()=>adjustForward(-1);
$("#reserve").oninput=(e)=>{const ship=selectedShip();if(ship){ensureOrder(ship).reserve=Number(e.target.value);updateOrderPanel();draw();}}; $("#target-auto").onclick=()=>{const ship=selectedShip();if(ship){ensureOrder(ship).target="auto";updateOrderPanel();draw();}};
$("#end-turn").onclick=endTurn; $("#save-record").onclick=saveRecord; $("#open-viewer").onclick=openViewer; $("#fit-map").onclick=()=>{state.camera={zoom:1,x:0,y:0};draw();}; $("#frame-fleets").onclick=()=>{frameFleets();draw();};
let drag=null, dragged=false;
canvas.onpointerdown=(event)=>{drag={x:event.clientX,y:event.clientY,cx:state.camera.x,cy:state.camera.y};dragged=false;canvas.setPointerCapture?.(event.pointerId);};
canvas.onpointermove=(event)=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)dragged=true;if(dragged){state.camera.x=drag.cx+dx;state.camera.y=drag.cy+dy;draw();}};
canvas.onpointerup=()=>{drag=null;};
canvas.onclick=(event)=>{if(dragged){dragged=false;return;}if(!state.view||state.phase!=="planning")return;const hex=eventHex(event), ships=state.view.ships.filter(s=>key(s.pos)===key(hex)&&!s.destroyed);if(ships.length){selectShip(ships[0].id);return;}const ship=selectedShip();if(!ship||ship.side!==state.humanSide)return;const route=plannedRoute(ship), start=route.filter(p=>p.round<=state.round).at(-1)||route[0], entry=ensureOrder(ship).plan[state.round], facing=norm(start.facing+entry.turn), d=DIRS[facing];let cursor={q:start.q,r:start.r};for(let n=1;n<80;n++){cursor={q:cursor.q+d.q,r:cursor.r+d.r};if(key(cursor)===key(hex)){entry.forward=n;renderFleet();updateOrderPanel();draw();break;}}};
canvas.onwheel=(event)=>{event.preventDefault();state.camera.zoom=Math.max(.65,Math.min(6,state.camera.zoom*(event.deltaY<0?1.12:.89)));draw();};
window.addEventListener("keydown",(event)=>{if(["INPUT","SELECT"].includes(document.activeElement?.tagName))return;const k=event.key.toLowerCase();if(k==="q")adjustTurn(1);else if(k==="e")adjustTurn(-1);else if(k==="w")adjustForward(1);else if(k==="s")adjustForward(-1);else if(k==="tab"){event.preventDefault();const ids=state.view?.ships.filter(s=>s.side===state.humanSide&&!s.destroyed).map(s=>s.id)||[];if(ids.length)selectShip(ids[(Math.max(-1,ids.indexOf(state.selected))+1)%ids.length]);}else if(event.key==="Enter")endTurn();});
window.addEventListener("resize",draw); window.__play={state,createBattle,battleView,shipPlan,stepTurn,plannedRoute,movementCost,selectShip,endTurn};
init();loadIcons();draw();
