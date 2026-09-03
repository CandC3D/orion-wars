// Ship construction and state for the tactical layer.
// Built on the FASA power model: one pool per turn, actions spend from it,
// shields absorb out of the residue. See docs/fasa-mechanics-notes.md.

export const SHIELD_NUMBERS = [1, 2, 3, 4, 5, 6];

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

export function buildShip(id, faction, className, tuning, loadouts, rng) {
  const hull = tuning.hullClasses[className];
  if (!hull) throw new Error(`unknown hull class: ${className}`);
  const mod = tuning.factionModifiers[faction] ?? {};
  const lo = loadouts[faction][className] ?? loadouts[faction]._default;

  // A loadout may override the class envelope for faction flavour.
  const beamMounts = lo.beamMounts ?? hull.beamMounts;
  const missileMounts = lo.missileMounts ?? hull.missileMounts;
  const magazine = lo.magazine ?? hull.magazine;
  const beamArcs = lo.beamArcs ?? hull.beamArcs;
  const missileArcs = lo.missileArcs ?? hull.missileArcs;

  const arcFaces = (name) => tuning.arcs[name] ?? tuning.arcs.f;

  // Heavier hulls mount larger marks of the same weapon. Scale each mount's
  // reach and its range-band boundaries by the class's weaponReach.
  const reach = hull.weaponReach ?? 1;
  const scaleWeapon = (typeName) => {
    const w = tuning.weapons[typeName];
    return {
      maxRange: Math.max(1, Math.round(w.maxRange * reach)),
      bands: w.rangeBands.map((b) => ({ ...b, to: Math.max(1, Math.round(b.to * reach)) }))
    };
  };

  const mounts = [];
  for (let i = 0; i < beamMounts; i++) {
    mounts.push({
      id: mounts.length + 1, type: lo.beam, kind: "beam",
      arc: arcFaces(beamArcs[i % beamArcs.length]),
      arcName: beamArcs[i % beamArcs.length],
      ...scaleWeapon(lo.beam),
      inop: false, firedThisTurn: false
    });
  }
  // Split missile mounts by the faction's declared mix, largest remainder first.
  const mix = Object.entries(lo.missileMix ?? {});
  const counts = mix.map(([type, frac]) => ({ type, exact: frac * missileMounts }));
  let assigned = 0;
  for (const c of counts) { c.n = Math.floor(c.exact); assigned += c.n; }
  counts.sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
  for (let i = 0; assigned < missileMounts; i++, assigned++) counts[i % counts.length].n++;
  let mi = 0;
  for (const c of counts) {
    for (let i = 0; i < c.n; i++, mi++) {
      const name = missileArcs.length ? missileArcs[mi % missileArcs.length] : "f";
      mounts.push({
        id: mounts.length + 1, type: c.type, kind: "missile",
        arc: arcFaces(name), arcName: name,
        ...scaleWeapon(c.type),
        inop: false, firedThisTurn: false
      });
    }
  }

  // SPINAL MOUNT. A weapon bolted to the keel: one mount, one arc, aimed by
  // pointing the whole ship. Built only when the hull or loadout declares one,
  // so every existing hull builds byte-for-byte as before.
  const spinalType = lo.spinal ?? hull.spinal ?? null;
  if (spinalType) {
    const sName = (lo.spinalArcs ?? hull.spinalArcs ?? ["f"])[0];
    mounts.push({
      id: mounts.length + 1, type: spinalType, kind: "spinal",
      arc: arcFaces(sName), arcName: sName,
      ...scaleWeapon(spinalType),
      inop: false, firedThisTurn: false
    });
  }

  const canCloak = (tuning.cloak.carriedBy[faction] ?? []).includes(className);
  const superstructure = Math.round(hull.superstructure * (mod.superstructure ?? 1));

  // STRIKE CRAFT. A hull with a `hangar` carries squadrons: abstract sub-units
  // with strength rather than map positions, flown from the parent hull. Faction
  // -generic by construction - the hangar lives on the hull class and the rules
  // live in tuning.strikeCraft, so any power may be given a carrier later.
  // Every other hull gets `squadrons: null`, which is what every guard tests.
  const squadrons = buildSquadrons(id, hull.hangar);

  const ship = {
    id, faction, className,
    points: hull.points,
    hull,
    mounts,
    // --- position ---
    pos: { q: 0, r: 0 },
    facing: 0,
    // --- power: the pool everything draws on ---
    cores: Array.from({ length: hull.cores }, () => ({ power: hull.corePower, alive: true })),
    impulse: hull.impulsePower,
    power: 0,           // current, reset each turn
    reserve: 0,         // power held back for shield absorption
    // --- defence ---
    shieldCap: Object.fromEntries(SHIELD_NUMBERS.map((n) => [n, hull.maxShieldPower])),
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
    damageLastTurn: 0,
    emergencyUsed: false,
    warpedThisTurn: false,
    toHitPenalty: 0,
    destroyed: false,
    // --- cached faction-modified ratios (both are POWER COSTS) ---
    shieldPointRatio: hull.shieldPointRatio * (mod.shieldPointRatio ?? 1),
    movementPointRatio: hull.movementPointRatio * (mod.movementPointRatio ?? 1),
    detectionBonusAgainst: mod.detectionRangeAgainst ?? 0
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
  ship.power = fullPower(ship);
  return ship;
}

export function fullPower(ship) {
  return ship.cores.reduce((s, c) => s + (c.alive ? c.power : 0), 0) + ship.impulse;
}

export function startTurn(ship, tuning) {
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
  ship.movedThisTurn = 0;
  ship.emergencyUsed = false;
  ship.warpedThisTurn = false;
  ship.toHitPenalty = 0;
  for (const m of ship.mounts) m.firedThisTurn = false;
}

export function startRound(ship) {
  for (const n of SHIELD_NUMBERS) {
    ship.shieldCap[n] = ship.shieldDown[n] ? 0 : ship.hull.maxShieldPower;
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
export function applyDamage(ship, shieldNo, amount, tuning, rng, log, spread = 0, bypassShield = false) {
  let remaining = amount;
  ship.damageThisTurn = (ship.damageThisTurn ?? 0) + amount;

  if (!bypassShield && !ship.shieldDown[shieldNo]) {
    const affordable = Math.floor(ship.power / ship.shieldPointRatio);
    const absorbed = Math.min(remaining, ship.shieldCap[shieldNo], affordable);
    if (absorbed > 0) {
      ship.power -= absorbed * ship.shieldPointRatio;
      ship.shieldCap[shieldNo] -= absorbed;
      remaining -= absorbed;
      // Spending on defence eats into the reserve first.
      ship.reserve = Math.min(ship.reserve, ship.power);
    }
  }
  if (remaining <= 0) return { absorbed: amount, internal: 0 };

  ship.superstructure -= remaining;

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
        live[rng.int(live.length)].alive = false;
        ship.power = Math.max(0, ship.power - ship.hull.corePower);
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
    ship.destroyed = true;
    if (log) log(`${ship.id} destroyed`);
  }
  return { absorbed: amount - remaining, internal: remaining };
}
