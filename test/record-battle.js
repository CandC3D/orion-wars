// Record one deterministic tactical battle for the static arena viewer.
//
//   node test/record-battle.js --a EAR --b KRE --points 24 \
//     --seed mybattle --out arena/replay.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { makePrng, seedFromString } from "../src/prng.js";
import { buildFleet, deployFleets, runBattle } from "../src/tactical/resolver.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^ï»¿/, ""));
const TUNING = readJson(join(root, "data", "tactical-tuning.json"));
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];
const SCALES = {
  2:  { frigate: 2 },
  8:  { "light-cruiser": 1, destroyer: 2 },
  16: { "heavy-cruiser": 1, destroyer: 2, frigate: 4 },
  24: { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  32: { battleship: 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  64: { battleship: 2, "heavy-cruiser": 2, "light-cruiser": 2, destroyer: 2, frigate: 4 }
};
const SIXTH = {
  EAR: { hull: "command-ship", cost: 8, from: { "light-cruiser": 2 } },
  VRA: { hull: "monitor", cost: 16, from: { battleship: 1 } },
  ZAN: { hull: "corvette", cost: 0.5, from: {} },
  KRE: { hull: "strike-cruiser", cost: 4, from: { "light-cruiser": 1 } }
};

function compFor(faction, comp) {
  const out = { ...comp };
  const pts = Object.entries(comp).reduce(
    (sum, [className, count]) => sum + TUNING.hullClasses[className].points * count, 0
  );
  const spec = SIXTH[faction];
  if (!spec) return out;
  if (faction === "ZAN") {
    if (out.frigate >= 2) {
      out.frigate -= 2;
      out.corvette = (out.corvette ?? 0) + 4;
    }
    return out;
  }
  if (pts < spec.cost * 2) return out;
  if (Object.entries(spec.from).some(([name, count]) => (out[name] ?? 0) < count)) return out;
  for (const [name, count] of Object.entries(spec.from)) {
    out[name] -= count;
    if (out[name] <= 0) delete out[name];
  }
  out[spec.hull] = (out[spec.hull] ?? 0) + 1;
  return out;
}

const args = process.argv.slice(2);
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

const factionA = value("--a", "EAR").toUpperCase();
const factionB = value("--b", "KRE").toUpperCase();
const points = Number(value("--points", "24"));
const seed = value("--seed", "mybattle");
const output = resolve(process.cwd(), value("--out", "arena/replay.json"));

if (!FACTIONS.includes(factionA) || !FACTIONS.includes(factionB)) {
  throw new Error(`--a and --b must be one of: ${FACTIONS.join(", ")}`);
}
if (!SCALES[points]) throw new Error(`--points must be one of: ${Object.keys(SCALES).join(", ")}`);

const compA = compFor(factionA, SCALES[points]);
const compB = compFor(factionB, SCALES[points]);
const rng = makePrng(seedFromString(seed));
const fleetA = buildFleet(factionA, compA, TUNING, LOADOUTS, rng, "A");
const fleetB = buildFleet(factionB, compB, TUNING, LOADOUTS, rng, "B");
deployFleets(fleetA, fleetB, TUNING);

const rounds = [];
const log = [];
const shots = [];
let logTurn = 1;
let logRound = 1;

function snapshot(ship) {
  return {
    id: ship.id,
    faction: ship.faction,
    className: ship.className,
    points: ship.points,
    pos: { q: ship.pos.q, r: ship.pos.r },
    facing: ship.facing,
    cloaked: ship.cloaked,
    detected: ship.detected,
    destroyed: ship.destroyed,
    superstructure: ship.superstructure,
    superstructureMax: ship.superstructureMax,
    power: ship.power,
    shieldCap: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldCap[face]])),
    shieldDown: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldDown[face]])),
    magazine: ship.magazine,
    mounts: ship.mounts.map((mount) => ({ id: mount.id, inop: mount.inop }))
  };
}

rounds.push({ turn: 0, round: 0, ships: [fleetA, fleetB].flat().map(snapshot) });

const result = runBattle([fleetA, fleetB], TUNING, rng, {
  onShot(event) {
    shots.push(event);
  },
  log(message) {
    log.push({ turn: logTurn, round: logRound, message });
  },
  onRound(turn, round, fleets) {
    rounds.push({ turn, round, ships: fleets.flat().map(snapshot) });
    if (round < TUNING.battle.roundsPerTurn) {
      logTurn = turn;
      logRound = round + 1;
    } else {
      logTurn = turn + 1;
      logRound = 1;
    }
  }
});

const replay = {
  meta: {
    version: 2,
    factions: { A: factionA, B: factionB },
    comps: { A: compA, B: compB },
    seed,
    tuning: {
      startDistanceHexes: TUNING.battle.startDistanceHexes,
      mapRadiusHexes: TUNING.battle.mapRadiusHexes,
      roundsPerTurn: TUNING.battle.roundsPerTurn
    }
  },
  rounds,
  shots,
  log,
  result
};

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(replay, null, 2) + "\n", "utf8");
console.log(`Recorded ${factionA} vs ${factionB} at ${points} points to ${output}`);
