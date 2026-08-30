// Game state model: creation, save/load. State is plain JSON-serializable data;
// static content (map, factions, tuning) is referenced, never embedded.

import { TUNING } from "./tuning.js";
import { seedFromString } from "./prng.js";

export const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];

export function newGame(mapData, factionData, seed, tuning = TUNING) {
  const seedNum = typeof seed === "string" ? seedFromString(seed) : seed >>> 0;
  const state = {
    seed: seedNum,
    rngState: seedNum,
    turn: 1,
    over: false,
    nextId: 1,
    // dynamic per-world state; static attributes stay in the map data
    worlds: {},
    factions: {},
    fleets: {},          // id -> fleet
    buildQueue: [],      // { faction, classId, locationId, turnsLeft }
    orderLog: [],        // [{turn, orders}] — seed + this log replays the war
    log: []              // human-readable event log
  };
  for (const n of mapData.nodes) {
    state.worlds[n.id] = {
      owner: n.owner,
      unrest: 0,
      garrison: n.garrison ?? 0
    };
  }
  for (const f of FACTIONS) {
    state.factions[f] = { points: tuning.startingPoints[f] };
  }
  // Starting fleets: a small squadron at each faction's construction starbase.
  seedStartingFleets(state, mapData, factionData);
  return state;
}

function seedStartingFleets(state, mapData, factionData) {
  const starts = {
    EAR: { at: "ear-base", ships: { "ear-bulwark": 1, "ear-meridian": 2, "ear-sentinel": 1 } },
    VRA: { at: "vra-base", ships: { "vra-goldspar": 1, "vra-aurelian": 2, "vra-vaelan": 1 } },
    ZAN: { at: "zan-base", ships: { "zan-drakhan": 1, "zan-vorkul": 2, "zan-rakh": 2 } },
    KRE: { at: "kre-base", ships: { "kre-talon": 1, "kre-nightspar": 2, "kre-thal": 1 } }
  };
  for (const [faction, s] of Object.entries(starts)) {
    if (!mapData.nodes.find((n) => n.id === s.at)) continue; // placeholder-graph guard
    addFleet(state, faction, s.at, s.ships);
  }
}

export function addFleet(state, faction, locationId, ships) {
  const id = `fleet-${state.nextId++}`;
  state.fleets[id] = { id, faction, location: locationId, ships: { ...ships }, path: [], progress: 0 };
  return id;
}

export function fleetsAt(state, nodeId) {
  return Object.values(state.fleets).filter((f) => f.location === nodeId);
}

export function saveGame(state) {
  return JSON.stringify(state);
}

export function loadGame(json) {
  return JSON.parse(json);
}
