// Fast structural checks for properties that aggregate win-rate trials can
// conceal: rotation symmetry, composition insertion order, and fleet floors.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { battleView, buildFleet, buildScenario, createBattle, deployFleets, runBattle, stepTurn } from "../src/tactical/resolver.js";
import { makePrng, seedFromString } from "../src/prng.js";
import { formationOrders } from "../arena/formation-orders.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tuning = JSON.parse(readFileSync(join(root, "data", "tactical-tuning.json"), "utf8"));
const loadouts = JSON.parse(readFileSync(join(root, "data", "loadouts.json"), "utf8"));
const featuredScenario = JSON.parse(readFileSync(join(root, "arena", "scenarios", "asterion-line.json"), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

const compositionA = { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 };
const compositionB = { frigate: 4, destroyer: 2, "light-cruiser": 2, "heavy-cruiser": 1 };
const makeFleet = (composition) => buildFleet("EAR", composition, tuning, loadouts,
  makePrng(seedFromString("composition-order")), "A");
const fleetA = makeFleet(compositionA), fleetB = makeFleet(compositionB);
assert.deepEqual(fleetA.map((s) => [s.id, s.className]), fleetB.map((s) => [s.id, s.className]),
  "composition object key order changes fleet identity or order");
const opponentsA = makeFleet(compositionA), opponentsB = makeFleet(compositionB);
deployFleets(fleetA, opponentsA, tuning);
deployFleets(fleetB, opponentsB, tuning);
assert.deepEqual(fleetA.map((s) => [s.id, s.pos, s.facing]), fleetB.map((s) => [s.id, s.pos, s.facing]),
  "composition object key order changes deployment");
const runComposition = (composition) => {
  const rng = makePrng(seedFromString("composition-order-battle"));
  const A = buildFleet("EAR", composition, tuning, loadouts, rng, "A");
  const B = buildFleet("KRE", { "heavy-cruiser": 1, "light-cruiser": 2, destroyer: 2, frigate: 4 }, tuning, loadouts, rng, "B");
  deployFleets(A, B, tuning);
  return runBattle([A, B], tuning, rng);
};
assert.deepEqual(runComposition(compositionA), runComposition(compositionB),
  "composition object key order changes the battle result");

const scenario = {
  name: "Rotation invariant", seed: "rotation-invariant",
  map: { widthHexes: 72, heightHexes: 40 }, terrain: [],
  sides: [
    { faction: "EAR", ships: [
      { className: "destroyer", q: -12, r: -2, facing: 0 },
      { className: "destroyer", q: -11, r: 3, facing: 0 }
    ] },
    { faction: "EAR", ships: [
      { className: "frigate", q: 12, r: 2, facing: 3 },
      { className: "frigate", q: 11, r: -3, facing: 3 },
      { className: "frigate", q: 14, r: -1, facing: 3 },
      { className: "frigate", q: 13, r: 4, facing: 3 }
    ] }
  ]
};
const rotated = clone(scenario);
for (const side of rotated.sides) for (const ship of side.ships) {
  ship.q = -ship.q; ship.r = -ship.r; ship.facing = (ship.facing + 3) % 6;
}
const battleA = createBattle(scenario, tuning, loadouts, scenario.seed);
const battleB = createBattle(rotated, tuning, loadouts, scenario.seed);
const normalized = (battle, undoRotation) => {
  const view = clone(battleView(battle));
  if (undoRotation) for (const ship of view.ships) {
    ship.pos.q = -ship.pos.q || 0; ship.pos.r = -ship.pos.r || 0;
    ship.facing = (ship.facing + 3) % 6;
  }
  view.ships.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return view;
};
assert.deepEqual(normalized(battleA, false), normalized(battleB, true), "initial rotated battle differs");
while (!battleA.done || !battleB.done) {
  assert.equal(battleA.done, battleB.done, "rotated battle ended on a different turn");
  stepTurn(battleA); stepTurn(battleB);
  assert.deepEqual(normalized(battleA, false), normalized(battleB, true),
    `rotated battle diverged after turn ${battleA.turnsRun}`);
}

const illegal = clone(scenario);
illegal.sides[0].ships = [{ className: "gunstar-battlecruiser" }];
assert.throws(() => buildScenario(illegal, tuning, loadouts, makePrng(1)), /at least 52 points/,
  "headless scenario builder accepted a special hull below its fleet floor");
const wrongRoster = clone(scenario);
wrongRoster.sides[0].ships[0].className = "monitor";
assert.throws(() => buildScenario(wrongRoster, tuning, loadouts, makePrng(1)), /cannot be fielded by EAR/,
  "headless scenario builder accepted a hull outside the faction roster");

const formationShips = [{ id: "A-1", destroyed: false }, { id: "A-2", destroyed: false }, { id: "A-X", destroyed: true }];
const allowance = () => ({ fullPower: 12, movementPointRatio: 1, turnRate: 2 });
const advanceOrders = formationOrders(formationShips, 3, "advance", allowance);
assert.deepEqual(Object.keys(advanceOrders), ["A-1", "A-2"], "formation orders included a destroyed ship");
assert.deepEqual(advanceOrders["A-1"].plan, [
  { turn: 0, forward: 3 }, { turn: 0, forward: 3 }, { turn: 0, forward: 0 }
], "advance formation did not preserve a firing action");
assert.equal(advanceOrders["A-1"].reserve, 0.3, "advance formation used the wrong shield reserve");
assert.deepEqual(formationOrders(formationShips, 3, "port", allowance)["A-1"].plan, [
  { turn: 1, forward: 3 }, { turn: 0, forward: 3 }, { turn: 0, forward: 0 }
], "port wheel did not turn on its first action");
const lowPowerPlan = formationOrders([{ id: "A-low", destroyed: false }], 3, "advance",
  () => ({ fullPower: 2, movementPointRatio: 1, turnRate: 1 }))["A-low"].plan;
assert.equal(lowPowerPlan.reduce((total, action) => total + action.forward, 0), 1,
  "formation planner assigned more movement than a low-power ship can afford");

const objectiveBattle = createBattle(featuredScenario, tuning, loadouts, featuredScenario.seed);
assert.equal(objectiveBattle.maxTurns, 12, "scenario maximum turn count did not reach the battle engine");
assert.equal(battleView(objectiveBattle).victory?.type, "flagship", "battle view dropped the mission objective");
const protectedB = featuredScenario.victory.protectedClass.B;
const enemyFlagship = objectiveBattle.B.find((ship) => ship.className === protectedB);
assert.ok(enemyFlagship, `featured scenario has no ${protectedB} on side B to protect`);
enemyFlagship.destroyed = true;
const objectiveResult = stepTurn(objectiveBattle).result;
assert.equal(objectiveResult?.victor, "A", "destroying the enemy command asset did not award victory");
assert.equal(objectiveResult?.reason, "enemy command asset destroyed", "flagship victory used the wrong result reason");

console.log("Tactical invariants passed.");
