(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#arena-canvas");
  const ctx = canvas.getContext("2d");
  const colors = { EAR: "#54a8ff", VRA: "#edc85e", ZAN: "#ec655d", KRE: "#62c98a" };
  const SPRITE_UNITS_TO_HEX_RADIUS = .105;
  const WARP_FALLBACK_DISTANCE_HEXES = 8;
  const WARP_CUT = .48;
  const sprites = new Map();
  const state = {
    replay: null, index: 0, playing: false, speed: 1, progress: 0,
    lastTime: 0, pinned: null, hits: [], flashUntil: 0, shotEffects: [],
    warpEvents: new Set(), hasReplayLog: false
  };

  async function loadSprites() {
    try {
      const response = await fetch("./sprites/manifest.json");
      if (!response.ok) return;
      const manifest = await response.json();
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
      await Promise.allSettled(Object.entries(manifest).map(([key, entry]) => new Promise((resolve) => {
        if (!entry || typeof entry.file !== "string" || !Number.isFinite(entry.spanUnits) || entry.spanUnits <= 0) {
          resolve();
          return;
        }
        const image = new Image();
        image.decoding = "async";
        image.addEventListener("load", () => {
          sprites.set(key, { image, spanUnits: entry.spanUnits });
          draw();
          resolve();
        }, { once: true });
        image.addEventListener("error", resolve, { once: true });
        image.src = `./sprites/${encodeURIComponent(entry.file)}`;
      })));
    } catch (_) {
      // The arena remains fully usable with its vector ship markers.
    }
  }

  function validateReplay(data) {
    if (!data || !data.meta || !Array.isArray(data.rounds) || !Array.isArray(data.log) || !data.result) {
      throw new Error("That file is not an Orion Wars replay.");
    }
    if (!data.rounds.length) throw new Error("The replay contains no completed rounds.");
    return data;
  }

  function loadReplay(data) {
    try {
      state.replay = validateReplay(data);
      state.index = 0;
      state.progress = 0;
      state.playing = false;
      state.pinned = null;
      state.shotEffects = buildShotEffects(data);
      state.warpEvents = buildWarpEvents(data);
      state.hasReplayLog = data.log.length > 0;
      $("#load-panel").hidden = true;
      $("#scrubber").max = String(data.rounds.length - 1);
      $("#play").textContent = "▶";
      $("#ship-card").hidden = true;
      updatePanel();
      draw();
    } catch (error) {
      showLoader(error.message);
    }
  }

  function showLoader(message) {
    $("#load-message").textContent = message || "Choose a replay JSON, or drop it anywhere on this panel.";
    $("#load-panel").hidden = false;
  }

  async function loadUrl(url, fallbackMessage) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loadReplay(await response.json());
      return true;
    } catch (_) {
      showLoader(fallbackMessage || "Automatic loading is unavailable here. Choose or drop a replay JSON.");
      return false;
    }
  }

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try { loadReplay(JSON.parse(reader.result)); }
      catch (_) { showLoader("That file is not valid JSON."); }
    });
    reader.addEventListener("error", () => showLoader("The replay file could not be read."));
    reader.readAsText(file);
  }

  function currentRound() { return state.replay?.rounds[state.index]; }
  function shipAt(round, id) { return round?.ships.find((ship) => ship.id === id); }

  function buildShotEffects(replay) {
    if (!Array.isArray(replay.shots)) return [];
    const effects = [];
    const launches = new Map();
    for (const event of replay.shots) {
      const roundIndex = replay.rounds.findIndex((entry) => entry.turn === event.turn && entry.round === event.round);
      if (roundIndex < 0) continue;
      if (event.kind === "beam") {
        effects.push({ kind: "beam", roundIndex, event });
      } else if (event.kind === "launch") {
        const key = `${event.weapon}|${event.targetId}`;
        const queue = launches.get(key) || [];
        const effect = { kind: "missile", launchIndex: roundIndex, arrivalIndex: replay.rounds.length, launch: event, arrival: null };
        queue.push(effect);
        launches.set(key, queue);
        effects.push(effect);
      } else if (event.kind === "missile") {
        const key = `${event.weapon}|${event.targetId}`;
        const effect = launches.get(key)?.shift();
        if (effect) {
          effect.arrivalIndex = roundIndex;
          effect.arrival = event;
        }
      }
    }
    return effects;
  }

  function buildWarpEvents(replay) {
    const events = new Set();
    for (const entry of replay.log) {
      if (typeof entry.message !== "string") continue;
      const marker = "warps in behind";
      const markerIndex = entry.message.indexOf(marker);
      if (markerIndex < 0) continue;
      const shipId = entry.message.slice(0, markerIndex).trim();
      if (shipId) events.add(`${entry.turn}:${entry.round}:${shipId}`);
    }
    return events;
  }

  function survivingPoints(round, faction) {
    return round.ships.reduce((sum, ship) => sum + (ship.faction === faction && !ship.destroyed ? ship.points : 0), 0);
  }

  function updatePanel() {
    const replay = state.replay;
    const round = currentRound();
    if (!round) return;
    const factionA = replay.meta.factions.A;
    const factionB = replay.meta.factions.B;
    $("#round-label").textContent = `Turn ${round.turn} / Round ${round.round}`;
    $("#faction-a").textContent = factionA;
    $("#faction-b").textContent = factionB;
    $("#faction-a").style.color = colors[factionA];
    $("#faction-b").style.color = colors[factionB];
    $("#points-a").textContent = formatPoints(survivingPoints(round, factionA));
    $("#points-b").textContent = formatPoints(survivingPoints(round, factionB));
    $("#scrubber").value = String(state.index);
    $("#position").textContent = `${state.index + 1} / ${replay.rounds.length}`;

    const lines = replay.log.filter((entry) => entry.turn === round.turn && entry.round === round.round);
    $("#log-count").textContent = `${lines.length} event${lines.length === 1 ? "" : "s"}`;
    const list = $("#log-lines");
    list.replaceChildren();
    if (!lines.length) {
      const item = document.createElement("li");
      item.className = "quiet";
      item.textContent = "No recorded events.";
      list.append(item);
    } else {
      for (const entry of lines) {
        const item = document.createElement("li");
        item.textContent = entry.message;
        list.append(item);
      }
    }

    const ended = state.index === replay.rounds.length - 1;
    const verdict = $("#verdict");
    verdict.hidden = !ended;
    if (ended) {
      const victor = replay.result.victor;
      verdict.textContent = victor ? `${replay.meta.factions[victor]} VICTORY` : "BATTLE DRAWN";
    }
    updateShipCard();
  }

  function formatPoints(points) { return Number.isInteger(points) ? String(points) : points.toFixed(1); }

  function updateShipCard() {
    if (!state.pinned || !state.replay) return;
    const ship = shipAt(currentRound(), state.pinned);
    if (!ship) return;
    $("#ship-card").hidden = false;
    $("#ship-name").textContent = ship.id;
    $("#ship-name").style.color = colors[ship.faction];
    const active = ship.mounts.filter((mount) => !mount.inop).length;
    const shields = [1, 2, 3, 4, 5, 6].map((face) =>
      `<span class="${ship.shieldDown[face] ? "down" : ""}">${face}:${ship.shieldDown[face] ? "×" : ship.shieldCap[face]}</span>`
    ).join("");
    $("#ship-details").innerHTML =
      `<div class="detail-grid">` +
      `<div>Class<strong>${escapeHtml(ship.className)}</strong></div>` +
      `<div>Status<strong>${ship.destroyed ? "Destroyed" : ship.cloaked ? "Cloaked" : "Operational"}</strong></div>` +
      `<div>Power<strong>${ship.power}</strong></div>` +
      `<div>Magazine<strong>${ship.magazine}</strong></div>` +
      `<div>Hull<strong>${ship.superstructure} / ${ship.superstructureMax}</strong></div>` +
      `<div>Mounts<strong>${active} / ${ship.mounts.length} online</strong></div></div>` +
      `<div class="shield-list">Shield faces<div>${shields}</div></div>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(box.width * ratio));
    const height = Math.max(1, Math.round(box.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    return box;
  }

  function geometry() {
    const box = canvas.getBoundingClientRect();
    const radius = state.replay?.meta.tuning.mapRadiusHexes || 22;
    const scale = Math.min(box.width / (Math.sqrt(3) * (radius * 2 + 2)), box.height / (3 * (radius + 1)));
    return { cx: box.width / 2, cy: box.height / 2, scale: Math.max(1, scale) };
  }

  function safeRadial(x0, y0, r0, x1, y1, r1) {
    for (const v of [x0, y0, r0, x1, y1, r1]) if (!Number.isFinite(v)) return null;
    return ctx.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.01, r1));
  }

  function finiteXY(...pts) {
    for (const p of pts) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    return true;
  }

  function project(pos, geo) {
    const x = Math.sqrt(3) * (pos.q + pos.r / 2);
    const y = -1.5 * pos.r;
    return { x: geo.cx + x * geo.scale, y: geo.cy - y * geo.scale };
  }

  function lastShipAt(id, index) {
    for (let i = Math.min(index, state.replay.rounds.length - 1); i >= 0; i--) {
      const ship = shipAt(state.replay.rounds[i], id);
      if (ship) return ship;
    }
    for (let i = Math.max(0, index + 1); i < state.replay.rounds.length; i++) {
      const ship = shipAt(state.replay.rounds[i], id);
      if (ship) return ship;
    }
    return null;
  }

  function mixPoint(a, b, amount) {
    return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
  }

  function curvePoint(start, end, amount, bend) {
    const straight = mixPoint(start, end, amount);
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const arc = Math.sin(Math.PI * amount) * bend;
    return { x: straight.x - dy / length * arc, y: straight.y + dx / length * arc };
  }

  function drawShotEffects(geo, now) {
    if (!state.shotEffects.length) return;
    for (const effect of state.shotEffects) {
      if (effect.kind === "beam" && effect.roundIndex === state.index) drawBeam(effect, geo);
      else if (effect.kind === "missile") drawMissile(effect, geo, now);
    }
  }

  function drawBeam(effect, geo) {
    const phase = state.progress;
    if (phase > .38) return;
    const shot = effect.event;
    const shooter = lastShipAt(shot.shooterId, effect.roundIndex);
    const target = lastShipAt(shot.targetId, effect.roundIndex);
    if (!shooter || !target) return;
    const start = project(shooter.pos, geo);
    let end = project(target.pos, geo);
    if (!shot.hit) {
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      end = { x: end.x + dx / length * 34, y: end.y + dy / length * 34 };
    }
    const laser = shot.weapon === "laser-cannon";
    const heavy = shot.weapon === "heavy-blaster";
    const alpha = Math.max(0, 1 - phase / .38);
    const head = mixPoint(start, end, Math.min(1, phase / .16 + .35));
    const tail = laser ? start : mixPoint(start, head, .58);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = laser ? "#bfeaff" : heavy ? "#ff512f" : "#ff7848";
    ctx.shadowColor = laser ? "#5bbdff" : "#ff3b20";
    ctx.shadowBlur = laser ? 9 : heavy ? 18 : 13;
    ctx.lineWidth = laser ? 1.6 : heavy ? 6.5 : 4.2;
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    if (laser) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = .7;
      ctx.stroke();
    }
    ctx.restore();
    if (shot.hit && phase < .3) drawShieldFlash(target, shooter.pos, geo, phase / .3);
  }

  function drawMissile(effect, geo, now) {
    const absolute = state.index + state.progress;
    const arrivalIndex = Math.min(effect.arrivalIndex, state.replay.rounds.length - 1);
    if (absolute < effect.launchIndex || state.index > arrivalIndex) return;
    const shooter = lastShipAt(effect.launch.shooterId, effect.launchIndex);
    const target = lastShipAt(effect.launch.targetId, arrivalIndex);
    if (!shooter || !target) return;
    const start = project(shooter.pos, geo);
    const end = project(target.pos, geo);
    const span = Math.max(1, effect.arrivalIndex - effect.launchIndex);
    const rawTravel = Math.max(0, Math.min(1, (absolute - effect.launchIndex) / span));
    const outcome = effect.arrival?.outcome;
    const plasma = effect.launch.weapon === "plasma-torpedo";
    const travel = plasma ? Math.pow(rawTravel, 1.18) : rawTravel;
    const bend = plasma ? geo.scale * .3 : 0;
    const cappedTravel = outcome === "intercepted" ? Math.min(travel, .62) : travel;
    const at = curvePoint(start, end, cappedTravel, bend);
    if (outcome === "evaded") {
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const wide = geo.scale * 3.2 * Math.max(0, (rawTravel - .45) / .55);
      at.x -= dy / length * wide;
      at.y += dx / length * wide;
    }
    if (outcome === "intercepted" && state.index === arrivalIndex) {
      if (state.progress < .34) drawMissilePop(at, plasma, state.progress / .34);
      return;
    }
    const fade = outcome === "dead-target" && travel > .78 ? Math.max(0, (1 - travel) / .22) : 1;
    if (fade <= 0) return;
    if (plasma) drawPlasma(at, start, end, cappedTravel, bend, fade, now);
    else drawNeutronic(at, fade, now);
    if (effect.arrival && state.index === arrivalIndex && state.progress < .32) {
      if (outcome === "hit") drawShieldFlash(target, shooter.pos, geo, state.progress / .32);
      else if (outcome === "evaded") drawEvadeStreak(at, start, end, state.progress);
    }
  }

  function drawNeutronic(at, alpha, now) {
    if (!finiteXY(at) || !Number.isFinite(alpha)) return;
    const pulse = 1 + Math.sin(now / 85) * .16;
    const radius = 11 * pulse;
    const gradient = safeRadial(at.x, at.y, 0, at.x, at.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(255,255,238,${alpha})`);
    gradient.addColorStop(.25, `rgba(255,206,91,${alpha * .95})`);
    gradient.addColorStop(1, "rgba(255,119,25,0)");
    ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = "#ffac32"; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawPlasma(at, start, end, travel, bend, alpha, now) {
    if (!finiteXY(at, start, end)) return;
    const wobble = Math.sin(now / 67 + travel * 9) * 1.5;
    for (let i = 4; i >= 1; i--) {
      const trailTravel = Math.max(0, travel - i * .035);
      const p = curvePoint(start, end, trailTravel, bend);
      ctx.fillStyle = `rgba(35,220,166,${alpha * (5 - i) * .07})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 + i * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    const radius = 15 + wobble;
    const gradient = safeRadial(at.x - 2, at.y - 2, 1, at.x, at.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(225,255,217,${alpha})`);
    gradient.addColorStop(.3, `rgba(46,235,174,${alpha * .92})`);
    gradient.addColorStop(.72, `rgba(12,137,124,${alpha * .65})`);
    gradient.addColorStop(1, "rgba(0,82,77,0)");
    ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = "#24e0b0"; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawMissilePop(at, plasma, phase) {
    const radius = 5 + phase * 24;
    ctx.save(); ctx.globalAlpha = 1 - phase; ctx.strokeStyle = plasma ? "#56ffd0" : "#ffd36a";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  function drawEvadeStreak(at, start, end, phase) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - phase / .32); ctx.strokeStyle = "rgba(152,255,229,.75)";
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(at.x, at.y);
    ctx.lineTo(at.x + dx / length * 30, at.y + dy / length * 30); ctx.stroke(); ctx.restore();
  }

  function shieldFace(target, attackerPos) {
    const a = { x: Math.sqrt(3) * (target.pos.q + target.pos.r / 2), y: -1.5 * target.pos.r };
    const b = { x: Math.sqrt(3) * (attackerPos.q + attackerPos.r / 2), y: -1.5 * attackerPos.r };
    const degrees = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const direction = Math.round(((degrees + 360) % 360) / 60) % 6;
    return [2, 3, 4, 5, 6, 1][(direction - target.facing + 6) % 6];
  }

  function drawShieldFlash(target, attackerPos, geo, phase) {
    if (!target || !target.pos || !attackerPos) return;
    const at = project(target.pos, geo);
    const size = Math.max(5, Math.min(13, 5 + Math.sqrt(target.points) * 2));
    const face = shieldFace(target, attackerPos);
    const offset = [5, 0, 1, 2, 3, 4][face - 1];
    const angle = -(target.facing + offset) * Math.PI / 3;
    const center = { x: at.x + Math.cos(angle) * (size + 7), y: at.y + Math.sin(angle) * (size + 7) };
    const radius = 5 + phase * 8;
    const gradient = safeRadial(center.x, center.y, 0, center.x, center.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(235,252,255,${1 - phase})`);
    gradient.addColorStop(.45, `rgba(78,206,255,${(1 - phase) * .85})`);
    gradient.addColorStop(1, "rgba(50,161,255,0)");
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fill();
  }

  function drawGrid(geo) {
    const radius = state.replay.meta.tuning.mapRadiusHexes;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(130, 161, 181, .105)";
    for (let q = -radius; q <= radius; q++) {
      const minR = Math.max(-radius, -q - radius);
      const maxR = Math.min(radius, -q + radius);
      for (let r = minR; r <= maxR; r++) drawHex(project({ q, r }, geo), geo.scale);
    }
    ctx.strokeStyle = "rgba(228, 194, 117, .24)";
    drawBoundary(geo, radius);
  }

  function drawHex(center, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      const x = center.x + Math.cos(angle) * size;
      const y = center.y + Math.sin(angle) * size;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function drawBoundary(geo, radius) {
    const corners = [{q:radius,r:0},{q:radius,r:-radius},{q:0,r:-radius},{q:-radius,r:0},{q:-radius,r:radius},{q:0,r:radius}];
    ctx.beginPath();
    corners.forEach((corner, index) => {
      const p = project(corner, geo);
      if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function hexDistance(a, b) {
    const dq = b.q - a.q;
    const dr = b.r - a.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }

  function clamp01(value) { return Math.max(0, Math.min(1, value)); }

  function shortestFacingDelta(from, to) {
    return ((to - from + 3) % 6 + 6) % 6 - 3;
  }

  function interpolateShip(ship, nextRound, amount) {
    const next = shipAt(nextRound, ship.id);
    if (!next || amount <= 0) return ship;
    const distance = hexDistance(ship.pos, next.pos);
    const warpKey = `${nextRound.turn}:${nextRound.round}:${ship.id}`;
    const warp = state.warpEvents.has(warpKey) || (!state.hasReplayLog && distance >= WARP_FALLBACK_DISTANCE_HEXES);
    const pos = warp
      ? (amount < WARP_CUT ? ship.pos : next.pos)
      : { q: ship.pos.q + (next.pos.q - ship.pos.q) * amount, r: ship.pos.r + (next.pos.r - ship.pos.r) * amount };
    const opacity = warp
      ? (amount < WARP_CUT ? clamp01(1 - amount / .36) : clamp01((amount - WARP_CUT) / .28))
      : 1;
    return {
      ...ship,
      pos,
      facing: ship.facing + shortestFacingDelta(ship.facing, next.facing) * amount,
      destroyed: amount < .72 ? ship.destroyed : next.destroyed,
      superstructure: amount < .72 ? ship.superstructure : next.superstructure,
      shieldCap: amount < .72 ? ship.shieldCap : next.shieldCap,
      shieldDown: amount < .72 ? ship.shieldDown : next.shieldDown,
      _motion: { start: ship.pos, end: next.pos, amount, distance, warp, opacity }
    };
  }

  function drawMotionCue(ship, geo) {
    const motion = ship._motion;
    if (!motion || motion.distance <= 0) return;
    if (motion.warp) {
      const phase = 1 - Math.abs(motion.amount - WARP_CUT) / .18;
      if (phase <= 0) return;
      const start = project(motion.start, geo);
      const end = project(motion.end, geo);
      ctx.save();
      ctx.globalAlpha = clamp01(phase) * .72;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#72f7cf";
      ctx.shadowColor = "#80ffe1";
      ctx.shadowBlur = 18;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.globalAlpha *= .9;
      ctx.strokeStyle = "#efffff";
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      return;
    }

    const start = project(motion.start, geo);
    const end = project(motion.end, geo);
    const at = project(ship.pos, geo);
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < .5) return;
    const trail = Math.min(geo.scale * 1.8, length * .42);
    const alpha = Math.sin(Math.PI * motion.amount) * .22;
    if (alpha <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(116,210,190,.42)";
    ctx.shadowColor = colors[ship.faction] || "#9fe8d5";
    ctx.shadowBlur = 5;
    for (let i = 3; i >= 1; i--) {
      const fraction = i / 3;
      ctx.globalAlpha = alpha * (1.15 - fraction * .25);
      ctx.lineWidth = 1 + (3 - i) * .45;
      ctx.beginPath();
      ctx.moveTo(at.x - dx / length * trail * fraction, at.y - dy / length * trail * fraction);
      ctx.lineTo(at.x - dx / length * trail * Math.max(0, fraction - .28), at.y - dy / length * trail * Math.max(0, fraction - .28));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShip(ship, previous, geo, now) {
    const at = project(ship.pos, geo);
    const size = Math.max(5, Math.min(13, 5 + Math.sqrt(ship.points) * 2));
    const sprite = sprites.get(`${ship.faction}/${ship.className}`);
    const spriteSize = sprite ? sprite.spanUnits * SPRITE_UNITS_TO_HEX_RADIUS * geo.scale : 0;
    const overlaySize = sprite ? Math.max(size, spriteSize / 2) : size;
    const hidden = ship.cloaked && !ship.detected;
    const destroyedNow = ship.destroyed;
    const motionOpacity = ship._motion?.opacity ?? 1;
    drawMotionCue(ship, geo);
    ctx.save();
    ctx.globalAlpha = (destroyedNow ? .28 : hidden ? .22 : 1) * motionOpacity;
    ctx.translate(at.x, at.y);
    if (sprite) {
      if (state.pinned === ship.id) {
        ctx.strokeStyle = "#ecf7ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, spriteSize * .52, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.rotate(Math.PI / 2 - ship.facing * Math.PI / 3);
      if (destroyedNow) ctx.filter = "grayscale(1) brightness(.65)";
      ctx.drawImage(sprite.image, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
    } else {
      ctx.rotate(-ship.facing * Math.PI / 3);
      ctx.fillStyle = destroyedNow ? "#6d7377" : colors[ship.faction] || "#fff";
      ctx.strokeStyle = destroyedNow ? "#92979a" : "#ecf7ff";
      ctx.lineWidth = state.pinned === ship.id ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(size * 1.2, 0);
      ctx.lineTo(-size * .75, -size * .68);
      ctx.lineTo(-size * .38, 0);
      ctx.lineTo(-size * .75, size * .68);
      ctx.closePath();
      ctx.fill();
      if (state.pinned === ship.id) ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = motionOpacity;
    drawHullBar(ship, at, overlaySize);
    drawShields(ship, at, overlaySize);
    if (destroyedNow && previous && !previous.destroyed && now < state.flashUntil) drawExplosion(at, overlaySize, now);
    ctx.restore();
    if (motionOpacity > .15) state.hits.push({ id: ship.id, x: at.x, y: at.y, radius: overlaySize + 9 });
  }

  function drawHullBar(ship, at, size) {
    const width = size * 1.8;
    const ratio = Math.max(0, ship.superstructure / Math.max(1, ship.superstructureMax));
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.fillRect(at.x - width / 2, at.y + size + 5, width, 3);
    ctx.fillStyle = ratio > .5 ? "#78d09a" : ratio > .25 ? "#e5bd62" : "#e16b64";
    ctx.fillRect(at.x - width / 2, at.y + size + 5, width * ratio, 3);
  }

  function drawShields(ship, at, size) {
    for (let face = 1; face <= 6; face++) {
      const offset = [5, 0, 1, 2, 3, 4][face - 1];
      const angle = -(ship.facing + offset) * Math.PI / 3;
      const radius = size + 5;
      const x = at.x + Math.cos(angle) * radius;
      const y = at.y + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fillStyle = ship.shieldDown[face] ? "#ef625b" : ship.shieldCap[face] > 0 ? "#8edcf0" : "#43515a";
      ctx.fill();
    }
  }

  function drawExplosion(at, size, now) {
    if (!finiteXY(at) || !Number.isFinite(size)) return;
    const pulse = .5 + .5 * Math.sin(now / 32);
    const radius = size * (1.1 + pulse * 1.6);
    const gradient = safeRadial(at.x, at.y, 0, at.x, at.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, "rgba(255,255,230,.95)");
    gradient.addColorStop(.35, "rgba(255,178,66,.75)");
    gradient.addColorStop(1, "rgba(240,70,30,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill();
  }

  function draw(now = performance.now()) {
    const box = resize();
    ctx.clearRect(0, 0, box.width, box.height);
    if (!state.replay) return;
    const geo = geometry();
    drawGrid(geo);
    state.hits = [];
    const round = currentRound();
    const next = state.replay.rounds[state.index + 1];
    const previous = state.replay.rounds[state.index - 1];
    for (const raw of round.ships) drawShip(interpolateShip(raw, next, state.progress), shipAt(previous, raw.id), geo, now);
    drawShotEffects(geo, now);
  }

  function goTo(index, flash = true) {
    if (!state.replay) return;
    const old = state.index;
    state.index = Math.max(0, Math.min(state.replay.rounds.length - 1, index));
    state.progress = 0;
    if (flash && state.index !== old) state.flashUntil = performance.now() + 480;
    updatePanel();
    draw();
  }

  function setPlaying(value) {
    if (!state.replay) return;
    if (value && state.index >= state.replay.rounds.length - 1) goTo(0, false);
    state.playing = value;
    state.lastTime = performance.now();
    $("#play").textContent = value ? "Ⅱ" : "▶";
  }

  function tick(now) {
    if (state.playing && state.replay) {
      const elapsed = Math.min(100, now - state.lastTime);
      state.progress += elapsed / (1000 / state.speed);
      if (state.progress >= 1) {
        if (state.index < state.replay.rounds.length - 1) goTo(state.index + 1);
        else setPlaying(false);
      }
      draw(now);
    } else if (state.flashUntil > now) draw(now);
    state.lastTime = now;
    requestAnimationFrame(tick);
  }

  $("#file-input").addEventListener("change", (event) => readFile(event.target.files[0]));
  $("#play").addEventListener("click", () => setPlaying(!state.playing));
  $("#step-back").addEventListener("click", () => { setPlaying(false); goTo(state.index - 1); });
  $("#step-forward").addEventListener("click", () => { setPlaying(false); goTo(state.index + 1); });
  $("#scrubber").addEventListener("input", (event) => { setPlaying(false); goTo(Number(event.target.value), false); });
  $("#speed").addEventListener("change", (event) => { state.speed = Number(event.target.value); });
  $("#close-ship").addEventListener("click", () => { state.pinned = null; $("#ship-card").hidden = true; draw(); });
  canvas.addEventListener("click", (event) => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    const hit = [...state.hits].reverse().find((item) => Math.hypot(x - item.x, y - item.y) <= item.radius);
    if (hit) { state.pinned = hit.id; updateShipCard(); draw(); }
  });
  window.addEventListener("resize", draw);

  const drop = $("#load-panel");
  for (const type of ["dragenter", "dragover"]) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add("dragging"); });
  for (const type of ["dragleave", "drop"]) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove("dragging"); });
  drop.addEventListener("drop", (event) => readFile(event.dataTransfer.files[0]));
  document.querySelectorAll("[data-replay]").forEach((button) => button.addEventListener("click", () =>
    loadUrl(button.dataset.replay, "This browser blocks local file loading. Use Choose file and select the bundled replay JSON.")));

  loadSprites();
  loadUrl("./replay.json");
  requestAnimationFrame(tick);
})();
