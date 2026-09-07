// Audited defects promoted to ordinary assertions (not XFAILs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShip, fullPower } from "../src/tactical/ship.js";
import { createBattle, createBattleFromFleets, buildScenario, previewOrders, stepTurn } from "../src/tactical/resolver.js";
import { makePrng } from "../src/prng.js";
import { add, faceFor, shieldFacing } from "../src/tactical/hex.js";
import { validateScenario } from "../arena/editor-core.js";
import { eventShips, hitAttribution, shieldFace, OFFSET_OF_FACE } from "../arena/replay-geometry.js";
import { courseReadings } from "../arena/command-model.js";

const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const tuning = read("../data/tactical-tuning.json"), loadouts = read("../data/loadouts.json");
const copy = v => structuredClone(v);
const hold = () => ({ turn: 0, forward: 0 });
const order = (forward = 0, reserve = 0, turn = 0) => ({ plan: [{ turn, forward }, hold(), hold()], reserve, target: "auto" });
let cases = 0;
function check(name, fn) { fn(); cases++; console.log(`ok: ${name}`); }
function fixture(hull = "frigate", enemyHull = "heavy-cruiser", faction = "EAR") {
  const t = copy(tuning), rng = makePrng(319);
  t.battle.terrain = []; t.battle.map = { shape: "rect", widthHexes: 100, heightHexes: 100 };
  t.explosion.enabled = false;
  t.damage.facingTables = { forward: ["hull"], flank: ["hull"], rear: ["hull"] };
  const a = buildShip("A-test-1", faction, hull, t, loadouts, rng);
  const b = buildShip("B-test-1", "EAR", enemyHull, t, loadouts, rng);
  for (const s of [a, b]) {
    s.cloaked = false; s.detected = true; s.superstructure = s.superstructureMax = 1e6;
    s.mounts.forEach(m => { m.inop = true; });
  }
  a.pos = { q: 0, r: 0 }; a.facing = 0;
  b.pos = { q: 8, r: 0 }; b.facing = 3;
  return { a, b, t, rng, battle: createBattleFromFleets([[a], [b]], t, rng) };
}
function execute(f, o = order()) {
  const log = [], frames = [], shots = [];
  const orders = Object.fromEntries(f.battle.fleets.flat().map(s => [s.id, order()]));
  orders[f.a.id] = o;
  const preview = previewOrders(f.battle, f.a.id, o);
  stepTurn(f.battle, orders, { log: m => log.push(m), onShot: e => shots.push(e),
    onRound: () => frames.push({ pos: copy(f.a.pos), facing: f.a.facing, power: f.a.power, moved: f.a.movedThisTurn }) });
  return { preview, log, frames, shots };
}

check("objective validation shared by editor, scenario builder and direct fleets", () => {
  const original = read("../arena/scenarios/asterion-line.json");
  for (const victory of [{ type: "flagship", protectedClass: { A: "gunstar-battlecruiser", B: "battleship" } },
    { type: "flagship" }, { type: "unknown" }, {}, false, "flagship", []]) {
    const scenario = { ...copy(original), victory };
    assert.ok(validateScenario(scenario, tuning, loadouts).length);
    assert.throws(() => buildScenario(scenario, copy(tuning), loadouts, makePrng(1)), /objective|victory/i);
    assert.throws(() => createBattle(scenario, copy(tuning), loadouts, 1), /objective|victory/i);
    const f = fixture(), before = JSON.stringify(f.battle.fleets);
    assert.throws(() => createBattleFromFleets(f.battle.fleets, f.t, f.rng, { victory }), /objective|victory/i);
    assert.equal(JSON.stringify(f.battle.fleets), before, "rejection must precede fleet mutation");
  }
  const f = fixture(), victory = { type: "flagship", protectedClass: { A: f.a.className, B: f.b.className } };
  const b = createBattleFromFleets([[f.a], [f.b]], f.t, f.rng, { victory });
  assert.equal(b.done, false); f.b.destroyed = true;
  stepTurn(b);
  assert.equal(b.result.victor, "A"); assert.equal(b.result.reason, "enemy command asset destroyed");
  const resumed = createBattleFromFleets([[f.a], [f.b]], f.t, f.rng, { victory });
  stepTurn(resumed); assert.equal(resumed.result.victor, "A", "a real wreck is not an absent protected class");
  const duplicate = fixture();
  assert.throws(() => createBattleFromFleets([[duplicate.a, copy(duplicate.a)], [duplicate.b]], duplicate.t, duplicate.rng, { victory }), /found 2/);
  assert.doesNotThrow(() => createBattle(original, copy(tuning), loadouts, 1));
  assert.doesNotThrow(() => createBattleFromFleets([[duplicate.a], [duplicate.b]], duplicate.t, duplicate.rng));
});

for (const heading of [0, 1, 2, 3, 4, 5]) for (const stop of ["requested", "terrain", "power", "field", "edge", "consecutive", "transit", "friendly", "disabled", "destroyed"]) {
  check(`actual endpoint: heading ${heading}, ${stop}`, () => {
    const f = fixture(), { a, b, t } = f;
    a.facing = heading; b.pos = add(a.pos, heading, 3);
    a.movementPointRatio = 1;
    let forward = stop === "requested" ? 3 : 5, reserve = 0, expected = 2;
    if (stop === "terrain" || stop === "consecutive") t.battle.terrain = [{ type: "asteroid", ...add(a.pos, heading, 4) }];
    if (stop === "power") reserve = .7; // frigate: 10 total, 3 affordable
    if (stop === "field") { reserve = .5; t.battle.terrain = [{ type: "asteroids", ...b.pos }, { type: "asteroids", ...add(a.pos, heading, 4) }]; }
    if (stop === "edge") { t.battle.map = null; t.battle.mapRadiusHexes = 3; }
    if (stop === "consecutive") { const other = copy(b); other.id += "-2"; other.pos = add(a.pos, heading, 2); f.battle.B.push(other); expected = 1; }
    if (stop === "transit") expected = 5;
    if (stop === "friendly") { const mate = copy(a); mate.id += "-2"; mate.pos = copy(b.pos); f.battle.A.push(mate); b.pos = add(a.pos, heading, 8); forward = 3; expected = 3; }
    if (stop === "disabled") { t.battle.sameHexNoFire = false; forward = 3; expected = 3; }
    if (stop === "destroyed") { b.destroyed = true; const live = copy(b); live.id += "-2"; live.destroyed = false; live.pos = add(a.pos, heading, 8); f.battle.B.push(live); forward = 3; expected = 3; }
    const result = execute(f, order(forward, reserve));
    assert.deepEqual(result.frames[0].pos, add({ q: 0, r: 0 }, heading, expected));
    assert.equal(result.frames[0].moved, expected);
    const expectedCost = expected; // clamped field entry is not paid for
    assert.equal(result.frames[0].power, fullPower(a) - expectedCost);
    assert.equal(result.preview.movement, expectedCost);
    assert.equal(result.preview.route.filter(p => p.moved).length, expected);
    assert.deepEqual({ q: result.preview.actions[0].end.q, r: result.preview.actions[0].end.r }, result.frames[0].pos);
    if (expected < forward) {
      assert.ok(result.log.some(m => m.includes("enemy's hex")));
      assert.equal(result.log.filter(m => m.includes("order clamped:")).length, 1);
      assert.equal(courseReadings(result.preview, order(forward, reserve))[0].reason, "CONTACT BLOCK");
    }
  });
}

for (const state of ["charging", "ready", "cold", "cooldown", "reconnected", "disabled"]) check(`Gunstar charge plant: ${state}`, () => {
  const f = fixture("gunstar-battlecruiser");
  const spinalMount = f.a.mounts.find(m => m.kind === "spinal"); spinalMount.inop = false;
  f.a.spinal.state = state === "cold" || state === "disabled" ? "charging" : state === "reconnected" ? "cooldown" : state;
  f.a.spinal.charge = state === "ready" ? 72 : state === "charging" || state === "disabled" ? 20 : 0;
  f.a.spinal.cooldown = state === "reconnected" ? 1 : 3;
  if (state === "cold") f.b.pos = { q: 40, r: 0 };
  if (state === "disabled") f.t.weapons[f.a.spinal.type].immobileWhileCharging = false;
  const r = execute(f, order(1, 0, 1));
  const planted = state === "charging" || state === "ready";
  assert.equal(r.frames[0].moved, planted ? 0 : 1);
  assert.equal(r.frames[0].facing, 1, "turning remains allowed");
  assert.equal(r.preview.actions[0].moving, true, "a blocked move must not silently become hold/fire");
  assert.equal(r.preview.route.filter(p => p.round === 1 && p.moved).length, planted ? 0 : 1);
  if (planted) { assert.ok(r.log.some(m => /spinal charge plants/.test(m))); assert.equal(courseReadings(r.preview, order(1, 0, 1))[0].reason, "CHARGE PLANT"); }
});

for (const fog of [false, true]) check(`strike-craft damage bypass: nebula=${fog}`, () => {
  const f = fixture("carrier", "heavy-cruiser", "KRE");
  f.b.pos = { q: 2, r: 0 }; f.b.hull.pointDefence = 0;
  f.a.squadrons = f.a.squadrons.filter(s => s.type === "bomber");
  assert.ok(f.a.squadrons.length);
  f.t.strikeCraft.types.bomber.hitChance = 1;
  if (fog) f.t.battle.terrain = [{ type: "nebula", ...f.b.pos }];
  const before = f.b.superstructure;
  const r = execute(f);
  assert.ok(r.shots.some(e => e.kind === "strike" && e.hits > 0));
  assert.ok(f.battle.stats.A.damage > 0);
  if (fog) assert.equal(before - f.b.superstructure, f.battle.stats.A.damage);
  else assert.ok(before - f.b.superstructure < f.battle.stats.A.damage);
  for (const e of r.shots.filter(e => e.kind === "strike" && e.damage > 0)) {
    assert.deepEqual(e.victimPos, f.b.pos); assert.equal(e.face, shieldFacing(f.b, f.a.pos));
  }
});

for (const fog of [false, true]) check(`detonation damage bypass: nebula=${fog}`, () => {
  const f = fixture("heavy-cruiser");
  f.t.explosion.enabled = true;
  if (fog) f.t.battle.terrain = [{ type: "nebula", ...f.a.pos }];
  const dead = copy(f.a); dead.id = "A-wreck"; dead.destroyed = true; dead.exploded = false;
  dead.pos = { q: 1, r: 0 }; dead.power = 8; dead.hull.explosionYield = 1;
  f.battle.A.push(dead);
  const before = f.a.superstructure;
  execute(f, order(0, 1));
  const damage = Math.ceil(8 / f.t.explosion.divisor);
  assert.equal(before - f.a.superstructure, fog ? damage : 0);
  assert.equal(dead.exploded, true);
});

check("screened beam events retain intended target and actual victim geometry", () => {
  const f = fixture("heavy-cruiser", "heavy-cruiser");
  f.b.pos = { q: 3, r: 0 };
  const screen = copy(f.b); screen.id = "B-screen"; screen.pos = { q: 2, r: 1 }; screen.facing = 2;
  screen.hull = { ...screen.hull, screen: 100 };
  f.b.hull = { ...f.b.hull, screen: 0 };
  f.battle.B.push(screen);
  f.t.screening.maxChance = 1; f.t.screening.chancePerScreenPoint = 1;
  f.t.toHit.target = -100;
  const beam = f.a.mounts.find(m => m.kind === "beam"); beam.inop = false; beam.arc = [1, 2, 3, 4, 5, 6];
  const o = order(); o.target = f.b.id;
  const { shots } = execute(f, o);
  const hit = shots.find(e => e.kind === "beam" && e.hit);
  assert.ok(hit); assert.equal(hit.targetId, f.b.id); assert.equal(hit.victimId, screen.id);
  assert.deepEqual(hit.victimPos, screen.pos); assert.equal(hit.face, shieldFacing(screen, f.a.pos));
  const saved = copy(hit); f.a.pos.q += 9; screen.pos.q += 9; screen.facing = 5;
  assert.deepEqual(hit, saved, "event positions must not alias live ships");
  const display = eventShips(hit, id => f.battle.fleets.flat().find(s => s.id === id));
  assert.deepEqual(display.target.pos, saved.victimPos); assert.equal(display.target.facing, saved.victimFacing);
  assert.equal(display.target.id, screen.id); assert.equal(display.face, saved.face);
  assert.match(hitAttribution(hit), /screened by B-screen; face/);
});

check("legacy queued missiles without a flight profile keep launch-origin fallback and pre-refill timing", () => {
  const f = fixture(); f.b.hull.pointDefence = 0; f.b.power = 0;
  const launch = { q: -4, r: 1 }, beforePos = copy(f.b.pos), beforeHull = f.b.superstructure;
  f.battle.inFlight.push({ side: "A", shooterId: f.a.id, shooterPos: launch, shooterFacing: 2,
    targetId: f.b.id, weapon: "neutronic-missile", damage: 1, shooterPoints: 0 });
  let impact;
  stepTurn(f.battle, { [f.a.id]: order(), [f.b.id]: order(2) }, { onShot: e => { if (e.kind === "missile") {
    impact = e; assert.equal(f.b.power, 0); assert.equal(f.b.superstructure, beforeHull - 1);
  } } });
  assert.equal(impact.outcome, "hit"); assert.deepEqual(impact.shooterPos, launch);
  assert.deepEqual(impact.victimPos, beforePos); assert.notDeepEqual(f.b.pos, beforePos);
  assert.equal(impact.face, shieldFacing({ pos: beforePos, facing: 3 }, launch));
});

check("fractional Krelath costs refund only discarded endpoint steps", () => {
  const f = fixture("frigate", "heavy-cruiser", "KRE");
  f.b.pos = { q: 3, r: 0 };
  f.t.battle.terrain = [{ type: "asteroid", q: 4, r: 0 }];
  const ratio = f.a.movementPointRatio;
  assert.ok(ratio > 0 && ratio < 1);
  const r = execute(f, order(5));
  assert.deepEqual(r.frames[0].pos, { q: 2, r: 0 });
  assert.ok(Math.abs(r.preview.movement - 2 * ratio) < 1e-10);
  assert.ok(Math.abs(fullPower(f.a) - r.frames[0].power - 2 * ratio) < 1e-10);
});

check("nonzero spinal range bonus is recorded as actual damage", () => {
  const f = fixture("gunstar-battlecruiser");
  const mount = f.a.mounts.find(m => m.kind === "spinal");
  mount.inop = false; mount.arc = [1, 2, 3, 4, 5, 6];
  mount.bands = [{ to: 20, damageBonus: 5, toHitMod: 0 }];
  f.a.spinal.state = "ready"; f.a.spinal.charge = 999;
  f.t.toHit.target = -100;
  const before = f.b.superstructure;
  const r = execute(f);
  const hit = r.shots.find(e => e.kind === "spinal" && e.hit);
  assert.ok(hit);
  assert.equal(hit.damage, f.t.weapons[f.a.spinal.type].damage + 5);
  assert.equal(before - f.b.superstructure, hit.damage);
  assert.equal(hit.face, shieldFacing(f.b, f.a.pos));
});

check("viewer faces and legacy replay fallback agree with authoritative faces", () => {
  for (let heading = 0; heading < 6; heading++) for (let dir = 0; dir < 6; dir++) {
    const target = { pos: { q: 0, r: 0 }, facing: heading }, attacker = add(target.pos, dir, 2);
    const face = faceFor(heading, dir);
    assert.equal(shieldFace(target, attacker), face);
    assert.equal((heading + OFFSET_OF_FACE[face]) % 6, dir);
  }
  const ships = [{ id: "a", pos: { q: 0, r: 0 }, facing: 0 }, { id: "b", pos: { q: 2, r: 0 }, facing: 3 }];
  const actors = eventShips({ shooterId: "a", targetId: "b" }, id => ships.find(s => s.id === id));
  assert.deepEqual(actors.target.pos, ships[1].pos); assert.equal(actors.exactTarget, false);
  assert.equal(actors.face, 2); actors.target.pos.q = 99; assert.equal(ships[1].pos.q, 2);
  assert.equal(hitAttribution({}), "");
});
console.log(`Tactical correctness regressions passed: ${cases} cases.`);
