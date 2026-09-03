// Record one deterministic tactical battle for the static arena viewer.
//
//   node test/record-battle.js --a EAR --b KRE --points 24 \
//     --seed mybattle --out arena/replay.json

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { recordFleetBattle, recordScenario } from "../arena/record.js";
// The scenario table and the sixth-hull fielding policy live in ONE place
// (test/comp.js). The recorder used to keep a private copy and it went stale:
// replays were still fielding the retired Earth command ship and the Krelath
// strike cruiser at every size, so no replay ever contained a dreadnought or a
// carrier. Import, never copy.
import { SCALES, compFor } from "./comp.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8").replace(/^ï»¿/, ""));
const TUNING = readJson(join(root, "data", "tactical-tuning.json"));
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];

const args = process.argv.slice(2);
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

const factionA = value("--a", "EAR").toUpperCase();
const factionB = value("--b", "KRE").toUpperCase();
const points = Number(value("--points", "24"));
const seed = value("--seed", "mybattle");
const scenarioPath = value("--scenario", null);
const output = resolve(process.cwd(), value("--out", "arena/replay.json"));

if (!scenarioPath && (!FACTIONS.includes(factionA) || !FACTIONS.includes(factionB))) {
  throw new Error(`--a and --b must be one of: ${FACTIONS.join(", ")}`);
}
if (!scenarioPath && !SCALES[points]) throw new Error(`--points must be one of: ${Object.keys(SCALES).join(", ")}`);

let replay;
let description;
if (scenarioPath) {
  const scenarioFile = resolve(process.cwd(), scenarioPath);
  const scenario = readJson(scenarioFile);
  replay = recordScenario(scenario, TUNING, LOADOUTS);
  description = `scenario ${scenario.name || scenarioFile}`;
} else {
  const compA = compFor(factionA, SCALES[points], TUNING);
  const compB = compFor(factionB, SCALES[points], TUNING);
  replay = recordFleetBattle({ factionA, factionB, compA, compB, seed, tuning: TUNING, loadouts: LOADOUTS });
  description = `${factionA} vs ${factionB} at ${points} points`;
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(replay, null, 2) + "\n", "utf8");
console.log(`Recorded ${description} to ${output}`);
