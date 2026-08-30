// Fleet action trials. Runs point-buy fleets against each other many times and
// reports win rates, so the numbers can be judged rather than guessed at.
//
//   node test/fleet-trial.js                 matrix + shapes + scale sweep
//   node test/fleet-trial.js --battles 300
//   node test/fleet-trial.js --watch EAR KRE one battle, narrated
//   node test/fleet-trial.js --scale 64      matrix at one budget only

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makePrng, seedFromString } from "../src/prng.js";
import { runBattle, buildFleet, deployFleets } from "../src/tactical/resolver.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const TUNING = readJson(join(root, "data", "tactical-tuning.json"));
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];
const NAMES = {
  EAR: "Earth Federation", VRA: "Vraygon Star Realm",
  ZAN: "Zandrax Horde", KRE: "Krelath Empire"
};

// Scenarios run anywhere from a two-point skirmish to a 64-point fleet action.
// Balance has to hold across the range, not just at the reference size.
const SCALES = {
  2:  { frigate: 2 },
  8:  { "light-cruiser": 1, destroyer: 2 },
  16: { "heavy-cruiser": 1, destroyer: 2, frigate: 4 },
  24: { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  32: { battleship: 1, "light-cruiser": 2, destroyer: 2, frigate: 4 },
  64: { battleship: 2, "heavy-cruiser": 2, "light-cruiser": 2, destroyer: 2, frigate: 4 }
};
const STANDARD = SCALES[24];

// Each power has one unique sixth hull. Above a threshold it buys one, paying
// for it out of the common hulls, so the sweep tests the hull rather than
// handing its owner free points.
const SIXTH = {
  EAR: { hull: "command-ship", cost: 8, from: { "light-cruiser": 2 } },
  VRA: { hull: "monitor", cost: 16, from: { battleship: 1 } },
  ZAN: { hull: "corvette", cost: 0.5, from: {} },
  KRE: { hull: "strike-cruiser", cost: 4, from: { "light-cruiser": 1 } }
};

// Build a faction's actual list for a composition: swap in its sixth hull when
// the budget allows, keeping the point total identical.
function compFor(faction, comp) {
  const out = { ...comp };
  const pts = Object.entries(comp).reduce((s, [k, n]) => s + TUNING.hullClasses[k].points * n, 0);
  const spec = SIXTH[faction];
  if (!spec) return out;
  if (faction === "ZAN") {
    // Zandrax trade a frigate for two corvettes wherever they have one.
    if (out.frigate >= 2) { out.frigate -= 2; out.corvette = (out.corvette ?? 0) + 4; }
    return out;
  }
  if (pts < spec.cost * 2) return out; // too small a scenario to justify it
  let ok = true;
  for (const [k, n] of Object.entries(spec.from)) if ((out[k] ?? 0) < n) ok = false;
  if (!ok) return out;
  for (const [k, n] of Object.entries(spec.from)) {
    out[k] -= n;
    if (out[k] <= 0) delete out[k];
  }
  out[spec.hull] = (out[spec.hull] ?? 0) + 1;
  return out;
}

const args = process.argv.slice(2);
const numArg = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const BATTLES = numArg("--battles", 150);

function fight(fa, fb, compA, compB, seed, useSixth = true) {
  const rng = makePrng(seedFromString(seed));
  const A = buildFleet(fa, useSixth ? compFor(fa, compA) : compA, TUNING, LOADOUTS, rng, "A");
  const B = buildFleet(fb, useSixth ? compFor(fb, compB) : compB, TUNING, LOADOUTS, rng, "B");
  deployFleets(A, B, TUNING);
  return runBattle([A, B], TUNING, rng, {});
}

function series(fa, fb, compA = STANDARD, compB = STANDARD, n = BATTLES, tag = "") {
  let winsA = 0, winsB = 0, draws = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    const r = fight(fa, fb, compA, compB, `${tag}${fa}-${fb}-${i}`, tag !== "sh-");
    if (r.victor === "A") winsA++;
    else if (r.victor === "B") winsB++;
    else draws++;
    turns += r.turns;
  }
  return { winsA, winsB, draws, avgTurns: turns / n };
}

// Overall win rate per faction across every pairing at one composition.
function matrix(comp, n, tag) {
  const tally = Object.fromEntries(FACTIONS.map((f) => [f, { w: 0, t: 0 }]));
  const rows = [];
  for (let i = 0; i < FACTIONS.length; i++) {
    for (let j = i + 1; j < FACTIONS.length; j++) {
      const a = FACTIONS[i], b = FACTIONS[j];
      const r = series(a, b, comp, comp, n, tag);
      const total = r.winsA + r.winsB + r.draws;
      tally[a].w += r.winsA; tally[a].t += total;
      tally[b].w += r.winsB; tally[b].t += total;
      rows.push({ a, b, ...r, total });
    }
  }
  const rates = Object.fromEntries(FACTIONS.map((f) => [f, tally[f].w / tally[f].t]));
  return { rows, rates };
}

// --- watch mode ------------------------------------------------------------
if (args.includes("--watch")) {
  const i = args.indexOf("--watch");
  const fa = args[i + 1] ?? "EAR", fb = args[i + 2] ?? "KRE";
  const rng = makePrng(seedFromString(`watch-${fa}-${fb}`));
  const A = buildFleet(fa, STANDARD, TUNING, LOADOUTS, rng, fa);
  const B = buildFleet(fb, STANDARD, TUNING, LOADOUTS, rng, fb);
  deployFleets(A, B, TUNING);
  console.log(`${NAMES[fa]} vs ${NAMES[fb]} — 24 points each\n`);
  const r = runBattle([A, B], TUNING, rng, { log: (m) => console.log("  " + m) });
  console.log(`\nvictor: ${r.victor === "A" ? NAMES[fa] : r.victor === "B" ? NAMES[fb] : "draw"} after ${r.turns} turns`);
  for (const [side, f, fl, st] of [["A", fa, A, r.stats.A], ["B", fb, B, r.stats.B]]) {
    const surv = side === "A" ? r.survivorsA : r.survivorsB;
    console.log(`${f} survivors ${surv}/${fl.length}  hits ${st.hits}/${st.shots}  launches ${st.launches}  internal ${Math.round(st.internal)}  screened ${st.screened}`);
  }
  process.exit(0);
}

// --- single-scale mode -----------------------------------------------------
const onlyScale = numArg("--scale", null);
if (onlyScale) {
  const comp = SCALES[onlyScale];
  if (!comp) { console.error(`no composition for ${onlyScale} points`); process.exit(1); }
  console.log(`Matrix at ${onlyScale} points — ${BATTLES} battles per pairing\n`);
  const { rows, rates } = matrix(comp, BATTLES, `s${onlyScale}-`);
  for (const r of rows) {
    const pct = (n) => `${((n / r.total) * 100).toFixed(0)}%`.padStart(6);
    console.log(`${r.a} v ${r.b}  ${pct(r.winsA)} ${pct(r.winsB)} ${pct(r.draws)} draws   ${r.avgTurns.toFixed(1)} turns`);
  }
  console.log("");
  for (const f of FACTIONS) console.log(`${NAMES[f].padEnd(20)} ${(rates[f] * 100).toFixed(1).padStart(5)}%`);
  process.exit(0);
}

// --- full report -----------------------------------------------------------
console.log(`Fleet action trials — ${BATTLES} battles per pairing`);
console.log(`Reference fleet (24 pts): 1 CA + 2 CL + 2 DD + 4 FF\n`);

const { rows, rates } = matrix(STANDARD, BATTLES, "");
console.log("Pairing        A wins   B wins   draws   avg turns");
console.log("-".repeat(52));
for (const r of rows) {
  const pct = (n) => `${((n / r.total) * 100).toFixed(0)}%`.padStart(6);
  console.log(`${r.a} v ${r.b}   ${pct(r.winsA)}   ${pct(r.winsB)}  ${pct(r.draws)}   ${r.avgTurns.toFixed(1)}`);
}

console.log("\nOverall win rate at 24 points");
console.log("-".repeat(52));
for (const { f, rate } of FACTIONS.map((f) => ({ f, rate: rates[f] })).sort((x, y) => y.rate - x.rate)) {
  console.log(`${NAMES[f].padEnd(20)} ${(rate * 100).toFixed(1).padStart(5)}%  ${"#".repeat(Math.round(rate * 40))}`);
}

// --- scale sweep -----------------------------------------------------------
console.log("\nBalance across scenario size");
console.log("-".repeat(52));
const scaleN = Math.max(40, Math.round(BATTLES / 3));
console.log("points  " + FACTIONS.map((f) => f.padStart(7)).join("") + "   spread");
const sizes = Object.keys(SCALES).map(Number).sort((a, b) => a - b);
for (const pts of sizes) {
  const { rates: r } = matrix(SCALES[pts], scaleN, `s${pts}-`);
  const vals = FACTIONS.map((f) => r[f]);
  const spread = (Math.max(...vals) - Math.min(...vals)) * 100;
  console.log(
    String(pts).padEnd(8) +
    FACTIONS.map((f) => `${(r[f] * 100).toFixed(0)}%`.padStart(7)).join("") +
    `   ${spread.toFixed(0)}pp`
  );
}
console.log(`(${scaleN} battles per pairing at each size)`);

// --- concentration of force ------------------------------------------------
console.log("\nConcentration of force — equal points, different shapes");
console.log("-".repeat(52));
const SHAPES = {
  "1 BB": { battleship: 1 }, "2 CA": { "heavy-cruiser": 2 },
  "4 CL": { "light-cruiser": 4 }, "8 DD": { destroyer: 8 }, "16 FF": { frigate: 16 }
};
const shapeNames = Object.keys(SHAPES);
console.log("(Earth Federation on both sides, 16 points each)\n");
console.log("            " + shapeNames.map((s) => s.padStart(7)).join(""));
for (const a of shapeNames) {
  const row = shapeNames.map((b) => {
    if (a === b) return "   -   ";
    const r = series("EAR", "EAR", SHAPES[a], SHAPES[b], Math.max(50, Math.round(BATTLES / 3)), "sh-");
    const n = r.winsA + r.winsB + r.draws;
    return `${((r.winsA / n) * 100).toFixed(0)}%`.padStart(7);
  });
  console.log(a.padEnd(12) + row.join(""));
}
console.log("\nRow beats column, as a percentage. 16 points a side throughout.");
