// Fleet Command — the interactive playfield (rebuilt by Fable, 2026-09-03).
//
// Principles: the turn sequence is visible at all times; every overlay says
// what it is; the plan is three ACTIONS (move, or hold and fire); and the
// fire solution tells you, before you commit, which weapons will bear on
// your target after the moves you have planned. Everything geometric here
// uses the engine's own conventions (docs/playfield-contract.md; src/tactical/hex.js).
import { createBattle, battleView, shipPlan, stepTurn } from "./play-engine.js?v=cmd2";
import { createPlayRecord } from "./record.js?v=play1";
import { HEX_DIRECTIONS as DIRS, axialToWorld, snapWorldToHex, terrainFootprint } from "./editor-core.js";

const $ = (s) => document.querySelector(s);
const SESSION_KEY = "orion-wars:scenario-replay:v3";
const SCENARIOS = [
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
// `offset` hexsides counter-clockwise from the bow. Faces: 1 front-left,
// 2 forward, 3 front-right, 4 rear-right, 5 rear, 6 rear-left.
const FACE_AT_OFFSET = [2, 3, 4, 5, 6, 1];
const OFFSET_OF_FACE = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 1: 5 };
const FACE_NAMES = { 1: "front-left", 2: "forward", 3: "front-right", 4: "rear-right", 5: "rear", 6: "rear-left" };
const clone = (v) => JSON.parse(JSON.stringify(v));
const norm = (v) => ((v % 6) + 6) % 6;
const key = (p) => `${p.q},${p.r}`;
const canvas = $("#play-canvas"), ctx = canvas.getContext("2d");
const schematic = $("#schematic"), sctx = schematic.getContext("2d");
const state = {
  tuning: null, loadouts: null, scenario: null, battle: null, view: null, record: null,
  humanSide: "A", selected: null, round: 0, orders: {}, phase: "setup", icons: new Map(),
  camera: { zoom: 1, x: 0, y: 0 }, displayShips: null, effects: [], setupMode: "quick"
};

// ------------------------------------------------------------ hex geometry
function hexDistance(a, b) { const dq = b.q - a.q, dr = b.r - a.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
function bearingTo(from, to) {
  // Identical to the engine: atan2 in the engine's cart frame, rounded to sixths.
  const ax = Math.sqrt(3) * (from.q + from.r / 2), ay = -1.5 * from.r, bx = Math.sqrt(3) * (to.q + to.r / 2), by = -1.5 * to.r;
  const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
  return Math.round(((deg + 360) % 360) / 60) % 6;
}
function faceToward(facing, dir) { return FACE_AT_OFFSET[norm(dir - facing)]; }
function mountBears(mount, shooter, targetPos) { return mount.arc.includes(faceToward(shooter.facing, bearingTo(shooter.pos, targetPos))); }

function setStatus(message) { $("#setup-message").textContent = message; }
function label(name) { return name.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function geometry() {
  const rect = canvas.getBoundingClientRect(), map = state.view?.map || state.scenario?.map || { widthHexes: 72, heightHexes: 40 };
  const scale = Math.max(7, Math.min(rect.width / (Math.sqrt(3) * (map.widthHexes + 3)), rect.height / (1.5 * (map.heightHexes + 3))) * state.camera.zoom);
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
  ctx.strokeStyle = "rgba(130,161,181,.12)"; ctx.lineWidth = 1;
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
function sectorPath(c, center, inner, outer, direction) {
  const angle = dirAngle(direction);
  c.beginPath(); c.arc(center.x, center.y, outer, angle - Math.PI / 6, angle + Math.PI / 6); c.arc(center.x, center.y, inner, angle + Math.PI / 6, angle - Math.PI / 6, true); c.closePath();
}
function drawArcs(ship, geo) {
  // One wedge per weapon, in that weapon's colour, out to its range; band
  // boundaries as faint rings. Faces come from the engine's table.
  const center = project(ship.pos, geo);
  for (const mount of ship.mounts) {
    if (mount.inop) continue;
    const color = WEAPON_COLORS[mount.type] || "#ddd";
    const bands = mount.bands?.length ? mount.bands : [{ to: mount.maxRange }];
    let previous = 0;
    bands.forEach((band, i) => {
      const to = Math.min(mount.maxRange, band.to);
      for (const face of mount.arc) {
        sectorPath(ctx, center, previous * Math.sqrt(3) * geo.scale, to * Math.sqrt(3) * geo.scale, norm(ship.facing + OFFSET_OF_FACE[face]));
        ctx.fillStyle = color.replace(")", "") ; ctx.globalAlpha = Math.max(.035, .12 - i * .03); ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = color; ctx.globalAlpha = .35; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      }
      previous = to;
    });
  }
}
function drawShield(ship, geo) {
  const center = project(ship.pos, geo), radius = geo.scale * 1.15, max = Math.max(...Object.values(ship.shieldCap), 1);
  for (let face = 1; face <= 6; face++) {
    const direction = norm(ship.facing + OFFSET_OF_FACE[face]), a = dirAngle(direction), a1 = a - Math.PI / 6, a2 = a + Math.PI / 6;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(center.x + Math.cos(a1) * radius, center.y + Math.sin(a1) * radius); ctx.lineTo(center.x + Math.cos(a2) * radius, center.y + Math.sin(a2) * radius); ctx.closePath();
    ctx.fillStyle = ship.shieldDown[face] ? "rgba(236,101,93,.38)" : `rgba(84,168,255,${.08 + .3 * ship.shieldCap[face] / max})`; ctx.fill();
    ctx.strokeStyle = ship.shieldDown[face] ? "#ec655d" : "rgba(120,200,255,.75)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = ship.shieldDown[face] ? "#ffd0cc" : "#dff1ff"; ctx.font = `bold ${Math.max(9, geo.scale * .3)}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(String(face), center.x + Math.cos(a) * radius * .78, center.y + Math.sin(a) * radius * .78 + 3);
  }
}
function plannedRoute(ship) {
  const entries = state.orders[ship.id]?.plan || Array.from({ length: state.view.roundsPerTurn }, () => ({ turn: 0, forward: 0 }));
  const points = [{ ...ship.pos, facing: ship.facing, round: 0 }], terrain = new Map((state.view.terrain || []).map((t) => [key(t), t.type]));
  const blocked = new Set(); for (const item of state.view.terrain || []) if (!["asteroids", "nebula"].includes(item.type)) for (const hex of terrainFootprint(item)) blocked.add(key(hex));
  let pos = { ...ship.pos }, facing = ship.facing, spent = 0;
  const reserve = (state.orders[ship.id]?.reserve ?? 0) * ship.fullPower, available = ship.fullPower - reserve;
  entries.forEach((entry, round) => {
    facing = norm(facing + (entry.turn || 0));
    let moved = 0;
    for (let step = 0; step < (entry.forward || 0); step++) {
      const d = DIRS[facing], next = { q: pos.q + d.q, r: pos.r + d.r };
      if (!inMap(next, state.view.map) || blocked.has(key(next))) break;
      const type = terrain.get(key(next)), cost = ship.movementPointRatio * (type === "asteroids" ? 2 : 1);
      if (spent + cost > available + 1e-9) break;
      spent += cost; pos = next; moved++; points.push({ ...pos, facing, round: round + 1, moved: true, terrain: type });
    }
    if (moved) points.at(-1).waypoint = true; else points.push({ ...pos, facing, round: round + 1, waypoint: true, hold: true });
  });
  points.spent = spent;
  return points;
}
function drawPlan(ship, geo) {
  const route = plannedRoute(ship);
  ctx.strokeStyle = "#e9fbff"; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]); ctx.beginPath(); route.forEach((pos, i) => { const p = project(pos, geo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke(); ctx.setLineDash([]);
  route.filter((p) => p.waypoint).forEach((pos) => {
    const p = project(pos, geo); ctx.fillStyle = pos.hold ? "#4da68b" : "#e9fbff"; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0b1117"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center"; ctx.fillText(pos.hold ? "F" : String(pos.round), p.x, p.y + 3);
  });
  const end = route.at(-1), p = project(end, geo), angle = dirAngle(end.facing);
  ctx.strokeStyle = "#e9fbff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(angle) * geo.scale * 1.2, p.y + Math.sin(angle) * geo.scale * 1.2); ctx.stroke();
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
  if (selected && state.phase === "planning") { drawArcs(ship, geo); drawShield(ship, geo); drawPlan(ship, geo); drawTarget(ship, geo); }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(dirAngle(ship.facing) + Math.PI / 2); // icons are drawn nose-up
  if (selected) { ctx.strokeStyle = "#fff0b5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, geo.scale * .66, 0, Math.PI * 2); ctx.stroke(); }
  const image = state.icons.get(`${ship.faction}/${ship.className}`);
  if (image) ctx.drawImage(image, -geo.scale * .52, -geo.scale * .52, geo.scale * 1.04, geo.scale * 1.04);
  ctx.restore();
  ctx.fillStyle = color; ctx.font = `${Math.max(9, geo.scale * .3)}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(ship.id, p.x, p.y + geo.scale * .85);
}
function drawEffects(geo) {
  // Beams, missiles and impacts for the round being played back.
  const now = performance.now();
  for (const fx of state.effects) {
    const t = Math.min(1, (now - fx.start) / fx.duration);
    const a = project(fx.from, geo), b = project(fx.to, geo);
    if (fx.kind === "beam") {
      ctx.strokeStyle = fx.color; ctx.globalAlpha = 1 - t * .7; ctx.lineWidth = Math.max(1.5, geo.scale * (fx.heavy ? .12 : .06)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1;
      if (fx.hit) { ctx.fillStyle = fx.color; ctx.globalAlpha = (1 - t) * .8; ctx.beginPath(); ctx.arc(b.x, b.y, geo.scale * .45 * (1 + t), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    } else if (fx.kind === "missile") {
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      ctx.strokeStyle = fx.color; ctx.globalAlpha = .35; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = fx.color; ctx.beginPath(); ctx.arc(x, y, Math.max(2, geo.scale * .18), 0, Math.PI * 2); ctx.fill();
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
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, rect.height); const geo = geometry(); drawGrid(geo); drawTerrain(geo);
  for (const ship of state.displayShips || state.view?.ships || []) if (!ship.destroyed) drawShip(ship, geo);
  drawEffects(geo);
  $("#map-legend").hidden = !(state.phase === "planning" && selectedShip());
}

// ------------------------------------------------------------- schematic
function drawSchematic(ship) {
  const w = schematic.width, h = schematic.height, cx = w / 2, cy = h / 2, R = w * .36;
  sctx.clearRect(0, 0, w, h);
  sctx.fillStyle = "#070b0e"; sctx.fillRect(0, 0, w, h);
  // Weapon arcs, drawn bow-up: face 2 straight up. Facing 1 on screen means
  // "bow up" here, so a face's direction is OFFSET_OF_FACE relative to up.
  const up = 1; // hex direction 1 points up-right on the map; we rotate the schematic so the bow is straight up
  const bowAngle = -Math.PI / 2;
  const angleOfFace = (face) => bowAngle - OFFSET_OF_FACE[face] * Math.PI / 3;
  const max = Math.max(...ship.mounts.map((m) => m.maxRange), 1);
  ship.mounts.forEach((mount, i) => {
    const color = WEAPON_COLORS[mount.type] || "#ddd", outer = R * .55 + R * .45 * (mount.maxRange / max);
    for (const face of mount.arc) {
      const a = angleOfFace(face);
      sctx.beginPath(); sctx.moveTo(cx, cy); sctx.arc(cx, cy, outer, a - Math.PI / 6, a + Math.PI / 6); sctx.closePath();
      sctx.fillStyle = color; sctx.globalAlpha = mount.inop ? .08 : .16; sctx.fill(); sctx.globalAlpha = mount.inop ? .3 : .8; sctx.strokeStyle = color; sctx.lineWidth = 1; sctx.stroke(); sctx.globalAlpha = 1;
    }
  });
  // Shield faces as a ring of six segments.
  const maxShield = Math.max(...Object.values(ship.shieldCap), 1);
  for (let face = 1; face <= 6; face++) {
    const a = angleOfFace(face);
    sctx.beginPath(); sctx.arc(cx, cy, R * .5, a - Math.PI / 6 + .04, a + Math.PI / 6 - .04); sctx.lineWidth = 7;
    sctx.strokeStyle = ship.shieldDown[face] ? "#ec655d" : `rgba(120,200,255,${.25 + .75 * ship.shieldCap[face] / maxShield})`; sctx.stroke();
    sctx.fillStyle = "#9fb3c3"; sctx.font = "9px sans-serif"; sctx.textAlign = "center";
    sctx.fillText(String(face), cx + Math.cos(a) * R * .72, cy + Math.sin(a) * R * .72 + 3);
  }
  // Hull wireframe: a hexagonal outline with a bow mark.
  hexPath(sctx, cx, cy, R * .36); sctx.strokeStyle = "#cfe3f0"; sctx.lineWidth = 1.5; sctx.stroke();
  sctx.beginPath(); sctx.moveTo(cx, cy - R * .36); sctx.lineTo(cx - 5, cy - R * .2); sctx.lineTo(cx + 5, cy - R * .2); sctx.closePath(); sctx.fillStyle = "#cfe3f0"; sctx.fill();
  sctx.fillStyle = "#8aa0b0"; sctx.font = "9px sans-serif"; sctx.textAlign = "center"; sctx.fillText("BOW", cx, cy - R * .92);
  // Legend of mounts along the bottom.
  sctx.textAlign = "left"; sctx.font = "9px sans-serif";
  ship.mounts.forEach((mount, i) => { const y = h - 8 - (ship.mounts.length - 1 - i) * 11; sctx.fillStyle = WEAPON_COLORS[mount.type] || "#ddd"; sctx.fillRect(6, y - 7, 8, 8); sctx.fillStyle = mount.inop ? "#7d5a5a" : "#cfe3f0"; sctx.fillText(`${label(mount.type)} · ${mount.arcName.toUpperCase()} · ${mount.maxRange} hex${mount.inop ? " · OUT" : ""}`, 18, y); });
}

// ----------------------------------------------------------- fire solution
function endOfPlan(ship) { const route = plannedRoute(ship); const end = route.at(-1); return { pos: { q: end.q, r: end.r }, facing: end.facing, route }; }
function fireSolution(ship) {
  const order = state.orders[ship.id] || {}; const el = $("#fire-solution");
  const targetId = order.target && order.target !== "auto" ? order.target : null;
  const target = targetId ? state.view.ships.find((s) => s.id === targetId && !s.destroyed) : null;
  const after = endOfPlan(ship);
  const holds = (order.plan || []).map((e, i) => ({ i, hold: !(e.turn || e.forward) }));
  const firstHold = holds.find((h) => h.hold), anyHold = !!firstHold;
  if (!target) {
    const nearest = state.view.ships.filter((s) => s.side !== ship.side && !s.destroyed).map((s) => ({ s, d: hexDistance(after.pos, s.pos) })).sort((x, y) => x.d - y.d)[0];
    el.innerHTML = `<p class="fs-head">FIRE SOLUTION · auto</p><p>Holding rounds fire at the nearest enemy a weapon bears on.${nearest ? ` Nearest after your moves: <b>${nearest.s.id}</b> at ${nearest.d} hexes.` : ""}</p><p class="fs-note">${anyHold ? `Guns may speak in action${holds.filter((h) => h.hold).length > 1 ? "s" : ""} ${holds.filter((h) => h.hold).map((h) => h.i + 1).join(", ")}.` : "Every action is a move — this ship will not fire this turn."}</p>`;
    return;
  }
  const now = { pos: ship.pos, facing: ship.facing };
  const rows = ship.mounts.map((m) => {
    const bearsNow = !m.inop && mountBears(m, now, target.pos) && hexDistance(now.pos, target.pos) <= m.maxRange;
    const bearsAfter = !m.inop && mountBears(m, after, target.pos) && hexDistance(after.pos, target.pos) <= m.maxRange;
    return { m, bearsNow, bearsAfter };
  });
  const dNow = hexDistance(now.pos, target.pos), dAfter = hexDistance(after.pos, target.pos);
  const willFire = rows.some((r) => r.bearsAfter);
  let verdict;
  if (!anyHold) verdict = `<b class="warn">Every action is a move</b> — nothing fires this turn. Make an action a hold to shoot.`;
  else if (willFire) verdict = `<b class="ok">Will fire</b> in action ${holds.filter((h) => h.hold).map((h) => h.i + 1).join(", ")} with ${rows.filter((r) => r.bearsAfter).length} of ${rows.length} weapons.`;
  else {
    const minRange = Math.min(...rows.map((r) => r.m.maxRange));
    const inRange = rows.some((r) => dAfter <= r.m.maxRange);
    verdict = inRange ? `<b class="warn">No weapon bears</b> from the planned heading — turn so a weapon's arc covers ${target.id}.` : `<b class="warn">Out of range</b> after your moves (${dAfter} hexes; longest reach ${Math.max(...rows.map((r) => r.m.maxRange))}). Close ${dAfter - Math.max(...rows.map((r) => r.m.maxRange))} more.`;
  }
  el.innerHTML = `<p class="fs-head">FIRE SOLUTION · ${target.id}</p><p>Range now <b>${dNow}</b> → after moves <b>${dAfter}</b>. Its face toward you after moves: <b>${FACE_NAMES[faceToward(target.facing, bearingTo(target.pos, after.pos))]}${target.shieldDown[faceToward(target.facing, bearingTo(target.pos, after.pos))] ? " (shield DOWN)" : ""}</b>.</p>` +
    `<ul>${rows.map((r) => `<li><i style="background:${WEAPON_COLORS[r.m.type] || "#ddd"}"></i>${label(r.m.type)} (${r.m.arcName.toUpperCase()}, ${r.m.maxRange}) — now ${r.bearsNow ? "<b class=ok>bears</b>" : "no"} · after ${r.bearsAfter ? "<b class=ok>bears</b>" : "<b class=warn>no</b>"}</li>`).join("")}</ul><p class="fs-verdict">${verdict}</p>`;
}

// ------------------------------------------------------------- orders UI
function ensureOrder(ship) {
  if (!state.orders[ship.id]) state.orders[ship.id] = { plan: Array.from({ length: state.view.roundsPerTurn }, () => ({ turn: 0, forward: 0 })), target: "auto", reserve: .3 };
  return state.orders[ship.id];
}
function selectedShip() { return state.view?.ships.find((ship) => ship.id === state.selected); }
function actionText(entry) { if (!entry.turn && !entry.forward) return "hold & fire"; const t = entry.turn ? `turn ${entry.turn > 0 ? "port" : "starboard"} ${Math.abs(entry.turn)}` : ""; const f = entry.forward ? `${entry.forward} hex${entry.forward === 1 ? "" : "es"}` : "turn only"; return [t, entry.forward ? f : ""].filter(Boolean).join(", ") || f; }
function updateOrderPanel() {
  const ship = selectedShip(), panel = $("#orders-panel"); panel.hidden = !ship; if (panel.hidden) return;
  const mine = ship.side === state.humanSide;
  $("#ship-name").textContent = `${ship.faction} ${label(ship.className)} · ${ship.id}${mine ? "" : " · enemy"}`;
  $("#ro-hull").textContent = `${ship.superstructure} / ${ship.superstructureMax ?? "?"}`;
  $("#ro-power").textContent = `${ship.fullPower} pool`;
  $("#ro-speed").textContent = `${ship.movementPointRatio} power / hex`;
  $("#ro-turn").textContent = `${ship.turnRate} hexside${ship.turnRate === 1 ? "" : "s"} / action`;
  $("#ro-mag").textContent = ship.magazine ?? "—";
  $("#mount-list").innerHTML = ship.mounts.map((m) => `<span><i style="background:${WEAPON_COLORS[m.type] || "#ddd"}"></i>${label(m.type)} · arc ${m.arcName.toUpperCase()} (faces ${m.arc.join(",")}) · ${m.maxRange} hex${m.inop ? " · OUT" : ""}</span>`).join("");
  drawSchematic(ship);
  const controls = ["#round-tabs", "#turn-left", "#turn-right", "#forward-up", "#forward-down", "#hold-button", "#reserve", "#target-auto"];
  for (const sel of controls) $(sel).closest("section") && ($(sel).disabled = !mine);
  $("#round-tabs").hidden = !mine; $("#fire-solution").hidden = !mine; $("#hold-button").hidden = !mine;
  if (!mine) { $("#forward-value").textContent = "enemy vessel"; $("#fire-solution").innerHTML = ""; return; }
  const order = ensureOrder(ship), plan = shipPlan(state.battle, ship.id), entry = order.plan[state.round];
  $("#round-tabs").innerHTML = order.plan.map((e, i) => `<button data-round="${i}" class="${i === state.round ? "active" : ""} ${(!e.turn && !e.forward) ? "hold" : "move"}"><small>ACTION ${i + 1}</small>${actionText(e)}</button>`).join("");
  $("#round-tabs").querySelectorAll("button").forEach((b) => b.onclick = () => { state.round = Number(b.dataset.round); updateOrderPanel(); draw(); });
  $("#forward-value").textContent = actionText(entry);
  $("#reserve").value = order.reserve; $("#reserve-value").textContent = `${Math.round(order.reserve * 100)}%`;
  const route = plannedRoute(ship), move = route.spent, reserve = ship.fullPower * order.reserve, guns = Math.max(0, ship.fullPower - reserve - move);
  $("#movement-cost").textContent = move.toFixed(1); $("#reserve-power").textContent = reserve.toFixed(1); $("#gun-power").textContent = guns.toFixed(1);
  $("#power-move").style.width = `${Math.min(100, move / ship.fullPower * 100)}%`; $("#power-guns").style.width = `${guns / ship.fullPower * 100}%`; $("#power-reserve").style.width = `${reserve / ship.fullPower * 100}%`;
  $("#target-name").textContent = order.target === "auto" ? "auto (nearest that bears)" : order.target;
  $("#turn-left").disabled = entry.turn >= plan.turnRate; $("#turn-right").disabled = entry.turn <= -plan.turnRate;
  fireSolution(ship);
}
function renderFleet() {
  if (!state.view) return;
  $("#ship-list").innerHTML = state.view.ships.map((ship) => {
    const mine = ship.side === state.humanSide, o = state.orders[ship.id];
    const summary = ship.destroyed ? "destroyed" : mine ? (o ? o.plan.map((e) => (!e.turn && !e.forward) ? "F" : "M").join("·") : "hold & fire") : "enemy";
    return `<button class="ship-pick ${ship.id === state.selected ? "active" : ""} ${ship.destroyed ? "dead" : ""}" data-id="${ship.id}"><i style="color:${COLORS[ship.faction]}"></i><span>${ship.id}</span><small>${summary}</small></button>`;
  }).join("");
  $("#ship-list").querySelectorAll("button").forEach((button) => button.onclick = () => selectShip(button.dataset.id));
}
function selectShip(id) {
  const ship = state.view.ships.find((s) => s.id === id); if (!ship) return;
  const current = selectedShip();
  if (ship.side !== state.humanSide && current && current.side === state.humanSide) { ensureOrder(current).target = id; renderFleet(); updateOrderPanel(); draw(); return; }
  state.selected = id; renderFleet(); updateOrderPanel(); draw();
}
function adjustTurn(delta) { const ship = selectedShip(); if (!ship || ship.side !== state.humanSide || state.phase !== "planning") return; const order = ensureOrder(ship), limit = ship.turnRate; order.plan[state.round].turn = Math.max(-limit, Math.min(limit, order.plan[state.round].turn + delta)); renderFleet(); updateOrderPanel(); draw(); }
function adjustForward(delta) { const ship = selectedShip(); if (!ship || ship.side !== state.humanSide || state.phase !== "planning") return; const entry = ensureOrder(ship).plan[state.round]; entry.forward = Math.max(0, entry.forward + delta); renderFleet(); updateOrderPanel(); draw(); }
function holdAction() { const ship = selectedShip(); if (!ship || ship.side !== state.humanSide) return; const entry = ensureOrder(ship).plan[state.round]; entry.turn = 0; entry.forward = 0; renderFleet(); updateOrderPanel(); draw(); }
function setSequence(step) { document.querySelectorAll("#sequence span").forEach((s) => s.classList.toggle("active", s.dataset.step === step)); }
function refreshView() { state.view = battleView(state.battle); state.displayShips = null; $("#turn-label").textContent = `Turn ${state.view.turn} · Planning`; renderFleet(); updateOrderPanel(); draw(); }
function appendLog(entries) { state.record.log.push(...entries); $("#log-lines").innerHTML = state.record.log.slice(-120).map((entry) => `<li class="${entry.kind || ""}">${entry.message}</li>`).join(""); $("#log-count").textContent = `${state.record.log.length} events`; $("#log-lines").scrollTop = $("#log-lines").scrollHeight; }

// -------------------------------------------------------------- playback
function shipAt(frame, id) { return frame.ships.find((s) => s.id === id); }
function narrateShots(shots, frame, prevFrame) {
  const lines = [];
  for (const s of shots) {
    if (s.kind === "beam" || s.kind === "spinal") lines.push({ turn: s.turn, round: s.round, kind: s.hit ? "hit" : "miss", message: `${s.shooterId} fires ${label(s.weapon)} at ${s.targetId}, range ${s.range}: ${s.hit ? `HIT for ${s.damage}` : "miss"}` });
    else if (s.kind === "launch") lines.push({ turn: s.turn, round: s.round, kind: "launch", message: `${s.shooterId} launches ${label(s.weapon)} at ${s.targetId}, range ${s.range} (warhead ${s.damage}) — arrives next turn` });
    else if (s.kind === "missile") lines.push({ turn: s.turn, round: s.round, kind: s.outcome === "hit" ? "hit" : "miss", message: `${label(s.weapon)} from ${s.shooterId || "?"} → ${s.targetId}: ${s.outcome === "hit" ? `HIT for ${s.damage}` : s.outcome}` });
    else if (s.kind === "strike") lines.push({ turn: s.turn, round: s.round, kind: "strike", message: `${s.squadronId || "squadron"} strikes ${s.targetId || ""}` });
  }
  return lines;
}
function spawnEffects(shots, frame, prevFrame) {
  const at = (id) => (shipAt(frame, id) || shipAt(prevFrame, id) || {}).pos;
  const t0 = performance.now(); let i = 0;
  for (const s of shots) {
    const from = at(s.shooterId), to = at(s.targetId); if (!to) continue;
    const color = WEAPON_COLORS[s.weapon] || "#fff", delay = (i++ % 6) * 90;
    if ((s.kind === "beam" || s.kind === "spinal") && from) state.effects.push({ kind: "beam", from, to, color, hit: s.hit, heavy: s.kind === "spinal" || /blaster/.test(s.weapon), start: t0 + delay, duration: 700 });
    else if (s.kind === "launch" && from) state.effects.push({ kind: "missile", from, to, color, start: t0 + delay, duration: 900 });
    else if (s.kind === "missile") state.effects.push({ kind: "impact", from: to, to, color, text: s.outcome === "hit" ? `HIT ${s.damage}` : s.outcome.toUpperCase(), start: t0 + delay, duration: 900 });
  }
}
function animateFrame(frame, ms = 650) {
  const from = new Map((state.displayShips || state.view.ships).map((ship) => [ship.id, ship]));
  return new Promise((resolve) => {
    const began = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - began) / ms), eased = t * t * (3 - 2 * t);
      state.displayShips = frame.ships.map((ship) => { const old = from.get(ship.id) || ship; return { ...ship, facing: t < .5 ? old.facing : ship.facing, pos: { q: old.pos.q + (ship.pos.q - old.pos.q) * eased, r: old.pos.r + (ship.pos.r - old.pos.r) * eased } }; });
      draw(); if (t < 1) requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
}
function animateEffects(ms) { return new Promise((resolve) => { const began = performance.now(); function tick(now) { draw(); if (now - began < ms) requestAnimationFrame(tick); else resolve(); } requestAnimationFrame(tick); }); }
async function playback(turn) {
  state.phase = "playback"; $("#end-turn").disabled = true; $("#map-legend").hidden = true;
  const impacts = turn.shots.filter((s) => s.kind === "missile");
  setSequence("power"); $("#turn-label").textContent = `Turn ${turn.turn} · Power`; await animateEffects(350);
  const prev = { ships: state.view.ships };
  if (impacts.length) { setSequence("impacts"); $("#turn-label").textContent = `Turn ${turn.turn} · Impacts`; spawnEffects(impacts, turn.rounds[0] || prev, prev); appendLog(narrateShots(impacts)); await animateEffects(900); }
  let previous = prev;
  for (const frame of turn.rounds) {
    setSequence(`a${frame.round}`); $("#turn-label").textContent = `Turn ${frame.turn} · Action round ${frame.round} of ${turn.rounds.length}`;
    await animateFrame(frame);
    const shots = turn.shots.filter((s) => s.round === frame.round && s.kind !== "missile");
    spawnEffects(shots, frame, previous);
    appendLog([...turn.log.filter((entry) => entry.round === frame.round), ...narrateShots(shots)]);
    await animateEffects(shots.length ? 800 : 250);
    previous = frame;
  }
  setSequence("end"); await animateEffects(250);
  state.phase = turn.result ? "ended" : "planning"; state.orders = {}; state.selected = null; state.effects = [];
  refreshView(); frameFleets(); draw(); setSequence("");
  if (turn.result) { $("#verdict").hidden = false; $("#verdict").textContent = turn.result.victor ? `${state.record.meta.factions[turn.result.victor]} VICTORY` : "BATTLE DRAWN"; $("#end-turn").disabled = true; $("#hint").textContent = "Battle over. Save the record or open it in the viewer."; }
  else { $("#end-turn").disabled = false; $("#hint").textContent = "Plan the next turn: pick a ship, set its three actions, choose a target."; }
}
async function endTurn() {
  if (!state.battle || state.phase !== "planning") return;
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
function renderRoster(side) {
  const faction = $(`#quick-faction-${side}`).value, host = $(`#quick-roster-${side}`);
  host.innerHTML = rosterFor(faction).map((cls) => { const h = state.tuning.hullClasses[cls]; return `<label><span>${label(cls)} <em>${h.points}</em></span><input type="number" min="0" max="${h.limit ?? 40}" value="0" data-class="${cls}"></label>`; }).join("");
  host.querySelectorAll("input").forEach((input) => input.oninput = () => quickTotals());
  quickTotals();
}
function quickComposition(side) { const out = []; $(`#quick-roster-${side}`).querySelectorAll("input").forEach((input) => { const n = Math.max(0, Math.floor(Number(input.value) || 0)); for (let i = 0; i < n; i++) out.push({ className: input.dataset.class }); }); return out; }
function quickTotals() { for (const side of ["a", "b"]) $(`#quick-total-${side}`).textContent = quickComposition(side).reduce((sum, s) => sum + state.tuning.hullClasses[s.className].points, 0); }
function quickScenario() {
  const a = quickComposition("a"), b = quickComposition("b");
  if (!a.length || !b.length) throw new Error("Both sides need at least one ship.");
  return { name: `${$("#quick-faction-a").value} vs ${$("#quick-faction-b").value}`, seed: $("#seed-input").value || "orion",
    map: { widthHexes: Number($("#quick-width").value) || 72, heightHexes: Number($("#quick-height").value) || 40 }, terrain: [],
    startDistanceHexes: Number($("#quick-gap").value) || 26,
    sides: [{ faction: $("#quick-faction-a").value, ships: a }, { faction: $("#quick-faction-b").value, ships: b }] };
}
async function start() {
  try {
    let scenario;
    if (state.setupMode === "quick") scenario = quickScenario();
    else if (state.setupMode === "session") { const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); scenario = stored?.meta?.scenario; if (!scenario) throw new Error("The editor has not handed off a scenario in this tab."); }
    else scenario = await loadScenario($("#scenario-select").value);
    scenario = clone(scenario); scenario.seed = $("#seed-input").value || scenario.seed || "orion";
    const tuning = scenario.startDistanceHexes ? { ...state.tuning, battle: { ...state.tuning.battle, startDistanceHexes: scenario.startDistanceHexes } } : state.tuning;
    state.scenario = scenario; state.humanSide = $("#side-select").value;
    state.battle = createBattle(scenario, tuning, state.loadouts, scenario.seed); state.view = battleView(state.battle); state.record = createPlayRecord(scenario, state.view); state.phase = "planning";
    $("#setup-panel").hidden = true; $("#side-label").textContent = `Commanding ${state.record.meta.factions[state.humanSide]} · Side ${state.humanSide}`; $("#end-turn").disabled = false;
    $("#hint").textContent = "Pick one of your ships. Set its three actions (move, or hold & fire), choose a target, then End turn."; refreshView(); frameFleets(); draw();
    if (!localStorage.getItem("orion-wars:help-seen")) { $("#help-panel").hidden = false; }
  } catch (error) { setStatus(error.message); }
}
async function loadIcons() { try { const manifest = await (await fetch("../assets/icons/manifest.json", { cache: "no-store" })).json(); for (const [id, entry] of Object.entries(manifest.icons || {})) { const image = new Image(); image.onload = () => { state.icons.set(id, image); draw(); }; image.src = `../assets/icons/${entry.file}`; } } catch (error) { console.warn("Playfield: icons unavailable", error); } }
function setMode(mode) { state.setupMode = mode; document.querySelectorAll(".setup-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode)); for (const m of ["quick", "bundled", "session"]) $(`#mode-${m}`).hidden = m !== mode; if (mode !== "quick") updateSideLabels(); else { $("#side-select").options[0].textContent = `Side A — ${$("#quick-faction-a").value}`; $("#side-select").options[1].textContent = `Side B — ${$("#quick-faction-b").value}`; } }
async function updateSideLabels() { try { let s = null; if (state.setupMode === "bundled") s = await loadScenario($("#scenario-select").value); else { const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); s = stored?.meta?.scenario || null; } if (s) { $("#side-select").options[0].textContent = `Side A — ${s.sides[0].faction}`; $("#side-select").options[1].textContent = `Side B — ${s.sides[1].faction}`; if (state.setupMode === "bundled") $("#scenario-blurb").textContent = SCENARIOS.find(([f]) => f === $("#scenario-select").value)?.[2] || ""; else $("#session-blurb").textContent = `Ready: ${s.name} (${s.sides[0].faction} vs ${s.sides[1].faction}).`; } } catch {} }
async function init() {
  try {
    [state.tuning, state.loadouts] = await Promise.all([fetch("../data/tactical-tuning.json", { cache: "no-store" }).then((r) => r.json()), fetch("../data/loadouts.json", { cache: "no-store" }).then((r) => r.json())]);
    const factions = ["EAR", "VRA", "ZAN", "KRE"];
    for (const side of ["a", "b"]) { const sel = $(`#quick-faction-${side}`); sel.innerHTML = factions.map((f) => `<option value="${f}">${f}</option>`).join(""); sel.value = side === "a" ? "EAR" : "KRE"; sel.onchange = () => { renderRoster(side); setMode("quick"); }; renderRoster(side); }
    // A sensible default fleet: the 52-point reference line each side.
    for (const side of ["a", "b"]) for (const [cls, n] of Object.entries({ "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 })) { const input = $(`#quick-roster-${side} input[data-class="${cls}"]`); if (input) input.value = n; }
    quickTotals();
    $("#scenario-select").innerHTML = SCENARIOS.map(([file, name]) => `<option value="${file}">${name}</option>`).join("");
    $("#scenario-select").onchange = updateSideLabels;
    document.querySelectorAll(".setup-tabs button").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
    setMode("quick");
  } catch (error) { setStatus(`Tactical data could not load: ${error.message}`); }
}

$("#start-battle").onclick = start; $("#turn-left").onclick = () => adjustTurn(1); $("#turn-right").onclick = () => adjustTurn(-1); $("#forward-up").onclick = () => adjustForward(1); $("#forward-down").onclick = () => adjustForward(-1); $("#hold-button").onclick = holdAction;
$("#reserve").oninput = (e) => { const ship = selectedShip(); if (ship) { ensureOrder(ship).reserve = Number(e.target.value); updateOrderPanel(); draw(); } };
$("#target-auto").onclick = () => { const ship = selectedShip(); if (ship) { ensureOrder(ship).target = "auto"; updateOrderPanel(); draw(); } };
$("#end-turn").onclick = endTurn; $("#save-record").onclick = saveRecord; $("#open-viewer").onclick = openViewer;
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
  if (ships.length) { selectShip(ships[0].id); return; }
  // Click along the planned course to set this action's forward run.
  const ship = selectedShip(); if (!ship || ship.side !== state.humanSide) return;
  const entry = ensureOrder(ship).plan[state.round]; const route = plannedRoute(ship); const start = route.filter((p) => p.round === state.round).at(-1) || route[0];
  const facing = norm((route.filter((p) => p.round === state.round).at(-1)?.facing ?? ship.facing) + (entry.turn || 0));
  const d = DIRS[facing]; let steps = 0; let pos = { q: start.q, r: start.r };
  while (steps < 40 && key(pos) !== key(hex)) { pos = { q: pos.q + d.q, r: pos.r + d.r }; steps++; }
  if (key(pos) === key(hex)) { entry.forward = steps; renderFleet(); updateOrderPanel(); draw(); }
};
canvas.onwheel = (event) => { event.preventDefault(); state.camera.zoom = Math.max(.65, Math.min(6, state.camera.zoom * (event.deltaY < 0 ? 1.12 : .89))); draw(); };
window.addEventListener("keydown", (event) => {
  if (["INPUT", "SELECT"].includes(document.activeElement?.tagName)) return;
  const k = event.key.toLowerCase();
  if (k === "q") adjustTurn(1); else if (k === "e") adjustTurn(-1); else if (k === "w") adjustForward(1); else if (k === "s") adjustForward(-1); else if (k === "h") holdAction();
  else if (k === "1" || k === "2" || k === "3") { state.round = Number(k) - 1; updateOrderPanel(); draw(); }
  else if (k === "tab") { event.preventDefault(); const ids = state.view.ships.filter((s) => s.side === state.humanSide && !s.destroyed).map((s) => s.id); if (ids.length) selectShip(ids[(ids.indexOf(state.selected) + 1) % ids.length]); }
  else if (k === "enter") endTurn();
});
window.addEventListener("resize", draw);
window.__play = { state, createBattle, battleView, shipPlan, stepTurn, plannedRoute, selectShip, endTurn, fireSolution, frameFleets };
init(); loadIcons(); draw();
