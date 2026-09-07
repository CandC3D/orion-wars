import {
  compositionFor, fleetPoints, fleetRuleIssues, rosterFor
} from "../src/tactical/fleet-rules.js";
import { objectiveErrors } from "../src/tactical/objectives.js";
import { terrainBlocksShips, terrainFootprint } from '../src/tactical/deployment.js';
import { buildScenario } from '../src/tactical/resolver.js';
import { makePrng } from '../src/prng.js';

export { compositionFor, fleetPoints, rosterFor };
export { terrainBlocksShips, terrainFootprint };

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

export function scenarioForSave(model) {
  const scenario = {
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
        if (ship.designPack !== undefined) out.designPack = structuredClone(ship.designPack);
        if (Number.isFinite(ship.q) && Number.isFinite(ship.r)) {
          out.q = ship.q;
          out.r = ship.r;
          out.facing = normalizeFacing(ship.facing);
        }
        return out;
      })
    }))
  };
  if (Number.isInteger(model?.maxTurns) && model.maxTurns > 0) scenario.maxTurns = model.maxTurns;
  if (model?.victory && typeof model.victory === "object") scenario.victory = JSON.parse(JSON.stringify(model.victory));
  if (model?.tutorial && typeof model.tutorial === "object") scenario.tutorial = JSON.parse(JSON.stringify(model.tutorial));
  if (model?.featured === true) scenario.featured = true;
  return scenario;
}

// Existing callers stay strict; authored-scenario UIs request warn and display
// BOTH channels. A flag inside a JSON document cannot relax construction rules.
export function validateScenario(scenario, tuning, loadouts, options = {}) {
  return scenarioIssues(scenario, tuning, loadouts, options).errors;
}

export function scenarioIssues(scenario, tuning, loadouts, options = {}) {
  const messages = [], warnings = [];
  const map = scenario?.map;
  if (!Number.isFinite(map?.widthHexes) || map.widthHexes <= 0 ||
      !Number.isFinite(map?.heightHexes) || map.heightHexes <= 0) {
    messages.push("Map width and height must be positive numbers.");
  }
  if (!Array.isArray(scenario?.sides) || scenario.sides.length !== 2) {
    messages.push("A scenario must contain exactly two sides.");
    return { errors: messages, warnings };
  }
  if (scenario.maxTurns !== undefined && !(Number.isInteger(scenario.maxTurns) && scenario.maxTurns > 0)) {
    messages.push("Maximum turns must be a positive integer.");
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
    (side?.ships || []).forEach((ship, shipIndex) => {
      const hull = tuning?.hullClasses?.[ship.className];
      if (!hull || !Number.isFinite(hull.points)) {
        messages.push(`${label} ship ${shipIndex + 1} has unknown class “${ship.className}”.`);
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

    const issues = fleetRuleIssues(side, tuning, label, options);
    messages.push(...issues.errors);
    warnings.push(...issues.warnings);
  });
  messages.push(...objectiveErrors(scenario.victory, scenario.sides.map(side => side.ships)));
  // The editor also accepts ships without explicit positions. Ask the same
  // builder that will start the battle to check the resolved deployment, using
  // private state / RNG. This is not a combat simulation or a placement change.
  if (!messages.length && scenario.sides.some(side => side.ships.some(ship => !Number.isFinite(ship.q) || !Number.isFinite(ship.r)))) {
    try { buildScenario(scenario, tuning, loadouts, makePrng(0), options); }
    catch (error) { messages.push(error.message); }
  }
  return { errors: [...new Set(messages)], warnings: [...new Set(warnings)] };
}
