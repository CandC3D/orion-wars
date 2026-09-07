// Deterministic, deliberately simple observation-only controls. Not model
// submissions, production opponents, or evidence of game balance.
import { bearing, distance } from '../tactical/hex.js';
import { allHoldOrders } from './orders.js';
export function holdCaptain(view, memory) { return { orders: allHoldOrders(view), memory }; }
export function approachCaptain(view, memory) {
  const orders = allHoldOrders(view);
  for (const ship of view.own.filter(s => !s.destroyed)) {
    const target = [...view.contacts].sort((a,b) => distance(ship.pos,a.pos) - distance(ship.pos,b.pos) || (a.id < b.id ? -1 : 1))[0];
    if (!target) continue;
    orders[ship.id].target = target.id;
    if (distance(ship.pos, target.pos) <= 6) continue;
    const direction = bearing(ship.pos, target.pos);
    let turn = (direction - ship.facing + 6) % 6;
    if (turn > 3) turn -= 6;
    orders[ship.id].plan[0] = { turn, forward: 3 };
  }
  return { orders, memory: { turns: (memory?.turns ?? 0) + 1 } };
}
