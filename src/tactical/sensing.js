// C1 acquisition foundation. Queries are read-only: no resolver import, tuning
// cache, PRNG draw, automatic scan, lock pruning or hidden-state presentation.
import { distance, hexLineGroups, inArc } from './hex.js';
import { terrainFootprint, terrainBlocksShips } from './deployment.js';

export const SENSING_PROFILE = 'finite-contacts/1';
export const DEFAULT_SENSING_PROFILE = Object.freeze({
  id: SENSING_PROFILE,
  passiveRadiusHexes: Object.freeze({ 0: 0, 1: 18, 2: 26, 3: 34, 4: 42, 5: 50 })
});
const sides = ['A', 'B'];
const SHIELD_FACES = [1, 2, 3, 4, 5, 6];
const compareId = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const key = p => `${p.q},${p.r}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

// Deliberately do not truncate fractional authored ratings or treat missing
// definitions as unlimited range. Validation happens before installing state.
export function validateSensingProfile(profile, ships = []) {
  if (!object(profile) || profile.id !== SENSING_PROFILE ||
      Object.keys(profile).some(k => !['id', 'passiveRadiusHexes'].includes(k)))
    throw new Error('Invalid finite sensing profile');
  const table = profile.passiveRadiusHexes;
  if (!object(table) || Object.keys(table).length !== 6 ||
      [0, 1, 2, 3, 4, 5].some(r => !Object.hasOwn(table, r) ||
        !Number.isSafeInteger(table[r]) || (r === 0 ? table[r] !== 0 : table[r] <= 0)))
    throw new Error('Finite sensing requires explicit integer radii for ratings 0 through 5');
  for (const ship of ships) {
    const rating = ship.hull?.sensorRating;
    if (!Number.isSafeInteger(rating) || !Object.hasOwn(table, rating))
      throw new Error('Ship sensor rating is missing, fractional or unsupported by the sensing profile');
  }
  return freeze({ id: SENSING_PROFILE, passiveRadiusHexes:
    Object.fromEntries([0, 1, 2, 3, 4, 5].map(r => [r, table[r]])) });
}

export function operationalSensorRating(ship, tuning) {
  if (ship.destroyed || (ship.systems.sensors ?? 0) >= tuning.damage.systemHitsToInoperative) return 0;
  return Math.max(0, ship.hull.sensorRating ?? 0);
}

export function createSensingState(battle, profile = DEFAULT_SENSING_PROFILE) {
  const pinned = validateSensingProfile(profile, [...battle.A, ...battle.B]);
  const ids = new Set();
  for (const side of sides) for (const ship of battle[side]) {
    if (ship.side !== side || typeof ship.id !== 'string' || !ship.id.trim() ||
        ['__proto__', 'constructor', 'prototype'].includes(ship.id) || ids.has(ship.id))
      throw new Error('Finite sensing requires correctly sided, globally unique, JSON-safe ship IDs');
    ids.add(ship.id);
  }
  // The pinned profile cannot be changed through this state object; lock
  // arrays remain writable solely for explicit simulation-boundary operations.
  // `shields` holds the last sweep reading per target, per observing side.
  // Written only by recordShieldSweep, read only by currentContacts.
  return Object.freeze({ profile: SENSING_PROFILE, sensing: pinned, locks: { A: [], B: [] },
    shields: { A: Object.create(null), B: Object.create(null) } });
}

function stateOf(battle) {
  if (battle.contacts?.profile !== SENSING_PROFILE) throw new Error('Finite sensing is not enabled');
  return battle.contacts;
}

// Build local terrain sets instead of reusing the resolver's mutating cache.
// Fields block at endpoints too. Bodies at endpoints fail closed even though
// normal battle construction already rejects ships deployed on a body.
export function sensorPathClear(battle, from, to) {
  const bodies = new Set(), fields = new Set(), fog = new Set();
  for (const item of battle.terrain ?? []) {
    if (item.type === 'asteroids') fields.add(key(item));
    else if (item.type === 'nebula') fog.add(key(item));
    else if (terrainBlocksShips(item.type)) for (const cell of terrainFootprint(item)) bodies.add(key(cell));
  }
  const rules = battle.tuning.battle?.terrainRules ?? {};
  const inside = fog.has(key(from));
  if ((inside || fog.has(key(to))) && distance(from, to) > (rules.nebula?.visibilityHexes ?? 3)) return false;
  const line = hexLineGroups(from, to);
  for (let i = 0; i < line.length; i++) for (const cell of line[i]) {
    const cellKey = key(cell);
    if (bodies.has(cellKey)) return false;
    if (rules.asteroids?.blocksFire !== false && fields.has(cellKey)) return false;
    if (!inside && i > 0 && i < line.length - 1 && fog.has(cellKey)) return false;
  }
  return true;
}

function commandRangeBonus(battle, observer) {
  let bonus = 0;
  for (const friend of battle[observer.side]) {
    if (friend === observer || friend.destroyed || friend.cloaked || !friend.hull.commandRadius) continue;
    if (distance(observer.pos, friend.pos) <= friend.hull.commandRadius)
      bonus = Math.max(bonus, friend.hull.commandDetectionBonus ?? 0);
  }
  return bonus;
}

// Host-only eligibility query. `scan` checks a potential/retained active lock;
// only acquireScanLock may create one, and it additionally checks the swept face.
export function observerSupport(battle, observer, target, { scan = false } = {}) {
  const state = stateOf(battle);
  if (!sides.includes(observer?.side) || observer.side === target?.side ||
      !battle[observer.side].includes(observer) ||
      !battle[observer.side === 'A' ? 'B' : 'A'].includes(target) || target.destroyed) return null;
  const rating = operationalSensorRating(observer, battle.tuning);
  if (!Number.isSafeInteger(rating) || !Object.hasOwn(state.sensing.passiveRadiusHexes, rating))
    throw new Error('Unsupported operational sensor rating');
  if (rating < (scan ? 2 : 1) || (!scan && target.cloaked)) return null;
  let radius = state.sensing.passiveRadiusHexes[rating];
  if (scan) radius = Math.min(radius, (battle.tuning.cloak?.detectionRangeHexes ?? 0) +
    (target.detectionBonusAgainst ?? 0) + commandRangeBonus(battle, observer));
  if (distance(observer.pos, target.pos) > radius || !sensorPathClear(battle, observer.pos, target.pos)) return null;
  return { observerId: observer.id, rating, kind: scan ? 'scan' : 'passive' };
}

export function acquireScanLock(battle, observer, target, face) {
  const state = stateOf(battle);
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error('A scan must name one swept face');
  if (!target?.cloaked || !observerSupport(battle, observer, target, { scan: true }) || !inArc(observer, face, target.pos)) return false;
  const locks = state.locks[observer.side];
  if (!locks.some(l => l.observerId === observer.id && l.targetId === target.id)) {
    locks.push({ observerId: observer.id, targetId: target.id });
    locks.sort((a, b) => compareId(a.observerId, b.observerId) || compareId(a.targetId, b.targetId));
  }
  return true;
}

function supportedLock(battle, side, lock) {
  const observer = battle[side].find(s => s.id === lock.observerId);
  const target = battle[side === 'A' ? 'B' : 'A'].find(s => s.id === lock.targetId);
  return observer && target?.cloaked ? observerSupport(battle, observer, target, { scan: true }) : null;
}

// Explicit simulation-boundary operation. Its returned removal records contain
// identities previously acquired, never the now-concealed target's position.
export function pruneScanLocks(battle) {
  const state = stateOf(battle), removed = [];
  for (const side of sides) state.locks[side] = state.locks[side].filter(lock => {
    if (supportedLock(battle, side, lock)) return true;
    removed.push({ side, observerId: lock.observerId, targetId: lock.targetId });
    return false;
  });
  return freeze(removed);
}

export function revokeTargetLocks(battle, targetId) {
  const state = stateOf(battle);
  for (const side of sides) state.locks[side] = state.locks[side].filter(l => l.targetId !== targetId);
}

// RULING (2026-09-07, Chris): a sector scan reads the target's shields. The
// scan action is the lock - there is no separate sensor lock and no second
// cost; once a sweep has read a ship, consulting the reading is free. All six
// facings come back together, and a reading goes stale the moment the turn it
// was taken ends. Detail follows the observing sensor rating, the same ladder
// observedDamage already uses. FASA STTCS calls this Q4 ("is a specific shield
// up?" -> yes or no, and the number of points in that shield); we answer for
// every facing at once because a captain says "shields down 30%", not "shield
// four is at nine points".
const faceCapacity = (ship, face) =>
  ship.shieldGenerators?.[face]?.capacity ?? ship.hull?.maxShieldPower ?? ship.shieldMax ?? 0;

export function observedShields(target, ability) {
  const read = face => {
    const down = !!target.shieldDown?.[face];
    const capacity = Math.max(0, faceCapacity(target, face));
    const remaining = down ? 0 : Math.max(0, Math.min(capacity, target.shieldCap?.[face] ?? 0));
    return { face, down, capacity, remaining,
      fraction: capacity > 0 ? remaining / capacity : 0 };
  };
  const faces = SHIELD_FACES.map(read);
  // Rating 1 cannot sweep at all, so this branch is reachable only if the scan
  // rules change; it discloses the least the question can answer - up or down.
  if (ability < 2) return { detail: 'state', faces: faces.map(f => ({ face: f.face, up: !f.down && f.remaining > 0 })) };
  if (ability < 3) return { detail: 'band', faces: faces.map(f => ({ face: f.face, down: f.down,
    remainingFraction: { min: Math.floor(f.fraction * 10) / 10, max: Math.min(1, (Math.floor(f.fraction * 10) + 1) / 10) } })) };
  return { detail: 'points', faces: faces.map(f => ({ face: f.face, down: f.down, remaining: f.remaining, capacity: f.capacity })) };
}

// Record a sweep. The observer must ALREADY hold the target as a current
// passive report and the target must lie in the swept face's arc: a scan reads
// what it sweeps, it does not find a ship and read it in the same breath.
export function recordShieldSweep(battle, observer, target, face) {
  const state = stateOf(battle);
  if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error('A sweep must name one swept face');
  const support = observerSupport(battle, observer, target);
  if (!support || support.rating < 2 || !inArc(observer, face, target.pos)) return false;
  state.shields[observer.side][target.id] =
    { turn: battle.turn, rating: support.rating, observerId: observer.id, face,
      reading: observedShields(target, support.rating) };
  return true;
}

// What the side may consult about this target now, with its age stated.
export function shieldReading(battle, side, targetId) {
  const held = stateOf(battle).shields[side]?.[targetId];
  if (!held) return null;
  // A sweep during turn N is accurate as of turn N's execution, and the player
  // consults it while planning turn N+1, when nothing has happened since. So
  // one turn of age is the freshest a reading can be at the planning board;
  // beyond that the target has acted and the reading is stale.
  const age = Math.max(0, (battle.turn ?? 0) - held.turn);
  return { ...held.reading, takenTurn: held.turn, sweptFace: held.face,
    observerId: held.observerId, rating: held.rating, ageTurns: age, stale: age > 1 };
}

export function observedDamage(target, ability) {
  const fraction = Math.max(0, Math.min(1, target.superstructure / target.superstructureMax));
  if (ability < 2) return { detail: 'condition', condition: fraction === 1 ? 'intact' : 'damaged' };
  if (ability < 3) return { detail: 'bracket', condition: fraction === 1 ? 'intact' : fraction > 0.5 ? 'damaged' : fraction > 0.25 ? 'heavily-damaged' : 'critical' };
  return { detail: 'interval', remainingFraction: { min: Math.floor(fraction * 10) / 10, max: Math.min(1, (Math.floor(fraction * 10) + 1) / 10) } };
}

export function currentContacts(battle, side) {
  const state = stateOf(battle);
  if (!sides.includes(side)) throw new Error('Invalid observing side');
  const reports = [];
  for (const target of battle[side === 'A' ? 'B' : 'A']) {
    if (target.destroyed) continue;
    const observers = target.cloaked
      ? state.locks[side].filter(l => l.targetId === target.id).map(l => supportedLock(battle, side, l)).filter(Boolean)
      : battle[side].map(observer => observerSupport(battle, observer, target)).filter(Boolean);
    if (!observers.length) continue;
    observers.sort((a, b) => compareId(a.observerId, b.observerId));
    reports.push({ id: target.id, faction: target.faction, className: target.className,
      // RULING (Chris, 10 September 2026): sensors can read the names of opposing ships. A hull
      // number is painted on the hull, and a sensor good enough to call the class can read it. It
      // discloses nothing tactical - not damage, not loadout, not a position the report does not
      // already carry - and it turns an enemy line from four Destroyer 02s into a fleet.
      ...(target.vesselName ? { vesselName: structuredClone(target.vesselName) } : {}),
      pos: { q: target.pos.q, r: target.pos.r }, facing: target.facing,
      observedDamage: observedDamage(target, Math.max(...observers.map(o => o.rating))),
      ...(shieldReading(battle, side, target.id) ? { shields: shieldReading(battle, side, target.id) } : {}),
      observers });
  }
  return freeze(reports.sort((a, b) => compareId(a.id, b.id)));
}
