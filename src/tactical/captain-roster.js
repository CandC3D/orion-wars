// Who is on the bridge. Draws named officers for a fleet from the registers in
// data/captain-names.json, which are Chris's fiction; this module only deals them out.
//
// Two rules govern the whole file, and they are the reason it looks the way it does.
//
// IT MUST NOT TOUCH THE BATTLE PRNG. All engine randomness flows through one instance whose state
// lives in the game state, so drawing a name from it would shift every roll after it and change
// every recorded battle and the entire balance corpus. Each ship therefore gets its own independent
// stream, hashed from the battle seed and the ship id, and the battle's own generator is never
// advanced by so much as one call.
//
// THE NAME CHANGES NOTHING; COMMISSIONING CHANGES EVERYTHING. Drawing a name moves no threshold, and
// a drawn officer takes the standing posture. But a hull with no record is not running the rules
// under a default profile - it is not running them at all, because every touch point in the resolver
// is guarded by `if (ship.captain)`. Attaching the first record arms all of them, and standard
// posture still holds a hurt ship outside three hexes.
//
// I wrote the opposite here and told Chris so twice, until Astra reproduced the difference on
// 2026-09-09: a hurt light cruiser closes four hexes unofficered and three with an officer. So
// commissioning a fleet is a BALANCE CHANGE and the corpus must be re-measured against it. See the
// check "but COMMISSIONING changes behaviour" in test/captain-roster.mjs.
import { makePrng, seedFromString } from '../prng.js';
import { DEFAULT_POSTURE } from './ship-command.js';

const ORDINALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
const compareId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// A register comes in one of two shapes, and which one a power gets is a fact about the species
// rather than a convenience. The Federation and the Krelath have a personal name AND a family name,
// so they carry pools that combine and a wardroom is never the same twice. The Vraygon and the
// Zandrax have one name each, so they carry a written-out list.
//
// Both are presented here as a single flat index space - for a combining register, the cross product
// laid out family-fastest. That is what lets the collision probe, the officer ids and the ordinal
// overflow below be written once and behave identically whichever shape they are reading.
export function registerSpace(register) {
  if (!register) return null;
  if (Array.isArray(register.names) && register.names.length) {
    const names = register.names;
    return { size: names.length, at: i => names[i] };
  }
  const given = register.given ?? [], family = register.family ?? [];
  if (!given.length || !family.length) return null;
  return { size: given.length * family.length,
    at: i => `${given[Math.floor(i / family.length)]} ${family[i % family.length]}` };
}

// One officer, drawn for one hull. Pure: same seed, same ship id, same register, same officer -
// every time, on any machine, without reference to what any other ship drew.
//
// `taken` carries the names already dealt in this fleet so a battle does not field two Capt. Scott
// Ridleys. A collision probes forward through the index space rather than re-rolling, because
// probing stays deterministic no matter how many ships collided before it. A space that runs out -
// a Zandrax swarm can field more hulls than the horde has names - starts again with an ordinal, the
// way a navy disambiguates a reused name. For a combining register that is effectively unreachable:
// the Federation pools cross to ten thousand officers.
export function drawCaptain(shipId, seed, faction, registers, { posture = DEFAULT_POSTURE, taken = null } = {}) {
  const register = registers?.[faction];
  const space = registerSpace(register);
  if (!space) return null;
  const rng = makePrng(seedFromString(`${seed}:${shipId}`));
  const start = rng.int(space.size);
  for (let round = 0; round < ORDINALS.length; round++) {
    for (let step = 0; step < space.size; step++) {
      const index = (start + step) % space.size;
      const personalName = space.at(index) + ORDINALS[round];
      if (taken && taken.has(personalName)) continue;
      taken?.add(personalName);
      const title = register.title ?? '';
      return {
        id: `cap-${faction}-${index}${round ? `-${round + 1}` : ''}`,
        name: title ? `${title} ${personalName}` : personalName,
        title, personalName, faction, posture
      };
    }
  }
  return null;   // ten times round the register: the fleet is larger than the game supports
}

// Officers for a whole fleet. Ships are dealt in id order rather than array order, so the same
// fleet drawn from a differently ordered list gets the same wardroom.
//
// Returns a plain { shipId: captain } map and mutates nothing. The caller decides whether to attach
// it, which is what keeps this opt-in: a battle whose ships are never given records resolves
// exactly as it did before any of this existed.
export function drawCaptains(ships, seed, registers, { posture = DEFAULT_POSTURE, postureFor = null } = {}) {
  const out = {};
  const takenByFaction = new Map();
  for (const ship of [...(ships ?? [])].sort((a, b) => compareId(a.id, b.id))) {
    if (!ship?.id || !ship.faction) continue;
    if (!takenByFaction.has(ship.faction)) takenByFaction.set(ship.faction, new Set());
    const captain = drawCaptain(ship.id, seed, ship.faction, registers, {
      posture: postureFor?.(ship) ?? posture, taken: takenByFaction.get(ship.faction)
    });
    if (captain) out[ship.id] = captain;
  }
  return out;
}

// The one mutating helper, kept separate and obvious. Attaching a record is the moment a fleet stops
// being unofficered, so it should be a line the reader can find.
export function commissionCaptains(ships, seed, registers, options = {}) {
  const drawn = drawCaptains(ships, seed, registers, options);
  for (const ship of ships ?? []) if (drawn[ship.id]) ship.captain = drawn[ship.id];
  return drawn;
}
