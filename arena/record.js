import { makePrng, seedFromString } from "../src/prng.js";
import { buildFleet, buildScenario, deployFleets, runBattle } from "../src/tactical/resolver.js";

export function snapshotShip(ship) {
  return {
    id: ship.id,
    faction: ship.faction,
    className: ship.className,
    points: ship.points,
    pos: { q: ship.pos.q, r: ship.pos.r },
    facing: ship.facing,
    cloaked: ship.cloaked,
    detected: ship.detected,
    destroyed: ship.destroyed,
    superstructure: ship.superstructure,
    superstructureMax: ship.superstructureMax,
    power: ship.power,
    shieldCap: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldCap[face]])),
    shieldDown: Object.fromEntries([1, 2, 3, 4, 5, 6].map((face) => [face, ship.shieldDown[face]])),
    magazine: ship.magazine,
    mounts: ship.mounts.map((mount) => ({ id: mount.id, inop: mount.inop }))
  };
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

export function recordBuiltBattle({ fleets, tuning, rng, meta, terrain = [] }) {
  const rounds = [];
  const log = [];
  const shots = [];
  let logTurn = 1;
  let logRound = 1;
  rounds.push({ turn: 0, round: 0, ships: fleets.flat().map(snapshotShip) });

  const result = runBattle(fleets, tuning, rng, {
    terrain,
    onShot(event) { shots.push(event); },
    log(message) { log.push({ turn: logTurn, round: logRound, message }); },
    onRound(turn, round, liveFleets) {
      rounds.push({ turn, round, ships: liveFleets.flat().map(snapshotShip) });
      if (round < tuning.battle.roundsPerTurn) {
        logTurn = turn;
        logRound = round + 1;
      } else {
        logTurn = turn + 1;
        logRound = 1;
      }
    }
  });

  return {
    meta: { version: 3, ...meta, tuning: tuningMeta(tuning) },
    rounds,
    shots,
    log,
    result
  };
}

export function recordScenario(scenario, tuning, loadouts) {
  const cleanScenario = JSON.parse(JSON.stringify(scenario));
  const rng = makePrng(seedFromString(cleanScenario.seed));
  const built = buildScenario(cleanScenario, tuning, loadouts, rng);
  const composition = (side) => {
    const out = {};
    for (const ship of side.ships) out[ship.className] = (out[ship.className] || 0) + 1;
    return out;
  };
  return recordBuiltBattle({
    ...built,
    rng,
    meta: {
      factions: { A: cleanScenario.sides[0].faction, B: cleanScenario.sides[1].faction },
      comps: { A: composition(cleanScenario.sides[0]), B: composition(cleanScenario.sides[1]) },
      seed: cleanScenario.seed,
      terrain: built.terrain.map((item) => ({ ...item })),
      scenario: cleanScenario
    }
  });
}

export function recordFleetBattle({ factionA, factionB, compA, compB, seed, tuning, loadouts }) {
  const rng = makePrng(seedFromString(seed));
  const fleetA = buildFleet(factionA, compA, tuning, loadouts, rng, "A");
  const fleetB = buildFleet(factionB, compB, tuning, loadouts, rng, "B");
  deployFleets(fleetA, fleetB, tuning);
  return recordBuiltBattle({
    fleets: [fleetA, fleetB], tuning, rng,
    meta: { factions: { A: factionA, B: factionB }, comps: { A: compA, B: compB }, seed }
  });
}
