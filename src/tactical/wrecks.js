// A retained observation, never a view of the dead hull's current truth state.
export function wreckContact(contact, turn) {
  return { id: contact.id, faction: contact.faction, className: contact.className,
    ...(contact.vesselName ? { vesselName: structuredClone(contact.vesselName) } : {}),
    pos: { ...contact.pos }, facing: contact.facing, destroyed: true, wreckedTurn: turn };
}
export function rememberedWrecks(contacts, side) {
  return Object.values(contacts.wrecks?.[side] ?? {}).map(wreck => structuredClone(wreck));
}
