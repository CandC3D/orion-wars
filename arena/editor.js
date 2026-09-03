import {
  FACTIONS, TERRAIN_TYPES, TERRAIN_LABELS, asteroidFieldRocks, axialToWorld, blockingTerrainHexSet, compositionFor,
  fleetPoints, inMap, largeAsteroidOutline, nebulaOutline, normalizeFacing, rosterFor, scenarioForSave,
  snapWorldToHex, terrainBlocksShips, terrainFootprint, terrainHexSet, validateScenario
} from "./editor-core.js";
import { recordScenario } from "./record.js";

export const SESSION_REPLAY_KEY = "orion-wars:scenario-replay:v3";
const COLORS = { EAR: "#54a8ff", VRA: "#edc85e", ZAN: "#ec655d", KRE: "#62c98a" };
// Ship markers use the same playtest icon set as the viewer (assets/icons/
// manifest.json), at the same drawing-box convention -- ICON_SPAN/ICON_EXTENT
// must match arena.js's so a scenario looks the same in both pages.
const ICON_SPAN = 1.35;
const ICON_EXTENT = .6;
const $ = (selector) => document.querySelector(selector);
const canvas = $("#editor-canvas");
const ctx = canvas.getContext("2d");
const saveScenarioButton = $("#save-scenario");
const runBattleButton = $("#run-battle");
// Save and Run both need tuning + loadouts before they can build a scenario;
// disabled here and re-enabled once the fetch below resolves, so a click
// during that window shows a clear message instead of a raw thrown error.
saveScenarioButton.disabled = true;
runBattleButton.disabled = true;

let tuning;
let loadouts;
let iconManifest;
// Decoded <img> elements for the canvas ship markers, keyed "FACTION/class".
const shipIcons = new Map();
let nextUid = 1;
let activeTool = "select";
let selected = null;
let pointer = null;
let actionMessage = "";
const camera = { zoom: 1, x: 0, y: 0 };
let model = withIds({
  name: "Untitled scenario", seed: "orion", map: { widthHexes: 72, heightHexes: 40 }, terrain: [],
  sides: [{ faction: "EAR", ships: [] }, { faction: "KRE", ships: [] }]
});

function withIds(raw) {
  const copy = JSON.parse(JSON.stringify(raw));
  copy.name = String(copy.name || "Untitled scenario");
  copy.seed = String(copy.seed || "orion");
  copy.map ||= { widthHexes: 72, heightHexes: 40 };
  copy.terrain = Array.isArray(copy.terrain) ? copy.terrain : [];
  copy.sides = Array.isArray(copy.sides) ? copy.sides.slice(0, 2) : [];
  while (copy.sides.length < 2) copy.sides.push({ faction: FACTIONS[copy.sides.length], ships: [] });
  copy.sides.forEach((side) => {
    side.ships = Array.isArray(side.ships) ? side.ships : [];
    side.ships.forEach((ship) => { ship._uid = nextUid++; ship.facing = normalizeFacing(ship.facing); });
  });
  copy.terrain.forEach((item) => { item._uid = nextUid++; });
  return copy;
}

function resize() {
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  return { box, ratio };
}

function geometry() {
  const box = canvas.getBoundingClientRect();
  const spanX = Math.sqrt(3) * (model.map.widthHexes + 1.4);
  const spanY = 1.5 * model.map.heightHexes + 2.6;
  return { cx: box.width / 2, cy: box.height / 2, scale: Math.max(1, Math.min(box.width / spanX, box.height / spanY)), box };
}

function project(pos, geo = geometry()) {
  const world = axialToWorld(pos);
  return { x: geo.cx + world.x * geo.scale, y: geo.cy + world.y * geo.scale };
}

function eventWorld(event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left - camera.x) / camera.zoom, y: (event.clientY - box.top - camera.y) / camera.zoom };
}

function eventHex(event) {
  const geo = geometry();
  const point = eventWorld(event);
  return snapWorldToHex((point.x - geo.cx) / geo.scale, (point.y - geo.cy) / geo.scale);
}

function traceHex(at, size) {
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    const x = at.x + Math.cos(angle) * size, y = at.y + Math.sin(angle) * size;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function drawMoonOrPlanet(item, geo) {
  const at = project(item, geo);
  const radius = item.type === "planet" ? geo.scale * 2.15 : geo.scale * .72;
  const gradient = ctx.createRadialGradient(at.x - radius * .28, at.y - radius * .3, radius * .08, at.x, at.y, radius);
  if (item.type === "planet") {
    gradient.addColorStop(0, "#fff1c9"); gradient.addColorStop(.35, "#bba982"); gradient.addColorStop(1, "#4b4036");
  } else {
    gradient.addColorStop(0, "#f4f7f8"); gradient.addColorStop(.45, "#aab3ba"); gradient.addColorStop(1, "#48535b");
  }
  ctx.save();
  ctx.fillStyle = gradient; ctx.shadowColor = item.type === "planet" ? "#d2a96d88" : "#d9eef255"; ctx.shadowBlur = radius * .25;
  ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill();
  if (selected?.kind === "terrain" && selected.uid === item._uid) { ctx.strokeStyle = "#e4c275"; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

// The large asteroid ("asteroid"): impassable and fire-blocking like a moon,
// but a jagged silhouette (largeAsteroidOutline) reads as a craggy rock
// instead of a smooth sphere.
function drawLargeAsteroid(item, geo) {
  const at = project(item, geo);
  const base = geo.scale * .72;
  const outline = largeAsteroidOutline(item.q, item.r);
  ctx.save();
  ctx.beginPath();
  outline.forEach((point, i) => {
    const r = base * point.radius;
    const x = at.x + Math.cos(point.angle) * r, y = at.y + Math.sin(point.angle) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
  const gradient = ctx.createRadialGradient(at.x - base * .25, at.y - base * .3, base * .1, at.x, at.y, base);
  gradient.addColorStop(0, "#93816a"); gradient.addColorStop(.5, "#5e4d3d"); gradient.addColorStop(1, "#2b221a");
  ctx.fillStyle = gradient; ctx.shadowColor = "#00000066"; ctx.shadowBlur = base * .2;
  ctx.fill();
  ctx.strokeStyle = "#251c15"; ctx.lineWidth = 1; ctx.stroke();
  if (selected?.kind === "terrain" && selected.uid === item._uid) { ctx.strokeStyle = "#e4c275"; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}

// The asteroid field ("asteroids"): a speckled grey-brown scatter of small
// rocks (asteroidFieldRocks), not a solid body -- ships may sit among them.
function drawAsteroidField(item, geo) {
  const at = project(item, geo);
  const rocks = asteroidFieldRocks(item.q, item.r);
  ctx.save();
  for (const rock of rocks) {
    const x = at.x + rock.dx * geo.scale, y = at.y + rock.dy * geo.scale;
    const r = Math.max(.4, rock.radius * geo.scale);
    const tone = 96 + Math.round(rock.shade * 60);
    ctx.fillStyle = `rgb(${tone},${Math.round(tone * .86)},${Math.round(tone * .7)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (selected?.kind === "terrain" && selected.uid === item._uid) {
    ctx.strokeStyle = "#e4c275"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(at.x, at.y, geo.scale * .8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// Nebula: a soft purple-violet haze filling most of the hex, with a gently
// irregular edge (nebulaOutline). Passable and does not block fire.
function drawNebula(item, geo) {
  const at = project(item, geo);
  const base = geo.scale * .8;
  const outline = nebulaOutline(item.q, item.r);
  ctx.save();
  ctx.beginPath();
  outline.forEach((point, i) => {
    const r = base * point.radius;
    const x = at.x + Math.cos(point.angle) * r, y = at.y + Math.sin(point.angle) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.closePath();
  const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, base);
  gradient.addColorStop(0, "rgba(186,150,255,.34)");
  gradient.addColorStop(.6, "rgba(138,96,224,.22)");
  gradient.addColorStop(1, "rgba(90,58,168,.05)");
  ctx.fillStyle = gradient;
  ctx.fill();
  if (selected?.kind === "terrain" && selected.uid === item._uid) {
    ctx.strokeStyle = "#e4c275"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(at.x, at.y, geo.scale * .8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(item, geo) {
  if (item.type === "asteroid") return drawLargeAsteroid(item, geo);
  if (item.type === "asteroids") return drawAsteroidField(item, geo);
  if (item.type === "nebula") return drawNebula(item, geo);
  return drawMoonOrPlanet(item, geo);
}

function allShips() {
  return model.sides.flatMap((side, sideIndex) => side.ships.map((ship) => ({ ship, sideIndex })));
}

// Every roster class has an icon (test/arena-smoke.js checks this against
// assets/icons/manifest.json), so ship markers are always drawn from the same
// icon set the viewer uses -- nose up, rotated to facing, one hex footprint
// (ruling 24b). No chevron/triangle fallback: a genuinely missing icon draws
// nothing and logs one console warning per faction/class, not spammed.
const warnedMissingIcon = new Set();
function warnMissingShipIcon(key) {
  if (warnedMissingIcon.has(key)) return;
  warnedMissingIcon.add(key);
  console.warn(`Scenario editor: no ship icon for ${key}; drawing nothing.`);
}

function drawShip(ship, sideIndex, geo) {
  if (!Number.isFinite(ship.q) || !Number.isFinite(ship.r)) return;
  const at = project(ship, geo);
  const key = `${model.sides[sideIndex].faction}/${ship.className}`;
  const icon = shipIcons.get(key);
  if (!icon) { warnMissingShipIcon(key); return; }
  const box = ICON_SPAN * geo.scale;
  ctx.save();
  ctx.translate(at.x, at.y);
  // Manifest artwork is nose-up; engine facing 0 = east turning
  // counter-clockwise, matching arena.js's drawIconImage exactly.
  ctx.rotate(-normalizeFacing(ship.facing) * Math.PI / 3 + Math.PI / 2);
  ctx.drawImage(icon, -box / 2, -box / 2, box, box);
  ctx.restore();
  if (selected?.kind === "ship" && selected.uid === ship._uid) {
    ctx.save();
    ctx.strokeStyle = "#e4c275"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(at.x, at.y, ICON_SPAN * ICON_EXTENT * geo.scale + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function draw() {
  const { box, ratio } = resize();
  const geo = geometry();
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, box.width, box.height);
  ctx.setTransform(ratio * camera.zoom, 0, 0, ratio * camera.zoom, ratio * camera.x, ratio * camera.y);
  ctx.strokeStyle = "rgba(130,161,181,.105)"; ctx.lineWidth = 1; ctx.beginPath();
  const halfW = model.map.widthHexes / 2, halfH = model.map.heightHexes / 2;
  for (let r = Math.ceil(-halfH); r <= Math.floor(halfH); r++) {
    for (let q = Math.ceil(-halfW - r / 2); q <= Math.floor(halfW - r / 2); q++) traceHex(project({ q, r }, geo), geo.scale);
  }
  ctx.stroke();
  const halfX = (Math.sqrt(3) * model.map.widthHexes / 2 + Math.sqrt(3) / 2) * geo.scale;
  const halfY = (1.5 * model.map.heightHexes / 2 + 1) * geo.scale;
  ctx.strokeStyle = "rgba(228,194,117,.35)"; ctx.strokeRect(geo.cx - halfX, geo.cy - halfY, halfX * 2, halfY * 2);
  for (const item of model.terrain) drawTerrain(item, geo);
  for (const { ship, sideIndex } of allShips()) drawShip(ship, sideIndex, geo);
}

function classesFor(faction) {
  return rosterFor(faction, tuning).filter((name) => Number.isFinite(tuning?.hullClasses?.[name]?.points));
}

// `<img>` source for a class icon (fleet-builder buttons, tray cards): the
// same manifest arena.js reads, referenced by its static file path -- these
// small static thumbnails don't need the preloaded shipIcons Image objects.
function iconSrc(faction, className) {
  const entry = iconManifest?.icons?.[`${faction}/${className}`];
  return entry?.file ? `../assets/icons/${encodeURIComponent(entry.file)}` : null;
}
function iconImgTag(faction, className) {
  const src = iconSrc(faction, className);
  return src ? `<img class="class-icon" src="${src}" alt="">` : "";
}

function renderFleet(sideIndex) {
  const panel = sideIndex ? $("#side-b") : $("#side-a");
  const side = model.sides[sideIndex];
  const color = COLORS[side.faction];
  panel.style.setProperty("--side-color", color);
  panel.innerHTML = `<div class="fleet-heading"><div><p class="eyebrow">SIDE ${sideIndex ? "B" : "A"}</p><h2 style="color:${color}">${side.faction} Fleet</h2></div><strong>${fleetPoints(side, tuning)} pts</strong></div>` +
    `<select class="faction-picker" aria-label="Side ${sideIndex + 1} faction">${FACTIONS.map((f) => `<option${f === side.faction ? " selected" : ""}>${f}</option>`).join("")}</select>` +
    `<div class="class-list">${classesFor(side.faction).map((name) => {
      const hull = tuning.hullClasses[name];
      const limit = hull.limit;
      const count = compositionFor(side)[name] || 0;
      const atLimit = Number.isFinite(limit) && count >= limit;
      const points = Number.isFinite(limit) ? `${hull.points} (max ${limit})` : hull.points;
      return `<button data-add="${name}"${atLimit ? " disabled" : ""}><span>${iconImgTag(side.faction, name)}+ ${name}</span><em>${points}</em></button>`;
    }).join("")}</div>` +
    `<div class="ship-tray">${side.ships.length ? side.ships.map((ship) => {
      const placed = Number.isFinite(ship.q) && Number.isFinite(ship.r);
      return `<article class="ship-card-editor${selected?.kind === "ship" && selected.uid === ship._uid ? " selected" : ""}" draggable="true" data-ship="${ship._uid}"><strong>${iconImgTag(side.faction, ship.className)}${ship.className}</strong><small>${tuning.hullClasses[ship.className]?.points ?? "?"} pts · ${placed ? `${ship.q},${ship.r} · facing ${normalizeFacing(ship.facing)}` : "line deployment"}</small><span class="ship-buttons"><button data-rotate="${ship._uid}" title="Rotate">↻</button><button data-remove="${ship._uid}" title="Remove">×</button></span></article>`;
    }).join("") : `<p class="empty-tray">Add ships above. Unplaced ships use line deployment.</p>`}</div>`;
  panel.querySelector(".faction-picker").addEventListener("change", (event) => {
    side.faction = event.target.value;
    side.ships = side.ships.filter((ship) => rosterFor(side.faction, tuning).includes(ship.className));
    selected = null; refresh();
  });
  panel.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => {
    side.ships.push({ className: button.dataset.add, facing: sideIndex ? 3 : 0, _uid: nextUid++ }); refresh();
  }));
  panel.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => { removeShip(Number(button.dataset.remove)); }));
  panel.querySelectorAll("[data-rotate]").forEach((button) => button.addEventListener("click", () => { rotateShip(Number(button.dataset.rotate)); }));
  panel.querySelectorAll("[data-ship]").forEach((card) => {
    card.addEventListener("click", () => { selected = { kind: "ship", uid: Number(card.dataset.ship) }; refresh(); });
    card.addEventListener("dragstart", (event) => { event.dataTransfer.setData("application/x-orion-ship", card.dataset.ship); event.dataTransfer.effectAllowed = "move"; });
  });
}

function setMessage(message, kind = "") { actionMessage = message; const el = $("#editor-message"); el.textContent = message; el.className = kind; }

function refresh(message = actionMessage) {
  renderFleet(0); renderFleet(1); draw();
  const errors = tuning && loadouts ? validateScenario(scenarioForSave(model), tuning, loadouts) : [];
  $("#validation-list").innerHTML = errors.map((error) => `<li>${error}</li>`).join("");
  if (message) setMessage(message, errors.length ? "error" : "ok");
  else setMessage(errors.length ? "Resolve the listed scenario issues." : "Scenario is valid.", errors.length ? "error" : "ok");
  return errors;
}

function findShip(uid) {
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const ship = model.sides[sideIndex].ships.find((candidate) => candidate._uid === uid);
    if (ship) return { ship, sideIndex };
  }
  return null;
}

function removeShip(uid) { const found = findShip(uid); if (!found) return; found.ship && model.sides[found.sideIndex].ships.splice(model.sides[found.sideIndex].ships.indexOf(found.ship), 1); if (selected?.uid === uid) selected = null; refresh("Ship removed."); }
function rotateShip(uid) { const found = findShip(uid); if (!found) return; found.ship.facing = normalizeFacing(found.ship.facing + 1); selected = { kind: "ship", uid }; refresh("Facing rotated 60° counter-clockwise."); }

function canPlaceShip(hex) { return inMap(hex.q, hex.r, model.map) && !blockingTerrainHexSet(model.terrain).has(`${hex.q},${hex.r}`); }
function placeShip(uid, hex) {
  const found = findShip(uid); if (!found) return false;
  if (!inMap(hex.q, hex.r, model.map)) { setMessage("Ships cannot be placed off the map.", "error"); return false; }
  if (!canPlaceShip(hex)) { setMessage("Ships cannot be placed on terrain.", "error"); return false; }
  Object.assign(found.ship, hex); selected = { kind: "ship", uid }; refresh("Ship placed."); return true;
}

function canPlaceTerrain(item, omitIndex = -1) {
  const other = terrainHexSet(model.terrain, omitIndex);
  // The asteroid field is passable, so it may share a hex with a ship (in
  // either placement order); every other terrain type must not.
  const ships = terrainBlocksShips(item.type)
    ? new Set(allShips().filter(({ ship }) => Number.isFinite(ship.q) && Number.isFinite(ship.r)).map(({ ship }) => `${ship.q},${ship.r}`))
    : new Set();
  return terrainFootprint(item).every((hex) => inMap(hex.q, hex.r, model.map) && !other.has(`${hex.q},${hex.r}`) && !ships.has(`${hex.q},${hex.r}`));
}

function addTerrain(type, hex) {
  const item = { type, ...hex, _uid: nextUid++ };
  if (!canPlaceTerrain(item)) { setMessage("Terrain must fit on-map without overlapping ships or other terrain.", "error"); return; }
  model.terrain.push(item); selected = { kind: "terrain", uid: item._uid };
  // Nebula is painted one hex per click to build up a cloud of several tiles,
  // so its tool stays active; every other terrain type reverts to Select
  // after one placement, as before.
  if (type !== "nebula") setTool("select");
  refresh(`${TERRAIN_LABELS[type] || "Terrain"} placed.`);
}

function hitObject(point) {
  const geo = geometry();
  const shipRadius = Math.max(8, geo.scale * .9);
  const ships = allShips().filter(({ ship }) => Number.isFinite(ship.q) && Number.isFinite(ship.r)).reverse();
  for (const entry of ships) { const at = project(entry.ship, geo); if (Math.hypot(point.x - at.x, point.y - at.y) <= shipRadius) return { kind: "ship", uid: entry.ship._uid }; }
  for (let i = model.terrain.length - 1; i >= 0; i--) { const item = model.terrain[i], at = project(item, geo); const radius = geo.scale * (item.type === "planet" ? 2.2 : .85); if (Math.hypot(point.x - at.x, point.y - at.y) <= radius) return { kind: "terrain", uid: item._uid }; }
  return null;
}

function setTool(tool) { activeTool = tool; document.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool)); }

canvas.addEventListener("wheel", (event) => {
  event.preventDefault(); const box = canvas.getBoundingClientRect(); const cursor = { x: event.clientX - box.left, y: event.clientY - box.top }; const before = { x: (cursor.x - camera.x) / camera.zoom, y: (cursor.y - camera.y) / camera.zoom };
  camera.zoom = Math.max(1, Math.min(8, camera.zoom * Math.exp(-event.deltaY * .0015))); camera.x = cursor.x - before.x * camera.zoom; camera.y = cursor.y - before.y * camera.zoom; draw();
}, { passive: false });

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const point = eventWorld(event); const hit = hitObject(point);
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, hit, moved: false };
  if (hit) { selected = hit; canvas.classList.add("dragging-object"); refresh(); }
  canvas.setPointerCapture?.(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 4) pointer.moved = true;
  if (!pointer.hit && pointer.moved) { camera.x += event.clientX - pointer.x; camera.y += event.clientY - pointer.y; draw(); }
  pointer.x = event.clientX; pointer.y = event.clientY;
});
canvas.addEventListener("pointerup", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const finished = pointer; pointer = null; canvas.classList.remove("dragging-object"); canvas.releasePointerCapture?.(event.pointerId);
  const hex = eventHex(event);
  if (finished.hit?.kind === "ship") {
    if (finished.moved) placeShip(finished.hit.uid, hex); else rotateShip(finished.hit.uid);
  } else if (finished.hit?.kind === "terrain") {
    if (finished.moved) {
      const index = model.terrain.findIndex((item) => item._uid === finished.hit.uid); const moved = { ...model.terrain[index], ...hex };
      if (canPlaceTerrain(moved, index)) { Object.assign(model.terrain[index], hex); refresh("Terrain moved."); } else setMessage("Terrain must fit on-map without overlapping ships or other terrain.", "error");
    } else { selected = finished.hit; refresh(); }
  } else if (!finished.moved && TERRAIN_TYPES.includes(activeTool)) addTerrain(activeTool, hex);
});

canvas.addEventListener("dragover", (event) => { if (event.dataTransfer.types.includes("application/x-orion-ship")) event.preventDefault(); });
canvas.addEventListener("drop", (event) => { const uid = Number(event.dataTransfer.getData("application/x-orion-ship")); if (uid) { event.preventDefault(); placeShip(uid, eventHex(event)); } });

document.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
$("#rotate-selected").addEventListener("click", () => { if (selected?.kind === "ship") rotateShip(selected.uid); else setMessage("Select a ship to rotate it.", "error"); });
$("#delete-selected").addEventListener("click", () => {
  if (!selected) return setMessage("Select a ship or terrain body to delete it.", "error");
  if (selected.kind === "ship") return removeShip(selected.uid);
  model.terrain = model.terrain.filter((item) => item._uid !== selected.uid); selected = null; refresh("Terrain deleted.");
});
$("#clear-positions").addEventListener("click", () => { allShips().forEach(({ ship }) => { delete ship.q; delete ship.r; }); refresh("All ships will use random line deployment."); });
$("#fit-editor-map").addEventListener("click", () => { Object.assign(camera, { zoom: 1, x: 0, y: 0 }); draw(); });

for (const [selector, key] of [["#scenario-name", "name"], ["#scenario-seed", "seed"]]) $(selector).addEventListener("input", (event) => { model[key] = event.target.value; refresh(); });
for (const [selector, key] of [["#map-width", "widthHexes"], ["#map-height", "heightHexes"]]) $(selector).addEventListener("change", (event) => { model.map[key] = Math.max(1, Math.trunc(Number(event.target.value) || 1)); event.target.value = model.map[key]; Object.assign(camera, { zoom: 1, x: 0, y: 0 }); refresh("Map resized."); });

function syncInputs() { $("#scenario-name").value = model.name; $("#scenario-seed").value = model.seed; $("#map-width").value = model.map.widthHexes; $("#map-height").value = model.map.heightHexes; }
function loadScenarioObject(raw) { model = withIds(raw); selected = null; setTool("select"); Object.assign(camera, { zoom: 1, x: 0, y: 0 }); syncInputs(); refresh(`Loaded “${model.name}”.`); }
function readScenarioFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { loadScenarioObject(JSON.parse(reader.result)); } catch (error) { setMessage(`Could not load scenario: ${error.message}`, "error"); } }; reader.onerror = () => setMessage("Could not read that file.", "error"); reader.readAsText(file); }
$("#scenario-file").addEventListener("change", (event) => readScenarioFile(event.target.files[0]));

let dragDepth = 0;
window.addEventListener("dragenter", (event) => { if ([...event.dataTransfer.types].includes("Files")) { dragDepth++; document.body.classList.add("file-drag"); } });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("file-drag"); } });
window.addEventListener("dragover", (event) => { if ([...event.dataTransfer.types].includes("Files")) event.preventDefault(); });
window.addEventListener("drop", (event) => { document.body.classList.remove("file-drag"); dragDepth = 0; if (event.dataTransfer.files[0]) { event.preventDefault(); readScenarioFile(event.dataTransfer.files[0]); } });

saveScenarioButton.addEventListener("click", () => {
  if (!tuning || !loadouts) return setMessage("Still loading tactical data — please wait.", "error");
  const errors = refresh(); if (errors.length) return setMessage("Fix validation errors before saving.", "error");
  const scenario = scenarioForSave(model); const blob = new Blob([JSON.stringify(scenario, null, 2) + "\n"], { type: "application/json" }); const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = `${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario"}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 0); setMessage("Scenario downloaded.", "ok");
});

runBattleButton.addEventListener("click", () => {
  if (!tuning || !loadouts) return setMessage("Still loading tactical data — please wait.", "error");
  const errors = refresh(); if (errors.length) return setMessage("Fix validation errors before running the battle.", "error");
  runBattleButton.disabled = true; setMessage("Resolving battle in this browser…", "ok");
  setTimeout(() => {
    try { const replay = recordScenario(scenarioForSave(model), tuning, loadouts); sessionStorage.setItem(SESSION_REPLAY_KEY, JSON.stringify(replay)); window.location.assign("./index.html?replay=session"); }
    catch (error) { runBattleButton.disabled = false; setMessage(`Battle could not run: ${error.message}`, "error"); }
  }, 0);
});

window.addEventListener("resize", draw);
window.__editor = { get model() { return model; }, scenarioForSave: () => scenarioForSave(model), validate: () => validateScenario(scenarioForSave(model), tuning, loadouts), placeShip, addTerrain, loadScenarioObject, geometry, project, camera, SESSION_REPLAY_KEY };

// Fire-and-forget: decode every manifest icon into an <img>, redrawing (and
// re-rendering the fleet panels, so button/tray thumbnails pick it up too) as
// each one lands. The editor is fully usable before this settles.
function preloadShipIcons() {
  const table = iconManifest?.icons;
  if (!table || typeof table !== "object") return;
  for (const [key, entry] of Object.entries(table)) {
    if (!entry || typeof entry.file !== "string") continue;
    let image;
    try { image = new Image(); } catch (_) { continue; }
    if (!image || typeof image.addEventListener !== "function") continue;
    image.decoding = "async";
    image.addEventListener("load", () => { shipIcons.set(key, image); draw(); }, { once: true });
    image.addEventListener("error", () => console.warn(`Scenario editor: ship icon failed to load for ${key} (${entry.file})`), { once: true });
    image.src = `../assets/icons/${encodeURIComponent(entry.file)}`;
  }
}

try {
  if (location.protocol === "file:") {
    // Browsers block data fetches and engine module imports on file:// pages,
    // so the editor cannot run from disk. Say so plainly instead of hanging.
    throw new Error("The Scenario Editor must be opened through the local server, not from disk: double-click \"Start Orion Wars.cmd\" in the project folder (or run \"npm run arena\"), then use http://localhost:8642/arena/editor.html");
  }
  const [tuningResponse, loadoutsResponse, iconsResponse] = await Promise.all([
    fetch("../data/tactical-tuning.json", { cache: "no-store" }),
    fetch("../data/loadouts.json", { cache: "no-store" }),
    // Ship icons are a visual nicety, not core scenario-building function, so
    // a failure here is swallowed rather than blocking the editor.
    fetch("../assets/icons/manifest.json", { cache: "no-store" }).catch(() => null)
  ]);
  if (!tuningResponse.ok || !loadoutsResponse.ok) throw new Error("tactical data could not be fetched");
  tuning = await tuningResponse.json(); loadouts = await loadoutsResponse.json();
  if (iconsResponse && iconsResponse.ok) {
    try { iconManifest = await iconsResponse.json(); preloadShipIcons(); }
    catch (_) { iconManifest = null; }
  } else {
    console.warn("Scenario editor: assets/icons/manifest.json unavailable; ship markers will not be drawn.");
  }
  saveScenarioButton.disabled = false; runBattleButton.disabled = false;
  syncInputs(); refresh();
} catch (error) { setMessage(`Editor unavailable: ${error.message}. Serve the repository over HTTP so browser modules can fetch data.`, "error"); }
