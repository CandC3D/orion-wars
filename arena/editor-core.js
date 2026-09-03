export const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];

export const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

// The five terrain types (rulings 2026-09-02, docs/tactical-design.md #26c,
// #26d): moon and asteroid (a large asteroid) are one impassable,
// fire-blocking hex; planet is a seven-hex rosette, also impassable and
// fire-blocking; asteroids (an asteroid field) is one hex that ships MAY
// enter or pass through -- slow (double movement cost, enforced by the
// engine) and it blocks fire in, out and through; nebula is one hex ships may
// freely enter and pass through, and does NOT block fire (the engine applies
// its own short-visibility/to-hit/shields-useless "Mutara rules" inside one,
// none of which affect placement or line-of-fire blocking here).
export const TERRAIN_TYPES = ["moon", "planet", "asteroid", "asteroids", "nebula"];
export const TERRAIN_LABELS = {
  moon: "Moon", planet: "Planet", asteroid: "Asteroid", asteroids: "Asteroid field", nebula: "Nebula"
};

// Only "asteroids" (the field) and "nebula" are passable; every other terrain
// type blocks ships the way moons always have. Kept as one predicate so the
// editor's placement checks and validateScenario agree with
// src/tactical/resolver.js.
export function terrainBlocksShips(type) { return type !== "asteroids" && type !== "nebula"; }

export function normalizeFacing(value) {
  return ((Math.trunc(Number(value) || 0) % 6) + 6) % 6;
}

export function inMap(q, r, map) {
  return Number.isFinite(q) && Number.isFinite(r) &&
    Math.abs(q + r / 2) <= Number(map?.widthHexes) / 2 + 1e-9 &&
    Math.abs(r) <= Number(map?.heightHexes) / 2 + 1e-9;
}

export function hexRound(q, r) {
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Canvas/world coordinates use y-down while the engine's Cartesian helper is
// y-up. These are exact inverses at hex centres.
export function axialToWorld(pos) {
  return { x: Math.sqrt(3) * (pos.q + pos.r / 2), y: 1.5 * pos.r };
}

export function snapWorldToHex(x, y) {
  const r = y / 1.5;
  const q = x / Math.sqrt(3) - r / 2;
  return hexRound(q, r);
}

export function terrainFootprint(item) {
  if (!item || !Number.isFinite(item.q) || !Number.isFinite(item.r)) return [];
  const center = { q: item.q, r: item.r };
  if (item.type !== "planet") return [center];
  return [center, ...HEX_DIRECTIONS.map((dir) => ({ q: center.q + dir.q, r: center.r + dir.r }))];
}

export function terrainHexSet(terrain, omitIndex = -1) {
  const set = new Set();
  (terrain || []).forEach((item, index) => {
    if (index === omitIndex) return;
    for (const hex of terrainFootprint(item)) set.add(`${hex.q},${hex.r}`);
  });
  return set;
}

// Same as terrainHexSet, but omits passable terrain (the asteroid field) --
// this is the set ships are actually forbidden to occupy or be dragged onto.
export function blockingTerrainHexSet(terrain, omitIndex = -1) {
  const set = new Set();
  (terrain || []).forEach((item, index) => {
    if (index === omitIndex || !terrainBlocksShips(item.type)) return;
    for (const hex of terrainFootprint(item)) set.add(`${hex.q},${hex.r}`);
  });
  return set;
}

// --------------------------------------------------------- asteroid art
// Deterministic per-hex randomness so asteroid terrain art (the field's
// scattered rocks, the large asteroid's craggy silhouette) is stable across
// redraws and camera moves rather than reshuffling every frame. arena.js
// cannot import ES modules (it must keep working when opened from file://,
// see arena/README.md), so it carries its own byte-for-byte copy of this
// hashHex/hexRng/asteroidFieldRocks/largeAsteroidOutline/nebulaOutline block
// -- mirror any change there too.
export function hashHex(q, r, salt) {
  let h = (Math.trunc(q) * 374761393 + Math.trunc(r) * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h ^= h + Math.imul(h ^ (h >>> 7), 61 | h);
  h ^= h >>> 14;
  return (h >>> 0) || 1;
}

// A tiny, deterministic PRNG (mulberry32) seeded from the hex hash above.
export function hexRng(q, r, salt) {
  let state = hashHex(q, r, salt);
  return function next() {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A handful of small rocks scattered across an asteroid-field hex, in hex
// units (fractions of the hex circumradius) relative to the hex centre.
export function asteroidFieldRocks(q, r) {
  const rand = hexRng(q, r, 1);
  const count = 6 + Math.floor(rand() * 4); // 6..9 rocks
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * .6;
    rocks.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, radius: .09 + rand() * .14, shade: rand() });
  }
  return rocks;
}

// The jagged silhouette of one large asteroid, as angle/radius pairs (radius
// a fraction of the body's base radius) relative to the hex centre.
export function largeAsteroidOutline(q, r) {
  const rand = hexRng(q, r, 2);
  const points = 9 + Math.floor(rand() * 4); // 9..12 vertices
  const outline = [];
  for (let i = 0; i < points; i++) {
    outline.push({ angle: (i / points) * Math.PI * 2, radius: .72 + rand() * .28 });
  }
  return outline;
}

// The soft, gently irregular edge of one nebula hex, as angle/radius pairs
// (radius a fraction of the haze's base radius) relative to the hex centre.
// More vertices and a tighter radius band than largeAsteroidOutline -- a
// cloud's edge is a wisp, not a jagged rock -- and it fills most of the hex.
export function nebulaOutline(q, r) {
  const rand = hexRng(q, r, 4);
  const points = 10 + Math.floor(rand() * 5); // 10..14 vertices
  const outline = [];
  for (let i = 0; i < points; i++) {
    outline.push({ angle: (i / points) * Math.PI * 2, radius: .82 + rand() * .16 });
  }
  return outline;
}

export function fleetPoints(side, tuning) {
  return (side?.ships || []).reduce((total, ship) =>
    total + (Number(tuning?.hullClasses?.[ship.className]?.points) || 0), 0);
}

export function rosterFor(faction, tuning) {
  const roster = tuning?.rosters?.[faction];
  if (Array.isArray(roster)) return roster;
  return Object.keys(tuning?.hullClasses || {}).filter((name) => name !== "command-ship");
}

export function compositionFor(side) {
  const composition = {};
  for (const ship of side?.ships || []) composition[ship.className] = (composition[ship.className] || 0) + 1;
  return composition;
}

export function scenarioForSave(model) {
  return {
    name: String(model?.name || "Untitled scenario"),
    seed: String(model?.seed || "orion"),
    map: {
      widthHexes: Number(model?.map?.widthHexes) || 72,
      heightHexes: Number(model?.map?.heightHexes) || 40
    },
    terrain: (model?.terrain || []).map(({ type, q, r }) => ({ type, q, r })),
    sides: (model?.sides || []).slice(0, 2).map((side) => ({
      faction: side.faction,
      ships: (side.ships || []).map((ship) => {
        const out = { className: ship.className };
        if (Number.isFinite(ship.q) && Number.isFinite(ship.r)) {
          out.q = ship.q;
          out.r = ship.r;
          out.facing = normalizeFacing(ship.facing);
        }
        return out;
      })
    }))
  };
}

export function validateScenario(scenario, tuning, loadouts) {
  const messages = [];
  const map = scenario?.map;
  if (!Number.isFinite(map?.widthHexes) || map.widthHexes <= 0 ||
      !Number.isFinite(map?.heightHexes) || map.heightHexes <= 0) {
    messages.push("Map width and height must be positive numbers.");
  }
  if (!Array.isArray(scenario?.sides) || scenario.sides.length !== 2) {
    messages.push("A scenario must contain exactly two sides.");
    return messages;
  }

  const occupied = new Set();
  const blocking = new Set();
  (scenario.terrain || []).forEach((item, index) => {
    if (!TERRAIN_TYPES.includes(item.type)) {
      messages.push(`Terrain ${index + 1} has unknown type “${item.type}”.`);
      return;
    }
    const blocksShips = terrainBlocksShips(item.type);
    for (const hex of terrainFootprint(item)) {
      const key = `${hex.q},${hex.r}`;
      if (!inMap(hex.q, hex.r, map)) messages.push(`${item.type} ${index + 1} extends off the map.`);
      if (occupied.has(key)) messages.push(`${item.type} ${index + 1} overlaps another terrain body.`);
      occupied.add(key);
      if (blocksShips) blocking.add(key);
    }
  });

  scenario.sides.forEach((side, sideIndex) => {
    const label = `Side ${sideIndex + 1}`;
    if (!FACTIONS.includes(side?.faction)) messages.push(`${label} has unknown faction “${side?.faction ?? ""}”.`);
    if (!Array.isArray(side?.ships) || side.ships.length === 0) messages.push(`${label} is empty.`);
    const roster = rosterFor(side?.faction, tuning);
    (side?.ships || []).forEach((ship, shipIndex) => {
      const hull = tuning?.hullClasses?.[ship.className];
      if (!hull || !Number.isFinite(hull.points)) {
        messages.push(`${label} ship ${shipIndex + 1} has unknown class “${ship.className}”.`);
      } else if (!roster.includes(ship.className)) {
        messages.push(`${label} ship ${shipIndex + 1} (${ship.className}) cannot be fielded by ${side.faction}.`);
      }
      const hasQ = Number.isFinite(ship.q), hasR = Number.isFinite(ship.r);
      if (hasQ !== hasR) messages.push(`${label} ship ${shipIndex + 1} has an incomplete position.`);
      if (hasQ && hasR) {
        if (!inMap(ship.q, ship.r, map)) messages.push(`${label} ship ${shipIndex + 1} is off the map.`);
        if (blocking.has(`${ship.q},${ship.r}`)) messages.push(`${label} ship ${shipIndex + 1} is on terrain.`);
      }
      if (ship.facing !== undefined && !(Number.isInteger(ship.facing) && ship.facing >= 0 && ship.facing <= 5)) {
        messages.push(`${label} ship ${shipIndex + 1} (${ship.className ?? "ship"}) has an invalid facing “${ship.facing}” (must be an integer 0–5).`);
      }
    });

    // hullClasses.<class>.limit caps how many of that class one fleet may
    // field (currently the big specials: dreadnought, carrier, monitor, at 1
    // apiece — see docs/tactical-design.md #27). Driven entirely off the
    // tuning data so any class that later carries a limit is enforced here
    // without a code change.
    const composition = compositionFor(side);
    for (const [className, count] of Object.entries(composition)) {
      const limit = tuning?.hullClasses?.[className]?.limit;
      if (Number.isFinite(limit) && count > limit) {
        messages.push(`${label} fields ${count} ${className}(s); the limit is ${limit}.`);
      }
    }
  });
  return [...new Set(messages)];
}
