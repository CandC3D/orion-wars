// Temporary browser-safe playfield adapter. Its four exports deliberately
// match docs/playfield-contract.md; replace this module when the stepped
// resolver lands, without changing arena/play.js.

const DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];
const FACES = [1, 2, 3, 4, 5, 6];
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const normalFacing = (value) => ((Math.trunc(Number(value) || 0) % 6) + 6) % 6;
const hexKey = ({ q, r }) => `${q},${r}`;

function fullPowerFor(hull) { return hull.cores * hull.corePower + hull.impulsePower; }
function inMap(pos, map) {
  return Math.abs(pos.q + pos.r / 2) <= map.widthHexes / 2 + 1e-9 &&
    Math.abs(pos.r) <= map.heightHexes / 2 + 1e-9;
}
function distance(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}
function terrainSets(terrain) {
  const impassable = new Set(), fields = new Set();
  for (const item of terrain || []) {
    const footprint = [{ q: item.q, r: item.r }];
    if (item.type === "planet") for (const d of DIRS) footprint.push({ q: item.q + d.q, r: item.r + d.r });
    const target = item.type === "asteroids" ? fields : (item.type === "nebula" ? null : impassable);
    if (target) for (const pos of footprint) target.add(hexKey(pos));
  }
  return { impassable, fields };
}
function scaledWeapon(type, hull, tuning) {
  const weapon = tuning.weapons[type] || { maxRange: 1, rangeBands: [] };
  const reach = hull.weaponReach ?? 1;
  return {
    maxRange: Math.max(1, Math.round(weapon.maxRange * reach)),
    bands: (weapon.rangeBands || []).map((band) => ({ ...band, to: Math.max(1, Math.round(band.to * reach)) }))
  };
}
function buildMounts(faction, className, hull, tuning, loadouts) {
  const lo = loadouts[faction]?.[className] ?? loadouts[faction]?._default ?? {};
  const beamMounts = lo.beamMounts ?? hull.beamMounts ?? 0;
  const missileMounts = lo.missileMounts ?? hull.missileMounts ?? 0;
  const beamArcs = lo.beamArcs ?? hull.beamArcs ?? ["f"];
  const missileArcs = lo.missileArcs ?? hull.missileArcs ?? ["f"];
  const mounts = [];
  const add = (type, kind, arcName) => mounts.push({
    id: mounts.length + 1, type, kind, arcName,
    arc: [...(tuning.arcs[arcName] ?? tuning.arcs.f)],
    ...scaledWeapon(type, hull, tuning), inop: false, firedThisTurn: false
  });
  for (let i = 0; i < beamMounts; i++) add(lo.beam, "beam", beamArcs[i % beamArcs.length]);
  const mix = Object.entries(lo.missileMix ?? {});
  if (missileMounts && mix.length) {
    const counts = mix.map(([type, fraction]) => ({ type, exact: fraction * missileMounts }));
    let assigned = 0;
    for (const entry of counts) { entry.n = Math.floor(entry.exact); assigned += entry.n; }
    counts.sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
    for (let i = 0; assigned < missileMounts; i++, assigned++) counts[i % counts.length].n++;
    let mountIndex = 0;
    for (const entry of counts) for (let i = 0; i < entry.n; i++, mountIndex++) {
      add(entry.type, "missile", missileArcs.length ? missileArcs[mountIndex % missileArcs.length] : "f");
    }
  }
  const spinal = lo.spinal ?? hull.spinal;
  if (spinal) add(spinal, "spinal", (lo.spinalArcs ?? hull.spinalArcs ?? ["f"])[0]);
  return mounts;
}
function deployment(sideIndex, shipIndex, map) {
  return { q: sideIndex ? Math.floor(map.widthHexes / 4) : -Math.floor(map.widthHexes / 4), r: (shipIndex - 2) * 2 };
}
function buildSquadrons(shipId, hangar) {
  if (!hangar) return null;
  const out = [];
  for (const [type, spec] of Object.entries(hangar)) for (let i = 0; i < (spec.squadrons ?? 0); i++) out.push({
    id: `${shipId}/${type}-${i + 1}`, type, strength: spec.strength, max: spec.strength, launched: false, stance: "offence"
  });
  return out.length ? out : null;
}

export function createBattle(scenario, tuning, loadouts, seed) {
  const clean = clone(scenario);
  const map = { ...(tuning.battle.map || {}), ...(clean.map || {}), shape: "rect" };
  const fleets = clean.sides.map((side, sideIndex) => side.ships.map((spec, index) => {
    const hull = tuning.hullClasses[spec.className];
    if (!hull) throw new Error(`unknown hull class: ${spec.className}`);
    const mod = tuning.factionModifiers?.[side.faction] ?? {};
    const fullPower = fullPowerFor(hull);
    const id = `${sideIndex ? "B" : "A"}-${spec.className}-${index + 1}`;
    const mounts = buildMounts(side.faction, spec.className, hull, tuning, loadouts);
    const maximum = Math.round(hull.superstructure * (mod.superstructure ?? 1));
    return {
      id, faction: side.faction, side: sideIndex ? "B" : "A", className: spec.className, points: hull.points,
      pos: Number.isFinite(spec.q) && Number.isFinite(spec.r) ? { q: spec.q, r: spec.r } : deployment(sideIndex, index, map),
      facing: normalFacing(Number.isFinite(spec.facing) ? spec.facing : (sideIndex ? 3 : 0)),
      destroyed: false, cloaked: false, detected: true, superstructure: maximum, max: maximum, superstructureMax: maximum,
      power: fullPower, fullPower, reserve: 0,
      movementPointRatio: hull.movementPointRatio * (mod.movementPointRatio ?? 1),
      turnRate: tuning.movement.turnRatePerRound[spec.className] ?? 2,
      shieldCap: Object.fromEntries(FACES.map((face) => [face, hull.maxShieldPower])),
      shieldDown: Object.fromEntries(FACES.map((face) => [face, false])),
      magazine: (loadouts[side.faction]?.[spec.className]?.magazine ?? hull.magazine ?? 0),
      mounts, squadrons: buildSquadrons(id, hull.hangar),
      spinal: mounts.some((mount) => mount.kind === "spinal") ? { type: mounts.find((mount) => mount.kind === "spinal").type, state: "charging", charge: 0, cooldown: 0, readyTurns: 0, holdLogged: false, shots: 0 } : null
    };
  }));
  return { turn: 1, fleets, terrain: clone(clean.terrain || []), tuning, loadouts, seed: String(seed ?? clean.seed ?? "orion"), result: null, map, scenario: clean };
}

export function battleView(battle) {
  return {
    ships: battle.fleets.flat().map(clone),
    fleets: { A: battle.fleets[0].map((s) => s.id), B: battle.fleets[1].map((s) => s.id) },
    terrain: clone(battle.terrain), turn: battle.turn,
    roundsPerTurn: battle.tuning.battle.roundsPerTurn, map: clone(battle.map), result: clone(battle.result)
  };
}

export function shipPlan(battle, shipId) {
  const ship = battle.fleets.flat().find((entry) => entry.id === shipId);
  if (!ship || ship.destroyed) return null;
  const spendable = Math.max(0, ship.fullPower * (1 - clamp(ship.reserve || 0, 0, 1)));
  return {
    turnRate: ship.turnRate, movementPointRatio: ship.movementPointRatio, spendable,
    maxHexesPerRound: Math.floor(spendable / ship.movementPointRatio),
    stepCosts: { normal: ship.movementPointRatio, asteroids: ship.movementPointRatio * (battle.tuning.battle.terrainRules?.asteroids?.moveCostMultiplier ?? 2) }
  };
}

function snapshot(ship) { return clone(ship); }
function logClamp(log, turn, round, ship, reason) { log.push({ turn, round, message: `${ship.id} clamped: ${reason}` }); }
function desiredFacing(from, to) {
  let best = 0, score = Infinity;
  for (let facing = 0; facing < 6; facing++) {
    const d = DIRS[facing], next = { q: from.q + d.q, r: from.r + d.r };
    const value = distance(next, to);
    if (value < score) { score = value; best = facing; }
  }
  return best;
}
function signedTurn(from, to, limit) {
  const ccw = (to - from + 6) % 6, cw = ccw - 6;
  const delta = Math.abs(cw) < Math.abs(ccw) ? cw : ccw;
  return clamp(delta, -limit, limit);
}

export function stepTurn(battle, orders = {}, opts = {}) {
  if (battle.result) return { turn: battle.turn, rounds: [], shots: [], log: [], result: clone(battle.result) };
  const turnNo = battle.turn, rounds = [], shots = [], log = [];
  const sets = terrainSets(battle.terrain);
  for (const ship of battle.fleets.flat()) {
    ship.power = ship.fullPower;
    ship.reserve = clamp(Number(orders[ship.id]?.reserve ?? 0), 0, 1);
    if (Number(orders[ship.id]?.reserve) !== ship.reserve && orders[ship.id]?.reserve !== undefined) logClamp(log, turnNo, 1, ship, "reserve must be between 0 and 1");
    for (const mount of ship.mounts) mount.firedThisTurn = false;
  }
  const roundsPerTurn = battle.tuning.battle.roundsPerTurn;
  for (let roundNo = 1; roundNo <= roundsPerTurn; roundNo++) {
    for (const ship of battle.fleets.flat()) {
      if (ship.destroyed) continue;
      const order = orders[ship.id];
      let requestedTurn = 0, requestedForward = 0;
      if (order) {
        const entry = order.plan?.[roundNo - 1] ?? {};
        requestedTurn = Math.trunc(Number(entry.turn) || 0);
        requestedForward = Math.max(0, Math.trunc(Number(entry.forward) || 0));
      } else {
        const enemies = battle.fleets[ship.side === "A" ? 1 : 0].filter((candidate) => !candidate.destroyed);
        const target = enemies.sort((a, b) => distance(ship.pos, a.pos) - distance(ship.pos, b.pos))[0];
        if (target) { requestedTurn = signedTurn(ship.facing, desiredFacing(ship.pos, target.pos), ship.turnRate); requestedForward = 1; }
      }
      const actualTurn = clamp(requestedTurn, -ship.turnRate, ship.turnRate);
      if (actualTurn !== requestedTurn) logClamp(log, turnNo, roundNo, ship, `turn rate ${ship.turnRate}; requested ${requestedTurn}, executed ${actualTurn}`);
      ship.facing = normalFacing(ship.facing + actualTurn);
      let moved = 0;
      const available = Math.max(0, ship.fullPower * (1 - ship.reserve));
      while (moved < requestedForward) {
        const d = DIRS[ship.facing], next = { q: ship.pos.q + d.q, r: ship.pos.r + d.r };
        if (!inMap(next, battle.map)) { logClamp(log, turnNo, roundNo, ship, `map edge after ${moved} hexes`); break; }
        if (sets.impassable.has(hexKey(next))) { logClamp(log, turnNo, roundNo, ship, `impassable terrain after ${moved} hexes`); break; }
        const multiplier = sets.fields.has(hexKey(next)) ? (battle.tuning.battle.terrainRules?.asteroids?.moveCostMultiplier ?? 2) : 1;
        const cost = ship.movementPointRatio * multiplier;
        if (ship.fullPower - ship.power + cost > available + 1e-9) { logClamp(log, turnNo, roundNo, ship, `power exhausted after ${moved} hexes`); break; }
        ship.pos = next; ship.power -= cost; moved++;
      }
      if (requestedForward < 0) logClamp(log, turnNo, roundNo, ship, "forward movement cannot be negative");
      if (order && actualTurn === requestedTurn && moved === requestedForward) log.push({ turn: turnNo, round: roundNo, message: `${ship.id} moves as ordered (${moved} hex${moved === 1 ? "" : "es"}).` });
    }
    const frame = { turn: turnNo, round: roundNo, ships: battle.fleets.flat().map(snapshot) };
    rounds.push(frame); opts.onRound?.(turnNo, roundNo, battle.fleets);
  }
  if (battle.turn >= battle.tuning.battle.maxTurns) battle.result = { victor: null, reason: "turn limit" };
  battle.turn++;
  for (const entry of log) opts.log?.(entry.message);
  return { turn: turnNo, rounds, shots, log, result: clone(battle.result) };
}

export const __test = { DIRS, terrainSets, distance };
