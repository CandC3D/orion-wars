// Tuning experiment runner: patch tuning values in memory, then print the
// balance-by-size sweep and the KRE unique-hull buy delta together.
//
//   node test/xp.js --battles 150
//   node test/xp.js --set strikeCraft.replenishPerTurn=0.5 --set strikeCraft.standoffRangeHexes=6
//   node test/xp.js --json '{"hullClasses.carrier.hangar.bomber.strength":3}'

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
const SIZES = (strArg("--sizes", Object.keys(SCALES).join(","))).split(",").map(Number);
const SEEDTAG = strArg("--seedtag", "");
const NOBUY = args.includes("--nobuy");
const NOSWEEP = args.includes("--nosweep");

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
const patches = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--set") {
    const [p, v] = args[i + 1].split("=");
    let val;
    try { val = JSON.parse(v); } catch { val = v; }
    setPath(TUNING, p, val); patches.push(`${p}=${JSON.stringify(val)}`);
  }
  if (args[i] === "--json") {
    for (const [p, v] of Object.entries(JSON.parse(args[i + 1]))) {
      setPath(TUNING, p, v); patches.push(`${p}=${JSON.stringify(v)}`);
    }
  }
}
if (patches.length) console.log("patches: " + patches.join("  "));
console.log(`battles/cell ${N}` + (process.env.KRE_SIXTH ? `   KRE_SIXTH=${process.env.KRE_SIXTH}` : ""));

function rate(fa, fb, comp, n, size, plain) {
  let wa = 0, wb = 0;
  for (let i = 0; i < n; i++) {
    const rng = makePrng(seedFromString(`${SEEDTAG}s${size}-${fa}-${fb}-${i}`));
    const A = buildFleet(fa, compFor(fa, comp, TUNING, plain), TUNING, LOADOUTS, rng, "A");
    const B = buildFleet(fb, compFor(fb, comp, TUNING), TUNING, LOADOUTS, rng, "B");
    deployFleets(A, B, TUNING);
    const r = runBattle([A, B], TUNING, rng, {});
    if (r.victor === "A") wa++; else if (r.victor === "B") wb++;
  }
  return { wa, wb, n };
}

if (!NOSWEEP) {
  console.log("\nBalance across scenario size");
  console.log("points  " + FACTIONS.map((f) => f.padStart(7)).join("") + "   spread   worst");
  const detail = args.includes("--detail");
  for (const size of SIZES) {
    const comp = SCALES[size];
    const tally = Object.fromEntries(FACTIONS.map((f) => [f, { w: 0, t: 0 }]));
    const pair = [];
    for (let i = 0; i < FACTIONS.length; i++) {
      for (let j = i + 1; j < FACTIONS.length; j++) {
        const a = FACTIONS[i], b = FACTIONS[j];
        const r = rate(a, b, comp, N, size, null);
        tally[a].w += r.wa; tally[a].t += r.n;
        tally[b].w += r.wb; tally[b].t += r.n;
        pair.push(`${a}/${b} ${(r.wa / r.n * 100).toFixed(0)}`);
      }
    }
    if (detail) console.log(`  [${size}] ` + pair.join("  "));
    const vals = FACTIONS.map((f) => tally[f].w / tally[f].t);
    const spread = (Math.max(...vals) - Math.min(...vals)) * 100;
    const worst = Math.max(...vals.map((v) => Math.max(0, 35 - v * 100, v * 100 - 65)));
    console.log(String(size).padEnd(8) +
      FACTIONS.map((f) => `${(tally[f].w / tally[f].t * 100).toFixed(0)}%`.padStart(7)).join("") +
      `   ${spread.toFixed(0)}pp` + `   ${worst > 0 ? worst.toFixed(0) + "pp" : "-"}`.padStart(9));
  }
}

if (!NOBUY) {
  console.log("\nKRE unique-hull buy delta (with / plain)");
  console.log("size  hull            " + FACTIONS.filter((f) => f !== "KRE").map((f) => `vs ${f}`.padStart(15)).join("") + "   overall");
  for (const size of SIZES) {
    const comp = SCALES[size];
    if (!comp) continue;
    const withSix = compFor("KRE", comp, TUNING);
    const plainList = compFor("KRE", comp, TUNING, ["KRE"]);
    if (JSON.stringify(withSix) === JSON.stringify(plainList)) {
      console.log(String(size).padEnd(6) + "(none fielded)"); continue;
    }
    const uniq = Object.keys(withSix).find((k) => !(k in plainList));
    const cells = []; let sw = 0, sp = 0, k = 0;
    for (const fb of FACTIONS) {
      if (fb === "KRE") continue;
      const a = rate("KRE", fb, comp, N, size, null);
      const b = rate("KRE", fb, comp, N, size, ["KRE"]);
      const ra = a.wa / a.n, rb = b.wa / b.n;
      sw += ra; sp += rb; k++;
      cells.push(`${(ra * 100).toFixed(0)}/${(rb * 100).toFixed(0)} ${(ra - rb >= 0 ? "+" : "")}${((ra - rb) * 100).toFixed(0)}`.padStart(15));
    }
    console.log(String(size).padEnd(6) + String(uniq).padEnd(16) + cells.join("") +
      `   ${(((sw - sp) / k) * 100 >= 0 ? "+" : "")}${(((sw - sp) / k) * 100).toFixed(1)}pp`);
  }
}
