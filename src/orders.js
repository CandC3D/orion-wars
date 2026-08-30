// Order model, validation, and random legal-order generation (the Phase 1
// "AI" — all three powers plot through this same interface).
//
// Order shapes:
//   { type: "move",  fleetId, destination }        — travel via shortest legal path
//   { type: "hold",  fleetId }
//   { type: "build", classId, locationId }         — spend points, queue delivery

import { shortestPath, canEnter, ownerOf } from "./map.js";

export function validateOrder(state, graph, factionData, faction, order) {
  switch (order.type) {
    case "move": {
      const fleet = state.fleets[order.fleetId];
      if (!fleet || fleet.faction !== faction) return "not your fleet";
      if (!graph.nodes.has(order.destination)) return "unknown destination";
      if (!canEnter(graph, order.destination, faction)) return "deterrence: home sphere closed";
      const path = shortestPath(graph, fleet.location, order.destination, faction);
      if (path === null) return "no legal route";
      return null;
    }
    case "hold": {
      const fleet = state.fleets[order.fleetId];
      if (!fleet || fleet.faction !== faction) return "not your fleet";
      return null;
    }
    case "build": {
      const ship = factionData.factions[faction].ships[order.classId];
      if (!ship) return "unknown ship class";
      const node = graph.nodes.get(order.locationId);
      if (!node) return "unknown location";
      if (!node.constructionCapable) return "not construction-capable";
      if (ownerOf(state, order.locationId) !== faction) return "not your world";
      if (state.factions[faction].points < ship.cost) return "insufficient points";
      return null;
    }
    default:
      return `unknown order type: ${order.type}`;
  }
}

// Random legal orders for one faction — drives the Phase 1 test harness.
export function randomOrders(state, graph, factionData, faction, rng) {
  const orders = [];
  const myFleets = Object.values(state.fleets).filter((f) => f.faction === faction);
  const destinations = [...graph.nodes.keys()].filter((id) => canEnter(graph, id, faction));

  for (const fleet of myFleets) {
    if (rng.next() < 0.7) {
      const destination = rng.pick(destinations);
      const order = { type: "move", fleetId: fleet.id, destination };
      if (validateOrder(state, graph, factionData, faction, order) === null) {
        orders.push(order);
        continue;
      }
    }
    orders.push({ type: "hold", fleetId: fleet.id });
  }

  // Spend points greedily on random affordable hulls at random owned yards.
  const yards = [...graph.nodes.values()]
    .filter((n) => n.constructionCapable && ownerOf(state, n.id) === faction)
    .map((n) => n.id);
  if (yards.length) {
    const classes = Object.entries(factionData.factions[faction].ships);
    let budget = state.factions[faction].points;
    let tries = 4;
    while (tries-- > 0) {
      const [classId, ship] = rng.pick(classes);
      if (ship.cost <= budget) {
        orders.push({ type: "build", classId, locationId: rng.pick(yards) });
        budget -= ship.cost;
      }
    }
  }
  return orders;
}
