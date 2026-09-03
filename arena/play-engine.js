// Playfield engine adapter — the REAL engine (docs/playfield-contract.md).
//
// The tactical engine is dependency-free ES modules, so it runs in the
// browser unchanged. This module adapts its turn-stepping API to the shape
// the playfield page consumes: frames in the viewer's format, shot events
// stamped with turn and round, log lines as {turn, round, message}. It
// replaced the mock adapter Sol built the page against; the public surface
// is identical, which is the whole point of the contract.
import {
  createBattle as engineCreate,
  stepTurn as engineStep,
  battleView as engineView,
  shipPlan as enginePlan
} from "../src/tactical/resolver.js";
import { snapshotShip } from "./record.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createBattle(scenario, tuning, loadouts, seed) {
  const battle = engineCreate(clone(scenario), tuning, loadouts, String(seed ?? scenario.seed ?? "orion"));
  const view = engineView(battle);
  battle.map = view.map;           // the page reads battle.map / view.map
  battle.loadouts = loadouts;
  return battle;
}

export function battleView(battle) {
  const view = engineView(battle);
  return {
    ...view,
    ships: view.ships.map((s) => ({ ...s, max: s.superstructureMax })),
    fleets: { A: battle.A.map((s) => s.id), B: battle.B.map((s) => s.id) },
    map: clone(view.map),
    result: view.result ? clone(view.result) : null
  };
}

export function shipPlan(battle, shipId) {
  const ship = battle.fleets.flat().find((s) => s.id === shipId);
  if (!ship || ship.destroyed) return null;
  const plan = enginePlan(battle, shipId);
  const spendable = Math.max(0, plan.fullPower * (1 - plan.defaultReserveFraction));
  return {
    ...plan,
    spendable,
    maxHexesPerRound: Math.floor(spendable / Math.max(0.1, plan.movementPointRatio)),
    stepCosts: { normal: plan.movementPointRatio, asteroids: plan.movementPointRatio * plan.asteroidFieldCostMultiplier }
  };
}

// One turn. Frames are taken at the end of every round (as the recorder
// does); shots arrive already stamped with turn and round; log lines are
// assigned to the round in progress.
export function stepTurn(battle, orders = {}, opts = {}) {
  if (battle.done) return { turn: battle.turn, rounds: [], shots: [], log: [], result: clone(battle.result) };
  const turnNo = battle.turn;
  const rounds = [], shots = [], log = [];
  let roundInProgress = 1;
  const result = engineStep(battle, orders, {
    log: (message) => { log.push({ turn: turnNo, round: roundInProgress, message }); if (opts.log) opts.log(message); },
    onShot: (event) => { shots.push(event); if (opts.onShot) opts.onShot(event); },
    onRound: (turn, round, fleets) => {
      rounds.push({ turn, round, ships: fleets.flat().map(snapshotShip) });
      roundInProgress = round + 1;
      if (opts.onRound) opts.onRound(turn, round, fleets);
    }
  });
  return { turn: turnNo, rounds, shots, log, result: result.result ? clone(result.result) : null };
}
