// Stage 3.1 contracts: forecasts are read-only, conditional and engine-backed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShip } from "../src/tactical/ship.js";
import { createBattle, createBattleFromFleets, battleView, previewOrders, stepTurn } from "../src/tactical/resolver.js";
import { makePrng } from "../src/prng.js";
import { DIRS, add, faceFor, inArc, bearing } from "../src/tactical/hex.js";
import { FACE_AT_OFFSET, OFFSET_OF_FACE, shields, format, shipLabel, courseMarkers, courseReadings } from "../arena/command-model.js";
import { HEX_DIRECTIONS } from "../arena/editor-core.js";
import { snapshotShip } from "../arena/record.js";

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const tuning = json("../data/tactical-tuning.json"), loadouts = json("../data/loadouts.json");
const copy = v => JSON.parse(JSON.stringify(v));
const hold = () => ({ turn:0, forward:0 });
const order = (plan = [hold(), hold(), hold()], reserve = .3) => ({ plan, reserve, target:"auto" });
function fixture({ faction="EAR", hull="light-cruiser", range=8, terrain=[] } = {}) {
  const t = copy(tuning), rng = makePrng(123);
  t.battle.terrain = terrain;
  const a = buildShip("A-test-1", faction, hull, t, loadouts, rng), b = buildShip("B-test-1", "EAR", "heavy-cruiser", t, loadouts, rng);
  a.cloaked = false; a.detected = true;
  b.pos = { q:range, r:0 }; b.facing = 3;
  // Stationary, non-firing, durable contact: removes explicitly excluded incoming
  // damage and movement, allowing exact own-action/energy comparison.
  b.mounts.forEach(m => { m.inop = true; }); b.superstructure = 1e8;
  return createBattleFromFleets([[a],[b]], t, rng);
}
let checks = 0, hulls = 0;
// Course endpoints retain all action identities even when later holds, turns or
// revisits share a hex. Grouping does not mutate the authoritative route.
{
  const route = [{ q: 0, r: 0, round: 0, facing: 0 },
    { q: 2, r: 0, round: 1, facing: 0, waypoint: true },
    { q: 2, r: 0, round: 2, facing: 1, waypoint: true },
    { q: 2, r: 0, round: 3, facing: 1, waypoint: true, hold: true }];
  const before = copy(route), markers = courseMarkers(route);
  assert.deepEqual(markers, [{ q: 2, r: 0, actions: [{ round: 1, hold: false, facing: 0 }, { round: 2, hold: false, facing: 1 }, { round: 3, hold: true, facing: 1 }] }]);
  assert.deepEqual(route, before);
  const revisits = copy(route); revisits[2].q = 3;
  assert.deepEqual(courseMarkers(revisits).map(m => m.actions.map(a => a.round)), [[1, 3], [2]]);
  assert.deepEqual(courseMarkers([route[0]]), []);
}
assert.deepEqual(FACE_AT_OFFSET, [2,1,6,5,4,3]);
// Screenshot regression: Asterion heavy cruiser, 16 then 4 requested hexes.
// 48 power - 14 reserve permits 11 hexes at 3 power each, not 20.
{
  const b = createBattle(json("../arena/scenarios/asterion-line.json"), copy(tuning), copy(loadouts), "asterion-line");
  const id = "A-heavy-cruiser-1", o = order([{ turn: 0, forward: 16 }, { turn: 0, forward: 4 }, hold()]);
  // This case is about the POWER ceiling, so put the hull on open water first.
  // Borrowing the featured scenario's geography made it fragile: the flagship's
  // deployment hex there now looks down a lane carrying the asteroid screen and
  // the centre planet, which would clamp the route on terrain and quietly stop
  // this from testing power at all.
  const mover = b.A.find(ship => ship.id === id);
  mover.pos = { q: -20, r: -10 }; mover.facing = 0;
  const p = previewOrders(b, id, o), before = JSON.stringify({ p, o });
  assert.equal(p.available, 48); assert.equal(p.reserve, 14); assert.equal(p.movement, 33);
  assert.deepEqual(courseReadings(p, o).map(r => [r.requested, r.moved, r.limited, r.reason]), [[16, 11, true, "POWER LIMIT"], [4, 0, true, "POWER LIMIT"], [0, 0, false, null]]);
  assert.equal(JSON.stringify({ p, o }), before);
  const endQ = -20 + 11, endR = -10;
  assert.ok(p.actions.every(a => a.end.q === endQ && a.end.r === endR), "all three actions end at the power-limited hex");
  const shorter = order([{ turn: 0, forward: 7 }, { turn: 0, forward: 4 }, hold()]);
  assert.ok(courseReadings(previewOrders(b, id, shorter), shorter).every(r => !r.limited));
  const noReserve = { ...o, reserve: 0 };
  assert.deepEqual(courseReadings(previewOrders(b, id, noReserve), noReserve).map(r => r.moved), [16, 0, 0]);
  assert.deepEqual(courseReadings(null, o), []);
}
assert.deepEqual(HEX_DIRECTIONS, DIRS);
for (const [faction, roster] of Object.entries(tuning.rosters).filter(([, roster]) => Array.isArray(roster))) for (const hull of roster) {
  hulls++;
  const b = fixture({ faction, hull, range:6 });
  for (let facing=0; facing<6; facing++) {
    b.A[0].facing = facing;
    for (const m of b.A[0].mounts) for (let dir=0; dir<6; dir++) {
      const target = add(b.A[0].pos, dir, 3), expected = [2,1,6,5,4,3][(dir-facing+6)%6];
      assert.equal(faceFor(facing, dir), expected);
      assert.equal(m.arc.some(face => inArc(b.A[0],face,target)), m.arc.includes(expected));
      assert.equal((facing+OFFSET_OF_FACE[expected])%6,dir);
      checks++;
    }
    const baseline = JSON.stringify(b), preview = previewOrders(b,b.A[0].id,order([{turn:1,forward:1},hold(),{turn:-1,forward:1}]));
    assert.equal(JSON.stringify(b),baseline,"forecast mutated live battle");
    assert.deepEqual(preview,previewOrders(b,b.A[0].id,order([{turn:1,forward:1},hold(),{turn:-1,forward:1}])));
    assert.equal(preview.actions[0].mounts.some(m=>m.eligible),false);
    assert.equal(preview.actions[2].mounts.some(m=>m.eligible),false);
    assert.ok(Math.abs(preview.fullPower-preview.overhead-preview.deck-preview.weapons-preview.movement-preview.remaining)<1e-7);
  }
}
// Boundary neighbors, including wrap. Exact boundary ties remain owned by the
// canonical bearing function, which both production geometry paths now import.
for (let boundary=0; boundary<6; boundary++) for (const side of [-1,1]) {
  const a=(30+60*boundary+side*1e-6)*Math.PI/180;
  const x=10*Math.cos(a), y=10*Math.sin(a), r=-y/1.5;
  assert.equal(bearing({q:0,r:0},{q:x/Math.sqrt(3)-r/2,r}), (boundary+(side>0?1:0))%6);
}
// Exact execution parity when excluded effects are neutralized.
for (const hull of ["light-cruiser","heavy-cruiser","gunstar-battlecruiser"]) {
  const b=fixture({hull}), a=b.A[0];
  if (a.spinal) { a.spinal.state="ready"; a.spinal.charge=72; }
  const o=order([hold(),{turn:0,forward:12},hold()],.25);
  const p=previewOrders(b,a.id,o), frames=[];
  stepTurn(b,{[a.id]:o,[b.B[0].id]:order()}, {onRound:(turn,round)=>frames.push({pos:copy(a.pos),facing:a.facing,power:a.power,magazine:a.magazine})});
  for (let i=0;i<frames.length;i++) {
    assert.deepEqual(frames[i].pos,{q:p.actions[i].end.q,r:p.actions[i].end.r});
    assert.equal(frames[i].facing,p.actions[i].end.facing);
    assert.ok(Math.abs(frames[i].power-p.actions[i].power)<1e-7,`${hull} action ${i+1} power mismatch`);
    assert.equal(frames[i].magazine,p.actions[i].magazine);
  }
}
{
  const b=fixture({range:30,terrain:[{type:"asteroids",q:1,r:0}]}), a=b.A[0];
  b.tuning.battle.terrainRules.asteroids.moveCostMultiplier=3;
  const p=previewOrders(b,a.id,order([{turn:0,forward:2},hold(),hold()],0));
  assert.equal(p.movement,a.movementPointRatio*4,"terrain multiplier must come from tuning");
  b.tuning.battle.terrain=[{type:"moon",q:1,r:0}];
  const blocked=previewOrders(b,a.id,order([{turn:0,forward:2},hold(),hold()]));
  assert.equal(blocked.actions[0].end.q,0);
  assert.ok(blocked.actions[0].mounts.every(m=>!m.eligible));
  assert.equal(blocked.route.find(p=>p.round===1).hold,false,"blocked movement must not become a firing action");
  assert.equal(courseReadings(blocked, order([{turn:0,forward:2},hold(),hold()]))[0].reason, "TERRAIN / EDGE");
}
{
  const b=fixture({range:4}), a=b.A[0];
  // Hold must be evaluated before the later maneuver, not at its final position.
  const p=previewOrders(b,a.id,order([hold(),{turn:2,forward:2},{turn:2,forward:2}],0));
  assert.ok(p.actions[0].mounts.some(m=>m.eligible));
  assert.deepEqual(p.actions[0].start,{q:0,r:0,facing:0});
  assert.ok(p.actions.slice(1).every(a=>a.mounts.every(m=>!m.eligible)));
  a.mounts.forEach(m=>{m.inop=true;});
  assert.ok(previewOrders(b,a.id,order()).actions[0].mounts.every(m=>m.reason==="Offline"));
  a.destroyed=true; assert.equal(previewOrders(b,a.id,order()),null);
}
{
  const b=fixture({faction:"KRE",hull:"carrier",range:6}), a=b.A[0];
  const p=previewOrders(b,a.id,order());
  assert.ok(p.deck>0,"carrier launch draw missing from forecast");
  a.cloaked=true;
  const cloaked=previewOrders(b,a.id,order([{turn:1,forward:4},hold(),hold()]));
  assert.ok(cloaked.actions.every(a=>a.unavailable));
  assert.equal(cloaked.movement,0,"do not invent a manual cloak trajectory");
  assert.ok(courseReadings(cloaked, order([{turn:1,forward:4},hold(),hold()])).every(r => !r.limited && r.unavailable), "Cloak uncertainty is not an ordinary movement clamp");
}
{
  const b=fixture(), a=b.A[0];
  a.shieldCap=Object.fromEntries([1,2,3,4,5,6].map(n=>[n,2]));
  a.shieldDown[3]=true; a.power=0; a.cores[0].alive=false; a.systems["shield-3"]=2;
  const view=battleView(b).ships[0], rows=shields(view);
  assert.equal(rows[0].percent,Math.round(2/a.hull.maxShieldPower*100));
  assert.equal(rows[0].status,"NO POWER"); assert.equal(rows[2].status,"OFFLINE");
  assert.ok(view.fullPower<view.ratedPower);
  b.tuning.battle.terrain=[{type:"nebula",q:0,r:0}];
  assert.equal(shields(battleView(b).ships[0])[0].status,"BYPASSED");
  b.tuning.battle.terrainRules.nebula.shieldsUseless=false;
  assert.equal(battleView(b).ships[0].shieldsBypassed,false);
  const recorded=snapshotShip(a);
  assert.equal(recorded.shieldMax,a.hull.maxShieldPower); assert.deepEqual(recorded.systems,a.systems);
  assert.equal(recorded.mounts[0].firedThisTurn,!!a.mounts[0].firedThisTurn);
}
// Inspecting/planning must leave the real PRNG sequence unchanged.
{
  const scenario=json("../arena/scenarios/asterion-line.json");
  const a=createBattle(copy(scenario),copy(tuning),copy(loadouts),"preview-rng"), b=createBattle(copy(scenario),copy(tuning),copy(loadouts),"preview-rng");
  for(const ship of a.A) previewOrders(a,ship.id,order());
  stepTurn(a); stepTurn(b);
  assert.deepEqual(battleView(a),battleView(b)); assert.deepEqual(a.stats,b.stats);
}
assert.equal(format(.3825),"0.3825");
assert.equal(shipLabel({id:"A-light-cruiser-2",className:"light-cruiser"}),"Light Cruiser 02");
console.log(`Command station contracts passed: ${hulls} legal hulls; ${checks} mount/heading/bearing cases; forecast, damage and RNG isolation.`);
