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

// The scripted helm's straight warp (Chris, 10 September 2026: up to 8 hexes, straight ahead). It
// jumps down its bow onto the NEAREST contact dead ahead, landing 6 hexes short of it (preferred range 4
// plus the landing offset 2), and it never lands in an enemy's hex. The jumper is a Krelath destroyer at
// (12,0) heading 3 (toward -q); the far target sits at (0,0), the blocker at (4,0).
for (const [mode, expect] of [["nearest", null], ["dead", { q: 6, r: 0 }], ["clear", { q: 6, r: 0 }],
    ["friendly", { q: 6, r: 0 }], ["too-far", null]]) {
  const t = structuredClone(tuning);
  t.explosion.enabled = false;
  const scenario = { map: { widthHexes: 60, heightHexes: 20 }, terrain: [], sides: [
    { faction: "EAR", ships: [ship("destroyer", { q: 0, r: 0 }), ship("destroyer", { q: 4, r: 0 })] },
    { faction: "KRE", ships: [ship("destroyer", { q: mode === "too-far" ? 17 : 12, r: 0 }, 3)] }
  ] };
  const battle = createBattle(scenario, t, loadouts, "p2-endpoints:warp-onto-enemy");
  const jumper = battle.B[0], blocker = battle.A[1];
  if (mode === "dead") blocker.destroyed = true;
  if (mode === "clear" || mode === "friendly" || mode === "too-far") blocker.pos = { q: -10, r: 5 };
  let mate;
  if (mode === "friendly") {
    mate = structuredClone(jumper); mate.id += "-mate"; mate.pos = { q: 6, r: 0 }; battle.B.push(mate);
  }
  // Keep the jumper from firing or moving instead, so the jump itself can be asserted.
  jumper.mounts.forEach(m => { m.inop = true; });
  jumper.movementPointRatio = 999;
  const orders = Object.fromEntries(battle.A.map(s => [s.id, hold]));
  if (mate) orders[mate.id] = hold;
  let first;
  stepTurn(battle, orders, { onRound: (_, r) => { if (r === 1) first = structuredClone(jumper); } });
  if (!expect) {
    // nearest: the blocker 8 ahead is worth only a 2-hex jump; too-far: 11 hexes is beyond the warp.
    assert.equal(first.warpedThisTurn, false, mode);
  } else {
    assert.equal(first.warpedThisTurn, true, mode);
    assert.deepEqual(first.pos, expect, mode);
    assert.equal(first.facing, 3, "the warp keeps its heading");
    assert.ok(!battle.A.some(e => !e.destroyed && e.pos.q === first.pos.q && e.pos.r === first.pos.r), "never in an enemy's hex");
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
