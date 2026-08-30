// Tactical combat resolver, built on the FASA power model.
//
// A turn is three rounds. Each ship's power pool resets at turn start; every
// action spends from it; shields absorb damage out of whatever is left. Firing
// arcs decide which mounts can bear. See docs/fasa-mechanics-notes.md.
//
// Sits behind the frozen combat interface in src/combat.js; the strategic
// layer never sees anything in this file.

import { distance, add, bearing, shieldFacing, faceFor, inArc, turnToward } from "./hex.js";
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

// Which face of the SHOOTER does the target lie off? A mount bears only if
// that face falls inside its arc. This is what limits a big ship: a battleship
// has all-round coverage but only two beams on any one bearing.
function bears(shooter, mount, targetPos) {
  return mount.arc.includes(shieldFacing(shooter, targetPos));
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
    let score = 0;
    for (const m of ship.mounts) {
      if (m.inop || m.firedThisTurn || !m.arc.includes(face)) continue;
      const w = tuning.weapons[m.type];
      score += w.kind === "beam" ? w.maxPower : (w.damage / 3);
    }
    if (!ship.shieldDown[face]) score += 0.5;   // meet him with a live shield
    if (face === 2) score += 0.25;              // and keep the nose round on a tie
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return best;
}

// The range this ship wants: the best band of its longest-reaching beam.
function preferredRange(ship, tuning) {
  let best = 4;
  for (const m of ship.mounts) {
    if (m.kind !== "beam" || m.inop) continue;
    let top = m.bands[0];
    for (const b of m.bands) if ((b.damageBonus ?? 0) > (top.damageBonus ?? 0)) top = b;
    best = Math.max(best, top.to);
  }
  return best;
}

// Longest range at which this ship can still hurt anything.
function maxReach(ship, tuning) {
  let r = 0;
  for (const m of ship.mounts) {
    if (m.inop) continue;
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
function inBounds(pos, tuning) {
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
  const punch = Math.max(0, dead.power) * yieldMult;
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
  if (hurt && log) log(dead.id + ' detonates, catching ' + hurt + ' ship(s)');
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
  if (!pd.length) return false;
  const total = pd.reduce((s, f) => s + f.hull.pointDefence, 0);
  return rng.next() < Math.min(tuning.pointDefence.maxChance, total * tuning.pointDefence.chancePerPoint);
}

function resolveHit(shooterPos, target, damage, defenders, tuning, rng, stats, log, spread) {
  if (target.destroyed) return;
  const victim = screenFor(target, defenders, tuning, rng) ?? target;
  if (victim.destroyed) return;
  if (victim !== target) stats.screened++;
  const face = shieldFacing(victim, shooterPos);
  stats.damage += damage;
  // The blow lands whole against the shield; only what penetrates is spread
  // across the hull for damage-location purposes.
  stats.internal += applyDamage(victim, face, damage, tuning, rng, log, spread).internal;
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
  let fired = 0;
  let budget = spendable(ship);
  if (budget <= 0) return 0;
  const foes = targetable(enemies);
  if (!foes.length) return 0;

  for (const mount of ship.mounts) {
    if (mount.inop || mount.firedThisTurn || budget <= 0) continue;
    const weapon = tuning.weapons[mount.type];
    const candidates = foes.filter(
      (f) => !f.destroyed && distance(ship.pos, f.pos) <= mount.maxRange && bears(ship, mount, f.pos)
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

  // One forward step along the current facing, if legal and if it moves the
  // ship the way it needs to go ("close" shrinks the gap, "open" grows it).
  const forwardStep = (goalPos, need) => {
    const next = add(ship.pos, ship.facing);
    if (!inBounds(next, tuning)) return false;
    const dNow = distance(ship.pos, goalPos);
    const dNext = distance(next, goalPos);
    if (need === "close" && dNext >= dNow) return false;
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
  else if (d0 < want && !ship.cloaked && want - d0 >= 1) need = "open";

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
  if (!W.preferRearArc || !inBounds(dest, tuning) || distance(ship.pos, dest) > W.rangeHexes) {
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
  const blank = () => ({ shots: 0, hits: 0, launches: 0, damage: 0, internal: 0, screened: 0 });
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
