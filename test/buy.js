// Is the unique hull worth buying? Runs a faction with its unique hull and
// again with a plain common-hull list of the same point value, against the
// same three opponents on the same seeds, and reports the difference.
//
//   node test/buy.js --battles 150            KRE at every size
//   node test/buy.js --f VRA --battles 300
//   KRE_SIXTH=carrier node test/buy.js        against the old carrier-only policy

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makePrng, seedFromString } from "../src/prng.js";
import { runBattle, buildFleet, deployFleets } from "../src/tactical/resolver.js";
import { SCALES, compFor } from "./comp.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const TUNING = readJson(join(root, "data", "tactical-tuning.json"));
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];
const args = process.argv.slice(2);
const numArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const strArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const N = numArg("--battles", 150);
const ME = strArg("--f", "KRE");
const SIZES = (strArg("--sizes", Object.keys(SCALES).join(","))).split(",").map(Number);

function rate(fa, fb, comp, n, size, plain) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const rng = makePrng(seedFromString(`s${size}-${fa}-${fb}-${i}`));
    const A = buildFleet(fa, compFor(fa, comp, TUNING, plain), TUNING, LOADOUTS, rng, "A");
    const B = buildFleet(fb, compFor(fb, comp, TUNING), TUNING, LOADOUTS, rng, "B");
    deployFleets(A, B, TUNING);
    const r = runBattle([A, B], TUNING, rng, {});
    if (r.victor === "A") w++;
  }
  return w / n;
}

console.log(`${ME} unique-hull buy delta — ${N} battles per cell`);
console.log("size  list                                       " +
  FACTIONS.filter((f) => f !== ME).map((f) => `vs ${f}`.padStart(16)).join("") + "   overall");
console.log("-".repeat(110));
for (const size of SIZES) {
  const comp = SCALES[size];
  if (!comp) continue;
  const withSix = compFor(ME, comp, TUNING);
  const plainList = compFor(ME, comp, TUNING, [ME]);
  const same = JSON.stringify(withSix) === JSON.stringify(plainList);
  const cells = [];
  let sw = 0, sp = 0, k = 0;
  for (const fb of FACTIONS) {
    if (fb === ME) continue;
    const a = rate(ME, fb, comp, N, size, null);
    const b = same ? a : rate(ME, fb, comp, N, size, [ME]);
    sw += a; sp += b; k++;
    cells.push(`${(a * 100).toFixed(0)}/${(b * 100).toFixed(0)} ${(a - b >= 0 ? "+" : "")}${((a - b) * 100).toFixed(0)}pp`.padStart(16));
  }
  const label = same ? "(none fielded)" : Object.entries(withSix).map(([x, y]) => `${y}x${x}`).join(" ");
  console.log(String(size).padEnd(6) + label.padEnd(43) + cells.join("") +
    `   ${(((sw - sp) / k) * 100 >= 0 ? "+" : "")}${(((sw - sp) / k) * 100).toFixed(1)}pp`);
}
console.log("\nCells read: with-unique-hull% / plain% delta. Opponents always field their own.");
