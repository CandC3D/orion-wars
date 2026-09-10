// Ship construction and state for the tactical layer.
// Built on the FASA power model: one pool per turn, actions spend from it,
// shields absorb out of the residue. See docs/fasa-mechanics-notes.md.

import { legacySpec } from '../construction/legacy.js';
import { compileDesign } from '../construction/index.js';
export const SHIELD_NUMBERS = [1, 2, 3, 4, 5, 6];

// A custom ship owns its pinned definitions; stock ships use the tuning catalogue.
export const weaponFor = (ship, type, tuning) => ship.weaponDefinitions?.[type] ?? tuning.weapons[type];
export const shieldCapacity = (ship, face) => ship.shieldGenerators?.[face]?.capacity ?? ship.hull?.maxShieldPower ?? ship.shieldMax ?? 0;
export const shieldCost = (ship, face) => ship.shieldGenerators?.[face]?.powerPerDamage ?? ship.shieldPointRatio;
export const ratedPower = ship => ship.cores.reduce((sum,core)=>sum+core.power,0) + ship.hull.impulsePower;

// A hangar declaration is `{ <type>: { squadrons, strength } }` on the hull
// class. Squadron identity is stable and derived from the parent hull's id, so
// a replay can key an icon off it. Returns null for every hull without a
// hangar, which is the guard the whole strike-craft system hangs on.
function buildSquadrons(shipId, hangar) {
  if (!hangar) return null;
  const out = [];
  for (const [type, spec] of Object.entries(hangar)) {
    const n = spec.squadrons ?? 0;
    for (let i = 0; i < n; i++) {
      out.push({
        id: `${shipId}/${type}-${i + 1}`,
        type,
        strength: spec.strength,
        max: spec.strength,
        launched: false,
        stance: "offence"
      });
    }
  }
  return out.length ? out : null;
}

export function buildShip(id, faction, className, tuning, loadouts, rng, designPack = null) {
  const spec = designPack ? compileDesign(designPack, tuning, { faction, className }) : legacySpec(faction, className, tuning, loadouts);
  const { hull, mounts, magazine, spinalType, canCloak, superstructure } = spec;

  // STRIKE CRAFT. A hull with a `hangar` carries squadrons: abstract sub-units
  // with strength rather than map positions, flown from the parent hull. Faction
  // -generic by construction - the hangar lives on the hull class and the rules
  // live in tuning.strikeCraft, so any power may be given a carrier later.
  // Every other hull gets `squadrons: null`, which is what every guard tests.
  const squadrons = buildSquadrons(id, hull.hangar);

  const ship = {
    id, faction, className,
    points: hull.points,
    // A ship owns its hull, including nested hangar/arcs. In-memory per-ship
    // edits must not rewrite the tuning catalogue or another vessel's hull.
    hull: structuredClone(hull),
    mounts,
    // --- position ---
    pos: { q: 0, r: 0 },
    facing: 0,
    // --- power: the pool everything draws on ---
    cores: spec.reactors ? spec.reactors.map(core=>({...structuredClone(core),alive:true})) : Array.from({ length: hull.cores }, () => ({ power: hull.corePower, alive: true })),
    impulse: hull.impulsePower,
    power: 0,           // current, reset each turn
    reserve: 0,         // power held back for shield absorption
    // --- defence ---
    ...(spec.shieldGenerators ? { shieldGenerators: structuredClone(spec.shieldGenerators) } : {}),
    shieldCap: Object.fromEntries(SHIELD_NUMBERS.map((n) => [n, spec.shieldGenerators?.[n]?.capacity ?? hull.maxShieldPower])),
    shieldDown: Object.fromEntries(SHIELD_NUMBERS.map((n) => [n, false])),
    superstructureMax: superstructure,
    superstructure,
    damageSinceLastSystemHit: 0,
    systems: {},
    magazine,
    // --- strike craft (null on every hull without a hangar) ---
    squadrons,
    squadronsLost: false,
    // --- cloak ---
    canCloak,
    cloaked: canCloak,
    decloaking: false,
    detected: !canCloak,
    // --- per-turn bookkeeping ---
    movedThisTurn: 0,
    damageThisTurn: 0,
    // Incoming fire and hull actually lost are DIFFERENT quantities and both are
    // wanted. damageThisTurn is what the ship had to soak, and reserve doctrine
    // is set against it. hullLostThisTurn is what got through, and a captain
    // deciding whether he is being killed sitting still must read that one - a
    // shield that held means he is not dying, however hard he was hit.
    hullLostThisTurn: 0,
    hullLostLastTurn: 0,
    damageLastTurn: 0,
    emergencyUsed: false,
    warpedThisTurn: false,
    toHitPenalty: 0,
    destroyed: false,
    // --- cached faction-modified ratios (both are POWER COSTS) ---
    shieldPointRatio: spec.shieldPointRatio,
    movementPointRatio: spec.movementPointRatio,
    detectionBonusAgainst: spec.detectionBonusAgainst
  };
  // Capacitor state for the spinal gun. Absent on every other hull, which is
  // what guards every spinal branch elsewhere in the engine.
  if (spinalType) {
    ship.spinal = {
      type: spinalType,
      state: "charging",   // charging | ready | cooldown | wrecked
      charge: 0,
      cooldown: 0,
      readyTurns: 0,
      holdLogged: false,
      shots: 0
    };
  }
  if (designPack) {
    ship.design = structuredClone(designPack);
    ship.designId = designPack.design.id;
    ship.designRevision = designPack.design.revision;
    ship.displayName = designPack.design.name;
    ship.weaponDefinitions = spec.weaponDefinitions;
    ship.turnRate = spec.turnRate;
  }
  ship.power = fullPower(ship);
  return ship;
}

export function fullPower(ship) {
  return ship.cores.reduce((s, c) => s + (c.alive ? c.power : 0), 0) + ship.impulse;
}

// A hull carries a capacitor only if the tuning lists its class. Everything else
// returns 0 and behaves exactly as before.
export function capacitorMax(ship, tuning) {
  const rule = tuning?.damage?.shieldCapacitor;
  if (!rule?.enabled || !rule.classes?.includes(ship.className)) return 0;
  return Math.max(0, fullPower(ship) * (rule.capacityFraction ?? 0));
}

export function startTurn(ship, tuning) {
  // The turn reset discards whatever the pool did not spend. A capacitor banks
  // some of that remainder instead, which is the whole point of it: a light hull
  // wastes power in a quiet turn and has none to absorb with in a loud one.
  const bank = capacitorMax(ship, tuning);
  if (bank > 0) {
    const rule = tuning.damage.shieldCapacitor;
    const spare = Math.max(0, ship.power ?? 0) * (rule.chargeEfficiency ?? 0);
    ship.capacitor = Math.min(bank, (ship.capacitor ?? 0) + spare);
  } else ship.capacitor = 0;
  ship.power = fullPower(ship);
  // Cloak draws its cost off the top for the whole turn it is running.
  if (ship.cloaked && !ship.decloaking) {
    const cost = Math.round(fullPower(ship) * tuning.cloak.powerCostFraction);
    if (cost > ship.power && tuning.cloak.autoDecloakOnPowerLoss) {
      // Engine damage has dropped the ship below the device's demand.
      ship.cloaked = false;
      ship.detected = true;
    } else {
      ship.power -= cost;
    }
  }
  const doc = tuning.doctrine[ship.faction];
  ship.reserve = Math.round(ship.power * (doc?.reserveFraction ?? 0.35));
  // What the ship actually had to soak last turn. A captain sets his reserve
  // against the fire he is taking, not against the theoretical capacity of his
  // shield grid - measured, a battleship holding 44 power back was being asked
  // to absorb about 10 damage a turn and threw away nine tenths of it.
  ship.damageLastTurn = ship.damageThisTurn ?? 0;
  ship.damageThisTurn = 0;
  ship.hullLostLastTurn = ship.hullLostThisTurn ?? 0;
  ship.hullLostThisTurn = 0;
  ship.movedThisTurn = 0;
  ship.emergencyUsed = false;
  ship.warpedThisTurn = false;
  ship.toHitPenalty = 0;
  for (const m of ship.mounts) m.firedThisTurn = false;
}

export function startRound(ship) {
  for (const n of SHIELD_NUMBERS) {
    ship.shieldCap[n] = ship.shieldDown[n] ? 0 : shieldCapacity(ship,n);
  }
}

// Power a ship is willing to spend on actions, holding back its reserve.
export function spendable(ship) {
  return Math.max(0, ship.power - ship.reserve);
}

export function isSystemInop(ship, name, threshold) {
  return (ship.systems[name] ?? 0) >= threshold;
}

// Damage lands on a facing. The defender absorbs what it can afford: limited by
// the facing's remaining capacity this round AND by the power left in the pool.
// Everything else goes internal.
// `bypassShield` is the photonic cannon's signature: a bolt of that order is
// not deflected, it is simply through. Defaults false, so every existing
// weapon resolves exactly as before.
export function shieldAbsorbable(ship, face) {
  const cost = shieldCost(ship,face), cap = Math.max(0,ship.shieldCap?.[face] ?? 0);
  // The capacitor DISCHARGES INTO A DEPLETED FACE, restoring capacity, rather
  // than paying for absorption. Measured 2026-09-07: a frigate can afford 14
  // points of absorption and is capped at 4 by the face, so relieving the purse
  // bought nothing. Capacity is what binds, so capacity is what this lifts.
  const purse = Math.max(0, ship.power ?? 0);
  const restored = Math.max(0, ship.capacitor ?? 0);
  // Chris, section 34.11: retain authored capacity/efficiency, but only complete
  // damage points can be absorbed. A fractional cap remainder cannot stop a hit.
  return ship.shieldDown?.[face] || !(cost > 0) ? 0 : Math.floor(Math.min(cap + restored, purse / cost));
}

export function applyDamage(ship, shieldNo, amount, tuning, rng, log, spread = 0, bypassShield = false) {
  let remaining = amount;
  ship.damageThisTurn = (ship.damageThisTurn ?? 0) + amount;

  if (!bypassShield && !ship.shieldDown[shieldNo]) {
    const absorbed = Math.floor(Math.min(remaining, shieldAbsorbable(ship, shieldNo)));
    if (absorbed > 0) {
      ship.power -= absorbed * shieldCost(ship,shieldNo);
      // Points absorbed beyond the face's own remaining capacity came out of the
      // capacitor, one stored point per point of capacity restored.
      const beyondFace = Math.max(0, absorbed - Math.max(0, ship.shieldCap[shieldNo] ?? 0));
      if (beyondFace > 0) ship.capacitor = Math.max(0, (ship.capacitor ?? 0) - beyondFace);
      ship.shieldCap[shieldNo] = Math.max(0, ship.shieldCap[shieldNo] - absorbed);
      remaining -= absorbed;
      // Spending on defence eats into the reserve first.
      ship.reserve = Math.min(ship.reserve, ship.power);
    }
  }
  if (remaining <= 0) return { absorbed: amount, internal: 0 };

  ship.superstructure -= remaining;
  ship.hullLostThisTurn = (ship.hullLostThisTurn ?? 0) + remaining;

  // ONE damage-location roll per penetrating hit, whatever its size. A stream of
  // small penetrations therefore cripples systems a single heavy blow would not,
  // which is what makes light hulls worth fielding.
  //
  // A spreading weapon (plasma) rolls once per `spread` points that GOT THROUGH.
  // The spread must apply to the penetrating damage, not to the incoming blow:
  // splitting it before the shield would let a single facing absorb each chunk
  // separately and swallow the whole torpedo.
  const tables = tuning.damage.facingTables;
  const table = shieldNo === 5 ? tables.rear
    : (shieldNo === 4 || shieldNo === 6) ? tables.flank
    : tables.forward;
  const rolls = spread > 0 ? Math.max(1, Math.ceil(remaining / spread)) : 1;

  for (let i = 0; i < rolls; i++) {
    const sys = rng.pick(table);
    ship.systems[sys] = (ship.systems[sys] ?? 0) + 1;

    if (sys.startsWith("shield-")) {
      const n = Number(sys.split("-")[1]);
      if (ship.systems[sys] >= 2) { ship.shieldDown[n] = true; ship.shieldCap[n] = 0; }
    }
    if (sys === "core") {
      // Engineering hits bite the CURRENT turn's pool, as in FASA: a flanked ship
      // can neither retreat nor absorb, so one good rear pass cascades.
      const live = ship.cores.filter((c) => c.alive);
      if (live.length > 1) {
        const lost = live[rng.int(live.length)];
        lost.alive = false;
        ship.power = Math.max(0, ship.power - lost.power);
      }
      // A spinal capacitor bank being fed by a core that has just been shot
      // away loses containment and dumps whatever it had stored. This is the
      // teeth in "vulnerable mid-charge": a rear pass on a charging gunstar
      // does not merely slow the gun, it throws the shot away. Guarded on
      // ship.spinal, which no other hull has.
      if (ship.spinal && ship.spinal.charge > 0 &&
          (ship.spinal.state === "charging" || ship.spinal.state === "ready")) {
        ship.spinal.charge = 0;
        ship.spinal.state = "charging";
        if (log) log(`${ship.id} loses containment - spinal charge dumped`);
      }
    }
    if (sys === "weapon-mount") {
      const usable = ship.mounts.filter((m) => !m.inop);
      if (usable.length > 1) {
        usable[rng.int(usable.length)].inop = true;
        // The helm caches this hull's standing battery per face and its reach.
        // A lost mount is the ONLY event that can change either, so this is the
        // one place the cache has to be dropped.
        ship._helm = null;
      }
    }
  }
  if (ship.superstructure <= 0) {
    ship.superstructure = 0;
    // RULING 2026-09-07 (Chris): zero structure CRIPPLES a hull; it is out of the
    // action with its crew alive. Only a second reduction destroys it, and the
    // crew then take a survival roll. Off unless tuning enables it, because it
    // changes the outcome of every battle already recorded.
    const rule = tuning?.damage?.crippling;
    if (rule?.enabled && !ship.crippled && !ship.destroyed) {
      ship.crippled = true;
      ship.crewAlive = true;
      if (log) log(`${ship.id} crippled - out of action, crew alive`);
    } else {
      ship.destroyed = true;
      if (rule?.enabled) {
        // A survival roll, so a commander can outlive a hull and go on to a
        // larger one. Consumes the seeded PRNG like every other chance here.
        const chance = ship.crippled ? (rule.crewSurvivesDestruction ?? 0) : (rule.crewSurvivesDestruction ?? 0);
        ship.crewAlive = rng ? rng.int(100) < Math.round(chance * 100) : false;
        if (log) log(`${ship.id} destroyed - crew ${ship.crewAlive ? 'recovered' : 'lost'}`);
      } else if (log) log(`${ship.id} destroyed`);
    }
  }
  return { absorbed: amount - remaining, internal: remaining };
}
