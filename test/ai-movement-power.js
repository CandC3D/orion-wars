// Public-engine regressions for actual terrain cost in every AI helm branch.
// Optional --source lets the same assertions reproduce defects in a frozen
// candidate without writing anything into that candidate or Fable's reports.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const sourceArg = process.argv.indexOf("--source");
const root = sourceArg >= 0 ? path.resolve(process.argv[sourceArg + 1]) : fileURLToPath(new URL("..", import.meta.url));
const { createBattle, stepTurn, resetHelmStats, helmStats } = await import(pathToFileURL(path.join(root, "src/tactical/resolver.js")));
const { add } = await import(pathToFileURL(path.join(root, "src/tactical/hex.js")));
const read = p => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const T = read("data/tactical-tuning.json"), L = read("data/loadouts.json");
const origin = { q: 0, r: 0 };
const makeShip = (className, pos, facing = 0) => ({ className, ...pos, facing });
const hold = { reserve: 1, plan: Array.from({ length: 3 }, () => ({ turn: 0, forward: 0 })) };
const cases = [];
function check(name, body) {
  try { body(); cases.push({ name, pass: true }); }
  catch (error) { cases.push({ name, pass: false, error: error.message }); }
}
function firstRound(battle, actor) {
  const orders = Object.fromEntries(battle.fleets.flat().filter(s => s !== actor).map(s => [s.id, hold]));
  let first;
  resetHelmStats(true);
  stepTurn(battle, orders, { onRound: (_, round) => {
    if (round === 1) first = { ship: structuredClone(actor), counters: { ...helmStats } };
  } });
  resetHelmStats(false);
  return first;
}

for (const branch of ["formation", "support", "travel"]) for (let heading = 0; heading < 6; heading++) {
  for (const field of [false, true]) check(`${branch}/${heading}/${field ? "field" : "clear"}`, () => {
    const tuning = structuredClone(T);
    tuning.formation.enabled = branch === "formation";
    tuning.helm.arcEvasion.enabled = false;
    tuning.helm.arcAttack.enabled = false;
    tuning.doctrine.dynamic.enabled = false;
    tuning.doctrine.EAR.reserveFraction = .3;
    const escort = makeShip("frigate", origin, heading);
    const mate = makeShip(branch === "formation" ? "heavy-cruiser" : "frigate", add(origin, heading, 22), heading);
    const battle = createBattle({ map: { widthHexes: 100, heightHexes: 100 },
      terrain: field ? Array.from({ length: 12 }, (_, i) => ({ type: "asteroids", ...add(origin, heading, i + 1) })) : [],
      sides: [{ faction: "EAR", ships: branch === "travel" ? [escort] : [escort, mate] },
        { faction: "EAR", ships: [makeShip("frigate", add(origin, heading, 40), (heading + 3) % 6)] }]
    }, tuning, L, `ai-power-${branch}-${heading}`);
    const actor = battle.A.find(s => s.pos.q === 0 && s.pos.r === 0);
    // Isolate movement from gunnery and use a seven-point action allowance.
    for (const s of battle.fleets.flat()) s.mounts.forEach(m => { m.inop = true; });
    actor.cores.forEach(c => { c.power = 0; }); actor.impulse = 10; actor.movementPointRatio = 1;
    const { ship, counters } = firstRound(battle, actor);
    const steps = field ? 3 : 7;
    assert.deepEqual(ship.pos, add(origin, heading, steps));
    assert.equal(ship.power, 10 - steps * (field ? 2 : 1));
    assert.equal(ship.reserve, 3);
    assert.equal(ship.movedThisTurn, steps);
    assert.ok(ship.power >= ship.reserve);
    if (branch === "support") assert.equal(counters.gatherHeld, 1, "must exercise the support branch");
  });
}

// Actual authored frigate ratio, reserve and hull power: the unpatched escort
// ends at -4 power after seven field entries, not merely below its reserve.
check("stock-formation-cannot-create-negative-power", () => {
  const battle = createBattle({ map: { widthHexes: 80, heightHexes: 40 },
    terrain: Array.from({ length: 10 }, (_, i) => ({ type: "asteroids", q: i + 1, r: 0 })), sides: [
      { faction: "EAR", ships: [makeShip("frigate", origin), makeShip("heavy-cruiser", { q: 22, r: 0 })] },
      { faction: "KRE", ships: [makeShip("frigate", { q: 28, r: 0 }, 3)] }
    ] }, structuredClone(T), L, "terrain-power-probe");
  for (const s of battle.fleets.flat()) s.mounts.forEach(m => { m.inop = true; });
  const actor = battle.A.find(s => s.className === "frigate");
  const { ship } = firstRound(battle, actor);
  assert.deepEqual(ship.pos, { q: 3, r: 0 });
  assert.equal(ship.power, 4); assert.equal(ship.reserve, 3);
});

for (const branch of ["orbit", "evade"]) for (const field of [false, true]) {
  check(`${branch}/${field ? "unaffordable-field" : "affordable-clear"}`, () => {
    const tuning = structuredClone(T);
    tuning.formation.enabled = false;
    tuning.doctrine.dynamic.enabled = false; tuning.doctrine.EAR.reserveFraction = 0;
    tuning.helm.arcEvasion.enabled = branch === "evade";
    const battle = createBattle({ map: { widthHexes: 80, heightHexes: 40 },
      terrain: field ? [{ type: "asteroids", q: 0, r: -1 }] : [], sides: [
        { faction: "EAR", ships: [makeShip("frigate", origin)] },
        { faction: "EAR", ships: [makeShip("heavy-cruiser", branch === "orbit" ? { q: -5, r: 0 } : { q: -6, r: 2 })] }
      ] }, tuning, L, "power-local");
    const actor = battle.A[0];
    // This is a helm-cost fixture, not a stock-layout expectation. Pin the
    // threatened arc geometry that drives the evade branch; published layouts
    // may deliberately change which neighboring hex is safer.
    if(branch==='evade'){
      const arcs=['fp','f','fs','pa','a','f','fp','fs'];
      battle.B[0].mounts.forEach((m,i)=>{m.arc=[...tuning.arcs[arcs[i]]];});
    }
    // Below the one-point minimum beam allocation but enough for a clear
    // half-point step. Working guns still inform the real tactical helm.
    actor.cores.forEach(c => { c.power = 0; }); actor.impulse = .75; actor.movementPointRatio = .5;
    const { ship, counters } = firstRound(battle, actor);
    assert.deepEqual(ship.pos, field ? origin : { q: 0, r: -1 });
    assert.equal(ship.power, field ? .75 : .25);
    assert.equal(ship.movedThisTurn, field ? 0 : 1);
    assert.equal(counters[branch === "orbit" ? "orbitSteps" : "evadeSteps"], field ? 0 : 1);
  });
}

for (const blocked of [false, true]) check(`free-burst/${blocked ? "solid-terrain" : "asteroid-field"}`, () => {
  const tuning = structuredClone(T);
  tuning.formation.enabled = false; tuning.helm.enabled = false;
  const battle = createBattle({ map: { widthHexes: 100, heightHexes: 40 },
    terrain: [{ type: blocked ? "moon" : "asteroids", q: 1, r: 0 }], sides: [
      { faction: "ZAN", ships: [makeShip("frigate", origin)] },
      { faction: "EAR", ships: [makeShip("frigate", { q: 40, r: 0 }, 3)] }
    ] }, tuning, L, "power-burst");
  const actor = battle.A[0];
  for (const s of battle.fleets.flat()) s.mounts.forEach(m => { m.inop = true; });
  actor.cores.forEach(c => { c.power = 0; }); actor.impulse = 0;
  const hullBefore = actor.superstructure;
  const { ship } = firstRound(battle, actor);
  assert.deepEqual(ship.pos, { q: blocked ? 0 : tuning.emergencyManoeuvre.extraHexes, r: 0 });
  assert.equal(ship.power, 0); assert.equal(ship.emergencyUsed, !blocked);
  // Chris, 2026-09-06 section 34: no retained burst movement, no cost.
  assert.equal(ship.superstructure, hullBefore - (blocked?0:tuning.emergencyManoeuvre.stressDamage));
  assert.equal(ship.toHitPenalty, blocked?0:tuning.emergencyManoeuvre.toHitPenalty);
});

const failed = cases.filter(c => !c.pass);
if (process.argv.includes("--json")) console.log(JSON.stringify({ source: root, passed: cases.length - failed.length, failed: failed.length, cases }, null, 2));
else {
  for (const row of failed) console.error(`${row.name}: ${row.error}`);
  console.log(`AI movement power: ${cases.length - failed.length} passed, ${failed.length} failed (all headings, formation/support/travel, orbit, evasion and free bursts).`);
}
if (failed.length) process.exitCode = 1;
