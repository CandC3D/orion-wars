// Tactical combat resolver, built on the FASA power model.
//
// A turn is three rounds. Each ship's power pool resets at turn start; every
// action spends from it; shields absorb damage out of whatever is left. Firing
// arcs decide which mounts can bear. See docs/fasa-mechanics-notes.md.
//
// Sits behind the frozen combat interface in src/combat.js; the strategic
// layer never sees anything in this file.

import { distance, add, bearing, shieldFacing, faceFor, inArc, turnToward, hexLine } from "./hex.js";
import { buildShip, fullPower, startTurn, startRound, spendable, applyDamage } from "./ship.js";

// ---------------------------------------------------------------- helpers

const living = (fleet) => fleet.filter((s) => !s.destroyed);

function centroid(ships) {
  if (!ships.length) return { q: 0, r: 0 };
  return {
    q: Math.round(ships.reduce((s, x) => s + x.pos.q, 0) / ships.length),
    r: Math.round(ships.reduce((s, x) => s + x.pos.r, 0) / ships.length)
  };
}

const targetable = (enemies) => living(enemies).filter((e) => !e.cloaked || e.detected);

function nearest(from, ships) {
  let best = null, bestD = Infinity;
  for (const s of ships) {
    const d = distance(from, s.pos);
    if (d < bestD) { bestD = d; best = s; }
  }
  return { ship: best, range: bestD };
}

function bandFor(mount, range) {
  for (const b of mount.bands) if (range <= b.to) return b;
  return null;
}

// FASA STTCS p.16, "Additional Rules": "Two or more starships may occupy the
// same hex, but they may not fire at one another while they are in that hex.
// Ships may neither ram nor collide with one another." Restored 2026-09-01
// (battle.sameHexNoFire). Mutual and pairwise: each ship may still engage
// anyone ELSE. This is the original's disincentive against parking in an
// enemy's hex - it forfeits the shot rather than granting a point-blank one.
function mayEngage(shooter, target, tuning) {
  if (tuning.battle?.sameHexNoFire === false) return true;
  return distance(shooter.pos, target.pos) > 0;
}

// Which face of the SHOOTER does the target lie off? A mount bears only if
// that face falls inside its arc. This is what limits a big ship: a battleship
// has all-round coverage but only two beams on any one bearing.
function bears(shooter, mount, targetPos) {
  return mount.arc.includes(shieldFacing(shooter, targetPos));
}

// Weight of fire a ship can throw through one of its own faces. `standing`
// counts the whole battery rather than only the mounts still loaded this turn:
// deciding whether a hull is CAPABLE of a fighting withdrawal is a question
// about the ship, not about which triggers have already been pulled this turn.
function fireWeight(ship, face, tuning, standing = false) {
  let score = 0;
  for (const m of ship.mounts) {
    if (m.inop || (!standing && m.firedThisTurn) || !m.arc.includes(face)) continue;
    const w = tuning.weapons[m.type];
    score += w.kind === "beam" ? w.maxPower
      : w.kind === "spinal" ? (w.aimWeight ?? 0)   // keel gun: aimed by the helm
      : (w.damage / 3);
  }
  return score;
}

// Which way should a ship point? Turning the nose at the enemy is only correct
// for a nose-armed hull. A ship with quarter or broadside arcs that noses in
// throws away most of its battery, and a hull whose single mount sits on the
// beam - the Vraygon frigate - can then never fire at all: measured, Vraygon
// light hulls were spending 0.03 power a turn on gunnery. Choose the heading
// that brings the most weight of fire to bear, with an intact shield as the
// tie-break. Ships still turn only one step per action, so the choice costs
// tempo exactly as before.
function bestHeading(ship, targetPos, tuning) {
  const dir = bearing(ship.pos, targetPos);
  let best = ship.facing, bestScore = -Infinity;
  for (let f = 0; f < 6; f++) {
    const face = faceFor(f, dir);
    let score = fireWeight(ship, face, tuning);
    if (!ship.shieldDown[face]) score += 0.5;   // meet him with a live shield
    if (face === 2) score += 0.25;              // and keep the nose round on a tie
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best;
}

// Is a fighting withdrawal actually available to this hull?
//
// Under the flight rules opening the range means turning the nose away, and the
// enemy then lies dead astern - face 5. A ship with a stern battery can back
// off and keep shooting; a nose-armed line fighter that tries it simply stops
// firing for the rest of the action, turns its softest facing to the enemy, and
// is run down anyway because nobody can outrun anybody by much. Measured, that
// is precisely what was happening: Earth and Zandrax battleships spent 66-68%
// of their mount-rounds blocked by arc and fired only 27-30% of their battery,
// against 48% for a Krelath battleship of identical arcs that stood and fought.
//
// So the withdrawal is now a decision rather than a reflex: a ship opens the
// range only if its stern arcs retain this share of the weight of fire its best
// heading would give it. Faction-neutral - the same test for every hull - but it
// lands differently on each, which is the point. Vraygon, whose whole identity
// is that it has no blind side, keeps about 90% of its battery astern and can
// genuinely fight a withdrawal; a nose-heavy hull keeps a fifth, so it holds its
// ground and fights, which is what a line fighter is for.
function canWithdrawFighting(ship, tuning) {
  const need = tuning.movement?.withdrawFireFraction ?? 0;
  if (need <= 0) return true;
  // A carrier with an air group still flying is exempt, and the exemption is
  // the test's own logic rather than a hole in it: the rule exists because a
  // hull that turns its nose away stops shooting. A carrier's battery is its
  // squadrons, they bear on every heading regardless of where the deck is
  // pointing, and so opening the range costs it nothing. Once the wing is dead
  // the exemption lapses and the hull fights - or runs - like any other.
  if (hasAirGroup(ship, tuning)) return true;
  const astern = fireWeight(ship, 5, tuning, true);
  let best = 0;
  for (let face = 1; face <= 6; face++) best = Math.max(best, fireWeight(ship, face, tuning, true));
  if (best <= 0) return true;
  return astern >= need * best;
}

// Does this ship still have craft in hand? The gate on every carrier behaviour.
// False for every hull without a hangar, and false again once the wing is gone.
function hasAirGroup(ship, tuning) {
  const SC = tuning.strikeCraft;
  if (!SC || !SC.enabled || !ship.squadrons) return false;
  return ship.squadrons.some((sq) => sq.strength > 0);
}

// The range this ship wants: the best band of its longest-reaching beam - or,
// for a carrier, the range at which its air group can work and the enemy line
// cannot reach it. A flight deck has no business in a gun duel.
function preferredRange(ship, tuning) {
  let best = 4;
  for (const m of ship.mounts) {
    if (m.kind !== "beam" || m.inop) continue;
    let top = m.bands[0];
    for (const b of m.bands) if ((b.damageBonus ?? 0) > (top.damageBonus ?? 0)) top = b;
    best = Math.max(best, top.to);
  }
  if (hasAirGroup(ship, tuning)) {
    best = Math.max(best, tuning.strikeCraft.standoffRangeHexes ?? 0);
  }
  return best;
}

// Longest range at which this ship can still hurt anything.
//
// NOTE for anyone tempted to refine this into an "effective" reach - the range
// at which a ship still does REAL damage rather than the range at which it can
// technically land a shot. It is the right instinct and it was tried; it is a
// knife-edge. engagementRange decides whether a whole fleet kites or closes on
// one integer comparison of the two sides' reach, so any redefinition flips
// entire matchups at once. Measured: giving the plasma torpedo the neutronic
// missile's 20-hex nominal range, changing nothing else, moved Krelath from 91%
// to 53% at 32 points and 67% to 22% at 64 - purely by changing which side
// believed it was the stand-off fleet. A damage-weighted effective reach costs
// 3-6 cells of band wherever it was tried, because it hands the long-gun
// factions a kite the short-gun factions cannot answer. Left as nominal range
// deliberately; the fix that DOES work is canWithdrawFighting below.
function maxReach(ship, tuning) {
  let r = 0;
  for (const m of ship.mounts) {
    if (m.inop) continue;
    // A spinal gun is deliberately excluded. Read the note above: engagement
    // geometry turns on ONE integer comparison of nominal reach, and a 25-hex
    // keel gun on an 8-point hull would flip the whole Earth line into the
    // stand-off branch - the exact failure the plasma-torpedo experiment
    // recorded. The cannon out-ranges the fight; it does not choose it.
    if (m.kind === "spinal") continue;
    r = Math.max(r, m.maxRange);
  }
  return r;
}

// Where this ship wants to sit given who it is fighting. If it out-reaches the
// enemy it holds the gap open and shoots from outside reply range; otherwise it
// closes to its own best band. This is what makes reach and speed matter.
function engagementRange(ship, enemy, tuning) {
  const mine = preferredRange(ship, tuning);
  if (!enemy) return mine;
  const theirReach = maxReach(enemy, tuning);
  const myReach = maxReach(ship, tuning);
  if (myReach > theirReach + 1) return Math.min(myReach, theirReach + 1);
  return mine;
}

// The engagement area is bounded. A fleet that only wants to open the range
// eventually runs out of room and has to fight.

// ------------------------------------------------------------- terrain
// Scenario terrain (ruling 2026-09-02): MOONS occupy one hex and cannot be
// passed through; PLANETS occupy a seven-hex rosette (centre + ring), the
// footprint the old sprites spilled over before ships were confined to one
// hex. Both block movement, warp landings and deployment, and both block
// line of fire (FASA: large bodies block fire and cast sensor shadows).
// Terrain arrives on tuning.battle.terrain, which runBattle attaches from
// opts.terrain; with no terrain every function here is a no-op.
const HEX_DIRS = [0, 1, 2, 3, 4, 5];
function terrainSet(tuning) {
  const list = tuning.battle?.terrain;
  if (!list || !list.length) return null;
  if (tuning.battle._terrainSet && tuning.battle._terrainSet.src === list) return tuning.battle._terrainSet.set;
  const set = new Set();
  const key = (p) => p.q + "," + p.r;
  for (const t of list) {
    const c = { q: t.q, r: t.r };
    set.add(key(c));
    if (t.type === "planet") for (const d of HEX_DIRS) set.add(key(add(c, d)));
  }
  tuning.battle._terrainSet = { src: list, set };
  return set;
}
function blockedHex(pos, tuning) {
  const set = terrainSet(tuning);
  return set ? set.has(pos.q + "," + pos.r) : false;
}
// Line of fire: blocked if any hex strictly between shooter and target is
// terrain. Endpoints are never terrain for a living ship.
function lineOfFire(shooterPos, targetPos, tuning) {
  const set = terrainSet(tuning);
  if (!set) return true;
  const line = hexLine(shooterPos, targetPos);
  for (let i = 1; i < line.length - 1; i++) if (set.has(line[i].q + "," + line[i].r)) return false;
  return true;
}
function inBounds(pos, tuning) {
  // RULING (2026-09-01): the engagement area is a LANDSCAPE RECTANGLE of hexes,
  // like the FASA paper map - fleets enter from the short ends and the long
  // axis is the axis of approach. battle.map {shape: "rect", widthHexes,
  // heightHexes} is the extent in hex columns and rows; in pointy-top axial
  // coordinates a column is (q + r/2) and a row is r. The old hexagonal
  // boundary (mapRadiusHexes) remains as the fallback when no rect is given.
  if (blockedHex(pos, tuning)) return false;
  const map = tuning.battle?.map;
  if (map && map.shape === "rect") {
    const col = pos.q + pos.r / 2, row = pos.r;
    return Math.abs(col) <= map.widthHexes / 2 && Math.abs(row) <= map.heightHexes / 2;
  }
  const r = tuning.battle?.mapRadiusHexes;
  if (!r) return true;
  return (Math.abs(pos.q) + Math.abs(pos.q + pos.r) + Math.abs(pos.r)) / 2 <= r;
}

const detectionRangeAgainst = (target, tuning) =>
  tuning.cloak.detectionRangeHexes + (target.detectionBonusAgainst ?? 0);

// A command ship coordinates everything within its radius: gunnery and sensors.
function commandBonus(ship, friends, field) {
  let best = 0;
  for (const f of living(friends)) {
    const r = f.hull.commandRadius;
    if (!r || f.cloaked || f === ship) continue;
    if (distance(ship.pos, f.pos) <= r) best = Math.max(best, f.hull[field] ?? 0);
  }
  return best;
}

// A dying ship detonates. Yield scales with the power still in its engines, so a
// healthy ship is a bomb and a gutted one fizzles. Corvettes carry a high yield.
function detonate(dead, allShips, tuning, rng, log) {
  const E = tuning.explosion;
  if (!E || !E.enabled || dead.exploded) return;
  dead.exploded = true;
  const yieldMult = dead.hull.explosionYield ?? 1;
  // The power STILL IN THE ENGINES, not the ship's rated capacity. fullPower()
  // is the pool a healthy ship resets to each turn, so using it here meant a
  // hull that had spent its turn shooting and soaking still went up as if
  // untouched - which is the opposite of the documented rule and made a
  // corvette squadron chain-detonate itself off a single hit.
  // A spinal capacitor bank that never got to fire goes up with the ship. This
  // is the other half of the photonic cannon's bargain: kill a dreadnought
  // mid-charge and you are standing next to the charge. Guarded on dead.spinal,
  // which no other hull has, so `stored` is 0 and the arithmetic is unchanged.
  const stored = dead.spinal ? Math.max(0, dead.spinal.charge ?? 0) : 0;
  const punch = (Math.max(0, dead.power) + stored) * yieldMult;
  if (punch <= 0) return;
  let hurt = 0;
  for (const other of allShips) {
    if (other === dead || other.destroyed) continue;
    const d = distance(dead.pos, other.pos);
    if (d > E.radiusHexes) continue;
    const dmg = Math.ceil(punch / (E.divisor * Math.max(1, d)));
    if (dmg <= 0) continue;
    const face = shieldFacing(other, dead.pos);
    applyDamage(other, face, dmg, tuning, rng, log);
    hurt++;
  }
  if (hurt && log) {
    log(dead.id + (stored > 0 ? ' detonates - the spinal bank lets go' : ' detonates') +
      ', catching ' + hurt + ' ship(s)');
  }
}


// ---------------------------------------------------------------- doctrine
// How much of the pool a ship holds back for absorption rather than spending.
//
// A FIXED fraction turns out to be dominated by a situational one. During the
// approach nobody can reach you, so every point held back is simply thrown
// away; in contact the guns are capped by mount count and arcs and cannot
// spend the pool anyway. Measured, beams received 95-99% of the power they
// asked for at every scenario size, so the reserve was never a gun/shield
// trade at all - it was a movement tax paid entirely during the approach.
//
// This makes it answer the tactical picture instead: nothing held back outside
// the enemy's reach, the faction's doctrine fraction inside it scaled by how
// deep into the envelope the ship is sitting, optionally raised as the hull is
// worn down, and never more than the shields could physically absorb in the
// three rounds of a turn. Absorption still comes out of the residue of the
// pool exactly as before; only the spending brake has changed.
function doctrineReserve(ship, enemies, tuning) {
  const doc = tuning.doctrine[ship.faction] ?? {};
  const base = doc.reserveFraction ?? 0.35;
  const D = tuning.doctrine.dynamic;
  if (!D || !D.enabled) return Math.round(ship.power * base);

  const foes = targetable(enemies);
  if (!foes.length) return 0;
  const n = nearest(ship.pos, foes);

  // Reach of the enemies actually near this ship. A lone distant picket should
  // not convince a captain the whole enemy line is on top of him.
  let threat = 0;
  for (const f of foes) {
    if (distance(ship.pos, f.pos) <= n.range + (D.threatBubble ?? 4)) {
      threat = Math.max(threat, maxReach(f, tuning));
    }
  }
  threat += D.threatMargin ?? 0;
  if (n.range > threat) return Math.round(ship.power * (D.standoffFraction ?? 0));

  const depth = Math.min(1, (threat - n.range) / Math.max(1, threat));
  const floor = D.engagedFloor ?? 0.5;
  let frac = base * (floor + (1 - floor) * depth);
  // A flat FRACTION is the wrong shape across the point ladder. A frigate's
  // whole pool is barely more than one salvo, so a third held back is a third
  // of its gunnery; a battleship's guns cannot spend half of its pool however
  // hard they try, so the same third costs it nothing. Scale the fraction with
  // the size of the pool so that light hulls commit and heavy hulls hold back.
  if (D.poolScaling) {
    const ref = D.poolReference ?? 28;
    frac *= Math.pow(Math.max(1, ship.power) / ref, D.poolScaling);
  }
  if (D.damageResponse) {
    const hurt = 1 - ship.superstructure / Math.max(1, ship.superstructureMax);
    frac *= 1 + D.damageResponse * hurt;
  }
  // Power held back beyond what the ship will actually be asked to absorb is
  // wasted twice over: it neither shoots nor absorbs. Cap it at the greater of
  // a standing allowance (the facings' physical capacity, scaled) and what the
  // ship took last turn with a margin - so a quiet ship frees its pool for the
  // guns and a ship under a hammering keeps enough back to survive it.
  const physical = ship.shieldPointRatio * ship.hull.maxShieldPower *
    tuning.battle.roundsPerTurn * (D.absorbFacings ?? 2);
  const memory = (ship.damageLastTurn ?? 0) * ship.shieldPointRatio * (D.threatMemory ?? 0);
  const cap = Math.max(physical, memory);
  return Math.round(Math.max(0, Math.min(ship.power * frac, cap)));
}

// ---------------------------------------------------------------- defence

function screenFor(target, friends, tuning, rng) {
  if (target.hull.screen > 0) return null;
  const screens = living(friends).filter(
    (f) => f !== target && !f.cloaked && f.hull.screen > 0 &&
      distance(f.pos, target.pos) <= tuning.screening.rangeHexes
  );
  if (!screens.length) return null;
  const total = screens.reduce((s, f) => s + f.hull.screen, 0);
  const chance = Math.min(tuning.screening.maxChance, total * tuning.screening.chancePerScreenPoint);
  return rng.next() < chance ? screens[rng.int(screens.length)] : null;
}

function intercepted(target, friends, tuning, rng) {
  const pd = living(friends).filter(
    (f) => !f.cloaked && f.hull.pointDefence > 0 &&
      distance(f.pos, target.pos) <= tuning.pointDefence.rangeHexes
  );
  // Interceptors flying combat air patrol over a friendly ship eat missiles as
  // well as bombers. Zero for any fleet without a carrier in it, so the whole
  // computation below is unchanged when no squadron exists - including the
  // early return, which must still fire before the rng is touched.
  const capBonus = capMissileScreen(target, friends, tuning);
  if (!pd.length && capBonus <= 0) return false;
  const total = pd.reduce((s, f) => s + f.hull.pointDefence, 0);
  // The patrol raises the CEILING as well as the total. A fleet's own point
  // defence saturates at maxChance long before its escorts run out of barrels,
  // so a bonus added underneath that cap would have been worth exactly nothing
  // wherever it mattered - measured, holding interceptors back to fly it cost
  // 4-11pp against simply sweeping with them. Fighters standing above the
  // formation are reaching missiles the hulls cannot.
  return rng.next() < Math.min(tuning.pointDefence.maxChance + capBonus,
    total * tuning.pointDefence.chancePerPoint + capBonus);
}

function resolveHit(shooterPos, target, damage, defenders, tuning, rng, stats, log, spread, bypassShield) {
  if (target.destroyed) return;
  const victim = screenFor(target, defenders, tuning, rng) ?? target;
  if (victim.destroyed) return;
  if (victim !== target) stats.screened++;
  const face = shieldFacing(victim, shooterPos);
  stats.damage += damage;
  // Maneuver index bookkeeping: which side of the victim did this hit land on?
  // Faces 1-3 are forward (front-left, forward, front-right); 4-6 are the
  // flank/rear (rear-right, rear, rear-left). Pure counting - no rng, no effect
  // on the outcome below.
  if (face >= 4) stats.hitsRear++; else stats.hitsForward++;
  // The blow lands whole against the shield; only what penetrates is spread
  // across the hull for damage-location purposes. `bypassShield` is passed
  // only by the photonic cannon and is undefined - falsy - for everything else.
  stats.internal += applyDamage(victim, face, damage, tuning, rng, log, spread, bypassShield).internal;
}

// ------------------------------------------------------- spinal weapons
// The photonic cannon (Earth dreadnought). A capacitor bank on the keel that
// drinks the ship's power pool for several turns and then empties itself into
// one bolt.
//
// The draw comes OFF THE TOP of the pool, before the doctrine reserve is set -
// the same hook the cloak uses. That is the whole of the design. Under the
// residual-shield model the pool IS the shield generator, so a dreadnought
// building a charge cannot pay for absorption it has already spent: it is
// visibly soft for the three or four turns it spends aiming, and it gets that
// power back only by firing. Nothing else in the engine had to change to make
// the trade real; the power model already prices it.
//
// Every branch here is reached only through ship.spinal, which buildShip sets
// on hulls that declare a spinal weapon and on no others.
function chargeSpinal(ship, enemies, tuning, log) {
  const st = ship.spinal;
  if (!st) return;
  const w = tuning.weapons[st.type];
  // RULING (2026-09-01): the bank is not lit until an enemy is inside
  // chargeStartRangeHexes. Without this gate an immobile-while-charging hull
  // would plant itself at its deployment hex on turn one, a full map from the
  // fight. A bank that is already partly charged keeps charging regardless.
  const startRange = w.chargeStartRangeHexes ?? Infinity;
  if (st.state === "charging" && st.charge <= 0 && Number.isFinite(startRange)) {
    const near = living(enemies).some((e) => distance(ship.pos, e.pos) <= startRange);
    if (!near) {
      if (log && !st.coldLogged) { st.coldLogged = true; log(`${ship.id} ${st.type} capacitors cold - no enemy within ${startRange} hexes`); }
      return;
    }
    st.coldLogged = false;
  }
  const mount = ship.mounts.find((m) => m.kind === "spinal");
  st.holdLogged = false;

  if (!mount || mount.inop) {
    if (st.state !== "wrecked") {
      st.state = "wrecked";
      st.charge = 0;
      if (log) log(`${ship.id} spinal mount wrecked - ${st.type} offline`);
    }
    return;
  }

  if (st.state === "cooldown") {
    st.cooldown--;
    if (st.cooldown <= 0) {
      st.state = "charging";
      if (log) log(`${ship.id} ${st.type} cool - capacitors reconnected`);
    } else if (log) {
      log(`${ship.id} ${st.type} venting, dark for ${st.cooldown} more turn(s)`);
    }
    return;
  }

  if (st.state === "ready") {
    // Holding a full bank is not free - the containment field draws upkeep.
    const hold = Math.min(w.holdDrawPerTurn ?? 0, Math.max(0, ship.power));
    ship.power -= hold;
    st.readyTurns++;
    if (log) log(`${ship.id} ${st.type} holding at full charge (turn ${st.readyTurns})`);
    return;
  }

  // charging
  const draw = Math.min(w.chargeDrawPerTurn ?? 0, Math.max(0, ship.power));
  ship.power -= draw;
  st.charge += draw;
  if (st.charge >= (w.chargeRequired ?? Infinity)) {
    st.state = "ready";
    st.readyTurns = 0;
    if (log) log(`${ship.id} ${st.type} CHARGED - ${Math.round(st.charge)} units, weapon free`);
  } else if (log) {
    log(`${ship.id} ${st.type} charging ${Math.round(st.charge)}/${w.chargeRequired}`);
  }
}

// One bolt. Aimed at the heaviest hull in the arc rather than the nearest,
// because a shot that took four turns to build is not spent on a picket.
function fireSpinal(ship, enemies, friends, tuning, rng, stats, log, onShot) {
  const st = ship.spinal;
  if (!st || st.state !== "ready") return 0;
  const mount = ship.mounts.find((m) => m.kind === "spinal");
  if (!mount || mount.inop || mount.firedThisTurn) return 0;
  const w = tuning.weapons[st.type];
  if (spendable(ship) < (w.firePower ?? 0)) return 0;

  const arc = targetable(enemies).filter(
    (f) => !f.destroyed && mayEngage(ship, f, tuning) && distance(ship.pos, f.pos) <= mount.maxRange && bears(ship, mount, f.pos) && lineOfFire(ship.pos, f.pos, tuning)
  );
  if (!arc.length) return 0;

  const capital = (f) => f.points >= (w.capitalPoints ?? 8);
  const target = [...arc].sort((a, b) =>
    (b.points - a.points) || (distance(ship.pos, a.pos) - distance(ship.pos, b.pos)))[0];

  // Fire discipline. If only light hulls are in the arc the gunnery officer
  // waits for something worth the bank - but not indefinitely.
  if (!capital(target) && st.readyTurns < (w.holdForCapitalTurns ?? 0)) {
    if (log && !st.holdLogged) {
      st.holdLogged = true;
      log(`${ship.id} holds the photonic charge - no capital in the arc`);
    }
    return 0;
  }

  const range = distance(ship.pos, target.pos);
  const band = bandFor(mount, range);
  if (!band) return 0;

  ship.power -= (w.firePower ?? 0);
  mount.firedThisTurn = true;
  stats.shots++;

  // A keel gun cannot traverse. Evasion tells against it much harder than
  // against a turreted beam, and a light hull is a genuinely poor target -
  // this is the class-interaction ruling taken to its logical end.
  const evasion = Math.floor(target.movedThisTurn / tuning.toHit.evasionPerHexesMoved)
    * (w.evasionMultiplier ?? 1);
  // Three tiers, not two. The fire-control solution for a keel gun is laid on
  // a battle-line target; a cruiser is a poor mark and a picket is a joke.
  const size = target.points >= (w.battleLinePoints ?? Infinity) ? 0
    : capital(target) ? (w.vsMediumPenalty ?? 0)
    : (w.vsLightPenalty ?? 0);
  const roll = rng.int(tuning.toHit.die) + 1;
  const aim = roll + (band.toHitMod ?? 0) + (w.toHitBonus ?? 0)
    + commandBonus(ship, friends, 'commandToHit') + tuning.toHit.crewRatingDefault
    - evasion - (ship.toHitPenalty ?? 0) + size;
  const hit = aim >= tuning.toHit.target;

  if (log) log(`${ship.id} FIRES ${st.type} at ${target.id} across ${range} hexes - ${hit ? "HIT" : "miss"}`);
  if (hit) {
    stats.hits++;
    // The whole bank into one facing. A deflector screen is rated for weapons
    // fire, not for this - if bypassShield is set the bolt goes straight to the
    // hull, which is the only reason the weapon is worth its charge against
    // heavy armour: raw damage means little to a 198-point Vraygon monitor, but
    // the facing cap that would have eaten a third of it means a great deal.
    // The bolt then cascades - one damage-location roll per spreadPer points.
    resolveHit(ship.pos, target, (w.damage ?? 0) + (band.damageBonus ?? 0),
      enemies, tuning, rng, stats, log, w.spreadPer ?? 0, !!w.bypassShield);
  }
  if (onShot) onShot({ kind: "spinal", weapon: st.type, shooterId: ship.id, targetId: target.id, hit });

  st.charge = 0;
  st.shots++;
  st.state = "cooldown";
  st.cooldown = w.cooldownTurns ?? 3;
  if (log) log(`${ship.id} ${st.type} discharged - dark for ${st.cooldown} turn(s)`);
  return 1;
}

// ------------------------------------------------------------ strike craft
//
// CARRIERS. A hull with a `hangar` carries squadrons: abstract sub-units with a
// strength and no map position of their own. A squadron flies from its parent
// hull and can reach anything within strikeRadiusHexes of it, which is longer
// than the range at which the beam fleets actually choose to fight - so the
// carrier's reach is real, but it is spent through craft that can be shot down
// rather than through a gun that cannot.
//
// Everything below is faction-generic: the hangar is a hull-class field and the
// rules are tuning.strikeCraft. Nothing here names a power. Every entry point is
// guarded on `ship.squadrons`, which is null for every hull without a hangar, so
// a battle containing no carrier takes not one extra rng draw.
//
// The shape of a turn:
//   1. launch/replenish     - carriers pay power to put squadrons in the air
//   2. stance               - interceptors split between CAP and offensive sweep
//   3. raids, in initiative - each offensive squadron picks a target of its own
//                             class, is met by enemy CAP, then by point defence,
//                             and what survives attacks
// Interceptors may only engage hulls at or below interceptorMaxTargetPoints
// (frigates, destroyers and their like); bombers only hulls at or above
// bomberMinTargetPoints (cruisers and up). Nothing rearms a lost craft quickly:
// replenishPerTurn is the whole of a carrier's recovery.

const craftCfg = (tuning, type) => (tuning.strikeCraft?.types ?? {})[type] ?? {};

// Squadrons in the air, optionally filtered. `fn(squadron, carrier)`.
function airborne(fleet, fn) {
  const out = [];
  for (const s of living(fleet)) {
    if (!s.squadrons) continue;
    for (const sq of s.squadrons) {
      if (!sq.launched || sq.strength <= 0) continue;
      if (fn && !fn(sq, s)) continue;
      out.push({ carrier: s, sq });
    }
  }
  return out;
}

const fleetHasSquadrons = (fleet) => living(fleet).some((s) => s.squadrons);

// Combat air patrol overhead of one ship, expressed as a flat addition to the
// interception chance against a missile aimed at it. Zero without carriers.
function capMissileScreen(target, friends, tuning) {
  const SC = tuning.strikeCraft;
  if (!SC || !SC.enabled || !(SC.missileScreenPerCraft > 0)) return 0;
  if (!fleetHasSquadrons(friends)) return 0;
  let bonus = 0;
  for (const { carrier, sq } of airborne(friends, (sq) => sq.stance === "defence")) {
    if (!craftCfg(tuning, sq.type).canDefend) continue;
    if (distance(carrier.pos, target.pos) > SC.strikeRadiusHexes) continue;
    bonus += sq.strength * SC.missileScreenPerCraft;
  }
  return Math.min(SC.missileScreenMax ?? 1, bonus);
}

// Deck cycle: replenish, then put squadrons in the air or keep them there. Both
// cost power out of the carrier's pool, so a carrier flying a full deck has less
// left to absorb with - which is the tension the hull is built around.
function cycleDeck(carrier, foe, tuning, log) {
  const SC = tuning.strikeCraft;
  const foes = targetable(foe);
  const range = foes.length ? nearest(carrier.pos, foes).range : Infinity;
  let launched = 0, recovered = 0;
  for (const sq of carrier.squadrons) {
    if (SC.replenishPerTurn > 0 && sq.strength > 0 && sq.strength < sq.max) {
      sq.strength = Math.min(sq.max, sq.strength + SC.replenishPerTurn);
    }
    if (sq.strength <= 0) { sq.launched = false; continue; }
    if (range > SC.launchRangeHexes) {
      if (sq.launched) { sq.launched = false; recovered++; }
      continue;
    }
    const cost = sq.launched ? (SC.powerToSustain ?? 0) : (SC.powerToLaunch ?? 0);
    if (carrier.power < cost) {
      if (sq.launched) { sq.launched = false; recovered++; }
      continue;
    }
    carrier.power -= cost;
    if (!sq.launched) { sq.launched = true; launched++; }
  }
  if (log && launched) {
    log(`${carrier.id} launches ${launched} squadron(s), deck strength ` +
      carrier.squadrons.filter((s) => s.launched).reduce((a, s) => a + s.strength, 0));
  }
  if (log && recovered) log(`${carrier.id} recovers ${recovered} squadron(s)`);
}

// How many interceptor squadrons fly CAP rather than sweeping. Enough strength
// to cover the enemy bomber strength actually in the air, times defenceRatio;
// the rest go hunting light hulls. No rng - it is a standing order, not a roll.
function setStances(side, foe, tuning) {
  const SC = tuning.strikeCraft;
  // What the CAP is being asked to stop: enemy bombers in the air, plus the
  // enemy's live missile tubes at tubeThreat apiece. Without the tube term an
  // interceptor squadron facing a fleet that has no carrier of its own has
  // nothing to defend against and the whole wing sweeps, which throws away the
  // half of an interceptor's job that every navy actually built them for.
  let threat = 0;
  for (const { sq } of airborne(foe)) {
    if (!craftCfg(tuning, sq.type).canDefend) threat += sq.strength;
  }
  const tubes = SC.tubeThreat ?? 0;
  if (tubes > 0) {
    for (const f of living(foe)) {
      for (const m of f.mounts) if (m.kind === "missile" && !m.inop) threat += tubes;
    }
  }
  const want = threat * (SC.defenceRatio ?? 1);
  let onStation = 0;
  for (const s of living(side)) {
    if (!s.squadrons) continue;
    for (const sq of s.squadrons) {
      if (!craftCfg(tuning, sq.type).canDefend) { sq.stance = "offence"; continue; }
      if (sq.launched && sq.strength > 0 && onStation < want) {
        sq.stance = "defence";
        onStation += sq.strength;
      } else {
        sq.stance = "offence";
      }
    }
  }
}

// One squadron's raid: target, then CAP, then point defence, then the attack.
function runRaid(raid, tuning, rng, stats, log, onShot) {
  const SC = tuning.strikeCraft;
  const { carrier, sq, foe } = raid;
  if (carrier.destroyed || sq.strength <= 0 || !sq.launched) return;
  const cfg = craftCfg(tuning, sq.type);

  const cands = targetable(foe).filter((f) =>
    distance(carrier.pos, f.pos) <= SC.strikeRadiusHexes &&
    f.points >= (cfg.targetMinPoints ?? 0) &&
    f.points <= (cfg.targetMaxPoints ?? Infinity));
  if (!cands.length) return;
  // Bombers go for the biggest thing they can reach; interceptors take the
  // nearest light hull, which is what a sweep actually does.
  const target = cands.sort((a, b) => cfg.preferLargest
    ? (b.points - a.points) || (distance(carrier.pos, a.pos) - distance(carrier.pos, b.pos))
    : (distance(carrier.pos, a.pos) - distance(carrier.pos, b.pos)) || (b.points - a.points))[0];

  let strength = sq.strength;
  let capLoss = 0;

  // --- combat air patrol over the target ---
  const cap = airborne(foe, (s2, c) =>
    s2.stance === "defence" && craftCfg(tuning, s2.type).canDefend &&
    distance(c.pos, target.pos) <= SC.strikeRadiusHexes);
  for (const d of cap) {
    if (strength <= 0) break;
    const dKill = craftCfg(tuning, d.sq.type).dogfight ?? 0;
    let kills = 0;
    for (let i = 0; i < d.sq.strength && kills < strength; i++) {
      if (rng.next() < dKill) kills++;
    }
    strength -= kills;
    capLoss += kills;
    // The raid shoots back with whatever is left of it.
    let back = 0;
    for (let i = 0; i < strength && back < d.sq.strength; i++) {
      if (rng.next() < (cfg.dogfight ?? 0)) back++;
    }
    if (back > 0) {
      d.sq.strength -= back;
      raid.oppStats.craftLost += back;   // losses book against the craft's owner
      if (log) log(`${d.sq.id} loses ${back} to escorting fire`);
      if (d.sq.strength <= 0) {
        d.sq.strength = 0; d.sq.launched = false;
        if (log) log(`${d.sq.id} is wiped out`);
      }
    }
    if (kills > 0 && log) log(`${d.sq.id} intercepts ${sq.id}, ${kills} shot down`);
  }

  // --- point defence around the target ---
  let pdLoss = 0;
  const pdShips = living(foe).filter((f) => f.hull.pointDefence > 0 &&
    distance(f.pos, target.pos) <= tuning.pointDefence.rangeHexes);
  const pdTotal = pdShips.reduce((a, f) => a + f.hull.pointDefence, 0);
  if (strength > 0 && pdTotal > 0) {
    const chance = Math.min(SC.pdMaxKillChance ?? 1,
      pdTotal * (SC.pdKillChancePerPoint ?? 0) * (cfg.pdVulnerability ?? 1));
    for (let i = 0; i < strength; i++) if (rng.next() < chance) pdLoss++;
    strength -= pdLoss;
  }

  sq.strength = Math.max(0, sq.strength - capLoss - pdLoss);
  stats.craftLost += capLoss + pdLoss;
  if ((capLoss || pdLoss) && log) {
    const to = [];
    if (capLoss) to.push(`${capLoss} to interceptors`);
    if (pdLoss) to.push(`${pdLoss} to point defence`);
    log(`${sq.id} loses ${capLoss + pdLoss} craft on the run in (${to.join(", ")})`);
  }
  if (sq.strength <= 0) {
    sq.launched = false;
    if (log) log(`${sq.id} is wiped out`);
  }
  if (strength <= 0) {
    if (onShot) onShot({ kind: "strike", craft: sq.type, squadronId: sq.id,
      shooterId: carrier.id, targetId: target.id, strength: 0, hits: 0, damage: 0 });
    return;
  }

  // --- the attack run ---
  // Each craft is a separate small hit, which is the point of strike craft under
  // this damage model: absorption is capped per facing per round AND paid for
  // out of the pool, so a wave first drains a capital's power and then starts
  // rolling damage locations on it.
  const face = shieldFacing(target, carrier.pos);
  let hits = 0;
  for (let i = 0; i < strength; i++) if (rng.next() < (cfg.hitChance ?? 0)) hits++;
  stats.sorties++;
  // Logged BEFORE the damage lands, so that a "destroyed" line from inside
  // applyDamage reads as the consequence of the run rather than as something
  // that happened before it. The viewer replays these in order.
  if (log) {
    log(`${sq.id}: ${strength} ${sq.type}(s) press home on ${target.id}, ` +
      `${hits} hit for ${hits * cfg.damage}`);
  }
  let dealt = 0;
  for (let i = 0; i < hits && !target.destroyed; i++) {
    stats.damage += cfg.damage;
    stats.internal += applyDamage(target, face, cfg.damage, tuning, rng, log).internal;
    dealt += cfg.damage;
  }
  if (onShot) onShot({ kind: "strike", craft: sq.type, squadronId: sq.id,
    shooterId: carrier.id, targetId: target.id, strength, hits, damage: dealt });
}

// The whole strike phase, run once a turn. Returns immediately - and without
// touching the rng - if neither fleet has a carrier in it.
function strikePhase(A, B, tuning, rng, stats, log, onShot) {
  const SC = tuning.strikeCraft;
  if (!SC || !SC.enabled) return;
  const hasA = fleetHasSquadrons(A), hasB = fleetHasSquadrons(B);
  if (!hasA && !hasB) return;

  for (const [side, foe] of [[A, B], [B, A]]) {
    for (const s of living(side)) if (s.squadrons) cycleDeck(s, foe, tuning, log);
  }
  setStances(A, B, tuning);
  setStances(B, A, tuning);

  const raids = [];
  for (const [side, foe, st, opp] of [[A, B, stats.A, stats.B], [B, A, stats.B, stats.A]]) {
    for (const { carrier, sq } of airborne(side, (sq) => sq.stance === "offence")) {
      raids.push({ carrier, sq, foe, st, oppStats: opp, roll: rng.int(100) });
    }
  }
  raids.sort((x, y) => y.roll - x.roll);
  for (const raid of raids) runRaid(raid, tuning, rng, raid.st, log, onShot);
}

// A carrier that dies takes its air group with it. Called where the dead are
// swept up, so the loss lands in the log at the moment the hull goes.
function scuttleSquadrons(ship, log) {
  if (!ship.squadrons || ship.squadronsLost) return;
  ship.squadronsLost = true;
  const lost = ship.squadrons.reduce((a, s) => a + s.strength, 0);
  for (const sq of ship.squadrons) { sq.strength = 0; sq.launched = false; }
  if (lost > 0 && log) log(`${ship.id} goes down with ${lost} craft still aboard or in the air`);
}

// ---------------------------------------------------------------- actions

// Returns the number of mounts actually fired, so a ship that finds nothing
// worth shooting can spend the action manoeuvring instead of standing still.
// Class-interaction accuracy (ruling): light hulls take a malus shooting at
// heavies, heavies take roughly the same shooting at lights. Values are d10
// pips; fractional pips resolve probabilistically through the seeded PRNG, so
// -0.5 is a true -5%. Beams only - missiles carry no accuracy roll.
function classInteractionMod(shooter, target, tuning, rng) {
  const cfg = tuning.toHit.classInteraction;
  if (!cfg || !cfg.enabled) return 0;
  const heavy = (ship) => ship.points >= cfg.heavyThresholdPoints;
  let m = 0;
  if (!heavy(shooter) && heavy(target)) m = cfg.lightVsHeavy;
  else if (heavy(shooter) && !heavy(target)) m = cfg.heavyVsLight;
  if (m === 0) return 0;
  const whole = Math.trunc(m);
  const frac = m - whole;
  let mod = whole;
  if (frac !== 0 && rng.next() < Math.abs(frac)) mod += Math.sign(m);
  return mod;
}

function fire(ship, enemies, friends, tuning, rng, inFlight, stats, log, onShot) {
  const cmd = commandBonus(ship, friends, 'commandToHit');
  // The keel gun resolves before the secondaries and out of its own capacitor.
  // `fired` is 0 for every hull without ship.spinal, so the two early returns
  // below behave exactly as they always did.
  let fired = ship.spinal ? fireSpinal(ship, enemies, friends, tuning, rng, stats, log, onShot) : 0;
  let budget = spendable(ship);
  if (budget <= 0) return fired;
  const foes = targetable(enemies);
  if (!foes.length) return fired;

  for (const mount of ship.mounts) {
    if (mount.inop || mount.firedThisTurn || budget <= 0) continue;
    if (mount.kind === "spinal") continue;   // handled above, never by this loop
    const weapon = tuning.weapons[mount.type];
    const candidates = foes.filter(
      (f) => !f.destroyed && mayEngage(ship, f, tuning) && distance(ship.pos, f.pos) <= mount.maxRange && bears(ship, mount, f.pos) && lineOfFire(ship.pos, f.pos, tuning)
    );
    if (!candidates.length) continue;
    const target = candidates.sort((a, b) => distance(ship.pos, a.pos) - distance(ship.pos, b.pos))[0];
    const band = bandFor(mount, distance(ship.pos, target.pos));
    if (!band) continue;

    if (weapon.kind === "beam") {
      const power = Math.min(weapon.maxPower, budget);
      if (power < 1) continue;
      budget -= power; ship.power -= power;
      mount.firedThisTurn = true;
      fired++;
      stats.shots++;
      const evasion = Math.floor(target.movedThisTurn / tuning.toHit.evasionPerHexesMoved);
      const roll = rng.int(tuning.toHit.die) + 1;
      const hit = roll + (band.toHitMod ?? 0) + cmd + classInteractionMod(ship, target, tuning, rng) + tuning.toHit.crewRatingDefault - evasion - (ship.toHitPenalty ?? 0) >= tuning.toHit.target;
      if (hit) {
        stats.hits++;
        // FASA pattern: beam damage is the power put into it plus a range bonus.
        resolveHit(ship.pos, target, power + (band.damageBonus ?? 0), enemies, tuning, rng, stats, log);
      }
      if (onShot) onShot({ kind: "beam", weapon: mount.type, shooterId: ship.id, targetId: target.id, hit });
    } else {
      if (ship.magazine <= 0 || budget < weapon.powerToArm) continue;
      budget -= weapon.powerToArm; ship.power -= weapon.powerToArm;
      ship.magazine--;
      mount.firedThisTurn = true;
      fired++;
      stats.launches++;
      inFlight.push({
        shooterPos: { ...ship.pos }, side: ship.side, targetId: target.id,
        weapon: mount.type,
        shooterPoints: ship.points,
        damage: Math.max(0, weapon.damage + (band.damageMod ?? 0)),
        spread: weapon.spreadPer ?? 0
      });
      if (onShot) onShot({ kind: "launch", weapon: mount.type, shooterId: ship.id, targetId: target.id });
    }
  }
  return fired;
}

// NOTE for anyone who reaches for it next: a "hunt the flight deck" rule - every
// hull steering for an enemy carrier inside some radius instead of for whatever
// is nearest - was written, measured and thrown away. It is the obvious way to
// put the carrier under threat and it does not work, in either direction. At a
// hunt radius of 12 it moved the buy delta from +6.3 to +6.7pp and the carrier's
// loss rate from 33% to 35% of battles; at 26 (which is the whole map) it reached
// 41% and the buy delta fell only to +5.6. It does not police a long standoff
// either: at standoffRangeHexes 10 the runaway cells stayed exactly where they
// were (Vraygon at 32 points, +32pp without hunting and +33pp with it). Ships
// that converge on a carrier arrive strung out and are beaten in detail, which
// is worth about as much to the carrier's owner as the extra fire costs it. The
// thing that actually governs this hull is standoffRangeHexes; see there.
function move(ship, enemies, friends, tuning) {
  const foes = living(enemies);
  if (!foes.length) return;
  const target = nearest(ship.pos, foes).ship;

  // FLIGHT RULES: a ship moves only straight along its facing and may turn at
  // most turnRate hexsides per round. Turning costs no power - it costs tempo.
  // This is what makes ships FLY (banked arcs, wallowing capitals) instead of
  // sliding like hockey pucks. The warp jump is exempt: it is not flight.
  const M = tuning.movement ?? {};
  const coupled = M.coupledToFacing !== false;
  let turnsLeft = coupled ? ((M.turnRatePerRound ?? {})[ship.className] ?? 2) : 6;

  const turnTowards = (desired) => {
    while (turnsLeft > 0 && ship.facing !== desired) {
      ship.facing = turnToward(ship.facing, desired);
      turnsLeft--;
    }
  };

  // RULING (2026-09-01): a spinal gun that is charging or holding a full bank
  // plants the ship. It may turn to aim at its normal rate and nothing else -
  // the Wave Motion Gun tradition, and a real cost: enemies may work round to
  // the bare quarters, or close inside six hexes where the gun cannot track.
  // Venting (cooldown) is free movement: plant, fire, run, plant. Guarded on
  // ship.spinal, so no other hull is touched.
  if (ship.spinal && (tuning.weapons[ship.spinal.type]?.immobileWhileCharging)) {
    const st = ship.spinal;
    const planted = (st.state === "charging" && st.charge > 0) || st.state === "ready";
    if (planted) {
      turnTowards(bestHeading(ship, target.pos, tuning));
      return;
    }
  }

  // One forward step along the current facing, if legal and if it moves the
  // ship the way it needs to go ("close" shrinks the gap, "open" grows it).
  const forwardStep = (goalPos, need) => {
    const next = add(ship.pos, ship.facing);
    if (!inBounds(next, tuning)) return false;
    const dNow = distance(ship.pos, goalPos);
    const dNext = distance(next, goalPos);
    if (need === "close" && dNext >= dNow) return false;
    // Same-hex rule: closing to range zero silences both ships, so the helm
    // stops one hex short. Passing through a hex is still legal.
    if (need === "close" && dNext === 0 && tuning.battle?.sameHexNoFire !== false) return false;
    if (need === "open" && dNext <= dNow) return false;
    ship.pos = next;
    ship.power -= ship.movementPointRatio;
    ship.movedThisTurn++;
    return true;
  };

  // FORMATION. Escorts hold station on the capital they screen.
  const F = tuning.formation ?? {};
  const mates = living(friends).filter((f) => f !== ship);
  let anchor = null;
  if (F.enabled && ship.hull.screen > 0) {
    const caps = mates.filter((f) => f.hull.screen === 0 && f.cloaked === ship.cloaked);
    if (caps.length) anchor = nearest(ship.pos, caps).ship;
  }
  if (anchor && distance(ship.pos, anchor.pos) > (F.screenStation ?? 2)) {
    turnTowards(bearing(ship.pos, anchor.pos));
    let b = spendable(ship);
    while (b >= ship.movementPointRatio &&
           distance(ship.pos, anchor.pos) > (F.screenStation ?? 2)) {
      if (!forwardStep(anchor.pos, "close")) break;
      b -= ship.movementPointRatio;
    }
    turnTowards(bestHeading(ship, target.pos, tuning)); // spare turn = stance
    return;
  }

  // Nobody advances more than cohesionRadius ahead of the fleet's centre.
  const fleetGap = F.enabled && mates.length
    ? distance(centroid([ship, ...mates]), target.pos) : Infinity;
  const leash = F.cohesionRadius ?? 3;
  const want = ship.cloaked ? preferredRange(ship, tuning) : engagementRange(ship, target, tuning);

  const flanking = ship.cloaked && !ship.decloaking &&
    distance(ship.pos, target.pos) > detectionRangeAgainst(ship, tuning) - 2;
  const swing = ship.id.length % 2 === 0 ? 1 : 5;

  const d0 = distance(ship.pos, target.pos);
  let need = "hold";
  if (d0 > want && !(d0 < fleetGap - leash)) need = "close";
  else if (d0 < want && !ship.cloaked && want - d0 >= 1 && canWithdrawFighting(ship, tuning)) need = "open";

  if (need === "hold") {
    // In position: fight with the guns, not the helm.
    turnTowards(bestHeading(ship, target.pos, tuning));
    return;
  }

  const direct = bearing(ship.pos, target.pos);
  const travelDir = need === "close"
    ? (flanking ? (direct + swing) % 6 : direct)
    : (direct + 3) % 6;
  turnTowards(travelDir);

  let budget = spendable(ship);
  while (budget >= ship.movementPointRatio) {
    const d = distance(ship.pos, target.pos);
    if (need === "close" && (d <= want || d < fleetGap - leash)) break;
    if (need === "open" && d >= want) break;
    if (!forwardStep(target.pos, need)) break; // facing not yet useful: finish the turn next round
    budget -= ship.movementPointRatio;
  }
  // Arrived with turn allowance to spare: settle into the firing stance.
  const dEnd = distance(ship.pos, target.pos);
  if ((need === "close" && dEnd <= want) || (need === "open" && dEnd >= want)) {
    turnTowards(bestHeading(ship, target.pos, tuning));
  }

  // Klingon pattern: a Zandrax ship still short of the range it wants may burn
  // extra hexes for free - along its facing, like any other flight - paying in
  // self-inflicted engine stress and accuracy for the rest of the turn.
  const em = tuning.emergencyManoeuvre;
  const mayBurst = em && em.factions.includes(ship.faction) && !ship.emergencyUsed;
  if (mayBurst && need === "close" && distance(ship.pos, target.pos) > want) {
    ship.emergencyUsed = true;
    for (let i = 0; i < em.extraHexes; i++) {
      if (distance(ship.pos, target.pos) <= want) break;
      if (!forwardStep(target.pos, "close")) break;
      ship.power += ship.movementPointRatio; // burst hexes are free of power cost
    }
    ship.superstructure -= em.stressDamage;
    ship.toHitPenalty = em.toHitPenalty;
    if (ship.superstructure <= 0) { ship.superstructure = 0; ship.destroyed = true; }
  }
}

// Krelath short-range tactical warp. Replaces the cloak they lost: instead of
// choosing WHETHER to engage, they choose WHERE they appear in one. Arrives by
// preference behind the target, where the rear facing table takes engineering
// and eats the current turn's power pool.
function tryWarp(ship, enemies, friends, tuning, log) {
  const W = tuning.warpJump;
  if (!W || !W.factions.includes(ship.faction)) return false;
  if (W.oncePerTurn && ship.warpedThisTurn) return false;

  // A squadron manoeuvre, not a fleet teleport. Left uncapped, every Krelath
  // ship jumped behind the SAME enemy battleship on turn one and the whole
  // action collapsed into one point-blank melee at the range their blasters
  // like best - measured, 94% against Earth at 32 points in six turns.
  const share = W.fleetFraction ?? 1;
  if (share < 1) {
    const fleet = living(friends);
    const already = fleet.filter((f) => f.warpedThisTurn).length;
    if (already >= Math.max(1, Math.floor(fleet.length * share))) return false;
  }

  const foes = targetable(enemies);
  if (!foes.length) return false;
  const target = nearest(ship.pos, foes).ship;
  const want = Math.max(1, preferredRange(ship, tuning));
  const gap = distance(ship.pos, target.pos);
  if (gap <= want + 1) return false;              // already in position

  const cost = Math.round(fullPower(ship) * W.powerCostFraction);
  if (ship.power < cost) return false;

  // Aim for a hex `want` behind the target; fall back to straight ahead of it.
  const behind = (target.facing + 3) % 6;
  let dest = target.pos;
  for (let i = 0; i < want; i++) dest = add(dest, behind);
  const rearReachable = W.preferRearArc && inBounds(dest, tuning) &&
    distance(ship.pos, dest) <= W.rangeHexes;
  if (!rearReachable) {
    // A jump straight up the enemy's nose is not the trait; it is a taxi.
    // Measured, the fallback was the whole of the warp's usage: at 26 hexes no
    // rear hex is within jump range, so every Krelath ship burned a third of
    // its pool closing on turn one, the fleet arrived in a knife fight two
    // turns early with empty engines, and the trait cost its owner 23pp at 64
    // points and 35pp at 16 against simply not having it. Gated to a real rear
    // insertion, the warp waits for the enemy to come inside jump range and
    // then does what it is named for.
    if (W.requireRearArc) return false;
    dest = ship.pos;
    const toward = bearing(ship.pos, target.pos);
    for (let i = 0; i < Math.min(W.rangeHexes, gap - want); i++) {
      const step = add(dest, toward);
      if (!inBounds(step, tuning)) break;
      dest = step;
    }
  }
  if (dest.q === ship.pos.q && dest.r === ship.pos.r) return false;
  // The jump has to be worth the round it costs and the third of the pool it
  // burns. Without this test the warp was also unreachable in practice: it was
  // only attempted when nothing could bear, and a Krelath blaster reaches 17
  // hexes of a 16-hex opening range, so every ship fired from the far side of
  // the field instead and the trait never fired once in a whole campaign.
  if (gap - distance(dest, target.pos) < (W.minGain ?? 0)) return false;

  ship.pos = dest;
  ship.power -= cost;
  ship.warpedThisTurn = true;
  ship.facing = turnToward(ship.facing, bestHeading(ship, target.pos, tuning));
  if (log) log(ship.id + ' warps in behind ' + target.id);
  return true;
}

function scan(ship, enemies, friends, tuning, log) {
  const cmdRange = commandBonus(ship, friends, 'commandDetectionBonus');
  const foes = living(enemies);
  if (!foes.length) return;
  // Guess the arc from known contacts only; with none, sweep dead ahead.
  const known = foes.filter((e) => !e.cloaked || e.detected);
  const guess = known.length ? shieldFacing(ship, centroid(known)) : 2;
  let found = 0;
  for (const e of foes) {
    if (!e.cloaked || e.detected) continue;
    if (distance(ship.pos, e.pos) > detectionRangeAgainst(e, tuning) + cmdRange) continue;
    if (!inArc(ship, guess, e.pos)) continue;
    e.detected = true; // a successful detection informs all friendly forces
    found++;
  }
  if (found && log) log(`${ship.id} sweeps arc ${guess}: ${found} contact(s)`);
}

function evade(ship, tuning, rng, log) {
  if (!ship.cloaked || !ship.detected) return;
  if (rng.next() < tuning.cloak.evadeChance) {
    ship.detected = false;
    if (log) log(`${ship.id} evades, contact lost`);
  }
}

// ---------------------------------------------------------------- battle

export function runBattle(fleets, tuning, rng, opts = {}) {
  if (opts.terrain && opts.terrain.length) {
    tuning = { ...tuning, battle: { ...tuning.battle, terrain: opts.terrain } };
  }
  const log = opts.log ?? null;
  let shotTurn = 0, shotRound = 0;
  const onShot = opts.onShot
    ? (event) => opts.onShot({ turn: shotTurn, round: shotRound, ...event })
    : null;
  const maxTurns = opts.maxTurns ?? tuning.battle.maxTurns;
  const rounds = tuning.battle.roundsPerTurn;
  const [A, B] = fleets;
  A.forEach((s) => { s.side = "A"; });
  B.forEach((s) => { s.side = "B"; });
  const blank = () => ({
    shots: 0, hits: 0, launches: 0, damage: 0, internal: 0, screened: 0,
    sorties: 0, craftLost: 0, hitsForward: 0, hitsRear: 0
  });
  const stats = { A: blank(), B: blank() };
  let inFlight = [];
  let turnsRun = 0;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (!living(A).length || !living(B).length) break;
    turnsRun = turn;
    shotTurn = turn;
    shotRound = 1;

    // Missiles launched last turn arrive, subject to interception.
    const arriving = inFlight;
    inFlight = [];
    for (const m of arriving) {
      const foeSide = m.side === "A" ? B : A;
      const st = m.side === "A" ? stats.A : stats.B;
      const target = foeSide.find((s) => s.id === m.targetId);
      if (!target || target.destroyed) {
        if (onShot) onShot({ kind: "missile", weapon: m.weapon, targetId: m.targetId, outcome: "dead-target", damage: 0 });
        continue;
      }
      // Class interaction, missile half: a capital-grade missile cannot track a
      // small nimble hull. Rolled before interception - evasion needs no PD.
      const MC = tuning.toHit.missileClassInteraction;
      if (MC && MC.enabled &&
          (m.shooterPoints ?? 0) >= MC.heavyThresholdPoints &&
          target.points < MC.heavyThresholdPoints &&
          rng.next() < MC.heavyVsLightEvadeChance) {
        if (onShot) onShot({ kind: "missile", weapon: m.weapon, targetId: m.targetId, outcome: "evaded", damage: 0 });
        continue;
      }
      if (intercepted(target, foeSide, tuning, rng)) {
        if (onShot) onShot({ kind: "missile", weapon: m.weapon, targetId: m.targetId, outcome: "intercepted", damage: 0 });
        continue;
      }
      resolveHit(m.shooterPos, target, m.damage, foeSide, tuning, rng, st, log, m.spread);
      if (onShot) onShot({ kind: "missile", weapon: m.weapon, targetId: m.targetId, outcome: "hit", damage: m.damage });
    }

    for (const s of [...living(A), ...living(B)]) startTurn(s, tuning);
    // Spinal capacitors draw off the top of the fresh pool, before the reserve
    // is set - so the charge is paid for in shields as well as in gunnery.
    // No-op on every hull that has no spinal mount.
    for (const s of living(A)) chargeSpinal(s, B, tuning, log);
    for (const s of living(B)) chargeSpinal(s, A, tuning, log);
    // The spending brake is set once a turn, against the tactical picture.
    for (const s of [...living(A), ...living(B)]) {
      s.reserve = doctrineReserve(s, s.side === "A" ? B : A, tuning);
    }
    for (const s of [...living(A), ...living(B)]) evade(s, tuning, rng, log);

    // Coordinated ambush: a cloaked force breaks cover together.
    for (const [side, foe] of [[A, B], [B, A]]) {
      const cloaked = living(side).filter((s) => s.cloaked && !s.decloaking);
      if (!cloaked.length) continue;
      const ready = cloaked.filter((s) => {
        const n = nearest(s.pos, living(foe));
        return n.ship && n.range <= preferredRange(s, tuning);
      });
      if (ready.length >= Math.ceil(cloaked.length * 0.6)) {
        for (const s of cloaked) s.decloaking = true;
        if (log) log(`${cloaked[0].faction} force decloaks: ${cloaked.length} ships`);
      }
    }

    for (let round = 1; round <= rounds; round++) {
      if (!living(A).length || !living(B).length) break;
      shotRound = round;
      for (const s of [...living(A), ...living(B)]) startRound(s);

      // The strike wave goes in once a turn, on a fresh shield cycle and before
      // the line opens fire - so a wave that strips a facing's absorption is
      // followed straight in by the guns. No-op without a carrier on the field.
      if (round === (tuning.strikeCraft?.strikeRound ?? 1)) {
        strikePhase(A, B, tuning, rng, stats, log, onShot);
        for (const s of [...A, ...B]) if (s.destroyed) scuttleSquadrons(s, log);
      }

      // Action order: d100 plus captain rating, as in FASA.
      // FASA bid initiative from declared movement. A ship that can commit more
      // movement this turn acts first; the die only breaks ties.
      const byMovement = tuning.initiative?.fromMovementCommitment;
      const order = [...living(A), ...living(B)]
        .map((s) => ({
          s,
          roll: (byMovement ? Math.floor(spendable(s) / Math.max(0.1, s.movementPointRatio)) * 10 : 0)
            + rng.int(100) + 1 + tuning.toHit.crewRatingDefault
        }))
        .sort((x, y) => y.roll - x.roll)
        .map((x) => x.s);

      const allShips = [...A, ...B];
      for (const s of order) {
        if (s.destroyed) continue;
        const foe = s.side === "A" ? B : A;
        const st = s.side === "A" ? stats.A : stats.B;
        if (s.cloaked && !s.decloaking) { move(s, foe, s.side === "A" ? A : B, tuning); continue; }
        if (s.decloaking) continue; // the decloak turn is consumed

        const hidden = living(foe).filter((e) => e.cloaked && !e.detected).length;
        const canBear = targetable(foe).some((f) =>
          s.mounts.some((m) => !m.inop && !m.firedThisTurn &&
            distance(s.pos, f.pos) <= m.maxRange && bears(s, m, f.pos)));

        if (hidden && s.hull.sensorRating >= 2 && !canBear) { scan(s, foe, s.side === "A" ? A : B, tuning, log); continue; }
        // Jumping is considered BEFORE shooting. Being able to reach a target
        // is not a reason to stay where you are when the whole point of the
        // trait is to fight from a better place.
        if (tryWarp(s, foe, s.side === "A" ? A : B, tuning, log)) continue; // guns bear next round
        // A ship that finds nothing worth shooting spends the action moving.
        if (canBear && fire(s, foe, s.side === "A" ? A : B, tuning, rng, inFlight, st, log, onShot) > 0) continue;
        move(s, foe, s.side === "A" ? A : B, tuning);
      }

      // Anything killed this round goes up now, and may take neighbours with it.
      for (const s of allShips) if (s.destroyed && !s.exploded) detonate(s, allShips, tuning, rng, log);
      for (const s of allShips) if (s.destroyed && s.squadrons) scuttleSquadrons(s, log);
      if (opts.onRound) opts.onRound(turn, round, fleets);
    }

    for (const s of [...living(A), ...living(B)]) {
      if (s.decloaking) { s.decloaking = false; s.cloaked = false; s.detected = true; }
    }
  }

  const remA = living(A), remB = living(B);
  const ptsA = remA.reduce((s, x) => s + x.points, 0);
  const ptsB = remB.reduce((s, x) => s + x.points, 0);
  let victor = null;
  if (!remB.length && remA.length) victor = "A";
  else if (!remA.length && remB.length) victor = "B";
  else if (ptsA > ptsB) victor = "A";
  else if (ptsB > ptsA) victor = "B";

  return {
    victor, turns: turnsRun,
    survivorsA: remA.length, survivorsB: remB.length,
    pointsA: ptsA, pointsB: ptsB, stats
  };
}

export function buildFleet(faction, composition, tuning, loadouts, rng, prefix) {
  const ships = [];
  let n = 0;
  for (const [className, count] of Object.entries(composition)) {
    for (let i = 0; i < count; i++) {
      ships.push(buildShip(`${prefix}-${className}-${++n}`, faction, className, tuning, loadouts, rng));
    }
  }
  return ships;
}

// Order a fleet for the line of battle: heaviest hulls in the centre, light
// hulls on the wings. Deployment was previously in composition key order, which
// parked whatever came last on the extreme flank - measured at ~27pp of win
// rate against any 4-point hull unlucky enough to land there.
function battleLine(fleet) {
  const sorted = [...fleet].sort((a, b) => b.points - a.points);
  const line = [];
  // Alternate heavy ships outward from the centre.
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0) line.push(sorted[i]);
    else line.unshift(sorted[i]);
  }
  return line;
}

export function deployFleets(A, B, tuning) {
  const half = Math.floor(tuning.battle.startDistanceHexes / 2);
  // A battle line must sit ACROSS the axis of approach. Holding q constant and
  // varying r walks along a hex DIAGONAL, on which distance is degenerate: from
  // there every ship in one fleet is exactly startDistance from most of the
  // other fleet, so `nearest` fell through to array order and side A's whole
  // force converged on one enemy ship while side B stayed strung out. That
  // handed A a free concentration of force. A line perpendicular to the
  // approach steps q back one hex every two rows.
  const orderedA = battleLine(A);
  const orderedB = battleLine(B);
  const spacing = tuning.battle?.deploySpacing ?? 1;
  const line = (n, i) => {
    const row = i - Math.floor((n - 1) / 2);
    return { q: -half - Math.floor((row * spacing) / 2), r: row * spacing };
  };
  orderedA.forEach((s, i) => { s.pos = line(orderedA.length, i); s.facing = 0; });
  // B is A's formation rotated 180 degrees, so the geometry - including every
  // equidistant tie-break - is identical for both sides.
  orderedB.forEach((s, i) => {
    const p = line(orderedB.length, i);
    s.pos = { q: -p.q, r: -p.r };
    s.facing = 3;
  });
}


// ------------------------------------------------------------ scenarios
// A scenario places every element explicitly (ruling 2026-09-02: fleet
// composition and the position of every scenario element are the player's
// to set). Shape:
//   { name, seed, map: {widthHexes, heightHexes},
//     terrain: [{type: "moon"|"planet", q, r}],
//     sides: [{faction, ships: [{className, q, r, facing, loadout?}]}, {...}] }
// Ships without q/r fall back to the line-of-battle deployment for their
// side. Returns {fleets, terrain, tuning} ready for runBattle(fleets, tuning,
// rng, {terrain}). Terrain hexes are refused as ship positions.
export function buildScenario(scenario, tuning, loadouts, rng) {
  const t = scenario.map
    ? { ...tuning, battle: { ...tuning.battle, map: { shape: "rect", widthHexes: scenario.map.widthHexes, heightHexes: scenario.map.heightHexes } } }
    : tuning;
  const terrain = (scenario.terrain ?? []).map((x) => ({ type: x.type, q: x.q, r: x.r }));
  const withTerrain = { ...t, battle: { ...t.battle, terrain } };
  const fleets = scenario.sides.slice(0, 2).map((side, i) => {
    const tag = i === 0 ? "A" : "B";
    return side.ships.map((sh, k) =>
      buildShip(`${tag}-${sh.className}-${k + 1}`, side.faction, sh.className, withTerrain, loadouts, rng, sh.loadout));
  });
  // Explicit positions first; anything unplaced takes the line deployment.
  const placedA = scenario.sides[0].ships.map((sh) => Number.isFinite(sh.q) && Number.isFinite(sh.r));
  const placedB = scenario.sides[1].ships.map((sh) => Number.isFinite(sh.q) && Number.isFinite(sh.r));
  if (!placedA.every(Boolean) || !placedB.every(Boolean)) deployFleets(fleets[0], fleets[1], withTerrain);
  scenario.sides.slice(0, 2).forEach((side, i) => side.ships.forEach((sh, k) => {
    const ship = fleets[i][k];
    if (Number.isFinite(sh.q) && Number.isFinite(sh.r)) {
      if (blockedHex({ q: sh.q, r: sh.r }, withTerrain)) throw new Error(`${ship.id} placed on terrain at ${sh.q},${sh.r}`);
      ship.pos = { q: sh.q, r: sh.r };
    }
    if (Number.isFinite(sh.facing)) ship.facing = ((sh.facing % 6) + 6) % 6;
  }));
  return { fleets, terrain, tuning: withTerrain };
}
