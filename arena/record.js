import { makePrng, seedFromString } from "../src/prng.js";
import { fullPower } from "../src/tactical/ship.js";
import { GEOMETRY_RULESET } from "../src/tactical/hex.js";
import { fleetRuleErrors } from '../src/tactical/fleet-rules.js';
import { MISSILE_FLIGHT_PROFILE } from '../src/tactical/missiles.js';
import { buildFleet, buildScenario, deployFleets, runBattle } from "../src/tactical/resolver.js";

export function snapshotShip(ship) {
  return {
    id: ship.id,
    ...(ship.side === 'A' || ship.side === 'B' ? { side: ship.side } : {}),
    faction: ship.faction,
    className: ship.className,
    ...(ship.design ? { design: structuredClone(ship.design), designId: ship.designId, designRevision: ship.designRevision, displayName: ship.displayName } : {}),
    points: ship.points,
    pos: { q: ship.pos.q, r: ship.pos.r },
    facing: ship.facing,
    cloaked: ship.cloaked,
    detected: ship.detected,
    destroyed: ship.destroyed,
    superstructure: ship.superstructure,
    superstructureMax: ship.superstructureMax,
    power: ship.power,
    fullPower: fullPower(ship), reserve: ship.reserve ?? 0,
    shieldMax: ship.hull.maxShieldPower, shieldPointRatio: ship.shieldPointRatio,
    ...(ship.shieldGenerators ? { shieldGenerators: structuredClone(ship.shieldGenerators) } : {}),
    systems: { ...ship.systems }, cores: structuredClone(ship.cores), impulse: ship.impulse,
    spinal: ship.spinal ? { ...ship.spinal } : undefined,
    squadrons: ship.squadrons ? ship.squadrons.map(q => ({ ...q })) : undefined,
    shieldCap: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldCap[face]])),
    shieldDown: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldDown[face]])),
    magazine: ship.magazine,
    // Published explicit stock layouts are also recording data. Old envelope-
    // only fixtures retain their compact shape; no historical replay is edited.
    mounts: ship.mounts.map((mount) => ({ ...(ship.design || mount.position ? structuredClone(mount) : {}), id: mount.id, inop: mount.inop, firedThisTurn: !!mount.firedThisTurn }))
  };
}

// The initial headless frame precedes runBattle's side assignment. Derive side
// from the fleet pair on a shallow copy; never mutate combat to record metadata.
function snapshotFleets(fleets) {
  return fleets.flatMap((fleet, index) => fleet.map(ship => snapshotShip({ ...ship, side: index === 0 ? 'A' : 'B' })));
}

// A turn-start missile can end combat before onRound ever runs. Also capture
// terminal cleanup (e.g. decloaking) that occurs after the last action snapshot.
// This is a recording frame, not an extra engine action: no refill, RNG or damage.
export function appendTerminalFrame(rounds, fleets, result) {
  if (!result) return;
  const ships = snapshotFleets(fleets), last = rounds.at(-1);
  if (last && JSON.stringify(last.ships) === JSON.stringify(ships)) return;
  const turn = result.turns;
  const hasAction = last?.turn === turn && last.round > 0;
  rounds.push({ turn, round: hasAction ? last.round + 1 : 1,
    terminal: true, phase: hasAction ? 'end' : 'impacts', ships });
}

export function mapMeta(tuning) {
  const map = tuning.battle.map;
  if (!map || map.shape !== "rect") return { shape: "hex", radiusHexes: tuning.battle.mapRadiusHexes };
  return { shape: "rect", widthHexes: map.widthHexes, heightHexes: map.heightHexes };
}

function tuningMeta(tuning) {
  return {
    startDistanceHexes: tuning.battle.startDistanceHexes,
    map: mapMeta(tuning),
    mapRadiusHexes: tuning.battle.mapRadiusHexes,
    roundsPerTurn: tuning.battle.roundsPerTurn
  };
}

export function recordBuiltBattle({ fleets, tuning, rng, meta, terrain = [], maxTurns, victory }) {
  const rounds = [];
  const log = [];
  const shots = [];
  let logTurn = 1;
  let logRound = 1;
  rounds.push({ turn: 0, round: 0, ships: snapshotFleets(fleets) });

  const result = runBattle(fleets, tuning, rng, {
    terrain, maxTurns, victory,
    onShot(event) { shots.push(event); },
    log(message) { log.push({ turn: logTurn, round: logRound, message }); },
    onRound(turn, round, liveFleets, missiles = []) {
      rounds.push({ turn, round, ships: snapshotFleets(liveFleets), ...(missiles.length?{missiles:structuredClone(missiles)}:{}) });
      if (round < tuning.battle.roundsPerTurn) {
        logTurn = turn;
        logRound = round + 1;
      } else {
        logTurn = turn + 1;
        logRound = 1;
      }
    }
  });
  appendTerminalFrame(rounds, fleets, result);

  return {
    meta: { version: 3, ...meta, eventGeometry: "resolution-v1", geometryRules: GEOMETRY_RULESET, missileFlight: MISSILE_FLIGHT_PROFILE, tuning: tuningMeta(tuning) },
    rounds,
    shots,
    log,
    result
  };
}

export function recordScenario(scenario, tuning, loadouts, options = { fleetFloorPolicy: 'warn' }) {
  const cleanScenario = JSON.parse(JSON.stringify(scenario));
  const rng = makePrng(seedFromString(cleanScenario.seed));
  const built = buildScenario(cleanScenario, tuning, loadouts, rng, options);
  const composition = (side) => {
    const out = {};
    for (const ship of side.ships) out[ship.className] = (out[ship.className] || 0) + 1;
    return out;
  };
  return recordBuiltBattle({
    ...built,
    rng,
    maxTurns: cleanScenario.maxTurns,
    victory: cleanScenario.victory,
    meta: {
      factions: { A: cleanScenario.sides[0].faction, B: cleanScenario.sides[1].faction },
      comps: { A: composition(cleanScenario.sides[0]), B: composition(cleanScenario.sides[1]) },
      seed: cleanScenario.seed,
      ...(built.warnings?.length ? { warnings: [...built.warnings] } : {}),
      terrain: built.terrain.map((item) => ({ ...item })),
      scenario: cleanScenario
    }
  });
}

export function recordFleetBattle({ factionA, factionB, compA, compB, seed, tuning, loadouts }) {
  // This is fleet construction, not loading an authored scenario. Never turn
  // the scenario exception into an implicit waiver for measurement rosters.
  for (const [faction, comp, label] of [[factionA, compA, 'Side 1'], [factionB, compB, 'Side 2']]) {
    const ships = Object.entries(comp).flatMap(([className, count]) => {
      if (!Number.isSafeInteger(count) || count < 0 || count > 10000) throw new Error(`Invalid count for ${className}`);
      return Array.from({ length: count }, () => ({ className }));
    });
    const errors = fleetRuleErrors({ faction, ships }, tuning, label);
    if (errors.length) throw new Error(errors.join(' '));
  }
  const rng = makePrng(seedFromString(seed));
  const fleetA = buildFleet(factionA, compA, tuning, loadouts, rng, "A");
  const fleetB = buildFleet(factionB, compB, tuning, loadouts, rng, "B");
  deployFleets(fleetA, fleetB, tuning);
  return recordBuiltBattle({
    fleets: [fleetA, fleetB], tuning, rng,
    meta: { factions: { A: factionA, B: factionB }, comps: { A: compA, B: compB }, seed }
  });
}

// Mutable replay shell used by the interactive playfield. Keeping this beside
// the normal recorder makes the viewer-format metadata a single shared rule.
export function createPlayRecord(scenario, battleView) {
  const composition = (side) => {
    const out = {};
    for (const ship of side.ships) out[ship.className] = (out[ship.className] || 0) + 1;
    return out;
  };
  return {
    meta: {
      version: 3,
      eventGeometry: "resolution-v1",
      geometryRules: GEOMETRY_RULESET,
      missileFlight: MISSILE_FLIGHT_PROFILE,
      ...(battleView.warnings?.length ? { warnings: [...battleView.warnings] } : {}),
      factions: { A: scenario.sides[0].faction, B: scenario.sides[1].faction },
      comps: { A: composition(scenario.sides[0]), B: composition(scenario.sides[1]) },
      seed: scenario.seed,
      terrain: JSON.parse(JSON.stringify(battleView.terrain || [])),
      scenario: JSON.parse(JSON.stringify(scenario)),
      tuning: {
        map: { shape: "rect", widthHexes: battleView.map.widthHexes, heightHexes: battleView.map.heightHexes },
        mapRadiusHexes: Math.max(battleView.map.widthHexes, battleView.map.heightHexes) / 2,
        roundsPerTurn: battleView.roundsPerTurn
      },
      orders: []
    },
    rounds: [{ turn: 0, round: 0, ships: JSON.parse(JSON.stringify(battleView.ships)) }],
    shots: [], log: [], result: { victor: null, reason: "battle in progress" }
  };
}
