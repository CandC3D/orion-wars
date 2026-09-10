// Per-weapon targeting and hold fire. Chris, 10 September 2026.
//
// The engine takes `order.mountOrders = { [mountId]: contactId | "hold" }` and is strict about it:
// every key must be one of the ship's mounts and every value a current live contact or "hold".
// A mount with no entry follows the ship's priority target, as before. These helpers keep the
// console's copy of that object honest, so the packet it sends can never be refused.
import { fireSolution } from './fire-solution.js';

export const HOLD = 'hold';
export const mountAssignment = (order, mountId) => order?.mountOrders?.[String(mountId)] ?? null;

// null or 'auto' returns the mount to the ship's priority target.
export function setMountAssignment(order, mountId, value) {
  if (!order) return;
  const key = String(mountId);
  if (value == null || value === 'auto') {
    if (order.mountOrders) delete order.mountOrders[key];
  } else (order.mountOrders ??= {})[key] = value;
  if (order.mountOrders && !Object.keys(order.mountOrders).length) delete order.mountOrders;
}

// Drop anything the engine would refuse: a mount the ship no longer lists, or a contact that is no
// longer a live report (it died, or the track was lost between planning and execution).
export function pruneMountOrders(order, ship, view) {
  if (!order?.mountOrders) return order;
  const mounts = new Set((ship?.mounts ?? []).map(m => String(m.id)));
  const live = new Set((view?.contacts ?? []).filter(c => !c.destroyed).map(c => c.id));
  for (const [key, value] of Object.entries(order.mountOrders))
    if (!mounts.has(key) || (value !== HOLD && !live.has(value))) delete order.mountOrders[key];
  if (!Object.keys(order.mountOrders).length) delete order.mountOrders;
  return order;
}

// One solution per mount against the contact THAT mount will engage: its own assignment if it has
// one, else the ship's priority. A held mount says so and nothing else.
export function mountSolutions(ship, order, view, budget = null) {
  const out = new Map();
  if (!ship || ship.destroyed) return out;
  const live = (view?.contacts ?? []).filter(c => !c.destroyed);
  const preferred = order?.target && order.target !== 'auto' ? live.find(c => c.id === order.target) ?? null : null;
  for (const mount of ship.mounts ?? []) {
    const assigned = mountAssignment(order, mount.id);
    if (assigned === HOLD) { out.set(mount.id, { short: 'HOLD FIRE', full: 'Holding fire this turn by order', state: 'hold', held: true }); continue; }
    const contact = assigned ? live.find(c => c.id === assigned) ?? null : preferred;
    const solution = fireSolution(ship, mount, contact, view, budget);
    if (solution) out.set(mount.id, assigned ? { ...solution, assigned: true } : solution);
  }
  return out;
}
