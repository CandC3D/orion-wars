// Shared validation for restricted packets and direct host orders. No mutation.
export function mountOrdersError(ship, targets, orders) {
  if (!orders || typeof orders !== 'object' || Array.isArray(orders) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(orders)))
    return 'Mount orders must be an object';
  // Legacy fits use numeric mount IDs; object keys are always strings.
  const mounts = new Set(ship.mounts.map(m => String(m.id)));
  for (const id of Reflect.ownKeys(orders)) {
    if (!mounts.has(id)) return 'Unknown mount id';
    const descriptor = Object.getOwnPropertyDescriptor(orders, id);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return 'Invalid mount order';
    const target = descriptor.value;
    if (typeof target !== 'string' || (target !== 'hold' && !targets.has(target)))
      return 'Mount target is not a current contact or hold';
  }
  return null;
}
