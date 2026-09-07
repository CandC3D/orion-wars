// Fleet Command — the interactive playfield (rebuilt by Fable, 2026-09-03).
//
// The console presents three actions (move OR hold/fire), current telemetry,
// and a conditional forecast evaluated at each action's actual planned position.
// Combat and geometry remain authoritative in src/tactical, not this renderer.
import { createBattle, battleView, shipPlan, stepTurn, previewOrders } from "./play-engine.js?v=stage31";
import { OFFSET_OF_FACE, FACE_NAMES, FACTIONS, HEADINGS, format, escapeHTML as esc, shipLabel, shields, courseMarkers, courseReadings } from "./command-model.js";
import { createPlayRecord } from "./record.js?v=play1";
import { readLibrary, stockRevision, pinStockRevisions, LIBRARY_KEY } from '../src/construction/stock-library.js';
import { eventShips, hitAttribution } from "./replay-geometry.js";
import { courseLegs } from "./missile-tracks.js";
import { HEX_DIRECTIONS as DIRS, axialToWorld, snapWorldToHex, terrainFootprint, validateScenario } from "./editor-core.js";
import { FORMATION_PRESETS, formationOrders } from "./formation-orders.js";
import { createCombatAudio } from "./combat-audio.js";

const $ = (s) => document.querySelector(s);
import { arcLabel } from "./arc-labels.js";
const SESSION_KEY = "orion-wars:scenario-replay:v3";
const SCENARIOS = [
  ["asterion-line.json", "Featured — The Asterion Line", "A focused 4v4 command trial: protect your command asset, break the enemy line, and learn the three-action battle system."],
  ["formation-column.json", "Formation — column", "Two Earth destroyers against four Krelath frigates in a tight column. Equal points; formation decides it."],
  ["formation-echelon.json", "Formation — echelon", "The same fight, frigates staggered. The scripted helm used to lose this 40–0 by arriving piecemeal."],
  ["formation-loose.json", "Formation — loose", "The same fight, frigates spread wide."],
  ["small-action.json", "Small action", "One destroyer against one, fifty hexes apart. A duel to learn the helm."],
  ["first-obstacles.json", "First obstacles", "A planet flanked by moons across Earth's line of advance. 30 vs 30."],
  ["twin-moons.json", "Twin moons", "A planet and two moons; Yamato versus the Krelath flight deck."]
];
const COLORS = { EAR: "#54a8ff", VRA: "#edc85e", ZAN: "#ec655d", KRE: "#62c98a" };
const WEAPON_COLORS = { "laser-cannon": "#9fd7ff", "blaster-beam": "#ff8a5b", "heavy-blaster": "#ff6a3d", "neutronic-missile": "#ffd36b", "plasma-torpedo": "#7cf2b0", "photonic-cannon": "#d9b3ff" };
// The engine's face table (src/tactical/hex.js): the face that meets a bearing
// `offset` hexsides counter-clockwise from the bow; faces number clockwise. Faces: 1 front-left,
// 2 forward, 3 front-right, 4 rear-right, 5 rear, 6 rear-left.

const clone = (v) => JSON.parse(JSON.stringify(v));
const norm = (v) => ((v % 6) + 6) % 6;
const key = (p) => `${p.q},${p.r}`;
const canvas = $("#play-canvas"), ctx = canvas.getContext("2d");
const schematic = $("#schematic"), sctx = schematic.getContext("2d");
const audio = createCombatAudio();
const state = {
  tuning: null, loadouts: null, scenario: null, battle: null, view: null, record: null,
  humanSide: "A", selected: null, round: 0, orders: {}, phase: "setup", icons: new Map(),
  camera: { zoom: 1, x: 0, y: 0 }, displayShips: null, effects: [], setupMode: "quick",
  selectedMount: null, forecastKey: null, forecast: null, grid: false, labelBoxes: [],
  initialScenario: null, briefingStep: 0, alertTimer: null, shakeUntil: 0, shakeMagnitude: 0
};

// ------------------------------------------------------------ hex geometry


function setStatus(message) { $("#setup-message").textContent = message; }
function label(name) { return name.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function updateMissionSummary() {
  const panel = $("#mission-summary");
  if (!state.scenario || !state.view) { panel.hidden = true; return; }
  panel.hidden = false;
  $("#mission-name").textContent = state.scenario.name;
  $("#mission-brief").textContent = state.scenario.name;
  $("#mission-clock").textContent = `turn ${state.view.turn} / ${state.view.maxTurns}`;
  const victory = state.scenario.victory;
  $("#mission-objective").textContent = victory?.text ||
    `Destroy the enemy fleet. If time expires after turn ${state.view.maxTurns}, surviving fleet points decide the battle.`;
  const protectedClass = victory?.type === "flagship" ? victory.protectedClass : null;
  if (!protectedClass) { $("#objective-assets").replaceChildren(); return; }
  const enemySide = state.humanSide === "A" ? "B" : "A";
  const row = (side, role) => {
    const ship = state.view.ships.find((entry) => entry.side === side && entry.className === protectedClass[side]);
    const hull = ship ? `${Math.max(0, ship.superstructure)} / ${ship.superstructureMax}` : "LOST";
    return `<div class="objective-asset ${role}" style="border-color:${role === "mine" ? COLORS[ship?.faction] || "var(--accent)" : "#d66b58"}"><span>${role === "mine" ? "PROTECT" : "DESTROY"}</span><b>${esc(ship ? shipLabel(ship) : label(protectedClass[side]))}</b><em>${hull}</em></div>`;
  };
  $("#objective-assets").innerHTML = row(state.humanSide, "mine") + row(enemySide, "enemy");
}
function renderBriefing() {
  const tutorial = state.scenario?.tutorial;
  if (!tutorial?.steps?.length) return;
  const step = Math.max(0, Math.min(tutorial.steps.length - 1, state.briefingStep));
  state.briefingStep = step;
  $("#briefing-kicker").textContent = `COMMAND BRIEFING · ${step + 1} OF ${tutorial.steps.length}`;
  $("#briefing-title").textContent = tutorial.title || state.scenario.name;
  $("#briefing-copy").textContent = tutorial.steps[step];
  $("#briefing-progress").innerHTML = tutorial.steps.map((_, index) => `<i class="${index <= step ? "active" : ""}"></i>`).join("");
  $("#briefing-back").disabled = step === 0;
  $("#briefing-next").textContent = step === tutorial.steps.length - 1 ? "Begin engagement" : "Next";
}
function showBriefing() {
  if (!state.scenario?.tutorial?.steps?.length) return false;
  state.briefingStep = 0; renderBriefing(); $("#briefing-panel").hidden = false; $("#end-turn").disabled = true; return true;
}
function advanceBriefing(delta) {
  const steps = state.scenario?.tutorial?.steps || [];
  if (!steps.length) return;
  if (delta > 0 && state.briefingStep >= steps.length - 1) {
    $("#briefing-panel").hidden = true; $("#end-turn").disabled = state.phase !== "planning"; audio.cue("engage");
    const first = state.view.ships.find((ship) => ship.side === state.humanSide && !ship.destroyed);
    if (first) selectShip(first.id);
    return;
  }
  state.briefingStep = Math.max(0, Math.min(steps.length - 1, state.briefingStep + delta));
  audio.cue("ui"); renderBriefing();
}
function geometry() {
  const rect = canvas.getBoundingClientRect(), map = state.view?.map || state.scenario?.map || { widthHexes: 72, heightHexes: 40 };
  const scale = Math.max(1, Math.min(rect.width / (Math.sqrt(3) * (map.widthHexes + 3)), rect.height / (1.5 * (map.heightHexes + 3)))) * state.camera.zoom;
  return { width: rect.width, height: rect.height, scale, cx: rect.width / 2 + state.camera.x, cy: rect.height / 2 + state.camera.y };
}
function project(pos, geo = geometry()) { const p = axialToWorld(pos); return { x: geo.cx + p.x * geo.scale, y: geo.cy + p.y * geo.scale }; }
function eventHex(event) { const rect = canvas.getBoundingClientRect(), geo = geometry(); return snapWorldToHex((event.clientX - rect.left - geo.cx) / geo.scale, (event.clientY - rect.top - geo.cy) / geo.scale); }
function hexPath(c, x, y, radius) { c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); }
function inMap(pos, map) { return Math.abs(pos.q + pos.r / 2) <= map.widthHexes / 2 + 1e-9 && Math.abs(pos.r) <= map.heightHexes / 2 + 1e-9; }
function dirAngle(direction) { return -direction * Math.PI / 3; } // screen angle of a hex direction (icons rotate the same way)

// ------------------------------------------------------------------- map
function drawGrid(geo) {
  const map = state.view?.map || state.scenario?.map; if (!map) return;
  if (!state.grid) return;
  ctx.strokeStyle = "rgba(130,161,181,.09)"; ctx.lineWidth = 1;
  const halfR = Math.ceil(map.heightHexes / 2), halfW = Math.ceil(map.widthHexes / 2);
  for (let r = -halfR; r <= halfR; r++) for (let q = -halfW; q <= halfW; q++) if (inMap({ q, r }, map)) { const p = project({ q, r }, geo); if (p.x < -geo.scale || p.y < -geo.scale || p.x > geo.width + geo.scale || p.y > geo.height + geo.scale) continue; hexPath(ctx, p.x, p.y, geo.scale); ctx.stroke(); }
}
function drawTerrain(geo) {
  for (const item of state.view?.terrain || state.scenario?.terrain || []) for (const cell of terrainFootprint(item)) {
    const p = project(cell, geo); hexPath(ctx, p.x, p.y, geo.scale * .88);
    const fill = { planet: "#816b4a", moon: "#9ca5a7", asteroid: "#765f4d", asteroids: "rgba(155,127,91,.35)", nebula: "rgba(89,74,137,.38)" }[item.type] || "#666";
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = item.type === "asteroids" ? "#bba273" : "#aaa8"; ctx.stroke();
  }
}
function drawArcs(ship, geo) {
  const mount = ship.mounts.find(m => m.id === state.selectedMount) || ship.mounts[0];
  if (!mount) return;
  const action = forecastFor(ship)?.actions[state.round];
  const origin = action?.end || { ...ship.pos, facing: ship.facing };
  const center = project(origin, geo), outer = Math.hypot(geo.width, geo.height);
  const directions = new Set(mount.arc.map(face => norm(origin.facing + OFFSET_OF_FACE[face])));
  ctx.save(); ctx.strokeStyle = mount.inop ? "#ffafa2" : WEAPON_COLORS[mount.type] || "#dbe5e9"; ctx.lineWidth = 1.3; ctx.globalAlpha = .65;
  ctx.setLineDash(mount.inop || action?.moving ? [4, 6] : []);
  for (const dir of directions) {
    for (const [neighbor, offset] of [[norm(dir - 1), Math.PI / 6], [norm(dir + 1), -Math.PI / 6]]) {
      if (directions.has(neighbor)) continue;
      const angle = dirAngle(dir) + offset;
      ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + Math.cos(angle) * outer, center.y + Math.sin(angle) * outer); ctx.stroke();
    }
  }
  ctx.restore();
  $("#arc-caption").textContent = `Mount ${ship.mounts.indexOf(mount) + 1} · ${action ? "A" + (state.round + 1) : "current"} heading · bearing only, not range / line of fire`;
}
function drawShield(ship, geo) {
  const center = project(ship.pos, geo), radius = geo.scale * 1.15;
  for (let face = 1; face <= 6; face++) {
    const max = Math.max(ship.shieldGenerators?.[face]?.capacity ?? ship.shieldMax ?? 0, 1);
    const direction = norm(ship.facing + OFFSET_OF_FACE[face]), a = dirAngle(direction), a1 = a - Math.PI / 6, a2 = a + Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius); ctx.lineTo(center.x + Math.cos(a2) * radius, center.y + Math.sin(a2) * radius); ctx.closePath();
    ctx.fillStyle = ship.shieldDown[face] ? "rgba(236,101,93,.38)" : `rgba(84,168,255,${.08 + .3 * ship.shieldCap[face] / max})`; ctx.fill();
    ctx.strokeStyle = ship.shieldDown[face] ? "#ec655d" : "rgba(120,200,255,.75)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = ship.shieldDown[face] ? "#ffd0cc" : "#dff1ff"; ctx.font = `bold ${Math.max(9, geo.scale * .3)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(String(face), center.x + Math.cos(a) * radius * .78, center.y + Math.sin(a) * radius * .78 + 3);
  }
}
function forecastFor(ship) {
  if (!ship || ship.destroyed || ship.side !== state.humanSide || state.phase !== "planning") return null;
  const order = ensureOrder(ship), cacheKey = `${state.battle.turn}:${ship.id}:${JSON.stringify(order)}`;
  if (state.forecastKey !== cacheKey) { state.forecast = previewOrders(state.battle, ship.id, order); state.forecastKey = cacheKey; }
  return state.forecast;
}
function plannedRoute(ship) {
  const prediction = forecastFor(ship);
  const points = prediction?.route || [{ ...ship.pos, facing: ship.facing, round: 0 }];
  points.spent = prediction?.movement ?? 0;
  return points;
}
function drawPlan(ship, geo) {
  const route = plannedRoute(ship), readings = courseReadings(forecastFor(ship), ensureOrder(ship));
  ctx.save(); ctx.lineJoin = "round";
  // Render every leg regardless of the action being edited. A dark underlay
  // separates the course from terrain, bearing rays and overlapping ship labels.
  let previous = route[0];
  for (const round of [...new Set(route.slice(1).map(p => p.round))]) {
    const points = route.filter(p => p.round === round);
    // An unfunded move or hold has no line segment, only an endpoint/status.
    if (!points.some(p => p.q !== previous.q || p.r !== previous.r)) { previous = points.at(-1); continue; }
    ctx.beginPath();
    const start = project(previous, geo); ctx.moveTo(start.x, start.y);
    for (const point of points) { const p = project(point, geo); ctx.lineTo(p.x, p.y); }
    ctx.setLineDash([]); ctx.lineWidth = 6; ctx.strokeStyle = "#081119"; ctx.stroke();
    ctx.setLineDash([7, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = round === state.round + 1 ? "#ffc77d" : "#e9fbff"; ctx.stroke();
    previous = points.at(-1);
  }
  ctx.setLineDash([]);
  const occupied = state.labelBoxes.map(b => ({ x: b.x, y: b.y - 12, w: b.w, h: b.h }));
  for (const vessel of state.view.ships.filter(s => !s.destroyed)) {
    const p = project(vessel.pos, geo), size = Math.max(28, geo.scale * 1.2);
    occupied.push({ x: p.x - size / 2, y: p.y - size / 2, w: size, h: size });
  }
  for (const marker of courseMarkers(route)) {
    const p = project(marker, geo), active = marker.actions.some(a => a.round === state.round + 1);
    if (p.x < 0 || p.x > geo.width || p.y < 0 || p.y > geo.height) continue;
    const limits = marker.actions.map(a => readings.find(r => r.round === a.round)).filter(r => r?.limited);
    const text = marker.actions.map(a => {
      const reading = readings.find(r => r.round === a.round);
      return `A${a.round}${reading?.special==='warp'?' WARP':reading?.limited && reading.moved < reading.requested ? ` ${reading.moved}/${reading.requested}` : a.hold ? " F" : ""}`;
    }).join(" / ");
    const warning = [...new Set(limits.map(r => r.reason))].join(" / ");
    const color = warning ? "#ffafa2" : active ? "#ffc77d" : "#e9fbff";
    const heading = marker.actions.find(a => a.round === state.round + 1) || marker.actions.at(-1);
    const angle = dirAngle(heading.facing), length = Math.max(11, geo.scale * 1.2);
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(angle) * length, p.y + Math.sin(angle) * length); ctx.stroke();
    ctx.fillStyle = "#081119"; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (warning) {
      // A perpendicular stop bar makes a clamped endpoint distinct from an
      // ordinary waypoint even without color perception.
      const dx = Math.cos(angle + Math.PI / 2) * 8, dy = Math.sin(angle + Math.PI / 2) * 8;
      ctx.beginPath(); ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy); ctx.stroke();
    }
    // Offset the tag from the hex: holds at the vessel's current position must
    // not obscure the ship, and co-located actions share one readable tag.
    ctx.font = "bold 11px Bahnschrift, sans-serif"; ctx.textAlign = "center";
    const width = Math.max(ctx.measureText(text).width, ctx.measureText(warning).width) + 12, height = warning ? 34 : 20;
    const candidates = [[12, -32], [12, 12], [-width - 12, -32], [-width - 12, 12], [12, 38], [12, -58]]
      .map(([dx, dy]) => ({ x: Math.max(2, Math.min(geo.width - width - 2, p.x + dx)), y: Math.max(44, Math.min(geo.height - height - 24, p.y + dy)), w: width, h: height }));
    const tag = candidates.find(a => !occupied.some(b => a.x < b.x + b.w + 3 && a.x + a.w + 3 > b.x && a.y < b.y + b.h + 3 && a.y + a.h + 3 > b.y)) || candidates[0];
    occupied.push(tag);
    const { x, y } = tag;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(Math.max(x, Math.min(x + width, p.x)), Math.max(y, Math.min(y + height, p.y))); ctx.stroke();
    ctx.fillStyle = "#081119"; ctx.fillRect(x, y, width, height); ctx.strokeRect(x, y, width, height);
    ctx.fillStyle = color;
    if (warning) ctx.fillText(warning, x + width / 2, y + 13);
    ctx.fillText(text, x + width / 2, y + (warning ? 27 : 14));
  }
  ctx.restore();
}
function drawTarget(ship, geo) {
  const id = state.orders[ship.id]?.target; if (!id || id === "auto") return;
  const target = state.view.ships.find((s) => s.id === id); if (!target) return;
  const a = project(ship.pos, geo), b = project(target.pos, geo);
  ctx.strokeStyle = "rgba(236,101,93,.85)"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = "#ec655d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, geo.scale * .8, 0, Math.PI * 2); ctx.stroke();
}
function drawShip(ship, geo) {
  const p = project(ship.pos, geo), color = COLORS[ship.faction] || "#ddd", selected = ship.id === state.selected;
  if (selected && state.phase === "planning") { drawArcs(ship, geo); drawShield(ship, geo); if (ship.side === state.humanSide) drawTarget(ship, geo); }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(dirAngle(ship.facing) + Math.PI / 2); // icons are drawn nose-up
  if (selected) { ctx.strokeStyle = "#fff0b5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, geo.scale * .66, 0, Math.PI * 2); ctx.stroke(); }
  const image = state.icons.get(`${ship.faction}/${ship.className}`);
  const size = Math.max(28, geo.scale * 1.2);
  if (image) ctx.drawImage(image, -size / 2, -size / 2, size, size);
  else { ctx.beginPath(); ctx.moveTo(0, -size / 2); ctx.lineTo(-size / 3, size / 2); ctx.lineTo(size / 3, size / 2); ctx.closePath(); ctx.strokeStyle = color; ctx.stroke(); }
  ctx.restore();
  if (selected || geo.scale >= 9 || state.view.ships.length <= 12) {
    ctx.font = "13px Bahnschrift, sans-serif"; ctx.textAlign = "center";
    const text = shipLabel(ship), width = ctx.measureText(text).width + 8;
    for (const offset of [0, 16, 32, -48, -64]) {
      const box = { x:p.x - width / 2, y:p.y + Math.max(19, geo.scale * .85) + offset, w:width, h:16 };
      if (state.labelBoxes.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
      if (offset) {
        ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = .6; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y + (offset < 0 ? -size / 2 : size / 2)); ctx.lineTo(p.x, box.y + (offset < 0 ? 4 : -12)); ctx.stroke(); ctx.restore();
      }
      state.labelBoxes.push(box); ctx.fillStyle = "#050b11de"; ctx.fillRect(box.x, box.y - 12, box.w, box.h); ctx.fillStyle = selected ? "#fff0b5" : color; ctx.fillText(text, p.x, box.y); break;
    }
  }
}
function drawEffects(geo) {
  // Beams, missiles and impacts for the round being played back.
  const now = performance.now();
  for (const fx of state.effects) {
    if (now < fx.start) continue;
    const t = Math.min(1, (now - fx.start) / fx.duration);
    const a = project(fx.from, geo), b = project(fx.to, geo);
    if (fx.kind === "beam") {
      ctx.strokeStyle = fx.color; ctx.globalAlpha = 1 - t * .7; ctx.lineWidth = Math.max(1.5, geo.scale * (fx.heavy ? .12 : .06)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
      if (fx.hit) { ctx.fillStyle = fx.color; ctx.globalAlpha = (1 - t) * .8; ctx.beginPath(); ctx.arc(b.x, b.y, geo.scale * .45 * (1 + t), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (fx.kind === "missile") {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      ctx.strokeStyle = fx.color; ctx.globalAlpha = .35; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = fx.color; ctx.beginPath(); ctx.arc(x, y, Math.max(2, geo.scale * .18), 0, Math.PI * 2); ctx.fill();
    } else if (fx.kind === "strike") {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      ctx.strokeStyle = fx.color; ctx.globalAlpha = .4; ctx.setLineDash([2, 5]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = fx.color; ctx.globalAlpha = .9;
      for (let n = -1; n <= 1; n++) { ctx.beginPath(); ctx.arc(x + n * 5, y + Math.abs(n) * 3, Math.max(1.5, geo.scale * .1), 0, Math.PI * 2); ctx.fill(); }
      if (fx.hit && t > .72) { ctx.strokeStyle = "#fff4d6"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, geo.scale * (t - .65), 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    } else if (fx.kind === "impact") {
      ctx.fillStyle = fx.color; ctx.globalAlpha = (1 - t) * .9; ctx.beginPath(); ctx.arc(b.x, b.y, geo.scale * .5 * (1 + 1.5 * t), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = 1 - t; ctx.fillText(fx.text, b.x, b.y - geo.scale * .9); ctx.globalAlpha = 1;
    }
  }
  state.effects = state.effects.filter((fx) => now - fx.start < fx.duration);
}
function frameFleets(margin = 4) {
  const ships = (state.view?.ships || []).filter((ship) => !ship.destroyed);
  if (!ships.length) return;
  const pts = ships.map((ship) => axialToWorld(ship.pos));
  const minX = Math.min(...pts.map((p) => p.x)) - margin * 1.8, maxX = Math.max(...pts.map((p) => p.x)) + margin * 1.8;
  const minY = Math.min(...pts.map((p) => p.y)) - margin * 1.5, maxY = Math.max(...pts.map((p) => p.y)) + margin * 1.5;
  const rect = canvas.getBoundingClientRect();
  const saved = { ...state.camera }; state.camera = { zoom: 1, x: 0, y: 0 }; const base = geometry().scale; state.camera = saved;
  const zoom = Math.max(0.65, Math.min(6, Math.min(rect.width / ((maxX - minX) * base), rect.height / ((maxY - minY) * base))));
  state.camera.zoom = zoom; const scale = base * zoom;
  state.camera.x = -((minX + maxX) / 2) * scale; state.camera.y = -((minY + maxY) / 2) * scale;
}
function draw() {
  const dpr = devicePixelRatio || 1, rect = canvas.getBoundingClientRect();
  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) { canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height);
  const now = performance.now();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && now < state.shakeUntil) {
    const falloff = (state.shakeUntil - now) / 420;
    ctx.translate(Math.sin(now * .09) * state.shakeMagnitude * falloff, Math.cos(now * .13) * state.shakeMagnitude * falloff);
  }
  const geo = geometry(); state.labelBoxes = [];
  // The persistent course warning occupies plot space, not command-deck space.
  // Reserve it before placing ship names and waypoint tags.
  const legend = $("#map-legend");
  if (!legend.hidden) {
    const box = legend.getBoundingClientRect();
    state.labelBoxes.push({ x: box.left - rect.left, y: box.top - rect.top + 12, w: box.width, h: box.height });
  }
  drawGrid(geo); drawTerrain(geo);
  for (const ship of state.displayShips || state.view?.ships || []) if (!ship.destroyed) drawShip(ship, geo);
  const plannedShip = selectedShip();
  if (state.phase === "planning" && plannedShip && !plannedShip.destroyed && plannedShip.side === state.humanSide) drawPlan(plannedShip, geo);
  drawEffects(geo);
  $("#map-legend").hidden = !(state.phase === "planning" && selectedShip());
}

// ------------------------------------------------------------- schematic
function drawSchematic(ship) {
  const w = schematic.width, h = schematic.height, cx = w / 2, cy = h / 2, radius = 112;
  sctx.clearRect(0, 0, w, h);
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  for (const face of shields(ship)) {
    const angle = -Math.PI / 2 - OFFSET_OF_FACE[face.face] * Math.PI / 3;
    sctx.beginPath(); sctx.arc(cx, cy, radius, angle - Math.PI / 6 + .06, angle + Math.PI / 6 - .06);
    sctx.lineWidth = 14; sctx.strokeStyle = "#43535d"; sctx.stroke();
    if (face.remaining && !face.down) {
      sctx.beginPath(); sctx.arc(cx, cy, radius, angle - Math.PI / 6 + .06, angle - Math.PI / 6 + .06 + (Math.PI / 3 - .12) * face.remaining / Math.max(1, face.max)); sctx.strokeStyle = accent; sctx.stroke();
    }
    sctx.font = "bold 26px Bahnschrift, sans-serif"; sctx.textAlign = "center"; sctx.fillStyle = face.down ? "#ffafa2" : "#e9f4f6";
    sctx.fillText(face.down ? `${face.face} ×` : String(face.face), cx + Math.cos(angle) * 147, cy + Math.sin(angle) * 147 + 9);
  }
  const image = state.icons.get(`${ship.faction}/${ship.className}`);
  if (image) sctx.drawImage(image, cx - 55, cy - 55, 110, 110);
  else { hexPath(sctx, cx, cy, 48); sctx.strokeStyle = accent; sctx.lineWidth = 3; sctx.stroke(); }
  sctx.fillStyle = "#b3c4ce"; sctx.font = "18px Bahnschrift, sans-serif"; sctx.textAlign = "center"; sctx.fillText("BOW", cx, cy - 72);
  const mount = ship.mounts.find(m => m.id === state.selectedMount);
  if (mount?.position) {
    sctx.beginPath(); sctx.arc(cx + mount.position.x * 55, cy - mount.position.y * 55, 6, 0, Math.PI * 2);
    sctx.fillStyle = '#edb478'; sctx.fill();
  }
  if (mount) for (const face of mount.arc) {
    const a = -Math.PI / 2 - OFFSET_OF_FACE[face] * Math.PI / 3;
    sctx.beginPath(); sctx.arc(cx, cy, 88, a - Math.PI / 6 + .07, a + Math.PI / 6 - .07); sctx.lineWidth = 3; sctx.strokeStyle = mount.inop ? "#ffafa2" : "#edb478"; sctx.stroke();
  }
}

function fireSolution(ship) {
  const forecast = forecastFor(ship), action = forecast?.actions[state.round];
  const mount = ship.mounts.find(m => m.id === state.selectedMount);
  if (!mount) { $("#fire-solution").textContent = "No weapon mounts."; return; }
  const reading = action?.mounts.find(m => m.mountId === mount.id);
  const target = state.view.ships.find(s => s.id === reading?.targetId);
  const status = reading ? `${reading.reason}${target ? ` → ${shipLabel(target)}, ${reading.range} hex, ${format(reading.power)} power` : ""}` : mount.inop ? "Offline" : mount.firedThisTurn ? "Fired this turn" : "Inspection only";
  $("#fire-solution").innerHTML = `<p><strong>${esc(status)}</strong> · ${esc(arcLabel(mount.arc,state.tuning.arcs))} · max ${mount.maxRange} hex</p><p class="instrument-note">${esc(forecast ? "Forecast only: stationary contacts; damage and initiative can change the outcome." : "Recorded state; no orders forecast.")}</p>`;
}

// ------------------------------------------------------------- orders UI
function ensureOrder(ship) {
  if (!state.orders[ship.id]) state.orders[ship.id] = { plan: Array.from({ length: state.view.roundsPerTurn }, () => ({ turn: 0, forward: 0 })), target: "auto", reserve: .3 };
  return state.orders[ship.id];
}
function selectedShip() {
  const base = state.view?.ships.find(s => s.id === state.selected);
  const frame = state.displayShips?.find(s => s.id === state.selected);
  if (!base || !frame) return base;
  return { ...base, ...frame,
    shieldsBypassed: state.tuning.battle?.terrainRules?.nebula?.shieldsUseless !== false && state.view.terrain.some(t => t.type === "nebula" && t.q === frame.pos.q && t.r === frame.pos.r),
    mounts: base.mounts.map(m => ({ ...m, ...frame.mounts?.find(f => f.id === m.id) })) };
}
function ordersAllowed(ship = selectedShip()) {
  return !!(ship && !ship.destroyed && ship.side === state.humanSide && state.phase === "planning" && !["setup-panel", "briefing-panel", "help-panel"].some(id => !$("#" + id).hidden));
}

function markFormation(name = null) {
  document.querySelectorAll("[data-formation]").forEach((button) => button.classList.toggle("active", button.dataset.formation === name));
}
function applyFormation(name) {
  if (!state.view || state.phase !== "planning" || !$("#briefing-panel").hidden || !$("#help-panel").hidden) return;
  const ships = state.view.ships.filter((ship) => ship.side === state.humanSide && !ship.destroyed);
  const planned = formationOrders(ships, state.view.roundsPerTurn, name, (ship) => shipPlan(state.battle, ship.id));
  Object.assign(state.orders, planned);
  const preset = FORMATION_PRESETS[name];
  markFormation(name);
  $("#formation-status").textContent = `${preset.label} sent to ${ships.length} vessel${ships.length === 1 ? "" : "s"}. Select any ship to refine its helm, reserve, or target.`;
  audio.cue("ui");
  if (!state.selected && ships.length) state.selected = ships[0].id;
  renderFleet(); updateOrderPanel(); draw();
}
function markIndividualOverride() {
  markFormation();
  $("#formation-status").textContent = "Individual helm change entered. Other vessels retain the formation plan.";
}
function actionText(entry) { if(entry.warp)return 'warp insertion';if (!entry.turn && !entry.forward && !entry.burst) return "hold & fire"; const t = entry.turn ? `turn ${entry.turn > 0 ? "port" : "starboard"} ${Math.abs(entry.turn)}` : ""; const f = entry.forward ? `${entry.forward} hex${entry.forward === 1 ? "" : "es"}` : "turn only"; return [t, entry.forward ? f : "",entry.burst?`+${entry.burst} burst`:""].filter(Boolean).join(", ") || f; }
function updateOrderPanel() {
  const ship = selectedShip(), panel = $("#orders-panel");
  panel.hidden = !ship; $("#command-deck").hidden = !ship;
  if (!ship) { $("#damage-summary").textContent = "Awaiting vessel telemetry"; return; }
  const focused = document.activeElement;
  const focusMount = focused?.dataset.mount, focusRound = focused?.dataset.round;
  if (!ship.mounts.some(m => m.id === state.selectedMount)) state.selectedMount = ship.mounts.find(m => !m.inop)?.id || ship.mounts[0]?.id;
  const mine = ship.side === state.humanSide, allowed = ordersAllowed(ship), forecast = forecastFor(ship), action = forecast?.actions[state.round];
  const order = mine && !ship.destroyed ? ensureOrder(ship) : null;
  const course = courseReadings(forecast, order), limits = course.filter(r => r.limited);
  document.querySelectorAll("[data-formation]").forEach(b => { b.disabled = state.phase !== "planning"; });
  const entry = order?.plan[state.round];
  const specials=shipPlan(state.battle,ship.id)?.specials;
  $("#special-controls").hidden=!mine||(!specials?.warp&&!specials?.burst);
  $("#warp-action").hidden=!specials?.warp;$("#warp-action").disabled=!allowed;$("#warp-action").setAttribute('aria-pressed',String(!!entry?.warp));
  $("#burst-control").hidden=!specials?.burst;$("#burst-extra").disabled=!allowed;$("#burst-extra").max=specials?.burst?.maxExtraHexes??0;
  $("#burst-extra").value=entry?.burst??0;
  $("#special-note").textContent=specials?.warp?`Warp: ${format(specials.warp.powerCost)} power (can spend reserve), ${specials.warp.rangeHexes} hex limit; one action. Target selector chooses the insertion contact. Fleet quota and actual positions can change the forecast.`:specials?.burst?`Burst: up to ${specials.burst.maxExtraHexes} extra forward hexes, no power. Once per turn with movement: ${specials.burst.stressDamage} hull stress, −${specials.burst.toHitPenalty} accuracy. No gained burst hexes means no cost.`:'';
  $("#ship-name").textContent = shipLabel(ship);
  $("#ship-name").title = ship.id;
  $("#vessel-status").textContent = `${FACTIONS[ship.faction] || ship.faction} · ${ship.points} pts · ${ship.destroyed ? "DESTROYED" : mine ? "YOUR VESSEL" : "ENEMY — INSPECTION"} · ${HEADINGS[ship.facing]} / ${ship.facing}`;
  $("#vessel-select").value = ship.id;
  $("#ro-hull").textContent = `${format(Math.max(0, ship.superstructure))} / ${format(ship.superstructureMax)} · ${Math.round(Math.max(0, ship.superstructure) / Math.max(1, ship.superstructureMax) * 100)}%`;
  $("#ro-power").textContent = format(ship.power);
  $("#power-output").textContent = `${format(ship.fullPower)} / ${format(ship.ratedPower)} output`;
  $("#ro-speed").textContent = `${format(ship.movementPointRatio)} power / hex`;
  $("#ro-turn").textContent = `Turn ±${ship.turnRate} / action`;
  $("#ro-mag").textContent = format(ship.magazine);
  $("#shield-readouts").innerHTML = shields(ship).map(f => `<div class="shield-face ${f.down ? "offline" : ""}" title="${FACE_NAMES[f.face]} — ${f.status}; can absorb ${f.absorbable} points with current power${ship.shieldGenerators ? `; ${esc(ship.shieldGenerators[f.face].displayName)}; ${format(ship.shieldGenerators[f.face].powerPerDamage)} power per damage` : ''}"><span>${f.face}</span><span>${format(f.remaining)} / ${format(f.max)}</span><span>${f.down ? "OUT" : f.percent + "%"}</span></div>`).join("");
  const affordable = ship.shieldGenerators ? Math.max(...Object.values(ship.shieldGenerators).map(g=>Math.floor(Math.max(0,ship.power)/g.powerPerDamage))) : ship.shieldPointRatio > 0 ? Math.floor(Math.max(0, ship.power) / ship.shieldPointRatio) : 0;
  $("#shield-note").textContent = ship.shieldsBypassed ? "NEBULA: shields bypassed despite intact generators." : affordable === 0 ? "NO POWER — intact shield caps cannot absorb damage." : ship.shieldGenerators ? "Per-face capacities and efficiencies · shared power pool. Details in Damage control." : `Round caps · shared pool: ${affordable} pts × ${format(ship.shieldPointRatio)} power`;
  $("#shield-note").title = "Each face is capped separately per round; the six faces share the same power pool. Absorption is limited by both the struck face and remaining power.";
  $("#shield-note").classList.toggle("warning", !!ship.shieldsBypassed || affordable === 0);
  drawSchematic(ship);
  for (const sel of ["#turn-left", "#turn-right", "#forward-up", "#forward-down", "#hold-button", "#reserve", "#target-auto", "#target-select"]) $(sel).disabled = !allowed;
  $("#round-tabs").innerHTML = (order?.plan || Array.from({ length:state.view.roundsPerTurn }, () => null)).map((e, i) => {
    const reading = course[i], limited = reading?.limited;
    const text = limited && reading.moved < reading.requested ? `${reading.moved}/${reading.requested} hex` : e ? actionText(e) : "Inspect";
    const title = limited ? reading.special==='warp'?reading.detail:`Forecast: ${reading.moved} of ${reading.requested} requested hexes. ${reading.detail}` : "";
    return `<button data-round="${i}" aria-pressed="${i === state.round}" title="${esc(title)}" class="${i === state.round ? "active" : ""} ${e && !e.turn && !e.forward && !e.warp && !e.burst ? "hold" : "move"} ${limited ? "limited" : ""}" ${state.phase !== "planning" || !mine || ship.destroyed ? "disabled" : ""}><small class="${limited ? "limit-reason" : ""}">${limited ? `A${i + 1} · ${esc(reading.reason)}` : `ACTION ${i + 1}`}</small>${esc(text)}</button>`;
  }).join("");
  $("#round-tabs").querySelectorAll("button").forEach(b => b.onclick = () => { state.round = Number(b.dataset.round); updateOrderPanel(); draw(); });
  $("#course-warning").hidden = !limits.length;
  $("#course-warning").innerHTML = limits.length ? `<strong>COURSE LIMITED · reachable / requested</strong> <span>${limits.map(r => r.special==='warp'?`A${r.round}: ${esc(r.detail)}`:`A${r.round}: ${r.moved}/${r.requested} hex · ${esc(r.reason.toLowerCase())}`).join("; ")}</span> <small>${limits.some(r => r.reason === "POWER LIMIT") ? `Movement and weapons share the turn's power; ${format(forecast.reserve)} power is reserved.` : "The plotted route stops at the reachable hex. Adjust the affected action."}</small>` : "";
  const reading = course[state.round];
  $("#forward-value").textContent = action?.unavailable ? "Cloak control — manual helm suspended" : allowed && entry ? reading?.limited && reading.moved < reading.requested ? `Requested: ${actionText(entry)} · reachable: ${reading.moved} hex` : actionText(entry) : state.phase === "playback" ? "Resolving orders…" : "Inspection only";
  const heading = action?.end.facing ?? ship.facing;
  $("#heading-needle").setAttribute("transform", `rotate(${90 - heading * 60} 60 60)`);
  $("#heading-value").textContent = `${HEADINGS[heading]} / ${heading}`;
  $("#course-note").textContent = action ? action.special?action.notes.join('; '):action.notes.find(n => /clamped/.test(n)) || `A${state.round + 1}: (${action.start.q}, ${action.start.r}) → (${action.end.q}, ${action.end.r})${action.moving ? " · no firing" : ""}` : "Select a friendly vessel to issue orders.";
  $("#reserve").value = order?.reserve ?? 0; $("#reserve-value").textContent = order ? `${Math.round(order.reserve * 100)}%` : "—";
  for (const [id, value] of [["movement-cost", forecast?.movement], ["gun-power", forecast?.weapons], ["reserve-power", forecast?.reserve]]) $("#" + id).textContent = format(value);
  for (const [id, value] of [["power-move", forecast?.movement], ["power-guns", forecast?.weapons], ["power-reserve", forecast?.reserve]]) $("#" + id).style.width = `${Math.min(100, (value || 0) / Math.max(1, ship.fullPower) * 100)}%`;
  $("#power-forecast").textContent = forecast ? `Forecast: ${format(forecast.overhead)} overhead / ${format(forecast.deck)} deck. ${format(forecast.remaining)} left; ${format(forecast.free)} free. Reserve stays in pool.` : "Current state only. Orders are unavailable.";
  $("#target-select").value = order?.target || "auto";
  $("#target-name").textContent = order?.target && order.target !== "auto" ? "Preferred target; other legal contacts remain eligible." : "Automatic selection · range and exposed shields";
  $("#turn-left").disabled = !allowed || entry?.turn >= ship.turnRate; $("#turn-right").disabled = !allowed || entry?.turn <= -ship.turnRate;
  $("#forward-down").disabled = !allowed || !entry?.forward;
  $("#fire-round-label").textContent = action ? `ACTION ${state.round + 1} FORECAST` : "CURRENT STATE";
  const shortReason = { "Outside bearing arc":"No arc", "Out of range":"Range", "Maneuver action":"Maneuver", "Spent this turn":"Spent", "Insufficient power":"Power", "Line of fire blocked":"Blocked", "No visible contact":"No contact", "Magazine empty":"Empty" };
  $("#mount-list").innerHTML = ship.mounts.map((m,i) => {
    const reading = action?.mounts.find(r => r.mountId === m.id), reason = reading?.reason || (m.inop ? "Offline" : m.firedThisTurn ? "Spent this turn" : "Ready");
    return `<button class="mount-key" data-mount="${esc(m.id)}" data-offline="${m.inop}" aria-pressed="${m.id === state.selectedMount}" title="${esc(label(m.displayName || m.type))}; ${esc(arcLabel(m.arc,state.tuning.arcs))}; ${m.maxRange} hex; ${esc(reason)}"><span class="mount-number">${String(i + 1).padStart(2,"0")}</span><span class="mount-title">${esc(label(m.displayName || m.type))}<small>${esc(arcLabel(m.arc,state.tuning.arcs))} · ${m.maxRange} hex</small></span><span class="mount-state">${esc(shortReason[reason] || reason)}</span></button>`;
  }).join("");
  $("#mount-list").querySelectorAll("button").forEach(b => b.onclick = () => { state.selectedMount = ship.mounts.find(m => String(m.id) === b.dataset.mount)?.id; updateOrderPanel(); draw(); });
  const offline = ship.mounts.filter(m => m.inop).length, down = Object.values(ship.shieldDown).filter(Boolean).length;
  const cores = ship.cores || [], liveCores = cores.filter(c => c.alive).length;
  $("#damage-summary").textContent = `${shipLabel(ship)} · cores ${liveCores}/${cores.length} · impulse ${format(ship.impulse)}/${format(ship.impulseMax)} · ${offline} mounts offline · ${down} shield generators down`;
  const systemHits = Object.entries(ship.systems || {});
  $("#damage-detail").innerHTML = `<p>${esc(shipLabel(ship))} · ${esc(ship.id)}</p><dl><dt>Hull remaining</dt><dd>${esc($("#ro-hull").textContent)}</dd><dt>Power output / rated</dt><dd>${format(ship.fullPower)} / ${format(ship.ratedPower)}</dd><dt>Live cores</dt><dd>${liveCores} / ${cores.length}</dd><dt>Impulse output / rated</dt><dd>${format(ship.impulse)} / ${format(ship.impulseMax)}</dd>${ship.mounts.filter(m => m.inop).map(m => `<dt>${esc(label(m.displayName || m.type))} · ${esc(m.id)}</dt><dd>OFFLINE</dd>`).join("")}${shields(ship).map(f => `<dt>Shield ${f.face} · ${FACE_NAMES[f.face]}</dt><dd>${f.remaining}/${f.max} · ${f.percent}% · ${f.status}</dd>`).join("")}${systemHits.map(([name,hits]) => `<dt>${esc(label(name))}</dt><dd>${esc(hits)} recorded hit(s)</dd>`).join("")}${ship.spinal ? `<dt>Spinal bank</dt><dd>${esc(ship.spinal.state)} · ${format(ship.spinal.charge)} charged</dd>` : ""}${ship.squadrons ? ship.squadrons.map(q => `<dt>${esc(q.type)} · ${esc(q.id.split("/").at(-1))}</dt><dd>${q.strength}/${q.max} · ${q.launched ? "launched" : "aboard"}</dd>`).join("") : ""}</dl><p>System hits are damage reports, not repair controls. ${systemHits.length ? "" : "No system hits recorded."}</p>`;
  fireSolution(ship);
  if (ship.shieldGenerators) $("#damage-detail").insertAdjacentHTML('beforeend', `<h3>COMPONENT ENGINEERING</h3><dl>${cores.map((c,i)=>`<dt>Reactor ${i+1} · ${esc(c.displayName)}</dt><dd>${c.alive ? `${format(c.power)} power online` : `OFFLINE · ${format(c.power)} rated power`}</dd>`).join('')}${[1,2,3,4,5,6].map(face=>{const g=ship.shieldGenerators[face];return `<dt>Shield ${face} · ${esc(g.displayName)}</dt><dd>${format(g.capacity)} cap · ${format(g.powerPerDamage)} power per damage</dd>`;}).join('')}</dl><p>Shield efficiencies apply to the struck face; all six spend the same power pool.</p>`);
  if (focusMount) $("#mount-list").querySelector(`[data-mount="${CSS.escape(focusMount)}"]`)?.focus({ preventScroll:true });
  if (focusRound !== undefined) $("#round-tabs").querySelector(`[data-round="${focusRound}"]`)?.focus({ preventScroll:true });
}
function renderFleet() {
  if (!state.view) return;
  $("#ship-list").innerHTML = state.view.ships.map(ship => {
    const mine = ship.side === state.humanSide, o = state.orders[ship.id];
    const summary = ship.destroyed ? "destroyed" : mine ? (o ? o.plan.map(e => e.warp?'W':e.burst?'B':(!e.turn && !e.forward) ? "F" : "M").join("·") : "hold & fire") : "target";
    return `<button class="ship-pick ${ship.id === state.selected ? "active" : ""} ${ship.destroyed ? "dead" : ""}" data-id="${esc(ship.id)}" title="${esc(ship.id)}"><i style="color:${COLORS[ship.faction]}"></i><span>${esc(shipLabel(ship))} · ${ship.faction}</span><small>${summary}</small></button>`;
  }).join("");
  $("#ship-list").querySelectorAll("button").forEach(button => button.onclick = () => { $("#fleet-drawer").hidden = true; selectShip(button.dataset.id); });
  $("#vessel-select").innerHTML = state.view.ships.map(ship => `<option value="${esc(ship.id)}">${esc(shipLabel(ship))} · ${ship.faction}${ship.destroyed ? " · WRECK" : ""}</option>`).join("");
  $("#vessel-select").value = state.selected || "";
  const target = state.orders[state.selected]?.target || "auto";
  $("#target-select").innerHTML = '<option value="auto">Automatic</option>' + state.view.ships.filter(s => !s.destroyed && s.side !== state.humanSide).map(s => `<option value="${esc(s.id)}">${esc(shipLabel(s))} · ${s.faction}</option>`).join("");
  $("#target-select").value = target;
}
function selectShip(id, inspect = false) {
  const ship = state.view?.ships.find(s => s.id === id); if (!ship) return;
  const current = selectedShip();
  if (!inspect && !ship.destroyed && ship.side !== state.humanSide && ordersAllowed(current)) { ensureOrder(current).target = id; markIndividualOverride(); renderFleet(); updateOrderPanel(); draw(); return; }
  if (state.selected !== id) state.round = 0;
  state.selected = id; state.selectedMount = null; renderFleet(); updateOrderPanel(); draw();
}

function adjustTurn(delta) { const ship = selectedShip(); if (!ordersAllowed(ship)) return; const order = ensureOrder(ship), limit = ship.turnRate; delete order.plan[state.round].warp;order.plan[state.round].turn = Math.max(-limit, Math.min(limit, order.plan[state.round].turn + delta)); markIndividualOverride(); renderFleet(); updateOrderPanel(); draw(); }
function adjustForward(delta) { const ship = selectedShip(); if (!ordersAllowed(ship)) return; const entry = ensureOrder(ship).plan[state.round]; delete entry.warp;entry.forward = Math.max(0, entry.forward + delta); markIndividualOverride(); renderFleet(); updateOrderPanel(); draw(); }
function holdAction() { const ship = selectedShip(); if (!ordersAllowed(ship)) return; const entry = ensureOrder(ship).plan[state.round]; delete entry.warp;delete entry.burst;entry.turn = 0; entry.forward = 0; markIndividualOverride(); renderFleet(); updateOrderPanel(); draw(); }
function setWarp(){const ship=selectedShip();if(!ordersAllowed(ship)||!shipPlan(state.battle,ship.id)?.specials?.warp)return;const order=ensureOrder(ship),was=order.plan[state.round].warp;order.plan[state.round]={turn:0,forward:0,...(!was?{warp:true}:{})};markIndividualOverride();renderFleet();updateOrderPanel();draw();}
function setBurst(value){const ship=selectedShip(),spec=ship&&shipPlan(state.battle,ship.id)?.specials?.burst;if(!ordersAllowed(ship)||!spec)return;const entry=ensureOrder(ship).plan[state.round];delete entry.warp;const n=Math.max(0,Math.min(spec.maxExtraHexes,Math.trunc(Number(value)||0)));if(n)entry.burst=n;else delete entry.burst;markIndividualOverride();renderFleet();updateOrderPanel();draw();}
function setSequence(step) { document.querySelectorAll("#sequence span").forEach((s) => s.classList.toggle("active", s.dataset.step === step)); }
function refreshView() { state.forecastKey = null; state.view = battleView(state.battle); state.displayShips = null; $("#turn-label").textContent = `Turn ${state.view.turn} · Planning`; updateMissionSummary(); renderFleet(); updateOrderPanel(); draw(); }
function appendLog(entries) { state.record.log.push(...entries); $("#log-lines").innerHTML = state.record.log.slice(-120).map((entry) => `<li class="${entry.kind || ""}">${esc(entry.message)}</li>`).join(""); $("#log-count").textContent = `${state.record.log.length} events`; $("#log-lines").scrollTop = $("#log-lines").scrollHeight; }

// -------------------------------------------------------------- playback
function shipAt(frame, id) { return frame?.ships.find((s) => s.id === id); }
function narrateShots(shots, frame, prevFrame) {
  const lines = [];
  for (const s of shots) {
    const before = lines.length;
    if (s.kind === "beam" || s.kind === "spinal") lines.push({ turn: s.turn, round: s.round, kind: s.hit ? "hit" : "miss", message: `${s.shooterId} fires ${label(s.weapon)} at ${s.targetId}, range ${s.range}: ${s.hit ? `HIT for ${s.damage}` : "miss"}` });
    else if (s.kind === "launch") lines.push({ turn: s.turn, round: s.round, kind: "launch", message: `${s.shooterId} launches ${label(s.weapon)} at ${s.targetId}, range ${s.range} (warhead ${s.damage}) — arrives next turn` });
    else if (s.kind === "missile") lines.push({ turn: s.turn, round: s.round, kind: s.outcome === "hit" ? "hit" : "miss", message: `${label(s.weapon)} from ${s.shooterId || "?"} → ${s.targetId}: ${s.outcome === "hit" ? `HIT for ${s.damage}` : s.outcome}` });
    else if (s.kind === "strike") lines.push({
      turn: s.turn, round: s.round, kind: (s.hits ?? 0) > 0 ? "hit" : "strike",
      message: `${s.squadronId || "squadron"} strikes ${s.targetId || "target"}: ${(s.hits ?? 0) > 0 ? `${s.hits} hit for ${s.damage}` : "driven off"}`
    });
    if (lines.length > before) lines.at(-1).message += hitAttribution(s);
  }
  return lines;
}
function combatFeedback(shots) {
  const hits = shots.filter((shot) => shot.hit === true || shot.outcome === "hit" || (shot.kind === "strike" && (shot.hits ?? 0) > 0));
  const damage = hits.reduce((total, shot) => total + (shot.damage ?? 0), 0);
  if (!hits.length) return;
  state.shakeMagnitude = Math.min(9, 2 + damage / 18);
  state.shakeUntil = performance.now() + 420;
  const flash = $("#impact-flash"); flash.classList.remove("active"); void flash.offsetWidth; flash.classList.add("active");
  const alert = $("#combat-alert");
  alert.textContent = damage > 0 ? `${hits.length} impact${hits.length === 1 ? "" : "s"} · ${Math.round(damage)} damage` : "Weapons impact";
  alert.classList.add("active");
  clearTimeout(state.alertTimer);
  state.alertTimer = setTimeout(() => alert.classList.remove("active"), 1300);
}
function spawnEffects(shots, frame, prevFrame) {
  const lookup = id => shipAt(frame, id) || shipAt(prevFrame, id);
  const t0 = performance.now(); let i = 0; const sounded = {};
  const cue = (name, delay) => { sounded[name] = (sounded[name] || 0) + 1; if (sounded[name] <= 2) audio.cue(name, delay); };
  for (const s of shots) {
    const { shooter, target, attackFrom } = eventShips(s, lookup);
    const from = shooter?.pos, to = target?.pos; if (!to) continue;
    const color = WEAPON_COLORS[s.weapon] || "#fff", delay = (i++ % 6) * 90;
    if ((s.kind === "beam" || s.kind === "spinal") && from) {
      state.effects.push({ kind: "beam", from, to, color, hit: s.hit, heavy: s.kind === "spinal" || /blaster/.test(s.weapon), start: t0 + delay, duration: 700 });
      cue(s.kind === "spinal" ? "spinal" : "beam", delay / 1000);
    } else if (s.kind === "launch" && from) {
      // Modern launches travel only their recorded first segment, below. Old
      // recordings without an ID retain their original abstract launch effect.
      if (!s.missileId) state.effects.push({ kind: "missile", from, to, color, start: t0 + delay, duration: 900 });
      cue("launch", delay / 1000);
    } else if (s.kind === "missile") {
      const approach = s.approachPos && attackFrom ? 500 : 0;
      if (approach) state.effects.push({kind:'missile',from:attackFrom,to,color,start:t0+delay,duration:approach});
      state.effects.push({ kind: "impact", from: to, to, color, text: s.outcome === "hit" ? `HIT ${s.damage}` : s.outcome.toUpperCase(), start: t0 + delay + approach, duration: 500 });
      cue(s.outcome === "hit" ? "impact" : "intercept", (delay + approach) / 1000);
    } else if (s.kind === "strike" && from) {
      state.effects.push({ kind: "strike", from, to, color: "#7cf2b0", hit: (s.hits ?? 0) > 0, start: t0 + delay, duration: 900 });
      cue((s.hits ?? 0) > 0 ? "impact" : "launch", delay / 1000);
    }
  }
  for (const leg of courseLegs(frame)) state.effects.push({kind:'missile',...leg,color:WEAPON_COLORS[leg.weapon]||'#fff',start:t0,duration:650});
  combatFeedback(shots);
}
function animateFrame(frame, ms = 650) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
  const from = new Map((state.displayShips || state.view.ships).map((ship) => [ship.id, ship]));
  return new Promise((resolve) => {
    const began = performance.now();
    function tick(now) {
      const t = ms === 0 ? 1 : Math.min(1, (now - began) / ms), eased = t * t * (3 - 2 * t);
      state.displayShips = frame.ships.map((ship) => { const old = from.get(ship.id) || ship; return { ...ship, facing: t < .5 ? old.facing : ship.facing, pos: { q: old.pos.q + (ship.pos.q - old.pos.q) * eased, r: old.pos.r + (ship.pos.r - old.pos.r) * eased } }; });
      draw(); if (t < 1) requestAnimationFrame(tick); else { updateOrderPanel(); resolve(); }
    }
    requestAnimationFrame(tick);
  });
}
function animateEffects(ms) { if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0; return new Promise((resolve) => { const began = performance.now(); function tick(now) { draw(); if (now - began < ms) requestAnimationFrame(tick); else resolve(); } requestAnimationFrame(tick); }); }
async function playback(turn) {
  state.phase = "playback"; updateOrderPanel(); $("#end-turn").disabled = true; $("#end-turn").textContent = "Resolving…"; $("#restart-battle").disabled = true; $("#open-viewer").disabled = true; $("#map-legend").hidden = true;
  const impacts = turn.shots.filter((s) => s.kind === "missile");
  const prev = { ships: state.view.ships };
  if (impacts.length) { setSequence("impacts"); $("#turn-label").textContent = `Turn ${turn.turn} · Impacts`; spawnEffects(impacts, prev, prev); appendLog(narrateShots(impacts)); await animateEffects(impacts.some(s=>s.approachPos)?1500:900); }
  if (turn.rounds.some(frame=>!frame.terminal)) { setSequence("power"); $("#turn-label").textContent = `Turn ${turn.turn} · Power`; await animateEffects(350); }
  let previous = prev;
  for (const frame of turn.rounds) {
    if (frame.terminal) {
      setSequence(frame.phase === 'impacts' ? 'impacts' : 'end');
      $('#turn-label').textContent = `Turn ${frame.turn} · ${frame.phase === 'impacts' ? 'Final impacts' : 'Final state'}`;
      await animateFrame(frame);
      appendLog(turn.log.filter(entry=>entry.round === frame.round));
      previous = frame;
      continue;
    }
    setSequence(`a${frame.round}`); $("#turn-label").textContent = `Turn ${frame.turn} · Action round ${frame.round} of ${turn.rounds.filter(f=>!f.terminal).length}`;
    await animateFrame(frame);
    const shots = turn.shots.filter((s) => s.round === frame.round && s.kind !== "missile");
    spawnEffects(shots, frame, previous);
    appendLog([...turn.log.filter((entry) => entry.round === frame.round), ...narrateShots(shots)]);
    await animateEffects(shots.length || courseLegs(frame).length ? 800 : 250);
    previous = frame;
  }
  setSequence("end"); await animateEffects(250);
  state.phase = turn.result ? "ended" : "planning"; state.orders = {}; state.round = 0; state.effects = [];
  if (!state.battle.fleets.flat().some(s => s.id === state.selected && !s.destroyed)) state.selected = state.battle.fleets.flat().find(s => s.side === state.humanSide && !s.destroyed)?.id || state.selected;
  $("#restart-battle").disabled = false; $("#end-turn").innerHTML = "End turn <kbd>Enter</kbd>";
  markFormation(); $("#formation-status").textContent = "Issue the next fleet plan, then refine individual vessels as needed.";
  refreshView(); draw(); setSequence("");
  if (turn.result) {
    $("#verdict").hidden = false;
    $("#verdict-title").textContent = turn.result.victor ? `${state.record.meta.factions[turn.result.victor]} VICTORY` : "BATTLE DRAWN";
    $("#verdict-reason").textContent = turn.result.reason || "battle concluded";
    $("#turn-label").textContent = `Battle concluded · ${turn.result.turns} turns`;
    $("#end-turn").disabled = true; $("#hint").textContent = "Battle over. Review the replay or restart the engagement.";
    audio.cue(turn.result.victor ? (turn.result.victor === state.humanSide ? "victory" : "defeat") : "ui");
  }
  else { $("#end-turn").disabled = false; $("#hint").textContent = "Plan the next turn: pick a ship, set its three actions, choose a target."; }
}
async function endTurn() {
  if (!state.battle || state.phase !== "planning" || document.querySelector("dialog[open]") || !$("#briefing-panel").hidden || !$("#help-panel").hidden) return;
  // Unedited friendly ships hold as the interface promises. Omitting them
  // from the command packet would hand them back to the scripted AI helm.
  for (const ship of state.view.ships) if (ship.side === state.humanSide && !ship.destroyed) ensureOrder(ship);
  const submitted = clone(state.orders), turnNo = state.battle.turn;
  state.record.meta.orders.push({ turn: turnNo, side: state.humanSide, orders: submitted });
  const result = stepTurn(state.battle, submitted);
  state.record.rounds.push(...clone(result.rounds)); state.record.shots.push(...clone(result.shots));
  state.record.result = result.result ? clone(result.result) : { victor: null, reason: "battle in progress" };
  await playback(result); $("#save-record").disabled = false; $("#open-viewer").disabled = false;
}
function saveRecord() { const blob = new Blob([JSON.stringify(state.record, null, 2) + "\n"], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(state.scenario.name || "battle").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-game.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function openViewer() { sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.record)); location.assign("./index.html?replay=session"); }

// ----------------------------------------------------------------- setup
async function loadScenario(name) { const response = await fetch(`./scenarios/${name}`, { cache: "no-store" }); if (!response.ok) throw new Error(`Could not load ${name}`); return response.json(); }
function rosterFor(faction) { return state.tuning.rosters?.[faction] || Object.keys(state.tuning.hullClasses).filter((k) => k !== "command-ship"); }
function stockPoints(faction, cls) { return stockRevision(faction, cls, state.stockLibrary || [])?.design.hull.points ?? state.tuning.hullClasses[cls].points; }
function syncStockLibrary() {
  state.stockLibrary = readLibrary(localStorage, state.tuning).library;
  let notice = $('#stock-library-notice');
  if (!notice) { notice = document.createElement('p'); notice.id = 'stock-library-notice'; notice.className = 'hint'; $('#setup-panel .setup-tabs').after(notice); }
  const ids = new Set(state.stockLibrary.filter(p => p.design.id.startsWith('stock:')).map(p => p.design.id));
  notice.textContent = ids.size ? `Drydock: ${ids.size} local stock revision(s) active for new quick/bundled battles. Editor/imported scenarios keep their supplied configurations.` : '';
  notice.hidden = !ids.size;
  for (const side of ['a','b']) for (const input of $(`#quick-roster-${side}`).querySelectorAll('input')) {
    const cls = input.dataset.class, h = state.tuning.hullClasses[cls], faction = $(`#quick-faction-${side}`).value;
    input.parentElement.querySelector('em').textContent = `${stockPoints(faction,cls)}${Number.isFinite(h.minFleetPoints)?` · fleet ≥${h.minFleetPoints}`:''}`;
  }
}
function renderRoster(side) {
  const faction = $(`#quick-faction-${side}`).value, host = $(`#quick-roster-${side}`);
  host.innerHTML = rosterFor(faction).map((cls) => { const h = state.tuning.hullClasses[cls]; const floor = Number.isFinite(h.minFleetPoints) ? ` · fleet ≥${h.minFleetPoints}` : ""; return `<label><span>${label(cls)} <em>${stockPoints(faction,cls)}${floor}</em></span><input type="number" min="0" max="${h.limit ?? 40}" value="0" data-class="${cls}"></label>`; }).join("");
  host.querySelectorAll("input").forEach((input) => input.oninput = () => quickTotals());
  quickTotals();
}
function quickComposition(side) { const out = []; $(`#quick-roster-${side}`).querySelectorAll("input").forEach((input) => { const n = Math.max(0, Math.floor(Number(input.value) || 0)); for (let i = 0; i < n; i++) out.push({ className: input.dataset.class }); }); return out; }
function quickTotals() { for (const side of ["a", "b"]) $(`#quick-total-${side}`).textContent = quickComposition(side).reduce((sum, s) => sum + stockPoints($(`#quick-faction-${side}`).value,s.className), 0); }
function quickScenario() {
  const a = quickComposition("a"), b = quickComposition("b");
  if (!a.length || !b.length) throw new Error("Both sides need at least one ship.");
  return { name: `${$("#quick-faction-a").value} vs ${$("#quick-faction-b").value}`, seed: $("#seed-input").value || "orion",
    map: { widthHexes: Number($("#quick-width").value) || 72, heightHexes: Number($("#quick-height").value) || 40 }, terrain: [],
    startDistanceHexes: Number($("#quick-gap").value) || 26,
    sides: [{ faction: $("#quick-faction-a").value, ships: a }, { faction: $("#quick-faction-b").value, ships: b }] };
}
function beginScenario(source, { briefing = true, fleetFloorPolicy = 'warn' } = {}) {
  const scenario = clone(source);
  const tuning = scenario.startDistanceHexes ? { ...state.tuning, battle: { ...state.tuning.battle, startDistanceHexes: scenario.startDistanceHexes } } : state.tuning;
  const errors = validateScenario(scenario, tuning, state.loadouts, { fleetFloorPolicy });
  if (errors.length) throw new Error(errors.join(" "));
  // Reject before replacing the current engagement or its restart source.
  const battle = createBattle(scenario, tuning, state.loadouts, scenario.seed, { fleetFloorPolicy });
  state.scenario = scenario; state.initialScenario = clone(scenario); state.humanSide = $("#side-select").value;
  state.initialFloorPolicy = fleetFloorPolicy;
  state.battle = battle;
  state.view = battleView(state.battle); state.record = createPlayRecord(scenario, state.view);
  state.phase = "planning"; state.orders = {}; state.selected = state.view.ships.find(s => s.side === state.humanSide && !s.destroyed)?.id || null; state.selectedMount = null; state.forecastKey = null; state.round = 0; state.effects = []; state.displayShips = null;
  state.camera = { zoom: 1, x: 0, y: 0 }; markFormation();
  const faction = state.record.meta.factions[state.humanSide]; document.body.dataset.faction = faction; $("#station-title").textContent = `${FACTIONS[faction] || faction} command`;
  $("#setup-panel").hidden = true; $("#briefing-panel").hidden = true; $("#help-panel").hidden = true; $("#verdict").hidden = true;
  $("#impact-flash").classList.remove("active"); $("#combat-alert").classList.remove("active"); $("#combat-alert").textContent = "";
  $("#log-lines").replaceChildren(); $("#log-count").textContent = "0 events";
  $("#formation-panel").hidden = false; $("#formation-status").textContent = "Issue a plan to every friendly vessel, then refine individual orders below.";
  $("#side-label").textContent = `Commanding ${state.record.meta.factions[state.humanSide]} · Side ${state.humanSide}`;
  $("#end-turn").disabled = false; $("#restart-battle").disabled = false; $("#save-record").disabled = true; $("#open-viewer").disabled = true;
  $("#hint").textContent = "Issue a formation plan or select a vessel for individual orders, then End turn.";
  const warnings = state.view.warnings || [];
  $('#scenario-warnings').hidden = !warnings.length;
  $('#scenario-warning-list').replaceChildren(...warnings.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  audio.unlock(); refreshView(); frameFleets(); draw();
  if (briefing && showBriefing()) return;
  audio.cue("engage");
  if (!localStorage.getItem("orion-wars:help-seen") && !scenario.tutorial) $("#help-panel").hidden = false;
}
async function start() {
  try {
    syncStockLibrary(); quickTotals();
    let scenario;
    if (state.setupMode === "quick") scenario = quickScenario();
    else if (state.setupMode === "session") { const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); scenario = stored?.meta?.scenario; if (!scenario) throw new Error("The editor has not handed off a scenario in this tab."); }
    else scenario = await loadScenario($("#scenario-select").value);
    scenario = clone(scenario); scenario.seed = $("#seed-input").value || scenario.seed || "orion";
    if (state.setupMode !== 'session') scenario = pinStockRevisions(scenario, state.stockLibrary);
    beginScenario(scenario, { fleetFloorPolicy: state.setupMode === 'quick' ? 'strict' : 'warn' });
  } catch (error) { setStatus(error.message); }
}
function restartBattle() {
  if (!state.initialScenario || state.phase === "playback") return;
  try { beginScenario(state.initialScenario, { briefing: false, fleetFloorPolicy: state.initialFloorPolicy }); }
  catch (error) { $("#hint").textContent = `Could not restart: ${error.message}`; }
}
async function loadIcons() { try { const manifest = await (await fetch("../assets/icons/manifest.json", { cache: "no-store" })).json(); for (const [id, entry] of Object.entries(manifest.icons || {})) { const image = new Image(); image.onload = () => { state.icons.set(id, image); draw(); }; image.src = `../assets/icons/${entry.file}`; } } catch (error) { console.warn("Playfield: icons unavailable", error); } }
function setMode(mode) { state.setupMode = mode; document.querySelectorAll(".setup-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode)); for (const m of ["quick", "bundled", "session"]) $(`#mode-${m}`).hidden = m !== mode; if (mode !== "quick") updateSideLabels(); else { $("#side-select").options[0].textContent = `Side A — ${$("#quick-faction-a").value}`; $("#side-select").options[1].textContent = `Side B — ${$("#quick-faction-b").value}`; } }
async function updateSideLabels() { try { let s = null; if (state.setupMode === "bundled") s = await loadScenario($("#scenario-select").value); else { const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); s = stored?.meta?.scenario || null; } if (s) { $("#side-select").options[0].textContent = `Side A — ${s.sides[0].faction}`; $("#side-select").options[1].textContent = `Side B — ${s.sides[1].faction}`; if (state.setupMode === "bundled") { $("#scenario-blurb").textContent = SCENARIOS.find(([f]) => f === $("#scenario-select").value)?.[2] || ""; $("#seed-input").value = s.seed || "orion"; } else $("#session-blurb").textContent = `Ready: ${s.name} (${s.sides[0].faction} vs ${s.sides[1].faction}).`; } } catch {} }
async function init() {
  try {
    [state.tuning, state.loadouts] = await Promise.all([fetch("../data/tactical-tuning.json", { cache: "no-store" }).then((r) => r.json()), fetch("../data/loadouts.json", { cache: "no-store" }).then((r) => r.json())]);
    syncStockLibrary();
    window.addEventListener('storage', event => { if (event.key === LIBRARY_KEY || event.key === null) { try { syncStockLibrary(); quickTotals(); } catch (error) { setStatus(`Stock library unavailable: ${error.message}. Existing battle unchanged.`); } } });
    const factions = ["EAR", "VRA", "ZAN", "KRE"];
    for (const side of ["a", "b"]) { const sel = $(`#quick-faction-${side}`); sel.innerHTML = factions.map((f) => `<option value="${f}">${f}</option>`).join(""); sel.value = side === "a" ? "EAR" : "KRE"; sel.onchange = () => { renderRoster(side); setMode("quick"); }; renderRoster(side); }
    // A sensible default fleet: the 52-point reference line each side.
    for (const side of ["a", "b"]) for (const [cls, n] of Object.entries({ "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 })) { const input = $(`#quick-roster-${side} input[data-class="${cls}"]`); if (input) input.value = n; }
    quickTotals();
    $("#scenario-select").innerHTML = SCENARIOS.map(([file, name]) => `<option value="${file}">${name}</option>`).join("");
    $("#scenario-select").onchange = updateSideLabels;
    document.querySelectorAll(".setup-tabs button").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
    setMode("bundled");
    if (window.location.search.includes('drydock=session')) {
      setMode('session');
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!stored?.meta?.scenario) throw new Error('Drydock trial is missing from this tab. Return to Drydock and launch it again.');
      beginScenario(stored.meta.scenario);
    }
  } catch (error) { setStatus(`Tactical data could not load: ${error.message}`); }
}

$("#start-battle").onclick = start; $("#turn-left").onclick = () => adjustTurn(1); $("#turn-right").onclick = () => adjustTurn(-1); $("#forward-up").onclick = () => adjustForward(1); $("#forward-down").onclick = () => adjustForward(-1); $("#hold-button").onclick = holdAction;
$("#warp-action").onclick=setWarp;$("#burst-extra").onchange=e=>setBurst(e.target.value);
$("#reserve").oninput = (e) => { const ship = selectedShip(); if (ordersAllowed(ship)) { ensureOrder(ship).reserve = Number(e.target.value); markIndividualOverride(); updateOrderPanel(); draw(); } };
$("#target-auto").onclick = () => { const ship = selectedShip(); if (ordersAllowed(ship)) { ensureOrder(ship).target = "auto"; markIndividualOverride(); updateOrderPanel(); draw(); } };
document.querySelectorAll("[data-formation]").forEach((button) => button.onclick = () => applyFormation(button.dataset.formation));
$("#end-turn").onclick = endTurn; $("#restart-battle").onclick = restartBattle; $("#save-record").onclick = saveRecord; $("#open-viewer").onclick = openViewer;
$("#briefing-back").onclick = () => advanceBriefing(-1); $("#briefing-next").onclick = () => advanceBriefing(1);
$("#sound-toggle").onclick = () => { const enabled = audio.setEnabled(!audio.enabled); $("#sound-toggle").textContent = enabled ? "◉ Sound" : "○ Sound"; $("#sound-toggle").setAttribute("aria-pressed", String(enabled)); audio.cue("ui"); };
$("#fit-map").onclick = () => { state.camera = { zoom: 1, x: 0, y: 0 }; draw(); }; $("#frame-fleets").onclick = () => { frameFleets(); draw(); };
$("#help-button").onclick = () => { $("#help-panel").hidden = false; }; $("#help-close").onclick = () => { $("#help-panel").hidden = true; try { localStorage.setItem("orion-wars:help-seen", "1"); } catch {} };
let drag = null, dragged = false;
canvas.onpointerdown = (event) => { drag = { x: event.clientX, y: event.clientY, cx: state.camera.x, cy: state.camera.y }; dragged = false; canvas.setPointerCapture?.(event.pointerId); };
canvas.onpointermove = (event) => { if (!drag) return; const dx = event.clientX - drag.x, dy = event.clientY - drag.y; if (Math.hypot(dx, dy) > 5) dragged = true; if (dragged) { state.camera.x = drag.cx + dx; state.camera.y = drag.cy + dy; draw(); } };
canvas.onpointerup = () => { drag = null; };
canvas.onclick = (event) => {
  if (dragged) { dragged = false; return; }
  if (!state.view || state.phase !== "planning") return;
  const hex = eventHex(event), ships = state.view.ships.filter((s) => key(s.pos) === key(hex) && !s.destroyed);
  if (ships.length) { const index = ships.findIndex(s => s.id === state.selected); selectShip(ships[(index + 1) % ships.length].id); return; }
  // Click along the planned course to set this action's forward run.
  const ship = selectedShip(); if (!ordersAllowed(ship)) return;
  const entry = ensureOrder(ship).plan[state.round]; const route = plannedRoute(ship); const start = forecastFor(ship)?.actions[state.round]?.start || route[0];
  const facing = norm(start.facing + (entry.turn || 0));
  const d = DIRS[facing]; let steps = 0; let pos = { q: start.q, r: start.r };
  while (steps < 40 && key(pos) !== key(hex)) { pos = { q: pos.q + d.q, r: pos.r + d.r }; steps++; }
  if (key(pos) === key(hex)) { delete entry.warp;entry.forward = steps; markIndividualOverride(); renderFleet(); updateOrderPanel(); draw(); }
};
canvas.onwheel = (event) => { event.preventDefault(); state.camera.zoom = Math.max(.65, Math.min(6, state.camera.zoom * (event.deltaY < 0 ? 1.12 : .89))); draw(); };
window.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || document.querySelector("dialog[open]")) return;
  if (document.activeElement?.closest("input, select, textarea, [contenteditable=true]")) return;
  if (!ordersAllowed()) return;
  const k = event.key.toLowerCase();
  if (k === "enter" && document.activeElement?.closest("button, a")) return;
  if (!["q","e","w","s","h","1","2","3","enter"].includes(k)) return;
  event.preventDefault();
  if (k === "q") adjustTurn(1); else if (k === "e") adjustTurn(-1); else if (k === "w") adjustForward(1); else if (k === "s") adjustForward(-1); else if (k === "h") holdAction();
  else if (["1","2","3"].includes(k)) { state.round = Number(k) - 1; updateOrderPanel(); draw(); }
  else if (k === "enter") endTurn();
});

window.addEventListener("resize", draw);
window.__play = { state, previewOrders, updateOrderPanel, refreshView, beginScenario, createBattle, battleView, shipPlan, stepTurn, plannedRoute, selectShip, endTurn, fireSolution, frameFleets, applyFormation, restartBattle };
// Native dialogs supply focus containment and restoration; hidden remains the
// existing controller contract. No game command may run behind an open dialog.
for (const dialog of document.querySelectorAll("dialog")) {
  const sync = () => { if (!dialog.hidden && !dialog.open) dialog.showModal(); else if (dialog.hidden && dialog.open) dialog.close(); };
  new MutationObserver(sync).observe(dialog, { attributes:true, attributeFilter:["hidden"] });
  dialog.addEventListener("cancel", event => {
    if (["setup-panel","briefing-panel"].includes(dialog.id)) event.preventDefault();
    else dialog.hidden = true;
  });
  sync();
}
document.querySelectorAll("[data-drawer]").forEach(b => b.onclick = () => { $("#" + b.dataset.drawer).hidden = false; });
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => { $("#" + b.dataset.close).hidden = true; });
$("#vessel-select").onchange = e => selectShip(e.target.value, true);
$("#next-vessel").onclick = () => { const ids = (state.view?.ships || []).filter(s => s.side === state.humanSide && !s.destroyed).map(s => s.id); if (ids.length) selectShip(ids[(ids.indexOf(state.selected) + 1) % ids.length], true); };
$("#target-select").onchange = e => { const ship = selectedShip(); if (ordersAllowed(ship)) { ensureOrder(ship).target = e.target.value; markIndividualOverride(); updateOrderPanel(); draw(); } };
$("#grid-toggle").onclick = () => { state.grid = !state.grid; $("#grid-toggle").setAttribute("aria-pressed", String(state.grid)); draw(); };
new ResizeObserver(() => draw()).observe(canvas);
init(); loadIcons(); draw();
