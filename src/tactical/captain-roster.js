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
// A NAME CHANGES NOTHING. The draw assigns identity and nothing else: posture defaults to standard,
// which is what a ship without a captain record already behaves as. So officers can be switched on,
// looked at, and named in the console before a single ship behaves differently - and if they read
// wrong, they can be changed without re-measuring anything.
import { makePrng, seedFromString } from '../prng.js';
import { DEFAULT_POSTURE } from './ship-command.js';

const ORDINALS = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
const compareId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// One officer, drawn for one hull. Pure: same seed, same ship id, same register, same officer -
// every time, on any machine, without reference to what any other ship drew.
//
// `taken` carries the names already dealt in this fleet so a battle does not field two Capt.
// Renards. A collision probes forward through the register rather than re-rolling, because probing
// stays deterministic no matter how many ships collided before it. A register that runs out - a
// Zandrax swarm can field more hulls than there are names - starts again with an ordinal, the way a
// navy disambiguates a reused name.
export function drawCaptain(shipId, seed, faction, registers, { posture = DEFAULT_POSTURE, taken = null } = {}) {
  const register = registers?.[faction];
  const pool = register?.names ?? [];
  if (!pool.length) return null;
  const rng = makePrng(seedFromString(`${seed}:${shipId}`));
  const start = rng.int(pool.length);
  for (let round = 0; round < ORDINALS.length; round++) {
    for (let step = 0; step < pool.length; step++) {
      const index = (start + step) % pool.length;
      const personalName = pool[index] + ORDINALS[round];
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
