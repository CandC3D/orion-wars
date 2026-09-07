// Portable regressions promoted from Fable/Opus P2-EP-1 and P2-EP-2.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBattle, stepTurn, resetHelmStats } from "../src/tactical/resolver.js";
import { fullPower } from "../src/tactical/ship.js";
import { add, distance } from "../src/tactical/hex.js";
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const tuning = read("../data/tactical-tuning.json"), loadouts = read("../data/loadouts.json");
const hold = { plan: Array.from({ length: 3 }, () => ({ turn: 0, forward: 0 })), reserve: 1 };
let cases = 0;
const ship = (className, pos, facing = 0) => ({ className, ...pos, facing });
const onEnemy = (s, battle) => battle.fleets.flat().some(e => !e.destroyed && e.side !== s.side && distance(e.pos, s.pos) === 0);

for (let heading = 0; heading < 6; heading++) for (const transit of [false, true]) {
  const origin = { q: 0, r: 0 }, blocker = add(origin, heading, 6);
  const t = structuredClone(tuning);
  // Seven action points: the sixth step into the field is affordable, but
  // leaving it is not. Keep this a contact-refund test, not a power refusal.
  t.doctrine.dynamic.enabled = false;
  t.doctrine.EAR.reserveFraction = .3;
  const scenario = { map: { widthHexes: 80, heightHexes: 80 }, terrain: [{ type: "asteroids", ...blocker }], sides: [
    { faction: "EAR", ships: [ship("frigate", origin, heading), ship("heavy-cruiser", add(origin, heading, 22), heading)] },
    { faction: "KRE", ships: [ship("frigate", blocker, (heading + 3) % 6), ship("frigate", add(origin, heading, 28), (heading + 3) % 6)] }
  ] };
  const battle = createBattle(scenario, t, loadouts, `ai-endpoint-${heading}-${transit}`);
  const escort = battle.A.find(s => s.className === "frigate");
  // Use the built ship's ratio directly: no balance-data changes in a fixture.
  if (transit) escort.movementPointRatio = .5;
  const orders = Object.fromEntries(battle.fleets.flat().filter(s => s !== escort).map(s => [s.id, hold]));
  const initialPower = fullPower(escort), log = [];
  let first;
  stepTurn(battle, orders, { log: s => log.push(s), onRound: (_, r) => {
    assert.equal(onEnemy(escort, battle), false);
    if (r === 1) first = structuredClone(escort);
  } });
  if (!transit) {
    assert.deepEqual(first.pos, add(origin, heading, 5));
    assert.equal(first.power, initialPower - 5 * escort.movementPointRatio, "refused field entry must cost nothing");
    assert.equal(first.movedThisTurn, 5);
    assert.ok(log.some(m => /helm clamped:/.test(m)));
  } else {
    assert.ok(distance(origin, first.pos) > 6, "legal transit must not be blocked");
    assert.equal(first.power, initialPower - (first.movedThisTurn + 1) * .5, "actual field transit costs one extra step unit");
  }
  cases++;
}

for (const mode of ["blocked", "dead", "clear", "disabled", "friendly"]) {
  const t = structuredClone(tuning);
  t.explosion.enabled = false;
  if (mode === "disabled") t.battle.sameHexNoFire = false;
  const scenario = { map: { widthHexes: 60, heightHexes: 20 }, terrain: [], sides: [
    { faction: "EAR", ships: [ship("destroyer", { q: 0, r: 0 }), ship("destroyer", { q: -4, r: 0 })] },
    { faction: "KRE", ships: [ship("destroyer", { q: 6, r: -8 }, 3)] }
  ] };
  const battle = createBattle(scenario, t, loadouts, "p2-endpoints:warp-onto-enemy");
  const jumper = battle.B[0], blocker = battle.A[1];
  if (mode === "dead") blocker.destroyed = true;
  if (mode === "clear" || mode === "friendly") blocker.pos = { q: -10, r: 5 };
  let mate;
  if (mode === "friendly") {
    mate = structuredClone(jumper); mate.id += "-mate"; mate.pos = { q: -4, r: 0 }; battle.B.push(mate);
  }
  // Prevent a refused jump falling through to gunnery/movement so its power
  // and per-turn jump allowance can be asserted directly.
  jumper.mounts.forEach(m => { m.inop = true; });
  jumper.movementPointRatio = 999;
  const orders = Object.fromEntries(battle.A.map(s => [s.id, hold]));
  if (mate) orders[mate.id] = hold;
  const log = []; let first;
  stepTurn(battle, orders, { log: m => log.push(m), onRound: (_, r) => { if (r === 1) first = structuredClone(jumper); } });
  if (mode === "blocked") {
    assert.equal(first.warpedThisTurn, false);
    assert.equal(first.power, fullPower(jumper));
    assert.deepEqual(first.pos, { q: 6, r: -8 });
    assert.ok(log.some(m => /warp refused:/.test(m)));
  } else {
    assert.equal(first.warpedThisTurn, true);
    assert.deepEqual(first.pos, { q: -4, r: 0 });
    assert.equal(first.power, fullPower(jumper) - Math.round(fullPower(jumper) * t.warpJump.powerCostFraction));
  }
  cases++;
}

// Ordinary seeded battle originally reported by the independent compact-map
// sweep. Compare instrumentation on/off while asserting every round endpoint.
function replaySeed(instrumented) {
  resetHelmStats(instrumented);
  const scenario = { maxTurns: 20, map: { widthHexes: 24, heightHexes: 14 },
    terrain: [{ type: "moon", q: 0, r: 0 }, { type: "moon", q: 1, r: -2 }, { type: "asteroids", q: -1, r: 1 }, { type: "asteroids", q: 2, r: 0 }], sides: [
    { faction: "EAR", ships: [ship("frigate", { q: -8, r: 0 }), ship("destroyer", { q: -8, r: 2 }), ship("destroyer", { q: -8, r: -2 }), ship("frigate", { q: -7, r: 4 })] },
    { faction: "KRE", ships: [ship("frigate", { q: 8, r: 0 }, 3), ship("destroyer", { q: 8, r: 2 }, 3), ship("destroyer", { q: 8, r: -2 }, 3), ship("frigate", { q: 7, r: -4 }, 3)] }
  ] };
  const battle = createBattle(scenario, structuredClone(tuning), loadouts, "p2-terr-free-t1-l0-s2");
  const frames = [], log = [], shots = [];
  while (!battle.done) stepTurn(battle, {}, { log: m => log.push(m), onShot: s => shots.push(s), onRound: () => {
    for (const s of battle.fleets.flat().filter(s => !s.destroyed)) assert.equal(onEnemy(s, battle), false);
    frames.push(battle.fleets.flat().map(s => ({ id: s.id, pos: { ...s.pos }, facing: s.facing, power: s.power })));
  } });
  return { frames, log, shots, result: battle.result };
}
assert.deepEqual(replaySeed(true), replaySeed(false)); cases++;
resetHelmStats(false);
console.log(`AI endpoint regressions passed: ${cases} cases, including all headings, transit, warp controls and seeded instrumentation parity.`);
