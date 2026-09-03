export const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];

export const HEX_DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

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
  (scenario.terrain || []).forEach((item, index) => {
    if (item.type !== "moon" && item.type !== "planet") {
      messages.push(`Terrain ${index + 1} has unknown type “${item.type}”.`);
      return;
    }
    for (const hex of terrainFootprint(item)) {
      const key = `${hex.q},${hex.r}`;
      if (!inMap(hex.q, hex.r, map)) messages.push(`${item.type} ${index + 1} extends off the map.`);
      if (occupied.has(key)) messages.push(`${item.type} ${index + 1} overlaps another terrain body.`);
      occupied.add(key);
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
        if (occupied.has(`${ship.q},${ship.r}`)) messages.push(`${label} ship ${shipIndex + 1} is on terrain.`);
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
