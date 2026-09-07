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
  return Object.freeze({ profile: SENSING_PROFILE, sensing: pinned, locks: { A: [], B: [] } });
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
      pos: { q: target.pos.q, r: target.pos.r }, facing: target.facing,
      observedDamage: observedDamage(target, Math.max(...observers.map(o => o.rating))), observers });
  }
  return freeze(reports.sort((a, b) => compareId(a.id, b.id)));
}
