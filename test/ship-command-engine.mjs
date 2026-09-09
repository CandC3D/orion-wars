// The captain layer against the real resolver: it must be inert without a captain record, and it
// must actually fire with one. The unit tests in test/ship-command.mjs prove the rules; these prove
// the wiring, which is the half that can change a recorded battle.
//
// Optional --source reproduces the same assertions against a frozen candidate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceArg = process.argv.indexOf("--source");
const root = sourceArg >= 0 ? path.resolve(process.argv[sourceArg + 1]) : fileURLToPath(new URL("..", import.meta.url));
const { createBattleFromFleets, stepTurn } = await import(pathToFileURL(path.join(root, "src/tactical/resolver.js")));
const { buildShip } = await import(pathToFileURL(path.join(root, "src/tactical/ship.js")));
const { makePrng } = await import(pathToFileURL(path.join(root, "src/prng.js")));
const { distance } = await import(pathToFileURL(path.join(root, "src/tactical/hex.js")));
const read = p => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const T = read("data/tactical-tuning.json"), L = read("data/loadouts.json");

const hold = [{ turn: 0, forward: 0 }, { turn: 0, forward: 0 }, { turn: 0, forward: 0 }];
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log("ok:", name); };

// A hurt light cruiser facing a fresh heavy cruiser six hexes dead ahead, ordered to close.
// Nothing else moves, nothing else is armed, so any difference is the captain's doing.
function board({ captain = null, hull = 0.4, order = 4 } = {}) {
  const rng = makePrng(11);
  const tune = structuredClone(T);
  const mine = buildShip("A-light-cruiser-1", "EAR", "light-cruiser", tune, L, rng);
  mine.pos = { q: 0, r: 0 }; mine.facing = 0;
  mine.superstructure = Math.round(mine.superstructureMax * hull);
  for (const m of mine.mounts) m.inop = true;            // silence the guns: this test is about the helm
  if (captain) mine.captain = captain;

  const theirs = buildShip("B-heavy-cruiser-1", "KRE", "heavy-cruiser", tune, L, rng);
  theirs.pos = { q: 6, r: 0 }; theirs.facing = 3;
  for (const m of theirs.mounts) m.inop = true;
  theirs.superstructure = theirs.superstructureMax;

  const battle = createBattleFromFleets([[mine], [theirs]], tune, makePrng(5), { maxTurns: 4, terrain: [] });
  const log = [];
  const plan = [{ turn: 0, forward: order }, { turn: 0, forward: 0 }, { turn: 0, forward: 0 }];
  // The other side is ordered to hold: an AI helm closing under its own doctrine would move the
  // reference point and the test would be measuring the wrong ship.
  stepTurn(battle, { [mine.id]: { plan, target: "auto", reserve: 0 }, [theirs.id]: { plan: hold, target: "auto", reserve: 1 } }, { log: line => log.push(line) });
  const after = battle.A.find(s => s.id === mine.id);
  return { moved: after.movedThisTurn, range: distance(after.pos, theirs.pos), log };
}

const unmanaged = board();

check("without a captain record the ship closes as ordered, inside the line", () => {
  assert.equal(unmanaged.moved, 4, `expected all four hexes, moved ${unmanaged.moved}`);
  assert.ok(unmanaged.range < 5, `expected to end inside 5 hexes, ended at ${unmanaged.range}`);
  assert.equal(unmanaged.log.filter(l => /captain:/.test(l)).length, 0, "no captain should speak");
});

check("a cautious captain holds outside his line and says so", () => {
  const r = board({ captain: { id: "cap-1", name: "Capt. Renard", posture: "cautious" } });
  assert.ok(r.moved < unmanaged.moved, `expected a shorter move than ${unmanaged.moved}, moved ${r.moved}`);
  assert.ok(r.range >= 5, `expected to hold at or outside 5 hexes, held at ${r.range}`);
  const said = r.log.find(l => /captain:/.test(l));
  assert.ok(said, "the refusal must be reported");
  assert.match(said, /Capt\. Renard will not close inside 5 hexes at 40% hull/);
  assert.match(said, /held at \d+ of 4 hexes/);
});

check("a bold captain closes all the way and stays silent", () => {
  const r = board({ captain: { id: "cap-2", name: "Capt. Arden", posture: "bold" } });
  assert.equal(r.moved, unmanaged.moved);
  assert.equal(r.log.filter(l => /captain:/.test(l)).length, 0);
});

check("a healthy ship under the same captain closes as ordered", () => {
  const r = board({ captain: { id: "cap-1", name: "Capt. Renard", posture: "cautious" }, hull: 1 });
  assert.equal(r.moved, unmanaged.moved);
  assert.equal(r.log.filter(l => /captain:/.test(l)).length, 0);
});

check("an order that stops outside the line is obeyed in full", () => {
  const r = board({ captain: { id: "cap-1", posture: "cautious" }, order: 1 });
  assert.equal(r.moved, 1, "closing to 5 hexes is not inside the line");
  assert.equal(r.log.filter(l => /captain:/.test(l)).length, 0);
});

// ---------------------------------------------------------------- breaking off a charge
function gunstar({ captain = null, damage = 0 } = {}) {
  const rng = makePrng(3);
  const tune = structuredClone(T);
  const mine = buildShip("A-gunstar-battlecruiser-1", "EAR", "gunstar-battlecruiser", tune, L, rng);
  mine.pos = { q: 0, r: 0 }; mine.facing = 0;
  mine.spinal.state = "charging"; mine.spinal.charge = 40;
  // startTurn rolls damageThisTurn into damageLastTurn, so set both: whichever side of that the
  // engine is on when the captain is consulted, the ship has demonstrably just been hurt.
  mine.damageThisTurn = mine.damageLastTurn = Math.round(mine.superstructureMax * damage);
  if (captain) mine.captain = captain;
  const theirs = buildShip("B-carrier-1", "KRE", "carrier", tune, L, rng);
  theirs.pos = { q: 10, r: 0 }; theirs.facing = 3;
  const battle = createBattleFromFleets([[mine], [theirs]], tune, makePrng(7), { maxTurns: 4, terrain: [] });
  const log = [];
  stepTurn(battle, { [mine.id]: { plan: hold, target: "auto", reserve: 0 }, [theirs.id]: { plan: hold, target: "auto", reserve: 1 } }, { log: line => log.push(line) });
  const after = battle.A.find(s => s.id === mine.id);
  return { state: after.spinal.state, charge: after.spinal.charge, log };
}

check("a planted bank under heavy fire is vented by a captain, and reported", () => {
  const r = gunstar({ captain: { id: "cap-3", name: "Capt. Ibarra", posture: "cautious" }, damage: 0.25 });
  assert.equal(r.state, "cooldown", `expected the bank vented, state is ${r.state}`);
  assert.equal(r.charge, 0);
  assert.ok(r.log.find(l => /captain: Capt\. Ibarra breaks off the charge/.test(l)), "the break-off must be reported");
});

check("the same ship without a captain keeps charging into the fire", () => {
  const r = gunstar({ damage: 0.25 });
  assert.notEqual(r.state, "cooldown");
  assert.ok(r.charge > 0, "the bank should still hold its charge");
  assert.equal(r.log.filter(l => /captain:/.test(l)).length, 0);
});

check("light damage is not a reason to throw the charge away", () => {
  const r = gunstar({ captain: { id: "cap-3", posture: "cautious" }, damage: 0.02 });
  assert.notEqual(r.state, "cooldown");
  assert.ok(r.charge > 0);
});

console.log(`\nShip captains against the engine: ${passed} checks passed.`);
