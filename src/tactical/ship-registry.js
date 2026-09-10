// Chris's vessel registers, dealt independently of the battle PRNG. Like captain-roster,
// draws never touch ships; nameShips is the explicit opt-in that changes recorded ship state.
import { registerSpace, drawRegisterEntry } from './captain-roster.js';

const compareId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function drawShipName(shipId, seed, faction, className, registers, { taken = null } = {}) {
  const register = registers?.[faction];
  const space = registerSpace(register?.classes?.[className]);
  // At most taken.size candidates can be occupied, even when registers overlap across classes.
  const drawn = drawRegisterEntry(space, shipId, seed, { taken, maxRounds: (taken?.size ?? 0) + 1 });
  if (!drawn) return null;
  const prefix = register.prefix ?? '', name = drawn.name;
  return { prefix, name, full: prefix ? `${prefix} ${name}` : name };
}

// Call once per fleet. Dealing in id order makes array order irrelevant; one set per power
// spans ALL classes, including Krelath's Ranger and Starwing entries in multiple registers.
// Separate calls let opposing fleets of the same power reuse their navy's names independently.
// Accept either the whole data/ship-names.json or the registers inside it. Both callers in this
// repo are correct today, but they disagree about which they hand over, and getting it wrong
// produced NOTHING - no error, no names, a silently unnamed fleet. That is the failure mode that
// costs an evening looking at a deploy and concluding it never shipped. Normalise, and refuse
// loudly when a caller has asked for names and handed over nothing usable.
export function normaliseRegisters(registers) {
  const source = registers?.registers ?? registers;
  if (!source || typeof source !== 'object' || !Object.values(source).some(r => r?.classes))
    throw new Error('Ship name registers are unusable: expected data/ship-names.json or its registers object');
  return source;
}

export function drawShipNames(ships, seed, input) {
  const registers = normaliseRegisters(input);
  const out = {}, takenByFaction = new Map();
  for (const ship of [...(ships ?? [])].sort((a, b) => compareId(a.id, b.id))) {
    if (!ship?.id || !ship.faction || !ship.className) continue;
    if (!takenByFaction.has(ship.faction)) takenByFaction.set(ship.faction, new Set());
    const name = drawShipName(ship.id, seed, ship.faction, ship.className, registers,
      { taken: takenByFaction.get(ship.faction) });
    if (name) out[ship.id] = name;
  }
  return out;
}

// The one mutating helper. displayName belongs to the Drydock design, never the vessel.
export function nameShips(ships, seed, registers) {
  const drawn = drawShipNames(ships, seed, registers);
  for (const ship of ships ?? []) if (drawn[ship.id]) ship.vesselName = drawn[ship.id];
  return drawn;
}
