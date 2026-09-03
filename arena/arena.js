(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#arena-canvas");
  const ctx = canvas.getContext("2d");
  const colors = { EAR: "#54a8ff", VRA: "#edc85e", ZAN: "#ec655d", KRE: "#62c98a" };
  const SPRITE_UNITS_TO_HEX_RADIUS = .105;
  const WARP_FALLBACK_DISTANCE_HEXES = 8;
  const WARP_CUT = .48;
  const MOVEMENT_END = .42;
  const SESSION_REPLAY_KEY = "orion-wars:scenario-replay:v3";

  // --- hex geometry constants -------------------------------------------
  // `geo.scale` is the hex CIRCUMRADIUS in pixels (project() steps neighbours
  // by sqrt(3)*scale across and 1.5*scale down), so the largest circle that
  // fits inside a pointy-top hex has radius sqrt(3)/2 of it.
  const HEX_INRADIUS = Math.sqrt(3) / 2;
  // Ruling 24b: a ship is far smaller than its hex and its footprint must stay
  // inside one. ICON_SPAN is the width of an icon's drawing box in circumradii;
  // ICON_EXTENT is the worst-case half-diagonal of the artwork inside that box,
  // as a fraction of the box, so a rotated icon still clears the hex edge:
  //   ICON_SPAN * ICON_EXTENT = .81 < HEX_INRADIUS = .866.
  const ICON_SPAN = 1.35;
  const ICON_EXTENT = .6;
  // Squadrons have no map position of their own (they fly from the carrier).
  // Ruling 27 ("carriers are standoff ships"): a wing orbiting the hull read
  // as escort duty, so it no longer circles the deck. In hand it shows as a
  // small "wing ready" cluster beside the marker (READY_*); on a strike it
  // flies the run as a streak (CRAFT_SPAN, in drawStrikes). Craft art is
  // 0.30-0.36 of its own box, so the box is drawn larger than a ship's to
  // keep a fighter legible next to a 0.9 carrier. Even so an interceptor's
  // footprint is ~0.5 circumradii: small, as it should be.
  const CRAFT_SPAN = 1.3;
  const READY_SPAN = .85;
  const READY_MAX_GLYPHS = 4;
  const READY_GAP = 1.6;
  const CAMERA_MARGIN_HEXES = 4;
  const CAMERA_MAX_HEX_WIDTH = 60;
  const PAN_THRESHOLD = 5;
  const ARRIVAL_LABEL_PX = 12;
  const ARRIVAL_LABEL_SECONDS = 1.5;

  // --- deterministic asteroid art -----------------------------------------
  // Same algorithm as arena/editor-core.js's hashHex/hexRng/asteroidFieldRocks/
  // largeAsteroidOutline, duplicated here because this file is a plain script
  // (not an ES module) so it keeps working when the viewer is opened straight
  // from disk (see arena/README.md) -- mirror any change on both sides.
  function hashHex(q, r, salt) {
    let h = (Math.trunc(q) * 374761393 + Math.trunc(r) * 668265263 + salt * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 15), 1 | h);
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
    h ^= h >>> 14;
    return (h >>> 0) || 1;
  }
  function hexRng(q, r, salt) {
    let state = hashHex(q, r, salt);
    return function next() {
      state |= 0; state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function asteroidFieldRocks(q, r) {
    const rand = hexRng(q, r, 1);
    const count = 6 + Math.floor(rand() * 4);
    const rocks = [];
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = rand() * .6;
      rocks.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, radius: .09 + rand() * .14, shade: rand() });
    }
    return rocks;
  }
  function largeAsteroidOutline(q, r) {
    const rand = hexRng(q, r, 2);
    const points = 9 + Math.floor(rand() * 4);
    const outline = [];
    for (let i = 0; i < points; i++) outline.push({ angle: (i / points) * Math.PI * 2, radius: .72 + rand() * .28 });
    return outline;
  }
  function nebulaOutline(q, r) {
    const rand = hexRng(q, r, 4);
    const points = 10 + Math.floor(rand() * 5);
    const outline = [];
    for (let i = 0; i < points; i++) outline.push({ angle: (i / points) * Math.PI * 2, radius: .82 + rand() * .16 });
    return outline;
  }

  const sprites = new Map();
  const icons = new Map();
  const state = {
    replay: null, index: 0, playing: false, speed: 1, progress: 0,
    lastTime: 0, pinned: null, hits: [], flashUntil: 0, shotEffects: [],
    warpEvents: new Set(), hasReplayLog: false,
    // "icons" is the default per the visual pivot (design log 24); the sprite
    // sheet stays available behind the toggle.
    render: "icons",
    offsets: new Map(),
    logFilters: { movement: true, fire: true, damage: true, specials: true, raw: false },
    effects: null,
    camera: {
      zoom: 1, x: 0, y: 0, autoFrame: true,
      snap: true, lastTime: 0, moving: false
    },
    // A cumulative tally of which render paths have run. Cheap, and it is what
    // test/arena-smoke.js asserts against.
    rendered: {
      icon: 0, sprite: 0, missing: 0, craft: 0, stacked: 0,
      spinalCharge: 0, spinalHold: 0, spinalVent: 0,
      spinalBolt: 0, spinalHit: 0, spinalMiss: 0,
      strikeRun: 0, strikeImpact: 0, moon: 0, planet: 0, asteroid: 0, asteroids: 0, nebula: 0
    }
  };

  // ------------------------------------------------------------- loading

  function preload(entries, onReady) {
    return Promise.allSettled(entries.map(({ key, src, extra }) => new Promise((resolve) => {
      let image;
      try { image = new Image(); } catch (_) { resolve(); return; }
      if (!image || typeof image.addEventListener !== "function") { resolve(); return; }
      image.decoding = "async";
      image.addEventListener("load", () => { onReady(key, image, extra); draw(); resolve(); }, { once: true });
      image.addEventListener("error", resolve, { once: true });
      image.src = src;
    })));
  }

  async function loadSprites() {
    try {
      const response = await fetch("./sprites/manifest.json", { cache: "no-store" });
      if (!response.ok) return;
      const manifest = await response.json();
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
      await preload(
        Object.entries(manifest)
          .filter(([, entry]) => entry && typeof entry.file === "string" && Number.isFinite(entry.spanUnits) && entry.spanUnits > 0)
          .map(([key, entry]) => ({ key, src: `./sprites/${encodeURIComponent(entry.file)}`, extra: entry.spanUnits })),
        (key, image, spanUnits) => sprites.set(key, { image, spanUnits })
      );
    } catch (_) {
      // The arena remains fully usable with its vector ship markers.
    }
  }

  // assets/icons/manifest.json maps "FACTION/className" (ships AND the two
  // craft types) to {file, size, abbr}. `size` is the icon's footprint as a
  // fraction of its own 100x100 viewBox and the generator has already baked it
  // into the SVG, so every icon is drawn into the same box and the artwork
  // inside it comes out at the right relative size.
  async function loadIcons() {
    try {
      const response = await fetch("../assets/icons/manifest.json", { cache: "no-store" });
      if (!response.ok) return;
      const manifest = await response.json();
      const table = manifest && manifest.icons;
      if (!table || typeof table !== "object") return;
      await preload(
        Object.entries(table)
          .filter(([, entry]) => entry && typeof entry.file === "string")
          .map(([key, entry]) => ({
            key,
            src: `../assets/icons/${encodeURIComponent(entry.file)}`,
            extra: { size: Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 1, abbr: entry.abbr || "" }
          })),
        (key, image, extra) => icons.set(key, { image, size: extra.size, abbr: extra.abbr })
      );
    } catch (_) {
      // Chevron markers cover every hull if the icon set is unavailable.
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
      state.effects = buildLogEffects(data);
      state.hasReplayLog = data.log.length > 0;
      resetAutoFrameCamera();
      updateCameraButtons();
      $("#load-panel").hidden = true;
      $("#scrubber").max = String(data.rounds.length - 1);
      $("#play").textContent = "▶";
      $("#ship-card").hidden = true;
      const back = $("#back-to-editor");
      if (back) back.hidden = !data.meta.scenario;
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
  function roundKey(entry) { return `${entry?.turn}:${entry?.round}`; }
  function roundLogLines(replay, round) {
    const key = roundKey(round);
    return replay.log.filter((entry) => roundKey(entry) === key);
  }

  const FACING_NAMES = ["E", "NE", "NW", "W", "SW", "SE"];
  const fmtPos = (pos) => `(${pos.q},${pos.r})`;
  const facingName = (facing) => FACING_NAMES[((Math.round(facing) % 6) + 6) % 6];
  const shotSuffix = (event) => {
    const range = Number.isFinite(event.range) ? `, range ${event.range}` : "";
    return event.hit
      ? `${range}: HIT${Number.isFinite(event.damage) ? ` for ${event.damage}` : ""}`
      : `${range}: miss`;
  };

  function pairedMissileLaunches(replay) {
    const queues = new Map();
    const pairs = new Map();
    for (const event of replay.shots ?? []) {
      const exact = `${event.weapon}|${event.shooterId ?? ""}|${event.targetId}`;
      if (event.kind === "launch") {
        const queue = queues.get(exact) ?? [];
        queue.push(event);
        queues.set(exact, queue);
      } else if (event.kind === "missile") {
        let launch = queues.get(exact)?.shift();
        if (!launch) {
          for (const [key, queue] of queues) {
            if (key.startsWith(`${event.weapon}|`) && key.endsWith(`|${event.targetId}`) && queue.length) {
              launch = queue.shift();
              break;
            }
          }
        }
        if (launch) pairs.set(event, launch);
      }
    }
    return pairs;
  }

  function buildNarrative(replay, roundIndex) {
    const round = replay.rounds?.[roundIndex];
    if (!round) return [];
    const previous = replay.rounds[roundIndex - 1];
    const raw = roundLogLines(replay, round);
    const events = (replay.shots ?? []).filter((event) => roundKey(event) === roundKey(round));
    const out = [];
    const add = (category, text) => out.push({ category, text });

    if (previous) {
      const warpIds = new Set(raw.map((entry) => /^(\S+) warps in behind\b/.exec(entry.message)?.[1]).filter(Boolean));
      for (const ship of round.ships) {
        const before = shipAt(previous, ship.id);
        if (!before || (before.destroyed && ship.destroyed)) continue;
        const verb = warpIds.has(ship.id) ? "warps" :
          (before.pos.q === ship.pos.q && before.pos.r === ship.pos.r ? "holds" : "moves");
        if (verb === "holds") add("movement", `${ship.id} holds ${fmtPos(ship.pos)}, facing ${facingName(ship.facing)}`);
        else add("movement", `${ship.id} ${verb} ${fmtPos(before.pos)} \u2192 ${fmtPos(ship.pos)}, facing ${facingName(ship.facing)}`);
      }
    }

    for (const event of events.filter((entry) => entry.kind === "beam" || entry.kind === "spinal")) {
      add("fire", `${event.shooterId} fires ${event.weapon} at ${event.targetId}${shotSuffix(event)}`);
    }
    for (const event of events.filter((entry) => entry.kind === "launch")) {
      const range = Number.isFinite(event.range) ? `, range ${event.range}` : "";
      const warhead = Number.isFinite(event.damage) ? ` (warhead ${event.damage})` : "";
      add("fire", `${event.shooterId ?? "Unknown ship"} launches ${event.weapon} at ${event.targetId}${range}${warhead}`);
    }
    const missilePairs = pairedMissileLaunches(replay);
    for (const event of events.filter((entry) => entry.kind === "missile")) {
      const launch = missilePairs.get(event);
      const shooter = event.shooterId ?? launch?.shooterId ?? "unknown ship";
      if (event.outcome === "hit") add("damage", `${event.weapon} from ${shooter} hits ${event.targetId} for ${event.damage ?? 0}`);
      else if (event.outcome === "dead-target") add("damage", `${event.weapon} from ${shooter} finds ${event.targetId} already destroyed`);
      else add("damage", `${event.weapon} from ${shooter} targeting ${event.targetId} is ${event.outcome ?? "lost"}`);
    }
    for (const event of events.filter((entry) => entry.kind === "strike")) {
      const result = event.hits > 0 ? `${event.hits} hit for ${event.damage}` : "miss";
      add("fire", `${event.squadronId ?? `${event.shooterId} ${event.craft}`} strikes ${event.targetId}: ${result}`);
    }

    const consumed = (message) => / warps in behind\b/.test(message) || / FIRES photonic-cannon\b/.test(message) || /: \d+ \w+\(s\) press home on /.test(message);
    const remaining = raw.map((entry) => entry.message).filter((message) => !consumed(message));
    for (const message of remaining.filter((message) => !/ destroyed$| detonates\b/.test(message))) add("specials", message);
    for (const message of remaining.filter((message) => / destroyed$| detonates\b/.test(message))) add("damage", message);
    return out;
  }

  function buildShotEffects(replay) {
    if (!Array.isArray(replay.shots)) return [];
    const effects = [];
    const launches = new Map();
    for (const event of replay.shots) {
      const eventKey = roundKey(event);
      const roundIndex = replay.rounds.findIndex((entry) => roundKey(entry) === eventKey);
      if (roundIndex < 0) continue;
      if (event.kind === "beam") {
        effects.push({ kind: "beam", roundIndex, event });
      } else if (event.kind === "launch") {
        const key = `${event.weapon}|${event.shooterId ?? ""}|${event.targetId}`;
        const queue = launches.get(key) || [];
        const effect = { kind: "missile", launchIndex: roundIndex, arrivalIndex: replay.rounds.length, launch: event, arrival: null };
        queue.push(effect);
        launches.set(key, queue);
        effects.push(effect);
      } else if (event.kind === "missile") {
        const key = `${event.weapon}|${event.shooterId ?? ""}|${event.targetId}`;
        let effect = launches.get(key)?.shift();
        if (!effect) {
          for (const [candidate, queue] of launches) {
            if (candidate.startsWith(`${event.weapon}|`) && candidate.endsWith(`|${event.targetId}`) && queue.length) {
              effect = queue.shift();
              break;
            }
          }
        }
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

  // ------------------------------------------- the two new mechanics
  //
  // The photonic cannon and the carrier air group are both fully narrated by
  // the resolver's log, and the log lines are the only source the viewer needs:
  // the recorder tags every line with its turn and round, so replaying the
  // lines in order rebuilds the state of the capacitor bank and of the wing at
  // every frame. Exact strings are in src/tactical/resolver.js (chargeSpinal,
  // fireSpinal, cycleDeck, runRaid, scuttleSquadrons) and must not drift.

  const SPINAL_COLD = /^(\S+) (\S+) capacitors cold\b/;
  const SPINAL_CHARGING = /^(\S+) (\S+) charging (\d+)\/(\d+)$/;
  const SPINAL_CHARGED = /^(\S+) (\S+) CHARGED - (\d+) units/;
  const SPINAL_HOLD = /^(\S+) (\S+) holding at full charge\b/;
  const SPINAL_FIRE = /^(\S+) FIRES (\S+) at (\S+) across (\d+) hexes - (HIT|miss)$/;
  const SPINAL_DISCHARGE = /^(\S+) (\S+) discharged - dark for (\d+) turn/;
  const SPINAL_VENT = /^(\S+) (\S+) venting, dark for (\d+) more turn/;
  const SPINAL_COOL = /^(\S+) (\S+) cool - capacitors reconnected/;
  const SPINAL_WRECKED = /^(\S+) spinal mount wrecked\b/;

  const DECK_LAUNCH = /^(\S+) launches (\d+) squadron\(s\), deck strength (\d+)$/;
  const DECK_RECOVER = /^(\S+) recovers (\d+) squadron\(s\)$/;
  const DECK_SCUTTLE = /^(\S+) goes down with (\d+) craft still aboard or in the air$/;
  const SQ_STRIKE = /^(\S+): (\d+) ([a-z]+)\(s\) press home on (\S+), (\d+) hit for (\d+)$/;
  const SQ_RUN_LOSS = /^(\S+) loses (\d+) craft on the run in \(/;
  const SQ_ESCORT_LOSS = /^(\S+) loses (\d+) to escorting fire$/;
  const SQ_WIPED = /^(\S+) is wiped out$/;
  const SQUADRON_ID = /\b([A-Za-z0-9_.-]+)\/([a-z]+)-(\d+)\b/g;

  const craftTypeOf = (squadronId) => {
    const match = /\/([a-z]+)-\d+$/.exec(squadronId);
    return match ? match[1] : "interceptor";
  };
  const carrierOf = (squadronId) => squadronId.slice(0, squadronId.lastIndexOf("/"));

  // Distribute a known deck strength over a carrier's squadrons as evenly as
  // whole craft allow. Only used before any squadron has reported its own
  // strength; from the first strike line onwards the log is exact.
  function spreadDeck(total, count) {
    const base = Math.floor(total / count);
    const extra = total - base * count;
    return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function buildLogEffects(replay) {
    const total = replay.rounds.length;
    const empty = {
      spinal: Array.from({ length: total }, () => []),
      wing: Array.from({ length: total }, () => []),
      fires: Array.from({ length: total }, () => []),
      strikes: Array.from({ length: total }, () => [])
    };
    if (!Array.isArray(replay.log) || !replay.log.length) return empty;

    const indexOf = new Map();
    replay.rounds.forEach((round, index) => {
      const key = roundKey(round);
      if (!indexOf.has(key)) indexOf.set(key, index);
    });
    const lines = [];
    for (const entry of replay.log) {
      if (typeof entry.message !== "string") continue;
      const index = indexOf.get(roundKey(entry));
      if (index === undefined) continue;
      lines.push({ index, message: entry.message });
    }
    if (!lines.length) return empty;

    // Pass one: learn each carrier's squadron roster. A squadron that never
    // fires and is never hit is never named, so pad the roster out to the
    // largest number of squadrons the deck is ever logged as launching.
    const rosters = new Map();
    const roster = (id) => {
      if (!rosters.has(id)) rosters.set(id, { ids: [], launched: 0 });
      return rosters.get(id);
    };
    for (const { message } of lines) {
      SQUADRON_ID.lastIndex = 0;
      let found;
      while ((found = SQUADRON_ID.exec(message))) {
        const entry = roster(found[1]);
        const id = `${found[1]}/${found[2]}-${found[3]}`;
        if (!entry.ids.includes(id)) entry.ids.push(id);
      }
      const launch = DECK_LAUNCH.exec(message);
      if (launch) roster(launch[1]).launched = Math.max(roster(launch[1]).launched, Number(launch[2]));
    }
    for (const entry of rosters.values()) {
      entry.ids.sort();
      for (let n = 1; entry.ids.length < entry.launched; n++) {
        const id = `${carrierOf(entry.ids[0] || "?/interceptor-1")}/interceptor-${n}`;
        if (!entry.ids.includes(id)) entry.ids.push(id);
      }
    }

    // Pass two: replay the lines in order, snapshotting after each round.
    const banks = new Map();      // shipId -> capacitor state
    const wings = new Map();      // carrierId -> Map(squadronId -> strength)
    const airborne = new Set();
    const out = {
      spinal: [], wing: [],
      fires: Array.from({ length: total }, () => []),
      strikes: Array.from({ length: total }, () => [])
    };
    const bank = (id) => {
      if (!banks.has(id)) banks.set(id, { id, phase: "cold", charge: 0, required: 0, hold: 0, weapon: "photonic-cannon" });
      return banks.get(id);
    };
    const wingOf = (id) => {
      if (!wings.has(id)) wings.set(id, new Map());
      return wings.get(id);
    };
    const adjust = (squadronId, delta) => {
      const map = wingOf(carrierOf(squadronId));
      map.set(squadronId, Math.max(0, (map.get(squadronId) ?? 0) + delta));
    };

    let cursor = 0;
    for (let index = 0; index < total; index++) {
      while (cursor < lines.length && lines[cursor].index === index) {
        applyLine(lines[cursor].message, index);
        cursor++;
      }
      out.spinal.push([...banks.values()].map((entry) => ({
        id: entry.id, phase: entry.phase, weapon: entry.weapon, hold: entry.hold,
        ratio: entry.required > 0 ? Math.max(0, Math.min(1, entry.charge / entry.required)) : (entry.phase === "ready" ? 1 : 0)
      })));
      out.wing.push([...wings.entries()]
        .filter(([carrierId]) => airborne.has(carrierId))
        .map(([carrierId, squadrons]) => ({
          carrierId,
          squadrons: [...squadrons.entries()]
            .filter(([, strength]) => strength > 0)
            .map(([id, strength]) => ({ id, type: craftTypeOf(id), strength }))
        }))
        .filter((entry) => entry.squadrons.length));
    }
    return out;

    function applyLine(message, index) {
      let m;
      if ((m = SPINAL_CHARGING.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "charging";
        entry.charge = Number(m[3]); entry.required = Number(m[4]); entry.hold = 0;
      } else if ((m = SPINAL_CHARGED.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "ready"; entry.hold = 0;
        entry.charge = Number(m[3]);
        entry.required = Math.max(entry.required, entry.charge);
      } else if ((m = SPINAL_HOLD.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "ready"; entry.hold++;
        entry.charge = Math.max(entry.charge, entry.required);
      } else if ((m = SPINAL_COLD.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "cold"; entry.charge = 0; entry.hold = 0;
      } else if ((m = SPINAL_FIRE.exec(message))) {
        out.fires[index].push({
          shooterId: m[1], weapon: m[2], targetId: m[3],
          range: Number(m[4]), hit: m[5] === "HIT"
        });
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "venting"; entry.charge = 0; entry.hold = 0;
      } else if ((m = SPINAL_DISCHARGE.exec(message)) || (m = SPINAL_VENT.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "venting"; entry.charge = 0; entry.hold = 0;
      } else if ((m = SPINAL_COOL.exec(message))) {
        const entry = bank(m[1]);
        entry.weapon = m[2]; entry.phase = "charging"; entry.charge = 0; entry.hold = 0;
      } else if ((m = SPINAL_WRECKED.exec(message))) {
        const entry = bank(m[1]);
        entry.phase = "wrecked"; entry.charge = 0; entry.hold = 0;
      } else if ((m = DECK_LAUNCH.exec(message))) {
        const carrierId = m[1];
        const deck = Number(m[3]);
        const map = wingOf(carrierId);
        const ids = rosters.get(carrierId)?.ids?.length ? rosters.get(carrierId).ids : [`${carrierId}/interceptor-1`];
        const known = ids.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
        if (!known) spreadDeck(deck, ids.length).forEach((strength, i) => map.set(ids[i], strength));
        airborne.add(carrierId);
      } else if ((m = DECK_RECOVER.exec(message))) {
        airborne.delete(m[1]);
      } else if ((m = DECK_SCUTTLE.exec(message))) {
        airborne.delete(m[1]);
        wingOf(m[1]).clear();
      } else if ((m = SQ_STRIKE.exec(message))) {
        const squadronId = m[1];
        const strength = Number(m[2]);
        wingOf(carrierOf(squadronId)).set(squadronId, strength);
        airborne.add(carrierOf(squadronId));
        out.strikes[index].push({
          squadronId, carrierId: carrierOf(squadronId), type: m[3], targetId: m[4],
          strength, hits: Number(m[5]), damage: Number(m[6])
        });
      } else if ((m = SQ_RUN_LOSS.exec(message)) || (m = SQ_ESCORT_LOSS.exec(message))) {
        adjust(m[1], -Number(m[2]));
      } else if ((m = SQ_WIPED.exec(message))) {
        wingOf(carrierOf(m[1])).set(m[1], 0);
      }
    }
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

    const rawLines = roundLogLines(replay, round);
    const lines = state.logFilters.raw
      ? rawLines.map((entry) => ({ category: "raw", text: entry.message }))
      : buildNarrative(replay, state.index).filter((entry) => state.logFilters[entry.category]);
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
        item.className = `log-${entry.category}`;
        item.textContent = entry.text;
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
    const bank = state.effects?.spinal[state.index]?.find((entry) => entry.id === ship.id);
    const wing = state.effects?.wing[state.index]?.find((entry) => entry.carrierId === ship.id);
    const extras =
      (bank ? `<div>Capacitors<strong>${escapeHtml(spinalLabel(bank))}</strong></div>` : "") +
      (wing ? `<div>Air group<strong>${wing.squadrons.reduce((sum, sq) => sum + sq.strength, 0)} aloft</strong></div>` : "");
    $("#ship-details").innerHTML =
      `<div class="detail-grid">` +
      `<div>Class<strong>${escapeHtml(ship.className)}</strong></div>` +
      `<div>Status<strong>${ship.destroyed ? "Destroyed" : ship.cloaked ? "Cloaked" : "Operational"}</strong></div>` +
      `<div>Power<strong>${ship.power}</strong></div>` +
      `<div>Magazine<strong>${ship.magazine}</strong></div>` +
      `<div>Hull<strong>${ship.superstructure} / ${ship.superstructureMax}</strong></div>` +
      `<div>Mounts<strong>${active} / ${ship.mounts.length} online</strong></div>` +
      extras + `</div>` +
      `<div class="shield-list">Shield faces<div>${shields}</div></div>`;
  }

  function spinalLabel(bank) {
    if (bank.phase === "charging") return `charging ${Math.round(bank.ratio * 100)}%`;
    if (bank.phase === "ready") return bank.hold ? `held (turn ${bank.hold})` : "charged";
    if (bank.phase === "venting") return "venting";
    if (bank.phase === "wrecked") return "mount wrecked";
    return "cold";
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

  // ------------------------------------------------------ map geometry
  //
  // The engagement area is a landscape RECTANGLE of hexes (design log 24a/24c),
  // fleets entering from the short ends, as on the FASA paper mapsheet. A hex
  // is in bounds when |q + r/2| <= W/2 and |r| <= H/2 in pointy-top axial.
  // Replays recorded before the rectangle carry only `mapRadiusHexes`, and for
  // those the old hexagonal field is still drawn.

  function mapShape() {
    const tuning = state.replay?.meta?.tuning ?? {};
    const map = tuning.map;
    if (map && map.shape === "rect" && map.widthHexes > 0 && map.heightHexes > 0) {
      return { shape: "rect", width: map.widthHexes, height: map.heightHexes };
    }
    const radius = (map && map.shape === "hex" && map.radiusHexes) || tuning.mapRadiusHexes || 22;
    return { shape: "hex", radius };
  }

  function inBounds(q, r, shape) {
    if (shape.shape === "rect") {
      return Math.abs(q + r / 2) <= shape.width / 2 + 1e-9 && Math.abs(r) <= shape.height / 2 + 1e-9;
    }
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= shape.radius;
  }

  function geometry() {
    const box = canvas.getBoundingClientRect();
    const shape = mapShape();
    // Field extent in circumradii, including one hex of margin all round.
    const spanX = shape.shape === "rect"
      ? Math.sqrt(3) * (shape.width + 1.4)
      : Math.sqrt(3) * (shape.radius * 2 + 2);
    const spanY = shape.shape === "rect"
      ? 1.5 * shape.height + 2.6
      : 3 * (shape.radius + 1);
    // FIT TO WIDTH: the landscape map is meant to fill the viewport across, and
    // the sidebar is a fixed column so every extra pixel of window width goes
    // to the map. The height term only stops a short canvas from clipping.
    const scale = Math.max(1, Math.min(box.width / spanX, box.height / spanY));
    return { cx: box.width / 2, cy: box.height / 2, scale, shape, box };
  }

  function cameraLimits(geo = geometry()) {
    const fittedHexWidth = Math.sqrt(3) * geo.scale;
    return { min: 1, max: Math.max(1, CAMERA_MAX_HEX_WIDTH / fittedHexWidth) };
  }

  function clampCameraZoom(zoom, geo = geometry()) {
    const limits = cameraLimits(geo);
    if (!Number.isFinite(zoom)) return limits.min;
    return Math.max(limits.min, Math.min(limits.max, zoom));
  }

  function livingShipBounds(ships, geo = geometry()) {
    const living = ships.filter((ship) => !ship.destroyed && ship.pos);
    if (!living.length) return null;
    const points = living.map((ship) => project(ship.pos, geo));
    const margin = CAMERA_MARGIN_HEXES * geo.scale;
    return {
      minX: Math.min(...points.map((p) => p.x)) - margin,
      maxX: Math.max(...points.map((p) => p.x)) + margin,
      minY: Math.min(...points.map((p) => p.y)) - margin,
      maxY: Math.max(...points.map((p) => p.y)) + margin
    };
  }

  function cameraForBounds(bounds, geo = geometry()) {
    if (!bounds) return { zoom: 1, x: 0, y: 0 };
    const width = Math.max(geo.scale * 2, bounds.maxX - bounds.minX);
    const height = Math.max(geo.scale * 2, bounds.maxY - bounds.minY);
    const zoom = clampCameraZoom(Math.min(geo.box.width / width, geo.box.height / height), geo);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const target = {
      zoom,
      x: geo.box.width / 2 - centerX * zoom,
      y: geo.box.height / 2 - centerY * zoom
    };
    return Object.values(target).every(Number.isFinite) ? target : { zoom: 1, x: 0, y: 0 };
  }

  function autoFrameCamera(ships, geo, now) {
    if (!state.camera.autoFrame) return false;
    const target = cameraForBounds(livingShipBounds(ships, geo), geo);
    if (![state.camera.zoom, state.camera.x, state.camera.y].every(Number.isFinite)) {
      Object.assign(state.camera, target, { snap: false, lastTime: Number.isFinite(now) ? now : 0 });
      return false;
    }
    const frameTime = Number.isFinite(now) ? now : performance.now();
    const elapsed = Number.isFinite(state.camera.lastTime) && state.camera.lastTime > 0
      ? Math.max(0, Math.min(100, frameTime - state.camera.lastTime)) : 16;
    const ease = state.camera.snap ? 1 : 1 - Math.exp(-elapsed / 180);
    state.camera.zoom += (target.zoom - state.camera.zoom) * ease;
    state.camera.x += (target.x - state.camera.x) * ease;
    state.camera.y += (target.y - state.camera.y) * ease;
    state.camera.snap = false;
    state.camera.lastTime = frameTime;
    return Math.abs(target.zoom - state.camera.zoom) > .001 ||
      Math.abs(target.x - state.camera.x) > .1 || Math.abs(target.y - state.camera.y) > .1;
  }

  function resetAutoFrameCamera() {
    Object.assign(state.camera, {
      zoom: 1, x: 0, y: 0, autoFrame: true,
      snap: true, lastTime: 0, moving: false
    });
  }

  function setAutoFrame(enabled, snap = false) {
    state.camera.autoFrame = Boolean(enabled);
    state.camera.snap = Boolean(enabled && snap);
    state.camera.lastTime = 0;
    state.camera.moving = false;
    updateCameraButtons();
    draw();
  }

  function fitMap() {
    state.camera.autoFrame = false;
    state.camera.zoom = 1;
    state.camera.x = 0;
    state.camera.y = 0;
    state.camera.snap = false;
    state.camera.moving = false;
    updateCameraButtons();
    draw();
  }

  function updateCameraButtons() {
    const button = $("#frame-fleets");
    if (!button) return;
    button.classList[state.camera.autoFrame ? "add" : "remove"]("active");
    button.setAttribute?.("aria-pressed", state.camera.autoFrame ? "true" : "false");
  }

  function screenToWorld(x, y) {
    return { x: (x - state.camera.x) / state.camera.zoom, y: (y - state.camera.y) / state.camera.zoom };
  }

  function visibleWorldBounds(geo) {
    const a = screenToWorld(0, 0);
    const b = screenToWorld(geo.box.width, geo.box.height);
    return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y) };
  }

  function safeRadial(x0, y0, r0, x1, y1, r1) {
    for (const v of [x0, y0, r0, x1, y1, r1]) if (!Number.isFinite(v)) return null;
    return ctx.createRadialGradient(x0, y0, Math.max(0, r0), x1, y1, Math.max(0.01, r1));
  }

  function finiteXY(...pts) {
    for (const p of pts) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    return true;
  }

  // Effects are drawn inside the world-space camera transform. Convert a
  // fraction of the displayed hex radius back to world units, retaining a
  // small screen-pixel floor so fine fire is still visible at fit-map zoom.
  function effectScreenSize(geo, hexFraction, minPixels = 1) {
    const zoom = Math.max(.001, state.camera.zoom || 1);
    return Math.max(minPixels, geo.scale * zoom * hexFraction);
  }

  function effectWorldSize(geo, hexFraction, minPixels = 1) {
    return effectScreenSize(geo, hexFraction, minPixels) / Math.max(.001, state.camera.zoom || 1);
  }

  function screenWorldSize(pixels) {
    return pixels / Math.max(.001, state.camera.zoom || 1);
  }

  function project(pos, geo) {
    const x = Math.sqrt(3) * (pos.q + pos.r / 2);
    const y = -1.5 * pos.r;
    return { x: geo.cx + x * geo.scale, y: geo.cy - y * geo.scale };
  }

  // Nearest whole hex to a fractional axial position (cube rounding).
  function hexRound(q, r) {
    const x = q, z = r, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { q: rx, r: rz };
  }

  // Ruling 24b: ships MAY share a hex. When they do, each is drawn on a small
  // ring inside the hex and shrunk, so the whole stack still clears the edge:
  // ring + ICON_SPAN * ICON_EXTENT * shrink <= HEX_INRADIUS. Returned in
  // circumradii; multiply by geo.scale for pixels.
  function stackLayout(count) {
    if (count <= 1) return [{ dx: 0, dy: 0, shrink: 1 }];
    const shrink = Math.max(.4, 1 / (1 + .55 * (count - 1)));
    const ring = Math.max(0, HEX_INRADIUS - ICON_SPAN * ICON_EXTENT * shrink);
    return Array.from({ length: count }, (_, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
      return { dx: Math.cos(angle) * ring, dy: Math.sin(angle) * ring, shrink };
    });
  }

  // Where a ship is actually drawn: its hex centre plus its place in the stack.
  function pointFor(ship, geo) {
    const at = project(ship.pos, geo);
    const offset = state.offsets.get(ship.id);
    return offset ? { x: at.x + offset.dx * geo.scale, y: at.y + offset.dy * geo.scale } : at;
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

  // Exact displayed centre in a recorded snapshot, including the deterministic
  // nudge used when several ships share a hex.
  function snapshotPoint(ship, round, geo) {
    const at = project(ship.pos, geo);
    const hex = hexRound(ship.pos.q, ship.pos.r);
    const members = round.ships.filter((candidate) => {
      if (candidate.destroyed) return false;
      const candidateHex = hexRound(candidate.pos.q, candidate.pos.r);
      return candidateHex.q === hex.q && candidateHex.r === hex.r;
    }).map((candidate) => candidate.id).sort();
    if (members.length < 2) return at;
    const index = members.indexOf(ship.id);
    const offset = stackLayout(members.length)[index];
    return offset ? { x: at.x + offset.dx * geo.scale, y: at.y + offset.dy * geo.scale } : at;
  }

  function effectEndpoints(effect, geo) {
    if (effect.kind === "beam") {
      const round = state.replay.rounds[effect.roundIndex];
      const shooter = shipAt(round, effect.event.shooterId);
      const target = shipAt(round, effect.event.targetId);
      return shooter && target ? { start: snapshotPoint(shooter, round, geo), end: snapshotPoint(target, round, geo), shooter, target } : null;
    }
    const launchRound = state.replay.rounds[effect.launchIndex];
    const arrivalRound = state.replay.rounds[Math.min(effect.arrivalIndex, state.replay.rounds.length - 1)];
    const shooter = shipAt(launchRound, effect.launch.shooterId) || lastShipAt(effect.launch.shooterId, effect.launchIndex);
    const target = shipAt(arrivalRound, effect.launch.targetId) || lastShipAt(effect.launch.targetId, effect.arrivalIndex);
    return shooter && target ? { start: snapshotPoint(shooter, launchRound, geo), end: snapshotPoint(target, arrivalRound, geo), shooter, target } : null;
  }

  function drawBeam(effect, geo) {
    if (state.progress < MOVEMENT_END) return;
    const phase = effectProgress();
    if (phase > .38) return;
    const shot = effect.event;
    const endpoints = effectEndpoints(effect, geo);
    if (!endpoints) return;
    const { start, shooter, target } = endpoints;
    const end = endpoints.end;
    const laser = shot.weapon === "laser-cannon";
    const heavy = shot.weapon === "heavy-blaster";
    const alpha = Math.max(0, 1 - phase / .38);
    const head = end;
    const tail = start;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.strokeStyle = laser ? "#bfeaff" : heavy ? "#ff512f" : "#ff7848";
    ctx.shadowColor = laser ? "#5bbdff" : "#ff3b20";
    ctx.shadowBlur = effectScreenSize(geo, laser ? .14 : heavy ? .28 : .22, laser ? 2 : 3);
    ctx.lineWidth = effectWorldSize(geo, laser ? .06 : heavy ? .16 : .12, laser ? 1 : 1.5);
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
    if (laser) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = effectWorldSize(geo, .025, .65);
      ctx.stroke();
    }
    ctx.restore();
    if (shot.hit && phase < .3) drawShieldFlash(target, shooter.pos, geo, phase / .3);
  }

  function drawMissile(effect, geo, now) {
    const phase = effectProgress();
    const arrivalIndex = Math.min(effect.arrivalIndex, state.replay.rounds.length - 1);
    const labelElapsed = state.index + state.progress - arrivalIndex - MOVEMENT_END;
    const label = effect.arrival?.outcome === "hit" ? `HIT ${effect.arrival.damage ?? 0}`
      : effect.arrival?.outcome === "evaded" ? "evaded"
        : effect.arrival?.outcome === "dead-target" ? "dead target" : effect.arrival?.outcome;
    if (label && labelElapsed >= 0 && labelElapsed < ARRIVAL_LABEL_SECONDS) {
      const liveTarget = shipAt(currentRound(), effect.launch.targetId) || lastShipAt(effect.launch.targetId, state.index);
      if (liveTarget) drawArrivalLabel(pointFor(liveTarget, geo), label, labelElapsed, geo, liveTarget);
    }
    if (state.index === effect.launchIndex && state.progress < MOVEMENT_END) return;
    const resolving = state.progress >= MOVEMENT_END;
    const absolute = state.index === arrivalIndex && !resolving ? state.index - .08 : state.index + phase;
    if (absolute < effect.launchIndex || state.index > arrivalIndex) return;
    const endpoints = effectEndpoints(effect, geo);
    if (!endpoints) return;
    const { start, end, shooter, target } = endpoints;
    drawMissileGuide(start, end, effect, geo);
    const span = Math.max(1, effect.arrivalIndex - effect.launchIndex);
    const rawTravel = Math.max(0, Math.min(1, (absolute - effect.launchIndex) / span));
    const outcome = effect.arrival?.outcome;
    const plasma = effect.launch.weapon === "plasma-torpedo";
    const travel = plasma ? Math.pow(rawTravel, 1.18) : rawTravel;
    const bend = 0;
    const cappedTravel = outcome === "intercepted" ? Math.min(travel, .62) : travel;
    const at = curvePoint(start, end, cappedTravel, bend);
    if (outcome === "evaded") {
      const dx = end.x - start.x, dy = end.y - start.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const wide = geo.scale * 3.2 * Math.max(0, (rawTravel - .45) / .55);
      at.x -= dy / length * wide;
      at.y += dx / length * wide;
    }
    if (outcome === "intercepted" && state.index === arrivalIndex && resolving) {
      if (phase < .34) drawMissilePop(at, plasma, phase / .34, geo);
      return;
    }
    const fade = outcome === "dead-target" && travel > .78 ? Math.max(0, (1 - travel) / .22) : 1;
    if (fade <= 0) return;
    if (plasma) drawPlasma(at, start, end, cappedTravel, bend, fade, now, geo);
    else drawNeutronic(at, fade, now, geo);
    if (effect.arrival && state.index === arrivalIndex && resolving) {
      if (outcome === "hit" && phase < .32) drawShieldFlash(target, shooter.pos, geo, phase / .32);
      else if (outcome === "evaded" && phase < .32) drawEvadeStreak(at, start, end, phase, geo);
    }
  }

  function drawMissileGuide(start, end, effect, geo) {
    ctx.save();
    ctx.globalAlpha = .48;
    ctx.strokeStyle = effect.launch.weapon === "plasma-torpedo" ? "#56ffd0" : "#ffd36a";
    ctx.lineWidth = screenWorldSize(1);
    ctx.setLineDash?.([screenWorldSize(5), screenWorldSize(4)]);
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.setLineDash?.([]);
    const radius = effectWorldSize(geo, .6, 5);
    ctx.globalAlpha = .8;
    ctx.lineWidth = screenWorldSize(1);
    ctx.beginPath(); ctx.arc(end.x, end.y, radius, 0, Math.PI * 2);
    ctx.moveTo(end.x - radius * 1.45, end.y); ctx.lineTo(end.x - radius * .65, end.y);
    ctx.moveTo(end.x + radius * .65, end.y); ctx.lineTo(end.x + radius * 1.45, end.y);
    ctx.moveTo(end.x, end.y - radius * 1.45); ctx.lineTo(end.x, end.y - radius * .65);
    ctx.moveTo(end.x, end.y + radius * .65); ctx.lineTo(end.x, end.y + radius * 1.45);
    ctx.stroke(); ctx.restore();
  }

  function drawArrivalLabel(at, text, elapsed, geo, target) {
    if (!ctx.fillText) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - elapsed / ARRIVAL_LABEL_SECONDS);
    ctx.fillStyle = text.startsWith("HIT") ? "#fff0c2" : "#b8c8d2";
    ctx.font = `600 ${screenWorldSize(ARRIVAL_LABEL_PX)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const iconTop = target ? markerSize(target, geo) : geo.scale * .5;
    ctx.fillText(text, at.x, at.y - iconTop - screenWorldSize(6));
    ctx.restore();
  }

  function drawNeutronic(at, alpha, now, geo) {
    if (!finiteXY(at) || !Number.isFinite(alpha)) return;
    const pulse = 1 + Math.sin(now / 85) * .16;
    const radius = effectWorldSize(geo, .18, 2.5) * pulse;
    const gradient = safeRadial(at.x, at.y, 0, at.x, at.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(255,255,238,${alpha})`);
    gradient.addColorStop(.25, `rgba(255,206,91,${alpha * .95})`);
    gradient.addColorStop(1, "rgba(255,119,25,0)");
    ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = "#ffac32"; ctx.shadowBlur = effectScreenSize(geo, .18, 2.5);
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawPlasma(at, start, end, travel, bend, alpha, now, geo) {
    if (!finiteXY(at, start, end)) return;
    const trailRadius = effectWorldSize(geo, .055, 1);
    const wobble = Math.sin(now / 67 + travel * 9) * effectWorldSize(geo, .025, .5);
    for (let i = 4; i >= 1; i--) {
      const trailTravel = Math.max(0, travel - i * .035);
      const p = curvePoint(start, end, trailTravel, bend);
      ctx.fillStyle = `rgba(35,220,166,${alpha * (5 - i) * .07})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, trailRadius * (1 + i * .32), 0, Math.PI * 2); ctx.fill();
    }
    const radius = effectWorldSize(geo, .24, 3) + wobble;
    const gradient = safeRadial(at.x - 2, at.y - 2, 1, at.x, at.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(225,255,217,${alpha})`);
    gradient.addColorStop(.3, `rgba(46,235,174,${alpha * .92})`);
    gradient.addColorStop(.72, `rgba(12,137,124,${alpha * .65})`);
    gradient.addColorStop(1, "rgba(0,82,77,0)");
    ctx.save(); ctx.fillStyle = gradient; ctx.shadowColor = "#24e0b0"; ctx.shadowBlur = effectScreenSize(geo, .24, 3);
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }

  function drawMissilePop(at, plasma, phase, geo) {
    const radius = effectWorldSize(geo, .1 + phase * .42, 2);
    ctx.save(); ctx.globalAlpha = 1 - phase; ctx.strokeStyle = plasma ? "#56ffd0" : "#ffd36a";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = effectScreenSize(geo, .2, 2); ctx.lineWidth = effectWorldSize(geo, .055, 1);
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }

  function drawEvadeStreak(at, start, end, phase, geo) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - phase / .32); ctx.strokeStyle = "rgba(152,255,229,.75)";
    ctx.lineWidth = effectWorldSize(geo, .05, 1); ctx.beginPath(); ctx.moveTo(at.x, at.y);
    const streak = effectWorldSize(geo, .7, 8);
    ctx.lineTo(at.x + dx / length * streak, at.y + dy / length * streak); ctx.stroke(); ctx.restore();
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
    const at = pointFor(target, geo);
    const size = markerSize(target, geo);
    const face = shieldFace(target, attackerPos);
    const offset = [5, 0, 1, 2, 3, 4][face - 1];
    const angle = -(target.facing + offset) * Math.PI / 3;
    const gap = size + effectWorldSize(geo, .45, 4);
    const center = { x: at.x + Math.cos(angle) * gap, y: at.y + Math.sin(angle) * gap };
    const radius = effectWorldSize(geo, .5, 4) + phase * effectWorldSize(geo, .9, 6);
    const gradient = safeRadial(center.x, center.y, 0, center.x, center.y, radius);
    if (!gradient) return;
    gradient.addColorStop(0, `rgba(235,252,255,${1 - phase})`);
    gradient.addColorStop(.45, `rgba(78,206,255,${(1 - phase) * .85})`);
    gradient.addColorStop(1, "rgba(50,161,255,0)");
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.fill();
  }

  // --------------------------------------------------------------- grid

  function drawGrid(geo) {
    const shape = geo.shape;
    const margin = geo.scale * 1.2;
    const visible = visibleWorldBounds(geo);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(130, 161, 181, .105)";
    // One path for the whole field: at 72x40 this is ~2 900 hexes and a stroke
    // apiece would not hold 4x playback.
    ctx.beginPath();
    if (shape.shape === "rect") {
      const halfW = shape.width / 2, halfH = shape.height / 2;
      for (let r = Math.ceil(-halfH); r <= Math.floor(halfH); r++) {
        for (let q = Math.ceil(-halfW - r / 2); q <= Math.floor(halfW - r / 2); q++) {
          const center = project({ q, r }, geo);
          if (center.x < visible.minX - margin || center.x > visible.maxX + margin) continue;
          if (center.y < visible.minY - margin || center.y > visible.maxY + margin) continue;
          traceHex(center, geo.scale);
        }
      }
    } else {
      const radius = shape.radius;
      for (let q = -radius; q <= radius; q++) {
        const minR = Math.max(-radius, -q - radius);
        const maxR = Math.min(radius, -q + radius);
        for (let r = minR; r <= maxR; r++) {
          const center = project({ q, r }, geo);
          if (center.x < visible.minX - margin || center.x > visible.maxX + margin) continue;
          if (center.y < visible.minY - margin || center.y > visible.maxY + margin) continue;
          traceHex(center, geo.scale);
        }
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(228, 194, 117, .24)";
    if (shape.shape === "rect") drawRectBoundary(geo, shape);
    else drawBoundary(geo, shape.radius);
    ctx.restore();
  }

  // Terrain is replay metadata rather than mutable round state. It shares the
  // tactical camera transform and is painted after the grid, before every ship
  // aura, marker and weapon effect. Old replays simply have an empty list.
  function drawTerrain(geo) {
    const terrain = state.replay?.meta?.terrain;
    if (!Array.isArray(terrain)) return;
    for (const item of terrain) {
      if (!item || !Number.isFinite(item.q) || !Number.isFinite(item.r)) continue;
      if (item.type === "moon" || item.type === "planet") drawMoonOrPlanet(item, geo);
      else if (item.type === "asteroid") drawLargeAsteroid(item, geo);
      else if (item.type === "asteroids") drawAsteroidField(item, geo);
      else if (item.type === "nebula") drawNebula(item, geo);
    }
  }

  function drawMoonOrPlanet(item, geo) {
    const at = project(item, geo);
    const planet = item.type === "planet";
    const radius = geo.scale * (planet ? 2.15 : .72);
    const gradient = safeRadial(at.x - radius * .28, at.y - radius * .3, radius * .08, at.x, at.y, radius);
    if (!gradient) return;
    if (planet) {
      gradient.addColorStop(0, "rgba(255,241,201,.98)");
      gradient.addColorStop(.35, "rgba(187,169,130,.98)");
      gradient.addColorStop(1, "rgba(75,64,54,.98)");
    } else {
      gradient.addColorStop(0, "rgba(244,247,248,.98)");
      gradient.addColorStop(.45, "rgba(170,179,186,.98)");
      gradient.addColorStop(1, "rgba(72,83,91,.98)");
    }
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.shadowColor = planet ? "rgba(210,169,109,.45)" : "rgba(217,238,242,.3)";
    ctx.shadowBlur = radius * .25;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    state.rendered[planet ? "planet" : "moon"]++;
  }

  // The large asteroid ("asteroid"): one impassable, fire-blocking hex like a
  // moon, but drawn as a jagged silhouette (largeAsteroidOutline, deterministic
  // per hex) instead of a smooth sphere, so it reads as a craggy rock.
  function drawLargeAsteroid(item, geo) {
    const at = project(item, geo);
    const base = geo.scale * .72;
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(base)) return;
    const outline = largeAsteroidOutline(item.q, item.r);
    ctx.save();
    ctx.beginPath();
    outline.forEach((point, i) => {
      const r = base * point.radius;
      const x = at.x + Math.cos(point.angle) * r, y = at.y + Math.sin(point.angle) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    const gradient = safeRadial(at.x - base * .25, at.y - base * .3, base * .1, at.x, at.y, base);
    if (gradient) {
      gradient.addColorStop(0, "rgba(147,129,106,.98)");
      gradient.addColorStop(.5, "rgba(94,77,61,.98)");
      gradient.addColorStop(1, "rgba(43,34,26,.98)");
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = "rgba(80,66,53,.98)";
    }
    ctx.shadowColor = "rgba(0,0,0,.4)";
    ctx.shadowBlur = base * .2;
    ctx.fill();
    ctx.strokeStyle = "rgba(37,28,21,.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    state.rendered.asteroid++;
  }

  // The asteroid field ("asteroids"): a speckled grey-brown scatter of small
  // rocks (asteroidFieldRocks, deterministic per hex so it does not shimmer
  // between frames) filling most of the hex -- not a solid body, so ships and
  // effects draw over it normally.
  function drawAsteroidField(item, geo) {
    const at = project(item, geo);
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(geo.scale)) return;
    const rocks = asteroidFieldRocks(item.q, item.r);
    ctx.save();
    for (const rock of rocks) {
      const x = at.x + rock.dx * geo.scale, y = at.y + rock.dy * geo.scale;
      const r = Math.max(.4, rock.radius * geo.scale);
      const tone = 96 + Math.round(rock.shade * 60);
      ctx.fillStyle = `rgba(${tone},${Math.round(tone * .86)},${Math.round(tone * .7)},.92)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    state.rendered.asteroids++;
  }

  // Nebula: a soft purple-violet haze filling most of the hex, with a gently
  // irregular edge (nebulaOutline, deterministic per hex so it does not
  // shimmer between frames). Passable and does not block fire (the engine's
  // Mutara rules -- short visibility, a to-hit penalty, shields useless
  // inside -- are mechanical only and have no separate render here).
  function drawNebula(item, geo) {
    const at = project(item, geo);
    const base = geo.scale * .8;
    if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(base)) return;
    const outline = nebulaOutline(item.q, item.r);
    ctx.save();
    ctx.beginPath();
    outline.forEach((point, i) => {
      const r = base * point.radius;
      const x = at.x + Math.cos(point.angle) * r, y = at.y + Math.sin(point.angle) * r;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    const gradient = safeRadial(at.x, at.y, 0, at.x, at.y, base);
    if (gradient) {
      gradient.addColorStop(0, "rgba(186,150,255,.34)");
      gradient.addColorStop(.6, "rgba(138,96,224,.22)");
      gradient.addColorStop(1, "rgba(90,58,168,.05)");
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = "rgba(138,96,224,.22)";
    }
    ctx.fill();
    ctx.restore();
    state.rendered.nebula++;
  }

  function traceHex(center, size) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + i * Math.PI / 3;
      const x = center.x + Math.cos(angle) * size;
      const y = center.y + Math.sin(angle) * size;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function drawRectBoundary(geo, shape) {
    // The bound is |q + r/2| <= W/2 and |r| <= H/2, which in pixels is an
    // axis-aligned rectangle; add half a hex so the edge hexes sit inside it.
    const halfX = (Math.sqrt(3) * shape.width / 2 + Math.sqrt(3) / 2) * geo.scale;
    const halfY = (1.5 * shape.height / 2 + 1) * geo.scale;
    ctx.beginPath();
    ctx.moveTo(geo.cx - halfX, geo.cy - halfY);
    ctx.lineTo(geo.cx + halfX, geo.cy - halfY);
    ctx.lineTo(geo.cx + halfX, geo.cy + halfY);
    ctx.lineTo(geo.cx - halfX, geo.cy + halfY);
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

  function movementProgress() {
    return clamp01(state.progress / MOVEMENT_END);
  }

  function effectProgress() {
    return clamp01((state.progress - MOVEMENT_END) / (1 - MOVEMENT_END));
  }

  function shortestFacingDelta(from, to) {
    return ((to - from + 3) % 6 + 6) % 6 - 3;
  }

  function interpolateShip(ship, previousRound, amount) {
    const previous = shipAt(previousRound, ship.id);
    if (!previous || amount >= 1) return ship;
    const distance = hexDistance(previous.pos, ship.pos);
    const warpKey = `${currentRound().turn}:${currentRound().round}:${ship.id}`;
    const warp = state.warpEvents.has(warpKey) || (!state.hasReplayLog && distance >= WARP_FALLBACK_DISTANCE_HEXES);
    const pos = warp
      ? (amount < WARP_CUT ? previous.pos : ship.pos)
      : { q: previous.pos.q + (ship.pos.q - previous.pos.q) * amount, r: previous.pos.r + (ship.pos.r - previous.pos.r) * amount };
    const opacity = warp
      ? (amount < WARP_CUT ? clamp01(1 - amount / .36) : clamp01((amount - WARP_CUT) / .28))
      : 1;
    return {
      ...ship,
      pos,
      facing: previous.facing + shortestFacingDelta(previous.facing, ship.facing) * amount,
      destroyed: amount < .72 ? previous.destroyed : ship.destroyed,
      superstructure: amount < .72 ? previous.superstructure : ship.superstructure,
      shieldCap: amount < .72 ? previous.shieldCap : ship.shieldCap,
      shieldDown: amount < .72 ? previous.shieldDown : ship.shieldDown,
      _motion: { start: previous.pos, end: ship.pos, amount, distance, warp, opacity }
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

  // -------------------------------------------------------------- ships

  // Radius of the drawn marker, whichever renderer is in use. Never larger than
  // the hex's inradius: one ship, one hex, no spilling (ruling 24b). Every
  // roster class has an icon (test/arena-smoke.js checks this), so the icon
  // radius is the universal fallback under the sprite mode's per-hull gaps;
  // zero only in the never-expected case where even the icon is missing (see
  // drawShip), so a hit-test still gets a sane floor from geo.scale.
  function markerSize(ship, geo) {
    const offset = state.offsets.get(ship.id);
    const shrink = offset?.shrink ?? 1;
    const key = `${ship.faction}/${ship.className}`;
    const iconRadius = ICON_SPAN * ICON_EXTENT * shrink * geo.scale;
    if (state.render === "sprites") {
      const sprite = sprites.get(key);
      if (sprite) return Math.max(iconRadius, spriteBox(sprite, geo, shrink) / 2);
    }
    return icons.has(key) ? iconRadius : 0;
  }

  function spriteBox(sprite, geo, shrink) {
    const wanted = sprite.spanUnits * SPRITE_UNITS_TO_HEX_RADIUS * geo.scale;
    // Sprites used to spill across hex edges. Same rule as icons now.
    const cap = 2 * HEX_INRADIUS * geo.scale * shrink;
    return Math.min(wanted, cap);
  }

  // Draw an icon so its nose points along `heading` (screen radians, 0 = east,
  // y down). The manifest says noseUp, and engine facing 0 = east turning
  // counter-clockwise, so a ship of facing f has heading -f * 60 degrees.
  function drawIconImage(image, x, y, box, heading, alpha, grey) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(heading + Math.PI / 2);
    if (grey) ctx.filter = "grayscale(1) brightness(.65)";
    ctx.drawImage(image, -box / 2, -box / 2, box, box);
    ctx.restore();
  }

  // Every roster class has an icon (test/arena-smoke.js checks the full
  // roster against assets/icons/manifest.json), so there is no chevron/
  // triangle fallback marker any more: sprite mode falls back to the icon for
  // hulls the legacy sprite sheet predates (dreadnought, carrier), and icon
  // mode -- or a genuinely missing icon -- draws nothing and logs one console
  // warning per missing faction/class so it doesn't spam every frame.
  const warnedMissingArt = new Set();
  function warnMissingShipArt(key) {
    state.rendered.missing++;
    if (warnedMissingArt.has(key)) return;
    warnedMissingArt.add(key);
    console.warn(`Battle Arena: no ship art (icon or sprite) for ${key}; drawing nothing.`);
  }

  function drawShip(ship, previous, geo, now) {
    const at = pointFor(ship, geo);
    const offset = state.offsets.get(ship.id);
    const shrink = offset?.shrink ?? 1;
    const size = markerSize(ship, geo);
    const key = `${ship.faction}/${ship.className}`;
    const sprite = state.render === "sprites" ? sprites.get(key) : null;
    const icon = !sprite ? icons.get(key) : null;
    const hidden = ship.cloaked && !ship.detected;
    const destroyedNow = ship.destroyed;
    const motionOpacity = ship._motion?.opacity ?? 1;
    const alpha = (destroyedNow ? .28 : hidden ? .22 : 1) * motionOpacity;
    drawMotionCue(ship, geo);
    if (offset) state.rendered.stacked++;

    if (sprite) {
      if (state.pinned === ship.id) drawPin(at, size + 3);
      drawIconImage(sprite.image, at.x, at.y, spriteBox(sprite, geo, shrink),
        -ship.facing * Math.PI / 3, alpha, destroyedNow);
      state.rendered.sprite++;
    } else if (icon) {
      if (state.pinned === ship.id) drawPin(at, size + 3);
      // Every icon shares one drawing box; the generator baked the manifest
      // `size` into each SVG, so the artwork comes out at its class's scale.
      drawIconImage(icon.image, at.x, at.y, ICON_SPAN * geo.scale * shrink,
        -ship.facing * Math.PI / 3, alpha, destroyedNow);
      state.rendered.icon++;
    } else {
      warnMissingShipArt(key);
    }

    ctx.save();
    ctx.globalAlpha = motionOpacity;
    drawHullBar(ship, at, size, geo);
    drawShields(ship, at, size, geo);
    if (destroyedNow && previous && !previous.destroyed && now < state.flashUntil) drawExplosion(at, size, now);
    ctx.restore();
    if (motionOpacity > .15) state.hits.push({ id: ship.id, x: at.x, y: at.y, radius: Math.max(size + 9, geo.scale) });
  }

  function drawPin(at, radius) {
    ctx.save();
    ctx.strokeStyle = "#ecf7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // How far the status furniture sits outside the marker. Tied to the hex so
  // it stays legible whether the field is 22 hexes wide or 72.
  function ringGap(geo) { return Math.max(3, geo.scale * .34); }

  function drawHullBar(ship, at, size, geo) {
    const width = size * 1.8;
    const height = Math.max(2, Math.min(3, geo.scale * .3));
    const top = at.y + size + ringGap(geo) * .8;
    const ratio = Math.max(0, ship.superstructure / Math.max(1, ship.superstructureMax));
    ctx.fillStyle = "rgba(0,0,0,.75)";
    ctx.fillRect(at.x - width / 2, top, width, height);
    ctx.fillStyle = ratio > .5 ? "#78d09a" : ratio > .25 ? "#e5bd62" : "#e16b64";
    ctx.fillRect(at.x - width / 2, top, width * ratio, height);
  }

  function drawShields(ship, at, size, geo) {
    const pip = Math.max(1.1, Math.min(1.7, geo.scale * .18));
    for (let face = 1; face <= 6; face++) {
      const offset = [5, 0, 1, 2, 3, 4][face - 1];
      const angle = -(ship.facing + offset) * Math.PI / 3;
      const radius = size + ringGap(geo);
      const x = at.x + Math.cos(angle) * radius;
      const y = at.y + Math.sin(angle) * radius;
      ctx.beginPath();
      ctx.arc(x, y, pip, 0, Math.PI * 2);
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

  // ----------------------------------------------- photonic cannon (spinal)
  //
  // The bank drinks the ship's power pool for several turns and then empties
  // itself into one shield-bypassing bolt. It is deliberately nothing like the
  // beams: white-violet, spinal, far thicker, and it is the only effect that
  // grows over several rounds before it goes off.

  function spinalFrame() { return state.effects?.spinal[state.index] ?? []; }

  function drawSpinalAuras(ships, geo, now) {
    const frame = spinalFrame();
    if (!frame.length) return;
    for (const bank of frame) {
      const ship = ships.find((entry) => entry.id === bank.id);
      if (!ship || ship.destroyed) continue;
      const at = pointFor(ship, geo);
      const size = markerSize(ship, geo);
      if (bank.phase === "charging" && bank.ratio > 0) {
        const pulse = .82 + .18 * Math.sin(now / 260);
        drawGlow(at, size * (1.15 + bank.ratio * 1.5) * pulse, [
          [0, `rgba(255,252,255,${.16 + bank.ratio * .3})`],
          [.42, `rgba(163,120,255,${.14 + bank.ratio * .42})`],
          [1, "rgba(74,32,150,0)"]
        ]);
        state.rendered.spinalCharge++;
      } else if (bank.phase === "ready") {
        const pulse = .9 + .22 * Math.sin(now / 120);
        drawGlow(at, size * 2.5 * pulse, [
          [0, "rgba(255,255,255,.92)"],
          [.3, "rgba(214,188,255,.8)"],
          [.68, "rgba(163,120,255,.45)"],
          [1, "rgba(94,42,190,0)"]
        ]);
        state.rendered.spinalHold++;
      } else if (bank.phase === "venting") {
        const pulse = .5 + .12 * Math.sin(now / 420);
        drawGlow(at, size * 1.45 * pulse, [
          [0, "rgba(120,104,150,.34)"],
          [.6, "rgba(82,66,116,.2)"],
          [1, "rgba(40,30,64,0)"]
        ]);
        state.rendered.spinalVent++;
      }
    }
  }

  function drawGlow(at, radius, stops) {
    const gradient = safeRadial(at.x, at.y, 0, at.x, at.y, radius);
    if (!gradient) return;
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSpinalFire(geo) {
    const fires = state.effects?.fires[state.index];
    if (!fires || !fires.length) return;
    if (state.progress < MOVEMENT_END) return;
    const phase = effectProgress();
    if (phase > .52) return;
    for (const shot of fires) {
      const snapshot = state.replay.rounds[state.index];
      const shooter = shipAt(snapshot, shot.shooterId);
      const target = shipAt(snapshot, shot.targetId);
      if (!shooter || !target) continue;
      const start = snapshotPoint(shooter, snapshot, geo);
      const aim = snapshotPoint(target, snapshot, geo);
      const end = aim;
      const alpha = Math.max(0, 1 - phase / .52);
      const head = end;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.shadowColor = "#a678ff";
      ctx.shadowBlur = effectScreenSize(geo, .42, 4);
      ctx.strokeStyle = "#c9a6ff";
      ctx.lineWidth = effectWorldSize(geo, .25, 2);
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.strokeStyle = "#fdfbff";
      ctx.shadowBlur = effectScreenSize(geo, .2, 2);
      ctx.lineWidth = effectWorldSize(geo, .08, 1);
      ctx.stroke();
      ctx.restore();
      state.rendered.spinalBolt++;
      if (shot.hit && phase < .42) {
        drawSpinalImpact(aim, markerSize(target, geo), phase / .42, geo);
        state.rendered.spinalHit++;
      } else if (!shot.hit && phase > .2) {
        state.rendered.spinalMiss++;
      }
    }
  }

  function drawSpinalImpact(at, size, phase, geo) {
    const radius = size * (1.4 + phase * 3.4);
    const fade = 1 - phase;
    drawGlow(at, radius, [
      [0, `rgba(255,255,255,${fade})`],
      [.22, `rgba(214,188,255,${fade * .95})`],
      [.6, `rgba(148,96,255,${fade * .55})`],
      [1, "rgba(64,22,132,0)"]
    ]);
    ctx.save();
    ctx.globalAlpha = fade * .9;
    ctx.strokeStyle = "#e6d6ff";
    ctx.shadowColor = "#b98cff";
    ctx.shadowBlur = effectScreenSize(geo, .3, 3);
    ctx.lineWidth = effectWorldSize(geo, .045, 1);
    ctx.beginPath(); ctx.arc(at.x, at.y, radius * .72, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------- carrier air group
  //
  // Squadrons carry no map position in v1: they fly from the parent deck
  // within a radius. Ruling 27: carriers are standoff ships, so a squadron in
  // hand sits as a compact "wing ready" indicator beside the deck rather than
  // orbiting the hull (drawWingReady), streaks out to the target on a strike
  // (drawStrikes), and thins as the log books their losses.

  function craftIcon(faction, type) {
    return icons.get(`${faction}/${type}`);
  }

  function drawWing(ships, geo) {
    const frame = state.effects?.wing[state.index];
    if (!frame || !frame.length) return;
    const striking = new Set((state.effects.strikes[state.index] ?? []).map((entry) => entry.squadronId));
    for (const entry of frame) {
      const carrier = ships.find((ship) => ship.id === entry.carrierId);
      if (!carrier || carrier.destroyed) continue;
      // Group in-hand strength by craft type: a compact indicator, not a
      // swarm. A squadron mid-strike is drawn on its attack run instead (see
      // drawStrikes), so it does not also show up parked on the deck.
      const byType = new Map();
      for (const squadron of entry.squadrons) {
        if (striking.has(squadron.id) || squadron.strength <= 0) continue;
        byType.set(squadron.type, (byType.get(squadron.type) || 0) + squadron.strength);
      }
      if (byType.size) drawWingReady(carrier, byType, geo);
    }
  }

  // The "wing ready" indicator: one short row of glyphs per craft type still
  // aboard, capped at READY_MAX_GLYPHS so a full establishment still reads as
  // "the deck has strength" rather than as fighters swarming the hull, and
  // thinning exactly as the log attrits the wing (fewer glyphs, same spot).
  // Parked, not flying: no heading of its own, so every glyph noses "up".
  function drawWingReady(carrier, byType, geo) {
    const at = pointFor(carrier, geo);
    const size = markerSize(carrier, geo);
    const box = ICON_SPAN * geo.scale * READY_SPAN;
    const originX = at.x + size + ringGap(geo) * READY_GAP;
    let row = 0;
    for (const [type, strength] of byType) {
      const shown = Math.min(strength, READY_MAX_GLYPHS);
      const y = at.y - size * .55 + row * box * .82;
      for (let i = 0; i < shown; i++) {
        const x = originX + i * box * .58;
        const icon = craftIcon(carrier.faction, type);
        if (icon) drawIconImage(icon.image, x, y, box, -Math.PI / 2, .92, false);
        else drawCraftDot(x, y, type, geo);
        state.rendered.craft++;
      }
      row++;
    }
  }

  function drawCraftDot(x, y, type, geo) {
    ctx.save();
    ctx.fillStyle = type === "bomber" ? "#ffd08a" : "#bfe6ff";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, geo.scale * .12), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawStrikes(ships, geo, now) {
    const strikes = state.effects?.strikes[state.index];
    if (!strikes || !strikes.length) return;
    const phase = state.progress;
    for (const strike of strikes) {
      const carrier = ships.find((ship) => ship.id === strike.carrierId) || lastShipAt(strike.carrierId, state.index);
      const target = lastShipAt(strike.targetId, state.index);
      if (!carrier || !target) continue;
      const start = pointFor(carrier, geo);
      const end = pointFor(target, geo);
      const travel = clamp01(phase / .5);
      if (travel < 1 || phase < .82) {
        const icon = craftIcon(carrier.faction, strike.type);
        const box = ICON_SPAN * geo.scale * CRAFT_SPAN;
        const dx = end.x - start.x, dy = end.y - start.y;
        const heading = Math.atan2(dy, dx);
        const length = Math.max(1, Math.hypot(dx, dy));
        const shown = Math.max(1, Math.min(strike.strength, 8));
        for (let i = 0; i < shown; i++) {
          const lead = clamp01(travel - i * .045);
          const spread = ((i % 2 ? 1 : -1) * Math.ceil(i / 2)) * geo.scale * .34;
          const x = start.x + dx * lead - dy / length * spread;
          const y = start.y + dy * lead + dx / length * spread;
          if (icon) drawIconImage(icon.image, x, y, box, heading, .95, false);
          else drawCraftDot(x, y, strike.type, geo);
        }
        state.rendered.strikeRun++;
      }
      if (strike.hits > 0 && phase > .45 && phase < .88) {
        const flicker = (phase - .45) / .43;
        drawStrikeImpact(end, markerSize(target, geo), flicker, now);
        state.rendered.strikeImpact++;
      }
    }
  }

  function drawStrikeImpact(at, size, phase, now) {
    const jitter = .8 + .35 * Math.sin(now / 45);
    const radius = size * (.7 + phase * 1.2) * jitter;
    drawGlow(at, radius, [
      [0, `rgba(255,247,222,${(1 - phase) * .95})`],
      [.4, `rgba(255,176,84,${(1 - phase) * .7})`],
      [1, "rgba(220,88,30,0)"]
    ]);
  }

  // --------------------------------------------------------------- frame

  function draw(now = performance.now()) {
    const box = resize();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    if (!state.replay) return;
    const geo = geometry();
    const round = currentRound();
    const previous = state.replay.rounds[state.index - 1];
    const ships = round.ships.map((raw) => interpolateShip(raw, previous, movementProgress()));
    state.camera.moving = autoFrameCamera(ships, geo, now);

    // Everything on the tactical map shares this one camera transform. UI and
    // pointer coordinates remain in CSS pixels outside it.
    ctx.save();
    ctx.setTransform(
      ratio * state.camera.zoom, 0, 0, ratio * state.camera.zoom,
      ratio * state.camera.x, ratio * state.camera.y
    );
    drawGrid(geo);
    drawTerrain(geo);
    state.hits = [];

    // Ships may share a hex (ruling 24b/24e). Work out the stacks for THIS
    // frame from the interpolated positions, so a ship that is passing through
    // another's hex is nudged aside only while it is actually there.
    state.offsets = new Map();
    const stacks = new Map();
    for (const ship of ships) {
      if (ship.destroyed) continue;
      const hex = hexRound(ship.pos.q, ship.pos.r);
      const key = `${hex.q},${hex.r}`;
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push(ship.id);
    }
    for (const members of stacks.values()) {
      if (members.length < 2) continue;
      members.sort();
      const layout = stackLayout(members.length);
      members.forEach((id, i) => state.offsets.set(id, layout[i]));
    }

    drawSpinalAuras(ships, geo, now);
    for (const ship of ships) drawShip(ship, shipAt(previous, ship.id), geo, now);
    drawWing(ships, geo);
    drawShotEffects(geo, now);
    drawStrikes(ships, geo, now);
    drawSpinalFire(geo);
    ctx.restore();
  }

  function goTo(index, flash = true) {
    if (!state.replay) return;
    const old = state.index;
    state.index = Math.max(0, Math.min(state.replay.rounds.length - 1, index));
    state.progress = state.index === 0 ? 0 : MOVEMENT_END;
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

  function setRenderMode(mode) {
    state.render = mode === "sprites" ? "sprites" : "icons";
    const iconButton = $("#mode-icons");
    const spriteButton = $("#mode-sprites");
    for (const [button, active] of [[iconButton, state.render === "icons"], [spriteButton, state.render === "sprites"]]) {
      if (!button) continue;
      button.classList[active ? "add" : "remove"]("active");
      if (button.setAttribute) button.setAttribute("aria-pressed", active ? "true" : "false");
    }
    draw();
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const frameTime = Number.isFinite(now) ? now : performance.now();
    if (state.playing && state.replay) {
      const previousTime = Number.isFinite(state.lastTime) ? state.lastTime : frameTime;
      const elapsed = Math.max(0, Math.min(100, frameTime - previousTime));
      const speed = Number.isFinite(state.speed) && state.speed > 0 ? state.speed : 1;
      state.progress = (Number.isFinite(state.progress) ? state.progress : 0) + elapsed * speed / 1000;
      let changedRound = false;
      while (state.progress >= 1) {
        if (state.index < state.replay.rounds.length - 1) {
          state.progress -= 1;
          state.index++;
          state.flashUntil = frameTime + 480;
          changedRound = true;
        } else {
          state.progress = 0;
          setPlaying(false);
          break;
        }
      }
      if (changedRound) updatePanel();
      state.lastTime = frameTime;
      draw(frameTime);
    } else if (state.flashUntil > frameTime || state.camera.moving) {
      state.lastTime = frameTime;
      draw(frameTime);
    } else {
      state.lastTime = frameTime;
    }
  }

  $("#file-input").addEventListener("change", (event) => readFile(event.target.files[0]));
  $("#play").addEventListener("click", () => setPlaying(!state.playing));
  $("#step-back").addEventListener("click", () => { setPlaying(false); goTo(state.index - 1); });
  $("#step-forward").addEventListener("click", () => { setPlaying(false); goTo(state.index + 1); });
  $("#scrubber").addEventListener("input", (event) => { setPlaying(false); goTo(Number(event.target.value), false); });
  $("#speed").addEventListener("change", (event) => { state.speed = Number(event.target.value); });
  $("#close-ship").addEventListener("click", () => { state.pinned = null; $("#ship-card").hidden = true; draw(); });
  $("#mode-icons")?.addEventListener("click", () => setRenderMode("icons"));
  $("#mode-sprites")?.addEventListener("click", () => setRenderMode("sprites"));
  document.querySelectorAll("[data-log-filter]").forEach((input) => input.addEventListener("change", () => {
    const key = input.dataset.logFilter;
    if (!(key in state.logFilters)) return;
    state.logFilters[key] = Boolean(input.checked);
    if (key === "raw") {
      document.querySelectorAll("[data-log-filter]:not([data-log-filter=raw])").forEach((filter) => { filter.disabled = state.logFilters.raw; });
    }
    updatePanel();
  }));
  $("#frame-fleets")?.addEventListener("click", () => setAutoFrame(true, true));
  $("#fit-map")?.addEventListener("click", fitMap);
  canvas.addEventListener("wheel", (event) => {
    if (!state.replay) return;
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    const cursor = { x: event.clientX - box.left, y: event.clientY - box.top };
    const world = screenToWorld(cursor.x, cursor.y);
    const geo = geometry();
    const factor = Math.exp(-event.deltaY * .0015);
    const zoom = clampCameraZoom(state.camera.zoom * factor, geo);
    state.camera.autoFrame = false;
    state.camera.zoom = zoom;
    state.camera.x = cursor.x - world.x * zoom;
    state.camera.y = cursor.y - world.y * zoom;
    updateCameraButtons();
    draw();
  }, { passive: false });

  let pointer = null;
  let suppressClick = false;
  const startPan = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, dragging: false };
    suppressClick = false;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const movePan = (event) => {
    if (!pointer || (pointer.id !== undefined && event.pointerId !== pointer.id)) return;
    const distance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (!pointer.dragging && distance > PAN_THRESHOLD) {
      pointer.dragging = true;
      state.camera.autoFrame = false;
      updateCameraButtons();
      canvas.classList?.add("panning");
    }
    if (pointer.dragging) {
      state.camera.x += event.clientX - pointer.x;
      state.camera.y += event.clientY - pointer.y;
      draw();
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  };
  const endPan = (event) => {
    if (!pointer || (pointer.id !== undefined && event.pointerId !== pointer.id)) return;
    suppressClick = pointer.dragging;
    canvas.releasePointerCapture?.(event.pointerId);
    canvas.classList?.remove("panning");
    pointer = null;
  };
  // Pointer capture keeps a drag alive outside the canvas. The mouse fallback
  // also keeps the camera testable in the lightweight DOM smoke harness.
  if ("PointerEvent" in window) {
    canvas.addEventListener("pointerdown", startPan);
    canvas.addEventListener("pointermove", movePan);
    canvas.addEventListener("pointerup", endPan);
    canvas.addEventListener("pointercancel", endPan);
  } else {
    canvas.addEventListener("mousedown", startPan);
    canvas.addEventListener("mousemove", movePan);
    canvas.addEventListener("mouseup", endPan);
    canvas.addEventListener("mouseleave", endPan);
  }
  canvas.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; return; }
    const box = canvas.getBoundingClientRect();
    const point = screenToWorld(event.clientX - box.left, event.clientY - box.top);
    const x = point.x, y = point.y;
    const hit = [...state.hits].reverse().find((item) => Math.hypot(x - item.x, y - item.y) <= item.radius);
    if (hit) { state.pinned = hit.id; updateShipCard(); draw(); }
  });
  window.addEventListener("resize", () => {
    if (state.camera.autoFrame) {
      state.camera.snap = true;
      state.camera.lastTime = 0;
    }
    draw();
  });

  const drop = $("#load-panel");
  for (const type of ["dragenter", "dragover"]) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.add("dragging"); });
  for (const type of ["dragleave", "drop"]) drop.addEventListener(type, (event) => { event.preventDefault(); drop.classList.remove("dragging"); });
  drop.addEventListener("drop", (event) => readFile(event.dataTransfer.files[0]));
  document.querySelectorAll("[data-replay]").forEach((button) => button.addEventListener("click", () =>
    loadUrl(button.dataset.replay, "This browser blocks local file loading. Use Choose file and select the bundled replay JSON.")));

  // Diagnostic surface: the map/stacking arithmetic and the parsed effect
  // timeline, so test/arena-smoke.js can assert on them without a browser.
  window.__arena = {
    state, icons, sprites,
    mapShape, inBounds, geometry, project, hexRound, stackLayout, markerSize,
    buildLogEffects, buildNarrative, buildShotEffects, effectEndpoints, setRenderMode, drawTerrain,
    cameraLimits, clampCameraZoom, livingShipBounds, cameraForBounds,
    setAutoFrame, fitMap, screenToWorld, effectScreenSize, effectWorldSize,
    constants: { HEX_INRADIUS, ICON_SPAN, ICON_EXTENT, CRAFT_SPAN, READY_SPAN, READY_MAX_GLYPHS, READY_GAP,
      CAMERA_MARGIN_HEXES, CAMERA_MAX_HEX_WIDTH, PAN_THRESHOLD, MOVEMENT_END,
      ARRIVAL_LABEL_PX, ARRIVAL_LABEL_SECONDS }
  };

  async function loadInitialReplay() {
    let sessionRequested = false;
    try { sessionRequested = typeof location !== "undefined" && new URLSearchParams(location.search).get("replay") === "session"; } catch (_) {}
    if (sessionRequested) {
      try {
        const stored = sessionStorage.getItem(SESSION_REPLAY_KEY);
        if (!stored) throw new Error("No scenario replay is stored in this browser tab.");
        loadReplay(JSON.parse(stored));
        return;
      } catch (error) {
        showLoader(error.message || "The scenario replay could not be opened.");
        return;
      }
    }
    loadUrl("./replay.json");
  }

  loadIcons();
  loadSprites();
  loadInitialReplay();
  requestAnimationFrame(tick);
})();
