// Instrumentation probe for the carrier / strike-craft system.
//   node test/probe.js --size 24 --battles 150
// Reports, for every pairing that contains a carrier fleet:
//   where strike damage lands, what kills craft, how the deck cycles,
//   where the carrier sits, and how the warp interacts with all of it.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makePrng, seedFromString } from "../src/prng.js";
import { runBattle, buildFleet, deployFleets } from "../src/tactical/resolver.js";
import { distance } from "../src/tactical/hex.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const TUNING = readJson(join(root, "data", "tactical-tuning.json"));
const LOADOUTS = readJson(join(root, "data", "loadouts.json"));

import { SCALES, compFor as comp6 } from "./comp.js";
const FACTIONS = ["EAR", "VRA", "ZAN", "KRE"];
const compFor = (faction, comp) => comp6(faction, comp, TUNING);

const args = process.argv.slice(2);
const numArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };
const strArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
// in-memory tuning patches, same syntax as test/xp.js --json
{
  const i = args.indexOf("--json");
  if (i >= 0) {
    for (const [p, v] of Object.entries(JSON.parse(args[i + 1]))) {
      const parts = p.split(".");
      let cur = TUNING;
      for (let k = 0; k < parts.length - 1; k++) cur = cur[parts[k]];
      cur[parts[parts.length - 1]] = v;
    }
  }
}
const SIZE = numArg("--size", 24);
const N = numArg("--battles", 150);
const ONLY = strArg("--vs", null);

const blankAcc = () => ({
  battles: 0, wins: 0,
  strikeDmg: 0, strikeDmgByClass: {}, sorties: 0, hits: 0, craftFlown: 0,
  lostCAP: 0, lostPD: 0, lostWithCarrier: 0,
  carrierDied: 0, carrierDeathTurn: 0, turns: 0,
  gapSum: 0, gapN: 0, gapMin: 99,
  launchedTurns: 0, deckTurns: 0,
  wingAliveEnd: 0, wingStartTotal: 0, wingEndTotal: 0,
  warps: 0, strikeTurnsWithCraft: 0,
  beamDmg: 0, beamShots: 0, beamHits: 0,
  totalDmgKRE: 0, totalDmgFoe: 0,
  cGapSum: 0, cGapN: 0,          // gap during CONTACT turns only
  behindSum: 0, behindN: 0,      // how far the carrier trails its own line
  inRadiusTurns: 0
});

function probe(fa, fb, comp, n) {
  const acc = blankAcc();
  for (let i = 0; i < n; i++) {
    const seed = `s${SIZE}-${fa}-${fb}-${i}`;
    const rng = makePrng(seedFromString(seed));
    const A = buildFleet(fa, compFor(fa, comp), TUNING, LOADOUTS, rng, "A");
    const B = buildFleet(fb, compFor(fb, comp), TUNING, LOADOUTS, rng, "B");
    deployFleets(A, B, TUNING);
    const byId = new Map();
    for (const s of [...A, ...B]) byId.set(s.id, s);
    const carriers = [...A, ...B].filter((s) => s.squadrons);
    for (const c of carriers) acc.wingStartTotal += c.squadrons.reduce((a, q) => a + q.strength, 0);

    let carrierDeadTurn = null;
    const logLines = [];
    const r = runBattle([A, B], TUNING, rng, {
      log: (m) => logLines.push(m),
      onShot: (e) => {
        if (e.kind === "strike") {
          acc.sorties++;
          acc.hits += e.hits ?? 0;
          acc.craftFlown += e.strength ?? 0;
          acc.strikeDmg += e.damage ?? 0;
          const t = byId.get(e.targetId);
          const cls = t ? t.className : "?";
          acc.strikeDmgByClass[cls] = (acc.strikeDmgByClass[cls] ?? 0) + (e.damage ?? 0);
        }
      },
      onRound: (turn, round, fleets) => {
        if (round !== 1) return;
        for (const c of carriers) {
          if (c.destroyed) { if (carrierDeadTurn === null) carrierDeadTurn = turn; continue; }
          const foe = c.side === "A" ? fleets[1] : fleets[0];
          const alive = foe.filter((s) => !s.destroyed);
          if (!alive.length) continue;
          let best = Infinity;
          for (const s of alive) best = Math.min(best, distance(c.pos, s.pos));
          acc.gapSum += best; acc.gapN++; acc.gapMin = Math.min(acc.gapMin, best);
          const air = c.squadrons.reduce((a, q) => a + (q.launched ? q.strength : 0), 0);
          acc.deckTurns++;
          if (air > 0) acc.launchedTurns++;
          if (c.squadrons.some((q) => q.strength > 0)) acc.strikeTurnsWithCraft++;
          // contact-phase geometry: only once someone is inside strike radius
          if (best <= TUNING.strikeCraft.strikeRadiusHexes) {
            acc.cGapSum += best; acc.cGapN++; acc.inRadiusTurns++;
            const own = (c.side === "A" ? fleets[0] : fleets[1]).filter((s) => !s.destroyed && s !== c);
            if (own.length) {
              const cen = {
                q: Math.round(own.reduce((a, s) => a + s.pos.q, 0) / own.length),
                r: Math.round(own.reduce((a, s) => a + s.pos.r, 0) / own.length)
              };
              let fbest = Infinity;
              for (const s of alive) fbest = Math.min(fbest, distance(cen, s.pos));
              acc.behindSum += (best - fbest); acc.behindN++;
            }
          }
        }
      }
    });
    for (const m of logLines) {
      let mm = m.match(/loses (\d+) craft on the run in \((.*)\)/);
      if (mm) {
        const parts = mm[2];
        const a = parts.match(/(\d+) to interceptors/);
        const b = parts.match(/(\d+) to point defence/);
        if (a) acc.lostCAP += Number(a[1]);
        if (b) acc.lostPD += Number(b[1]);
      }
      mm = m.match(/loses (\d+) to escorting fire/);
      if (mm) acc.lostCAP += Number(mm[1]);
      mm = m.match(/goes down with (\d+) craft/);
      if (mm) acc.lostWithCarrier += Number(mm[1]);
      if (/ warps in behind /.test(m)) acc.warps++;
    }
    for (const c of carriers) {
      acc.wingEndTotal += c.squadrons.reduce((a, q) => a + q.strength, 0);
      if (c.destroyed) { acc.carrierDied++; acc.carrierDeathTurn += (carrierDeadTurn ?? r.turns); }
    }
    acc.battles++;
    acc.turns += r.turns;
    if (r.victor === "A") acc.wins++;
    acc.beamShots += r.stats.A.shots; acc.beamHits += r.stats.A.hits;
    acc.totalDmgKRE += r.stats.A.damage; acc.totalDmgFoe += r.stats.B.damage;
  }
  return acc;
}

// which side is A in each report row
const comp = SCALES[SIZE];
console.log(`=== probe at ${SIZE} points, ${N} battles per pairing ===`);
for (const f of FACTIONS) {
  const c = compFor(f, comp);
  console.log(`  ${f}: ${JSON.stringify(c)}`);
}
console.log("");

for (const fb of FACTIONS) {
  if (fb === "KRE") continue;
  if (ONLY && fb !== ONLY) continue;
  const acc = probe("KRE", fb, comp, N);
  const b = acc.battles;
  const carriers = Object.keys(compFor("KRE", comp)).includes("carrier") ? 1 : 0;
  console.log(`KRE vs ${fb}   win ${(acc.wins / b * 100).toFixed(1)}%   turns ${(acc.turns / b).toFixed(1)}`);
  if (!carriers) { console.log("  (no carrier fielded)\n"); continue; }
  console.log(`  sorties/battle ${(acc.sorties / b).toFixed(2)}  craft flown ${(acc.craftFlown / b).toFixed(1)}  hits ${(acc.hits / b).toFixed(1)}  strike dmg ${(acc.strikeDmg / b).toFixed(1)}`);
  const byc = Object.entries(acc.strikeDmgByClass).sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k} ${(v / b).toFixed(1)}`).join("  ");
  console.log(`  strike dmg by target: ${byc}`);
  console.log(`  craft lost: CAP ${(acc.lostCAP / b).toFixed(2)}  PD ${(acc.lostPD / b).toFixed(2)}  with carrier ${(acc.lostWithCarrier / b).toFixed(2)}`);
  console.log(`  wing: start ${(acc.wingStartTotal / b).toFixed(1)} end ${(acc.wingEndTotal / b).toFixed(1)}`);
  console.log(`  carrier died ${(acc.carrierDied / b * 100).toFixed(0)}% of battles, mean turn ${acc.carrierDied ? (acc.carrierDeathTurn / acc.carrierDied).toFixed(1) : "-"}`);
  console.log(`  carrier gap to nearest enemy: mean ${(acc.gapSum / Math.max(1, acc.gapN)).toFixed(1)}  min seen ${acc.gapMin}`);
  console.log(`  in-contact gap (enemy inside strike radius): mean ${(acc.cGapSum / Math.max(1, acc.cGapN)).toFixed(1)} over ${(acc.inRadiusTurns / b).toFixed(1)} turns/battle; carrier trails own line by ${(acc.behindSum / Math.max(1, acc.behindN)).toFixed(1)} hexes`);
  console.log(`  damage dealt: KRE ${(acc.totalDmgKRE / b).toFixed(0)} of which strike ${(acc.strikeDmg / Math.max(1, acc.totalDmgKRE) * 100).toFixed(0)}%; ${fb} ${(acc.totalDmgFoe / b).toFixed(0)}`);
  console.log(`  deck: airborne on ${(acc.launchedTurns / Math.max(1, acc.deckTurns) * 100).toFixed(0)}% of carrier-turns; craft in hand on ${(acc.strikeTurnsWithCraft / Math.max(1, acc.deckTurns) * 100).toFixed(0)}%`);
  console.log(`  KRE warp jumps/battle ${(acc.warps / b).toFixed(2)}`);
  console.log("");
}
