// Turn resolution — WEGO. All three powers' orders are collected, then resolve
// in phases: movement, combat, assault, economy, diplomacy/unrest (§4).
// Headless: no DOM, no rendering. Drivable entirely from the test harness.

import { TUNING } from "./tuning.js";
import { makePrng } from "./prng.js";
import { buildGraph, shortestPath, neighbors, supplySet, ownerOf } from "./map.js";
import { FACTIONS, addFleet, fleetsAt } from "./model.js";
import { validateOrder } from "./orders.js";
import { placeholderResolver } from "./combat.js";

export class Engine {
  constructor(mapData, factionData, tuning = TUNING, combatResolver = placeholderResolver) {
    this.mapData = mapData;
    this.factionData = factionData;
    this.tuning = tuning;
    this.graph = buildGraph(mapData);
    this.combat = combatResolver;
  }

  // ordersByFaction: { FED: [...], KLI: [...], ROM: [...] } — plotted simultaneously.
  resolveTurn(state, ordersByFaction) {
    if (state.over) throw new Error("war is over");
    const rng = makePrng(state.rngState);
    state.orderLog.push({ turn: state.turn, orders: ordersByFaction });

    const accepted = this.#acceptOrders(state, ordersByFaction);
    this.#applyOrders(state, accepted);
    this.#movementPhase(state);
    this.#combatPhase(state, rng);
    this.#assaultPhase(state, rng);       // Phase 2: capacity vs garrison
    this.#economyPhase(state);
    this.#unrestPhase(state, rng);        // Phase 5: unrest, revolts, absorption

    state.rngState = rng.state;
    state.turn += 1;
    if (state.turn > this.tuning.warLengthTurns) {
      state.over = true;
      state.result = this.reckoning(state);
      this.#log(state, `War ends. Worlds held — ${FACTIONS.map((f) => `${f}: ${state.result.held[f]}`).join(", ")}`);
    }
    return state;
  }

  #acceptOrders(state, ordersByFaction) {
    const accepted = [];
    for (const faction of FACTIONS) {
      for (const order of ordersByFaction[faction] ?? []) {
        const err = validateOrder(state, this.graph, this.factionData, faction, order);
        if (err) {
          this.#log(state, `T${state.turn} ${faction} order rejected (${err}): ${JSON.stringify(order)}`);
        } else {
          accepted.push({ faction, order });
        }
      }
    }
    return accepted;
  }

  #applyOrders(state, accepted) {
    for (const { faction, order } of accepted) {
      if (order.type === "move") {
        const fleet = state.fleets[order.fleetId];
        fleet.path = shortestPath(this.graph, fleet.location, order.destination, faction) ?? [];
        fleet.progress = 0;
      } else if (order.type === "hold") {
        state.fleets[order.fleetId].path = [];
      } else if (order.type === "build") {
        const ship = this.factionData.factions[faction].ships[order.classId];
        state.factions[faction].points -= ship.cost;
        state.buildQueue.push({
          faction,
          classId: order.classId,
          locationId: order.locationId,
          turnsLeft: Math.max(
            1,
            Math.ceil(ship.cost / (this.tuning.buildPointsPerTurn * (this.tuning.buildSpeedMult[faction] ?? 1)))
          )
        });
      }
    }
  }

  #fleetSpeed(fleet, faction) {
    const ships = this.factionData.factions[faction].ships;
    let speed = Infinity;
    for (const classId of Object.keys(fleet.ships)) {
      speed = Math.min(speed, ships[classId].speed);
    }
    return speed === Infinity ? 1 : speed;
  }

  #movementPhase(state) {
    const supplyByFaction = {};
    for (const f of FACTIONS) supplyByFaction[f] = supplySet(this.graph, state, f, this.tuning);
    for (const fleet of Object.values(state.fleets)) {
      if (!fleet.path.length) continue;
      const inSupply = supplyByFaction[fleet.faction].has(fleet.location);
      const penalty = inSupply ? 0 : this.tuning.outOfSupplyMovePenalty;
      // budget is hop-points per turn; a lane costs (length + supply penalty).
      // progress carries across turns so multi-turn lanes take multiple turns.
      let budget = this.#fleetSpeed(fleet, fleet.faction);
      while (fleet.path.length && budget > 0) {
        const nextId = fleet.path[0];
        const lane = neighbors(this.graph, fleet.location).find((e) => e.to === nextId);
        const cost = (lane?.length ?? 1) + penalty;
        const spend = Math.min(budget, cost - fleet.progress);
        fleet.progress += spend;
        budget -= spend;
        if (fleet.progress >= cost) {
          fleet.location = nextId;
          fleet.path.shift();
          fleet.progress = 0;
        }
      }
    }
  }

  #combatPhase(state, rng) {
    const contested = new Map(); // nodeId -> Set(factions)
    for (const fleet of Object.values(state.fleets)) {
      if (!contested.has(fleet.location)) contested.set(fleet.location, new Set());
      contested.get(fleet.location).add(fleet.faction);
    }
    for (const [nodeId, factions] of contested) {
      if (factions.size < 2) continue;
      const node = this.graph.nodes.get(nodeId);
      const supply = {};
      for (const f of factions) supply[f] = supplySet(this.graph, state, f, this.tuning).has(nodeId);
      const context = {
        location: nodeId,
        forces: [...factions].map((f) => ({
          faction: f,
          fleets: fleetsAt(state, nodeId).filter((fl) => fl.faction === f)
        })),
        starbase: !!node.base,
        nebula: !!node.nebula,
        supply,
        rng
      };
      const outcome = this.combat.resolve(context);
      if (!outcome.resolved) {
        this.#log(state, `T${state.turn} stand-off at ${node.name} (${[...factions].join(" vs ")}) — combat resolver is a Phase 1 stub`);
      }
    }
  }

  #assaultPhase(state, rng) {
    // Phase 2: two-phase conquest — space superiority, then assault capacity
    // vs. garrison. No captures at Phase 1.
  }

  #economyPhase(state) {
    // Production: only worlds in supply produce for their owner.
    for (const f of FACTIONS) {
      const inSupply = supplySet(this.graph, state, f, this.tuning);
      let income = 0;
      for (const [id, node] of this.graph.nodes) {
        if (ownerOf(state, id) !== f) continue;
        if (!inSupply.has(id)) continue;
        income += node.production ?? (node.size ?? 0) * this.tuning.productionPerSize;
      }
      state.factions[f].points += Math.round(income * (this.tuning.incomeMult[f] ?? 1));
    }
    // Construction delivery.
    const remaining = [];
    for (const job of state.buildQueue) {
      job.turnsLeft -= 1;
      if (job.turnsLeft <= 0) {
        addFleet(state, job.faction, job.locationId, { [job.classId]: 1 });
        this.#log(state, `T${state.turn} ${job.faction} ${job.classId} delivered at ${job.locationId}`);
      } else {
        remaining.push(job);
      }
    }
    state.buildQueue = remaining;
    // Reinforcements at entry arrows — the tempo knob.
    if (state.turn % this.tuning.reinforcementIntervalTurns === 0) {
      for (const f of FACTIONS) {
        const entries = [...this.graph.nodes.values()].filter((n) => n.entryFor === f);
        if (!entries.length) continue;
        const packet = this.tuning.reinforcementPackets[f];
        addFleet(state, f, entries[0].id, packet);
        this.#log(state, `T${state.turn} ${f} reinforcements arrive at ${entries[0].name}`);
      }
    }
  }

  #unrestPhase(state, rng) {
    // Phase 5: occupation unrest, revolts, bloc grievances, Federation absorption.
  }

  reckoning(state) {
    const held = Object.fromEntries(FACTIONS.map((f) => [f, 0]));
    for (const [id, node] of this.graph.nodes) {
      if (node.region !== "CONTESTED") continue;
      const owner = ownerOf(state, id);
      if (owner in held) held[owner] += 1;
    }
    return { held };
  }

  #log(state, msg) {
    state.log.push(msg);
  }
}
