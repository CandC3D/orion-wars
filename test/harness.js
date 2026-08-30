// Phase 1 harness: runs a full war with random legal orders for all three
// powers, then proves seeded determinism (replaying seed + order log yields an
// identical final state) and save/load round-trip fidelity.
//
//   node test/harness.js [seed] [--quiet]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Engine } from "../src/engine.js";
import { newGame, saveGame, loadGame, FACTIONS } from "../src/model.js";
import { makePrng } from "../src/prng.js";
import { randomOrders } from "../src/orders.js";
import { TUNING } from "../src/tuning.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const mapData = readJson(join(root, "data", "worlds-placeholder.json"));
const factionData = readJson(join(root, "data", "factions.json"));

const args = process.argv.slice(2);
const quiet = args.includes("--quiet");
const seed = args.find((a) => !a.startsWith("--")) ?? "four-powers-phase-1";

function runWar(seed, plottedOrders = null) {
  const engine = new Engine(mapData, factionData);
  const state = newGame(mapData, factionData, seed);
  // Order-plotting uses its own PRNG stream so replay can feed logged orders
  // instead without disturbing the engine's rngState.
  const plotRng = makePrng(state.seed ^ 0x9e3779b9);
  let t = 0;
  while (!state.over) {
    let orders;
    if (plottedOrders) {
      orders = plottedOrders[t].orders;
    } else {
      orders = {};
      for (const f of FACTIONS) {
        orders[f] = randomOrders(state, engine.graph, factionData, f, plotRng);
      }
    }
    engine.resolveTurn(state, orders);
    t++;
  }
  return state;
}

// --- 1. Full war on random legal orders ---
const final = runWar(seed);
console.log(`War complete: ${TUNING.warLengthTurns} turns, seed "${seed}"`);
console.log(`Contested worlds held: ${FACTIONS.map((f) => `${f} ${final.result.held[f]}`).join(", ")}`);
console.log(`Fleets on map: ${Object.keys(final.fleets).length}; build jobs pending: ${final.buildQueue.length}`);
for (const f of FACTIONS) console.log(`  ${f} treasury: ${final.factions[f].points} pts`);
if (!quiet) {
  console.log("--- last 10 log lines ---");
  for (const line of final.log.slice(-10)) console.log("  " + line);
}

// --- 2. Determinism: replay seed + order log → identical state ---
const replay = runWar(seed, final.orderLog);
const a = saveGame(final);
const b = saveGame(replay);
if (a === b) {
  console.log("DETERMINISM OK: replay of seed + order log reproduces the war exactly");
} else {
  console.error("DETERMINISM FAILED: replay diverged from original run");
  process.exit(1);
}

// --- 3. Save/load round-trip mid-war ---
{
  const engine = new Engine(mapData, factionData);
  const state = newGame(mapData, factionData, seed);
  const plotRng = makePrng(state.seed ^ 0x9e3779b9);
  for (let i = 0; i < 10; i++) {
    const orders = {};
    for (const f of FACTIONS) orders[f] = randomOrders(state, engine.graph, factionData, f, plotRng);
    engine.resolveTurn(state, orders);
  }
  const restored = loadGame(saveGame(state));
  if (saveGame(restored) !== saveGame(state)) {
    console.error("SAVE/LOAD FAILED: round-trip altered state");
    process.exit(1);
  }
  // Restored state must keep playing.
  const orders = {};
  for (const f of FACTIONS) orders[f] = randomOrders(restored, engine.graph, factionData, f, makePrng(1234));
  engine.resolveTurn(restored, orders);
  console.log("SAVE/LOAD OK: mid-war round-trip is lossless and playable");
}

// --- 4. Deterrence rule: foreign fleets can never stand in a home sphere ---
{
  const homes = new Map(mapData.nodes.filter((n) => n.region.endsWith("_HOME")).map((n) => [n.id, n.region]));
  let violations = 0;
  for (const fleet of Object.values(final.fleets)) {
    const region = homes.get(fleet.location);
    if (region && region !== `${fleet.faction}_HOME`) violations++;
  }
  if (violations > 0) {
    console.error(`DETERRENCE FAILED: ${violations} foreign fleet(s) inside a home sphere`);
    process.exit(1);
  }
  console.log("DETERRENCE OK: no foreign fleets in any home sphere");
}
