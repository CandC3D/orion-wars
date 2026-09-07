// Batch tuning scan: one line per candidate configuration.
//   node test/scan.js candidates.json [--battles 150]
// candidates.json is [{ "label": "...", "set": { "path.to.value": v, ... } }, ...]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makePrng, seedFromString } from "../src/prng.js";
import { runBattle, buildFleet, deployFleets } from "../src/tactical/resolver.js";
import { SCALES, compFor } from "./comp.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const BASE = readFileSync(join(root, "data", "tactical-tuning.json"), "utf8").replace(/^﻿/, "");
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];
const args = process.argv.slice(2);
const numArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const N = numArg("--battles", 150);
const CANDS = readJson(args[0]);
const ALL_SIZES = Object.keys(SCALES).map(Number).sort((a, b) => a - b);
const BUY_SIZES = ALL_SIZES.filter((size) => size >= 52);

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function run(T, fa, fb, comp, size, plain) {
  let wa = 0, wb = 0;
  for (let i = 0; i < N; i++) {
    const seed = seedFromString(`s${size}-${fa}-${fb}-${i}`);
    for (const reversed of [false, true]) {
      const rng = makePrng(seed);
      const A = buildFleet(reversed ? fb : fa, reversed ? compFor(fb, comp, T) : compFor(fa, comp, T, plain), T, LOADOUTS, rng, "A");
      const B = buildFleet(reversed ? fa : fb, reversed ? compFor(fa, comp, T, plain) : compFor(fb, comp, T), T, LOADOUTS, rng, "B");
      deployFleets(A, B, T);
      const r = runBattle([A, B], T, rng, {});
      const victor = reversed ? (r.victor === "A" ? "B" : r.victor === "B" ? "A" : null) : r.victor;
      if (victor === "A") wa++; else if (victor === "B") wb++;
    }
  }
  return { wa, wb, n: N * 2 };
}

console.log(`scan — ${N} mirrored pairs per cell`);
console.log("label".padEnd(34) + BUY_SIZES.map((s) => `buy${s}`.padStart(8)).join("") + "  |  worst-miss   KRE " + BUY_SIZES.join("/") + "   band");
console.log("-".repeat(112));
for (const c of CANDS) {
  const T = JSON.parse(BASE);
  for (const [p, v] of Object.entries(c.set ?? {})) setPath(T, p, v);

  const buys = [];
  for (const size of BUY_SIZES) {
    const comp = SCALES[size];
    let sw = 0, sp = 0, k = 0;
    for (const fb of FACTIONS) {
      if (fb === "KRE") continue;
      const withHull = run(T, "KRE", fb, comp, size, null);
      const plain = run(T, "KRE", fb, comp, size, ["KRE"]);
      sw += withHull.wa / withHull.n;
      sp += plain.wa / plain.n;
      k++;
    }
    buys.push(((sw - sp) / k) * 100);
  }

  let worst = 0, offBand = 0;
  const kre = {};
  for (const size of ALL_SIZES) {
    const comp = SCALES[size];
    const tally = Object.fromEntries(FACTIONS.map((f) => [f, { w: 0, t: 0 }]));
    for (let i = 0; i < FACTIONS.length; i++) {
      for (let j = i + 1; j < FACTIONS.length; j++) {
        const a = FACTIONS[i], b = FACTIONS[j];
        const r = run(T, a, b, comp, size, null);
        tally[a].w += r.wa; tally[a].t += r.n;
        tally[b].w += r.wb; tally[b].t += r.n;
      }
    }
    for (const f of FACTIONS) {
      const v = tally[f].w / tally[f].t * 100;
      if (f === "KRE") kre[size] = v;
      const miss = Math.max(0, 35 - v, v - 65);
      if (miss > 0) offBand++;
      worst = Math.max(worst, miss);
    }
  }
  console.log(c.label.padEnd(34) +
    buys.map((b) => `${b >= 0 ? "+" : ""}${b.toFixed(1)}`.padStart(7)).join(" ") +
    `  |  ${worst.toFixed(0)}pp`.padStart(14) +
    `   ${BUY_SIZES.map((s) => kre[s].toFixed(0)).join("/")}`.padEnd(15) +
    `  ${offBand} off`);
}
