// Chris's 2026-09-05 geometry rulings. No expected-failure exemptions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bearing, distance, faceFor, hexLineGroups, hexLine, GEOMETRY_RULESET } from "../src/tactical/hex.js";
import { createPlayRecord, recordBuiltBattle } from "../arena/record.js";
import { buildShip } from "../src/tactical/ship.js";
import { createBattleFromFleets, stepTurn, previewOrders } from "../src/tactical/resolver.js";
import { makePrng } from "../src/prng.js";
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const T = read("../data/tactical-tuning.json"), L = read("../data/loadouts.json");
const O = { q: 0, r: 0 }, rotate = p => ({ q: p.q + p.r, r: -p.q });
const mirror = p => ({ q: p.q + p.r, r: -p.r });
const plus = (a, b) => ({ q: a.q + b.q, r: a.r + b.r });
const key = h => `${h.q},${h.r}`;
const canonical = groups => groups.map(g => g.map(key).sort().join("|"));
const oldBearing = (a, b) => (Math.round(((Math.atan2(-1.5 * (b.r - a.r), Math.sqrt(3) * (b.q + b.r / 2) - Math.sqrt(3) * (a.q + a.r / 2)) * 180 / Math.PI + 360) % 360) / 60) % 6);
let vectors = 0, translations = 0, seams = 0, nonSeams = 0;
assert.equal(bearing(O, O), 0);
assert.deepEqual(hexLineGroups(O, O), [[O]]);
assert.deepEqual(hexLineGroups(O, { q: 2, r: -1 }), [[O], [{ q: 1, r: -1 }, { q: 1, r: 0 }], [{ q: 2, r: -1 }]]);
assert.deepEqual(hexLine(O, { q: 2, r: -1 }), hexLineGroups(O, { q: 2, r: -1 }).flat());
let seam = { q: 2, r: -1 };
for (let heading = 0; heading < 6; heading++, seam = rotate(seam)) {
  assert.equal(bearing(O, seam), (heading + 1) % 6, "counter-clockwise seam ownership");
  assert.equal(faceFor(heading, bearing(O, seam)), 1, "port-forward owns the bow/port seam at every heading");
}
for (let q = -12; q <= 12; q++) for (let r = -12; r <= 12; r++) {
  const v = { q, r }, s = -q - r;
  if (!(q || r) || distance(O, v) > 12) continue;
  vectors++;
  const seam = q === r || r === s || s === q;
  const dir = bearing(O, v), groups = hexLineGroups(O, v);
  assert.equal(groups.length, distance(O, v) + 1);
  assert.ok(groups.every(g => g.length === 1 || g.length === 2));
  assert.deepEqual(canonical(hexLineGroups(v, O)).reverse(), canonical(groups), "line reversal");
  assert.deepEqual(canonical(hexLineGroups(O, rotate(v))), canonical(groups.map(g => g.map(rotate))), "line rotation");
  assert.deepEqual(canonical(hexLineGroups(O, mirror(v))), canonical(groups.map(g => g.map(mirror))), "line reflection");
  assert.equal(bearing(O, rotate(v)), (dir + 1) % 6);
  assert.equal(bearing(v, O), (dir + 3) % 6);
  if (seam) seams++; else nonSeams++;
  for (const origin of [O, { q: -7, r: 2 }, { q: 15, r: -9 }, { q: -30, r: 17 }, { q: 33, r: -20 }]) {
    const target = plus(origin, v);
    assert.equal(bearing(origin, target), dir, "bearing translation");
    if (!seam) assert.equal(bearing(origin, target), oldBearing(origin, target), "non-boundary bearing must not change");
    assert.deepEqual(canonical(hexLineGroups(origin, target)), canonical(groups.map(g => g.map(h => plus(origin, h)))), "line translation");
    translations++;
  }
}

// Engine + forecast fixtures, not just a geometry-helper test. In each case
// only A may fire; explicit holds stop AI travel from changing the geometry.
function duel(terrain, target, facing = 0, rules = {}) {
  const tuning = structuredClone(T), rng = makePrng(117);
  Object.assign(tuning.battle.terrainRules.asteroids, rules);
  const a = buildShip("A-test", "EAR", "frigate", tuning, L, rng);
  const b = buildShip("B-test", "EAR", "frigate", tuning, L, rng);
  a.pos = O; a.facing = facing; b.pos = target; b.facing = (facing + 3) % 6;
  b.mounts.forEach(m => { m.inop = true; });
  const battle = createBattleFromFleets([[a], [b]], tuning, rng, { terrain });
  const order = { reserve: 0, plan: Array.from({ length: 3 }, () => ({ turn: 0, forward: 0 })) };
  const forecast = previewOrders(battle, a.id, order);
  const shots = [];
  stepTurn(battle, { [a.id]: order, [b.id]: { ...order, reserve: 1 } }, { onShot: e => shots.push(e) });
  return { shots: shots.filter(e => e.shooterId === a.id).length, forecast: forecast.weapons };
}
let duels = 0;
for (let heading = 0; heading < 6; heading++) {
  const turn = p => { for (let i = 0; i < heading; i++) p = rotate(p); return p; };
  const target = turn({ q: 2, r: -1 });
  assert.ok(duel([], target, heading).shots > 0, "clear control fires"); duels++;
  for (const type of ["moon", "asteroid", "asteroids", "nebula"]) for (const h of [{ q: 1, r: 0 }, { q: 1, r: -1 }]) {
    const blocked = duel([{ type, ...turn(h) }], target, heading);
    assert.equal(blocked.shots, 0, `${type} on either grazed edge must block`);
    assert.equal(blocked.forecast, 0, "fire forecast must agree with engine"); duels++;
  }
  const disabledField = duel([{ type: "asteroids", ...turn({ q: 1, r: 0 }) }], target, heading, { blocksFire: false });
  assert.ok(disabledField.shots > 0, "existing field toggle remains respected"); duels++;
  const firstFog = duel([{ type: "nebula", ...target }], target, heading);
  assert.ok(firstFog.shots > 0, "target in first nebula sample remains reachable"); duels++;
  const fromFog = duel([{ type: "nebula", ...O }, { type: "nebula", ...turn({ q: 1, r: 0 }) }], target, heading);
  assert.ok(fromFog.shots > 0, "shooter inside fog retains visibility-limited fire"); duels++;
}
const emptyScenario = { sides: [{ faction: "EAR", ships: [] }, { faction: "KRE", ships: [] }] };
assert.equal(createPlayRecord(emptyScenario, { map: { widthHexes: 72, heightHexes: 40 }, ships: [] }).meta.geometryRules, GEOMETRY_RULESET);
assert.equal(recordBuiltBattle({ fleets: [[], []], tuning: T, rng: makePrng(1), meta: { geometryRules: "old" } }).meta.geometryRules, GEOMETRY_RULESET);
console.log(`Approved geometry passed: ${vectors} vectors (${seams} seam / ${nonSeams} non-seam), ${translations} translated cases; rotation/reflection/reversal line checks; ${duels} engine/forecast fixtures; both recorder rule markers.`);
