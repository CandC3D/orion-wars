// Terrain semantics check: moons/planets/large asteroids impassable and
// fire-blocking; asteroid fields passable at a cost and fire-blocking in,
// out and through. Run: node test/terrain-check.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makePrng, seedFromString } from "../src/prng.js";
import { runBattle, buildScenario } from "../src/tactical/resolver.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const T = JSON.parse(readFileSync(join(root, "data", "tactical-tuning.json"), "utf8"));
const L = JSON.parse(readFileSync(join(root, "data", "loadouts.json"), "utf8"));
const assert = (c, m) => { if (!c) { console.error("FAIL: " + m); process.exitCode = 1; } else console.log("ok: " + m); };

const duel = (terrain, aPos, bPos, freeze = true, foe = "ZAN") => {
  const sc = { name: "t", map: { widthHexes: 40, heightHexes: 20 }, terrain,
    sides: [{ faction: "EAR", ships: [{ className: "frigate", ...aPos, facing: 0 }] },
            { faction: foe, ships: [{ className: "frigate", ...bPos, facing: 3 }] }] };
  const b = buildScenario(sc, T, L, makePrng(seedFromString("t")));
  if (freeze) for (const s of b.fleets.flat()) s.movementPointRatio = 999;
  const r = runBattle(b.fleets, b.tuning, makePrng(seedFromString("t")), { terrain: b.terrain });
  return { shots: r.stats.A.shots + r.stats.B.shots, shotsA: r.stats.A.shots, shotsB: r.stats.B.shots, fleets: b.fleets };
};

// Fire through a field between two ships: blocked.
assert(duel([{ type: "asteroids", q: 0, r: 0 }], { q: -3, r: 0 }, { q: 3, r: 0 }).shots === 0, "field between ships blocks fire through");
// A ship inside a field: cannot shoot out or be shot (in and out).
assert(duel([{ type: "asteroids", q: -3, r: 0 }], { q: -3, r: 0 }, { q: 3, r: 0 }).shots === 0, "ship inside a field: fire blocked in and out");
// Same geometry, no terrain: fire happens.
assert(duel([], { q: -3, r: 0 }, { q: 3, r: 0 }).shots > 0, "clear space: fire happens");
// Large asteroid blocks fire through, like a moon.
assert(duel([{ type: "asteroid", q: 0, r: 0 }], { q: -3, r: 0 }, { q: 3, r: 0 }).shots === 0, "large asteroid blocks fire through");
// Large asteroid is impassable: placement refused.
let refused = false;
try { buildScenario({ name: "x", map: { widthHexes: 40, heightHexes: 20 }, terrain: [{ type: "asteroid", q: 0, r: 0 }],
  sides: [{ faction: "EAR", ships: [{ className: "frigate", q: 0, r: 0, facing: 0 }] }, { faction: "ZAN", ships: [{ className: "frigate", q: 5, r: 0, facing: 3 }] }] }, T, L, makePrng(1)); }
catch (e) { refused = true; }
assert(refused, "large asteroid refuses placement");
// A ship MAY be placed in a field.
let placed = true;
try { buildScenario({ name: "y", map: { widthHexes: 40, heightHexes: 20 }, terrain: [{ type: "asteroids", q: 0, r: 0 }],
  sides: [{ faction: "EAR", ships: [{ className: "frigate", q: 0, r: 0, facing: 0 }] }, { faction: "ZAN", ships: [{ className: "frigate", q: 5, r: 0, facing: 3 }] }] }, T, L, makePrng(1)); }
catch (e) { placed = false; }
assert(placed, "asteroid field accepts placement");

// Slowing: one frigate advancing east for one round, clear vs through a 3-hex field.
const advance = (terrain) => {
  const sc = { name: "s", map: { widthHexes: 40, heightHexes: 20 }, terrain,
    sides: [{ faction: "EAR", ships: [{ className: "frigate", q: -4, r: 0, facing: 0 }] },
            { faction: "ZAN", ships: [{ className: "frigate", q: 14, r: 0, facing: 3 }] }] };
  const b = buildScenario(sc, T, L, makePrng(seedFromString("s")));
  b.fleets[1][0].movementPointRatio = 999;
  const a = b.fleets[0][0]; const p0 = a.power; let after = null;
  runBattle(b.fleets, b.tuning, makePrng(seedFromString("s")), { terrain: b.terrain, maxTurns: 1,
    onRound: (t, rd, fl) => { if (rd === 1 && !after) after = { q: fl[0][0].pos.q, power: fl[0][0].power }; } });
  return { moved: after.q + 4, spent: p0 - after.power };
};
const clear = advance([]);
const field = advance([{ type: "asteroids", q: -3, r: 0 }, { type: "asteroids", q: -2, r: 0 }, { type: "asteroids", q: -1, r: 0 }]);
console.log(`round 1: clear ${clear.moved} hexes for ${clear.spent.toFixed(1)} power | field ${field.moved} hexes for ${field.spent.toFixed(1)} power`);
assert(field.moved < clear.moved || field.spent > clear.spent, "asteroid field slows travel");

// Determinism with every terrain type present.
const lines = [[], []];
for (const arr of lines) {
  const sc = { name: "d", map: { widthHexes: 72, heightHexes: 40 },
    terrain: [{ type: "planet", q: 0, r: 0 }, { type: "moon", q: 6, r: -4 }, { type: "asteroid", q: -6, r: 4 }, { type: "asteroids", q: 3, r: 3 }, { type: "asteroids", q: -3, r: -3 }],
    sides: [{ faction: "EAR", ships: [{ className: "light-cruiser" }, { className: "destroyer" }, { className: "frigate" }] },
            { faction: "KRE", ships: [{ className: "light-cruiser" }, { className: "destroyer" }, { className: "frigate" }] }] };
  const b = buildScenario(sc, T, L, makePrng(seedFromString("d")));
  runBattle(b.fleets, b.tuning, makePrng(seedFromString("d")), { terrain: b.terrain, log: (m) => arr.push(m) });
}
assert(JSON.stringify(lines[0]) === JSON.stringify(lines[1]), "deterministic with all terrain types");

// Nebula (Mutara rules): visibility, penalty, shields useless, fire not blocked.
const neb6 = duel([{ type: "nebula", q: 3, r: 0 }], { q: -3, r: 0 }, { q: 3, r: 0 }, true, "VRA"); // not Zandrax: the burst would carry it out of the fog
assert(neb6.shots === 0, "ship in a nebula cannot be engaged from 6 hexes (visibility 3)");
const neb2 = duel([{ type: "nebula", q: 2, r: 0 }], { q: 0, r: 0 }, { q: 2, r: 0 }, true, "VRA");
assert(neb2.shots > 0, "ship in a nebula can be engaged from 2 hexes (fire not blocked)");
const through = duel([{ type: "nebula", q: 0, r: 0 }], { q: -3, r: 0 }, { q: 3, r: 0 });
assert(through.shots === 0, "fire from outside cannot cross a nebula (decoheres after the first hex)");
// From outside, the first fog hex is reachable; the second is not.
const edge = duel([{ type: "nebula", q: 2, r: 0 }, { type: "nebula", q: 3, r: 0 }], { q: 0, r: 0 }, { q: 2, r: 0 }, true, "VRA");
assert(edge.shots > 0, "from outside, a target in the first fog hex can be engaged");
const deep = duel([{ type: "nebula", q: 2, r: 0 }, { type: "nebula", q: 3, r: 0 }], { q: 0, r: 0 }, { q: 3, r: 0 }, true, "VRA");
assert(deep.shotsA === 0, "from outside, a target in the second fog hex cannot be engaged (the fogged ship may still fire out within visibility)");
// Shields useless: a frigate in the fog hit by a Zandrax frigate at 2 hexes takes internal damage
// on its first hit, where the same frigate in clear space would first lose shield.
const shieldTest = (terrain) => {
  const sc = { name: "sh", map: { widthHexes: 40, heightHexes: 20 }, terrain,
    sides: [{ faction: "EAR", ships: [{ className: "frigate", q: 0, r: 0, facing: 0 }] },
            { faction: "ZAN", ships: [{ className: "heavy-cruiser", q: 2, r: 0, facing: 3 }] }] };
  const b = buildScenario(sc, T, L, makePrng(seedFromString("sh")));
  for (const x of b.fleets.flat()) x.movementPointRatio = 999;
  const r = runBattle(b.fleets, b.tuning, makePrng(seedFromString("sh")), { terrain: b.terrain, maxTurns: 1 });
  return r.stats.B.internal;
};
const fogInternal = shieldTest([{ type: "nebula", q: 0, r: 0 }]);
const clearInternal = shieldTest([]);
console.log(`internal damage on the Earth frigate in one turn: in nebula ${fogInternal.toFixed(1)} vs clear ${clearInternal.toFixed(1)}`);
assert(fogInternal > clearInternal, "shields are useless inside a nebula (more internal damage)");
const nl = [[], []];
for (const arr of nl) {
  const sc = { name: "nd", map: { widthHexes: 72, heightHexes: 40 },
    terrain: [{ type: "nebula", q: 0, r: 0 }, { type: "nebula", q: 1, r: 0 }, { type: "nebula", q: 0, r: 1 }, { type: "asteroids", q: -5, r: 2 }],
    sides: [{ faction: "EAR", ships: [{ className: "light-cruiser" }, { className: "destroyer" }] },
            { faction: "VRA", ships: [{ className: "light-cruiser" }, { className: "destroyer" }] }] };
  const b = buildScenario(sc, T, L, makePrng(seedFromString("nd")));
  runBattle(b.fleets, b.tuning, makePrng(seedFromString("nd")), { terrain: b.terrain, log: (m) => arr.push(m) });
}
assert(JSON.stringify(nl[0]) === JSON.stringify(nl[1]), "deterministic with nebula tiles");
