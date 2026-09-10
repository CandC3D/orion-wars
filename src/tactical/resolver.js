// Tactical combat resolver, built on the FASA power model.
//
// A turn is three rounds. Each ship's power pool resets at turn start; every
// action spends from it; shields absorb damage out of whatever is left. Firing
// arcs decide which mounts can bear. See docs/fasa-mechanics-notes.md.
//
// Sits behind the frozen combat interface in src/combat.js; the strategic
// layer never sees anything in this file.

import { distance, add, bearing, shieldFacing, faceFor, inArc, turnToward, hexLineGroups } from "./hex.js";
import { buildShip, weaponFor, fullPower, ratedPower, shieldCapacity, shieldCost, startTurn, startRound, spendable, applyDamage } from "./ship.js";
import { makePrng, seedFromString } from "../prng.js";
import { refusesStep, ventsUnderFire } from "./ship-command.js";
import { fleetRuleIssues } from "./fleet-rules.js";
import { deploymentErrors, terrainFootprint } from "./deployment.js";
import { specialCapabilities } from "./specials.js";
import { objectiveErrors } from "./objectives.js";
import { grantScanContact, loseContact, sensorAbility, assertExecutableContacts } from './contacts.js';
import { SENSING_PROFILE, currentContacts, pruneScanLocks, recordShieldSweep } from './sensing.js';
import { scanCapabilities, scanActionError } from './scans.js';
import { createMissileFlight, advanceMissileFlights, missileImpactFace, missileGeometry, snapshotMissiles } from './missiles.js';
import { advanceManualSpinal } from './spinal-control.js';
import { nameShips } from './ship-registry.js';

// ---------------------------------------------------------------- helpers

const living = (fleet) => fleet.filter((s) => !s.destroyed);
// Still fighting: not destroyed and not crippled. `living` remains "physically
// present" - a crippled hull can still be shot at, and still explodes.
const fighting = (fleet) => fleet.filter((s) => !s.destroyed && !s.crippled);
const enemyAt = (pos, enemies, tuning) => tuning.battle?.sameHexNoFire !== false &&
  enemies.some(s => !s.destroyed && s.pos.q === pos.q && s.pos.r === pos.r);

// ------------------------------------------------------- instrumentation
// The helm keeps an account of itself, so each rule can be measured rather
// than argued about. Everything here is inert behind one boolean unless a
// harness switches it on with resetHelmStats(true), and nothing in it touches
// the rng or any ship state - a battle runs byte-identically either way.
export const helmStats = { on: false };
// A module-scope boolean rather than a property read on the exported object:
// the counters sit in the hottest loops in the engine, and `helmStats.on` in
// those loops measured 5% of the whole harness's wall-clock on its own.
let INS = false;
export function resetHelmStats(on = false) {
  INS = !!on;
  Object.assign(helmStats, {
    on,
    headingCalls: 0, headingArc: 0, headingBudget: 0,
    needClose: 0, needOpen: 0, needHold: 0,
    stepDirect: 0, stepFlank: 0,
    orbitSteps: 0, evadeSteps: 0, gatherHeld: 0, leashHeld: 0, aimSwitch: 0,
    presentRounds: 0, presentWeak: 0,
    contactSpreadA: 0, contactSpreadB: 0, contactMateA: 0, contactMateB: 0, contactN: 0
  });
  return helmStats;
}
resetHelmStats(false);

function centroid(ships) {
  if (!ships.length) return { q: 0, r: 0 };
  const symmetricRound = (value) => value < 0 ? -Math.round(-value) : Math.round(value);
  return {
    q: symmetricRound(ships.reduce((s, x) => s + x.pos.q, 0) / ships.length),
    r: symmetricRound(ships.reduce((s, x) => s + x.pos.r, 0) / ships.length)
  };
}

const finiteSensing = battle => battle?.contacts?.profile === SENSING_PROFILE;
const reconcileContacts = battle => { if (finiteSensing(battle)) pruneScanLocks(battle); };
const targetable = (enemies, battle = null, side = null) => {
  if (!finiteSensing(battle)) return living(enemies).filter(e => !e.cloaked || e.detected);
  const known = new Set(currentContacts(battle, side).map(c => c.id));
  return living(enemies).filter(e => known.has(e.id));
};

// Deterministic ties are expressed in the observer's local frame. Scanning
// absolute hex directions (0..5) made an otherwise identical fleet behave
// differently after a 180-degree rotation.
const relativeDir = (origin, dir) => (dir - origin + 6) % 6;
const directionTie = (a, b, origin) => {
  const da = relativeDir(origin, a), db = relativeDir(origin, b);
  return (Math.min(da, 6 - da) - Math.min(db, 6 - db)) || (da - db);
};
const canonicalShipCompare = (a, b) =>
  ((b?.points ?? 0) - (a?.points ?? 0)) ||
  String(a?.className ?? "").localeCompare(String(b?.className ?? "")) ||
  String(a?.id ?? "").localeCompare(String(b?.id ?? ""), undefined, { numeric: true });
const targetTie = (observer, a, b) =>
  directionTie(bearing(observer.pos, a.pos), bearing(observer.pos, b.pos), observer.facing) ||
  canonicalShipCompare(a, b);

function nearest(from, ships, facing = 0) {
  let best = null, bestD = Infinity;
  for (const s of ships) {
    const d = distance(from, s.pos);
    if (d < bestD || (d === bestD && best &&
        (directionTie(bearing(from, s.pos), bearing(from, best.pos), facing) || canonicalShipCompare(s, best)) < 0)) {
      bestD = d; best = s;
    }
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
  const d = distance(shooter.pos, target.pos);
  if (tuning.battle?.sameHexNoFire !== false && d === 0) return false;
  // Nebula visibility: a ship in the fog sees and is seen only at short range.
  if (inNebula(shooter.pos, tuning) || inNebula(target.pos, tuning)) {
    if (d > (nebulaRules(tuning).visibilityHexes ?? 3)) return false;
  }
  return true;
}

// Which face of the SHOOTER does the target lie off? A mount bears only if
// that face falls inside its arc. This is what limits a big ship: a battleship
// has all-round coverage but only two beams on any one bearing.
function bears(shooter, mount, targetPos) {
  return mount.arc.includes(shieldFacing(shooter, targetPos));
}

// How sound is one of this ship's own faces? 1 intact, 0.5 damaged (one hit
// on the shield generator for that facing), 0 down. The helm uses it twice:
// to decide which face to PRESENT to the enemy, and to decide which of an
// enemy's faces is worth steering for.
const SHIELD_SYS = [null, "shield-1", "shield-2", "shield-3", "shield-4", "shield-5", "shield-6"];
function faceHealth(ship, face) {
  if (ship.shieldDown[face]) return 0;
  return (ship.systems[SHIELD_SYS[face]] ?? 0) >= 1 ? 0.5 : 1;
}

// Weight of fire a ship can throw through one of its own faces. `standing`
// counts the whole battery rather than only the mounts still loaded this turn:
// deciding whether a hull is CAPABLE of a fighting withdrawal is a question
// about the ship, not about which triggers have already been pulled this turn.
function fireWeight(ship, face, tuning, standing = false) {
  let score = 0;
  for (const m of ship.mounts) {
    if (m.inop || (!standing && m.firedThisTurn) || !m.arc.includes(face)) continue;
    const w = weaponFor(ship, m.type, tuning);
    score += w.kind === "beam" ? w.maxPower
      : w.kind === "spinal" ? (w.aimWeight ?? 0)   // keel gun: aimed by the helm
      : (w.damage / 3);
  }
  return score;
}

// ------------------------------------------------------------ the helm
//
// ARC AWARENESS (2026-09-03). Everything from here to the end of move() is
// governed by `tuning.helm`; with the block absent, or with
// `helm.enabled: false`, every function below falls back to exactly the
// behaviour that shipped before it - which is what the ablation runs in the
// design log measure.
//
// Four questions the helm now asks, in Chris's order:
//   (a) which of MY faces am I showing to the fire?      helm.arcDefence
//   (b) which of HIS faces am I shooting at?             helm.arcAttack
//   (c) can I step out of that battery's arc?            helm.arcEvasion
//   (d) is my fleet with me?                             helm.cohesion
//
// The costs are deliberately bounded: one six-slot threat histogram per
// move(), the six-way scan of headings that was already there, and a one-step
// lookahead over at most six hexes. No path search, and no per-enemy inner
// loop inside a candidate loop except against the single heaviest threat.
const cfgHelm = (tuning) => tuning.helm ?? {};
const helmOn = (tuning) => !!tuning.helm && tuning.helm.enabled !== false;
const turnCostBetween = (a, b) => Math.min((b - a + 6) % 6, (a - b + 6) % 6);

// Where is the fire coming from, and how much of it? A six-slot histogram over
// hex directions, weighted by the weight of fire each enemy can actually throw
// through the face it is presenting to us, and gated on that enemy being able
// to reach us at all. Normalised to a share, so the defensive term below means
// the same thing whether the shooter is a frigate or a battleship. `top` is
// the single heaviest contributor, which is all arc evasion needs.
function threatProfile(ship, enemies, tuning, battle = null) {
  const t = [0, 0, 0, 0, 0, 0];
  let total = 0, top = null, topW = 0;
  for (const e of enemies) {
    if (e.destroyed || (!finiteSensing(battle) && e.cloaked && !e.detected)) continue;
    const d = distance(ship.pos, e.pos);
    if (d === 0 || d > maxReach(e, tuning)) continue;
    const w = standingWeight(e, shieldFacing(e, ship.pos), tuning);
    if (w <= 0) continue;
    t[bearing(ship.pos, e.pos)] += w;
    total += w;
    if (w > topW || (w === topW && top && targetTie(ship, e, top) < 0)) { topW = w; top = e; }
  }
  if (total > 0) for (let i = 0; i < 6; i++) t[i] /= total;
  return { t, total, top, topW };
}

// How inviting is `target` seen from the hex direction `dir` (measured FROM
// the target)? A downed face is the prize, a damaged one is half of it, and
// the flank and rear quarters are worth something even with their shields
// whole, because the damage tables behind them are: face 5 eats engineering
// and the current turn's power pool, faces 4 and 6 the flank table.
function faceValueFrom(target, dir, AA) {
  const face = faceFor(target.facing, dir);
  let v = 1 - faceHealth(target, face);
  if (face === 5) v += AA.rearBonus ?? 0.5;
  else if (face === 4 || face === 6) v += AA.flankBonus ?? 0.25;
  return v;
}

// The direction, measured from the target, this ship would rather attack from.
// Ties - and near-ties - go to where the ship already is: a helm works AROUND
// an enemy for a real gain, it does not circumnavigate one for a rounding
// error. Deterministic: fixed scan order, fixed tie-break, no rng.
function preferredApproachDir(target, fromDir, AA, taken) {
  // CONVERGING ATTACK. The single hardest fact the instrumentation turned up:
  // you cannot flank a ship that turns to face you. Both helms re-aim every
  // round they move, and at equal turn rates one attacker walking round an
  // enemy simply tows that enemy's nose with it - measured, an orbit rule on
  // its own moved the flank/rear share of hits by nothing at all.
  //
  // What DOES work is more than one bearing at once, because a hull has one
  // nose and the enemy fleet has several. `spreadBonus` rewards a direction
  // for being clear of the bearings friends already occupy against this
  // target, so a pair converges from two quarters and whichever of them the
  // enemy noses at, the other one is on a flank. `taken` is the list of
  // directions (measured from the target) that friends are already on; it is
  // built only when the dial is non-zero.
  const spread = (d) => {
    if (!taken || !taken.length) return 0;
    let nearest = 3;
    for (const t of taken) {
      const c = turnCostBetween(d, t);
      if (c < nearest) nearest = c;
    }
    return (AA.spreadBonus ?? 0) * (nearest / 3);
  };
  const value = (d) => faceValueFrom(target, d, AA) + spread(d);
  const here = value(fromDir);
  let bestD = fromDir, bestV = here, bestTurn = 0;
  for (let d = 0; d < 6; d++) {
    const v = value(d);
    const turn = turnCostBetween(fromDir, d);
    if (v > bestV + 1e-9 || (Math.abs(v - bestV) <= 1e-9 &&
        (turn < bestTurn || (turn === bestTurn && directionTie(d, bestD, fromDir) < 0)))) {
      bestV = v; bestD = d; bestTurn = turn;
    }
  }
  return { dir: bestD, gain: bestV - here };
}

// Which bearings, measured from `target`, are friends already attacking it
// from? Only ships close enough to be in the same fight count, and only when
// the converging-attack dial is on - otherwise this is never called.
function occupiedDirs(ship, target, mates, tuning, AA) {
  if (!(AA.spreadBonus > 0)) return null;
  const out = [];
  const radius = (AA.spreadRadiusHexes ?? 12);
  for (const m of mates) {
    if (m === ship) continue;
    if (distance(m.pos, target.pos) > radius) continue;
    out.push(bearing(target.pos, m.pos));
  }
  return out;
}

// Travelling one hexside off the direct bearing walks a ship around its
// target. Which side? Measured on the grid rather than reasoned about: a step
// in direction (direct + 1) DECREASES the bearing index the target sees of us,
// a step in (direct + 5) increases it. This is the cloaked ship's old `swing`,
// generalised and given a direction that means something.
function swingOffset(curDir, wantDir) {
  const up = (wantDir - curDir + 6) % 6;
  if (up === 0) return 0;
  return up <= 3 ? 5 : 1;
}

// The helm asks two questions of a hull over and over - what can it throw
// through each face with its whole battery, and how far can it reach - and
// neither answer changes until a mount is knocked out. Both are cached on the
// ship and dropped by applyDamage() the moment a weapon-mount hit lands, which
// is the only event in the engine that can change either. Without this the
// arc-aware helm cost the trial harness 90% more wall-clock; with it, 12%.
function helmCache(ship, tuning) {
  let c = ship._helm;
  if (c) return c;
  const standing = [0, 0, 0, 0, 0, 0, 0];       // indexed by shield face 1-6
  for (let f = 1; f <= 6; f++) standing[f] = fireWeight(ship, f, tuning, true);
  let best = 0, reach = 0;
  for (let f = 1; f <= 6; f++) if (standing[f] > best) best = standing[f];
  for (const m of ship.mounts) {
    if (m.inop || m.kind === "spinal") continue;
    if (m.maxRange > reach) reach = m.maxRange;
  }
  c = { standing, best, reach };
  ship._helm = c;
  return c;
}
const standingWeight = (ship, face, tuning) => helmCache(ship, tuning).standing[face];

// Which way should a ship point? Turning the nose at the enemy is only correct
// for a nose-armed hull. A ship with quarter or broadside arcs that noses in
// throws away most of its battery, and a hull whose single mount sits on the
// beam - the Vraygon frigate - can then never fire at all: measured, Vraygon
// light hulls were spending 0.03 power a turn on gunnery. Choose the heading
// that brings the most weight of fire to bear, with an intact shield as the
// tie-break. Ships still turn only one step per action, so the choice costs
// tempo exactly as before.
function bestHeading(ship, targetPos, tuning, budgetIn, profIn) {
  if (INS) helmStats.headingCalls++;
  const dir = bearing(ship.pos, targetPos);
  const AD = cfgHelm(tuning).arcDefence ?? {};
  const arc = helmOn(tuning) && AD.enabled !== false;
  const prof = arc && profIn && profIn.total > 0 ? profIn : null;
  // TURN BUDGET. The old chooser picked the globally best heading and let
  // turnTowards walk toward it one hexside at a time, so a capital could spend
  // two rounds pointing at nothing on the way to an optimum the fight had
  // already left. Score only the headings this ship can actually reach with
  // the turns it has left, and it makes the best of what it has instead.
  const budget = arc && AD.turnBudgetAware !== false && budgetIn >= 0 ? budgetIn : 6;
  // The defensive term is scaled against this hull's OWN best weight of fire,
  // so one dial reads the same on a frigate and on a battleship: at weight 1.0
  // a ship will trade its whole battery rather than show a hole to all of the
  // incoming fire; at 0.5 it will trade half of it.
  const defW = prof ? (AD.weight ?? 0.6) * helmCache(ship, tuning).best : 0;

  // Hoisted out of the 6x6 scan below: how much of a hole is each of this
  // ship's own faces? Six lookups instead of thirty-six.
  let harmOf = null;
  if (prof) {
    harmOf = [0, 0, 0, 0, 0, 0, 0];
    for (let face = 1; face <= 6; face++) harmOf[face] = 1 - faceHealth(ship, face);
  }
  let best = ship.facing, bestScore = -Infinity;
  let plain = ship.facing, plainScore = -Infinity;      // instrumentation only
  let free = ship.facing, freeScore = -Infinity;        // instrumentation only
  for (let f = 0; f < 6; f++) {
    const face = faceFor(f, dir);
    let score = fireWeight(ship, face, tuning);
    if (!ship.shieldDown[face]) score += 0.5;   // meet him with a live shield
    if (face === 2) score += 0.25;              // and keep the nose round on a tie
    if (score > freeScore || (score === freeScore && directionTie(f, free, ship.facing) < 0)) { freeScore = score; free = f; }
    if (turnCostBetween(ship.facing, f) > budget) continue;
    if (score > plainScore || (score === plainScore && directionTie(f, plain, ship.facing) < 0)) { plainScore = score; plain = f; }
    if (prof) {
      // Presenting a hole to the fire costs the share of the fire that would
      // arrive through it. Down counts whole, damaged counts half.
      let harm = 0;
      for (let d = 0; d < 6; d++) if (prof.t[d] > 0) harm += prof.t[d] * harmOf[faceFor(f, d)];
      if (harm > 0) score -= defW * harm;
    }
    if (score > bestScore || (score === bestScore && directionTie(f, best, ship.facing) < 0)) { bestScore = score; best = f; }
  }
  if (INS) {
    if (best !== plain) helmStats.headingArc++;
    if (plain !== free) helmStats.headingBudget++;
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
  const c = helmCache(ship, tuning);
  if (c.best <= 0) return true;
  return c.standing[5] >= need * c.best;
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
  if (ship._helm) return ship._helm.reach;
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
function terrainSet(tuning) {
  const list = tuning.battle?.terrain;
  if (!list || !list.length) return null;
  if (tuning.battle._terrainSet && tuning.battle._terrainSet.src === list) return tuning.battle._terrainSet.set;
  const set = new Set();      // impassable: moon, planet (7 hexes), large asteroid
  const field = new Set();    // asteroid field: passable at a cost, blocks fire in, out and through
  const neb = new Set();      // nebula: passable, fire NOT blocked, but Mutara rules apply
  const key = (p) => p.q + "," + p.r;
  for (const t of list) {
    const c = { q: t.q, r: t.r };
    if (t.type === "asteroids") { field.add(key(c)); continue; }
    if (t.type === "nebula") { neb.add(key(c)); continue; }
    for (const hex of terrainFootprint(t)) set.add(key(hex));
  }
  set.field = field;
  set.neb = neb;
  tuning.battle._terrainSet = { src: list, set };
  return set;
}
// NEBULA (ruling 2026-09-02, Chris: "let's follow the example" - the Battle
// of the Mutara Nebula). A nebula hex is passable and does not block fire;
// instead it degrades: a ship inside one can only be engaged, and can only
// engage, within visibilityHexes; every shot with a ship in the fog at
// either end suffers toHitPenalty; and shields are USELESS inside - every
// hit on a ship in a nebula bypasses its shields. "We can't follow them into
// the nebula, Sir. Our shields would be useless." (Joachim, to Khan.)
function inNebula(pos, tuning) {
  const set = terrainSet(tuning);
  return !!(set && set.neb.has(pos.q + "," + pos.r));
}
function nebulaRules(tuning) { return tuning.battle?.terrainRules?.nebula ?? {}; }
function shieldsBypassedAt(pos, tuning) {
  return inNebula(pos, tuning) && nebulaRules(tuning).shieldsUseless !== false;
}
function nebulaPenalty(shooter, target, tuning) {
  if (!inNebula(shooter.pos, tuning) && !inNebula(target.pos, tuning)) return 0;
  return nebulaRules(tuning).toHitPenalty ?? 2;
}
// ASTEROID FIELD (rulings 2026-09-02, Chris): one hex, passable but slow -
// entering costs moveCostMultiplier times the ship's normal movement power -
// and it BLOCKS FIRE IN AND OUT: a ship inside a field can neither shoot out
// nor be shot at, and no line of fire may cross one. Deployment and warp
// landings into a field are allowed. The LARGE ASTEROID ("asteroid") is one
// impassable hex that blocks fire, like a small moon.
function stepCost(ship, next, tuning) {
  const set = terrainSet(tuning);
  const rules = tuning.battle?.terrainRules?.asteroids ?? {};
  if (set && set.field.has(next.q + "," + next.r)) return ship.movementPointRatio * (rules.moveCostMultiplier ?? 2);
  return ship.movementPointRatio;
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
  const line = hexLineGroups(shooterPos, targetPos);
  const fieldsBlock = tuning.battle?.terrainRules?.asteroids?.blocksFire !== false;
  // NEBULA PENETRATION (ruling 2026-09-02, Chris): weapons fired from OUTSIDE
  // a nebula penetrate no further than the first fog hex - absorption
  // decoheres beams and missiles lose their sensor locks. So from outside, a
  // target is reachable only if it sits in the first nebula hex the line
  // enters; nothing crosses a nebula and nothing reaches deeper inside.
  // (From inside, the visibility rule in mayEngage governs.)
  const shooterInFog = set.neb.has(shooterPos.q + "," + shooterPos.r);
  for (let i = 0; i < line.length; i++) {
    // RULING 2026-09-05: either touched hex can block an exact grazing edge.
    // Both cells share this sample's depth; neither is artificially "first".
    for (const cell of line[i]) {
      const k = cell.q + "," + cell.r;
      if (i > 0 && i < line.length - 1 && set.has(k)) return false;   // bodies block fire through
      if (fieldsBlock && set.field.has(k)) return false;                // fields block in, out and through
      if (!shooterInFog && i > 0 && set.neb.has(k) && i < line.length - 1) return false; // fog: first hex only
    }
  }
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
  // is the other half of the photonic cannon's bargain: kill a gunstar
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
    applyDamage(other, face, dmg, tuning, rng, log, undefined, shieldsBypassedAt(other.pos, tuning));
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
function doctrineReserve(ship, enemies, tuning, battle = null) {
  const doc = tuning.doctrine[ship.faction] ?? {};
  const base = doc.reserveFraction ?? 0.35;
  const D = tuning.doctrine.dynamic;
  if (!D || !D.enabled) return Math.round(ship.power * base);

  const foes = targetable(enemies, battle, ship.side);
  if (!foes.length) return 0;
  const n = nearest(ship.pos, foes, ship.facing);

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
  // V1 and uniformly upgraded grids retain their exact arithmetic. For an
  // asymmetric grid use its mean rated-face budget as the standing allowance,
  // not a single arbitrary face. Real absorption still uses the struck face.
  const capacities = ship.shieldGenerators ? [1,2,3,4,5,6].map(face=>({cap:shieldCapacity(ship,face),cost:shieldCost(ship,face)})) : null;
  const uniform = capacities?.every(f=>f.cap===capacities[0].cap&&f.cost===capacities[0].cost);
  const physical = (capacities ? uniform ? capacities[0].cap*capacities[0].cost : capacities.reduce((n,f)=>n+f.cap*f.cost,0)/6 : ship.shieldPointRatio * ship.hull.maxShieldPower) *
    tuning.battle.roundsPerTurn * (D.absorbFacings ?? 2);
  const capacity = capacities?.reduce((n,f)=>n+f.cap,0) ?? 0;
  const memoryRatio = capacities ? uniform ? capacities[0].cost : (capacity ? capacities.reduce((n,f)=>n+f.cap*f.cost,0)/capacity : 0) : ship.shieldPointRatio;
  const memory = (ship.damageLastTurn ?? 0) * memoryRatio * (D.threatMemory ?? 0);
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

// Additive recording fields, captured at resolution time rather than inferred
// from the end-of-round frame. targetId remains the intended target; screening
// may redirect the hit to victimId. Missile shooterPos is launch attribution;
// approachPos / flight record the projectile's own incoming geometry separately.
function shotGeometry(shooterPos, target, shooterFacing) {
  return { shooterPos: shooterPos ? { ...shooterPos } : undefined, shooterFacing,
    targetPos: target?.pos ? { ...target.pos } : undefined, targetFacing: target?.facing };
}
function resolveHit(shooterPos, target, damage, defenders, tuning, rng, stats, log, spread, bypassShield, missile = null) {
  if (target.destroyed) return;
  const victim = screenFor(target, defenders, tuning, rng) ?? target;
  if (victim.destroyed) return;
  if (victim !== target) stats.screened++;
  const face = missile ? missileImpactFace(missile,victim) : shieldFacing(victim, shooterPos);
  const impact = { victimId: victim.id, victimPos: { ...victim.pos }, victimFacing: victim.facing, face };
  stats.damage += damage;
  // Maneuver index bookkeeping: which side of the victim did this hit land on?
  // Faces 1-3 are forward (front-left, forward, front-right); 4-6 are the
  // flank/rear (rear-right, rear, rear-left). Pure counting - no rng, no effect
  // on the outcome below.
  if (face >= 4) stats.hitsRear++; else stats.hitsForward++;
  // The blow lands whole against the shield; only what penetrates is spread
  // across the hull for damage-location purposes. `bypassShield` is passed
  // only by the photonic cannon and is undefined - falsy - for everything else.
  const fog = shieldsBypassedAt(victim.pos, tuning);
  stats.internal += applyDamage(victim, face, damage, tuning, rng, log, spread, bypassShield || fog).internal;
  return impact;
}

// ------------------------------------------------------- spinal weapons
// The photonic cannon (Earth Gunstar Battlecruiser). A capacitor bank on the keel that
// drinks the ship's power pool for several turns and then empties itself into
// one bolt.
//
// The draw comes OFF THE TOP of the pool, before the doctrine reserve is set -
// the same hook the cloak uses. That is the whole of the design. Under the
// residual-shield model the pool IS the shield generator, so a gunstar
// building a charge cannot pay for absorption it has already spent: it is
// visibly soft for the three or four turns it spends aiming, and it gets that
// power back only by firing. Nothing else in the engine had to change to make
// the trade real; the power model already prices it.
//
// Every branch here is reached only through ship.spinal, which buildShip sets
// on hulls that declare a spinal weapon and on no others.
function chargeSpinal(ship, enemies, tuning, log, battle = null, order = null) {
  const st = ship.spinal;
  if (!st) return;
  const w = weaponFor(ship, st.type, tuning);
  // A ship captain may break off rather than be killed sitting still. Opt-in: only a ship carrying a
  // captain record is reviewed, so every recorded battle without one resolves exactly as before.
  // Note the deliberate side effect - a captain who takes the cannon in hand keeps it, because
  // advanceManualSpinal latches manual control. Once an officer has intervened, the bank is his.
  let intent = order?.spinal;
  if (ship.captain && intent !== 'vent') {
    const breakOff = ventsUnderFire(ship, tuning);
    // A direct order is obeyed, and the objection goes on the record anyway. The player is never
    // trapped by their own crew, and the crew are never silently overruled.
    if (breakOff && order?.insist) {
      if (log) log(`${ship.id} captain: ${breakOff.protest}`);
      recordCaptain(battle, ship, 'holds-charge-under-protest', breakOff.protest, { insisted: true });
    } else if (breakOff) {
      intent = 'vent'; if (log) log(`${ship.id} captain: ${breakOff.reason}`);
      recordCaptain(battle, ship, breakOff.rule, breakOff.reason, { insisted: false });
    }
  }
  if(order || st.manualControl || intent === 'vent'){
    const note=advanceManualSpinal(ship,w,intent);
    if(log)log(`${ship.id} ${note}`);
    return;
  }
  // RULING (2026-09-01): the bank is not lit until an enemy is inside
  // chargeStartRangeHexes. Without this gate an immobile-while-charging hull
  // would plant itself at its deployment hex on turn one, a full map from the
  // fight. A bank that is already partly charged keeps charging regardless.
  const startRange = w.chargeStartRangeHexes ?? Infinity;
  if (st.state === "charging" && st.charge <= 0 && Number.isFinite(startRange)) {
    const candidates = finiteSensing(battle) ? targetable(enemies, battle, ship.side) : living(enemies);
    const near = candidates.some((e) => distance(ship.pos, e.pos) <= startRange);
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

// One bolt. A legal explicit target order overrides capital-target doctrine;
// without one, prefer the heaviest hull rather than spending the bank on a picket.
function fireSpinal(ship, enemies, friends, tuning, rng, stats, log, onShot, forecast = null, battle = null) {
  const st = ship.spinal;
  if (!st || st.state !== "ready") return 0;
  const mount = ship.mounts.find((m) => m.kind === "spinal");
  if (!mount || mount.inop || mount.firedThisTurn) return 0;
  const w = weaponFor(ship, st.type, tuning);
  if (spendable(ship) < (w.firePower ?? 0)) return 0;

  const arc = targetable(enemies, battle, ship.side).filter(
    (f) => !f.destroyed && mayEngage(ship, f, tuning) && distance(ship.pos, f.pos) <= mount.maxRange && bears(ship, mount, f.pos) && lineOfFire(ship.pos, f.pos, tuning)
  );
  if (!arc.length) return 0;

  const capital = (f) => f.points >= (w.capitalPoints ?? 8);
  const ordered = ship.orderTarget ? arc.find(f => f.id === ship.orderTarget) : null;
  const target = ordered || [...arc].sort((a, b) =>
    (b.points - a.points) || (distance(ship.pos, a.pos) - distance(ship.pos, b.pos)) ||
    targetTie(ship, a, b))[0];

  // Fire discipline. If only light hulls are in the arc the gunnery officer
  // waits for something worth the bank - but not indefinitely. Chris's explicit
  // target ruling overrides that preference, not readiness or firing legality.
  if (!ordered && !capital(target) && st.readyTurns < (w.holdForCapitalTurns ?? 0)) {
    if (log && !st.holdLogged) {
      st.holdLogged = true;
      log(`${ship.id} holds the photonic charge - no capital in the arc`);
    }
    return 0;
  }

  const range = distance(ship.pos, target.pos);
  const band = bandFor(mount, range);
  if (!band) return 0;

  onShot?.before?.();
  ship.power -= (w.firePower ?? 0);
  mount.firedThisTurn = true;
  stats.shots++;

  // Planning uses the real targeting/allocation path, but never rolls a die
  // or damages a contact. All objects passed by previewOrders are private copies.
  if (forecast) {
    forecast.push({ mountId: mount.id, targetId: target.id, range, power: w.firePower ?? 0, kind: "spinal" });
    dischargeSpinal(st, w);
    return 1;
  }

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
  const aim = roll - nebulaPenalty(ship, target, tuning) + (band.toHitMod ?? 0) + (w.toHitBonus ?? 0)
    + commandBonus(ship, friends, 'commandToHit') + tuning.toHit.crewRatingDefault
    - evasion - hullProfileMod(target, tuning) - (ship.toHitPenalty ?? 0) + size;
  const hit = aim >= tuning.toHit.target;
  const geometry = shotGeometry(ship.pos, target, ship.facing);
  let impact;

  if (log) log(`${ship.id} FIRES ${st.type} at ${target.id} across ${range} hexes - ${hit ? "HIT" : "miss"}`);
  if (hit) {
    stats.hits++;
    // The whole bank into one facing. A deflector screen is rated for weapons
    // fire, not for this - if bypassShield is set the bolt goes straight to the
    // hull, which is the only reason the weapon is worth its charge against
    // heavy armour: raw damage means little to a 198-point Vraygon monitor, but
    // the facing cap that would have eaten a third of it means a great deal.
    // The bolt then cascades - one damage-location roll per spreadPer points.
    impact = resolveHit(ship.pos, target, (w.damage ?? 0) + (band.damageBonus ?? 0),
      enemies, tuning, rng, stats, log, w.spreadPer ?? 0, !!w.bypassShield);
    reconcileContacts(battle);
  }
  if (onShot) onShot({ kind: "spinal", weapon: st.type, shooterId: ship.id, targetId: target.id, hit, range,
    damage: hit ? (w.damage ?? 0) + (band.damageBonus ?? 0) : 0, ...geometry, ...impact });

  dischargeSpinal(st, w);
  if (log) log(`${ship.id} ${st.type} discharged - dark for ${st.cooldown} turn(s)`);
  return 1;
}

function dischargeSpinal(st, weapon) {
  st.charge = 0;
  st.shots++;
  st.state = "cooldown";
  st.cooldown = weapon.cooldownTurns ?? 3;
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
function cycleDeck(carrier, foe, tuning, log, battle = null) {
  const SC = tuning.strikeCraft;
  const foes = targetable(foe, battle, carrier.side);
  const range = foes.length ? nearest(carrier.pos, foes, carrier.facing).range : Infinity;
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
function setStances(side, foe, tuning, battle = null) {
  const SC = tuning.strikeCraft;
  // Contact eligibility is shared, but this scripted control still inspects
  // the engineering of known hulls. It is not an observation-only captain.
  if (finiteSensing(battle)) foe = targetable(foe, battle, side[0]?.side);
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
function runRaid(raid, tuning, rng, stats, log, onShot, battle = null) {
  const SC = tuning.strikeCraft;
  const { carrier, sq, foe } = raid;
  if (carrier.destroyed || sq.strength <= 0 || !sq.launched) return;
  const cfg = craftCfg(tuning, sq.type);

  const cands = targetable(foe, battle, carrier.side).filter((f) =>
    distance(carrier.pos, f.pos) <= SC.strikeRadiusHexes &&
    f.points >= (cfg.targetMinPoints ?? 0) &&
    f.points <= (cfg.targetMaxPoints ?? Infinity));
  if (!cands.length) return;
  // Bombers go for the biggest thing they can reach; interceptors take the
  // nearest light hull, which is what a sweep actually does.
  const target = cands.sort((a, b) => cfg.preferLargest
    ? (b.points - a.points) || (distance(carrier.pos, a.pos) - distance(carrier.pos, b.pos)) || targetTie(carrier, a, b)
    : (distance(carrier.pos, a.pos) - distance(carrier.pos, b.pos)) || (b.points - a.points) || targetTie(carrier, a, b))[0];

  onShot?.before?.();

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
      shooterId: carrier.id, targetId: target.id, strength: 0, hits: 0, damage: 0,
      ...shotGeometry(carrier.pos, target, carrier.facing) });
    return;
  }

  // --- the attack run ---
  // Each craft is a separate small hit, which is the point of strike craft under
  // this damage model: absorption is capped per facing per round AND paid for
  // out of the pool, so a wave first drains a capital's power and then starts
  // rolling damage locations on it.
  const face = shieldFacing(target, carrier.pos);
  const geometry = shotGeometry(carrier.pos, target, carrier.facing);
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
    stats.internal += applyDamage(target, face, cfg.damage, tuning, rng, log, undefined, shieldsBypassedAt(target.pos, tuning)).internal;
    reconcileContacts(battle);
    dealt += cfg.damage;
  }
  if (onShot) onShot({ kind: "strike", craft: sq.type, squadronId: sq.id,
    shooterId: carrier.id, targetId: target.id, strength, hits, damage: dealt, ...geometry,
    ...(dealt > 0 ? { victimId: target.id, victimPos: { ...geometry.targetPos }, victimFacing: geometry.targetFacing, face } : {}) });
}

// The whole strike phase, run once a turn. Returns immediately - and without
// touching the rng - if neither fleet has a carrier in it.
function strikePhase(A, B, tuning, rng, stats, log, onShot, prioritySide, battle = null) {
  const SC = tuning.strikeCraft;
  if (!SC || !SC.enabled) return;
  const hasA = fleetHasSquadrons(A), hasB = fleetHasSquadrons(B);
  if (!hasA && !hasB) return;

  for (const [side, foe] of [[A, B], [B, A]]) {
    for (const s of living(side)) if (s.squadrons) cycleDeck(s, foe, tuning, log, battle);
  }
  setStances(A, B, tuning, battle);
  setStances(B, A, tuning, battle);

  const raids = [];
  for (const [side, foe, st, opp] of [[A, B, stats.A, stats.B], [B, A, stats.B, stats.A]]) {
    for (const { carrier, sq } of airborne(side, (sq) => sq.stance === "offence")) {
      raids.push({ carrier, sq, foe, st, oppStats: opp, roll: rng.int(100) });
    }
  }
  raids.sort((x, y) => (y.roll - x.roll) ||
    (x.carrier.side === y.carrier.side ? 0 : (x.carrier.side === prioritySide ? -1 : 1)) ||
    canonicalShipCompare(x.carrier, y.carrier) || String(x.sq.id).localeCompare(String(y.sq.id), undefined, { numeric: true }));
  for (const raid of raids) runRaid(raid, tuning, rng, raid.st, log, onShot, battle);
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
// TARGET PROFILE (ruling 2026-09-08): a small hull is a poor mark for any gun,
// not merely for a keel gun. The spinal path has always graded its aim by the
// size of what it is shooting at - "a cruiser is a poor mark and a picket is a
// joke" - while every turreted beam treated a stationary picket and a stationary
// battleship as equally easy. Evasion depended only on hexes moved, and
// classInteraction has a single threshold at 16 points, so between a frigate and
// a destroyer nothing distinguished them at all.
//
// Units are d10 pips, subtracted from the attacker's roll: 1 = -10% to hit.
// Off by default until adopted, because it changes every battle outcome.
// Measured motive and costs: docs/frigate-role-2026-09-08.md.
function hullProfileMod(target, tuning) {
  const cfg = tuning.toHit.hullProfile;
  if (!cfg || !cfg.enabled) return 0;
  return cfg.byClass?.[target.className] ?? 0;
}

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

function fire(ship, enemies, friends, tuning, rng, inFlight, stats, log, onShot, forecast = null, clock = null, battle = null) {
  const cmd = commandBonus(ship, friends, 'commandToHit');
  const AAF = cfgHelm(tuning).arcAttack ?? {};
  const AIMWEAK = helmOn(tuning) && AAF.enabled !== false && AAF.aimAtWeakFace === true;
  const AIMSLACK = AAF.aimSlackHexes ?? 2;
  // The keel gun resolves before the secondaries and out of its own capacitor.
  // `fired` is 0 for every hull without ship.spinal, so the two early returns
  // below behave exactly as they always did.
  let fired = ship.spinal ? fireSpinal(ship, enemies, friends, tuning, rng, stats, log, onShot, forecast, battle) : 0;
  reconcileContacts(battle);
  let budget = spendable(ship);
  if (budget <= 0) return fired;
  const foes = targetable(enemies, battle, ship.side);
  if (!foes.length) return fired;

  for (const mount of ship.mounts) {
    if (mount.inop || mount.firedThisTurn || budget <= 0) continue;
    if (mount.kind === "spinal") continue;   // handled above, never by this loop
    const weapon = weaponFor(ship, mount.type, tuning);
    // A previous mount can disable/destroy a spotting observer. Re-evaluate
    // the next mount rather than retaining a stale action-wide contact list.
    const currentFoes = finiteSensing(battle) ? targetable(enemies, battle, ship.side) : foes;
    const candidates = currentFoes.filter(
      (f) => !f.destroyed && mayEngage(ship, f, tuning) && distance(ship.pos, f.pos) <= mount.maxRange && bears(ship, mount, f.pos) && lineOfFire(ship.pos, f.pos, tuning)
    );
    if (!candidates.length) continue;
    // (b) ATTACK THE WEAK ARC, at the trigger. Among the enemies this mount
    // already bears on, prefer the one showing a hole or a bare quarter over
    // the one that merely happens to be nearest - but only within
    // `targetSlackHexes` of the nearest, so a fleet still concentrates its
    // fire instead of scattering it across the field. This is the only place
    // the helm block reaches into gunnery, and it is here because steering is
    // not enough on its own: you cannot flank a hull that turns to face you,
    // but in a fleet action there is almost always somebody ELSE whose flank
    // is already turned your way.
    let target = null;
    if (AIMWEAK) {
      let nearD = Infinity;
      for (const c of candidates) { const d = distance(ship.pos, c.pos); if (d < nearD) nearD = d; }
      let bestV = -Infinity, bestD = Infinity;
      for (const c of candidates) {
        const d = distance(ship.pos, c.pos);
        if (d > nearD + AIMSLACK) continue;
        const v = faceValueFrom(c, bearing(c.pos, ship.pos), AAF);
        if (v > bestV + 1e-9 || (Math.abs(v - bestV) <= 1e-9 &&
            (d < bestD || (d === bestD && target && targetTie(ship, c, target) < 0)))) {
          bestV = v; bestD = d; target = c;
        }
      }
      if (!forecast && INS && target && distance(ship.pos, target.pos) > nearD) helmStats.aimSwitch++;
    }
    // A human order names a target: if this mount bears on it, it is the one.
    if (ship.orderTarget) { const forced = candidates.find((c) => c.id === ship.orderTarget); if (forced) target = forced; }
    if (!target) target = candidates.sort((a, b) =>
      (distance(ship.pos, a.pos) - distance(ship.pos, b.pos)) || targetTie(ship, a, b))[0];
    const range = distance(ship.pos, target.pos);
    const band = bandFor(mount, range);
    if (!band) continue;

    if (weapon.kind === "beam") {
      const power = Math.min(weapon.maxPower, budget);
      if (power < 1) continue;
      onShot?.before?.();
      budget -= power; ship.power -= power;
      mount.firedThisTurn = true;
      fired++;
      stats.shots++;
      if (forecast) {
        forecast.push({ mountId: mount.id, targetId: target.id, range, power, kind: "beam" });
        continue;
      }
      const evasion = Math.floor(target.movedThisTurn / tuning.toHit.evasionPerHexesMoved);
      const roll = rng.int(tuning.toHit.die) + 1;
      const hit = roll - nebulaPenalty(ship, target, tuning) + (band.toHitMod ?? 0) + cmd + classInteractionMod(ship, target, tuning, rng) + tuning.toHit.crewRatingDefault - evasion - hullProfileMod(target, tuning) - (ship.toHitPenalty ?? 0) >= tuning.toHit.target;
      const geometry = shotGeometry(ship.pos, target, ship.facing);
      let impact;
      if (hit) {
        stats.hits++;
        // FASA pattern: beam damage is the power put into it plus a range bonus.
        impact = resolveHit(ship.pos, target, power + (band.damageBonus ?? 0), enemies, tuning, rng, stats, log);
        reconcileContacts(battle);
      }
      if (onShot) onShot({ kind: "beam", weapon: mount.type, shooterId: ship.id, targetId: target.id, hit, range, damage: hit ? power + (band.damageBonus ?? 0) : 0, ...geometry, ...impact });
    } else {
      if (ship.magazine <= 0 || budget < weapon.powerToArm) continue;
      onShot?.before?.();
      budget -= weapon.powerToArm; ship.power -= weapon.powerToArm;
      ship.magazine--;
      mount.firedThisTurn = true;
      fired++;
      stats.launches++;
      if (forecast) forecast.push({ mountId: mount.id, targetId: target.id, range, power: weapon.powerToArm, kind: "launch" });
      const missileId=clock?`missile:${clock.turn}:${inFlight.length+1}`:null;
      inFlight.push({
        ...(clock?{missileId,flight:createMissileFlight(ship.pos,target.pos,ship.facing,clock.turn,clock.round)}:{}),
        shooterPos: { ...ship.pos }, shooterFacing: ship.facing, shooterId: ship.id, side: ship.side, targetId: target.id,
        weapon: mount.type,
        shooterPoints: ship.points,
        damage: Math.max(0, weapon.damage + (band.damageMod ?? 0)),
        spread: weapon.spreadPer ?? 0
      });
      if (onShot) onShot({ kind: "launch", ...(missileId?{missileId}:{}), weapon: mount.type, shooterId: ship.id, targetId: target.id, range, damage: Math.max(0, weapon.damage + (band.damageMod ?? 0)), ...shotGeometry(ship.pos, target, ship.facing) });
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
// Is this hull planted where it stands? A charging or fully-banked spinal gun
// pins its ship (ruling 2026-09-01). Such a hull is not a laggard - the fleet
// must not wait for a ship that has chosen to stop - so the cohesion rule asks
// this before counting anyone late.
function plantedByCharge(ship, tuning) {
  if (!ship.spinal) return false;
  if (!weaponFor(ship, ship.spinal.type, tuning)?.immobileWhileCharging) return false;
  const st = ship.spinal;
  return (st.state === "charging" && st.charge > 0) || st.state === "ready";
}

// Which enemy should the helm STEER for? Not necessarily the one the guns will
// shoot at - fire() still takes the nearest thing its mounts bear on. This is
// the question of where to put the ship, and among enemies at much the same
// range the answer is: the one with a hole in it, or the one whose bare
// quarters are already turned our way. `targetSlackHexes` is how much further
// than the nearest enemy the helm will look; 0 restores "always the nearest".
function steerTarget(ship, foes, near, tuning, AA) {
  const slack = AA.targetSlackHexes ?? 0;
  if (slack <= 0 || !near.ship || foes.length < 2) return near.ship;
  let best = near.ship;
  let bestV = faceValueFrom(near.ship, bearing(near.ship.pos, ship.pos), AA);
  let bestD = near.range;
  for (const e of foes) {
    if (e === near.ship) continue;
    const d = distance(ship.pos, e.pos);
    if (d > near.range + slack) continue;
    const v = faceValueFrom(e, bearing(e.pos, ship.pos), AA);
    if (v > bestV + 1e-9 || (Math.abs(v - bestV) <= 1e-9 &&
        (d < bestD || (d === bestD && targetTie(ship, e, best) < 0)))) {
      best = e; bestV = v; bestD = d;
    }
  }
  return best;
}

// ARC EVASION (Chris's (c)). A light hull nose to nose with a heavy battery
// should slip out of the arc rather than trade. "Light" and "heavy" are not
// read off the points ladder - that mistake has been made once already
// (SS28a) - but off the guns themselves: the test is whether the weight of
// fire the enemy is throwing through the face he presents to us is `threatRatio`
// times the weight we can throw back through ours. Returns the facing to
// travel on, or null when no step both leaves the arc and keeps our own shot.
function evadeStep(ship, foe, target, turnsLeft, tuning, AE, want) {
  const cur = standingWeight(foe, shieldFacing(foe, ship.pos), tuning);
  if (cur <= 0) return null;
  const mine = standingWeight(ship, shieldFacing(ship, foe.pos), tuning);
  if (cur < (AE.threatRatio ?? 1.6) * mine) return null;
  const reduceTo = AE.reduceTo ?? 0.5;
  const reach = maxReach(ship, tuning);
  let best = null, bestW = cur * reduceTo;
  for (let f = 0; f < 6; f++) {
    if (turnCostBetween(ship.facing, f) > turnsLeft) continue;
    const next = add(ship.pos, f);
    if (!inBounds(next, tuning) || blockedHex(next, tuning)) continue;
    const dt = distance(next, target.pos);
    // Never step out of the arc by stepping out of the fight: the shot has to
    // survive the move. Same-hex silences both ships, so that hex is no refuge.
    if (dt === 0 || dt > reach) continue;
    if (standingWeight(ship, faceFor(f, bearing(next, target.pos)), tuning) <= 0) continue;
    if (want > 0 && dt > want + (AE.rangeSlack ?? 2)) continue;
    const df = distance(foe.pos, next);
    const w = df > maxReach(foe, tuning) ? 0
      : standingWeight(foe, faceFor(foe.facing, bearing(foe.pos, next)), tuning);
    if (w < bestW || (w === bestW && best !== null && directionTie(f, best, ship.facing) < 0)) {
      bestW = w; best = f;
    }
  }
  return best;
}

function move(ship, enemies, friends, tuning, log = null, battle = null) {
  // The AI may transit occupied hexes too. Journal movement only, then trim
  // an illegal final suffix before returning control to initiative/gunnery.
  // This covers formation, ordinary travel, orbit, evasion and free bursts;
  // Charge burst stress only after endpoint trimming: zero retained free steps
  // consume no stress, accuracy penalty or per-turn burst allowance.
  const steps = [];
  let helmRefusal = null;
  const step = (next, cost, free = false, counter = null) => {
    // All helm branches must afford the actual destination's terrain cost,
    // not just the ordinary hex cost used by their coarse movement gates.
    // Emergency bursts deliberately waive power, never terrain legality.
    if (!free && spendable(ship) < cost) return false;
    // AND THE CAPTAIN. Every helm branch - formation, travel, orbit, evasion, free burst -
    // commits through this one closure, so he is consulted here and nowhere else. Reported by
    // Astra 2026-09-09: he was being asked only about ORDERED moves, which left Chris's ruling
    // that both sides use one captain layer unsatisfied for every unordered ship, including the
    // whole AI side. A refusal reads as a step the helm cannot take, which the branches already
    // handle, so the substitute action comes free here exactly as it does for an ordered move.
    if (ship.captain && !ship.insistThisTurn) {
      const refusal = refusesStep(ship, ship.pos, next, living(enemies), tuning);
      if (refusal) { helmRefusal = helmRefusal ?? refusal; return false; }
    }
    steps.push({ pos: ship.pos, power: ship.power, lastStepCost: ship.lastStepCost,
      movedThisTurn: ship.movedThisTurn, counter, free,
      ...(finiteSensing(battle) ? { contactLocks: structuredClone(battle.contacts.locks) } : {}) });
    ship.pos = next;
    if (!free) ship.power -= cost;
    ship.lastStepCost = cost;
    ship.movedThisTurn++;
    reconcileContacts(battle);
    if (INS && counter) helmStats[counter]++;
    return true;
  };
  moveHelm(ship, enemies, friends, tuning, step, battle);
  // Once per ROUND, however many branches he turned down in it - the same cadence an ordered move
  // reports at, since that is called once per action. Only ever for a ship that has an officer, so
  // a battle without captains produces not one extra line.
  if (helmRefusal) {
    if (log) log(`${ship.id} captain: ${helmRefusal.reason}`);
    recordCaptain(battle, ship, helmRefusal.rule, helmRefusal.reason, { insisted: false, unordered: true });
  }
  let trimmed = false;
  while (!ship.destroyed && steps.length && enemyAt(ship.pos, enemies, tuning)) {
    const { counter, free, contactLocks, ...before } = steps.pop();
    Object.assign(ship, before);
    // Discard contact transitions on a speculative, ultimately trimmed suffix.
    if (contactLocks) Object.assign(battle.contacts.locks, contactLocks);
    if (INS && counter) helmStats[counter]--;
    trimmed = true;
  }
  if (trimmed && log) log(`${ship.id} helm clamped: will not end its move in an enemy's hex`);
  payBurst(ship, steps.filter(s=>s.free).length, tuning);
  reconcileContacts(battle);
}

function moveHelm(ship, enemies, friends, tuning, step, battle = null) {
  const foes = finiteSensing(battle) ? targetable(enemies, battle, ship.side) : living(enemies);
  if (!foes.length) {
    if (!finiteSensing(battle) || plantedByCharge(ship, tuning)) return;
    // A bounded public search course, not steering toward a concealed hull.
    // Close one affordable hex toward the map centre on a movement action;
    // once there, hold. This is a control doctrine, not balance tuning.
    const centre = { q: 0, r: 0 };
    if (distance(ship.pos, centre) === 0) return;
    const goal = bearing(ship.pos, centre);
    const rate = ship.turnRate ?? tuning.movement?.turnRatePerRound?.[ship.className] ?? 2;
    for (let i = 0; i < rate && ship.facing !== goal; i++) ship.facing = turnToward(ship.facing, goal);
    const next = add(ship.pos, ship.facing);
    if (inBounds(next, tuning)) step(next, stepCost(ship, next, tuning));
    return;
  }
  const H = cfgHelm(tuning);
  const ARC = helmOn(tuning);
  const AA = H.arcAttack ?? {};
  const near = nearest(ship.pos, foes, ship.facing);
  // (b) ATTACK THE WEAK ARC, part one: which enemy to steer for.
  const target = ARC && AA.enabled !== false ? steerTarget(ship, foes, near, tuning, AA) : near.ship;
  // The threat histogram is built at most once per move() and shared by every
  // heading decision below it.
  let _prof = null;
  function threat() {
    if (_prof === null) _prof = threatProfile(ship, foes, tuning, battle);
    return _prof;
  }

  // FLIGHT RULES: a ship moves only straight along its facing and may turn at
  // most turnRate hexsides per round. Turning costs no power - it costs tempo.
  // This is what makes ships FLY (banked arcs, wallowing capitals) instead of
  // sliding like hockey pucks. The warp jump is exempt: it is not flight.
  const M = tuning.movement ?? {};
  const coupled = M.coupledToFacing !== false;
  let turnsLeft = coupled ? (ship.turnRate ?? (M.turnRatePerRound ?? {})[ship.className] ?? 2) : 6;

  const turnTowards = (desired) => {
    while (turnsLeft > 0 && ship.facing !== desired) {
      ship.facing = turnToward(ship.facing, desired);
      turnsLeft--;
    }
  };
  // (a) DEFEND THE WEAK ARC: every heading decision in this function goes
  // through here, so it sees both the turns still in hand and the direction
  // the fire is coming from.
  function heading(goalPos) {
    if (!ARC) return bestHeading(ship, goalPos, tuning, -1, null);
    return bestHeading(ship, goalPos, tuning, turnsLeft, threat());
  }

  // RULING (2026-09-01): a spinal gun that is charging or holding a full bank
  // plants the ship. It may turn to aim at its normal rate and nothing else -
  // the Wave Motion Gun tradition, and a real cost: enemies may work round to
  // the bare quarters, or close inside six hexes where the gun cannot track.
  // Venting (cooldown) is free movement: plant, fire, run, plant. Guarded on
  // ship.spinal, so no other hull is touched.
  if (ship.spinal && (weaponFor(ship, ship.spinal.type, tuning)?.immobileWhileCharging)) {
    const st = ship.spinal;
    const planted = (st.state === "charging" && st.charge > 0) || st.state === "ready";
    if (planted) {
      turnTowards(heading(target.pos));
      return;
    }
  }

  // One forward step along the current facing, if legal and if it moves the
  // ship the way it needs to go ("close" shrinks the gap, "open" grows it).
  const forwardStep = (goalPos, need, free = false) => {
    const next = add(ship.pos, ship.facing);
    if (!inBounds(next, tuning)) return false;
    const dNow = distance(ship.pos, goalPos);
    const dNext = distance(next, goalPos);
    if (need === "close" && dNext >= dNow) return false;
    // Same-hex rule: closing to range zero silences both ships, so the helm
    // stops one hex short. Passing through a hex is still legal.
    if (need === "close" && dNext === 0 && tuning.battle?.sameHexNoFire !== false) return false;
    if (need === "open" && dNext <= dNow) return false;
    const cost = stepCost(ship, next, tuning);
    return step(next, cost, free);
  };

  // FORMATION. Escorts hold station on the capital they screen.
  const F = tuning.formation ?? {};
  const mates = living(friends).filter((f) => f !== ship);
  let anchor = null;
  if (F.enabled && ship.hull.screen > 0) {
    const caps = mates.filter((f) => f.hull.screen === 0 && f.cloaked === ship.cloaked);
    if (caps.length) anchor = nearest(ship.pos, caps, ship.facing).ship;
  }
  if (anchor && distance(ship.pos, anchor.pos) > (F.screenStation ?? 2)) {
    turnTowards(bearing(ship.pos, anchor.pos));
    let b = spendable(ship);
    while (b >= ship.movementPointRatio &&
           distance(ship.pos, anchor.pos) > (F.screenStation ?? 2)) {
      if (!forwardStep(anchor.pos, "close")) break;
      b -= ship.lastStepCost;
    }
    turnTowards(heading(target.pos)); // spare turn = stance
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
  const direct = bearing(ship.pos, target.pos);
  // The leash only binds a ship that HAS a fleet to lag behind. With no
  // living mates fleetGap is Infinity, and the old test read "always too far
  // ahead", which froze every lone ship - a one-ship scenario never moved,
  // and the last survivor of any fleet stopped advancing. (Bug found by
  // Chris's destroyer duel, 2026-09-02.)
  const tooFarAhead = (d) => Number.isFinite(fleetGap) && d < fleetGap - leash;

  // (d) ARRIVE TOGETHER (Chris, 2026-09-03: the echelon scenario is lost 40-0
  // because the frigates close piecemeal and are defeated in detail).
  //
  // The old leash could not answer that. It measures how far a ship is ahead
  // of its own centre of mass ALONG THE BEARING TO ITS OWN TARGET, so a fleet
  // strung out ACROSS the axis of approach - which is exactly what an echelon
  // is - reads as perfectly in formation: measured on the trio, the leash bound
  // once in 180 battles. This rule measures the thing that matters instead:
  // the gap from each hull to the enemy's centre of mass. A ship more than
  // `lagToleranceHexes` closer than the fleet's furthest-back member does not
  // close; it holds, turns to its firing stance, and lets the fleet catch up.
  //
  // Three guards keep it from becoming a paralysis. It lapses the moment the
  // ship can shoot (d0 within its own reach), so it regulates the APPROACH and
  // never a fight. Hulls that have chosen to stop - a spinal gun charging - are
  // not counted as laggards. And `patienceRounds` breaks the wait outright, so
  // a crippled straggler cannot freeze a fleet for a whole battle.
  const C = H.cohesion ?? {};
  let gatherHold = false;
  // "Until contact" is Chris's own wording and it is load-bearing. A latch,
  // not a live test: once this hull has had an enemy inside its reach the
  // approach is over and the rule is spent for the rest of the battle. Without
  // the latch a ship that loses touch mid-fight turns round to re-form on a
  // mate, which is not what the rule is for and measured badly - it was worth
  // 17pp of faction spread at 18 points on its own, where a three-hull fleet
  // that has lost one ship is permanently "out of formation".
  const reachNow = ARC ? maxReach(ship, tuning) : 0;
  if (ARC && !ship.hadContact && d0 <= reachNow) ship.hadContact = true;
  // The latch is FLEET-wide, not per-hull: the approach ends for everybody the
  // moment anybody has an enemy in reach. Per-hull was tried first and is not
  // enough - a ship that loses touch in the middle of a fight then turns round
  // to re-form on a mate, which measured 16pp of faction spread at 18 points,
  // where a three-hull fleet that has lost one ship is permanently "out of
  // formation".
  let movers = [];
  if (ARC && C.arriveTogether && mates.length && !ship.hadContact && d0 > reachNow) {
    movers = mates.filter((m) => !plantedByCharge(m, tuning));
    if (movers.some((m) => m.hadContact)) movers = [];
  }
  // `convergeBeyondHexes` confines the whole rule to the opening of a battle.
  // Forming up is an approach manoeuvre; a ship that is nearly in the fight has
  // no business turning aside for it, and left ungated the rule kept nudging
  // ships sideways all the way in.
  if (movers.length &&
      d0 > (C.convergeBeyondHexes ?? 0) &&
      (ship.gatherHeld ?? 0) <= (C.patienceRounds ?? 24)) {
    // RADIAL: nobody gets more than lagToleranceHexes ahead of the rearmost.
    const ec = centroid(foes);
    const mine = distance(ship.pos, ec);
    let worst = mine;
    for (const m of movers) {
      const g = distance(m.pos, ec);
      if (g > worst) worst = g;
    }
    if (worst - mine > (C.lagToleranceHexes ?? 3)) gatherHold = true;

    // LATERAL - and this is the half the old leash could not see. An echelon
    // is not strung out along the axis of approach, it is strung out ACROSS
    // it: four frigates all exactly as far from the enemy as each other and
    // twelve hexes apart from one another, which every radial test in the
    // engine reads as perfect formation.
    //
    // The measure is MUTUAL SUPPORT - the distance to the nearest mate - and
    // not the distance to the fleet's centre of mass, which was tried first
    // and is wrong: a deployed line of twenty hulls at two-hex spacing is
    // forty hexes across, so every ship in it is far from the centroid and the
    // whole fleet balls up on the spot. Nearest-mate leaves a properly spaced
    // line alone (neighbours are two hexes apart) and catches exactly the case
    // this rule is for. A ship out of support closes on its nearest mate
    // rather than on the enemy; it does not merely wait, because waiting is a
    // deadlock when every ship in a dispersed fleet is equally out of place.
    const ms = C.mutualSupportHexes ?? 0;
    if (ms > 0) {
      const mate = nearest(ship.pos, movers, ship.facing);
      if (mate.ship && mate.range > ms) {
        ship.gatherHeld = (ship.gatherHeld ?? 0) + 1;
        if (INS) helmStats.gatherHeld++;
        turnTowards(bearing(ship.pos, mate.ship.pos));
        let fb = spendable(ship);
        while (fb >= ship.movementPointRatio && distance(ship.pos, mate.ship.pos) > ms) {
          if (!forwardStep(mate.ship.pos, "close")) break;
          fb -= ship.lastStepCost;
        }
        turnTowards(heading(target.pos));   // spare turns go to the firing stance
        return;
      }
    }
    if (gatherHold) {
      ship.gatherHeld = (ship.gatherHeld ?? 0) + 1;
      if (INS) helmStats.gatherHeld++;
    }
  }

  let need = "hold";
  if (d0 > want && !tooFarAhead(d0) && !gatherHold) need = "close";
  else if (d0 < want && !ship.cloaked && want - d0 >= 1 && canWithdrawFighting(ship, tuning)) need = "open";

  if (INS) {
    if (need === "close") helmStats.needClose++;
    else if (need === "open") helmStats.needOpen++;
    else { helmStats.needHold++; if (d0 > want && !gatherHold) helmStats.leashHeld++; }
  }

  // (c) MOVE OUT OF THE ARC. Checked before the close/open/hold branches,
  // because a hull sitting in a battery that outguns it several times over has
  // a more pressing question than what range it would like to be at.
  const AE = H.arcEvasion ?? {};
  if (ARC && AE.enabled !== false && need !== "open" && !ship.cloaked) {
    const th = threat();
    if (th.top && spendable(ship) >= ship.movementPointRatio) {
      const f = evadeStep(ship, th.top, target, turnsLeft, tuning, AE, want);
      if (f !== null && f !== undefined) {
        turnTowards(f);
        if (ship.facing === f) {
          const next = add(ship.pos, f);
          const cost = stepCost(ship, next, tuning);
          step(next, cost, false, "evadeSteps");
          turnTowards(heading(target.pos));
          return;
        }
      }
    }
  }

  if (need === "hold") {
    // In position - so fight with the guns. But the guns for this turn have
    // usually already been fired by the time a holding ship reaches here (the
    // round loop only moves a ship that cannot bear), and standing still is
    // how three hits in four ended up on somebody's nose. So: work around.
    //
    // ORBIT (Chris's (b), part two). One lateral step per round, in the
    // direction that walks this ship toward the softest quarter of its target,
    // taken only while the step keeps the range inside the firing band. It
    // costs power that would otherwise have gone to the shields, which is the
    // trade being measured; it also buys evasion, since to-hit falls with the
    // hexes a target has moved.
    if (ARC && AA.enabled !== false && AA.orbitWhileHolding !== false &&
        spendable(ship) >= ship.movementPointRatio && d0 > 0) {
      const curDir = bearing(target.pos, ship.pos);
      const pref = preferredApproachDir(target, curDir, AA, occupiedDirs(ship, target, mates, tuning, AA));
      if (pref.dir !== curDir && pref.gain >= (AA.minGain ?? 0.4)) {
        const off = swingOffset(curDir, pref.dir);
        const f = (direct + off) % 6;
        const next = add(ship.pos, f);
        const dNext = distance(next, target.pos);
        const slack = AA.orbitRangeSlack ?? 1;
        if (turnCostBetween(ship.facing, f) <= turnsLeft && inBounds(next, tuning) &&
            !blockedHex(next, tuning) && dNext > 0 && Math.abs(dNext - want) <= slack &&
            dNext <= maxReach(ship, tuning)) {
          turnTowards(f);
          if (ship.facing === f) {
            const cost = stepCost(ship, next, tuning);
            step(next, cost, false, "orbitSteps");
          }
        }
      }
    }
    turnTowards(heading(target.pos));
    return;
  }

  // (b) ATTACK THE WEAK ARC, part two: the travel direction on the way in.
  //
  // A cloaked ship already closed one hexside off the direct bearing, to come
  // in from an unexpected quarter. That is generalised here, with a cost /
  // benefit test in place of the cloak's unconditional swing: the helm looks
  // at which quarter of the target it would rather be shooting into, and if
  // the gain is worth `minGain` it closes on the offset bearing that walks it
  // round that way. The step still has to SHORTEN the range - a ship that
  // wants a flank does not get to orbit its way through the approach - so the
  // detour costs tempo and nothing else.
  //
  // And tempo spent early buys nothing, which is the whole story of this rule:
  // at thirty hexes the target re-aims a dozen times before we arrive, so the
  // detour is pure loss. Measured, swinging from the moment of deployment is
  // WORSE than not swinging at all. `flankWithinHexes` is the range inside
  // which the reposition is worth paying for.
  let flankTravel = false, arcTravelDir = 0;
  if (ARC && need === "close" && AA.enabled !== false && !flanking &&
      d0 <= (AA.flankWithinHexes ?? Infinity)) {
    const curDir = bearing(target.pos, ship.pos);
    const pref = preferredApproachDir(target, curDir, AA, occupiedDirs(ship, target, mates, tuning, AA));
    if (pref.dir !== curDir && pref.gain >= (AA.minGain ?? 0.4)) {
      const f = (direct + swingOffset(curDir, pref.dir)) % 6;
      const next = add(ship.pos, f);
      if (distance(next, target.pos) < d0 && inBounds(next, tuning) && !blockedHex(next, tuning) &&
          turnCostBetween(ship.facing, f) <= turnsLeft) {
        flankTravel = true;
        arcTravelDir = f;
      }
    }
  }
  const travelDir = need === "close"
    ? (flanking ? (direct + swing) % 6 : (flankTravel ? arcTravelDir : direct))
    : (direct + 3) % 6;
  if (INS && need === "close") {
    if (travelDir === direct) helmStats.stepDirect++; else helmStats.stepFlank++;
  }
  turnTowards(travelDir);

  let budget = spendable(ship);
  while (budget >= stepCost(ship, add(ship.pos, ship.facing), tuning)) {
    const d = distance(ship.pos, target.pos);
    if (need === "close" && (d <= want || tooFarAhead(d))) break;
    if (need === "open" && d >= want) break;
    if (!forwardStep(target.pos, need)) break; // facing not yet useful: finish the turn next round
    budget -= ship.lastStepCost;
  }
  // Arrived with turn allowance to spare: settle into the firing stance.
  const dEnd = distance(ship.pos, target.pos);
  if ((need === "close" && dEnd <= want) || (need === "open" && dEnd >= want)) {
    turnTowards(heading(target.pos));
  }

  // Klingon pattern: a Zandrax ship still short of the range it wants may burn
  // extra hexes for free - along its facing, like any other flight - paying in
  // self-inflicted engine stress and accuracy for the rest of the turn.
  const em = tuning.emergencyManoeuvre;
  const mayBurst = em && em.factions.includes(ship.faction) && !ship.emergencyUsed;
  if (mayBurst && need === "close" && distance(ship.pos, target.pos) > want) {
    for (let i = 0; i < em.extraHexes; i++) {
      if (distance(ship.pos, target.pos) <= want) break;
      if (!forwardStep(target.pos, "close", true)) break;
    }
  }
}

function payBurst(ship, moved, tuning) {
  if (moved <= 0) return;
  const em=tuning.emergencyManoeuvre;
  ship.emergencyUsed=true;
  ship.superstructure=Math.max(0,ship.superstructure-em.stressDamage);
  ship.toHitPenalty=em.toHitPenalty;
  if (ship.superstructure===0) {
    // Same crippling rule as combat damage; burst stress must not be the one
    // path that still vaporises a hull outright.
    if (tuning?.damage?.crippling?.enabled && !ship.crippled) { ship.crippled=true; ship.crewAlive=true; }
    else ship.destroyed=true;
  }
}

// Krelath short-range tactical warp. Replaces the cloak they lost: instead of
// choosing WHETHER to engage, they choose WHERE they appear in one. Arrives by
// preference behind the target, where the rear facing table takes engineering
// and eats the current turn's power pool.
function tryWarp(ship, enemies, friends, tuning, log, targetId=null, onStep=null, reportFailure=false, battle=null) {
  const refused=reason=>{if(log&&reportFailure)log(`${ship.id} warp refused: ${reason}`);return false;};
  const W = tuning.warpJump;
  if (!W || !W.factions.includes(ship.faction)) return refused('not fitted');
  if (ship.destroyed || ship.cloaked || ship.decloaking) return refused('vessel unavailable');
  if (plantedByCharge(ship,tuning)) return refused('spinal charge plants the ship');
  if (W.oncePerTurn && ship.warpedThisTurn) return refused('already used this turn');

  // A squadron manoeuvre, not a fleet teleport. Left uncapped, every Krelath
  // ship jumped behind the SAME enemy battleship on turn one and the whole
  // action collapsed into one point-blank melee at the range their blasters
  // like best - measured, 94% against Earth at 32 points in six turns.
  const share = W.fleetFraction ?? 1;
  if (share < 1) {
    const fleet = living(friends);
    const already = fleet.filter((f) => f.warpedThisTurn).length;
    if (already >= Math.max(1, Math.floor(fleet.length * share))) return refused('fleet jump allowance exhausted');
  }

  const foes = targetable(enemies, battle, ship.side);
  if (!foes.length) return refused('no visible contact');
  const target = targetId ? foes.find(s=>s.id===targetId) : nearest(ship.pos, foes, ship.facing).ship;
  if (!target) return refused('selected target is not a visible contact');
  const want = Math.max(1, preferredRange(ship, tuning));
  const gap = distance(ship.pos, target.pos);
  if (gap <= want + 1) return refused('already in engagement position');

  const cost = Math.round(fullPower(ship) * W.powerCostFraction);
  if (ship.power < cost) return refused('insufficient power');

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
    if (W.requireRearArc) return refused('rear insertion outside jump range or map');
    dest = ship.pos;
    const toward = bearing(ship.pos, target.pos);
    for (let i = 0; i < Math.min(W.rangeHexes, gap - want); i++) {
      const step = add(dest, toward);
      if (!inBounds(step, tuning)) break;
      dest = step;
    }
  }
  if (dest.q === ship.pos.q && dest.r === ship.pos.r) return refused('no displacement');
  // The jump has to be worth the round it costs and the third of the pool it
  // burns. Without this test the warp was also unreachable in practice: it was
  // only attempted when nothing could bear, and a Krelath blaster reaches 17
  // hexes of a 16-hex opening range, so every ship fired from the far side of
  // the field instead and the trait never fired once in a whole campaign.
  if (gap - distance(dest, target.pos) < (W.minGain ?? 0)) return refused('minimum closing gain not met');
  if (!inBounds(dest,tuning) || blockedHex(dest,tuning)) {
    if(log)log(`${ship.id} warp refused: impassable terrain or the map edge`);
    return false;
  }

  // Check every living enemy, not just the hull behind which we are jumping.
  // Do not spend jump power or the per-turn jump slot for an illegal landing.
  if (enemyAt(dest, enemies, tuning)) {
    if (log) log(`${ship.id} warp refused: will not land in an enemy's hex`);
    return false;
  }

  ship.pos = dest;
  ship.power -= cost;
  ship.warpedThisTurn = true;
  ship.facing = turnToward(ship.facing, bestHeading(ship, target.pos, tuning, -1, null));
  reconcileContacts(battle);
  if(onStep)onStep({...ship.pos,facing:ship.facing,warp:true});
  if (log) log(ship.id + ' warps in behind ' + target.id);
  return true;
}

function scan(ship, enemies, friends, tuning, log, battle = null, face = null) {
  // Scanning, contact acquisition and preview share the same damage predicate.
  // Disabled sensors cannot disclose a target to legacy automatic gunnery.
  if (sensorAbility(ship, tuning) < 2) return;
  const cmdRange = commandBonus(ship, friends, 'commandDetectionBonus');
  const foes = living(enemies);
  if (!foes.length) return;
  // Guess the arc from known contacts only; with none, sweep dead ahead.
  const known = targetable(enemies, battle, ship.side);
  const guess = face ?? (known.length ? shieldFacing(ship, centroid(known)) : 2);
  let found = 0, read = 0;
  for (const e of foes) {
    if (finiteSensing(battle)) {
      if (grantScanContact(battle, ship, e, guess)) found++;
      // RULING (2026-09-07, Chris): the scan action IS the lock for shields.
      // A sweep reads every contact it already holds inside the swept arc; the
      // reading is then free to consult until it goes stale.
      if (recordShieldSweep(battle, ship, e, guess)) read++;
      continue;
    }
    if (!e.cloaked || e.detected) continue;
    if (distance(ship.pos, e.pos) > detectionRangeAgainst(e, tuning) + cmdRange) continue;
    if (!inArc(ship, guess, e.pos)) continue;
    e.detected = true; // a successful detection informs all friendly forces
    grantScanContact(battle, ship, e);
    found++;
  }
  if ((found || finiteSensing(battle)) && log) log(`${ship.id} sweeps arc ${guess}: ${found} contact(s)${read?`, shields read on ${read}`:''}`);
}

function evade(ship, tuning, rng, log, battle = null) {
  if (!ship.cloaked) return;
  const tracked = finiteSensing(battle)
    ? currentContacts(battle, ship.side === 'A' ? 'B' : 'A').some(c => c.id === ship.id)
    : ship.detected;
  if (!tracked) return;
  if (rng.next() < tuning.cloak.evadeChance) {
    ship.detected = false;
    loseContact(battle, ship);
    if (log) log(`${ship.id} evades, contact lost`);
  }
}

// ---------------------------------------------------------------- battle

// Instrumentation only. Which face is each ship showing to the nearest enemy
// that can actually reach it, and how sound is that face? Never called unless
// a harness has switched the account on.
function censusFaces(A, B, tuning) {
  for (const [side, foe] of [[A, B], [B, A]]) {
    const live = living(foe);
    if (!live.length) continue;
    for (const s of living(side)) {
      const n = nearest(s.pos, live, s.facing);
      if (!n.ship || n.range === 0 || n.range > maxReach(n.ship, tuning)) continue;
      helmStats.presentRounds++;
      if (faceHealth(s, shieldFacing(s, n.ship.pos)) < 1) helmStats.presentWeak++;
    }
  }
}

// Instrumentation only. How strung out is each side at the moment the two
// fleets first come within reach of one another? Mean distance of a side's
// living hulls from their own centre of mass.
// Instrumentation only. Mean distance from each living hull to its nearest
// mate - the measure "arrive together" is actually about. Distance from the
// centroid answers a different question and answers it badly for a line.
function mateGapOf(fleet) {
  const live = living(fleet);
  if (live.length < 2) return 0;
  let t = 0;
  for (const s of live) {
    let best = Infinity;
    for (const o of live) if (o !== s) { const d = distance(s.pos, o.pos); if (d < best) best = d; }
    t += best;
  }
  return t / live.length;
}
function spreadOf(fleet) {
  const live = living(fleet);
  if (live.length < 2) return 0;
  const c = centroid(live);
  return live.reduce((t, s) => t + distance(s.pos, c), 0) / live.length;
}
function inContact(A, B, tuning) {
  for (const [side, foe] of [[A, B], [B, A]]) {
    const live = living(foe);
    if (!live.length) return false;
    for (const s of living(side)) {
      const n = nearest(s.pos, live, s.facing);
      if (n.ship && n.range <= maxReach(s, tuning)) return true;
    }
  }
  return false;
}

// ------------------------------------------------------- ordered movement
// A human order for one round: turn by `turn` hexsides (positive is counter-
// clockwise), then move `forward` hexes along the new facing. Everything is
// clamped by the rules the AI lives under - turnRatePerRound, power at the
// hex's step cost, the map edge, terrain, the same-hex rule - and every clamp
// is logged so the player learns the rule. Returns the number of hexes moved.
// A captain's deviation, recorded as DATA and not only as a line of prose.
//
// The trusted narrative log is omniscient, which is why the player session deliberately does not
// subscribe to it. Without a structured channel the consequence was that clause 2 of the ruling -
// reported after execution - held only for a trusted caller, and a player watching his own ship
// stop short was told nothing at all (Astra, 2026-09-09).
//
// Deliberately NOT carried: which enemy provoked it. The rule is evaluated against every living
// enemy, including ones the observing side cannot see, so naming one would disclose it. The reason
// text names a range and the ship's own hull and no one else.
function recordCaptain(battle, ship, rule, reason, extra = {}) {
  if (!battle) return;
  (battle.captainLog ??= []).push({ shipId: ship.id, side: ship.side, rule, reason, turn: battle.turn, ...extra });
}

function moveOrdered(ship, plan, enemies, tuning, log, onStep = null, battle = null) {
  const M = tuning.movement ?? {};
  const turnRate = ship.turnRate ?? (M.turnRatePerRound ?? {})[ship.className] ?? 2;
  let want = Math.trunc(Number(plan.turn) || 0);
  if (Math.abs(want) > turnRate) { if (log) log(`${ship.id} order clamped: turn ${want} exceeds turn rate ${turnRate}`); want = Math.sign(want) * turnRate; }
  ship.facing = ((ship.facing + want) % 6 + 6) % 6;
  let forward = Math.max(0, Math.trunc(Number(plan.forward) || 0));
  const em=tuning.emergencyManoeuvre;
  let burst=Math.max(0,Math.trunc(Number(plan.burst)||0));
  if (burst && (!em?.factions?.includes(ship.faction) || ship.emergencyUsed)) {
    if(log)log(`${ship.id} burst refused: ${ship.emergencyUsed?'already used this turn':'not fitted'}`);
    burst=0;
  }
  if(burst>(em?.extraHexes??0)){
    if(log)log(`${ship.id} order clamped: burst ${burst} exceeds ${em.extraHexes} extra hexes`);
    burst=em.extraHexes;
  }
  if ((forward > 0 || burst > 0) && plantedByCharge(ship, tuning)) {
    if (log) log(`${ship.id} order clamped: spinal charge plants the ship; turning is allowed`);
    return 0;
  }
  // Resolve the affordable/passable path before committing any steps. Trimming
  // an enemy-occupied suffix keeps real transit legal without charging power
  // or emitting preview points for a step that ultimately cannot be taken.
  const steps = [];
  let pos = ship.pos, power = ship.power, stop = null, captainStop = null, captainProtest = null;
  const foes = living(enemies);
  while (steps.length < forward) {
    const next = add(pos, ship.facing);
    const cost = stepCost(ship, next, tuning);
    if (Math.max(0, power - ship.reserve) < cost) { stop = "power exhausted"; break; }
    if (!inBounds(next, tuning)) { stop = "impassable terrain or the map edge"; break; }
    // The captain's refusal is a stop like any other, which is why the substitute action the ruling
    // asks for comes free: the move is clamped to the last step he was willing to take.
    if (ship.captain) {
      captainStop = refusesStep(ship, pos, next, foes, tuning);
      // Insisting does not silence him: it overrides him. The first objection is kept and reported
      // once, however many further steps he would have objected to.
      if (captainStop && ship.insistThisTurn) { captainProtest = captainProtest ?? captainStop; captainStop = null; }
      else if (captainStop) break;
    }
    steps.push({ pos: next, cost });
    pos = next; power -= cost;
  }
  // Burst adds free forward translation to the paid path, even if the normal
  // pool is exhausted. It never ignores terrain, map edges or final occupancy.
  for(let i=0;i<burst;i++){
    const next=add(pos,ship.facing);
    if(!inBounds(next,tuning)||blockedHex(next,tuning)){stop='impassable terrain or the map edge';break;}
    if (ship.captain) {
      captainStop = refusesStep(ship, pos, next, foes, tuning);
      if (captainStop && ship.insistThisTurn) { captainProtest = captainProtest ?? captainStop; captainStop = null; }
      else if (captainStop) break;
    }
    steps.push({pos:next,cost:0,burst:true});pos=next;
  }
  if (captainProtest) {
    if (log) log(`${ship.id} captain: ${captainProtest.protest}`);
    recordCaptain(battle, ship, 'closes-under-protest', captainProtest.protest, { insisted: true });
  }
  let trimmed = false;
  while (steps.length && enemyAt(steps.at(-1).pos, foes, tuning)) { steps.pop(); trimmed = true; }
  // A refusal is a different KIND of event from a clamp, and must not be swallowed by one.
  // Reported by Astra 2026-09-09: with a picket in the next hex, occupancy trimming and the
  // refusal were mutually exclusive, so a ship that stopped because of its captain was recorded
  // as merely declining to end its move in an enemy's hex. Both are now reported.
  if (captainStop) {
    if (log) log(`${ship.id} captain: ${captainStop.reason}; held at ${steps.length} of ${forward+burst} hexes`);
    recordCaptain(battle, ship, captainStop.rule, captainStop.reason, { held: steps.length, of: forward + burst, insisted: false });
  }
  if (trimmed && log) log(`${ship.id} order clamped: will not end its move in an enemy's hex${stop ? ` (${stop} limits transit)` : ""}`);
  else if (stop && log) log(`${ship.id} order clamped: ${stop} after ${steps.length} of ${forward+burst} hexes`);
  for (const step of steps) {
    ship.pos = step.pos;
    ship.power -= step.cost;
    ship.lastStepCost = step.cost;
    ship.movedThisTurn++;
    reconcileContacts(battle);
    if (onStep) onStep({ ...ship.pos, facing: ship.facing, ...(step.burst?{burst:true}:{}) });
  }
  const burstMoved=steps.filter(s=>s.burst).length;
  payBurst(ship,burstMoved,tuning);
  reconcileContacts(battle);
  if(log&&plan.burst)log(burstMoved?`${ship.id} bursts ${burstMoved} hexes: ${em.stressDamage} stress, ${em.toHitPenalty} accuracy penalty`:`${ship.id} burst gains no hexes: no stress or accuracy penalty`);
  const moved = steps.length;
  if (log && moved > 0) log(`${ship.id} moves as ordered (${moved} hexes), facing ${ship.facing}`);
  return moved;
}

// Explicit requests consume the action even when refused; never silently fire
// or route a rejected special back into the privileged scripted helm.
function orderedWarp(ship,plan,order,enemies,friends,tuning,log,onStep=null,battle=null){
  if(plan.warp!==true || (Number(plan.turn)||0)!==0 || (Number(plan.forward)||0)!==0 || (Number(plan.burst)||0)!==0){
    if(log)log(`${ship.id} warp refused: warp must occupy an action without turn, forward or burst`);
    return false;
  }
  return tryWarp(ship,enemies,friends,tuning,log,order.target&&order.target!=='auto'?order.target:null,onStep,true,battle);
}

// ------------------------------------------------------------- stepping API
// The battle as an object that advances one turn at a time, so a human may
// command one side (docs/playfield-contract.md). runBattle below is this
// same machinery run to the end with no orders, and is byte-identical to the
// engine before the API existed.
export function createBattleFromFleets(fleets, tuning, rng, opts = {}) {
  const errors = [...objectiveErrors(opts.victory, fleets),
    ...deploymentErrors(fleets, opts.terrain ?? tuning.battle?.terrain ?? [])];
  if (errors.length) throw new Error(errors.join(" "));
  for (const s of fleets.flat()) { delete s._helm; delete s.hadContact; delete s.gatherHeld; }
  if (opts.terrain != null) {
    tuning = { ...tuning, battle: { ...tuning.battle, terrain: opts.terrain } };
  }
  const [A, B] = fleets;
  A.forEach((s) => { s.side = "A"; });
  B.forEach((s) => { s.side = "B"; });
  A.sort(canonicalShipCompare);
  B.sort(canonicalShipCompare);
  const blank = () => ({
    shots: 0, hits: 0, launches: 0, damage: 0, internal: 0, screened: 0,
    sorties: 0, craftLost: 0, hitsForward: 0, hitsRear: 0
  });
  return {
    fleets, A, B, tuning, rng,
    terrain: tuning.battle?.terrain ?? [],
    maxTurns: opts.maxTurns ?? tuning.battle.maxTurns,
    victory: opts.victory ?? null,
    rounds: tuning.battle.roundsPerTurn,
    stats: { A: blank(), B: blank() },
    inFlight: [], turnsRun: 0, contactLogged: false,
    turn: 1, done: false, result: null
  };
}

export function createBattle(scenario, tuning, loadouts, seed, options = {}) {
  const rng = makePrngFor(seed);
  const built = buildScenario(scenario, tuning, loadouts, rng, options);
  const battle = createBattleFromFleets(built.fleets, built.tuning, rng, {
    terrain: built.terrain,
    maxTurns: scenario.maxTurns,
    victory: scenario.victory
  });
  battle.scenario = scenario;
  battle.seed = seed;
  // Explicit register data is the opt-in. No field (even null) is added to unnamed battles.
  if (options.shipNames) for (const fleet of battle.fleets) nameShips(fleet, seed ?? 'orion', options.shipNames);
  if (built.warnings?.length) battle.warnings = [...built.warnings];
  return battle;
}

function makePrngFor(seed) {
  return makePrng(typeof seed === "number" ? seed : seedFromString(String(seed ?? "orion")));
}

export function battleResult(battle) {
  const remA = fighting(battle.A), remB = fighting(battle.B);
  const ptsA = remA.reduce((s, x) => s + x.points, 0);
  const ptsB = remB.reduce((s, x) => s + x.points, 0);
  let victor = null;
  let reason = "surviving fleet points";
  const protectedClass = battle.victory?.type === "flagship" ? battle.victory.protectedClass : null;
  if (protectedClass) {
    const aliveA = remA.some((ship) => ship.className === protectedClass.A);
    const aliveB = remB.some((ship) => ship.className === protectedClass.B);
    if (!aliveA || !aliveB) {
      reason = !aliveA && !aliveB ? "both command assets destroyed" : "enemy command asset destroyed";
      victor = aliveA === aliveB ? null : aliveA ? "A" : "B";
      return {
        victor, reason, turns: battle.turnsRun,
        survivorsA: remA.length, survivorsB: remB.length,
        pointsA: ptsA, pointsB: ptsB, stats: battle.stats
      };
    }
  }
  if (!remB.length && remA.length) { victor = "A"; reason = "enemy fleet destroyed"; }
  else if (!remA.length && remB.length) { victor = "B"; reason = "enemy fleet destroyed"; }
  else if (ptsA > ptsB) victor = "A";
  else if (ptsB > ptsA) victor = "B";
  return {
    victor, reason, turns: battle.turnsRun,
    survivorsA: remA.length, survivorsB: remB.length,
    pointsA: ptsA, pointsB: ptsB, stats: battle.stats
  };
}

function objectiveEnded(battle) {
  const protectedClass = battle.victory?.type === "flagship" ? battle.victory.protectedClass : null;
  if (!protectedClass) return false;
  return !fighting(battle.A).some((ship) => ship.className === protectedClass.A) ||
    !fighting(battle.B).some((ship) => ship.className === protectedClass.B);
}

// One full turn. `orders` maps ship id -> { plan: [{turn, forward} x rounds],
// target: id | "auto", reserve: 0..1 }. Unordered ships use the scripted helm
// and gunnery. Returns { turn, result } where result is null until the
// battle ends; the round frames, shots and log come through opts callbacks
// exactly as in runBattle.
export function stepTurn(battle, orders = {}, opts = {}) {
  // Reject malformed direct special intents before any combat mutation.
  for(const [id,order] of Object.entries(orders))if(order&&Object.hasOwn(order,'spinal')){
    if(!['charge','vent'].includes(order.spinal)||!battle.fleets.flat().some(s=>s.id===id&&s.spinal&&!s.destroyed))
      throw new Error('Invalid spinal intent');
  }
  assertExecutableContacts(battle);
  if (battle.done) return { turn: battle.turn, result: battle.result };
  const { A, B, tuning, rng, stats, fleets, rounds } = battle;
  const log = opts.log ?? null;
  const turn = battle.turn;
  let shotRound = 1;
  const onShot = opts.onShot || opts.onBeforeShot
    ? (event) => opts.onShot?.({ turn, round: shotRound, ...event })
    : null;
  // Trusted instrumentation only. Capture eligibility immediately before the
  // event mutates state, including a final hit that destroys its observer.
  // The internal callback property avoids carrying a second callback through
  // every firing helper; no battle-wide/global observer or cache is installed.
  if (onShot && opts.onBeforeShot) onShot.before = () => opts.onBeforeShot(turn, shotRound);
  const hasOrder = (s) => Object.prototype.hasOwnProperty.call(orders, s.id) && orders[s.id];

  if (!living(A).length || !living(B).length || objectiveEnded(battle) || turn > battle.maxTurns) {
    battle.done = true; battle.result = battleResult(battle);
    return { turn, result: battle.result };
  }
  battle.turnsRun = turn;
  reconcileContacts(battle);

  // Missiles launched last turn arrive, subject to interception.
  const arriving = battle.inFlight;
  battle.inFlight = [];
  const inFlight = battle.inFlight;
  for (const m of arriving) {
    onShot?.before?.();
    const foeSide = m.side === "A" ? B : A;
    const st = m.side === "A" ? stats.A : stats.B;
    const target = foeSide.find((s) => s.id === m.targetId);
    const geometry = { ...shotGeometry(m.shooterPos, target, m.shooterFacing), ...missileGeometry(m) };
    if (!target || target.destroyed) {
      if (onShot) onShot({ kind: "missile", weapon: m.weapon, shooterId: m.shooterId, targetId: m.targetId, outcome: "dead-target", damage: 0, ...geometry });
      continue;
    }
    const MC = tuning.toHit.missileClassInteraction;
    if (MC && MC.enabled &&
        (m.shooterPoints ?? 0) >= MC.heavyThresholdPoints &&
        target.points < MC.heavyThresholdPoints &&
        rng.next() < MC.heavyVsLightEvadeChance) {
      if (onShot) onShot({ kind: "missile", weapon: m.weapon, shooterId: m.shooterId, targetId: m.targetId, outcome: "evaded", damage: 0, ...geometry });
      continue;
    }
    if (intercepted(target, foeSide, tuning, rng)) {
      if (onShot) onShot({ kind: "missile", weapon: m.weapon, shooterId: m.shooterId, targetId: m.targetId, outcome: "intercepted", damage: 0, ...geometry });
      continue;
    }
    const impact = resolveHit(m.shooterPos, target, m.damage, foeSide, tuning, rng, st, log, m.spread, undefined, m);
    reconcileContacts(battle);
    if (onShot) onShot({ kind: "missile", weapon: m.weapon, shooterId: m.shooterId, targetId: m.targetId, outcome: "hit", damage: m.damage, ...geometry, ...impact });
  }

  for (const s of [...living(A), ...living(B)]) startTurn(s, tuning);
  // DAMAGE CONTROL (ruling 2026-09-07, Chris): a crippled hull may try to get
  // back into the action once a turn. Success restores a slice of structure and
  // clears the flag; the crew were never lost, so this is a repair, not a raise.
  const dc = tuning.damage?.crippling;
  if (dc?.enabled) for (const s of [...A, ...B]) {
    if (!s.crippled || s.destroyed) continue;
    if (rng.int(100) < Math.round((dc.damageControlChance ?? 0) * 100)) {
      s.crippled = false;
      s.superstructure = Math.max(1, Math.round((s.superstructureMax ?? 1) * (dc.damageControlRestoresFraction ?? 0.15)));
      if (log) log(`${s.id} damage control succeeds - back in the action at ${s.superstructure} structure`);
    } else if (log) log(`${s.id} adrift - damage control continues`);
  }
  for (const s of fighting(A)) chargeSpinal(s, B, tuning, log, battle, hasOrder(s));
  for (const s of fighting(B)) chargeSpinal(s, A, tuning, log, battle, hasOrder(s));
  for (const s of [...living(A), ...living(B)]) {
    s.reserve = doctrineReserve(s, s.side === "A" ? B : A, tuning, battle);
    // A human reserve order overrides the doctrine: a fraction of the pool held for shields.
    const o = hasOrder(s);
    if (o && Number.isFinite(o.reserve)) s.reserve = Math.round(Math.min(1, Math.max(0, o.reserve)) * s.power);
    s.orderTarget = (o && o.target && o.target !== "auto") ? o.target : null;
    // A direct order stands for this turn only. Cleared rather than set false, because fullState()
    // serialises every ship field: writing the flag unconditionally put `insistThisTurn: false`
    // into the recorded state of battles that have no officers at all. Behaviour was unaffected -
    // the suite is byte-identical either way - but "a battle without captains is untouched" should
    // be true of the record and not only of the outcome.
    if (o && o.insist) s.insistThisTurn = true; else delete s.insistThisTurn;
  }
  for (const s of [...fighting(A), ...fighting(B)]) evade(s, tuning, rng, log, battle);

  for (const [side, foe] of [[A, B], [B, A]]) {
    const cloaked = living(side).filter((s) => s.cloaked && !s.decloaking);
    if (!cloaked.length) continue;
    const ready = cloaked.filter((s) => {
      const n = nearest(s.pos, finiteSensing(battle) ? targetable(foe, battle, s.side) : living(foe), s.facing);
      return n.ship && n.range <= preferredRange(s, tuning);
    });
    if (ready.length >= Math.ceil(cloaked.length * 0.6)) {
      for (const s of cloaked) s.decloaking = true;
      if (log) log(`${cloaked[0].faction} force decloaks: ${cloaked.length} ships`);
    }
  }

  opts.onState?.(turn, 0, 'power');
  for (let round = 1; round <= rounds; round++) {
    if (!living(A).length || !living(B).length) break;
    shotRound = round;
    for (const s of [...living(A), ...living(B)]) startRound(s);
    if (INS && !battle.contactLogged && inContact(A, B, tuning)) {
      battle.contactLogged = true;
      helmStats.contactSpreadA += spreadOf(A);
      helmStats.contactSpreadB += spreadOf(B);
      helmStats.contactMateA += mateGapOf(A);
      helmStats.contactMateB += mateGapOf(B);
      helmStats.contactN++;
    }

    const prioritySide = (turn + round) % 2 === 0 ? "A" : "B";
    if (round === (tuning.strikeCraft?.strikeRound ?? 1)) {
      strikePhase(A, B, tuning, rng, stats, log, onShot, prioritySide, battle);
      for (const s of [...A, ...B]) if (s.destroyed) scuttleSquadrons(s, log);
    }

    const byMovement = tuning.initiative?.fromMovementCommitment;
    const order = [...living(A), ...living(B)]
      .map((s) => ({
        s,
        roll: (byMovement ? Math.floor(spendable(s) / Math.max(0.1, s.movementPointRatio)) * 10 : 0)
          + rng.int(100) + 1 + tuning.toHit.crewRatingDefault
      }))
      .sort((x, y) => (y.roll - x.roll) ||
        (x.s.side === y.s.side ? 0 : (x.s.side === prioritySide ? -1 : 1)) ||
        canonicalShipCompare(x.s, y.s))
      .map((x) => x.s);

    const allShips = [...A, ...B];
    for (const s of order) {
      reconcileContacts(battle);
      if (s.destroyed || s.crippled) continue;
      try {
      const foe = s.side === "A" ? B : A;
      const st = s.side === "A" ? stats.A : stats.B;
      const o = hasOrder(s);
      const plan = o && Array.isArray(o.plan) ? o.plan[round - 1] : null;
      // A Scan is an exclusive action even when it becomes unavailable after
      // planning (for example, arriving fire disables the scanner). Invalid
      // direct packets also refuse here, never falling through to fire/helm.
      if (plan && Object.hasOwn(plan, 'scan')) {
        const error = scanActionError(plan, scanCapabilities(s, tuning), finiteSensing(battle));
        if (error) { if (log) log(`${s.id} scan refused: ${error}`); }
        else scan(s, foe, s.side === 'A' ? A : B, tuning, log, battle, plan.scan);
        continue;
      }
      if (s.cloaked && !s.decloaking) {
        if(plan&&(Object.hasOwn(plan,'warp')||(Number(plan.burst)||0)>0)){if(log)log(`${s.id} special refused: cloak control`);}
        else move(s, foe, s.side === "A" ? A : B, tuning, log, battle);
        continue;
      }
      if (s.decloaking) continue;

      // HUMAN ORDERS: a round with movement in the plan is spent moving (as the
      // scripted helm's rounds are - a ship either moves or fires in a round);
      // a round planned as a hold fires if a mount bears, on the ordered target
      // where possible. Move-or-fire, including turn-only and special actions,
      // is confirmed by Chris in tactical-design.md section 34.
      if (plan && Object.hasOwn(plan,'warp')) {
        orderedWarp(s,plan,o,foe,s.side==='A'?A:B,tuning,log,null,battle);
        continue;
      }
      if (plan && ((Number(plan.turn) || 0) !== 0 || (Number(plan.forward) || 0) > 0 || (Number(plan.burst)||0)>0)) {
        moveOrdered(s, plan, foe, tuning, log, null, battle);
        continue;
      }

      const hidden = !finiteSensing(battle) && living(foe).some((e) => e.cloaked && !e.detected);
      const canBear = targetable(foe, battle, s.side).some((f) =>
        s.mounts.some((m) => !m.inop && !m.firedThisTurn &&
          distance(s.pos, f.pos) <= m.maxRange && bears(s, m, f.pos)));

      if (hidden && sensorAbility(s, tuning) >= 2 && !canBear) { scan(s, foe, s.side === "A" ? A : B, tuning, log, battle); continue; }
      if (!o && finiteSensing(battle) && round === 3 && scanCapabilities(s, tuning).available) {
        // Fixed public cadence, not a hidden-enemy-count trigger. Let the
        // actual firing path decide legality (power, magazine, readiness,
        // line of fire, etc.), once only, without speculative RNG draws.
        // On this action a legal shot takes priority over scan/warp/helm.
        if (fire(s, foe, s.side === 'A' ? A : B, tuning, rng, inFlight, st, log, onShot, null, {turn,round}, battle) > 0) continue;
        scan(s, foe, s.side === 'A' ? A : B, tuning, log, battle);
        continue;
      }
      if (!o && tryWarp(s, foe, s.side === "A" ? A : B, tuning, log, null, null, false, battle)) continue;
      if (canBear && fire(s, foe, s.side === "A" ? A : B, tuning, rng, inFlight, st, log, onShot, null, {turn,round}, battle) > 0) continue;
      if (o) { if (log && plan) log(`${s.id} holds as ordered`); continue; } // an ordered hold does not wander
      move(s, foe, s.side === "A" ? A : B, tuning, log, battle);
      } finally {
        opts.onState?.(turn, round, 'action');
      }
    }

    for (const s of allShips) if (s.destroyed && !s.exploded) detonate(s, allShips, tuning, rng, log);
    for (const s of allShips) if (s.destroyed && s.squadrons) scuttleSquadrons(s, log);
    reconcileContacts(battle);
    advanceMissileFlights(inFlight,fleets,turn,round,rounds);
    if (INS) censusFaces(A, B, tuning);
    if (opts.onRound) opts.onRound(turn, round, fleets, snapshotMissiles(inFlight));
    if (objectiveEnded(battle)) break;
  }

  for (const s of [...living(A), ...living(B)]) {
    if (s.decloaking) { s.decloaking = false; s.cloaked = false; s.detected = true; }
  }
  reconcileContacts(battle);

  battle.turn = turn + 1;
  if (!living(A).length || !living(B).length || objectiveEnded(battle) || battle.turn > battle.maxTurns) {
    battle.done = true; battle.result = battleResult(battle);
  }
  return { turn, result: battle.result };
}

// What a ship may do this turn, for the planning UI.
export function shipPlan(battle, shipId) {
  const ship = battle.fleets.flat().find((s) => s.id === shipId);
  if (!ship) return null;
  const M = battle.tuning.movement ?? {};
  const turnRate = ship.turnRate ?? (M.turnRatePerRound ?? {})[ship.className] ?? 2;
  const pool = fullPower(ship);
  const doc = battle.tuning.doctrine?.[ship.faction];
  const reserveFraction = doc?.reserveFraction ?? 0.35;
  return {
    turnRate,
    movementPointRatio: ship.movementPointRatio,
    fullPower: pool,
    defaultReserveFraction: reserveFraction,
    maxHexesPerTurn: Math.floor(pool * (1 - reserveFraction) / Math.max(0.1, ship.movementPointRatio)),
    roundsPerTurn: battle.rounds,
    specials: specialCapabilities(ship,battle.tuning),
    ...(finiteSensing(battle) ? { scan: scanCapabilities(ship,battle.tuning) } : {}),
    asteroidFieldCostMultiplier: battle.tuning.battle?.terrainRules?.asteroids?.moveCostMultiplier ?? 2
  };
}

// Read-only, deterministic order forecast against stationary contacts.
// It shares movement, charge, launch and firing allocation with execution.
// It deliberately excludes incoming/outgoing damage, initiative, evasion,
// opponent orders and cloak coordination: it is not a promised battle outcome.
export function previewOrders(battle, shipId, order = {}) {
  assertExecutableContacts(battle);
  if (finiteSensing(battle)) throw new Error('Finite sensing requires an observation-derived preview; omniscient preview refused');
  const original = battle.fleets.flat().find(s => s.id === shipId);
  if (!original || original.destroyed) return null;
  const copy = v => JSON.parse(JSON.stringify(v));
  const ship = copy(original);
  const friends = battle.fleets.flat().filter(s => s.side === ship.side && s.id !== ship.id).map(copy);
  // Execution resets the entire fleet before any action. This one-ship preview
  // cannot predict which other planned jumps will claim the shared quota first.
  friends.forEach(s=>{s.warpedThisTurn=false;});
  friends.push(ship);
  const enemies = battle.fleets.flat().filter(s => s.side !== ship.side).map(copy);
  // Terrain caching must not mutate the live battle during a read-only preview.
  const tuning = { ...battle.tuning, battle: { ...battle.tuning.battle, _terrainSet: null } };
  const full = fullPower(ship);
  startTurn(ship, tuning);
  chargeSpinal(ship, enemies, tuning, null);
  const available = ship.power;
  const fraction = Number.isFinite(order.reserve) ? order.reserve : shipPlan(battle, shipId).defaultReserveFraction;
  ship.reserve = Math.round(Math.max(0, Math.min(1, fraction)) * ship.power);
  ship.orderTarget = order.target && order.target !== "auto" ? order.target : null;
  const reserve = ship.reserve;
  const route = [{ ...ship.pos, facing: ship.facing, round: 0 }];
  const actions = [];
  let movement = 0, weapons = 0, deck = 0;
  const noRandom = { int() { throw new Error("Forecast attempted a random draw"); }, next() { throw new Error("Forecast attempted a random draw"); } };
  for (let round = 1; round <= battle.rounds; round++) {
    startRound(ship);
    const notes = [], shots = [];
    if (ship.squadrons && tuning.strikeCraft?.enabled && round === (tuning.strikeCraft.strikeRound ?? 1)) {
      const before = ship.power;
      cycleDeck(ship, enemies, tuning, null);
      deck += before - ship.power;
    }
    const start = { ...ship.pos, facing: ship.facing };
    const entry = order.plan?.[round - 1] ?? { turn: 0, forward: 0 };
    const warping=Object.hasOwn(entry,'warp'), bursting=(Number(entry.burst)||0)>0;
    const moving = warping || bursting || (Number(entry.turn) || 0) !== 0 || (Number(entry.forward) || 0) > 0;
    const unavailable = ship.destroyed || ship.cloaked || ship.decloaking;
    const beforeFired = new Set(ship.mounts.filter(m => m.firedThisTurn).map(m => m.id));
    const before = ship.power;
    let scanned = false;
    if (unavailable) notes.push(ship.destroyed?"Vessel destroyed; later actions unavailable.":"Cloak coordination controls this vessel; manual course cannot be forecast.");
    else if (warping) {
      orderedWarp(ship,entry,order,enemies,friends,tuning,msg=>notes.push(msg.replace(ship.id+' ','')),p=>route.push({...p,round,moved:true}));
      movement+=before-ship.power;
    } else if (moving) {
      moveOrdered(ship, entry, enemies, tuning, msg => notes.push(msg.replace(ship.id + " ", "")), p => route.push({ ...p, round, moved: true }));
      movement += before - ship.power;
    } else {
      const canBear = targetable(enemies).some(f => ship.mounts.some(m => !m.inop && !m.firedThisTurn && distance(ship.pos, f.pos) <= m.maxRange && bears(ship, m, f.pos)));
      const hidden = living(enemies).some(e => e.cloaked && !e.detected);
      if (hidden && sensorAbility(ship, tuning) >= 2 && !canBear) {
        scan(ship, enemies, friends, tuning, msg => notes.push(msg));
        scanned = true;
      } else if (canBear) fire(ship, enemies, friends, tuning, noRandom, [], { shots: 0, launches: 0 }, null, null, shots);
      weapons += shots.reduce((n, s) => n + s.power, 0);
    }
    route.push({ ...ship.pos, facing: ship.facing, round, waypoint: true, hold: !moving && !unavailable });
    const mounts = ship.mounts.map(m => {
      const shot = shots.find(s => s.mountId === m.id);
      let reason = shot ? "Eligible" : "No solution";
      if (!shot) {
        if (m.inop) reason = "Offline";
        else if (unavailable) reason = ship.destroyed?"Destroyed":"Cloak control";
        else if (moving) reason = warping?"Warp action":"Maneuver action";
        else if (scanned) reason = "Scanning action";
        else if (beforeFired.has(m.id)) reason = "Spent this turn";
        else if (m.kind === "spinal" && ship.spinal?.state !== "ready") reason = `Spinal ${ship.spinal?.state ?? "offline"}`;
        else {
          const foes = targetable(enemies);
          const preferred = foes.find(f => f.id === ship.orderTarget);
          const candidates = foes.filter(f => !geometryReason(ship, m, f, tuning));
          if (candidates.length) {
            const w = weaponFor(ship, m.type, tuning);
            if (m.kind === "spinal") reason = spendable(ship) < (w.firePower ?? 0) ? "Insufficient power" : "Capital target held";
            else if (m.kind !== "beam" && ship.magazine <= 0) reason = "Magazine empty";
            else reason = "Insufficient power";
          } else if (preferred) reason = geometryReason(ship, m, preferred, tuning);
          else if (!foes.length) reason = "No visible contact";
          else reason = geometryReason(ship, m, nearest(ship.pos, foes, ship.facing).ship, tuning);
        }
      }
      return { mountId: m.id, eligible: !!shot, reason, ...shot };
    });
    actions.push({ round, start, end: { ...ship.pos, facing: ship.facing }, moving, unavailable, scanned, notes, mounts, power: ship.power, magazine: ship.magazine,
      ...(warping||bursting?{special:{kind:warping?'warp':'burst',executed:warping?route.some(p=>p.round===round&&p.warp):route.some(p=>p.round===round&&p.burst),
        burstHexes:route.filter(p=>p.round===round&&p.burst).length,superstructure:ship.superstructure,toHitPenalty:ship.toHitPenalty,
        caveat:warping?'Other fleet jumps and initiative can exhaust the shared allowance.':null}}:{}) });
  }
  return { fullPower: full, available, overhead: full - available, reserve, movement, weapons, deck, remaining: ship.power, free: spendable(ship), actions, route,
    caveat: "Stationary contacts; no damage or initiative effects. Actual targets, movement and power may change during resolution." };
}

function geometryReason(ship, mount, target, tuning) {
  if (tuning.battle?.sameHexNoFire !== false && distance(ship.pos, target.pos) === 0) return "Same hex — no fire";
  if (!mayEngage(ship, target, tuning)) return "Nebula visibility";
  if (distance(ship.pos, target.pos) > mount.maxRange || !bandFor(mount, distance(ship.pos, target.pos))) return "Out of range";
  if (!bears(ship, mount, target.pos)) return "Outside bearing arc";
  if (!lineOfFire(ship.pos, target.pos, tuning)) return "Line of fire blocked";
  return null;
}

// Value-only adapters for observation-derived planning. No battle is accepted
// or captured here. Public planners supply only own telemetry/current contacts;
// private copies contain any terrain caches and tentative movement mutation.
export function previewPublicStep(ship, action, contacts, tuning) {
  const copy = structuredClone(ship), notes = [], route = [];
  moveOrdered(copy, action, structuredClone(contacts), structuredClone(tuning),
    note => notes.push(note), point => route.push(point));
  return { ship: copy, notes, route };
}
export function publicWeaponGeometry(ship, mount, contact, tuning) {
  return geometryReason(ship, mount, contact, structuredClone(tuning));
}

// A serialisable snapshot for the UI.
export function battleView(battle) {
  const M = battle.tuning.movement ?? {};
  const ships = battle.fleets.flat().map((s) => ({
    id: s.id, faction: s.faction, side: s.side, className: s.className, points: s.points,
    ...(s.design ? { design: structuredClone(s.design), designId: s.designId, designRevision: s.designRevision, displayName: s.displayName } : {}),
    pos: { ...s.pos }, facing: s.facing, destroyed: !!s.destroyed,
    superstructure: s.superstructure, superstructureMax: s.superstructureMax ?? s.hull?.superstructure,
    power: s.power, fullPower: fullPower(s), reserve: s.reserve ?? 0,
    movementPointRatio: s.movementPointRatio,
    turnRate: s.turnRate ?? (M.turnRatePerRound ?? {})[s.className] ?? 2,
    shieldCap: { ...s.shieldCap }, shieldDown: { ...s.shieldDown },
    shieldMax: s.hull.maxShieldPower, shieldPointRatio: s.shieldPointRatio,
    ...(s.shieldGenerators ? { shieldGenerators: structuredClone(s.shieldGenerators) } : {}),
    shieldsBypassed: inNebula(s.pos, battle.tuning) && nebulaRules(battle.tuning).shieldsUseless !== false,
    systems: { ...s.systems }, cores: structuredClone(s.cores), impulse: s.impulse,
    ratedPower: ratedPower(s),
    impulseMax: s.hull.impulsePower, cloaked: !!s.cloaked, detected: !!s.detected, decloaking: !!s.decloaking,
    magazine: s.magazine,
    mounts: s.mounts.map((m) => ({
      id: m.id, type: m.type, kind: m.kind, arcName: m.arcName, arc: [...m.arc],
      ...(m.position ? { position: { ...m.position }, orientation: m.orientation, displayName: m.displayName } : {}),
      maxRange: m.maxRange, bands: (m.bands ?? []).map((b) => ({ ...b })),
      inop: !!m.inop, firedThisTurn: !!m.firedThisTurn
    })),
    squadrons: s.squadrons ? s.squadrons.map((q) => ({ ...q })) : undefined,
    spinal: s.spinal ? { ...s.spinal } : undefined
  }));
  return {
    turn: battle.turn, roundsPerTurn: battle.rounds, maxTurns: battle.maxTurns,
    ...(battle.warnings?.length ? { warnings: [...battle.warnings] } : {}),
    map: battle.tuning.battle?.map ?? { shape: "hex", radiusHexes: battle.tuning.battle?.mapRadiusHexes },
    terrain: battle.terrain.map((t) => ({ ...t })),
    ships, victory: battle.victory ? { ...battle.victory } : null, done: battle.done, result: battle.result
  };
}

export function runBattle(fleets, tuning, rng, opts = {}) {
  const battle = createBattleFromFleets(fleets, tuning, rng, opts);
  while (!battle.done) stepTurn(battle, {}, opts);
  return battle.result;
}

export function buildFleet(faction, composition, tuning, loadouts, rng, prefix) {
  const ships = [];
  const entries = Object.entries(composition).sort(([classA], [classB]) =>
    ((tuning.hullClasses[classB]?.points ?? 0) - (tuning.hullClasses[classA]?.points ?? 0)) || classA.localeCompare(classB));
  for (const [className, count] of entries) {
    for (let i = 0; i < count; i++) {
      ships.push(buildShip(`${prefix}-${className}-${i + 1}`, faction, className, tuning, loadouts, rng));
    }
  }
  return ships;
}

// Order a fleet for the line of battle: heaviest hulls in the centre, light
// hulls on the wings. Deployment was previously in composition key order, which
// parked whatever came last on the extreme flank - measured at ~27pp of win
// rate against any 4-point hull unlucky enough to land there.
function battleLine(fleet) {
  const sorted = [...fleet].sort(canonicalShipCompare);
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
  // RANKS (fix, 2026-09-03): one unwrapped line at 2-hex spacing runs off a
  // 40-row map beyond ~21 hulls - 30 frigates reached r = +/-30 and some
  // deployed behind the enemy start line, which is most of why "swarms lost
  // everything" in the price measurements. A fleet is now wrapped into ranks
  // of at most rankWidth hulls, each rank one hex-pair further back, dealt
  // round-robin so the centre-heavy order survives. Bit-identical to the old
  // single line for every fleet of rankWidth hulls or fewer.
  const rankWidth = tuning.battle?.deployRankWidth ?? 20;
  const place = (ordered, sign) => {
    const nRanks = Math.max(1, Math.ceil(ordered.length / rankWidth));
    const ranks = Array.from({ length: nRanks }, () => []);
    ordered.forEach((s, i) => ranks[i % nRanks].push(s));
    ranks.forEach((rank, ri) => rank.forEach((s, j) => {
      const row = j - Math.floor((rank.length - 1) / 2);
      const q = -half - Math.floor((row * spacing) / 2) - ri * 2;
      const r = row * spacing;
      // B is A's formation rotated 180 degrees, so the geometry - including
      // every equidistant tie-break - is identical for both sides.
      s.pos = sign > 0 ? { q, r } : { q: -q, r: -r };
      s.facing = sign > 0 ? 0 : 3;
    }));
  };
  place(orderedA, 1);
  place(orderedB, -1);
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
export function buildScenario(scenario, tuning, loadouts, rng, options = {}) {
  // Policy is selected by the host, never read from scenario JSON. Saved and
  // hand-built scenario loaders explicitly request warn; harnesses stay strict.
  const issues = (scenario?.sides ?? []).slice(0, 2).map((side, i) => fleetRuleIssues(side, tuning, `Side ${i + 1}`, options));
  const ruleErrors = [
    ...objectiveErrors(scenario?.victory, scenario?.sides?.map(side => side.ships)),
    ...issues.flatMap(issue => issue.errors)
  ];
  if (ruleErrors.length) throw new Error(ruleErrors.join(" "));
  const t = scenario.map
    ? { ...tuning, battle: { ...tuning.battle, map: { shape: "rect", widthHexes: scenario.map.widthHexes, heightHexes: scenario.map.heightHexes } } }
    : tuning;
  const terrain = (scenario.terrain ?? []).map((x) => ({ type: x.type, q: x.q, r: x.r }));
  const withTerrain = { ...t, battle: { ...t.battle, terrain } };
  const fleets = scenario.sides.slice(0, 2).map((side, i) => {
    const tag = i === 0 ? "A" : "B";
    const counts = {};
    return side.ships.map((sh) => {
      counts[sh.className] = (counts[sh.className] ?? 0) + 1;
      return buildShip(`${tag}-${sh.className}-${counts[sh.className]}`, side.faction, sh.className, withTerrain, loadouts, rng, sh.designPack);
    });
  });
  // Explicit positions first; anything unplaced takes the line deployment.
  const placedA = scenario.sides[0].ships.map((sh) => Number.isFinite(sh.q) && Number.isFinite(sh.r));
  const placedB = scenario.sides[1].ships.map((sh) => Number.isFinite(sh.q) && Number.isFinite(sh.r));
  if (!placedA.every(Boolean) || !placedB.every(Boolean)) deployFleets(fleets[0], fleets[1], withTerrain);
  scenario.sides.slice(0, 2).forEach((side, i) => side.ships.forEach((sh, k) => {
    const ship = fleets[i][k];
    if (Number.isFinite(sh.q) && Number.isFinite(sh.r)) {
      ship.pos = { q: sh.q, r: sh.r };
    }
    if (Number.isFinite(sh.facing)) ship.facing = ((sh.facing % 6) + 6) % 6;
  }));
  // Validate the FINAL placement, including fallback lines and mixed explicit /
  // automatic deployment. Do not silently relocate an authored engagement.
  const placementErrors = deploymentErrors(fleets, terrain);
  if (placementErrors.length) throw new Error(placementErrors.join(' '));
  const warnings = issues.flatMap(issue => issue.warnings);
  return { fleets, terrain, tuning: withTerrain, ...(warnings.length ? { warnings } : {}) };
}
